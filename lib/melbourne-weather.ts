import "server-only";

import { describeWeatherCode, type WeatherTone } from "@/lib/weather-codes";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=-37.8136&longitude=144.9631&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=Australia%2FMelbourne";

type OpenMeteoResponse = {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
};

export type MelbourneWeather = {
  temperature: number;
  high: number;
  low: number;
  condition: string;
  tone: WeatherTone;
};

export async function getMelbourneWeather(): Promise<MelbourneWeather> {
  const response = await fetch(WEATHER_URL, { next: { revalidate: 900 } });
  if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
  const payload = await response.json() as OpenMeteoResponse;
  const temperature = payload.current?.temperature_2m;
  const code = payload.current?.weather_code;
  const high = payload.daily?.temperature_2m_max?.[0];
  const low = payload.daily?.temperature_2m_min?.[0];
  if (![temperature, code, high, low].every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("Weather provider returned incomplete data");
  }
  const description = describeWeatherCode(code as number);
  return {
    temperature: Math.round(temperature as number),
    high: Math.round(high as number),
    low: Math.round(low as number),
    condition: description.label,
    tone: description.tone,
  };
}
