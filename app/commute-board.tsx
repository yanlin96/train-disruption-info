"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Info,
  LoaderCircle,
  RefreshCw,
  Snowflake,
  Sun,
  TrainFront,
  X,
} from "lucide-react";
import type { Disruption } from "@/lib/disruptions";
import type { MelbourneWeather } from "@/lib/melbourne-weather";
import type { TrainLine } from "@/lib/train-lines";
import type { RegionalTrip } from "@/lib/vline-rules";
import { refreshIntervalForMelbourne, refreshPolicyLabel } from "@/lib/refresh-policy";

type Network = "metro" | "vline";
type MetroResult = { disruptions: Disruption[]; source: string; checkedAt: string };
type VlineResult = { trips: RegionalTrip[]; stale: boolean; unmatchedTrips: number; feedUpdatedAt: string | null; checkedAt: string };
type Tone = "loading" | "clear" | "warning" | "fault";
type OverviewTone = "clear" | "warning" | "fault" | "unknown";
type OverviewLine = { lineId: string; name: string; color: string; tone: OverviewTone; primary: string; secondary: string };
type MetroOverviewPayload = { lines: Array<{ lineId: string; name: string; color: string; noticeCount: number; majorCount: number }>; checkedAt: string };
type RegionalOverviewPayload = { lines: Array<{ lineId: string; name: string; color: string; tripCount: number; cancelledCount: number; maxDelaySeconds: number }>; stale: boolean; unmatchedTrips: number; checkedAt: string };

const REFRESH_SCHEDULER_MS = 60_000;
const WEATHER_ICONS = { clear: Sun, cloudy: Cloud, rain: CloudRain, storm: CloudLightning, fog: CloudFog, snow: Snowflake };
const melbourneClock = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "numeric", minute: "2-digit" });
const melbourneDate = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", weekday: "long", day: "numeric", month: "long" });
const melbourneStamp = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function delayLabel(seconds: number | null) {
  if (seconds === null) return "Delay not supplied";
  if (seconds === 0) return "On time at this stop";
  if (seconds < 0) return `${Math.ceil(-seconds / 60)} min early`;
  return `${Math.ceil(seconds / 60)} min late`;
}

function toneClasses(tone: Tone) {
  if (tone === "warning") return { ink: "text-[#ffbe4a]", soft: "bg-[#ffbe4a] text-[#090d46]", border: "border-[#ffbe4a]" };
  if (tone === "fault") return { ink: "text-[#ff6b5f]", soft: "bg-[#ff6b5f] text-[#090d46]", border: "border-[#ff6b5f]" };
  return { ink: "text-[#6de7e1]", soft: "bg-[#6de7e1] text-[#090d46]", border: "border-[#6de7e1]" };
}

function SignalTrace({ tone }: { tone: Tone }) {
  const colour = tone === "warning" ? "#ffbe4a" : tone === "fault" ? "#ff6b5f" : "#6de7e1";
  const path = tone === "fault"
    ? "M0 30 H30 M42 30 H76 M88 30 H128 M142 30 H188 M202 30 H240"
    : tone === "warning"
      ? "M0 30 H42 L54 10 L70 50 L88 18 L106 42 L122 30 H240"
      : "M0 30 H86 L96 22 L106 38 L116 30 H240";
  return <svg className="signal-trace h-12 w-full" viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden="true"><path d={path} fill="none" stroke={colour} strokeWidth="2" /></svg>;
}

export function CommuteBoard() {
  const [network, setNetwork] = useState<Network>(() => typeof window === "undefined" ? "metro" : new URLSearchParams(window.location.search).get("network") === "vline" ? "vline" : "metro");
  const [lines, setLines] = useState<TrainLine[]>([]);
  const [lineId, setLineId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("lineId") ?? "");
  const [metro, setMetro] = useState<MetroResult | null>(null);
  const [regional, setRegional] = useState<VlineResult | null>(null);
  const [weather, setWeather] = useState<MelbourneWeather | null>(null);
  const [overviewLines, setOverviewLines] = useState<OverviewLine[]>([]);
  const [overviewCheckedAt, setOverviewCheckedAt] = useState<string | null>(null);
  const [overviewCoverage, setOverviewCoverage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const closeButton = useRef<HTMLButtonElement>(null);
  const routeButton = useRef<HTMLButtonElement>(null);
  const lastRefreshAt = useRef(Date.now());

  const selectedLine = lines.find((line) => line.id === lineId) ?? null;

  const refresh = useCallback(() => {
    lastRefreshAt.current = Date.now();
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 15_000);
    const data = window.setInterval(() => {
      const current = new Date();
      if (current.getTime() - lastRefreshAt.current >= refreshIntervalForMelbourne(current)) {
        refresh();
      }
    }, REFRESH_SCHEDULER_MS);
    return () => { window.clearInterval(clock); window.clearInterval(data); };
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/weather", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ weather: MelbourneWeather }> : Promise.reject())
      .then((payload) => setWeather(payload.weather))
      .catch(() => setWeather(null));
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLines([]);
    setMetro(null);
    setRegional(null);
    setError("");
    setLoading(true);
    fetch(`/api/lines?network=${network}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ lines: TrainLine[] }> : Promise.reject(new Error("The official route catalog is unavailable.")))
      .then((payload) => {
        setLines(payload.lines);
        const requested = payload.lines.find((line) => line.id === lineId);
        setLineId(requested?.id ?? "");
      })
      .catch((failure) => { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Routes unavailable."); setLoading(false); } });
    return () => controller.abort();
    // A network change deliberately resets the catalog before choosing a valid route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  useEffect(() => {
    if (lineId && !lines.some((line) => line.id === lineId)) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const endpoint = !lineId ? `/api/overview?network=${network}` : network === "metro" ? `/api/disruptions?lineId=${encodeURIComponent(lineId)}` : `/api/vline-trips?lineId=${encodeURIComponent(lineId)}`;
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Live transport data is unavailable.");
        if (!lineId && network === "metro") {
          const overview = payload as MetroOverviewPayload;
          setOverviewLines(overview.lines.map((line) => ({
            lineId: line.lineId, name: line.name, color: line.color,
            tone: line.noticeCount ? "warning" as const : "clear" as const,
            primary: line.noticeCount ? `${line.noticeCount} ${line.noticeCount === 1 ? "notice" : "notices"}` : "No listed changes",
            secondary: line.majorCount ? `${line.majorCount} service ${line.majorCount === 1 ? "change" : "changes"}` : line.noticeCount ? "Access or station notice" : "Official alert feed",
          })).sort((a, b) => a.name.localeCompare(b.name)));
          setOverviewCheckedAt(overview.checkedAt);
          setOverviewCoverage("Metro service, station-access and parking notices");
        } else if (!lineId) {
          const overview = payload as RegionalOverviewPayload;
          setOverviewLines(overview.lines.map((line) => {
            const tone: OverviewTone = overview.stale ? "fault" : line.cancelledCount ? "fault" : line.maxDelaySeconds > 300 ? "warning" : line.tripCount ? "clear" : "unknown";
            return {
              lineId: line.lineId, name: line.name, color: line.color, tone,
              primary: overview.stale ? "Feed stale" : line.cancelledCount ? `${line.cancelledCount} cancelled` : line.maxDelaySeconds > 300 ? `${Math.ceil(line.maxDelaySeconds / 60)} min delay` : line.tripCount ? `${line.tripCount} live ${line.tripCount === 1 ? "train" : "trains"}` : "No prediction",
              secondary: overview.stale ? "Status unconfirmed" : line.tripCount ? "Realtime train feed" : "Not an all-clear",
            };
          }).sort((a, b) => a.name.localeCompare(b.name)));
          setOverviewCheckedAt(overview.checkedAt);
          setOverviewCoverage(`Train predictions only${overview.unmatchedTrips ? ` · ${overview.unmatchedTrips} unmatched` : ""}`);
        } else if (network === "metro") setMetro(payload as MetroResult); else setRegional(payload as VlineResult);
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Live data is unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const next = new URLSearchParams(lineId ? { network, lineId } : { network });
    window.history.replaceState(null, "", `/?${next.toString()}`);
    return () => controller.abort();
  }, [lineId, lines, network, refreshKey]);

  function changeNetwork(next: Network) {
    setNetwork(next);
    setLineId("");
    setOverviewLines([]);
  }

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    window.requestAnimationFrame(() => routeButton.current?.focus());
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = closeButton.current?.closest('[role="dialog"]');
      const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')] : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", handleKeyboard); };
  }, [closePicker, pickerOpen]);

  const tone: Tone = useMemo(() => {
    if (loading) return "loading";
    if (error || regional?.stale) return "fault";
    if (network === "metro") return metro?.disruptions.length ? "warning" : "clear";
    if (regional?.trips.some((trip) => trip.cancelled)) return "fault";
    return regional?.trips.some((trip) => (trip.delaySeconds ?? 0) > 300) ? "warning" : "clear";
  }, [error, loading, metro, network, regional]);
  const colours = toneClasses(tone);
  const WeatherIcon = weather ? WEATHER_ICONS[weather.tone] : Cloud;
  const checkedAt = lineId ? (network === "metro" ? metro?.checkedAt : regional?.checkedAt) : overviewCheckedAt;
  const regionalCancellation = regional?.trips.some((trip) => trip.cancelled) ?? false;
  const regionalDelay = Math.max(0, ...(regional?.trips.map((trip) => trip.delaySeconds ?? 0) ?? []));

  const headline = loading ? "Checking live services"
    : error ? "Live status unavailable"
    : network === "metro" && metro?.disruptions.length ? "Travel changes reported"
    : network === "metro" ? "No listed service changes"
    : regional?.stale ? "Predictions are stale"
    : regionalCancellation ? "Cancellation reported"
    : regionalDelay > 300 ? "Delays reported"
    : regional?.trips.length ? "Services reporting live"
    : "No current predictions";

  const summary = loading ? "Reading the latest official transport evidence."
    : error ? "The board could not confirm the current service state. Use the official source before changing your journey."
    : network === "metro" && metro?.disruptions.length ? `${metro.disruptions.length} current or upcoming ${metro.disruptions.length === 1 ? "notice may" : "notices may"} affect this route.`
    : network === "metro" ? "Transport Victoria has no current or upcoming service or station notices listed for this route."
    : regional?.stale ? "The realtime feed is older than expected, so predictions are hidden."
    : regionalCancellation ? "At least one active train is reported as cancelled. Confirm alternatives with V/Line before leaving."
    : regionalDelay > 300 ? `The longest supplied delay is ${Math.ceil(regionalDelay / 60)} minutes across ${regional?.trips.length ?? 0} active train predictions.`
    : regional?.trips.length ? `${regional.trips.length} active train ${regional.trips.length === 1 ? "prediction is" : "predictions are"} reported for this route.`
    : "This is not an all-clear. The realtime feed may not contain every scheduled service.";

  function selectRoute(id: string) {
    setLineId(id);
    closePicker();
  }

  return <main className="display-shell display-frame grid min-h-screen grid-rows-[auto_1fr_auto] selection:bg-[#6de7e1] selection:text-[#090d46]">
    <header inert={pickerOpen} aria-hidden={pickerOpen} className="grid min-h-24 grid-cols-[1fr_auto_auto] items-center gap-8 border-b border-[#303879] px-6 py-4 sm:px-10 xl:px-14" aria-label="Board status">
      <div className="flex min-w-0 items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center border border-[#6de7e1] text-[#6de7e1]"><TrainFront size={25} aria-hidden="true" /></span>
        <div className="min-w-0"><strong className="block text-lg tracking-[-.02em] sm:text-2xl"><span className="sm:hidden">Line Watch</span><span className="hidden sm:inline">Line Watch Melbourne</span></strong><span className="mt-1 hidden text-sm text-[#a8b8ba] sm:block">Live workplace transport board</span></div>
      </div>
      <div className="hidden items-center gap-3 border-x border-[#303879] px-8 lg:flex">
        <WeatherIcon className="text-[#6de7e1]" size={25} aria-hidden="true" />
        <div>{weather ? <><strong className="block text-lg">{weather.temperature}° · {weather.condition}</strong><span className="text-sm text-[#a8b8ba]">Melbourne · {weather.low}–{weather.high}°</span></> : <><strong className="block text-lg">Weather unavailable</strong><span className="text-sm text-[#a8b8ba]">Transport status remains live</span></>}</div>
      </div>
      <div className="text-right font-[family-name:var(--font-mono)] tabular-nums"><time className="block text-3xl font-medium sm:text-4xl" dateTime={now.toISOString()}>{melbourneClock.format(now)}</time><span className="mt-1 hidden text-sm text-[#a8b8ba] sm:block">{melbourneDate.format(now)}</span></div>
    </header>

    {lineId ? <section inert={pickerOpen} aria-hidden={pickerOpen} className="grid min-h-0 gap-0 xl:grid-cols-[minmax(420px,42%)_1fr]" aria-live="polite" aria-busy={loading}>
      <div className="flex min-w-0 flex-col justify-between border-b border-[#303879] px-6 py-8 sm:px-10 xl:border-r xl:border-b-0 xl:px-14 xl:py-10">
        <div>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            {(["metro", "vline"] as Network[]).map((item) => <button key={item} type="button" onClick={() => changeNetwork(item)} aria-pressed={network === item} className={`min-h-14 min-w-28 cursor-pointer border px-5 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1] ${network === item ? "border-[#6de7e1] bg-[#6de7e1] text-[#090d46]" : "border-[#4d5794] bg-transparent text-[#f3f7f5] hover:border-[#6de7e1]"}`}>{item === "metro" ? "Metro" : "V/Line"}</button>)}
          </div>
          <p className="m-0 flex items-center gap-3 text-base font-semibold text-[#a8b8ba]"><span className="size-3 shrink-0" style={{ background: selectedLine?.color || "#6de7e1" }} aria-hidden="true" />{network === "metro" ? "Metropolitan train" : "Regional train"}</p>
          <h1 className="mt-3 mb-0 max-w-[12ch] text-[clamp(3.4rem,6vw,6rem)] leading-[.92] font-extrabold tracking-[-.035em] text-balance">{selectedLine?.name ?? (error ? "Route unavailable" : "Loading routes")}</h1>
          <div className="mt-7 max-w-[560px]"><SignalTrace tone={tone} /></div>
        </div>
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <span className={`grid size-10 shrink-0 place-items-center ${colours.soft}`}>{loading ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={20} /> : tone === "clear" ? <Check size={21} /> : <AlertTriangle size={21} />}</span>
            <span className="font-[family-name:var(--font-mono)] text-sm tracking-[.08em] text-[#a8b8ba] uppercase">Current reading</span>
          </div>
          <h2 className={`m-0 max-w-[13ch] text-[clamp(2rem,3.5vw,4rem)] leading-[1.02] font-bold tracking-[-.03em] ${colours.ink}`}>{headline}</h2>
          <p className="mt-5 mb-0 max-w-[58ch] text-lg leading-7 text-[#c6d1d1] xl:text-xl xl:leading-8">{summary}</p>
        </div>
      </div>

      <div className="min-w-0 px-6 py-8 sm:px-10 xl:overflow-y-auto xl:px-12 xl:py-10">
        <div className="flex items-end justify-between gap-6 border-b border-[#303879] pb-5">
          <div><h2 className="m-0 text-2xl font-bold tracking-[-.02em] xl:text-3xl">What staff need to know</h2><p className="mt-2 mb-0 text-base text-[#a8b8ba]">Official evidence for the selected route</p></div>
          <button type="button" onClick={refresh} disabled={loading} className="inline-flex min-h-14 cursor-pointer items-center gap-3 border border-[#4d5794] px-5 font-bold text-[#f3f7f5] hover:border-[#6de7e1] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1] disabled:cursor-wait disabled:opacity-50"><RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : ""} size={20} />Refresh</button>
        </div>

        {network === "metro" ? <MetroEvidence loading={loading} error={error} result={metro} /> : <RegionalEvidence loading={loading} error={error} result={regional} />}
      </div>
    </section> : <NetworkOverview network={network} lines={overviewLines} loading={loading} error={error} coverage={overviewCoverage} onNetworkChange={changeNetwork} onSelect={setLineId} onRefresh={refresh} />}

    <footer inert={pickerOpen} aria-hidden={pickerOpen} className="grid min-h-24 items-center gap-4 border-t border-[#303879] bg-[#11185c] px-6 py-4 sm:grid-cols-[auto_1fr_auto] sm:px-10 xl:px-14">
      {lineId ? <div className="flex flex-wrap gap-3"><button type="button" onClick={() => setLineId("")} className="inline-flex min-h-16 cursor-pointer items-center justify-center bg-[#f3f7f5] px-6 text-lg font-extrabold text-[#090d46] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1]">View all lines</button><button ref={routeButton} type="button" onClick={() => setPickerOpen(true)} className="inline-flex min-h-16 cursor-pointer items-center justify-between gap-5 border border-[#4d5794] px-5 text-base font-bold text-[#f3f7f5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1]">Choose line <ChevronDown size={20} /></button></div> : <p className="m-0 text-lg font-bold text-[#f3f7f5]">Tap any line for detailed evidence</p>}
      <p className="m-0 text-sm leading-6 text-[#a8b8ba] sm:px-4">{refreshPolicyLabel} Missing evidence is shown as uncertainty, never as normal service.</p>
      <div className="flex items-center gap-3 font-[family-name:var(--font-mono)] text-sm text-[#c6d1d1]"><Clock3 size={17} className="text-[#6de7e1]" />{checkedAt ? `Checked ${melbourneStamp.format(new Date(checkedAt))}` : "Waiting for live data"}</div>
    </footer>

    {lineId && pickerOpen && <RoutePicker network={network} lines={lines} selected={lineId} onClose={closePicker} onSelect={selectRoute} closeRef={closeButton} />}
  </main>;
}

function NetworkOverview({ network, lines, loading, error, coverage, onNetworkChange, onSelect, onRefresh }: {
  network: Network;
  lines: OverviewLine[];
  loading: boolean;
  error: string;
  coverage: string;
  onNetworkChange: (network: Network) => void;
  onSelect: (lineId: string) => void;
  onRefresh: () => void;
}) {
  const affected = lines.filter((line) => line.tone === "warning" || line.tone === "fault").length;
  const unconfirmed = lines.filter((line) => line.tone === "unknown").length;
  return <section className="flex min-h-0 flex-col px-6 py-6 sm:px-10 xl:px-14 xl:py-8" aria-live="polite" aria-busy={loading}>
    <header className="grid items-end gap-6 border-b border-[#303879] pb-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <h1 className="m-0 text-4xl leading-none font-extrabold tracking-[-.03em] sm:text-5xl xl:text-6xl">All {network === "metro" ? "Metro" : "V/Line"} lines</h1>
        <p className="mt-4 mb-0 max-w-[72ch] text-lg leading-7 text-[#c6d1d1]">{loading ? "Building the network picture from official live evidence." : error ? "The board could not confirm the network picture." : affected ? `${affected} ${affected === 1 ? "line needs" : "lines need"} attention${unconfirmed ? ` · ${unconfirmed} unconfirmed` : ""}.` : unconfirmed ? `${unconfirmed} ${unconfirmed === 1 ? "line has" : "lines have"} no current prediction.` : `No listed travel changes across ${lines.length} lines.`} <span className="text-[#a8b8ba]">{coverage}</span></p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {(["metro", "vline"] as Network[]).map((item) => <button key={item} type="button" onClick={() => onNetworkChange(item)} aria-pressed={network === item} className={`min-h-14 min-w-28 cursor-pointer border px-5 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1] ${network === item ? "border-[#6de7e1] bg-[#6de7e1] text-[#090d46]" : "border-[#4d5794] bg-transparent text-[#f3f7f5] hover:border-[#6de7e1]"}`}>{item === "metro" ? "Metro" : "V/Line"}</button>)}
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-14 cursor-pointer items-center gap-3 border border-[#4d5794] px-5 font-bold text-[#f3f7f5] hover:border-[#6de7e1] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1] disabled:cursor-wait disabled:opacity-50"><RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : ""} size={20} />Refresh</button>
      </div>
    </header>

    {loading ? <div className="mt-6 grid min-h-0 flex-1 grid-cols-2 border-t border-l border-[#303879] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" role="status" aria-label="Loading all lines">{Array.from({ length: network === "metro" ? 15 : 10 }, (_, index) => <div key={index} className="min-h-28 border-r border-b border-[#303879] bg-[#11185c] p-5"><LoaderCircle className="animate-spin text-[#6de7e1] motion-reduce:animate-none" size={21} /></div>)}</div>
      : error ? <div className="flex min-h-72 flex-1 items-center"><FailureState message={error} href={network === "metro" ? "https://www.ptv.vic.gov.au/disruptions/disruptions-information/" : "https://www.vline.com.au/Service-Changes"} /></div>
      : <div className="mt-6 grid min-h-0 flex-1 grid-cols-1 border-t border-l border-[#303879] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {lines.map((line) => {
          const stateClass = line.tone === "fault" ? "text-[#ff6b5f]" : line.tone === "warning" ? "text-[#ffbe4a]" : line.tone === "clear" ? "text-[#6de7e1]" : "text-[#a8b8ba]";
          return <button key={line.lineId} data-overview-line={line.name} type="button" onClick={() => onSelect(line.lineId)} className="group flex min-h-28 cursor-pointer flex-col justify-between border-r border-b border-[#303879] bg-[#090d46] p-5 text-left hover:bg-[#11185c] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#6de7e1] xl:min-h-32">
            <span className="flex w-full items-start justify-between gap-4"><span className="text-xl leading-6 font-bold tracking-[-.015em] text-[#f3f7f5] xl:text-2xl">{line.name}</span><span className="mt-1 size-3 shrink-0" style={{ background: line.color }} aria-hidden="true" /></span>
            <span className="mt-5 flex w-full items-end justify-between gap-3"><span><strong className={`block text-base ${stateClass}`}>{line.primary}</strong><span className="mt-1 block text-xs leading-4 text-[#a8b8ba]">{line.secondary}</span></span><ArrowUpRight className="shrink-0 text-[#6de7e1] opacity-60 transition-opacity group-hover:opacity-100" size={20} aria-hidden="true" /></span>
          </button>;
        })}
      </div>}
  </section>;
}

function MetroEvidence({ loading, error, result }: { loading: boolean; error: string; result: MetroResult | null }) {
  if (loading) return <LoadingRows label="Reading Metro notices" />;
  if (error) return <FailureState message={error} href="https://www.ptv.vic.gov.au/disruptions/disruptions-information/" />;
  if (!result?.disruptions.length) return <div className="flex min-h-72 items-center border-b border-[#303879] py-10"><div><Check className="mb-6 text-[#6de7e1]" size={42} /><h3 className="m-0 text-3xl font-bold">No active notices listed</h3><p className="mt-3 max-w-[62ch] text-lg leading-7 text-[#a8b8ba]">This reflects the current official service-alert feed. Check station displays before travel.</p></div></div>;
  return <div className="divide-y divide-[#303879]">
    {result.disruptions.map((item) => <article key={item.id} className="grid gap-4 py-6 first:pt-7 2xl:grid-cols-[minmax(0,1fr)_230px]">
      <div><div className="mb-3 flex items-center gap-3"><AlertTriangle size={19} className="shrink-0 text-[#ffbe4a]" /><span className="font-[family-name:var(--font-mono)] text-sm text-[#ffbe4a] uppercase">{item.severity === "major" ? "Service change" : "Notice"}</span></div><h3 className="m-0 text-2xl leading-8 font-bold tracking-[-.015em]">{item.detail}</h3>{item.description && <p className="mt-3 mb-0 max-w-[68ch] text-base leading-6 text-[#a8b8ba]">{item.description}</p>}</div>
      <p className="m-0 flex items-start gap-3 text-base leading-6 text-[#c6d1d1]"><CalendarDays className="mt-0.5 shrink-0 text-[#ffbe4a]" size={19} />{item.period}</p>
    </article>)}
    <SourceLink href={result.source}>Open live Metro line status</SourceLink>
  </div>;
}

function RegionalEvidence({ loading, error, result }: { loading: boolean; error: string; result: VlineResult | null }) {
  if (loading) return <LoadingRows label="Reading V/Line predictions" />;
  if (error) return <FailureState message={error} href="https://www.vline.com.au/Service-Changes" />;
  if (result?.stale) return <FailureState message="The regional realtime feed is stale. Predictions are hidden rather than presented as current." href="https://www.vline.com.au/Service-Changes" />;
  if (!result?.trips.length) return <div className="py-10"><Info className="mb-6 text-[#ffbe4a]" size={42} /><h3 className="m-0 text-3xl font-bold">No current predictions matched</h3><p className="mt-3 max-w-[64ch] text-lg leading-7 text-[#a8b8ba]">This is not a timetable or an all-clear. The feed covers train predictions only—not coaches, works, replacement buses or disruption notices.</p><SourceLink href="https://www.vline.com.au/Service-Changes">Check official V/Line notices</SourceLink></div>;
  return <div className="divide-y divide-[#303879]">
    {result.trips.slice(0, 5).map((trip) => <article key={trip.id} className="grid gap-4 py-5 first:pt-7 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div><h3 className="m-0 text-2xl font-bold tracking-[-.015em]">{trip.destination}</h3><p className="mt-2 mb-0 text-base text-[#a8b8ba]">{trip.nextStop ? `Next reported stop · ${trip.nextStop}` : "Next stop not supplied"}</p></div>
      <div className="sm:text-right"><strong className={`block text-lg ${trip.cancelled ? "text-[#ff6b5f]" : (trip.delaySeconds ?? 0) > 0 ? "text-[#ffbe4a]" : "text-[#6de7e1]"}`}>{trip.cancelled ? "Cancelled" : delayLabel(trip.delaySeconds)}</strong><span className="mt-2 block font-[family-name:var(--font-mono)] text-sm text-[#a8b8ba]">{trip.predictedAt ? melbourneStamp.format(new Date(trip.predictedAt)) : "Prediction time unavailable"}</span></div>
    </article>)}
    <p className="m-0 py-5 text-sm leading-6 text-[#a8b8ba]">Predictions cover trains only, not coaches, replacement buses, planned works or disruption notices.{result.unmatchedTrips ? " Some feed trips could not be matched to the current schedule." : ""}</p>
    <SourceLink href="https://www.vline.com.au/Service-Changes">Open official V/Line notices</SourceLink>
  </div>;
}

function LoadingRows({ label }: { label: string }) {
  return <div className="py-8" role="status"><p className="flex items-center gap-3 text-lg text-[#c6d1d1]"><LoaderCircle className="animate-spin text-[#6de7e1] motion-reduce:animate-none" size={23} />{label}…</p><div className="mt-8 space-y-6" aria-hidden="true">{[1, 2, 3].map((item) => <div className="h-20 border-b border-[#303879] bg-[#11185c]" key={item} />)}</div></div>;
}

function FailureState({ message, href }: { message: string; href: string }) {
  return <div className="py-10" role="alert"><AlertTriangle className="mb-6 text-[#ff6b5f]" size={42} /><h3 className="m-0 text-3xl font-bold">Unable to confirm live status</h3><p className="mt-3 max-w-[64ch] text-lg leading-7 text-[#c6d1d1]">{message}</p><SourceLink href={href}>Check the official service source</SourceLink></div>;
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-14 items-center gap-3 py-3 text-base font-bold text-[#6de7e1] underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1]">{children}<ArrowUpRight size={19} /></a>;
}

function RoutePicker({ network, lines, selected, onSelect, onClose, closeRef }: { network: Network; lines: TrainLine[]; selected: string; onSelect: (id: string) => void; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-[#05072c]/85" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="route-sheet max-h-[88svh] w-full overflow-y-auto border-t border-[#6de7e1] bg-[#11185c] px-6 py-6 sm:px-10 xl:px-14 xl:py-8" role="dialog" aria-modal="true" aria-labelledby="route-picker-title">
      <header className="mb-7 flex items-center justify-between gap-6"><div><h2 id="route-picker-title" className="m-0 text-3xl font-extrabold tracking-[-.025em] sm:text-4xl">Choose a {network === "metro" ? "Metro line" : "V/Line route"}</h2><p className="mt-2 mb-0 text-base text-[#a8b8ba]">Large touch targets are arranged alphabetically.</p></div><button ref={closeRef} type="button" onClick={onClose} className="grid size-16 shrink-0 cursor-pointer place-items-center border border-[#4d5794] hover:border-[#6de7e1] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1]" aria-label="Close route picker"><X size={27} /></button></header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {lines.map((line) => <button key={line.id} type="button" aria-pressed={selected === line.id} onClick={() => onSelect(line.id)} className={`flex min-h-20 cursor-pointer items-center gap-4 border px-5 text-left text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6de7e1] ${selected === line.id ? "border-[#6de7e1] bg-[#1b2873] text-white" : "border-[#4d5794] bg-[#090d46] text-[#f3f7f5] hover:border-[#6de7e1] hover:bg-[#151d63]"}`}><span className="h-9 w-2 shrink-0" style={{ background: line.color }} aria-hidden="true" /><span className="min-w-0 flex-1">{line.name}</span>{selected === line.id && <Check className="shrink-0 text-[#6de7e1]" size={22} />}</button>)}
      </div>
    </section>
  </div>;
}
