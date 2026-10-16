import { getRegionalSchedule, getTrainLines } from "@/lib/train-lines";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const network = new URL(request.url).searchParams.get("network");
    return Response.json({
      lines: network === "vline" ? (await getRegionalSchedule()).lines : await getTrainLines(),
      source: "Transport Victoria GTFS Schedule",
      sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "The official route catalog is unavailable. Try again." }, { status: 502 });
  }
}
