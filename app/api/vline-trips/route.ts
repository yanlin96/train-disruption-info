import { getRegionalTrips } from "@/lib/vline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const lineId = new URL(request.url).searchParams.get("lineId");
  if (!lineId) return Response.json({ error: "Select a V/Line route." }, { status: 400 });
  try {
    return Response.json(await getRegionalTrips(lineId), { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: "V/Line live data is unavailable. Retry or check official updates." }, { status: 502 });
  }
}
