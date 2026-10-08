/**
 * Draws the tab icon's art from Caw's status files (tab-icon-tile.ts,
 * tab-icon-shots.ts) on Rive's runtime in headless Chromium. A tab shows
 * only these pictures, so the dashboard draws nothing and loads no Rive for
 * its icon:
 *
 * - src/lib/assets/brand/tab-icon-<state>.png, each state's still: what the
 *   icon shows whenever it is not moving, and `sleeping` the one every page
 *   is served with. `working` is no drawing of Caw: it is the plain app icon
 *   (cawco-icon.png) cut to the tile's rounded corners;
 * - src/lib/assets/brand/tab-icon-needs-you-wave.png, the needs-you wave's
 *   drawings side by side, which the icon steps through while it moves;
 * - .context/favicon/<state>-<side>.png at the repository's root, one strip
 *   per state at 32 and 64 px (the needs-you wave a drawing at a time, the
 *   stills alone), for looking at;
 * - the bar's beat: the same wave on a clear ground, in each scheme
 *   (`bar-beat-needs-you-<scheme>.png`), which Caw's head in the top bar
 *   plays once when something new needs the operator, written for the
 *   dashboard (src/lib/assets/brand/) and for the Apple apps
 *   (CawCoMascot/Resources/beat/).
 *
 * Run it again whenever Caw's files, the shots or the tile's tokens change:
 *
 *   bun run tab-icon
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { NEEDS_YOU, type Shot, SLEEPING } from "./tab-icon-shots";
import { TAB_ICON } from "./tab-icon-tile";

const here = (path: string) => join(import.meta.dir, "..", path);
const RIVE = here("node_modules/@rive-app/canvas/");
const CAW = here("src/lib/assets/caw/");
const STILLS = here("src/lib/assets/brand/");
const STRIPS = here("../../.context/favicon/");
const APPLE_BEAT = here(
  "../apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/beat/"
);

/** The side the dashboard draws the icon at (tab-icon.svelte.ts `SIDE`). */
const SIDE = 64;

/**
 * The side a drawing of the bar's beat is made at: the beat's box at 32 px
 * (CawHead's `BEAT_BOX`) on a 3x display, so no screen scales it up.
 */
const BEAT_SIDE = 96;

interface Job {
  colour: string;
  /** The frames to draw, side by side. */
  frames: number[];
  radius: number;
  scheme?: "light" | "dark";
  shot: Shot;
  side: number;
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
  entrypoints: [here("scripts/tab-icon-tile.ts")],
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
    const { openTile }: typeof import("./tab-icon-tile") = await import(
      "/tile.js" as string
    );
    const bytes = await (
      await fetch(`/${asked.shot.status}.riv`)
    ).arrayBuffer();
    const tile = await openTile(await RuntimeLoader.awaitInstance(), {
      ...asked,
      bytes,
    });
    const sheet = document.createElement("canvas");
    sheet.width = asked.side * asked.frames.length;
    sheet.height = asked.side;
    const context = sheet.getContext("2d");
    const drawings = asked.frames.map((frame) => {
      const drawing = new Image();
      drawing.src = tile.draw(frame);
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
const wave = Array.from(
  { length: (NEEDS_YOU.to - NEEDS_YOU.from) / 2 },
  (_, beat) => NEEDS_YOU.from + beat * 2
);
const states = [
  { shot: NEEDS_YOU, moving: wave },
  { shot: SLEEPING, moving: [SLEEPING.frame] },
];

/** The plain app icon on the tile's shape: its corners rounded and clear. */
async function plain(side: number): Promise<Buffer> {
  const icon = readFileSync(join(STILLS, "cawco-icon.png")).toString("base64");
  const url = await page.evaluate(
    async ({ source, size, corner }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context?.beginPath();
      context?.roundRect(0, 0, size, size, corner);
      context?.clip();
      context?.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png");
    },
    {
      source: `data:image/png;base64,${icon}`,
      size: side,
      corner: (radius / TAB_ICON) * side,
    }
  );
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

// Every state stands on the same butter tile.
const colour = token("spark");
const art = states.flatMap(({ shot, moving }) => {
  const job = { shot, colour, radius };
  return [
    {
      file: join(STILLS, `tab-icon-${shot.status}.png`),
      job: { ...job, side: SIDE, frames: [shot.frame] },
    },
    ...(moving.length > 1
      ? [
          {
            file: join(STILLS, `tab-icon-${shot.status}-wave.png`),
            job: { ...job, side: SIDE, frames: moving },
          },
        ]
      : []),
    ...[32, SIDE].map((side) => ({
      file: join(STRIPS, `${shot.status}-${side}.png`),
      job: { ...job, side, frames: moving },
    })),
  ];
});
// The bar's beat: the wave, once, on no tile, in each scheme's Caw.
const barBeat = (["light", "dark"] as const).flatMap((scheme) =>
  [STILLS, APPLE_BEAT].map((dir) => ({
    file: join(dir, `bar-beat-needs-you-${scheme}.png`),
    job: {
      shot: NEEDS_YOU,
      colour: "transparent",
      radius: 0,
      scheme,
      side: BEAT_SIDE,
      frames: wave,
    },
  }))
);
art.push(...barBeat);
const working = [
  { file: join(STILLS, "tab-icon-working.png"), side: SIDE },
  ...[32, SIDE].map((side) => ({
    file: join(STRIPS, `working-${side}.png`),
    side,
  })),
];
await Promise.all([
  ...art.map(async ({ file, job }) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, await strip(job));
    console.log(file);
  }),
  ...working.map(async ({ file, side }) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, await plain(side));
    console.log(file);
  }),
]);

await browser.close();
