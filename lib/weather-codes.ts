export type WeatherTone = "clear" | "cloudy" | "rain" | "storm" | "fog" | "snow";

export function describeWeatherCode(code: number): { label: string; tone: WeatherTone } {
  if (code === 0) return { label: "Clear", tone: "clear" };
  if (code === 1 || code === 2) return { label: "Partly cloudy", tone: "cloudy" };
  if (code === 3) return { label: "Overcast", tone: "cloudy" };
  if (code === 45 || code === 48) return { label: "Foggy", tone: "fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Drizzle", tone: "rain" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "Rain", tone: "rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Snow", tone: "snow" };
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", tone: "storm" };
  return { label: "Current conditions", tone: "cloudy" };
}
