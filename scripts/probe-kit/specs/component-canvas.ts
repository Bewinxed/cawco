/**
 * The component canvas (component canvas §2–3): every story of a states
 * file drawn live as an instance of the real component, in every
 * interaction state its CSS reaches, with its flow moves, the agent's
 * edges and dials, sections loaded one states file at a time, and a render
 * report the stage keeps. Read from the engine (the fleet's rule 6), never
 * from pixels: the page's own report, computed styles, boxes,
 * `getAnimations()`, the module requests a page made.
 *
 * On four scratch projects (fixtures/component-canvas: a Svelte 5 one with
 * Tailwind 4, a React 19 one, a Vue 3 one and a Solid one), each installed
 * in `$TMPDIR` and served by the stage host as the daemon starts it, minus
 * the workspace boundary (Vue and Solid run legs 1, 2, 4 and 12, so each
 * framework's adapter, its `update` included, is run):
 *
 * 1. Every story is drawn as a live instance: each frame `drawn`, with the
 *    component chain its elements came from.
 * 2. Hover, focus and pressed columns stand only where the CSS has the
 *    rule (Button has all three, Badge none, React's Button no pressed),
 *    and a hover frame says its computed-style delta.
 * 3. The rewrite reaches nested `&:hover`, `@layer`, `@scope` and
 *    Tailwind's `hover:`, nothing left unforced.
 * 4. A flow move's animations are listed (Svelte's transitions, React's
 *    CSS transitions); its timeline scrubs the engine's own animations and
 *    a tuned duration goes to the artifact as `tuned`.
 * 5. A dial on `--radius` sets every frame's computed `border-radius`.
 * 6. A declared edge is drawn from just outside one frame's box to just
 *    outside the other's, standing on neither.
 * 7. A story with no doc comment is reported `unnamed`.
 * 8. Sections load one states file at a time: the far one's modules are
 *    requested only once the canvas is moved to it.
 * 9. The stage keeps the report: drawn by the panel, `unseen` once the
 *    states file changes, drawn again on the next load; and with a page
 *    open, an edit to the component alone (Badge.svelte, which Card
 *    imports) redraws both sections, every frame current again with the
 *    new text and no states file touched.
 * 10. A mount that throws is `failed`, with its message and its place in
 *     the source, mapped through Vite's sourcemap (the throw's own line, not
 *     the compiled one).
 * 11. At 1440 and 390, light and dark: both schemes drawn side by side; a
 *     phone shows one frame with its state strip, and a step plays the move;
 *     the phone's report says the frame it shows `drawn` and every other
 *     `unshown`, never `empty`; after it, the stage still keeps every frame
 *     drawn and the design map still counts them (an unshown frame keeps
 *     the desk's draw of the same content).
 * 12. No console errors (the throwing story's page aside).
 * 13. With no panel open, the daemon's render (stage-render.ts) draws the
 *     canvas in the machine's own Chromium through a bridge socket shaped
 *     as preview-bridge.ts makes it (socat, unix to the stage's port): the
 *     stage's report says `by: "stage"`, every frame drawn, the move read,
 *     and a frame's picture.
 * 14. A section on its way (a states file whose helper takes 4 s): opened
 *     alone, the band names the canvas once and draws no line under it (the
 *     ask is the panel head's alone; framed, the band says neither:
 *     canvas-design 8i);
 *     the section is named in words (its title's last part) in the title
 *     role over its file in meta ink, never link-styled; one status line
 *     ("Drawing 2 stories"), the column's head and a skeleton frame per
 *     story stand from the first, unseen until `--dur-wait-grace` (their
 *     `cawco-wait` delay,
 *     scrubbed through the DevTools Animation domain: transparent just
 *     before the grace, opaque past its fade); the frames land in the
 *     skeletons' cells, the first row on its skeleton's corner, and the
 *     skeletons go.
 *     At a desk and a phone, a states file deep in its project keeps its
 *     path on one row inside the section's head: its folders cut to an
 *     ellipsis, its own name whole, the whole path its title (14d).
 * 15. A section that didn't load (its helper throws): it says so where its
 *     frames would stand, named by its component, with the error and its
 *     place under Show details, and the report holds the page error; no
 *     skeleton or status line is left.
 * 16. A frame never silently draws at its floor (the owner's 24px approval
 *     card, "this just showed up, dafuq"): a story of a size container
 *     (`container-type: inline-size`) with no width of its own is reported
 *     failed, "drawn 24px wide: the story has no width of its own; give it a
 *     viewport or a width"; the same card with a phone viewport is drawn.
 * 17. The stage's sweep ends on a story whose animation loops forever
 *     (`infinite`, a working mark's breath): the probe cancels it rather
 *     than finishing it, so the hover frame is drawn with its delta; the
 *     loop is landed before the rest snapshot too, so that delta is the
 *     hover's background alone, no opacity read mid-breath.
 * 18. In Comment mode a canvas marks one thing, the element under the
 *     pointer: framed with the overlay, the overlay's one target over the
 *     button pointed at, and the frame in view's label no fill of its own
 *     (in Interact it says the frame is in view, in `selected-bg`).
 * 19. A request no page makes is no canvas's error: a component's `.riv`
 *     asked for as `?import&amp;url` is answered with its error, the stage
 *     keeps none for the canvas and sends none to its open page (no
 *     `[vite] Internal Server Error` in its console), and the canvas draws.
 *
 *   bun scripts/probe-kit/run.ts component-canvas
 *   bun scripts/probe-kit/run.ts component-canvas --leg comment-and-stray   # 18 and 19 alone
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { renderCanvas } from "../../../packages/agent/src/stage-render";
import {
  type CanvasSpec,
  type DesignMap,
  type FrameRender,
  type RenderReport,
  type StageError,
  unkeyedPath,
} from "../../../packages/core/src/stage";
import { shellWords } from "../../../packages/core/src/words/shell";
import { until } from "../../scratch-fleet";
import { embedOrigin } from "../decision-embeds";
import { type Kit, ROOT, type Spec } from "../kit";

const FIXTURES = join(ROOT, "scripts/probe-kit/fixtures/component-canvas");
const SCRATCH = join(process.env.TMPDIR ?? "/tmp", "component-canvas");

type Framework = "svelte" | "react" | "vue" | "solid";

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

interface Stage {
  base: string;
  dir: string;
  /** The problems the stage last told its daemon (its `errors` line), which each canvas's doc carries; null before its first. */
  errors: () => StageError[] | null;
  port: number;
  stop: () => void;
}

/** The fixture copied to scratch, installed once, and its stage started as the daemon starts one. */
async function stageOf(framework: Framework, host: string): Promise<Stage> {
  const dir = join(SCRATCH, framework);
  mkdirSync(dir, { recursive: true });
  cpSync(join(FIXTURES, framework), dir, { recursive: true });
  if (!existsSync(join(dir, "node_modules"))) {
    const install = Bun.spawnSync(["bun", "install"], { cwd: dir });
    if (install.exitCode !== 0) {
      throw new Error(
        `bun install in ${dir} failed: ${install.stderr.toString().slice(0, 400)}`
      );
    }
  }
  mkdirSync(join(dir, ".cawco/stage"), { recursive: true });
  writeFileSync(join(dir, ".cawco/stage/host.mjs"), host);
  const port = await freePort();
  const child: ChildProcess = spawn(
    "bun",
    [join(dir, ".cawco/stage/host.mjs")],
    {
      cwd: dir,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(port),
        CAWCO_STAGE_FRAMEWORK: framework,
        CAWCO_STAGE_KIT: "0",
        CAWCO_STAGE_TOOLCHAIN: "vite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let words = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  await until(
    "the stage's ready",
    () => words,
    (text) => text.includes('"cawco":"ready"'),
    60_000
  );
  return {
    base: `http://127.0.0.1:${port}`,
    dir,
    errors: () => {
      const said = words
        .split("\n")
        .filter((line) => line.startsWith('{"cawco":"errors"'))
        .at(-1);
      return said
        ? (JSON.parse(said) as { errors: StageError[] }).errors
        : null;
    },
    port,
    stop: () => child.kill("SIGTERM"),
  };
}

/** A canvas's address on a stage. */
const canvasUrl = (
  stage: Stage,
  files: string[],
  canvas: CanvasSpec = {},
  view = ""
) =>
  `${stage.base}/@cawco/canvas?${files.map((file) => `file=${encodeURIComponent(file)}`).join("&")}&spec=${encodeURIComponent(JSON.stringify(canvas))}${view}`;

/** What a panel's overlay gives a page (`window.cawco`), recorded: every `set` the canvas made. */
const BRIDGE = () => {
  const sets: [string, unknown][] = [];
  const page = window as unknown as {
    __sets: [string, unknown][];
    cawco: {
      on: () => () => void;
      set: (key: string, value: unknown) => Promise<void>;
    };
  };
  page.__sets = sets;
  page.cawco = {
    set: (key, value) => {
      sets.push([key, JSON.parse(JSON.stringify(value))]);
      return Promise.resolve();
    },
    on: () => () => undefined,
  };
};

/** The page's newest report once it has one with every loaded section drawn, after the page went quiet. */
async function reportOn(page: Page, settle = 1500): Promise<RenderReport> {
  await page.waitForFunction(
    () => {
      const state = (
        window as unknown as { __cawcoCanvas?: { report: RenderReport | null } }
      ).__cawcoCanvas;
      return !!state?.report && state.report.sections.length > 0;
    },
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(settle);
  return page.evaluate(
    () =>
      (window as unknown as { __cawcoCanvas: { report: RenderReport } })
        .__cawcoCanvas.report
  );
}

const framesOf = (report: RenderReport, file?: string): FrameRender[] =>
  report.sections
    .filter((one) => !file || one.file === file)
    .flatMap((one) => one.frames);

const said = (frames: FrameRender[]) =>
  frames
    .map(
      (one) =>
        `${one.story}/${one.interaction}/${one.scheme} ${one.state} ${one.box.w}×${one.box.h} [${one.parts.map((part) => part.name).join(",")}]`
    )
    .join("; ");

/** Console errors a page logged, kept as it runs. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().split("\n")[0] ?? "");
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** A timeline clip's duration key in DialKit's store: `<clip>.duration`. */
const DURATION_KEY = /\.duration$/;

const KIT_SPEC: CanvasSpec = {
  name: "Kit",
  dials: [
    {
      name: "radius",
      label: "Radius",
      kind: "number",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      target: { cssVar: "--radius" },
    },
  ],
  edges: [
    {
      from: "src/Button.stories.js:Primary",
      to: "src/Button.stories.js:Quiet",
      label: "calmer",
    },
  ],
};
const KIT_FILES = [
  "src/Button.stories.js",
  "src/Card.stories.js",
  "src/Badge.stories.js",
  "src/Pairing.stories.js",
];

/** Legs 1–7, 11 and 12 on the Svelte kit canvas at desk. */
async function svelteKit(kit: Kit, stage: Stage): Promise<void> {
  const page = await kit.page("desk", { init: [BRIDGE] });
  const errors = errorsOf(page);
  await page.goto(canvasUrl(stage, KIT_FILES, KIT_SPEC));
  const report = await reportOn(page, 2500);
  const all = framesOf(report);

  kit.check(
    "1: every story is drawn as a live instance, each frame with the component chain it drew",
    all.length >= 12 &&
      all.every((one) => one.state === "drawn" && one.parts.length > 0),
    `${all.length} frames: ${said(all)}`
  );

  const columns = (file: string, story: string) =>
    framesOf(report, file)
      .filter((one) => one.story === story)
      .map((one) => one.interaction)
      .sort()
      .join(",");
  const hover = framesOf(report, "src/Button.stories.js").find(
    (one) => one.story === "Primary" && one.interaction === "hover"
  );
  kit.check(
    "2: hover, focus and pressed stand only where the CSS has the rule, and the hover frame says its delta",
    columns("src/Button.stories.js", "Primary") ===
      "focus,hover,pressed,rest" &&
      columns("src/Badge.stories.js", "Fresh") === "rest" &&
      !!hover?.delta?.changed.some(
        (one) =>
          one.selector === "button.btn" && one.changed["background-color"]
      ) &&
      !!hover?.delta?.animations.some(
        (one) => one.property === "background-color" && one.duration === 160
      ),
    `Button Primary: ${columns("src/Button.stories.js", "Primary")}; Badge Fresh: ${columns("src/Badge.stories.js", "Fresh")}; hover delta ${JSON.stringify(hover?.delta)}`
  );

  const card = framesOf(report, "src/Card.stories.js").find(
    (one) => one.interaction === "hover"
  );
  const changed = (selector: string, property: string) =>
    !!card?.delta?.changed.some(
      (one) => one.selector.startsWith(selector) && one.changed[property]
    );
  const unforced = report.sections.flatMap((one) => one.notForced);
  kit.check(
    "3: nested &:hover, @layer, @scope and Tailwind's hover: all rewrite, nothing left unforced",
    changed("article.card", "border-top-color") &&
      changed("p.chip", "background-color") &&
      changed("p.chip", "color") &&
      changed("p.chip", "text-decoration-line") &&
      unforced.length === 0,
    `card hover delta: ${card?.delta?.changed.map((one) => `${one.selector} ${Object.keys(one.changed).join("+")}`).join("; ")}; not forced: ${JSON.stringify(unforced)}`
  );

  const move = report.sections.find(
    (one) => one.file === "src/Pairing.stories.js"
  )?.moves[0];
  const fired = (property: string, duration: number) =>
    !!move?.animations.some(
      (one) => one.property === property && one.duration === duration
    );
  kit.check(
    "4a: the Pairing move's animations are listed: the code's fade out and the face's scale in",
    move?.from === "Waiting" &&
      move.to === "Approved" &&
      !move.error &&
      fired("opacity", 240) &&
      fired("transform opacity", 320),
    JSON.stringify(move)
  );

  // The move's timeline: open it, seek, tune.
  await page.click('text[data-cawco-move="src/Pairing.stories.js|Approved"]');
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          DialKit?: { TimelineStore: { getTimelines: () => unknown[] } };
        }
      ).DialKit?.TimelineStore.getTimelines().length === 1,
    null,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(800);
  const scrub = await page.evaluate(() => {
    const dialKit = (
      window as unknown as {
        DialKit: {
          TimelineStore: {
            getTimelines: () => { id: string }[];
            seek: (id: string, t: number) => void;
          };
          DialStore: {
            getValues: (id: string) => Record<string, unknown>;
            updateValues: (id: string, v: Record<string, unknown>) => void;
          };
        };
      }
    ).DialKit;
    const id = dialKit.TimelineStore.getTimelines()[0]?.id as string;
    const paused = document
      .getAnimations()
      .filter((one) => one.playState === "paused");
    dialKit.TimelineStore.seek(id, 0.16);
    return {
      id,
      keys: Object.keys(dialKit.DialStore.getValues(id)),
      paused: paused.length,
    };
  });
  await page.waitForTimeout(300);
  const seeked = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((one) => one.playState === "paused")
      .map((one) => Math.round(Number(one.currentTime)))
  );
  // The face's clip: its element stands after the move, so its replay previews (the code's fade is an outro, gone with its element).
  const clip =
    scrub.keys
      .find((one) => one.endsWith(".duration") && one.includes("face"))
      ?.replace(DURATION_KEY, "") ?? "";
  await page.evaluate(
    ({ id, clip: key }) => {
      const dialKit = (
        window as unknown as {
          DialKit: {
            DialStore: {
              updateValues: (id: string, v: Record<string, unknown>) => void;
            };
          };
        }
      ).DialKit;
      dialKit.DialStore.updateValues(id, { [`${key}.duration`]: 0.6 });
    },
    { id: scrub.id, clip }
  );
  await page.waitForTimeout(1200);
  const tuned = await page.evaluate(() => {
    const sets = (window as unknown as { __sets: [string, unknown][] }).__sets;
    return {
      tuned: sets.filter(([key]) => key === "tuned").at(-1)?.[1] as
        { animation: string; duration: number; move: string }[] | undefined,
      durations: document
        .getAnimations()
        .filter((one) => one.playState === "paused")
        .map((one) => Number(one.effect?.getTiming().duration)),
    };
  });
  kit.check(
    "4b: the move's timeline scrubs the engine's own animations, and a tuned duration previews on them and goes to the artifact as tuned",
    scrub.paused > 0 &&
      seeked.includes(160) &&
      tuned.durations.includes(600) &&
      !!tuned.tuned?.some(
        (one) => one.duration === 600 && one.move === "Waiting → Approved"
      ),
    `timeline ${scrub.id}: ${scrub.paused} paused replays, seeked to ${JSON.stringify(seeked)} ms; durations after tuning ${JSON.stringify(tuned.durations)}; tuned ${JSON.stringify(tuned.tuned)}`
  );

  // The radius dial.
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          DialKit?: {
            DialStore: { getValues: (id: string) => Record<string, unknown> };
          };
        }
      ).DialKit?.DialStore.getValues("cawco-dials")?.radius !== undefined,
    null,
    { timeout: 15_000 }
  );
  await page.evaluate(() => {
    (
      window as unknown as {
        DialKit: {
          DialStore: {
            updateValues: (id: string, v: Record<string, unknown>) => void;
          };
        };
      }
    ).DialKit.DialStore.updateValues("cawco-dials", { radius: 20 });
  });
  await page.waitForTimeout(800);
  const radii = await page.evaluate(() =>
    [...document.querySelectorAll(".cawco-world .cawco-frame-body")].map(
      (body) => {
        const shaped = body.querySelector(".btn, .badge, .card, .qr, .face");
        return shaped ? getComputedStyle(shaped).borderTopLeftRadius : "none";
      }
    )
  );
  const dialSet = await page.evaluate(
    () =>
      (window as unknown as { __sets: [string, unknown][] }).__sets
        .filter(([key]) => key === "dials")
        .at(-1)?.[1]
  );
  kit.check(
    "5: a dial on --radius sets every frame's computed border-radius, and its value goes to the artifact",
    radii.length >= 12 &&
      radii.filter((one) => one !== "none").every((one) => one === "20px") &&
      JSON.stringify(dialSet) === JSON.stringify({ radius: 20 }),
    `${radii.length} frames' radius: ${[...new Set(radii)].join(", ")}; dials set ${JSON.stringify(dialSet)}`
  );

  // The agent's edge.
  const edge = await page.evaluate(() => {
    const path = document.querySelector<SVGPathElement>(".cawco-edge-edge");
    if (!path) {
      return null;
    }
    const length = path.getTotalLength();
    const start = path.getPointAtLength(0);
    const end = path.getPointAtLength(length);
    const svg = path.ownerSVGElement?.getBoundingClientRect();
    const { z } = (
      window as unknown as { __cawcoCanvas: { world: () => { z: number } } }
    ).__cawcoCanvas.world();
    const box = (key: string) =>
      document
        .querySelector(`[data-cawco-key="${CSS.escape(key)}"]`)
        ?.getBoundingClientRect();
    const from = box(path.dataset.cawcoFrom ?? "");
    const to = box(path.dataset.cawcoTo ?? "");
    const at = (point: DOMPoint) => ({
      x: (svg?.x ?? 0) + point.x * z,
      y: (svg?.y ?? 0) + point.y * z,
    });
    return {
      from: path.dataset.cawcoFrom,
      to: path.dataset.cawcoTo,
      start: at(start),
      end: at(end),
      fromBox: from?.toJSON(),
      toBox: to?.toJSON(),
    };
  });
  // Each end stands just clear of its frame's left side (runtime.ts
  // `EDGE_CLEAR`, 4px at zoom 1), level with the frame, never on it: a
  // frame's picture holds none of the canvas's lines.
  const besideLeft = (
    point: { x: number; y: number } | undefined,
    box: DOMRect | undefined
  ) =>
    !!point &&
    !!box &&
    point.x <= box.x - 1 &&
    point.x >= box.x - 8 &&
    point.y >= box.y &&
    point.y <= box.y + box.height;
  kit.check(
    "6: the declared edge is drawn from just outside Primary's frame box to just outside Quiet's, standing on neither",
    !!edge &&
      edge.from?.includes("|Primary|rest") === true &&
      edge.to?.includes("|Quiet|rest") === true &&
      besideLeft(edge.start, edge.fromBox as DOMRect) &&
      besideLeft(edge.end, edge.toBox as DOMRect),
    JSON.stringify(edge)
  );

  const unnamedLabel = await page
    .locator(
      '.cawco-frame[data-cawco-story="Ghost"] .cawco-frame-label[data-cawco-unnamed]'
    )
    .count();
  kit.check(
    "7: the story with no doc comment is reported unnamed, and its frame says so",
    report.unnamed.includes("src/Button.stories.js:Ghost") &&
      report.unnamed.length === 1 &&
      unnamedLabel > 0,
    `unnamed ${JSON.stringify(report.unnamed)}; marked frames ${unnamedLabel}`
  );

  // Both schemes side by side.
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("cawco:canvas-view", { detail: { scheme: "both" } })
    )
  );
  const both = await reportOn(page, 2500);
  const button = framesOf(both, "src/Button.stories.js").filter(
    (one) => one.story === "Primary" && one.interaction === "rest"
  );
  const grounds = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.cawco-frame[data-cawco-story="Primary"][data-cawco-interaction="rest"] .cawco-frame-body'
      ),
    ].map(
      (body) =>
        `${getComputedStyle(body).colorScheme} ${getComputedStyle(body).backgroundColor}`
    )
  );
  kit.check(
    "11a: light and dark side by side: each story drawn in both schemes, each on its scheme's own ground",
    button.length === 2 &&
      button.some((one) => one.scheme === "dark" && one.state === "drawn") &&
      button.some((one) => one.scheme === "light" && one.state === "drawn") &&
      new Set(grounds).size === 2,
    `Primary rest: ${said(button)}; grounds ${JSON.stringify(grounds)}`
  );
  kit.check(
    "12a: no console errors on the kit canvas",
    errors.length === 0,
    errors.join(" | ") || "none"
  );
  await page.close();
}

/** Leg 11 at 390 and in dark. */
async function views(kit: Kit, stage: Stage): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one theme's pages at a time
    const desk = await kit.page("desk", { init: [BRIDGE], theme });
    const deskErrors = errorsOf(desk);
    await desk.goto(canvasUrl(stage, KIT_FILES, KIT_SPEC));
    await reportOn(desk, 2500);
    await desk.click('text[data-cawco-move="src/Pairing.stories.js|Approved"]');
    await desk.waitForTimeout(1500);
    if (theme === "dark") {
      const scheme = await desk.evaluate(
        () =>
          getComputedStyle(
            document.querySelector(".cawco-world .cawco-frame-body") as Element
          ).colorScheme
      );
      kit.check(
        "11b: on a dark page the frames draw dark",
        scheme === "dark",
        scheme
      );
    }
    kit.check(
      `12b: no console errors at desk, ${theme}`,
      deskErrors.length === 0,
      deskErrors.join(" | ") || "none"
    );
    await desk.close();

    const phone = await kit.page("phone", { init: [BRIDGE], theme });
    const phoneErrors = errorsOf(phone);
    await phone.goto(
      canvasUrl(stage, ["src/Pairing.stories.js"], {
        name: "Pairing",
      })
    );
    const phoneReport = await reportOn(phone, 2000);
    const states = framesOf(phoneReport).map(
      (one) => `${one.story}/${one.interaction}:${one.state}`
    );
    kit.check(
      `11d: at 390 (${theme}) the frame on screen reports drawn and every frame the phone does not show reports unshown, none empty (the plan-view builder: "reads like a failure")`,
      states.filter((one) => one.endsWith(":drawn")).length === 1 &&
        states.some((one) => one.endsWith(":unshown")) &&
        states.every(
          (one) => one.endsWith(":drawn") || one.endsWith(":unshown")
        ),
      states.join(", ")
    );
    // What the stage keeps and the design map counts after the phone looked: the desk's draw of the same content still stands.
    const stageKept = (await (
      await fetch(
        `${stage.base}/__cawco/report?file=${encodeURIComponent("src/Pairing.stories.js")}`
      )
    ).json()) as RenderReport;
    const mapped = (await (
      await fetch(
        `${stage.base}/__cawco/components?component=${encodeURIComponent("src/Pairing.svelte")}`
      )
    ).json()) as DesignMap;
    const [card] = mapped.components;
    const keptStates = framesOf(stageKept).map(
      (one) => `${one.story}/${one.interaction}:${one.state}`
    );
    kit.check(
      `11e: after the 390 view (${theme}) the stage still keeps every Pairing frame drawn and the design map still counts them drawn (an unshown frame keeps the desk's draw of the same content)`,
      keptStates.length > 0 &&
        keptStates.every((one) => one.endsWith(":drawn")) &&
        card?.drawn === keptStates.length &&
        (card?.stories ?? []).every((one) => one.drawn),
      `kept ${keptStates.join(", ")}; design map ${card?.name} drawn ${card?.drawn}, stories ${JSON.stringify(card?.stories?.map((one) => `${one.name}:${one.drawn}`))}`
    );
    const shown = await phone.evaluate(() => ({
      phone: document.documentElement.hasAttribute("data-cawco-phone"),
      visible: [
        ...document.querySelectorAll<HTMLElement>(".cawco-world .cawco-frame"),
      ]
        .filter((one) => getComputedStyle(one).display !== "none")
        .map((one) => one.dataset.cawcoStory),
      strip: !!document
        .getElementById("cawco-chrome")
        ?.shadowRoot?.querySelector(".strip select"),
    }));
    const next = phone.locator("#cawco-chrome .steps button", {
      hasText: "Approved",
    });
    await next.click();
    await phone.waitForTimeout(1800);
    const after = await phone.evaluate(() => ({
      visible: [
        ...document.querySelectorAll<HTMLElement>(".cawco-world .cawco-frame"),
      ]
        .filter((one) => getComputedStyle(one).display !== "none")
        .map((one) => one.dataset.cawcoStory),
      timelines:
        (
          window as unknown as {
            DialKit?: { TimelineStore: { getTimelines: () => unknown[] } };
          }
        ).DialKit?.TimelineStore.getTimelines().length ?? 0,
    }));
    kit.check(
      `11c: at 390 (${theme}) one frame stands with its state strip, and the step to the next story plays the move`,
      shown.phone &&
        shown.visible.length === 1 &&
        shown.visible[0] === "Waiting" &&
        shown.strip &&
        after.visible.length === 1 &&
        after.visible[0] === "Approved" &&
        after.timelines === 1,
      `before ${JSON.stringify(shown)}; after ${JSON.stringify(after)}`
    );
    kit.check(
      `12c: no console errors at 390, ${theme}`,
      phoneErrors.length === 0,
      phoneErrors.join(" | ") || "none"
    );
    await phone.close();
  }
}

/** Leg 8: sections one states file at a time. */
async function lazy(kit: Kit, stage: Stage): Promise<void> {
  const page = await kit.page("desk", { init: [BRIDGE] });
  const errors = errorsOf(page);
  await page.goto(
    canvasUrl(stage, ["src/Tall.stories.js", "src/Far.stories.js"], {
      name: "Screens",
    })
  );
  await reportOn(page, 1500);
  // The page asks for each module at the stage's generation
  // (`/@cawco/m/<key>/src/Far.svelte`): read by its own address.
  const requested = async () => {
    const seen = await page.evaluate(() => ({
      paths: performance
        .getEntriesByType("resource")
        .map((entry) => new URL(entry.name).pathname),
      loaded: (
        window as unknown as { __cawcoCanvas: { loaded: () => string[] } }
      ).__cawcoCanvas.loaded(),
    }));
    const modules = seen.paths
      .map(unkeyedPath)
      .filter(
        (path) => path.startsWith("/src/") || path.includes("cawco:sheet")
      );
    return {
      modules: modules.length,
      far: modules.filter(
        (path) => path.includes("Far") || path.includes("/far/")
      ),
      loaded: seen.loaded,
    };
  };
  const before = await requested();
  await page.mouse.move(720, 520);
  for (let at = 0; at < 6; at += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one wheel at a time, as a hand moves
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
  }
  await page
    .waitForFunction(
      () =>
        (
          window as unknown as { __cawcoCanvas: { loaded: () => string[] } }
        ).__cawcoCanvas
          .loaded()
          .includes("src/Far.stories.js"),
      null,
      { timeout: 15_000 }
    )
    .catch(() => undefined);
  await page.waitForTimeout(800);
  const after = await requested();
  kit.check(
    "8: sections load one states file at a time: the far section's modules are requested only once the canvas moves to it",
    before.far.length === 0 &&
      !before.loaded.includes("src/Far.stories.js") &&
      after.loaded.includes("src/Far.stories.js") &&
      after.far.length >= 5 &&
      after.modules > before.modules,
    `before: ${before.modules} modules, loaded ${JSON.stringify(before.loaded)}, far ${JSON.stringify(before.far)}; after: ${after.modules} modules, loaded ${JSON.stringify(after.loaded)}, far ${JSON.stringify(after.far)}`
  );
  kit.check(
    "12d: no console errors on the long canvas",
    errors.length === 0,
    errors.join(" | ") || "none"
  );
  await page.close();
}

/** Legs 9 and 10: the stage's report, and a mount that throws. */
async function kept(kit: Kit, stage: Stage): Promise<void> {
  const read = async (states: string): Promise<RenderReport> =>
    (
      await fetch(
        `${stage.base}/__cawco/report?file=${encodeURIComponent(states)}`
      )
    ).json() as Promise<RenderReport>;
  const page = await kit.page("desk", { init: [BRIDGE] });
  await page.goto(
    canvasUrl(stage, ["src/Badge.stories.js"], {
      name: "Badge",
    })
  );
  await reportOn(page);
  await page.close();
  const drawn = await read("src/Badge.stories.js");
  const file = join(stage.dir, "src/Badge.stories.js");
  const was = readFileSync(file, "utf8");
  writeFileSync(
    file,
    `${was}\n/** An old item's mark. */\nexport const Old = { args: { text: "Old" } };\n`
  );
  await Bun.sleep(300);
  const edited = await read("src/Badge.stories.js");
  const again = await kit.page("desk", { init: [BRIDGE] });
  await again.goto(
    canvasUrl(stage, ["src/Badge.stories.js"], {
      name: "Badge",
    })
  );
  await reportOn(again);
  await again.close();
  const redrawn = await read("src/Badge.stories.js");
  writeFileSync(file, was);
  const storiesOf = (drawnNow: RenderReport) =>
    framesOf(drawnNow)
      .map((one) => `${one.story}:${one.state}`)
      .join(",");
  kit.check(
    "9: the stage keeps the report: drawn by the panel, every frame unseen once the states file changed, drawn again on the next load",
    drawn.by === "panel" &&
      storiesOf(drawn) === "Fresh:drawn" &&
      framesOf(edited).every((one) => one.state === "unseen") &&
      storiesOf(redrawn) === "Fresh:drawn,Old:drawn",
    `drawn ${storiesOf(drawn)}; edited ${storiesOf(edited)}; redrawn ${storiesOf(redrawn)}`
  );

  // 9b: only the component changes; the states files are never touched.
  const sheets = ["src/Badge.stories.js", "src/Card.stories.js"];
  const readAll = async (): Promise<RenderReport> =>
    (
      await fetch(
        `${stage.base}/__cawco/report?${sheets.map((one) => `file=${encodeURIComponent(one)}`).join("&")}`
      )
    ).json() as Promise<RenderReport>;
  const live = await kit.page("desk", { init: [BRIDGE] });
  await live.goto(canvasUrl(stage, sheets, { name: "Badge and Card" }));
  await reportOn(live);
  const statesTimes = () =>
    sheets.map((one) => statSync(join(stage.dir, one)).mtimeMs).join(",");
  const timesBefore = statesTimes();
  const component = join(stage.dir, "src/Badge.svelte");
  const plain = readFileSync(component, "utf8");
  writeFileSync(component, plain.replace("{text}</span>", "{text}+</span>"));
  // Current: every frame drawn, each showing the edited badge ("New+" in Badge's, "Live+" in Card's).
  const current = (report: RenderReport) =>
    framesOf(report).length > 0 &&
    framesOf(report).every((one) => one.state === "drawn") &&
    framesOf(report, "src/Badge.stories.js").every((one) =>
      one.text.includes("New+")
    ) &&
    framesOf(report, "src/Card.stories.js").every((one) =>
      one.text.includes("Live+")
    );
  let stageNow = await readAll();
  stageNow = await until(
    "the stage's report of the edited component",
    readAll,
    current,
    15_000
  ).catch(() => stageNow);
  const pageNow = await live.evaluate(
    () =>
      (window as unknown as { __cawcoCanvas: { report: RenderReport } })
        .__cawcoCanvas.report
  );
  writeFileSync(component, plain);
  await live.waitForTimeout(1500);
  await live.close();
  const hashes = (report: RenderReport) =>
    report.sections.map((one) => `${one.file}@${one.hash}`).join(",");
  const framesSaid = (report: RenderReport) =>
    framesOf(report)
      .map(
        (one) => `${one.story}/${one.interaction}:${one.state} "${one.text}"`
      )
      .join("; ");
  kit.check(
    "9b: an edit to the component alone (Badge.svelte, which Card imports) redraws both sections and every frame reads current with the new text, the page's hash the stage's, no states file touched",
    current(stageNow) &&
      hashes(stageNow) === hashes(pageNow) &&
      statesTimes() === timesBefore,
    `stage ${framesSaid(stageNow)}; stage hashes ${hashes(stageNow)}; page hashes ${hashes(pageNow)}; states files ${statesTimes() === timesBefore ? "untouched" : "touched"}`
  );

  const broken = await kit.page("desk", { init: [BRIDGE] });
  await broken.goto(
    canvasUrl(stage, ["src/Throws.stories.js"], {
      name: "Throws",
    })
  );
  const [onPage] = framesOf(await reportOn(broken));
  // What the tools answer: the stage's kept report, its place mapped through Vite's sourcemap to the line the component writes.
  const [frame] = framesOf(await read("src/Throws.stories.js"));
  kit.check(
    "10: a mount that throws is failed, with its message and its place in the source (Throws.svelte:4:11, the throw's `new Error`), not the compiled line",
    frame?.state === "failed" &&
      frame.error?.message === "boom" &&
      frame.error.file === "src/Throws.svelte" &&
      frame.error.line === 4 &&
      frame.error.column === 11,
    `kept ${JSON.stringify(frame?.error)}; as the page said it ${JSON.stringify(onPage?.error)}`
  );
  await broken.close();
}

/** A token's computed values, read off an element that takes it: font for a type role, colour for an ink. */
const tokenStyle = (page: Page, font: string, color: string) =>
  page.evaluate(
    ([type, ink]) => {
      const probe = document.createElement("span");
      probe.style.font = `var(${type})`;
      probe.style.color = `var(${ink})`;
      document.body.append(probe);
      const read = getComputedStyle(probe);
      const resolved = {
        size: read.fontSize,
        weight: read.fontWeight,
        family: read.fontFamily,
        color: read.color,
      };
      probe.remove();
      return resolved;
    },
    [font, color]
  );

/** An element's own type and ink, as leg 14 compares them to the tokens'. */
const ownStyle = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const read = getComputedStyle(el);
      return {
        size: read.fontSize,
        weight: read.fontWeight,
        family: read.fontFamily,
        color: read.color,
        decoration: read.textDecorationLine,
        tag: el.tagName,
      };
    });

/** Where each stand-in or each rest frame stands, in story order: its grid cell and its box's corner from its grid's (the world moves as the head settles; a place in the grid does not). */
const placesOf = (page: Page, selector: string) =>
  page.evaluate(
    (wanted) =>
      [...document.querySelectorAll<HTMLElement>(wanted)]
        .map((el) => {
          const box = el.getBoundingClientRect();
          const grid = (
            el.parentElement as HTMLElement
          ).getBoundingClientRect();
          return {
            cell: `${el.style.gridRow}/${el.style.gridColumn}`,
            x: Math.round(box.x - grid.x),
            y: Math.round(box.y - grid.y),
          };
        })
        .sort((a, b) => a.cell.localeCompare(b.cell)),
    selector
  );

/** Legs 14 and 15: a section on its way, and one that didn't load. */
async function waiting(kit: Kit, stage: Stage): Promise<void> {
  const page = await kit.page("desk", { init: [BRIDGE] });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  const started: { id: string; name: string }[] = [];
  cdp.on("Animation.animationStarted", ({ animation }) => {
    started.push({ id: animation.id, name: animation.name });
  });
  const spec = { name: "Waiting canvas" };
  await page.goto(canvasUrl(stage, ["src/Slow.stories.js"], spec), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".cawco-section-status", { state: "attached" });
  const seen = await page.evaluate(() => ({
    band:
      document
        .getElementById("cawco-chrome")
        ?.shadowRoot?.querySelector(".band")?.textContent ?? "",
    lines:
      document
        .getElementById("cawco-chrome")
        ?.shadowRoot?.querySelectorAll(".band > div:not(.name, .crumb, .tools)")
        .length ?? -1,
    page: `${document.body.innerText}\n${document.getElementById("cawco-chrome")?.shadowRoot?.textContent ?? ""}`,
    title: document.querySelector(".cawco-section-title")?.textContent,
    file: document.querySelector(".cawco-section-file")?.textContent,
    status: document.querySelector(".cawco-section-status")?.textContent,
    standIns: document.querySelectorAll(".cawco-stand-in").length,
    frames: document.querySelectorAll(".cawco-world .cawco-frame").length,
  }));
  const [title, titleWant, file, fileWant] = await Promise.all([
    ownStyle(page, ".cawco-section-title"),
    tokenStyle(page, "--type-title", "--ink-strong"),
    ownStyle(page, ".cawco-section-file"),
    tokenStyle(page, "--type-meta", "--ink-muted"),
  ]);
  const same = (
    own: Awaited<ReturnType<typeof ownStyle>>,
    want: Awaited<ReturnType<typeof tokenStyle>>
  ) =>
    own.size === want.size &&
    own.weight === want.weight &&
    own.family === want.family &&
    own.color === want.color &&
    own.decoration === "none" &&
    own.tag !== "A";
  kit.check(
    "14a: alone (not framed), the band names the canvas once and draws no line under it, nothing else naming it; the section is named in words in the title role over its file in meta ink, never link-styled, and no text holds a route",
    seen.band.includes(spec.name) &&
      seen.lines === 0 &&
      seen.page.split(spec.name).length - 1 === 1 &&
      seen.title === "Late badge" &&
      seen.file === "src/Slow.stories.js" &&
      same(title, titleWant) &&
      same(file, fileWant) &&
      !seen.page.includes("/@cawco/"),
    `band ${JSON.stringify(seen.band)}; head ${JSON.stringify(seen.title)} ${JSON.stringify(title)} (title role ${JSON.stringify(titleWant)}) over ${JSON.stringify(seen.file)} ${JSON.stringify(file)} (meta ${JSON.stringify(fileWant)})`
  );

  // The wait's grace and fade, as the page's tokens resolve them.
  const ms = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.transitionDuration = "var(--dur-wait-grace), var(--dur-fade)";
    document.body.append(probe);
    const [grace, fade] = getComputedStyle(probe)
      .transitionDuration.split(",")
      .map((one) => Number.parseFloat(one) * 1000);
    probe.remove();
    return { grace: grace ?? 0, fade: fade ?? 0 };
  });
  const timings = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((one) => (one as CSSAnimation).animationName === "cawco-wait")
      .map((one) => {
        const timing = one.effect?.getTiming();
        return {
          on: ((one.effect as KeyframeEffect | null)?.target as Element | null)
            ?.className,
          delay: Number(timing?.delay),
          duration: Number(timing?.duration),
          start: one.startTime,
        };
      })
  );
  const ids = started
    .filter((one) => one.name === "cawco-wait")
    .map((one) => one.id);
  await cdp.send("Animation.setPaused", { animations: ids, paused: true });
  const opacityAt = async (at: number) => {
    await cdp.send("Animation.seekAnimations", {
      animations: ids,
      currentTime: at,
    });
    return page.evaluate(() =>
      [...document.querySelectorAll(".cawco-waiting")].map((el) =>
        Number(getComputedStyle(el).opacity)
      )
    );
  };
  const fade = Math.max(...timings.map((one) => one.duration));
  const early = await opacityAt(ms.grace - 50);
  const past = await opacityAt(ms.grace + fade + 20);
  await cdp.send("Animation.setPaused", { animations: ids, paused: false });
  kit.check(
    "14b: one status line, the column's head and a skeleton per story stand from the first, on one clock delayed by --dur-wait-grace: transparent just before it, opaque past its fade",
    seen.status === "Drawing 2 stories" &&
      seen.standIns === 2 &&
      seen.frames === 0 &&
      timings.length === 4 &&
      timings.every(
        (one) =>
          one.delay === ms.grace &&
          one.duration === timings[0]?.duration &&
          one.start === timings[0]?.start
      ) &&
      ids.length === 4 &&
      early.length === 4 &&
      early.every((one) => one === 0) &&
      past.every((one) => one === 1),
    `grace ${ms.grace} ms, fade ${ms.fade} ms; animations ${JSON.stringify(timings)}; opacity at ${ms.grace - 50} ms ${JSON.stringify(early)}, at ${ms.grace + fade + 20} ms ${JSON.stringify(past)}; status ${JSON.stringify(seen.status)}`
  );

  const stood = await placesOf(page, ".cawco-stand-in");
  await page.waitForFunction(
    () => document.querySelectorAll(".cawco-world .cawco-frame").length >= 2,
    null,
    { timeout: 20_000 }
  );
  const landed = await placesOf(
    page,
    '.cawco-world .cawco-frame[data-cawco-interaction="rest"]'
  );
  // The stand-ins go in the skeleton's reveal (runtime.ts `revealed`): gone
  // once it has run, --dur-skeleton-reveal on.
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll(".cawco-stand-in, .cawco-section-status")
          .length === 0,
      null,
      { timeout: 5000 }
    )
    .catch(() => undefined);
  const left = await page.evaluate(
    () =>
      document.querySelectorAll(".cawco-stand-in, .cawco-section-status").length
  );
  kit.check(
    "14c: the frames land in their skeletons' cells, the first row on its skeleton's corner (the rows under it move by the frames' own heights), and the skeletons go",
    landed.length === 2 &&
      landed.every(
        (one, at) =>
          one.cell === stood[at]?.cell &&
          Math.abs(one.x - (stood[at]?.x ?? -99)) <= 1
      ) &&
      Math.abs((landed[0]?.y ?? 0) - (stood[0]?.y ?? -99)) <= 1 &&
      left === 0,
    `skeletons at ${JSON.stringify(stood)}; frames at ${JSON.stringify(landed)}; ${left} stand-ins left`
  );
  await page.close();

  const broken = await kit.page("desk", { init: [BRIDGE] });
  await broken.goto(
    canvasUrl(stage, ["src/Broken.stories.js"], {
      name: "Broken canvas",
    })
  );
  await broken.waitForSelector(".cawco-section-failed", { timeout: 20_000 });
  const before = await broken.evaluate(() => ({
    title: document.querySelector(".cawco-section-title")?.textContent,
    line: document.querySelector(".cawco-section-failed-line")?.textContent,
    summary: document.querySelector(".cawco-section-failed summary")
      ?.textContent,
    open: !!document.querySelector<HTMLDetailsElement>(
      ".cawco-section-failed details"
    )?.open,
    left: document.querySelectorAll(".cawco-stand-in, .cawco-section-status")
      .length,
    role: document.querySelector(".cawco-section-failed")?.getAttribute("role"),
  }));
  await broken.locator(".cawco-section-failed summary").click();
  // The details' toggle event is a task after the press: its words follow it.
  await broken
    .waitForFunction(
      (hide) =>
        document.querySelector(".cawco-section-failed summary")?.textContent ===
        hide,
      shellWords.hideDetails,
      { timeout: 2000 }
    )
    .catch(() => undefined);
  const details = await broken.evaluate(() => {
    const pre = document.querySelector(".cawco-section-failed pre");
    const summary = document.querySelector(".cawco-section-failed summary");
    return {
      text: pre?.textContent ?? "",
      place:
        document.querySelector(".cawco-section-failed-place")?.textContent ??
        "",
      height: pre?.getBoundingClientRect().height ?? 0,
      summary: summary?.textContent ?? "",
      marker: summary ? getComputedStyle(summary).listStyleType : "",
    };
  });
  const report = await broken
    .waitForFunction(
      () =>
        (
          window as unknown as {
            __cawcoCanvas?: { report: RenderReport | null };
          }
        ).__cawcoCanvas?.report?.page.errors.length,
      null,
      { timeout: 10_000 }
    )
    .then(() =>
      broken.evaluate(
        () =>
          (window as unknown as { __cawcoCanvas: { report: RenderReport } })
            .__cawcoCanvas.report.page.errors
      )
    )
    .catch(() => []);
  kit.check(
    "15: a section that didn't load says so in its place, named by its component, its error and place under Show details, the report holding the page error, no skeleton left",
    before.title === "Badge" &&
      before.line === "Badge didn't load, so none of its stories are drawn." &&
      before.summary === shellWords.showDetails &&
      !before.open &&
      before.role === "alert" &&
      before.left === 0 &&
      details.height > 0 &&
      details.summary === shellWords.hideDetails &&
      details.marker === "none" &&
      details.text.includes("The states file's helper broke as it loaded") &&
      details.place.includes("src/broken.js:2:") &&
      report.some((one) =>
        one.message.includes("The states file's helper broke as it loaded")
      ),
    `before ${JSON.stringify(before)}; details ${JSON.stringify(details)}; report's page errors ${JSON.stringify(report)}`
  );
  await broken.close();
}

/** Legs 1, 2 and 4 on React. */
async function react(kit: Kit, stage: Stage): Promise<void> {
  const page = await kit.page("desk", { init: [BRIDGE] });
  const errors = errorsOf(page);
  await page.goto(
    canvasUrl(stage, ["src/Button.stories.jsx", "src/Toggle.stories.jsx"], {
      name: "React kit",
    })
  );
  const report = await reportOn(page, 2500);
  const all = framesOf(report);
  const button = framesOf(report, "src/Button.stories.jsx")
    .map((one) => one.interaction)
    .sort()
    .join(",");
  const hover = framesOf(report, "src/Button.stories.jsx").find(
    (one) => one.interaction === "hover"
  );
  kit.check(
    "1r/2r: React: every story drawn with its chain; Button reaches hover and focus and no pressed (no :active rule), its hover delta said",
    all.every((one) => one.state === "drawn" && one.parts.length > 0) &&
      button === "focus,hover,rest" &&
      !!hover?.delta?.changed.some((one) => one.changed["background-color"]),
    `${said(all)}; Button columns ${button}`
  );
  const move = report.sections.find(
    (one) => one.file === "src/Toggle.stories.jsx"
  )?.moves[0];
  kit.check(
    "4r: React: the toggle's move updates the live instance in place and lists its CSS transitions, curve and all",
    move?.from === "Off" &&
      !move.error &&
      !!move.animations.some(
        (one) =>
          one.property === "background-color" &&
          one.duration === 200 &&
          one.easing === "ease-out"
      ) &&
      !!move.animations.some(
        (one) =>
          one.property === "translate" &&
          one.duration === 240 &&
          one.easing === "cubic-bezier(0.2, 0.8, 0.2, 1)"
      ),
    JSON.stringify(move)
  );
  kit.check(
    "12e: no console errors on the React canvas",
    errors.length === 0,
    errors.join(" | ") || "none"
  );
  await page.close();
}

/** Legs 1, 2 and 4 on Vue and Solid: the same kit, each adapter's `update` run on its own reactive props. */
async function adapterLegs(
  kit: Kit,
  stage: Stage,
  name: "Vue" | "Solid",
  files: { button: string; toggle: string }
): Promise<void> {
  const page = await kit.page("desk", { init: [BRIDGE] });
  const errors = errorsOf(page);
  await page.goto(
    canvasUrl(stage, [files.button, files.toggle], {
      name: `${name} kit`,
    })
  );
  const report = await reportOn(page, 2500);
  const all = framesOf(report);
  const button = framesOf(report, files.button)
    .map((one) => one.interaction)
    .sort()
    .join(",");
  const hover = framesOf(report, files.button).find(
    (one) => one.interaction === "hover"
  );
  kit.check(
    `1/2 (${name}): every story drawn with its chain; Button reaches hover and focus and no pressed, its hover delta said`,
    all.length > 0 &&
      all.every((one) => one.state === "drawn" && one.parts.length > 0) &&
      button === "focus,hover,rest" &&
      !!hover?.delta?.changed.some((one) => one.changed["background-color"]),
    `${said(all)}; Button columns ${button}`
  );
  const move = report.sections.find((one) => one.file === files.toggle)
    ?.moves[0];
  kit.check(
    `4 (${name}): the toggle's move updates the live instance in place and lists its CSS transitions, curve and all`,
    move?.from === "Off" &&
      !move.error &&
      !!move.animations.some(
        (one) =>
          one.property === "background-color" &&
          one.duration === 210 &&
          one.easing === "ease-out"
      ) &&
      !!move.animations.some(
        (one) =>
          one.property === "translate" &&
          one.duration === 230 &&
          one.easing === "ease-in-out"
      ),
    JSON.stringify(move)
  );
  kit.check(
    `12 (${name}): no console errors on the canvas`,
    errors.length === 0,
    errors.join(" | ") || "none"
  );
  await page.close();
}

/** Leg 13: the daemon draws the canvas with no panel open. */
async function daemonRender(kit: Kit, stage: Stage): Promise<void> {
  const port = Number(new URL(stage.base).port);
  const socket = join(SCRATCH, "bridge.sock");
  const socat = Bun.spawn([
    "socat",
    `UNIX-LISTEN:${socket},fork,unlink-early`,
    `TCP:127.0.0.1:${port}`,
  ]);
  try {
    await until(
      "the bridge's socket",
      () => existsSync(socket),
      Boolean,
      10_000
    );
    const started = performance.now();
    // Its sandbox follows the rule (agent capabilities.ts `chromiumSandboxed`): off beneath a workspace's boundary.
    const rendered = await renderCanvas(socket, port, {
      files: ["src/Button.stories.js", "src/Pairing.stories.js"],
      spec: { name: "Kit" },
      png: true,
      state: { story: "Primary", interaction: "hover" },
    });
    const frames = framesOf(rendered.report);
    const move = rendered.report.sections.find(
      (one) => one.file === "src/Pairing.stories.js"
    )?.moves[0];
    const png = Buffer.from(rendered.png ?? "", "base64");
    // The picture is the hover frame at its own size (the render's page draws at one device pixel per CSS px), on whole pixels: the report's box is rounded, the picture's edges taken out to the pixels the frame touches.
    const pictured = frames.find(
      (one) => one.story === "Primary" && one.interaction === "hover"
    );
    const size =
      png.subarray(1, 4).toString() === "PNG"
        ? { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }
        : null;
    kit.check(
      "13: with no panel open, the daemon's render draws every section in the machine's Chromium through the bridge's socket: by stage, every frame drawn, the move read, a frame's picture at its own size",
      rendered.report.by === "stage" &&
        frames.length >= 14 &&
        frames.every((one) => one.state === "drawn") &&
        (move?.animations.length ?? 0) === 2 &&
        !!size &&
        !!pictured &&
        Math.abs(size.w - pictured.box.w) <= 2 &&
        Math.abs(size.h - pictured.box.h) <= 2,
      `${Math.round(performance.now() - started)} ms, by ${rendered.report.by}: ${frames.length} frames ${[...new Set(frames.map((one) => one.state))].join(",")}; move ${move?.from}→${move?.to} ${move?.animations.length} animations; picture ${size ? `${size.w}×${size.h}` : "none"} px for the frame's ${pictured ? `${pictured.box.w}×${pictured.box.h}` : "none"}`
    );
  } finally {
    socat.kill();
  }
}

/** Leg 17: the stage's sweep ends on a story with an `infinite` animation, its hover probed. */
async function endless(kit: Kit, stage: Stage): Promise<void> {
  const port = Number(new URL(stage.base).port);
  const started = performance.now();
  const rendered = await renderCanvas("host", port, {
    files: ["src/Breath.stories.js"],
    spec: { name: "Breath" },
  }).catch((error: Error) => error);
  const ms = Math.round(performance.now() - started);
  const hover =
    rendered instanceof Error
      ? undefined
      : framesOf(rendered.report).find((one) => one.interaction === "hover");
  const changed = hover?.delta?.changed ?? [];
  kit.check(
    "17: the stage's sweep ends on a story whose breath loops forever, within 30 s, and its hover frame's delta is the hover's background alone, nothing from the breath",
    ms < 30_000 &&
      hover?.state === "drawn" &&
      changed.length === 1 &&
      !!changed[0]?.selector.startsWith("span.breath") &&
      Object.keys(changed[0]?.changed ?? {}).join() === "background-color" &&
      (hover.delta?.animations ?? []).every(
        (one) => !one.property.includes("breath")
      ),
    rendered instanceof Error
      ? `${ms} ms: ${rendered.message.split("\n")[0]}`
      : `${ms} ms; hover ${JSON.stringify({ state: hover?.state, delta: hover?.delta })}`
  );
}

/**
 * Leg 14d: a section on its way from a states file deep in its project (the
 * owner: "look at the path above spilling out ... this is terrible ux for a
 * loading/pending state"), on a desk and a phone: its file stands on one
 * row inside the section's head, its folders cut to an ellipsis and its own
 * name whole, the whole path its title, and nothing of it link-styled.
 */
async function deepPath(kit: Kit, stage: Stage): Promise<void> {
  const file =
    "src/lib/cawco/tasks/stage/project-redesign-card/states/DeepLate.stories.js";
  for (const size of ["desk", "phone"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page(size, { init: [BRIDGE] });
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(canvasUrl(stage, [file], { name: "Deep canvas" }), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".cawco-section-status", { state: "attached" });
    const seen = await page.evaluate(() => {
      const path = document.querySelector<HTMLElement>(".cawco-section-file");
      const head = path?.parentElement;
      const folder = path?.querySelector<HTMLElement>(
        ".cawco-section-file-folder"
      );
      const own = path?.querySelector<HTMLElement>(".cawco-section-file-name");
      if (!(path && head && folder && own)) {
        return null;
      }
      const box = path.getBoundingClientRect();
      const within = head.getBoundingClientRect();
      const read = getComputedStyle(path);
      return {
        text: path.textContent,
        title: path.title,
        height: path.offsetHeight,
        line: Number.parseFloat(read.lineHeight),
        start: box.left - within.left,
        end: within.right - box.right,
        folderCut: folder.scrollWidth > folder.clientWidth,
        folderEllipsis: getComputedStyle(folder).textOverflow,
        ownWhole: own.scrollWidth <= own.clientWidth,
        links: head.querySelectorAll("a").length,
        decoration: read.textDecorationLine,
      };
    });
    kit.check(
      `14d: at ${size}, a deep states file's path stands on one row inside its section's head while it waits: its folders cut to an ellipsis, its own name whole, the whole path its title, no link`,
      seen !== null &&
        seen.text === file &&
        seen.title === file &&
        seen.height <= Math.ceil(seen.line) &&
        seen.start >= -0.5 &&
        seen.end >= -0.5 &&
        seen.folderCut &&
        seen.folderEllipsis === "ellipsis" &&
        seen.ownWhole &&
        seen.links === 0 &&
        seen.decoration === "none" &&
        errors.length === 0,
      `${JSON.stringify(seen)}; console errors ${JSON.stringify(errors)}`
    );
    await page.close();
  }
}

/** Leg 16: a size container with no width of its own fails at the frame's floor, in words; with a viewport it draws. */
async function floor(kit: Kit, stage: Stage): Promise<void> {
  const page = await kit.page("desk", { init: [BRIDGE] });
  await page.goto(
    canvasUrl(stage, ["src/Approval.stories.js"], { name: "Approval" })
  );
  const report = await reportOn(page);
  const frame = (story: string) =>
    framesOf(report).find(
      (one) => one.story === story && one.interaction === "rest"
    );
  const unsized = frame("Unsized");
  const phone = frame("Phone");
  kit.check(
    "16: a size container with no width of its own is failed at the frame's floor, said in words; with a phone viewport it is drawn",
    unsized?.state === "failed" &&
      unsized.error?.message ===
        "drawn 24px wide: the story has no width of its own; give it a viewport or a width" &&
      phone?.state === "drawn" &&
      phone.box.w === 390,
    `Unsized ${JSON.stringify({ state: unsized?.state, w: unsized?.box.w, error: unsized?.error })}; Phone ${JSON.stringify({ state: phone?.state, w: phone?.box.w })}`
  );
  await page.close();
}

/**
 * Leg 18: in Comment mode a canvas marks one thing, the element under the
 * pointer (the owner, nightly 5450: hovering an element in Comment "also lit
 * the frame's caption pink"). The canvas served through an origin that
 * gives it the overlay, framed by a host the overlay hears, as a panel
 * frames it: at rest in Interact the frame in view says so on its label
 * (`selected-bg`); in Comment, with the pointer on a button in that frame,
 * the overlay draws one target, over the button, and the label holds no
 * fill and its words their own ink; back in Interact the label's mark is
 * back and no target stands.
 */
async function commentMarksOne(kit: Kit, stage: Stage): Promise<void> {
  let hostOrigin = "";
  const embed = embedOrigin(stage.port, () => [hostOrigin]);
  const canvas = canvasUrl(
    { ...stage, base: `http://127.0.0.1:${embed.port}` },
    KIT_FILES,
    KIT_SPEC
  );
  const host = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Host</title></head><body style="margin:0"><iframe title="Preview" src="${canvas.replaceAll("&", "&amp;")}" style="display:block;border:0;inline-size:100vw;block-size:100vh"></iframe></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } }
      ),
  });
  hostOrigin = `http://127.0.0.1:${host.port}`;
  const page = await kit.page("desk");
  try {
    await page.goto(hostOrigin);
    const frame = await until(
      "the canvas's frame",
      () =>
        Promise.resolve(
          page.frames().find((one) => one.url().includes("/@cawco/canvas"))
        ),
      Boolean,
      30_000
    );
    if (!frame) {
      kit.check("18: the canvas loads in its host's frame", false);
      return;
    }
    await frame.waitForFunction(
      () =>
        !!document.querySelector("cawco-overlay") &&
        !!document.querySelector(
          ".cawco-frame[data-cawco-current] .cawco-frame-body button"
        ) &&
        !!(window as unknown as { __cawcoCanvas?: { report: unknown } })
          .__cawcoCanvas?.report,
      null,
      { timeout: 60_000 }
    );
    const tell = (message: Record<string, unknown>) =>
      page.evaluate((sent) => {
        const view = document.querySelector("iframe")?.contentWindow;
        view?.postMessage({ type: "cawco:hello" }, "*");
        view?.postMessage(sent, "*");
      }, message);
    // The frame in view settles once the canvas has fitted its view.
    await page.waitForTimeout(1500);
    /** What the canvas marks: the overlay's targets standing, and the frame in view (its key, its label, its button). */
    const read = () =>
      frame.evaluate(() => {
        const rects = [
          ...(document
            .querySelector("cawco-overlay")
            ?.shadowRoot?.querySelectorAll<HTMLElement>(".rect") ?? []),
        ]
          .filter((one) => !one.hidden)
          .map((one) => {
            const box = one.getBoundingClientRect();
            return { x: box.x, y: box.y, w: box.width, h: box.height };
          });
        const current = document.querySelector<HTMLElement>(
          ".cawco-frame[data-cawco-current]"
        );
        const label = current?.querySelector<HTMLElement>(
          ":scope > .cawco-frame-label"
        );
        const words = label?.querySelector<HTMLElement>(".cawco-frame-words");
        const button = current
          ?.querySelector<HTMLElement>(".cawco-frame-body button")
          ?.getBoundingClientRect();
        return {
          key: current?.dataset.cawcoKey ?? null,
          commenting: document.documentElement.hasAttribute(
            "data-cawco-commenting"
          ),
          rects,
          button: button && {
            x: button.x,
            y: button.y,
            w: button.width,
            h: button.height,
          },
          fill: label ? getComputedStyle(label).backgroundColor : null,
          ink: words ? getComputedStyle(words).color : null,
        };
      });
    const resting = await read();
    await tell({ type: "cawco:mode", mode: "comment" });
    const { button } = resting;
    if (button) {
      // The iframe stands at the page's origin: its px are the page's.
      await page.mouse.move(button.x + button.w / 2, button.y + button.h / 2, {
        steps: 4,
      });
    }
    await page.waitForTimeout(600);
    const commenting = await read();
    await tell({ type: "cawco:mode", mode: "interact" });
    await page.waitForTimeout(400);
    const back = await read();
    const clear = (colour: string | null) =>
      colour === "rgba(0, 0, 0, 0)" || colour === "transparent";
    const [over] = commenting.rects;
    const onButton =
      !!over &&
      !!button &&
      Math.abs(over.x - button.x) <= 4 &&
      Math.abs(over.y - button.y) <= 4 &&
      Math.abs(over.w - button.w) <= 8 &&
      Math.abs(over.h - button.h) <= 8;
    kit.check(
      `18: in Comment a canvas marks one thing, the button under the pointer: one target over it (${commenting.rects.length} standing), the frame in view's label no fill (${commenting.fill}) and its words out of the selected ink (${commenting.ink}, in view ${resting.ink}); at rest in Interact its label says it is in view (${resting.fill}), and back in Interact it does again (${back.fill}) with no target standing`,
      !!resting.key &&
        commenting.key === resting.key &&
        back.key === resting.key &&
        !clear(resting.fill) &&
        resting.rects.length === 0 &&
        commenting.commenting &&
        commenting.rects.length === 1 &&
        onButton &&
        clear(commenting.fill) &&
        commenting.ink !== resting.ink &&
        back.ink === resting.ink &&
        !back.commenting &&
        back.fill === resting.fill &&
        back.rects.length === 0,
      JSON.stringify({ resting, commenting, back })
    );
  } finally {
    await page.close();
    host.stop(true);
    embed.stop(true);
  }
}

/**
 * Leg 19: a request no page makes is no canvas's error (the orchestrator's
 * curl of nightly 5450: a module address read straight out of a canvas
 * page's HTML, its `&` still `&amp;`, put 21 standing "doesn't compile"
 * errors on a canvas whose own imports compile). A canvas whose component
 * imports a `.riv` by its address (`./mark.riv?url`, as the dashboard's Caw
 * does) draws with no error the stage keeps for it; that file asked for as
 * `?import&amp;url` (Vite reads the query as `amp;url` and parses the file
 * as script) is answered with its error, and the stage still keeps none
 * for the canvas (what the daemon carries into its doc, and artifact_read
 * reports as its errors) nor sends it to the open page, whose console says
 * no `[vite] Internal Server Error`; loaded again, the canvas draws.
 */
async function strayRequest(kit: Kit, stage: Stage): Promise<void> {
  const files = ["src/Mark.stories.js"];
  const mine = () =>
    (stage.errors() ?? []).filter(
      (one) =>
        one.file.includes("mark.riv") ||
        one.sheets.some((sheet) => files.includes(sheet))
    );
  const page = await kit.page("desk", { init: [BRIDGE] });
  const errors = errorsOf(page);
  await page.goto(canvasUrl(stage, files, { name: "Mark" }));
  const first = framesOf(await reportOn(page));
  const before = mine();
  const consoleBefore = errors.length;
  const answer = await fetch(`${stage.base}/src/mark.riv?import&amp;url`);
  const answered = (await answer.text()).slice(0, 160);
  await page.waitForTimeout(1500);
  const after = mine();
  const heard = errors.slice(consoleBefore);
  await page.reload();
  const again = framesOf(await reportOn(page));
  const allDrawn = (frames: FrameRender[]) =>
    frames.length > 0 && frames.every((one) => one.state === "drawn");
  kit.check(
    `19: a request no page makes is no canvas's error: the canvas of a component that imports a .riv by its address draws (${first.length} frames) with no error kept for it; asked for as ?import&amp;url the file is answered ${answer.status}, and the stage still keeps none for the canvas (${after.length} after, ${before.length} before) nor sends it to the open page, which logs no error (${heard.length}); loaded again it draws (${again.length} frames)`,
    allDrawn(first) &&
      consoleBefore === 0 &&
      before.length === 0 &&
      answer.status >= 400 &&
      after.length === 0 &&
      heard.length === 0 &&
      allDrawn(again),
    JSON.stringify({
      answered,
      kept: after.map(
        (one) =>
          `${one.kind} ${one.file}: ${one.message.slice(0, 120)} [${one.sheets.join(", ")}]`
      ),
      frames: [said(first), said(again)],
      console: errors.slice(0, 4),
    })
  );
  await page.close();
}

/** `--leg comment-and-stray`: legs 18 and 19 alone, on the Svelte stage. */
const ONLY_LEG = process.argv.includes("--leg")
  ? process.argv[process.argv.indexOf("--leg") + 1]
  : undefined;

const spec: Spec = {
  name: "component-canvas",
  run: async (kit) => {
    const host = await buildStageHost();
    const svelte = await stageOf("svelte", host);
    try {
      if (ONLY_LEG === "comment-and-stray") {
        await commentMarksOne(kit, svelte);
        await strayRequest(kit, svelte);
        return;
      }
      await svelteKit(kit, svelte);
      await views(kit, svelte);
      await lazy(kit, svelte);
      await kept(kit, svelte);
      await waiting(kit, svelte);
      await deepPath(kit, svelte);
      await floor(kit, svelte);
      await daemonRender(kit, svelte);
      await endless(kit, svelte);
      await commentMarksOne(kit, svelte);
      await strayRequest(kit, svelte);
    } finally {
      svelte.stop();
    }
    const reactStage = await stageOf("react", host);
    try {
      await react(kit, reactStage);
    } finally {
      reactStage.stop();
    }
    const vueStage = await stageOf("vue", host);
    try {
      await adapterLegs(kit, vueStage, "Vue", {
        button: "src/Button.stories.js",
        toggle: "src/Toggle.stories.js",
      });
    } finally {
      vueStage.stop();
    }
    const solidStage = await stageOf("solid", host);
    try {
      await adapterLegs(kit, solidStage, "Solid", {
        button: "src/Button.stories.jsx",
        toggle: "src/Toggle.stories.jsx",
      });
    } finally {
      solidStage.stop();
    }
  },
};
export default spec;
