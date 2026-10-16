import "server-only";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { getApiKey } from "@/lib/disruptions";
import { getRegionalSchedule } from "@/lib/train-lines";
import { mapRegionalTrip, seconds } from "@/lib/vline-rules";

export const VLINE_SOURCE = "https://opendata.transport.vic.gov.au/dataset/gtfs-realtime/resource/616ebaab-b472-4715-9b31-f5f5ea37cd69";

type RegionalFeed = ReturnType<typeof GtfsRealtimeBindings.transit_realtime.FeedMessage.decode>;

async function getRegionalFeed(): Promise<RegionalFeed> {
  const key = getApiKey();
  if (!key) throw new Error("Transport Victoria is not configured");
  const response = await fetch("https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/vline/trip-updates", {
    next: { revalidate: 30 }, signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/x-protobuf", KeyID: key },
  });
  if (!response.ok) throw new Error(`Regional feed returned ${response.status}`);
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await response.arrayBuffer()));
  if (feed.header.incrementality === 1) throw new Error("Differential feeds are not supported");
  return feed;
}

export async function getRegionalTrips(lineId: string) {
  const schedule = await getRegionalSchedule();
  const line = schedule.lines.find((item) => item.id === lineId);
  if (!line) throw new Error("Unknown regional line");
  const feed = await getRegionalFeed();
  const now = Math.floor(Date.now() / 1000);
  const generated = seconds(feed.header.timestamp);
  const stale = !generated || now - generated > 300 || generated > now + 60;
  let unmatchedTrips = 0;
  const trips = stale ? [] : feed.entity.flatMap((entity) => {
    const update = entity.tripUpdate;
    if (!update || entity.isDeleted) return [];
    const scheduled = schedule.trips.get(update.trip?.tripId ?? "");
    const routeId = update.trip?.routeId || scheduled?.routeId;
    if (!routeId || !schedule.routes.has(routeId)) { unmatchedTrips += 1; return []; }
    if (schedule.routes.get(routeId) !== lineId) return [];
    const trip = mapRegionalTrip(update, scheduled?.headsign || "Destination unavailable", schedule.stops, now);
    return trip ? [trip] : [];
  });
  return { line, trips: [...new Map(trips.map((trip) => [trip.id, trip])).values()]
    .sort((a, b) => (a.predictedAt ?? "9999").localeCompare(b.predictedAt ?? "9999")),
    stale, unmatchedTrips, feedUpdatedAt: generated ? new Date(generated * 1000).toISOString() : null,
    checkedAt: new Date().toISOString(), source: VLINE_SOURCE };
}

export async function getRegionalLineSummaries() {
  const schedule = await getRegionalSchedule();
  const feed = await getRegionalFeed();
  const now = Math.floor(Date.now() / 1000);
  const generated = seconds(feed.header.timestamp);
  const stale = !generated || now - generated > 300 || generated > now + 60;
  const tripsByLine = new Map<string, Map<string, ReturnType<typeof mapRegionalTrip> extends infer T ? Exclude<T, null> : never>>();
  let unmatchedTrips = 0;

  if (!stale) {
    for (const entity of feed.entity) {
      const update = entity.tripUpdate;
      if (!update || entity.isDeleted) continue;
      const scheduled = schedule.trips.get(update.trip?.tripId ?? "");
      const routeId = update.trip?.routeId || scheduled?.routeId;
      const lineId = routeId ? schedule.routes.get(routeId) : undefined;
      if (!lineId) { unmatchedTrips += 1; continue; }
      const trip = mapRegionalTrip(update, scheduled?.headsign || "Destination unavailable", schedule.stops, now);
      if (!trip) continue;
      const lineTrips = tripsByLine.get(lineId) ?? new Map();
      lineTrips.set(trip.id, trip);
      tripsByLine.set(lineId, lineTrips);
    }
  }

  return {
    stale,
    unmatchedTrips,
    feedUpdatedAt: generated ? new Date(generated * 1000).toISOString() : null,
    checkedAt: new Date().toISOString(),
    lines: schedule.lines.map((line) => {
      const trips = [...(tripsByLine.get(line.id)?.values() ?? [])];
      return {
        lineId: line.id,
        name: line.name,
        color: line.color,
        tripCount: trips.length,
        cancelledCount: trips.filter((trip) => trip.cancelled).length,
        maxDelaySeconds: Math.max(0, ...trips.map((trip) => trip.delaySeconds ?? 0)),
      };
    }),
  };
}
