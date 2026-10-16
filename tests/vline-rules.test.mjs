import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRegionalTrip } from "../lib/vline-rules.ts";

const now = Date.parse("2026-09-16T00:00:00Z") / 1000;
const base = { trip: { tripId: "trip", startDate: "20260916" }, timestamp: now };
const stops = new Map([["s", "Geelong"]]);

test("missing delay is unknown, not on time; future stop gets Melbourne-ready ISO time", () => {
  const trip = mapRegionalTrip({ ...base, stopTimeUpdate: [{ stopId: "s", arrival: { time: now + 300 } }] }, "Geelong", stops, now);
  assert.equal(trip.delaySeconds, null);
  assert.equal(trip.nextStop, "Geelong");
  assert.equal(trip.serviceDate, "2026-09-16");
  assert.equal(trip.predictedAt, "2026-09-16T00:05:00.000Z");
});
test("zero and negative delays are preserved", () => {
  for (const delay of [0, -120, 300]) assert.equal(mapRegionalTrip({ ...base, delay }, "Geelong", stops, now).delaySeconds, delay);
});
test("cancelled trip has no invented delay", () => {
  const trip = mapRegionalTrip({ ...base, trip: { ...base.trip, scheduleRelationship: 3 }, delay: 0 }, "Geelong", stops, now);
  assert.equal(trip.cancelled, true);
  assert.equal(trip.delaySeconds, null);
});
test("expired service dates, stale measurements and completed trips are excluded", () => {
  assert.equal(mapRegionalTrip({ ...base, trip: { ...base.trip, startDate: "20260915" } }, "Geelong", stops, now), null);
  assert.equal(mapRegionalTrip({ ...base, timestamp: now - 601 }, "Geelong", stops, now), null);
  assert.equal(mapRegionalTrip({ ...base, stopTimeUpdate: [{ arrival: { time: now - 10 } }] }, "Geelong", stops, now), null);
});
test("skipped and no-data stops are not shown as next predictions", () => {
  const trip = mapRegionalTrip({ ...base, stopTimeUpdate: [{ stopId: "skip", scheduleRelationship: 1, arrival: { time: now + 10 } }, { stopId: "s", arrival: { time: now + 30, delay: 50 } }] }, "Geelong", stops, now);
  assert.equal(trip.nextStop, "Geelong");
  assert.equal(trip.delaySeconds, 50);
});
test("yesterday's service date remains visible when an overnight trip has a future stop", () => {
  assert.ok(mapRegionalTrip({ ...base, trip: { ...base.trip, startDate: "20260915" }, stopTimeUpdate: [{ stopId: "s", arrival: { time: now + 30 } }] }, "Geelong", stops, now));
});
