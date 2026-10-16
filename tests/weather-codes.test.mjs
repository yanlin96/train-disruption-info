import assert from "node:assert/strict";
import test from "node:test";
import { describeWeatherCode } from "../lib/weather-codes.ts";

test("WMO weather codes map to concise user-facing conditions", () => {
  assert.deepEqual(describeWeatherCode(0), { label: "Clear", tone: "clear" });
  assert.deepEqual(describeWeatherCode(63), { label: "Rain", tone: "rain" });
  assert.deepEqual(describeWeatherCode(95), { label: "Thunderstorm", tone: "storm" });
});

test("unknown weather codes degrade to a neutral condition", () => {
  assert.deepEqual(describeWeatherCode(999), { label: "Current conditions", tone: "cloudy" });
});
