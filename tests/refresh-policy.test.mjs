import assert from "node:assert/strict";
import test from "node:test";
import { refreshIntervalForMelbourne } from "../lib/refresh-policy.ts";

const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

test("uses the active interval during Melbourne weekday office hours", () => {
  assert.equal(refreshIntervalForMelbourne(new Date("2026-10-13T21:00:00Z")), TEN_MINUTES);
  assert.equal(refreshIntervalForMelbourne(new Date("2026-10-14T05:59:00Z")), TEN_MINUTES);
});

test("uses the reduced interval after 5 pm and before 8 am Melbourne time", () => {
  assert.equal(refreshIntervalForMelbourne(new Date("2026-10-14T06:00:00Z")), THIRTY_MINUTES);
  assert.equal(refreshIntervalForMelbourne(new Date("2026-10-14T20:59:00Z")), THIRTY_MINUTES);
});

test("uses the reduced interval on Melbourne weekends", () => {
  assert.equal(refreshIntervalForMelbourne(new Date("2026-10-16T22:00:00Z")), THIRTY_MINUTES);
});
