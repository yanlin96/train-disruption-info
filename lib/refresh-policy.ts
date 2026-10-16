const OFFICE_REFRESH_MS = 10 * 60 * 1000;
const AFTER_HOURS_REFRESH_MS = 30 * 60 * 1000;
const OFFICE_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

const melbourneOfficeTime = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

export function refreshIntervalForMelbourne(date: Date): number {
  const parts = Object.fromEntries(
    melbourneOfficeTime.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  return OFFICE_DAYS.has(parts.weekday) && hour >= 8 && hour < 17
    ? OFFICE_REFRESH_MS
    : AFTER_HOURS_REFRESH_MS;
}

export const refreshPolicyLabel =
  "Refreshes every 10 min on weekdays, 8 am-5 pm; every 30 min after hours.";
