const { spawn } = require("node:child_process");
const { mkdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright-core");

const port = 3111;
const origin = `http://127.0.0.1:${port}`;
const reviewDir = join(process.cwd(), ".impeccable", "review");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const metroLines = [
  { id: "alamein", name: "Alamein Line", routeCodes: ["ALM"], color: "#0052a4" },
  { id: "belgrave", name: "Belgrave Line", routeCodes: ["BEG"], color: "#0052a4" },
  { id: "city-circle", name: "City Circle Line", routeCodes: ["CCL"], color: "#f178af" },
  { id: "craigieburn", name: "Craigieburn Line", routeCodes: ["CGB"], color: "#ffbe00" },
  { id: "cranbourne", name: "Cranbourne Line", routeCodes: ["CBE"], color: "#009645" },
  { id: "flemington-racecourse", name: "Flemington Racecourse Line", routeCodes: ["FRC"], color: "#f178af" },
  { id: "frankston", name: "Frankston Line", routeCodes: ["FKN"], color: "#009645" },
  { id: "glen-waverley", name: "Glen Waverley Line", routeCodes: ["GWY"], color: "#0052a4" },
  { id: "hurstbridge", name: "Hurstbridge Line", routeCodes: ["HBE"], color: "#e87800" },
  { id: "lilydale", name: "Lilydale Line", routeCodes: ["LIL"], color: "#0052a4" },
  { id: "mernda", name: "Mernda Line", routeCodes: ["MDD"], color: "#e87800" },
  { id: "pakenham", name: "Pakenham Line", routeCodes: ["PKM"], color: "#009645" },
  { id: "sandringham", name: "Sandringham Line", routeCodes: ["SHM"], color: "#f178af" },
  { id: "stony-point", name: "Stony Point Line", routeCodes: ["STY"], color: "#009645" },
  { id: "sunbury", name: "Sunbury Line", routeCodes: ["SUN"], color: "#ffbe00" },
  { id: "upfield", name: "Upfield Line", routeCodes: ["UFD"], color: "#ffbe00" },
  { id: "werribee", name: "Werribee Line", routeCodes: ["WBE"], color: "#00a8e4" },
  { id: "williamstown", name: "Williamstown Line", routeCodes: ["WIL"], color: "#00a8e4" },
];
const vlineLines = [
  { id: "geelong", name: "Geelong", routeCodes: ["GEL"], color: "#7b3f98" },
  { id: "ballarat", name: "Ballarat", routeCodes: ["BAT"], color: "#8f6f31" },
  { id: "bendigo", name: "Bendigo", routeCodes: ["BEN"], color: "#b65f25" },
  { id: "albury", name: "Albury", routeCodes: ["ALB"], color: "#773f98" },
  { id: "bairnsdale", name: "Bairnsdale", routeCodes: ["BAI"], color: "#773f98" },
  { id: "echuca", name: "Echuca", routeCodes: ["ECH"], color: "#773f98" },
  { id: "maryborough", name: "Maryborough", routeCodes: ["MBH"], color: "#773f98" },
  { id: "seymour", name: "Seymour", routeCodes: ["SEY"], color: "#773f98" },
  { id: "shepparton", name: "Shepparton", routeCodes: ["SHP"], color: "#773f98" },
  { id: "swan-hill", name: "Swan Hill", routeCodes: ["SWH"], color: "#773f98" },
];

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Display server did not start in time");
}

async function installFixtures(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const now = new Date().toISOString();
    if (url.pathname === "/api/weather") {
      return route.fulfill({ json: { weather: { temperature: 18, high: 22, low: 12, condition: "Partly cloudy", tone: "cloudy" }, checkedAt: now } });
    }
    if (url.pathname === "/api/lines") {
      return route.fulfill({ json: { lines: url.searchParams.get("network") === "vline" ? vlineLines : metroLines } });
    }
    if (url.pathname === "/api/overview") {
      if (url.searchParams.get("network") === "vline") return route.fulfill({ json: {
        checkedAt: now, stale: false, unmatchedTrips: 1,
        lines: vlineLines.map((line, index) => ({ lineId: line.id, name: line.name, color: line.color, tripCount: index % 4 === 3 ? 0 : index + 1, cancelledCount: line.id === "ballarat" ? 1 : 0, maxDelaySeconds: line.id === "geelong" ? 480 : index === 4 ? 360 : 0 })),
      } });
      return route.fulfill({ json: {
        checkedAt: now,
        lines: metroLines.map((line, index) => ({ lineId: line.id, name: line.name, color: line.color, noticeCount: index % 5 === 0 ? 2 : index % 7 === 0 ? 1 : 0, majorCount: index % 5 === 0 ? 1 : 0 })),
      } });
    }
    if (url.pathname === "/api/disruptions") {
      return route.fulfill({ json: {
        checkedAt: now,
        source: "https://www.metrotrains.com.au/",
        disruptions: [
          { id: "one", lineId: "werribee", line: "Werribee Line", severity: "major", detail: "Buses replace trains between Newport and Werribee after 8:30 pm", description: "Allow an extra 35 minutes and check the replacement-bus departure point before travelling.", period: "Tue, 13 Oct 2026, 8:30 pm - Wed, 14 Oct 2026, 4:30 am" },
          { id: "two", lineId: "werribee", line: "Werribee Line", severity: "minor", detail: "Platform access changes at Footscray", description: "Follow station signs and allow more time to change platforms.", period: "13-16 Oct 2026" },
          { id: "three", lineId: "werribee", line: "Werribee Line", severity: "minor", detail: "Car park spaces temporarily unavailable at Werribee Station", description: "A small number of spaces are closed for maintenance.", period: "Until Fri, 23 Oct 2026, 11:59 pm" },
          { id: "four", lineId: "werribee", line: "Werribee Line", severity: "minor", detail: "Lift maintenance at Laverton Station", description: "Follow station signs for the accessible path.", period: "Wed, 14 Oct 2026, 9:00 am - 4:00 pm" },
          { id: "five", lineId: "werribee", line: "Werribee Line", severity: "minor", detail: "Station entrance works at Aircraft Station", description: "Use the signed temporary entrance.", period: "Until Fri, 30 Oct 2026, 11:59 pm" },
        ],
      } });
    }
    if (url.pathname === "/api/vline-trips") {
      const cancelled = url.searchParams.get("lineId") === "ballarat";
      return route.fulfill({ json: {
        checkedAt: now, feedUpdatedAt: now, stale: false, unmatchedTrips: 1,
        trips: cancelled ? [
          { id: "b1", destination: "Wendouree", nextStop: "Southern Cross", predictedAt: now, delaySeconds: null, cancelled: true },
        ] : [
          { id: "g1", destination: "Waurn Ponds", nextStop: "Southern Cross", predictedAt: now, delaySeconds: 120, cancelled: false },
          { id: "g2", destination: "Geelong", nextStop: "Footscray", predictedAt: now, delaySeconds: 0, cancelled: false },
          { id: "g3", destination: "Warrnambool", nextStop: "Southern Cross", predictedAt: now, delaySeconds: 480, cancelled: false },
        ],
      } });
    }
    return route.continue();
  });
}

async function assertViewport(page, label, allowVertical = false) {
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  if (dimensions.scrollWidth > dimensions.innerWidth + 1) throw new Error(`${label} has horizontal overflow: ${JSON.stringify(dimensions)}`);
  if (!allowVertical && dimensions.scrollHeight > dimensions.innerHeight + 1) throw new Error(`${label} should fit without scrolling: ${JSON.stringify(dimensions)}`);
}

async function main() {
  mkdirSync(reviewDir, { recursive: true });
  const executablePath = edgeCandidates.find(existsSync);
  if (!executablePath) throw new Error("Microsoft Edge was not found for visual verification");
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { cwd: process.cwd(), stdio: "ignore", windowsHide: true });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await installFixtures(page);
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByText("All Metro lines").waitFor();
    const metroNames = await page.locator("[data-overview-line]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-overview-line")));
    if (metroNames.length !== 18) throw new Error(`Metro overview should show all 18 fixture lines, received ${metroNames.length}`);
    if (metroNames.join("|") !== [...metroNames].sort((a, b) => a.localeCompare(b)).join("|")) throw new Error("Metro overview is not alphabetical");
    await assertViewport(page, "1920x1080 Metro overview");
    await page.screenshot({ path: join(reviewDir, "overview.png"), fullPage: true });

    await page.getByRole("button", { name: /Werribee Line/ }).click();
    await page.getByText("Travel changes reported").waitFor();
    await page.getByText("Lift maintenance at Laverton Station").waitFor();
    await page.getByText("Station entrance works at Aircraft Station").waitFor();
    const metroSource = page.getByRole("link", { name: "Open live Metro line status" });
    if (await metroSource.getAttribute("href") !== "https://www.metrotrains.com.au/") throw new Error("Metro source link does not open the public live-status page");
    await assertViewport(page, "1920x1080 Metro detail");
    await page.screenshot({ path: join(reviewDir, "desktop.png"), fullPage: true });

    const routeButton = page.getByRole("button", { name: "Choose line" });
    await routeButton.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(reviewDir, "route-picker.png"), fullPage: true });
    await page.keyboard.press("Shift+Tab");
    const focusStayedInDialog = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
    if (!focusStayedInDialog) throw new Error("Route picker did not trap keyboard focus");
    await page.keyboard.press("Escape");
    if (!(await routeButton.evaluate((element) => element === document.activeElement))) throw new Error("Route picker did not restore focus to its opener");

    await page.getByRole("button", { name: "View all lines" }).click();
    await page.getByRole("button", { name: "V/Line" }).click();
    await page.getByText("All V/Line lines").waitFor();
    await assertViewport(page, "1920x1080 V/Line overview");
    await page.screenshot({ path: join(reviewDir, "vline-overview.png"), fullPage: true });
    await page.getByRole("button", { name: /Geelong/ }).click();
    await page.getByText("Delays reported").waitFor();
    await assertViewport(page, "1920x1080 V/Line detail");
    await page.screenshot({ path: join(reviewDir, "vline.png"), fullPage: true });

    await page.getByRole("button", { name: "Choose line" }).click();
    await page.getByRole("button", { name: "Ballarat" }).click();
    const cancellation = page.getByText("Cancellation reported");
    await cancellation.waitFor();
    const cancellationColour = await cancellation.evaluate((element) => getComputedStyle(element).color);
    if (cancellationColour !== "rgb(255, 107, 95)") throw new Error(`Cancellation verdict uses the wrong tone: ${cancellationColour}`);

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole("button", { name: "View all lines" }).click();
    await page.getByRole("button", { name: "Metro" }).click();
    await page.getByText("All Metro lines").waitFor();
    await assertViewport(page, "1366x768 overview", true);
    await page.screenshot({ path: join(reviewDir, "compact.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertViewport(page, "mobile board", true);
    await page.screenshot({ path: join(reviewDir, "mobile.png"), fullPage: true });
    console.log("Visual verification passed at 1920x1080, 1366x768, and 390x844.");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
