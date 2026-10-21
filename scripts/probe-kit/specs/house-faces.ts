/**
 * The house faces on every CawCo web surface (core house-faces.ts): the
 * dashboard, the canvas's chrome and a decision page each draw a character
 * Figtree holds and Google's latin subsets don't (→ U+2192, ≠ U+2260) in
 * Figtree, from the same woff2 pieces, never in another face. Read from the
 * engine: each glyph's width as drawn (a Range over it) against its width
 * on a canvas in Figtree alone and in the element's fallback stack alone,
 * as decision-pages' leg (l) measures; ✓, which Figtree lacks, is the
 * measure's control (Figtree first, then the fallback, draws it as the
 * fallback does).
 *
 *   bun scripts/probe-kit/run.ts house-faces
 *
 * 1. The dashboard: a session's transcript turn holding "A → B ≠ C" (the
 *    mock model's reply), on the built dashboard against a scratch fleet.
 * 2. The canvas's chrome: a stage host over the dashboard's own states, as
 *    canvas-design starts one, a story labelled "A → B ≠ C"; its label
 *    draws in the chrome's faces, which the stage serves at `/@cawco/faces/`.
 * 3. A decision page: a program whose option's label is "A → B ≠ C", on its
 *    artifact's own route.
 * 4. The fonts a dashboard first load takes, in a fresh browser context
 *    (nothing cached): its home and the transcript's session page, each
 *    face's bytes inlined in the stylesheet (woff2, decoded from the data
 *    URL) and fetched by URL (the body's bytes), as NOTE lines; and the
 *    house faces' pieces a first load fetches by URL on the home are none
 *    (their latin pieces are inlined).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one surface at a time, as a person opens them
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec } from "../kit";

const WORDS = "A → B ≠ C";
const GLYPHS = ["→", "≠"];
const DASHBOARD = join(ROOT, "apps/dashboard");
const STORY_FILE = ".cawco/probe/Glyphs.stories.ts";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? WORDS : "Probe title"],
});

/** How the first text node holding {@link WORDS} in `scope` draws each of {@link GLYPHS}. */
const glyphsIn = (scope: Page | Frame) =>
  scope.evaluate(
    async ({ words, glyphs }) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      // The words as drawn: a page's own program in a script holds them too.
      const drawnText = (node: Node) =>
        !!node.textContent?.includes(words) &&
        !node.parentElement?.closest("script, style, template, noscript") &&
        (node.parentElement?.getClientRects().length ?? 0) > 0;
      let text: Text | null = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (drawnText(node)) {
          text = node as Text;
          break;
        }
      }
      const element = text?.parentElement;
      if (!(text?.textContent && element)) {
        return null;
      }
      const style = getComputedStyle(element);
      const fallback = style.fontFamily
        .split(",")
        .map((name) => name.trim())
        .filter((name) => !name.includes("Figtree"))
        .join(", ");
      const lead = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}`;
      const context = document.createElement("canvas").getContext("2d");
      const width = (family: string, what: string) => {
        if (!context) {
          return -1;
        }
        context.font = `${lead} ${family}`;
        return Math.round(context.measureText(what).width * 100) / 100;
      };
      const drawn: {
        char: string;
        check: boolean;
        drawn: number;
        fallback: number;
        figtree: number;
      }[] = [];
      for (const char of glyphs) {
        await document.fonts.load(`${lead} "Figtree Variable"`, char);
        const range = document.createRange();
        const from = text.textContent.indexOf(char);
        range.setStart(text, from);
        range.setEnd(text, from + char.length);
        drawn.push({
          char,
          check: document.fonts.check(`${lead} "Figtree Variable"`, char),
          drawn: Math.round(range.getBoundingClientRect().width * 100) / 100,
          figtree: width('"Figtree Variable"', char),
          fallback: width(fallback, char),
        });
      }
      await document.fonts.ready;
      return {
        family: style.fontFamily,
        element: `${element.tagName.toLowerCase()}${element.dataset.slot ? `[data-slot=${element.dataset.slot}]` : ""}`,
        spacing:
          style.letterSpacing === "normal"
            ? 0
            : Number.parseFloat(style.letterSpacing),
        glyphs: drawn,
        control: {
          houseFirst: width(`"Figtree Variable", ${fallback}`, "✓"),
          fallback: width(fallback, "✓"),
        },
        faces: performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.endsWith(".woff2"))
          .map((name) => new URL(name).pathname),
      };
    },
    { words: WORDS, glyphs: GLYPHS }
  );

type GlyphRead = Awaited<ReturnType<typeof glyphsIn>>;

/** On `surface`: its words are set in Figtree, and each glyph is drawn at Figtree's width, not the fallback's. */
const drawsInFigtree = (kit: Kit, surface: string, read: GlyphRead) =>
  kit.check(
    `${surface}: "${WORDS}" is set in Figtree, and → and ≠ are drawn in Figtree: document.fonts.check holds, each glyph as drawn measures as Figtree's on a canvas and not as the fallback's, and the measure tells a glyph Figtree lacks (✓ falls through to the fallback)`,
    !!read &&
      read.family.startsWith('"Figtree Variable"') &&
      read.glyphs.every(
        (glyph) =>
          glyph.check &&
          Math.abs(glyph.drawn - glyph.figtree - read.spacing) < 0.5 &&
          Math.abs(glyph.figtree - glyph.fallback) > 0.5
      ) &&
      Math.abs(read.control.houseFirst - read.control.fallback) < 0.01,
    JSON.stringify(read)
  );

const DATA_FONT = /data:[^;,]*;base64,([A-Za-z0-9+/=]+)/;
const URL_IN_SRC = /url\(["']?([^"')]+)["']?\)/g;
const FONT_FILE = /\.(woff2?|ttf|otf)$/;
const QUOTES = /["']/g;

/** Every `@font-face` rule the page's own sheets hold, nested ones included, and every resource it fetched. */
const pageFonts = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const rules: { family: string; href: string; src: string }[] = [];
    const walk = (list: CSSRuleList, href: string) => {
      for (const rule of list) {
        if (rule instanceof CSSFontFaceRule) {
          rules.push({
            family: rule.style.getPropertyValue("font-family"),
            href,
            src: rule.style.getPropertyValue("src"),
          });
        } else if ("cssRules" in rule) {
          walk((rule as CSSGroupingRule).cssRules, href);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules, sheet.href ?? location.href);
      } catch {
        // Another origin's sheet: not the dashboard's.
      }
    }
    const resources = (
      performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    ).map((entry) => ({ name: entry.name, bytes: entry.encodedBodySize }));
    return { rules, resources };
  });

/**
 * The fonts the page took: each `@font-face` whose source is inlined in a
 * stylesheet (its woff2's bytes, decoded from the data URL), and each font
 * file fetched by URL (its body's bytes), each by its family.
 */
const fontBytes = async (page: Page) => {
  const { rules, resources } = await pageFonts(page);
  const inline: Record<string, number> = {};
  const byUrl = new Map<string, string>();
  for (const { family: quoted, href, src } of rules) {
    const family = quoted.replaceAll(QUOTES, "");
    const data = DATA_FONT.exec(src)?.[1];
    if (data) {
      const padding = data.endsWith("==") ? 2 : Number(data.endsWith("="));
      inline[family] = (inline[family] ?? 0) + (data.length * 3) / 4 - padding;
      continue;
    }
    for (const [, url] of src.matchAll(URL_IN_SRC)) {
      byUrl.set(new URL(url ?? "", href).href, family);
    }
  }
  const fetched: Record<string, number> = {};
  const files: string[] = [];
  for (const { name, bytes } of resources) {
    const path = new URL(name).pathname;
    if (FONT_FILE.test(path)) {
      const family = byUrl.get(name) ?? "unknown";
      fetched[family] = (fetched[family] ?? 0) + bytes;
      files.push(`${path} ${bytes}`);
    }
  }
  return { inline, fetched, files };
};

const HOUSE = /^(Figtree Variable|JetBrains Mono Variable)$/;

/** A first load of `url` in a context of its own: the fonts it took, as NOTE lines; the house faces' bytes. */
const firstLoad = async (
  kit: Kit,
  url: string,
  name: string,
  ready: string
) => {
  const page = await kit.page("desk", { theme: "light" });
  await open(page, url, ready);
  await page.waitForTimeout(1500);
  const read = await fontBytes(page);
  const sum = (by: Record<string, number>, ofHouse: boolean) =>
    Object.entries(by)
      .filter(([family]) => HOUSE.test(family) === ofHouse)
      .reduce((all, [, bytes]) => all + bytes, 0);
  const house = sum(read.inline, true) + sum(read.fetched, true);
  const other = sum(read.inline, false) + sum(read.fetched, false);
  kit.note(
    `4: ${name}: house faces ${house} B (inlined ${JSON.stringify(Object.fromEntries(Object.entries(read.inline).filter(([f]) => HOUSE.test(f))))}, fetched ${JSON.stringify(Object.fromEntries(Object.entries(read.fetched).filter(([f]) => HOUSE.test(f))))}); other faces ${other} B (inlined ${JSON.stringify(Object.fromEntries(Object.entries(read.inline).filter(([f]) => !HOUSE.test(f))))}, fetched ${JSON.stringify(Object.fromEntries(Object.entries(read.fetched).filter(([f]) => !HOUSE.test(f))))}); files ${read.files.join(", ")}`
  );
  await page.close();
  return read;
};

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** The stage host over the dashboard, as canvas-design starts it, with a story labelled {@link WORDS}. */
async function stageOf(): Promise<{ base: string; stop: () => void }> {
  mkdirSync(join(DASHBOARD, ".cawco/stage"), { recursive: true });
  mkdirSync(join(DASHBOARD, ".cawco/probe"), { recursive: true });
  writeFileSync(
    join(DASHBOARD, STORY_FILE),
    `import StatTile from "../../src/lib/cawco/StatTile.svelte";
export default { component: StatTile, args: { label: "Spend", value: "1.00" } };

/** ${WORDS} */
export const One = { args: {} };
`
  );
  writeFileSync(
    join(DASHBOARD, ".cawco/stage/host.mjs"),
    await buildStageHost()
  );
  const port = await freePort();
  const child: ChildProcess = spawn(
    "bun",
    [join(DASHBOARD, ".cawco/stage/host.mjs")],
    {
      cwd: DASHBOARD,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(port),
        CAWCO_STAGE_FRAMEWORK: "svelte",
        CAWCO_STAGE_KIT: "0",
        CAWCO_STAGE_TOOLCHAIN: "vite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  child.stdout?.on("data", hear);
  child.stderr?.on("data", hear);
  await until(
    "the stage's ready",
    () => words,
    (text) => text.includes('"cawco":"ready"'),
    90_000
  );
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => {
      child.kill("SIGTERM");
      rmSync(join(DASHBOARD, ".cawco/probe"), { recursive: true, force: true });
    },
  };
}

/** 2. The canvas's chrome draws the story's label in Figtree, from the stage's own faces. */
async function canvasLeg(kit: Kit): Promise<void> {
  const stage = await stageOf();
  try {
    const page = await kit.page("desk", { theme: "light" });
    await page.goto(
      `${stage.base}/@cawco/canvas?file=${encodeURIComponent(STORY_FILE)}&spec=${encodeURIComponent(JSON.stringify({ name: "Glyphs" }))}`,
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForFunction(
      (words) => document.body.textContent?.includes(words),
      WORDS,
      { timeout: 90_000 }
    );
    const read = await glyphsIn(page);
    drawsInFigtree(kit, "2: the canvas's chrome (a story's label)", read);
    kit.check(
      "2: the chrome's faces are the stage's own pieces, at /@cawco/faces/",
      !!read?.faces.some((path) => path.startsWith("/@cawco/faces/face-")),
      JSON.stringify(read?.faces)
    );
    await page.close();
  } finally {
    stage.stop();
  }
}

/** The page's frame (or the page) where an element holds {@link WORDS}. */
const holding = (page: Page) =>
  until(
    `a frame drawing "${WORDS}"`,
    async () => {
      for (const frame of page.frames()) {
        const has = await frame
          .evaluate(
            (words) => !!document.body?.innerText?.includes(words),
            WORDS
          )
          .catch(() => false);
        if (has) {
          return frame;
        }
      }
      return null;
    },
    Boolean,
    60_000
  );

const spec: Spec = {
  name: "house-faces",
  async run(kit) {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    const dir = join(fleet.sandbox, "glyphs");
    await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
    const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
      name: "Glyphs",
      machineId: MACHINE,
      cwd: dir,
      caw: false,
    });
    const session = await fleet.spawn("claude", "Glyphs", dir, { projectId });
    await fleet.send(session, "Say it");

    // 4. First loads, before anything else has warmed a cache.
    const home = await firstLoad(kit, `${base}/`, "the home", "body");
    const houseFetched = home.files.filter((file) => file.includes("/face-"));
    kit.check(
      "4: the home's first load fetches no house face by URL: their latin pieces are inlined in the stylesheet",
      houseFetched.length === 0 &&
        Object.keys(home.inline).filter((family) => HOUSE.test(family))
          .length === 2,
      JSON.stringify(home)
    );

    // 1. The transcript, on a first load of its session's page.
    const sessionUrl = `${base}/session/${session}`;
    const desk = await kit.page("desk", { theme: "light" });
    await open(desk, sessionUrl, '[data-slot="pane"]');
    await desk.waitForFunction(
      (words) => document.body.textContent?.includes(words),
      WORDS,
      { timeout: 60_000 }
    );
    drawsInFigtree(
      kit,
      "1: the dashboard (a transcript turn)",
      await glyphsIn(desk)
    );
    await desk.close();
    await firstLoad(
      kit,
      sessionUrl,
      "the transcript's session page",
      '[data-slot="pane"]'
    );

    // 3. A decision page whose option's label holds the words.
    const made = await fleet.api<{ id: string }>(
      `/api/instances/${session}/artifacts`,
      {
        kind: "page",
        name: "glyphs",
        does: "pick",
        ask: "Pick how the glyphs read",
        program: `root = Decisions("Glyphs", [order])
order = Decision("order", "Which order reads best?", [arrow, words], "The page draws the arrow.")
arrow = Option("arrow", "${WORDS}", "Drawn with the arrow.", true, [], "One glyph to learn.")
words = Option("words", "A to B, not C", "Drawn in words.", false, [], "Longer.")`,
      }
    );
    const pick = await kit.page("desk", { theme: "light" });
    await pick.goto(`${base}/artifact/${made.id}`, {
      waitUntil: "domcontentloaded",
    });
    const shown = await holding(pick);
    if (!shown) {
      throw new Error(`no frame of the decision page draws "${WORDS}"`);
    }
    const decision = await glyphsIn(shown);
    drawsInFigtree(kit, "3: a decision page (an option's label)", decision);
    kit.check(
      "3: the decision page's faces are the decision host's pieces, at /__cawco/decision/",
      !!decision?.faces.some((path) =>
        path.startsWith("/__cawco/decision/face-")
      ),
      JSON.stringify(decision?.faces)
    );
    await pick.close();

    // 2. The canvas's chrome, on a stage of its own.
    await canvasLeg(kit);
  },
};
export default spec;
