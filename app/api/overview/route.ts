import { getMetroLineSummaries } from "@/lib/disruptions";
import { getTrainLines } from "@/lib/train-lines";
import { getRegionalLineSummaries } from "@/lib/vline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const network = new URL(request.url).searchParams.get("network");
  try {
    if (network === "vline") {
      return Response.json(await getRegionalLineSummaries(), {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      });
    }
    return Response.json({
      lines: await getMetroLineSummaries(await getTrainLines()),
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=240" } });
  } catch {
    return Response.json({ error: "The network overview is temporarily unavailable." }, { status: 502 });
  }
}
