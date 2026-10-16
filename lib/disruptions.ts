import "server-only";

import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { findTrainLine, type TrainLine } from "@/lib/train-lines";

export const SOURCE_URL =
  "https://www.metrotrains.com.au/";

const SERVICE_ALERTS_URL =
  "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/service-alerts";

export type Disruption = {
  id: string;
  lineId: string;
  line: string;
  period: string;
  detail: string;
  description?: string;
  severity: "major" | "minor";
};

type Timestamp = number | { toString(): string } | null | undefined;
type ActivePeriod = { start?: Timestamp; end?: Timestamp };
type ServiceAlertFeed = ReturnType<typeof GtfsRealtimeBindings.transit_realtime.FeedMessage.decode>;

export type MetroLineSummary = {
  lineId: string;
  name: string;
  color: string;
  noticeCount: number;
  majorCount: number;
};

export function getApiKey(): string {
  return process.env.TRANSPORT_VIC_API_KEY?.trim() ?? "";
}

function translatedText(
  value: {
    translation?: Array<{ text?: string | null; language?: string | null }> | null;
  } | null | undefined,
) {
  const translations = value?.translation ?? [];
  return (
    translations.find((item) => item.language?.toLowerCase().startsWith("en"))?.text ??
    translations.find((item) => item.text)?.text ??
    ""
  ).trim();
}

function timestampValue(value: Timestamp): number | null {
  if (value == null) return null;
  const result = Number(value.toString());
  return Number.isFinite(result) ? result : null;
}

function formatPeriod(periods: ActivePeriod[] | null | undefined): string {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const period = periods?.[0];
  if (!period) return "Current or upcoming";

  const startValue = timestampValue(period.start);
  const endValue = timestampValue(period.end);
  const start = startValue ? formatter.format(new Date(startValue * 1000)) : null;
  const end = endValue ? formatter.format(new Date(endValue * 1000)) : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "Current or upcoming";
}

function isActiveOrUpcoming(periods: ActivePeriod[] | null | undefined) {
  if (!periods?.length) return true;
  const now = Math.floor(Date.now() / 1000);
  return periods.some((period) => {
    const end = timestampValue(period.end);
    return end == null || end >= now;
  });
}

async function getServiceAlertFeed(): Promise<ServiceAlertFeed> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("TRANSPORT_VIC_API_KEY is not configured");

  const response = await fetch(SERVICE_ALERTS_URL, {
    next: { revalidate: 300 },
    headers: { Accept: "application/x-protobuf", KeyID: apiKey },
  });
  if (!response.ok) throw new Error(`Transport Victoria returned ${response.status}`);

  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(await response.arrayBuffer()),
  );
}

function disruptionsForLine(line: TrainLine, feed: ServiceAlertFeed): Disruption[] {
  return feed.entity.flatMap((entity): Disruption[] => {
    const alert = entity.alert;
    if (!alert || !isActiveOrUpcoming(alert.activePeriod)) return [];

    const header = translatedText(alert.headerText);
    const description = translatedText(alert.descriptionText);
    const routeIds = (alert.informedEntity ?? [])
      .flatMap((item) => [item.routeId, item.trip?.routeId])
      .filter(Boolean)
      .join(" ");

    const routeCodeMatch = line.routeCodes.some((code) =>
      new RegExp(`(?:-|:)${code}(?:-|:)`, "i").test(routeIds),
    );
    const lineName = line.name.replace(/\s+Line$/i, "");
    if (!routeCodeMatch && !new RegExp(`\\b${lineName}\\b`, "i").test(`${header} ${description}`)) return [];

    const detail = header || description || "A Werribee Line service alert is active.";
    const isTimeOnlyDescription = description.length < 80 && /^\s*(?:\d|from\b|until\b)/i.test(description);
    const supplementalDescription = description && !isTimeOnlyDescription
      ? description
      : undefined;
    const majorEffects = new Set([1, 2, 3, 4]);
    const ancillaryNotice = /car\s*(?:park|space)|parking|toilet|lift|elevator|station (?:access|facility)/i
      .test(`${header} ${description}`);
    const isRouteAlert = routeCodeMatch;
    const affectsTravel = !ancillaryNotice && (
      isRouteAlert ||
      majorEffects.has(alert.effect ?? -1) ||
      /replace|cancel|delay|no service|reduced service|closed|suspend/i.test(`${header} ${description}`)
    );

    return [{
      id: entity.id || `${line.id}-${header}-${formatPeriod(alert.activePeriod)}`,
      lineId: line.id,
      line: line.name,
      period: formatPeriod(alert.activePeriod),
      detail,
      description: supplementalDescription,
      severity: affectsTravel ? "major" : "minor",
    }];
  });
}

export async function getLineDisruptions(lineOrId: TrainLine | string): Promise<Disruption[]> {
  const line = typeof lineOrId === "string" ? await findTrainLine(lineOrId) : lineOrId;
  if (!line) throw new Error("Unknown train line");
  return disruptionsForLine(line, await getServiceAlertFeed());
}

export async function getMetroLineSummaries(lines: TrainLine[]): Promise<MetroLineSummary[]> {
  const feed = await getServiceAlertFeed();
  return lines.map((line) => {
    const disruptions = disruptionsForLine(line, feed);
    return {
      lineId: line.id,
      name: line.name,
      color: line.color,
      noticeCount: disruptions.length,
      majorCount: disruptions.filter((item) => item.severity === "major").length,
    };
  });
}

export function getWerribeeDisruptions() {
  return getLineDisruptions("werribee");
}
