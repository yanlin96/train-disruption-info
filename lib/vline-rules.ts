export type RegionalTrip = {
  id: string;
  destination: string;
  serviceDate: string | null;
  startTime: string | null;
  nextStop: string | null;
  predictedAt: string | null;
  delaySeconds: number | null;
  cancelled: boolean;
};

type Timestamp = number | { toString(): string } | null;
type Update = {
  timestamp?: Timestamp;
  delay?: number | null;
  trip?: { tripId?: string | null; routeId?: string | null; startDate?: string | null; startTime?: string | null; scheduleRelationship?: number | null } | null;
  stopTimeUpdate?: Array<{
    stopId?: string | null;
    scheduleRelationship?: number | null;
    arrival?: { time?: Timestamp; delay?: number | null } | null;
    departure?: { time?: Timestamp; delay?: number | null } | null;
  }> | null;
};

export function seconds(value: Timestamp | undefined): number | null {
  if (value == null) return null;
  const number = Number(value.toString());
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function mapRegionalTrip(update: Update, destination: string, stops: Map<string, string>, now: number): RegionalTrip | null {
  const trip = update.trip;
  if (!trip?.tripId) return null;
  const date = trip.startDate;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(now * 1000)).replaceAll("-", "");
  const measured = seconds(update.timestamp);
  if (measured && (now - measured > 600 || measured > now + 60)) return null;
  const cancelled = trip.scheduleRelationship === 3;
  const updates = update.stopTimeUpdate ?? [];
  const next = updates.find((stop) => stop.scheduleRelationship !== 1 && stop.scheduleRelationship !== 2 &&
    (seconds(stop.departure?.time) ?? seconds(stop.arrival?.time) ?? 0) >= now);
  // GTFS service dates can be yesterday for an overnight/delayed trip.
  if (date && date < today && !next) return null;
  if (!cancelled && updates.length && !next && updates.every((stop) =>
    (seconds(stop.departure?.time) ?? seconds(stop.arrival?.time) ?? Infinity) < now)) return null;
  const event = seconds(next?.arrival?.time) && seconds(next?.arrival?.time)! >= now ? next?.arrival : next?.departure;
  const predicted = seconds(event?.time);
  return {
    id: `${trip.tripId}-${date ?? ""}-${trip.startTime ?? ""}`,
    destination,
    serviceDate: date && /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : null,
    startTime: trip.startTime || null,
    nextStop: next?.stopId ? stops.get(next.stopId) ?? "Station name unavailable" : null,
    predictedAt: predicted ? new Date(predicted * 1000).toISOString() : null,
    delaySeconds: cancelled ? null : event?.delay ?? update.delay ?? null,
    cancelled,
  };
}
