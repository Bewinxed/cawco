/**
 * The pairing decision page (apps/dashboard/src/lib/cawco/pairing/preview/
 * page.oui) drawn as the owner sees it, with no hub (decision-embeds.ts):
 * the hub's decision host around the program, and each Preview the pairing
 * sheet's component canvas (Pairing.stories.ts) drawn live by the
 * dashboard's own stage, `by=embed` with the stories its Preview names.
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * owner would:
 * 1. The program passes the hub's own check (`checkProgram`), and every
 *    card's lead opens "Recommended: <its recommended option>, because".
 * 2. There is one embed for each Preview, each naming the stories its
 *    Preview names.
 * 3. Each draws those stories and only those (decision-embeds.ts
 *    `embedDrawFaults`): every frame drawn with words or a drawing in it,
 *    its pixels its DOM's paint, nothing over it.
 * 4. No embed shows the canvas's working chrome, each is as tall as what it
 *    draws, and no console error.
 * 5. Every frame stands whole and centred in its embed (none scrolls
 *    sideways), and a card's embeds draw at one scale.
 * 6. A row of a moment's frames is stills: every frame held, nothing under
 *    it animating.
 * 7. The page's own capture, window by window as CawCo shows it
 *    (decision-embeds.ts `capturePage`), paints every embed. Each capture
 *    goes to .probe/decision-pages/ as tiles under 1 MiB, with a manifest.
 *
 *   bun scripts/probe-kit/run.ts web pairing-page
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  blankEmbeds,
  capturePage,
  EMBED_FRAME,
  type EmbedPaint,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, type Spec, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/pairing-page");
/** The page's own captures, tiled, and their manifest. */
const PAGES = join(ROOT, ".probe/decision-pages");
/** The published page this program is, as the hub names it (artifact d02dc1de…). */
const PAGE_ID = "d02dc1de";
const NAME = "pairing-page";
const DIR = "apps/dashboard/src/lib/cawco/pairing";
const FILE = "src/lib/cawco/pairing/Pairing.stories.ts";
const PROGRAM = readFileSync(join(ROOT, DIR, "preview/page.oui"), "utf8");
const PREVIEW = /Preview\("([0-9a-f-]+)", "[^"]*", \[([^\]]*)\]\)/g;
/** The canvas each Preview embeds, and the stories each names, as the program writes them. */
const previews = [...PROGRAM.matchAll(PREVIEW)].map((m) => ({
  id: m[1] as string,
  stories: (m[2] as string).split(",").map((one) => one.trim().slice(1, -1)),
}));
const CANVAS = previews[0]?.id ?? "";
/** Each card's lead (its `why`) and the label of the option it recommends. */
const DECISION =
  /^\w+ = Decision\("([a-z-]+)", "[^"]*", \[([^\]]*)\], "((?:[^"\\]|\\.)*)"/gm;
const OPTION = /^(\w+) = Option\("[a-z-]+", "([^"]*)", "[^"]*", (true|false)/gm;
const options = new Map(
  [...PROGRAM.matchAll(OPTION)].map((m) => [
    m[1] as string,
    { label: m[2] as string, recommended: m[3] === "true" },
  ])
);
const cards = [...PROGRAM.matchAll(DECISION)].map((m) => {
  const named = (m[2] as string).split(",").map((one) => one.trim());
  return {
    id: m[1] as string,
    lead: m[3] as string,
    recommended: named
      .map((one) => options.get(one))
      .find((one) => one?.recommended)?.label,
  };
});

/** A capture's tile stays under this: what a reviewer's reader opens. */
const TILE_BYTES = 1024 * 1024;

const key = (stories: readonly string[]) => stories.join(",");
/** The Previews' story lists, sorted: the page draws them in its own order. */
const WANTED = previews.map((one) => key(one.stories)).sort();

/** A whole capture's file name, and each tile's after it. */
const PNG_END = /\.png$/;
/** A moment's row read as "<at>: <n> held, <n> running": one held nothing or one still running. */
const NOT_STILL = / 0 held|[1-9]\d* running/;

type Embeds = Awaited<ReturnType<typeof readEmbeds>>["embeds"];
interface Capture {
  embeds: EmbedPaint[];
  height: number;
  theme: string;
  tiles: { bytes: number; file: string }[];
  viewport: { height: number; width: number };
}

/** One capture cut into tiles under TILE_BYTES, a window at a time, halved where a window is more: the tiles' files. */
function tiles(file: string, window: number): string[] {
  const png = PNG.sync.read(readFileSync(file));
  const written: string[] = [];
  const cut = (top: number, rows: number): void => {
    const tile = new PNG({ width: png.width, height: rows });
    PNG.bitblt(png, tile, 0, top, png.width, rows, 0, 0);
    const bytes = PNG.sync.write(tile, { colorType: 2 });
    if (bytes.length > TILE_BYTES && rows > 64) {
      const half = Math.ceil(rows / 2);
      cut(top, half);
      cut(top + half, rows - half);
      return;
    }
    const name = file.replace(
      PNG_END,
      `-${String(written.length + 1).padStart(2, "0")}.png`
    );
    writeFileSync(name, bytes);
    written.push(name);
  };
  for (let top = 0; top < png.height; top += window) {
    cut(top, Math.min(window, png.height - top));
  }
  rmSync(file);
  return written;
}

/** 1: the hub's check, and every lead opening on its recommendation and its reason. */
function checkLeads(kit: Kit): void {
  let refusal = "";
  try {
    checkProgram(PROGRAM);
  } catch (error) {
    refusal = (error as Error).message;
  }
  kit.check(
    `the hub's check keeps the program (${cards.length} cards, ${previews.length} Previews of one canvas)`,
    refusal === "" &&
      previews.length > 0 &&
      previews.every((one) => one.id === CANVAS),
    refusal
  );
  const unled = cards.filter(
    (one) =>
      !(
        one.recommended &&
        one.lead.startsWith(`Recommended: ${one.recommended}, because `)
      )
  );
  kit.check(
    `every card's lead opens "Recommended: <its option>, because" (${cards.map((one) => `${one.id}: ${one.recommended}`).join("; ")})`,
    cards.length > 0 && unled.length === 0,
    unled.map((one) => `${one.id}: "${one.lead.slice(0, 80)}"`).join("\n")
  );
}

/** 2 to 4: one embed a Preview, each drawing its stories, no chrome, as tall as it draws, no console error. */
function checkDrawn(
  kit: Kit,
  leg: string,
  embeds: Embeds,
  undrawn: string[],
  errors: string[]
): void {
  const seen = embeds
    .map((e) => {
      const url = new URL(e.src);
      return url.searchParams.get("by") === "embed"
        ? key(url.searchParams.getAll("story"))
        : `not an embed: ${e.src}`;
    })
    .sort();
  kit.check(
    `${leg}: one embed a Preview, each naming its Preview's stories (${embeds.length} of ${previews.length})`,
    key(seen) === key(WANTED),
    `seen ${seen.join(" | ")}\nwanted ${WANTED.join(" | ")}`
  );
  const faults = [...embeds.flatMap(embedDrawFaults), ...undrawn];
  kit.check(
    `${leg}: every embed draws its stories (${embeds.map((e) => `${e.shots.map((shot) => shot.story).join("+")}`).join("; ")})`,
    embeds.length === previews.length && faults.length === 0,
    faults.slice(0, 12).join("\n    ")
  );
  const chrome = embeds.flatMap((e) => e.chrome);
  const tall = embeds.filter((e) => Math.abs(e.box.h - e.tall) > 2);
  kit.check(
    `${leg}: no canvas chrome, every embed as tall as it draws, no console error`,
    chrome.length === 0 && tall.length === 0 && errors.length === 0,
    [
      ...chrome,
      ...tall.map((e) => `${e.caption}: ${e.box.h}px of ${e.tall}`),
      ...new Set(errors),
    ]
      .slice(0, 12)
      .join("\n    ")
  );
}

/** 5: every frame whole and centred in its embed, a card's embeds at one scale. */
async function checkFit(
  kit: Kit,
  page: Page,
  leg: string,
  embeds: Embeds
): Promise<void> {
  const cardOf = new Map(
    await page.$$eval(EMBED_FRAME, (frames) =>
      frames.map((frame) => [
        frame.closest("figure")?.querySelector("figcaption")?.textContent ?? "",
        frame.closest(".dp-card")?.id ?? "",
      ])
    )
  );
  const cut = embeds.flatMap((e) =>
    e.frames
      .filter(
        (f) =>
          f.wide ||
          f.left < 0 ||
          f.right > e.width ||
          Math.abs(f.left - (e.width - f.right)) > 1
      )
      .map(
        (f) =>
          `“${e.caption}” ${f.story}: ${f.left}–${f.right} in ${e.width}${f.wide ? ", scrolls sideways" : ""}`
      )
  );
  const scales = new Map<string, Set<number>>();
  for (const e of embeds) {
    const card = cardOf.get(e.caption) ?? "";
    const set = scales.get(card) ?? new Set<number>();
    for (const f of e.frames) {
      set.add(Math.round(f.zoom * 100) / 100);
    }
    scales.set(card, set);
  }
  const mixed = [...scales].filter(([, set]) => set.size > 1);
  kit.check(
    `${leg}: every frame whole and centred, one scale a card (${[...scales].map(([card, set]) => `${card.replace("decision-", "")} ${[...set].join("/")}`).join(", ")})`,
    cut.length === 0 && mixed.length === 0,
    [...cut, ...mixed.map(([card, set]) => `${card}: ${[...set].join(", ")}`)]
      .slice(0, 12)
      .join("\n    ")
  );
}

/** 6: each row of a moment's frames, read in its embed: every frame held, nothing under it running. */
async function checkStills(kit: Kit, page: Page, leg: string): Promise<void> {
  const rows: string[] = [];
  for (const handle of await page.$$(EMBED_FRAME)) {
    const frame = await handle.contentFrame();
    const read = frame
      ? await frame.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("[data-at]")].map(
            (el) =>
              `${el.dataset.at ?? ""}: ${Number(el.dataset.still ?? 0)} held, ${el.getAnimations({ subtree: true }).length} running`
          )
        )
      : [];
    if (read.length > 0) {
      const caption = await handle.evaluate(
        (el) =>
          el.closest("figure")?.querySelector("figcaption")?.textContent ?? ""
      );
      rows.push(`“${caption}” ${read.join(", ")}`);
    }
  }
  kit.check(
    `${leg}: every moment's frame a still, its runs held and none running (${rows.length} rows)`,
    rows.length > 0 && rows.every((one) => !NOT_STILL.test(one)),
    rows.join("\n    ")
  );
}

/** 7: the page's own capture, tiled under 1 MiB, every embed painted in it. */
async function capture(
  kit: Kit,
  page: Page,
  leg: string,
  theme: string
): Promise<Capture> {
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight
  );
  kit.note(`${leg}: the page stands ${height}px tall`);
  const whole = join(PAGES, `pairing-${viewport.width}-${theme}.png`);
  const paints = await capturePage(page, whole);
  const blank = blankEmbeds(paints);
  const scale = await page.evaluate(() => devicePixelRatio);
  const sizes = tiles(whole, viewport.height * scale).map((file) => ({
    file: relative(PAGES, file),
    bytes: readFileSync(file).length,
  }));
  kit.check(
    `${leg}: the page's own capture paints every embed, in ${sizes.length} tiles under 1 MiB (${paints.map((one) => `“${one.embed}” ${Math.round(one.flat * 1000) / 10}%`).join(", ")} its commonest colour)`,
    paints.length === previews.length &&
      blank.length === 0 &&
      sizes.every((one) => one.bytes < TILE_BYTES),
    [
      ...blank,
      ...sizes
        .filter((one) => one.bytes >= TILE_BYTES)
        .map((one) => `${one.file}: ${one.bytes} bytes`),
    ].join("\n    ")
  );
  return { theme, viewport, height, tiles: sizes, embeds: paints };
}

/** One leg: the page at a window and scheme, read and captured. */
async function drawLeg(
  kit: Kit,
  stage: Awaited<ReturnType<typeof startDecisionStage>>,
  view: "desk" | "phone",
  theme: (typeof THEMES)[number]
): Promise<Capture> {
  const named = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
  const page = await kit.page(view, { theme });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().slice(0, 240));
    }
  });
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 240)));
  await page.goto(stage.pageUrl(NAME, theme), { waitUntil: "load" });
  await page.waitForSelector(".dp-card", { timeout: 30_000 });
  await page.waitForFunction(
    ({ n, selector }) => document.querySelectorAll(selector).length === n,
    { n: previews.length, selector: EMBED_FRAME },
    { timeout: 60_000 }
  );
  const { embeds, undrawn } = await readEmbeds(
    page,
    theme,
    join(OUT, `${view}-${theme}`)
  );
  checkDrawn(kit, named, embeds, undrawn, errors);
  await checkFit(kit, page, named, embeds);
  await checkStills(kit, page, named);
  const taken = await capture(kit, page, named, theme);
  await page.close();
  return taken;
}

/** The manifest beside the tiles: the page, its program and canvas, the commit, each capture. */
function writeManifest(captures: Capture[]): void {
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", ...args], { cwd: ROOT })
      .stdout.toString()
      .trim();
  writeFileSync(
    join(PAGES, "manifest.json"),
    `${JSON.stringify(
      {
        page: PAGE_ID,
        title: "How the pairing screen behaves",
        program: {
          file: join(DIR, "preview/page.oui"),
          sha256: createHash("sha256").update(PROGRAM).digest("hex"),
        },
        canvas: { id: CANVAS, file: join("apps/dashboard", FILE) },
        commit: git("rev-parse", "HEAD"),
        dirty: git("status", "--porcelain") !== "",
        captured: new Date().toISOString(),
        captures,
      },
      null,
      2
    )}\n`
  );
}

const spec: Spec = {
  name: "pairing-page",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    rmSync(PAGES, { recursive: true, force: true });
    mkdirSync(PAGES, { recursive: true });
    checkLeads(kit);
    const captures: Capture[] = [];
    const stage = await startDecisionStage(new Map([[NAME, PROGRAM]]), {
      [CANVAS]: [FILE],
    });
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          captures.push(await drawLeg(kit, stage, view, theme));
        }
      }
    } finally {
      await stage.stop();
    }
    writeManifest(captures);
    kit.note(
      `captures: ${captures.flatMap((one) => one.tiles.map((tile) => tile.file)).join(", ")}, manifest.json, in ${relative(ROOT, PAGES)}`
    );
  },
};

export default spec;
