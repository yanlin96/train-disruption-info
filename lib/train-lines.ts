import "server-only";

import { inflateRawSync } from "node:zlib";

export type TrainLine = {
  id: string;
  name: string;
  routeCodes: string[];
  color: string;
};

const GTFS_URL =
  "https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip";
const METRO_ARCHIVE_PATH = "2/google_transit.zip";
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

type ZipEntry = {
  method: number;
  compressedSize: number;
  localOffset: number;
};

async function rangedFetch(start: number, end?: number) {
  const response = await fetch(GTFS_URL, {
    headers: { Range: `bytes=${start}-${end ?? ""}` },
    next: { revalidate: 604800 },
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Transport Victoria GTFS returned ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function findSignature(buffer: Buffer, signature: number) {
  for (let offset = buffer.length - 4; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
}

async function findMetroRoutesEntry(archivePath = METRO_ARCHIVE_PATH): Promise<ZipEntry> {
  const head = await fetch(GTFS_URL, { method: "HEAD", next: { revalidate: 604800 } });
  const fileSize = Number(head.headers.get("content-length"));
  if (!head.ok || !Number.isFinite(fileSize)) throw new Error("Unable to read Transport Victoria GTFS metadata");

  const tailStart = Math.max(0, fileSize - 65557);
  const tail = await rangedFetch(tailStart);
  const eocd = findSignature(tail, EOCD_SIGNATURE);
  if (eocd < 0) throw new Error("Invalid GTFS ZIP directory");

  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  const relativeStart = directoryOffset - tailStart;
  const directory = relativeStart >= 0 && relativeStart + directorySize <= tail.length
    ? tail.subarray(relativeStart, relativeStart + directorySize)
    : await rangedFetch(directoryOffset, directoryOffset + directorySize - 1);

  if (directory.length < 4 || directory.readUInt32LE(0) !== CENTRAL_SIGNATURE) {
    throw new Error(`Invalid GTFS central directory at ${directoryOffset} (${directorySize} bytes, signature ${directory.subarray(0, 4).toString("hex")})`);
  }

  for (let offset = 0; offset + 46 <= directory.length;) {
    if (directory.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const method = directory.readUInt16LE(offset + 10);
    const compressedSize = directory.readUInt32LE(offset + 20);
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);
    const localOffset = directory.readUInt32LE(offset + 42);
    const name = directory.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const normalisedName = name.replaceAll("\\", "/");
    if (normalisedName === archivePath || normalisedName.endsWith(`/${archivePath}`)) {
      return { method, compressedSize, localOffset };
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Metropolitan archive is missing from GTFS ZIP");
}

async function extractEntry(entry: ZipEntry) {
  const header = await rangedFetch(entry.localOffset, entry.localOffset + 29);
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error("Invalid GTFS ZIP entry");
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = await rangedFetch(dataStart, dataStart + entry.compressedSize - 1);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported GTFS ZIP compression method ${entry.method}`);
}

function extractRoutesFromMetroArchive(archive: Buffer, fileName = "routes.txt") {
  const eocd = findSignature(archive, EOCD_SIGNATURE);
  if (eocd < 0) throw new Error("Invalid metropolitan GTFS archive");
  const directorySize = archive.readUInt32LE(eocd + 12);
  const directoryOffset = archive.readUInt32LE(eocd + 16);
  const directory = archive.subarray(directoryOffset, directoryOffset + directorySize);

  for (let offset = 0; offset + 46 <= directory.length;) {
    if (directory.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const method = directory.readUInt16LE(offset + 10);
    const compressedSize = directory.readUInt32LE(offset + 20);
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);
    const localOffset = directory.readUInt32LE(offset + 42);
    const name = directory.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replaceAll("\\", "/");

    if (name === fileName || name.endsWith(`/${fileName}`)) {
      if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error("Invalid routes.txt entry");
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(start, start + compressedSize);
      if (method === 0) return compressed.toString("utf8");
      if (method === 8) return inflateRawSync(compressed).toString("utf8");
      throw new Error(`Unsupported routes.txt compression method ${method}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("routes.txt is missing from metropolitan GTFS archive");
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function slug(value: string) {
  return value.toLowerCase().replace(/\bline\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

let memoryCache: Promise<TrainLine[]> | undefined;

export function getTrainLines(): Promise<TrainLine[]> {
  memoryCache ??= (async () => {
    const metroArchive = await extractEntry(await findMetroRoutesEntry());
    const rows = parseCsv(extractRoutesFromMetroArchive(metroArchive));
    const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
    const index = (name: string) => headers.indexOf(name);
    const byName = new Map<string, TrainLine>();

    for (const row of rows) {
      const routeId = row[index("route_id")] ?? "";
      const rawName = row[index("route_short_name")] || row[index("route_long_name")] || "";
      if (!rawName || /replacement\s+bus/i.test(rawName)) continue;
      const name = /line$/i.test(rawName) ? rawName : `${rawName} Line`;
      const routeCode = routeId.match(/vic-02-([A-Z0-9]+)(?:-|:)/i)?.[1];
      const colorValue = row[index("route_color")]?.replace(/^#/, "");
      const current = byName.get(name);
      if (current && routeCode && !current.routeCodes.includes(routeCode)) current.routeCodes.push(routeCode);
      else if (!current) byName.set(name, {
        id: slug(name),
        name,
        routeCodes: routeCode ? [routeCode] : [],
        color: colorValue && /^[0-9a-f]{6}$/i.test(colorValue) ? `#${colorValue}` : "#3b78bd",
      });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  })().catch((error) => { memoryCache = undefined; throw error; });
  return memoryCache;
}

export async function findTrainLine(id: string) {
  return (await getTrainLines()).find((line) => line.id === id);
}

export type RegionalSchedule = {
  lines: TrainLine[];
  trips: Map<string, { routeId: string; headsign: string }>;
  stops: Map<string, string>;
  routes: Map<string, string>;
};

let regionalCache: Promise<RegionalSchedule> | undefined;

/** Regional rail only (folder 1); coaches in folder 5 are intentionally excluded. */
export function getRegionalSchedule(): Promise<RegionalSchedule> {
  regionalCache ??= (async () => {
    const archive = await extractEntry(await findMetroRoutesEntry("1/google_transit.zip"));
    const records = (file: string) => {
      const rows = parseCsv(extractRoutesFromMetroArchive(archive, file));
      const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
      return rows.map((row) => Object.fromEntries(headers.map((key, index) => [key, row[index] ?? ""])));
    };
    const routes = new Map<string, string>();
    const byName = new Map<string, TrainLine>();
    for (const row of records("routes.txt")) {
      const name = row.route_long_name || row.route_short_name;
      if (!name || row.route_type !== "2" || /replacement\s+bus|coach/i.test(name)) continue;
      const id = `vline-${slug(name)}`;
      routes.set(row.route_id, id);
      const current = byName.get(name);
      if (current) current.routeCodes.push(row.route_id);
      else byName.set(name, { id, name, routeCodes: [row.route_id], color: "#773f98" });
    }
    return {
      lines: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
      routes,
      trips: new Map(records("trips.txt").filter((row) => routes.has(row.route_id))
        .map((row) => [row.trip_id, { routeId: row.route_id, headsign: row.trip_headsign }])),
      stops: new Map(records("stops.txt").map((row) => [row.stop_id, row.stop_name])),
    };
  })().catch((error) => { regionalCache = undefined; throw error; });
  return regionalCache;
}
