import { getMelbourneWeather } from "@/lib/melbourne-weather";

export async function GET() {
  try {
    return Response.json({ weather: await getMelbourneWeather(), checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
  } catch {
    return Response.json({ error: "Melbourne weather is temporarily unavailable." }, { status: 502 });
  }
}
