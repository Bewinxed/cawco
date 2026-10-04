/**
 * Draws the tab icon's art from Caw's status files, with the dashboard's own
 * tile (src/lib/cawco/tab-icon/tile.ts) on Rive's runtime in headless
 * Chromium, so what it writes is what a tab shows:
 *
 * - src/lib/assets/brand/cawco-tab-icon.png, the icon every page is served
 *   with and rests on while nothing is going on: the sleeping Caw on butter;
 * - .context/favicon/<state>-<side>.png at the repository's root, one strip
 *   per state at 32 and 64 px, two seconds of each loop a drawing at a time,
 *   for looking at.
 *
 * Run it again whenever Caw's files or the tile's tokens change:
 *
 *   bun run tab-icon
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";

const here = (path: string) => join(import.meta.dir, "..", path);
const RIVE = here("node_modules/@rive-app/canvas/");
const CAW = here("src/lib/assets/caw/");
const ICON = here("src/lib/assets/brand/cawco-tab-icon.png");
const STRIPS = here("../../.context/favicon/");

/** What Caw shows when nothing is going on (assets/mascot/README.md, Contract). */
const RESTING = "sleeping";
/** The side the dashboard draws the icon at (tab-icon.svelte.ts `SIDE`). */
const SIDE = 64;
/** Drawings in a strip: two seconds at the 12 a second the tab is drawn at. */
const DRAWINGS = 24;

interface Job {
  colour: string;
  drawings: number;
  radius: number;
  side: number;
  status: string;
  still: boolean;
}

/** A token's value, wherever its group is. */
function token(name: string): string {
  const find = (node: unknown): string | undefined => {
    if (!node || typeof node !== "object") {
      return;
    }
    const group = node as Record<string, unknown>;
    const hit = group[name] as { $value?: string } | undefined;
    if (hit?.$value) {
      return hit.$value;
    }
    for (const child of Object.values(group)) {
      const found = find(child);
      if (found) {
        return found;
      }
    }
  };
  const value = find(
    JSON.parse(
      readFileSync(here("../../design/tokens/cawco.tokens.json"), "utf8")
    )
  );
  if (!value) {
    throw new Error(`No token named ${name}`);
  }
  return value;
}

const built = await Bun.build({
  entrypoints: [here("src/lib/cawco/tab-icon/tile.ts")],
  target: "browser",
  format: "esm",
});
if (!built.success) {
  throw new AggregateError(built.logs, "tile.ts did not build");
}
const tileModule = await built.outputs[0].text();

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("http://caw.test/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/") {
    return route.fulfill({
      contentType: "text/html",
      body: '<script src="/rive.js"></script>',
    });
  }
  if (path === "/tile.js") {
    return route.fulfill({
      contentType: "text/javascript",
      body: tileModule,
    });
  }
  if (path === "/rive.js") {
    return route.fulfill({
      contentType: "text/javascript",
      body: readFileSync(join(RIVE, "rive.js")),
    });
  }
  if (path === "/rive.wasm") {
    return route.fulfill({
      contentType: "application/wasm",
      body: readFileSync(join(RIVE, "rive.wasm")),
    });
  }
  return route.fulfill({
    contentType: "application/octet-stream",
    body: readFileSync(join(CAW, path.slice(1))),
  });
});
await page.goto("http://caw.test/");

/** The job's drawings side by side, as PNG bytes. */
async function strip(job: Job): Promise<Buffer> {
  const url = await page.evaluate(async (asked: Job) => {
    const { RuntimeLoader } = (
      globalThis as unknown as {
        rive: typeof import("@rive-app/canvas");
      }
    ).rive;
    RuntimeLoader.setWasmUrl("/rive.wasm");
    RuntimeLoader.setWasmFallbackUrl(null);
    const { openTile }: typeof import("../src/lib/cawco/tab-icon/tile") =
      await import("/tile.js" as string);
    const bytes = await (await fetch(`/${asked.status}.riv`)).arrayBuffer();
    const tile = await openTile(await RuntimeLoader.awaitInstance(), {
      ...asked,
      bytes,
    });
    const sheet = document.createElement("canvas");
    sheet.width = asked.side * asked.drawings;
    sheet.height = asked.side;
    const context = sheet.getContext("2d");
    const drawings = Array.from({ length: asked.drawings }, (_, i) => {
      const drawing = new Image();
      drawing.src = tile.draw(i === 0 ? 0 : 1 / 12);
      return drawing;
    });
    tile.close();
    await Promise.all(drawings.map((drawing) => drawing.decode()));
    for (const [i, drawing] of drawings.entries()) {
      context?.drawImage(drawing, i * asked.side, 0);
    }
    return sheet.toDataURL("image/png");
  }, job);
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

const radius = Number.parseFloat(token("tab-icon-r"));
const butter = token("spark");
const states = [
  { name: "working", status: "working", colour: butter, still: false },
  {
    name: "needs-you",
    status: "needs-you",
    colour: token("vermilion"),
    still: false,
  },
  { name: "sleeping", status: RESTING, colour: butter, still: true },
];

const art = [
  ...states.flatMap((state) =>
    [32, SIDE].map((side) => ({
      file: join(STRIPS, `${state.name}-${side}.png`),
      job: { ...state, radius, side, drawings: state.still ? 1 : DRAWINGS },
    }))
  ),
  {
    file: ICON,
    job: {
      status: RESTING,
      colour: butter,
      still: true,
      radius,
      side: SIDE,
      drawings: 1,
    },
  },
];
await Promise.all(
  art.map(async ({ file, job }) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, await strip(job));
    console.log(file);
  })
);

await browser.close();
