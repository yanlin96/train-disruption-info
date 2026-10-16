import { getLineDisruptions, SOURCE_URL } from "@/lib/disruptions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const lineId = new URL(request.url).searchParams.get("lineId") ?? "werribee";
    return Response.json({ disruptions: await getLineDisruptions(lineId), source: SOURCE_URL, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=240" } });
  } catch {
    return Response.json({ error: "Live Metro data is temporarily unavailable.", disruptions: [], source: SOURCE_URL, checkedAt: new Date().toISOString() }, { status: 502 });
  }
}
