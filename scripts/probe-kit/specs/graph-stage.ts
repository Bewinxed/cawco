/**
 * The design graph as the artifact panel's view of a component artifact
 * (Projects spec §5.10; the build spec's slice 1, the stage and the States
 * face): the panel draws the graph's chrome round the one frame that holds
 * the stage page, and the two speak by messages alone (core
 * stage-graph.ts). A scratch fleet, Claude Code against the mock model, a
 * session in a checkout of a plain Vite + Svelte project whose card has
 * three states, the dashboard open on the session as the person has it,
 * then on the artifact's own page (the panel filling the window):
 *
 * 1. `artifact_create(kind: "component")` with an ask naming the state Two
 *    opens the panel's design graph on it: the stage's drawing stands at
 *    `Two` (its `data-cawco-story`) and the States face's kept row is Two.
 * 2. `artifact_read` answers every state's frame `drawn`, from the panel's
 *    own report (`by: "panel"`), posted from the page's rig.
 * 3. A press on One's row posts one `cawco:stage-reach` into the frame, to
 *    One from Two, with no play, and the page answers it
 *    `cawco:stage-reached` with that ask; the drawing stands at One.
 * 4. At 1440 the stage takes the width the page said it needs
 *    (`cawco:stage-laid`): its frame is that wide, or the stage stands at
 *    its least.
 * 5. At 390 the room is the drawer at its head stop (its steps, no list)
 *    and the stage stands whole above it.
 * 5b. The drawer's stops are measured inside the surface it stands in,
 *    never the window: at each stop its grabber's press steps it on, the
 *    drawer stands that stop's height over the surface's foot (its head
 *    `c-graph-drawer-head`; whole up to the foot of the panel head's room)
 *    and no lower, its
 *    grabber takes a press where it is drawn, and past its head a state
 *    row in it takes one; the stage ends at its top.
 * 6. `artifact_read({ png: true, state: { story: "Two" } })` answers a
 *    picture of Two's drawing at 1:1 through the daemon's render on the
 *    stage (`by=stage`): 1280 px wide, a desk's form, for a card of no
 *    width of its own.
 * 7. The rendered checks on the panel's design graph at 1440×900 and
 *    390×844, the panel's head, the room and the stage's head.
 * 8. In the session's panel at its default width on a desk, Inspect stands
 *    the inspector over the well's foot, a sheet, and the stage keeps its
 *    width: picked from the window, its panel beside the graph left the
 *    stage 165px.
 * 9. A canvas of two states files lists both in its components' menu from
 *    the graph's first paint, the one whose sheet is on its way as loading.
 * 10. At 390 a state picked at the drawer's last stop takes the drawer down
 *    to its head, so the state picked is seen.
 *
 * The graph-map leg (the build spec's slice 2, the Map face), on a second
 * artifact of the card's states file made with `group` and `edges`:
 *
 * map 1. On the room's Map face at 1440 the map draws one region per
 *    heading `group` names (Quiet, Loud) and one arrow per edge and per
 *    `from` (Two → Three, which Three's `from` plays, solid; Three → One,
 *    the agent's edge, dashed: RouteEdge's `data-played`).
 * map 2. It fits at a readable zoom: Svelte Flow's fit with the house's
 *    `FIT`, never past its `maxZoom` nor under the zoom the cards' notes
 *    draw at 10px, every card inside the map's pane.
 * map 3. A press on Two's card keeps it: the drawing stands at Two.
 * map 4. A press on an arrow (the act "Calm down", Three → One) keeps its
 *    to state until the Animation face stands: the drawing stands at One.
 * map 5. At 390 the Map face is a list: each state its card, no Svelte
 *    Flow map.
 * map 6. The rendered checks on the Map face at 1440×900 and 390×844.
 *
 * The graph-compare leg (the build spec's slice 3, Compare), on a session
 * in this checkout and a canvas of the dashboard's routine form:
 *
 * compare 1. Compare on in the stage's head with the routine form at Just opened
 *    (compared with Filled in, the state after it on its path) reads the
 *    lines the design graph's branch read (its design run, Use): "Menu
 *    “When”: day ← weekdays", "Field “Name” emptied (was Triage new
 *    onboarding issues)", "Hint removed". The page tells them
 *    (`cawco:stage-differences`) and the stage's head lists them.
 * compare 2. Each line's press brings its ring into view: the ring the
 *    page draws for it (`data-at`) stands inside the frame's view, read by
 *    the platform's own `clientWidth` getter: the stage page answers the
 *    root's `clientWidth` and `innerWidth` at the drawing's box, for the
 *    component's floating layers (stage-host canvas viewport.ts
 *    `frameAsViewport`), so read through them a ring at the drawing's edge
 *    stood past a view 28px wider.
 * compare 3. A press on a line of what went flips: the panel posts
 *    `cawco:stage-compare` with `show: "compared"`, and the page stands the
 *    compared drawing in the kept one's place.
 * compare 4. At 2529, the room closed (the stage the surface's whole
 *    width), the two drawings stand side by side (`beside: true`), each
 *    named over it.
 * compare 5. The rendered checks with Compare on at 1440×900 and 390×844.
 *
 * The graph-move leg (the build spec's slice 4, the Animation face), on a
 * canvas of the routine form opened at `?face=move` on Hub didn't answer,
 * which its states file plays from Filled in:
 *
 * move 1. The reach answers its move's clips, each placed by its
 *    animation's own `startTime`: two set off in one frame stand within
 *    1 ms of each other.
 * move 2. Play is followed by `cawco:stage-time` as it starts and as it
 *    ends, its `length` the clips' last end.
 * move 3. A press on the ruler at 35% of its lane holds the page's replays
 *    there: every one of `document.getAnimations()` the page made (its
 *    `REPLAY_ID`) paused; the component's own, finished ones among them,
 *    said beside them.
 * move 4. A drag of Form failure's end writes `tuned` into the doc, and the
 *    hub's read answers it with `offTokens`.
 * move 5. Another move from the title's menu and back keeps the edit.
 * move 6. Reset all empties `tuned`.
 * move 7. The rendered checks on the Animation face at 1440×900 and
 *    390×844 (the drawer at its whole stop).
 * move-chips. Every row, and each animation's row under it, opened in
 *    turn: its chips each opened and read with their list over the face,
 *    no press ending on an error page.
 * move-runs. "Button “Create routine” changes" stands as more than one run
 *    (its windows as the engine ran them, motion.ts `runsOf`); a drag on
 *    the first moves it alone, an arrow on the last moves it alone.
 *
 * The graph-dials leg (slice 4, the graph's dials), on a canvas of a
 * swatch made with one dial of each kind (a `cssVar` number, a colour, a
 * select on an arg, a toggle), opened at `?face=dials`:
 *
 * dials 1. All four stand in the Dials face at 1440 and in the drawer at
 *    390.
 * dials 2. A turn of each changes the drawing: the variable's computed
 *    value on the drawing's root, the arg's effect after `update`.
 * dials 3. The hub's read answers each turned value under `dials`.
 * dials 4. `artifact_update({ dials })` adds a fifth dial, which stands
 *    without a reopen.
 * dials 5. No element of the library the graph's dials replaced stands on
 *    the stage page, and no script of it loads.
 * dials 6. The rendered checks on the Dials face at 1440×900 and 390×844.
 *
 * The stage's boundary is made of user namespaces: like a spec that
 * delegates, it runs outside every workspace boundary (README "A spec that
 * delegates runs on the host").
 *
 *   bun scripts/probe-kit/run.ts graph-stage
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { REPLAY_ID } from "../../../packages/agent/src/stage-host/canvas/replays";
import { hubRequest } from "../../../packages/core/src/hub-request";
import {
  STAGE_COMPARE,
  STAGE_DIFFERENCES,
  STAGE_LAID,
  STAGE_REACH,
  STAGE_REACHED,
  STAGE_TIME,
} from "../../../packages/core/src/stage-graph";
import { graphWords } from "../../../packages/core/src/words/graph";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import { type Kit, open, ROOT, type Spec, settle } from "../kit";
import { RenderedChecks } from "../rendered-checks";

const STORY = "src/Card.stories.js";
/** The canvas's second states file: a component of its own (legs 9). */
const BADGE = "src/Badge.stories.js";
/** The dials leg's states file: a swatch every dial kind reaches. */
const SWATCH = "src/Swatch.stories.js";
/** One dial of each kind (the graph-dials leg). */
const DIALS = [
  {
    name: "radius",
    kind: "number",
    min: 0,
    max: 24,
    unit: "px",
    target: { cssVar: "--swatch-radius" },
  },
  { name: "ink", kind: "color", target: { cssVar: "--swatch-ink" } },
  {
    name: "tone",
    kind: "select",
    options: ["calm", "loud"],
    target: { arg: "tone" },
  },
  { name: "framed", kind: "toggle", target: { arg: "framed" } },
];
/** The fifth, added by artifact_update. */
const FIFTH = { name: "label", kind: "text", target: { arg: "label" } };
/** The move leg's ask: the routine form at the state its states file plays from Filled in. */
const MOVE_ASK = "Judge the routine form at Hub didn't answer";
/** The move leg's rows: the one whose end is dragged, and the one of two runs. */
const FAILURE_ROW = "Form failure";
const RUNS_ROW = "Button “Create routine” changes";
/** The ask the canvas is made with: it names the state the graph opens on. */
const ASK = "Judge the card at Two";
/** The map's canvas: the card's states under two headings, and one move the agent names (the graph-map leg). */
const MAP_ASK = "Judge the card's map at One";
const MAP_GROUP = { One: "Quiet", Two: "Quiet", Three: "Loud" };
const MAP_EDGES = [{ from: "Three", to: "One", label: "Calm down" }];
/** Two's card's name, alone: not Two → Three. */
const TWO_ALONE = /^\s*Two\s*$/u;
/** The routine form's states file, from this checkout's root (the graph-compare leg). */
const ROUTINE = "apps/dashboard/src/lib/cawco/routines/RoutineForm.stories.ts";
/** The compare canvas's ask: the routine form at Just opened, compared with the state after it, Filled in. */
const ROUTINE_ASK = "Judge the routine form at Just opened";
/** The lines the design graph's branch read with Compare on there (its design run, Use). */
const BRANCH_LINES = [
  "Menu “When”: day ← weekdays",
  "Field “Name” emptied (was Triage new onboarding issues)",
  "Hint removed",
];
/** A window the surface brief names: about half of it the surface's, once the room is closed the stage's whole. */
const WIDE = { width: 2529, height: 1300 };

/** The project in the session's folder: plain Vite and Svelte, installed only in its stage clone. */
const PROJECT: Record<string, string> = {
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name: "graph-cards",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { plugins: [svelte()], server: { fs: { strict: false } } };
`,
  "index.html": "<!doctype html><html><head></head><body></body></html>\n",
  "src/Card.svelte": `<script>
  let { title, tone = "calm" } = $props();
</script>

<h2 data-probe="title" data-tone={tone}>{title}</h2>
`,
  [STORY]: `import Card from "./Card.svelte";

export default { component: Card, args: { title: "Hello" } };

/** The card at rest. */
export const One = { args: {} };

/** The card with its second title. */
export const Two = { args: { title: "Second" } };

/** The card raised, from its second title. */
export const Three = {
  args: { title: "Third", tone: "loud" },
  from: "Two",
  play: async ({ update }) => {
    await update({ title: "Third", tone: "loud" });
  },
};
`,
  "src/Badge.svelte": `<script>
  let { label } = $props();
</script>

<span data-probe="badge">{label}</span>
`,
  "src/Swatch.svelte": `<script>
  let { tone = "calm", framed = false, label = "Swatch" } = $props();
</script>

<div data-probe="swatch" data-tone={tone} data-framed={framed} class="swatch">{label}</div>

<style>
  :global(:root) { --swatch-radius: 6px; --swatch-ink: #223344; }
  .swatch { border-radius: var(--swatch-radius); color: var(--swatch-ink); padding: 12px; border: 1px solid; }
</style>
`,
  [SWATCH]: `import Swatch from "./Swatch.svelte";

export default { title: "Swatch", component: Swatch, args: { tone: "calm", framed: false, label: "Swatch" } };

/** The swatch at rest. */
export const Plain = { args: {} };
`,
  [BADGE]: `import Badge from "./Badge.svelte";

export default { title: "Badge", component: Badge, args: { label: "New" } };

/** The badge as it first shows. */
export const Fresh = { args: {} };
`,
};

/** What each numbered message asks the session to call, and what it answered. */
const calls = new ToolCalls();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Graph title");
  }
  return calls.reply(request) ?? text("ok");
};

const ID = /"id":"([0-9a-f-]{36})"/u;
const short = (said: string) => said.replaceAll(/\s+/gu, " ").slice(0, 500);

/** A read's `render` as the hub answers it (hub component.ts `renderSaid`), or null when the answer has none. */
interface RenderSaid {
  at: string;
  by: string;
  drawing?: string;
  frames?: { interaction: string; state: string; story: string }[];
}
const renderOf = (said: string): RenderSaid | null => {
  try {
    return (JSON.parse(said) as { render?: RenderSaid }).render ?? null;
  } catch {
    return null;
  }
};

/** The artifact panel, as the session page holds it. */
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const GRAPH = `${PANE} [data-slot="design-graph"]`;
/** The stage page's frame, in the graph's stage. */
const FRAME = `${GRAPH} [data-slot="stage-field"] iframe[data-scheme]`;

/**
 * The artifact's own page at `view` (the panel filling the window, so at
 * 1440 the room stands beside the stage), once the graph's stage has come
 * to rest.
 */
async function graphPage(
  kit: Kit,
  base: string,
  id: string,
  view: "desk" | "phone",
  drawn = '[data-probe="title"]',
  waitMs = 120_000,
  query = ""
): Promise<{ frame: Frame; page: Page }> {
  const page = await kit.page(view, { theme: "light" });
  await hearAnswers(page);
  await open(page, `${base}/artifact/${id}${query}`, GRAPH, waitMs);
  await page.waitForSelector(`${GRAPH}:not([data-arriving])`, {
    timeout: waitMs,
  });
  const frame = await (
    await page.locator(FRAME).first().elementHandle()
  )?.contentFrame();
  if (!frame) {
    throw new Error("The design graph's stage holds no frame.");
  }
  await frame.waitForSelector(`[data-cawco-story] ${drawn}`, {
    timeout: waitMs,
  });
  return { frame, page };
}

/** The story the stage's drawing stands at. */
const drawnStory = (frame: Frame) =>
  frame.evaluate(
    () =>
      document.querySelector<HTMLElement>("[data-cawco-story]")?.dataset
        .cawcoStory ?? null
  );

/**
 * What the panel hears from the frame of the stage's answers, from the
 * panel's first load: the page says how it laid the drawing out as it
 * mounts, and again only when that changes (stage-host canvas stage.ts
 * `laid`), so a listener started later hears none for a reach that moves
 * nothing across.
 */
async function hearAnswers(page: Page): Promise<void> {
  await page.addInitScript(
    (types) => {
      if (window !== window.top) {
        return;
      }
      const heard: unknown[] = [];
      (window as unknown as { __answers: unknown[] }).__answers = heard;
      addEventListener("message", (event) => {
        const type = (event.data as { type?: unknown } | null)?.type;
        if (types.some((one) => one === type)) {
          heard.push(event.data);
        }
      });
    },
    [STAGE_REACHED, STAGE_LAID, STAGE_DIFFERENCES, STAGE_TIME] as const
  );
}

/** What the frame hears from the panel of the stage's reaches, from now. */
async function listen(frame: Frame): Promise<void> {
  await listenFor(frame, STAGE_REACH, "__reaches");
}

/** What the frame hears from the panel of messages of `type`, from now, kept under `key`. */
async function listenFor(frame: Frame, type: string, key: string) {
  await frame.evaluate(
    ([named, under]) => {
      const heard: unknown[] = [];
      (window as unknown as Record<string, unknown[]>)[under] = heard;
      addEventListener("message", (event) => {
        if ((event.data as { type?: unknown } | null)?.type === named) {
          heard.push(event.data);
        }
      });
    },
    [type, key] as const
  );
}

interface Reach {
  ask: number;
  from: { story: string } | null;
  play: boolean;
  to: { story: string };
}
interface Answer {
  ask?: number;
  need?: number;
  superseded?: boolean;
  type: string;
}

/** Legs 1, 3, 4 and 7 at 1440. */
async function deskLegs(
  kit: Kit,
  base: string,
  id: string,
  checks: RenderedChecks
): Promise<void> {
  const { frame, page } = await graphPage(kit, base, id, "desk");
  const opened = {
    drawn: await drawnStory(frame),
    kept: await page
      .locator(`${GRAPH} [data-slot="graph-room"] button[aria-current="true"]`)
      .first()
      .textContent()
      .catch(() => null),
  };
  kit.check(
    "1: the panel opens the design graph on the state the ask names: the stage's drawing stands at Two and the States face keeps it",
    opened.drawn === "Two" && opened.kept?.trim() === "Two",
    JSON.stringify(opened)
  );
  await checks.at(page, "1440, at Two");

  // 3. A press on One's row: one reach into the frame, answered.
  await listen(frame);
  await page
    .locator(`${GRAPH} [data-slot="graph-room"] [data-state-id="One"] button`)
    .first()
    .click();
  const landed = await until(
    "the drawing at One",
    () => drawnStory(frame),
    (story) => story === "One",
    30_000
  ).catch(() => drawnStory(frame));
  await page.waitForSelector(`${GRAPH}:not([data-arriving])`);
  const reaches = (await frame.evaluate(
    () => (window as unknown as { __reaches: unknown[] }).__reaches
  )) as Reach[];
  const answers = (await page.evaluate(
    () => (window as unknown as { __answers: unknown[] }).__answers
  )) as Answer[];
  const [reach] = reaches;
  const answer = answers.find(
    (one) => one.type === STAGE_REACHED && one.ask === reach?.ask
  );
  kit.check(
    "3: a press on One posts one cawco:stage-reach, to One from Two with no play, answered cawco:stage-reached with its ask; the drawing stands at One",
    reaches.length === 1 &&
      reach?.to.story === "One" &&
      reach.from?.story === "Two" &&
      reach.play === false &&
      !!answer &&
      !answer.superseded &&
      landed === "One",
    `reaches ${JSON.stringify(reaches)}; answers ${JSON.stringify(answers)}; drawn ${landed}`
  );
  await checks.at(page, "1440, at One");

  // 4. The stage takes what the page said it needs.
  const laid = [...answers]
    .reverse()
    .find((one) => one.type === STAGE_LAID)?.need;
  const sized = await page.evaluate((frameAt) => {
    const field = document.querySelector<HTMLIFrameElement>(frameAt);
    const least = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--spacing-c-graph-stage-min"
      )
    );
    return { frame: field?.clientWidth ?? 0, least };
  }, FRAME);
  kit.check(
    "4: at 1440 the stage's frame is as wide as the page said its drawing needs, or the stage stands at its least",
    laid === undefined
      ? false
      : Math.abs(sized.frame - laid) <= 1 || sized.frame <= sized.least,
    `laid ${laid}; ${JSON.stringify(sized)}`
  );
  await page.close();
}

/** Legs 5 and 7 at 390. */
async function phoneLegs(
  kit: Kit,
  base: string,
  id: string,
  checks: RenderedChecks
): Promise<void> {
  const { page } = await graphPage(kit, base, id, "phone");
  const stood = await page.evaluate((graph) => {
    const root = document.querySelector(graph);
    const stage = root
      ?.querySelector('[data-slot="stage"]')
      ?.getBoundingClientRect();
    const drawer = root
      ?.querySelector('[data-slot="drawer-content"]')
      ?.getBoundingClientRect();
    return {
      stage: stage ? { top: stage.top, bottom: stage.bottom } : null,
      drawer: drawer ? { top: drawer.top } : null,
      steps: !!root?.querySelector(
        '[data-slot="drawer-content"] [data-slot="journey-steps"]'
      ),
      list: !!root?.querySelector(
        '[data-slot="drawer-content"] [data-state-id]'
      ),
    };
  }, GRAPH);
  kit.check(
    "5: at 390 the room is the drawer at its head stop, its steps and no list, the stage whole above it",
    !!stood.stage &&
      !!stood.drawer &&
      stood.stage.top >= 0 &&
      stood.stage.bottom <= stood.drawer.top + 1 &&
      stood.steps &&
      !stood.list,
    JSON.stringify(stood)
  );
  await checks.at(page, "390, the drawer at its head");
  await drawerStops(kit, page);
  await page.close();
}

/** Whether a finger reaches what `of` names: on the screen, and the element drawn at its middle its own. */
const reachable = (page: Page, of: string) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const box = el?.getBoundingClientRect();
    if (!(el && box) || box.bottom > innerHeight || box.top < 0) {
      return false;
    }
    const top = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + Math.min(box.height / 2, 10)
    );
    return !!top && (top === el || el.contains(top));
  }, of);

/** Leg 5b: the drawer at each of its stops, measured on the surface it stands in. */
async function drawerStops(kit: Kit, page: Page): Promise<void> {
  const DRAWER = `${GRAPH} [data-slot="drawer-content"]`;
  const read = () =>
    page.evaluate(
      ([graph, drawer]) => {
        const root = document.querySelector(graph);
        const sheet = document.querySelector(drawer);
        const stage = root?.querySelector('[data-slot="stage"]');
        // The head's room: the graph page's top padding, under the panel's floating head.
        const pageBox = root?.querySelector('[data-slot="graph-page"]');
        const head = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--spacing-c-graph-drawer-head"
          )
        );
        const box = (el: Element | null | undefined) =>
          el ? el.getBoundingClientRect() : null;
        const surface = box(root);
        return {
          head,
          foot: surface ? Math.round(surface.bottom) : null,
          barFoot: pageBox
            ? pageBox.getBoundingClientRect().top +
              Number.parseFloat(getComputedStyle(pageBox).paddingTop)
            : null,
          top: box(sheet)?.top ?? null,
          stageFoot: box(stage)?.bottom ?? null,
          screen: innerHeight,
        };
      },
      [GRAPH, DRAWER] as const
    );
  type Read = Awaited<ReturnType<typeof read>>;
  /** The height a stop stands over the surface's foot: the head's token, whole up to the foot of the panel head's room; half is read, not named. */
  const heightOf = (stop: string, at: Read): number | null => {
    if (stop === "head") {
      return at.head;
    }
    if (stop === "whole" && at.foot !== null && at.barFoot !== null) {
      return at.foot - at.barFoot;
    }
    return null;
  };
  type Stop = Read & {
    grabber: boolean;
    height: number | null;
    row: boolean | null;
    shows: number;
    stop: string;
  };
  /** The stop stands its height over the surface's foot, on the screen, the stage ending at its top; its grabber and (past the head) a state row take a press. */
  const ok = (one: Stop) =>
    one.shows > 0 &&
    (one.height === null || Math.abs(one.shows - one.height) <= 2) &&
    one.foot !== null &&
    one.foot <= one.screen + 1 &&
    one.stageFoot !== null &&
    one.top !== null &&
    one.stageFoot <= one.top + 4 &&
    one.grabber &&
    one.row !== false;
  /** Whether a press on a state row in the drawer keeps another state. */
  const rowTakes = async (): Promise<boolean> => {
    const kept = `${DRAWER} [data-state-id] button[aria-current="true"]`;
    const before = await page
      .locator(kept)
      .first()
      .textContent()
      .catch(() => null);
    const pressed = await page
      .locator(`${DRAWER} [data-state-id] button:not([aria-current])`)
      .first()
      .click({ timeout: 5000 })
      .then(
        () => true,
        () => false
      );
    await page.waitForTimeout(800);
    const after = await page
      .locator(kept)
      .first()
      .textContent()
      .catch(() => null);
    return pressed && after !== before;
  };
  const stops: Stop[] = [];
  for (const stop of ["head", "half", "whole"]) {
    const at = await read();
    const one: Stop = {
      ...at,
      stop,
      shows:
        at.foot !== null && at.top !== null ? Math.round(at.foot - at.top) : 0,
      height: heightOf(stop, at),
      grabber: await reachable(page, `${DRAWER} [data-slot="drawer-grabber"]`),
      row: stop === "head" ? null : await rowTakes(),
    };
    if (stop === "whole") {
      // 10. The pick there takes the drawer down to its head.
      await page.waitForTimeout(900);
      const after = await read();
      kit.check(
        "10: at 390 a state picked at the drawer's last stop takes the drawer down to its head, the state picked seen",
        one.row === true &&
          after.foot !== null &&
          after.top !== null &&
          Math.abs(after.foot - after.top - after.head) <= 2,
        JSON.stringify({ row: one.row, after })
      );
      stops.push(one);
      break;
    }
    stops.push(one);
    if (!ok(one)) {
      break;
    }
    await page.locator(`${DRAWER} [data-slot="drawer-grabber"]`).click();
    await page.waitForTimeout(900);
  }
  kit.check(
    "5b: at 390 each of the drawer's stops stands its height over the surface's foot (head, half, whole up to the head's room), its grabber and a state row take a press, the stage ends at its top",
    stops.length === 3 && stops.every(ok),
    JSON.stringify(stops)
  );
}

/** Leg 9: both states files stand in the components' menu from the graph's first paint. */
async function componentsListed(kit: Kit, page: Page): Promise<void> {
  const trigger = page
    .locator(`${GRAPH} [data-slot="stage-head"] button[aria-haspopup="menu"]`)
    .first();
  const standing = await trigger.isVisible().catch(() => false);
  let items: string[] = [];
  if (standing) {
    await trigger.click();
    items = await page
      .locator('[role="menuitemradio"]')
      .allTextContents()
      .catch(() => []);
    await page.keyboard.press("Escape");
  }
  kit.check(
    "9: a canvas of two states files lists both in its components' menu from the graph's first paint",
    standing && items.length === 2,
    JSON.stringify({ standing, items })
  );
}

/** Leg 8: in the session's panel at its default width, the inspector is a sheet over the well's foot and the stage keeps its width. */
async function inspectorInPanel(kit: Kit, page: Page): Promise<void> {
  const stageWidth = () =>
    page.evaluate(
      (frameAt) =>
        document.querySelector<HTMLIFrameElement>(frameAt)?.clientWidth ?? 0,
      FRAME
    );
  const before = await stageWidth();
  const toggle = page.locator(`${PANE} button[aria-label="Inspect"]`).first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  } else {
    await page.locator(`${PANE} [data-slot="more"]`).first().click();
    await page.getByRole("menuitemcheckbox", { name: "Inspect" }).click();
  }
  await page.waitForTimeout(1200);
  const after = await stageWidth();
  const sheet = await page
    .locator(`${PANE} [aria-label="Inspector"][data-sheet]`)
    .count();
  kit.check(
    "8: in the session's panel at its default width Inspect stands the inspector over the well's foot as a sheet, and the stage keeps its width",
    sheet === 1 && before > 0 && Math.abs(after - before) <= 1,
    JSON.stringify({ sheet, before, after })
  );
}

/** The room's Map face, and its list at a phone's width. */
const MAP = `${GRAPH} [data-slot="whole-set"]`;
const MAP_LIST = `${GRAPH} [data-slot="whole-list"]`;

/** The room's face named `name`, pressed on its switch inside `within` (the room beside the stage, or the drawer). */
const showFace = (page: Page, within: string, name: string) =>
  page
    .locator(`${GRAPH} ${within} [role="tab"]`, { hasText: name })
    .first()
    .click();

/** The graph-map leg at 1440: legs map 1 to 4, and the Map face's rendered checks. */
async function mapDesk(
  kit: Kit,
  base: string,
  id: string,
  checks: RenderedChecks
): Promise<void> {
  const { frame, page } = await graphPage(kit, base, id, "desk");
  await showFace(page, '[data-slot="graph-room"]', "Map");
  await page.waitForSelector(`${MAP} .svelte-flow__edge path[data-played]`, {
    timeout: 30_000,
  });
  // The cards measured, the set laid out by them and fitted again.
  await page.waitForTimeout(1500);
  const drawn = await page.evaluate((map) => {
    const pane = document.querySelector(map);
    const viewport = pane?.querySelector<HTMLElement>(".svelte-flow__viewport");
    const root = getComputedStyle(document.documentElement);
    const rem = Number.parseFloat(root.fontSize);
    const zoom = viewport
      ? new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a
      : 0;
    const box = pane?.getBoundingClientRect();
    const cards = [
      ...(pane?.querySelectorAll('[data-slot="whole-state"]') ?? []),
    ].map((card) => card.getBoundingClientRect());
    return {
      regions: [
        ...(pane?.querySelectorAll('[data-slot="machine"] h3') ?? []),
      ].map((head) => head.textContent?.trim() ?? ""),
      arrows: [
        ...(pane?.querySelectorAll(".svelte-flow__edge path[data-played]") ??
          []),
      ].map((path) => ({
        played: path.getAttribute("data-played"),
        dashed: path.hasAttribute("stroke-dasharray"),
        name:
          path.closest(".svelte-flow__edge")?.getAttribute("aria-label") ?? "",
      })),
      zoom,
      readable:
        10 / (Number.parseFloat(root.getPropertyValue("--text-meta")) * rem),
      cards: cards.length,
      inside:
        !!box &&
        cards.every(
          (card) =>
            card.left >= box.left - 1 &&
            card.right <= box.right + 1 &&
            card.top >= box.top - 1 &&
            card.bottom <= box.bottom + 1
        ),
    };
  }, MAP);
  const solid = drawn.arrows.filter((one) => one.played === "played");
  const dashed = drawn.arrows.filter((one) => one.played === "named");
  kit.check(
    "map 1: the Map face draws one region per heading (Quiet, Loud) and one arrow per edge and per from: Two → Three solid, Three → One dashed",
    drawn.regions.length === 2 &&
      drawn.regions.includes("Quiet") &&
      drawn.regions.includes("Loud") &&
      drawn.arrows.length === 2 &&
      solid.length === 1 &&
      !solid[0]?.dashed &&
      solid[0]?.name.startsWith("Two → Three") === true &&
      dashed.length === 1 &&
      dashed[0]?.dashed === true &&
      dashed[0]?.name.startsWith("Three → One") === true,
    JSON.stringify(drawn)
  );
  kit.check(
    "map 2: the map fits at a readable zoom: no larger than the fit's 1, no smaller than its notes' 10px, every card inside its pane",
    drawn.cards === 3 &&
      drawn.zoom <= 1 + 0.001 &&
      drawn.zoom >= drawn.readable - 0.001 &&
      drawn.inside,
    JSON.stringify(drawn)
  );
  await checks.at(page, "1440, the Map face");

  // map 3. A press on Two's card.
  await page
    .locator(`${MAP} [data-slot="whole-state"] button`, { hasText: TWO_ALONE })
    .first()
    .click();
  const atTwo = await until(
    "the drawing at Two",
    () => drawnStory(frame),
    (story) => story === "Two",
    30_000
  ).catch(() => drawnStory(frame));
  kit.check(
    "map 3: a press on Two's card on the map keeps it: the drawing stands at Two",
    atTwo === "Two",
    String(atTwo)
  );
  await page.waitForSelector(`${GRAPH}:not([data-arriving])`);

  // map 4. A press on the agent's arrow, by its act.
  await page
    .locator(`${MAP} .svelte-flow__edge-label button`, {
      hasText: "Calm down",
    })
    .first()
    .click();
  const atOne = await until(
    "the drawing at One",
    () => drawnStory(frame),
    (story) => story === "One",
    30_000
  ).catch(() => drawnStory(frame));
  kit.check(
    "map 4: a press on the arrow Three → One opens the Animation face on that move: the drawing stands at One, the face's title names Three → One",
    atOne === "One" &&
      (
        (await page
          .locator(`${GRAPH} [data-slot="move-title"]`)
          .first()
          .textContent()
          .catch(() => "")) ?? ""
      ).includes("Three → One"),
    String(atOne)
  );
  await page.close();
}

/** The graph-map leg at 390: leg map 5, and the Map face's rendered checks there. */
async function mapPhone(
  kit: Kit,
  base: string,
  id: string,
  checks: RenderedChecks
): Promise<void> {
  const { page } = await graphPage(kit, base, id, "phone");
  const DRAWER = '[data-slot="drawer-content"]';
  await showFace(page, DRAWER, "Map");
  // Past its head stop the drawer draws its face's body.
  await page.locator(`${GRAPH} ${DRAWER} [data-slot="drawer-grabber"]`).click();
  await page.waitForTimeout(900);
  const shown = await page.evaluate(
    ([list, graph]) => ({
      cards: document.querySelectorAll(`${list} [data-slot="whole-state"]`)
        .length,
      flow: !!document.querySelector(`${graph} .svelte-flow`),
    }),
    [MAP_LIST, GRAPH] as const
  );
  kit.check(
    "map 5: at 390 the Map face is a list, each state its card, and no map that pans and zooms",
    shown.cards === 3 && !shown.flow,
    JSON.stringify(shown)
  );
  await checks.at(page, "390, the Map face's list");
  await page.close();
}

/** What the page last said differs, as the panel heard it. */
interface Differences {
  ask: number;
  beside: boolean;
  found: { kind: string; line: string }[];
  same: boolean;
  type: string;
}

/** The routine form's design graph at `view`, Compare pressed on in its bar and read. */
async function comparing(
  kit: Kit,
  base: string,
  id: string,
  view: "desk" | "phone"
): Promise<{ frame: Frame; page: Page; said: Differences | null }> {
  const { frame, page } = await graphPage(
    kit,
    base,
    id,
    view,
    '[data-slot="routine-form"]',
    300_000
  );
  await page
    .locator(
      `${GRAPH} [data-slot="stage-head"] button[aria-label^="${graphWords.compare("")}"]`
    )
    .first()
    .click();
  // Compare reading what differs holds the graph arriving.
  await page
    .waitForSelector(`${GRAPH}[data-arriving]`, { timeout: 5000 })
    .catch(() => undefined);
  await page.waitForSelector(`${GRAPH}:not([data-arriving])`, {
    timeout: 60_000,
  });
  // Its reads within the settle, as both drawings come to rest.
  await page.waitForTimeout(1500);
  const said = (
    (await page.evaluate(
      () => (window as unknown as { __answers: unknown[] }).__answers
    )) as Differences[]
  )
    .filter((one) => one.type === STAGE_DIFFERENCES)
    .at(-1);
  return { frame, page, said: said ?? null };
}

/** Legs compare 1 to 3 and 5 at 1440. */
async function compareDesk(
  kit: Kit,
  base: string,
  id: string,
  checks: RenderedChecks
): Promise<void> {
  const { frame, page, said } = await comparing(kit, base, id, "desk");
  const listed = await page
    .locator(`${GRAPH} [data-slot="stage-head"] [data-slot="difference"]`)
    .allTextContents();
  const told = said?.found.map((one) => one.line) ?? [];
  kit.check(
    "compare 1: Compare on with the routine form at Just opened reads the lines the branch read, told by the page and listed at the stage's head",
    BRANCH_LINES.every(
      (line) => told.includes(line) && listed.some((one) => one.trim() === line)
    ),
    JSON.stringify({ told, listed })
  );
  await checks.at(page, "1440, Compare on");

  // compare 2 and 3. Each line's press, its ring in view; one that went flips.
  await listenFor(frame, STAGE_COMPARE, "__compares");
  const pressed: {
    flipped: boolean;
    inView: boolean;
    kind: string;
    line: string;
    show: string | null;
    /** Where it stood, read only for a ring out of view: what settles why (the scroll short, or the frame changed under it). */
    why?: unknown;
  }[] = [];
  const lines = said?.found ?? [];
  /** The stage's frame's height in the panel, px. */
  const frameHeight = () =>
    page
      .locator(FRAME)
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
  /** The ring for line `index` against the frame's own view, and the page's scroll. */
  const ringRead = (index: number) =>
    frame.evaluate((at) => {
      const ring = document.querySelector(
        `.cawco-change-ring[data-at="${at}"]`
      );
      const box = ring?.getBoundingClientRect();
      const compares = (
        window as unknown as { __compares?: { show?: string }[] }
      ).__compares;
      // The frame's own view, by the platform's getter: the page answers
      // the root's clientWidth at the drawing's box (viewport.ts).
      const root = document.documentElement;
      const across = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "clientWidth"
      )?.get?.call(root) as number;
      const scroller = document.scrollingElement ?? root;
      return {
        inView:
          !!box &&
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= root.clientHeight &&
          box.right <= across,
        flipped: !!document.querySelector(
          ".cawco-stage-frame.cawco-stage-flipped"
        ),
        show: compares?.at(-1)?.show ?? null,
        ring: box
          ? {
              top: Math.round(box.top),
              bottom: Math.round(box.bottom),
              left: Math.round(box.left),
              right: Math.round(box.right),
            }
          : null,
        rings: document.querySelectorAll(".cawco-change-ring").length,
        view: {
          across,
          high: root.clientHeight,
          // Not answered by the page (viewport.ts answers widths alone).
          innerHeight: window.innerHeight,
        },
        scroll: {
          top: Math.round(scroller.scrollTop),
          left: Math.round(scroller.scrollLeft),
          topMost: scroller.scrollHeight - scroller.clientHeight,
          leftMost: scroller.scrollWidth - scroller.clientWidth,
        },
      };
    }, index);
  // The stage page's and the panel's console from here, said when a ring stands out of view.
  const consoleSaid: string[] = [];
  page.on("console", (message) => {
    consoleSaid.push(
      `${message.type()} ${message.location().url.slice(0, 60)}: ${message.text().slice(0, 300)}`
    );
  });
  for (const [at, one] of lines.entries()) {
    const before = await frameHeight();
    // When the page hears the press's reveal, and when its scroll first moves, from just before the press, on its own clock.
    await frame.evaluate(() => {
      const timed = window as unknown as {
        __press?: { heard: number | null; scrolled: number | null };
      };
      const t0 = performance.now();
      const press = {
        heard: null as number | null,
        scrolled: null as number | null,
      };
      timed.__press = press;
      addEventListener(
        "cawco:stage-reveal",
        () => {
          press.heard ??= Math.round(performance.now() - t0);
        },
        { once: true }
      );
      addEventListener(
        "scroll",
        () => {
          press.scrolled ??= Math.round(performance.now() - t0);
        },
        { once: true }
      );
    });
    await page
      .locator(`${GRAPH} [data-slot="stage-head"] [data-slot="difference"]`)
      .nth(at)
      .click();
    await page.waitForTimeout(900);
    const read = await ringRead(at);
    const { inView, flipped, show } = read;
    if (!inView) {
      // Out of view: read again once any scroll has had time to end, with
      // the frame's height at the press and now, and the lines the panel
      // lists now, so the run says whether the reveal stopped short (its
      // scroll still, short of the ring, the frame as tall as it was) or
      // the frame changed under it.
      await page.waitForTimeout(1500);
      pressed.push({
        inView,
        flipped,
        show,
        kind: one.kind,
        line: one.line,
        why: {
          at900: read,
          at2400: await ringRead(at),
          press: await frame.evaluate(
            () => (window as unknown as { __press?: unknown }).__press ?? null
          ),
          console: consoleSaid.slice(-20),
          frame: { pressed: before, now: await frameHeight() },
          listed: await page
            .locator(
              `${GRAPH} [data-slot="stage-head"] [data-slot="difference"]`
            )
            .allTextContents(),
        },
      });
      continue;
    }
    pressed.push({ inView, flipped, show, kind: one.kind, line: one.line });
  }
  kit.check(
    "compare 2: each line's press brings its ring into view, inside the stage's frame",
    pressed.length > 0 && pressed.every((one) => one.inView),
    JSON.stringify(pressed)
  );
  const went = pressed.filter((one) => one.kind === "went");
  kit.check(
    "compare 3: a press on a line of what went flips: the panel posts show compared, and the page stands the compared drawing in the kept one's place",
    went.length > 0 &&
      went.every((one) => one.flipped && one.show === "compared"),
    JSON.stringify(went)
  );
  await page.close();
}

/** Leg compare 4 at 2529, the room closed. */
async function compareWide(kit: Kit, base: string, id: string): Promise<void> {
  const { frame, page } = await graphPage(
    kit,
    base,
    id,
    "desk",
    '[data-slot="routine-form"]',
    300_000
  );
  await page.setViewportSize(WIDE);
  // The room is named by its faces: States, Map and, since slice 4, Animation.
  const roomName = graphWords.room([
    graphWords.statesFace,
    graphWords.wholeSet,
    graphWords.moveFace,
  ]);
  await page
    .locator(
      `${GRAPH} [data-slot="stage-head"] button[data-slot="room-switch"][aria-label="${graphWords.closeRoom(roomName)}"]`
    )
    .first()
    .click();
  await page.waitForTimeout(900);
  await page
    .locator(
      `${GRAPH} [data-slot="stage-head"] button[aria-label^="${graphWords.compare("")}"]`
    )
    .first()
    .click();
  await page.waitForSelector(`${GRAPH}:not([data-arriving])`, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  const said = (
    (await page.evaluate(
      () => (window as unknown as { __answers: unknown[] }).__answers
    )) as Differences[]
  )
    .filter((one) => one.type === STAGE_DIFFERENCES)
    .at(-1);
  const names = await frame.evaluate(() => {
    const row = document.querySelector<HTMLElement>(".cawco-stage-names");
    return row && !row.hidden
      ? [...row.children].map((one) => one.textContent?.trim() ?? "")
      : [];
  });
  kit.check(
    "compare 4: at 2529, the room closed, the two drawings stand side by side, each named",
    said?.beside === true &&
      names.length === 2 &&
      names[0] === "Just opened" &&
      names[1] === "Filled in",
    JSON.stringify({ beside: said?.beside, names })
  );
  await page.close();
}

/** Leg compare 5 at 390. */
async function comparePhone(
  kit: Kit,
  base: string,
  id: string,
  checks: RenderedChecks
): Promise<void> {
  const { page } = await comparing(kit, base, id, "phone");
  await checks.at(page, "390, Compare on");
  await page.close();
}

/** The width and height a png's header says. */
const pngSize = (png: Buffer) => ({
  w: png.readUInt32BE(16),
  h: png.readUInt32BE(20),
});

/** A clip as the page tells it in a reach's answer. */
interface ClipSaid {
  delay: number;
  duration: number;
  element: string;
  start: number;
}
/** The move's clock as the page tells it. */
interface TimeSaid {
  length: number;
  playing: boolean;
  t: number;
  type: string;
}

/** What the hub's read of an artifact answers of the person's values: his dials and his tuned timing. */
interface ValuesRead {
  dials?: Record<string, unknown>;
  tuned?: unknown[];
}

/** The Animation face's row named `row`, as a locator. */
const rowNamed = (page: Page, row: string) =>
  page.locator(`${GRAPH} [data-slot="clip"]`).filter({ hasText: row }).first();

/** The answers the panel heard, of `type`. */
const heardOf = async <T>(page: Page, type: string): Promise<T[]> =>
  (
    (await page.evaluate(
      () => (window as unknown as { __answers: unknown[] }).__answers
    )) as { type: string }[]
  ).filter((one) => one.type === type) as T[];

/** The graph-move leg at 1440: move 1 to 7 there, with move-chips and move-runs. */
async function moveDesk(
  kit: Kit,
  base: string,
  id: string,
  read: () => Promise<ValuesRead>,
  checks: RenderedChecks
): Promise<void> {
  const { frame, page } = await graphPage(
    kit,
    base,
    id,
    "desk",
    '[data-slot="routine-form"]',
    300_000,
    "?face=move"
  );
  await page.waitForSelector(`${GRAPH} [data-slot="timeline"]`, {
    timeout: 60_000,
  });
  // move 1. The clips, each at its own startTime.
  const reached = await heardOf<{ move?: { clips: ClipSaid[] } | null }>(
    page,
    STAGE_REACHED
  );
  const clips = reached.findLast((one) => one.move)?.move?.clips ?? [];
  const together = clips.some((one, at) =>
    clips.some(
      (other, there) => there !== at && Math.abs(other.start - one.start) <= 1
    )
  );
  kit.check(
    "move 1: the reach answers its move's clips, two set off together standing within 1 ms of each other",
    clips.length > 1 && together,
    JSON.stringify(clips.map((one) => [one.element, one.start]))
  );
  const length = Math.max(
    ...clips.map((one) => one.start + one.delay + one.duration)
  );

  // move 2. Play: the clock said as it starts and as it ends.
  await page.locator(`${GRAPH} [data-slot="transport"] button`).first().click();
  const ended = await until(
    "the play's end",
    () => heardOf<TimeSaid>(page, STAGE_TIME),
    (said) => said.some((one) => !one.playing),
    30_000
  ).catch(() => heardOf<TimeSaid>(page, STAGE_TIME));
  const started = ended.find((one) => one.playing);
  const end = ended.find((one) => !one.playing);
  kit.check(
    "move 2: Play is followed by cawco:stage-time as it starts and as it ends, its length the clips' last end",
    !!started &&
      !!end &&
      Math.abs(end.length - length) <= 1 &&
      Math.abs(end.t - length) <= 1,
    JSON.stringify({ length, ended })
  );

  // move 3. A press on the ruler at 35%: the replays held there.
  const ruler = await page
    .locator(`${GRAPH} [data-slot="ruler-lane"]`)
    .first()
    .boundingBox();
  if (ruler) {
    await page.mouse.click(
      ruler.x + ruler.width * 0.35,
      ruler.y + ruler.height / 2
    );
  }
  await page.waitForTimeout(500);
  // The replays (each carries the page's REPLAY_ID), and apart from them the component's own animations, said as they stand.
  const held = await frame.evaluate(
    (replay) =>
      document
        .getAnimations()
        .filter((one) => one.timeline instanceof DocumentTimeline)
        .map((one) => ({
          replay: one.id === replay,
          state: one.playState,
          kind: one.constructor.name,
        })),
    REPLAY_ID
  );
  const replays = held.filter((one) => one.replay);
  kit.check(
    "move 3: a press on the ruler at 35% holds the page's replays there: every one paused",
    replays.length > 0 && replays.every((one) => one.state === "paused"),
    JSON.stringify({
      replays: replays.map((one) => one.state),
      own: held.filter((one) => !one.replay),
    })
  );

  // move 4. A drag of Form failure's end: tuned in the doc, with offTokens.
  const failureEnd = rowNamed(page, FAILURE_ROW)
    .locator('[data-run-end="end"]')
    .first();
  const grip = await failureEnd.boundingBox();
  let tuned: unknown[] = [];
  if (grip) {
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 8 });
    await page.mouse.up();
    const let_go = Date.now();
    tuned = await until(
      "tuned in the doc",
      async () => (await read()).tuned ?? [],
      (said) => said.length > 0,
      10_000
    ).catch(() => []);
    kit.note(
      `move 4: tuned read ${Date.now() - let_go} ms after the drag let go`
    );
  }
  kit.check(
    "move 4: a drag of Form failure's end writes tuned into the doc, read back with offTokens",
    tuned.some(
      (one) =>
        typeof one === "object" &&
        one !== null &&
        "offTokens" in one &&
        String((one as { animation?: unknown }).animation).includes(FAILURE_ROW)
    ),
    JSON.stringify(tuned)
  );

  // move 5. Another move and back keeps the edit.
  const pick = async (name: string) => {
    await page.locator(`${GRAPH} [data-slot="move-title"]`).first().click();
    await page
      .locator('[role="listbox"] [role="option"]', { hasText: name })
      .first()
      .click();
    await page.waitForSelector(`${GRAPH}:not([data-arriving])`, {
      timeout: 60_000,
    });
    await page.waitForSelector(`${GRAPH} [data-slot="timeline"]`, {
      timeout: 60_000,
    });
  };
  await pick("Filled in → Creating");
  await pick("Filled in → Hub didn't answer");
  const kept = await rowNamed(page, FAILURE_ROW)
    .locator("[data-edited]")
    .count();
  kit.check(
    "move 5: another move from the title's menu and back keeps the edit: Form failure still carries its restore glyph",
    kept > 0,
    String(kept)
  );

  // move 6. Reset all empties tuned.
  await page.locator(`${GRAPH} [data-slot="reset-all"]`).first().click();
  const emptied = await until(
    "tuned emptied",
    async () => (await read()).tuned ?? [],
    (said) => said.length === 0,
    10_000
  ).catch(() => null);
  kit.check(
    "move 6: Reset all empties tuned",
    emptied !== null && emptied.length === 0,
    JSON.stringify(emptied)
  );

  // move 7. The rendered checks on the face.
  await checks.at(page, "1440, the Animation face");
  await moveChips(kit, page, "1440");
  await moveRuns(kit, page, "1440");
  await page.close();
}

/** The graph-move leg at 390: the drawer at its whole stop, the face's rendered checks, its chips and runs. */
async function movePhone(
  kit: Kit,
  base: string,
  id: string,
  checks: RenderedChecks
): Promise<void> {
  const { page } = await graphPage(
    kit,
    base,
    id,
    "phone",
    '[data-slot="routine-form"]',
    300_000,
    "?face=move"
  );
  for (const _ of [0, 1]) {
    await page.locator(`${GRAPH} [data-slot="drawer-grabber"]`).first().click();
    await settle(page);
  }
  await page.waitForSelector(`${GRAPH} [data-slot="timeline"]`, {
    timeout: 60_000,
  });
  await checks.at(page, "390, the Animation face in the drawer");
  await moveChips(kit, page, "390");
  await moveRuns(kit, page, "390");
  await page.close();
}

/**
 * move-chips: the face at rest, then every row and each animation's row
 * under it opened in turn, each chip opened and read with its list over the
 * face (the branch's web spec, on the panel), no press ending on an error
 * page.
 */
async function moveChips(kit: Kit, page: Page, at: string): Promise<void> {
  const checks = new RenderedChecks(kit, `move-chips ${at}`, {
    scope: `${GRAPH} [data-slot="move"]`,
    except: [
      {
        rule: "overflow",
        selector: '[data-slot="clip"] span',
        text: "run 1",
        reason:
          "an animation row's words under the open Length list, a layer that floats over the face (impeccable's text-occlusion reads the popover as a cover; the house's layer reading names it)",
      },
      {
        rule: "fat-row",
        selector: '[data-slot="clip"]',
        reason:
          "on a narrow face each row is two lines by design: its name over a lane the face's full width (T18; the second review kept it)",
      },
    ],
  });
  await checks.at(page, "the face at rest");
  let opened = 0;
  let failed = 0;
  const stuck: string[] = [];
  // A row's own press: the first child of its name cell, never a chip's.
  const rows = page.locator(
    `${GRAPH} [data-slot="clip"] > div:first-child > button[aria-expanded]`
  );
  eachRow: for (let row = 0; row < (await rows.count()); row += 1) {
    const press = rows.nth(row);
    const name = (await press.getAttribute("aria-label")) ?? `row ${row}`;
    if ((await press.getAttribute("aria-expanded")) !== "true") {
      await press.click();
      await settle(page);
    }
    const chips = page.locator(
      `${GRAPH} [data-slot="clip-settings"] [data-slot="popover-trigger"]`
    );
    for (let chip = 0; chip < (await chips.count()); chip += 1) {
      const trigger = chips.nth(chip);
      const label =
        (await trigger.getAttribute("aria-label")) ?? `chip ${chip}`;
      await trigger.click();
      await page
        .waitForSelector('[data-slot="popover-content"][data-state="open"]', {
          timeout: 5000,
        })
        .catch(() => undefined);
      await settle(page);
      opened += 1;
      await checks.at(page, `${name}: ${label} open`);
      await page.keyboard.press("Escape");
      await settle(page);
      if ((await page.locator("body").innerText()).startsWith("500")) {
        failed += 1;
      }
      // Escape put it away: no popover still drawn, nor its wrapper taking
      // presses over the next chip. What stands instead is said whole.
      const left = await standingAfterEscape(page);
      if (left) {
        stuck.push(`${name}: ${label}: ${left}`);
        break eachRow;
      }
    }
  }
  kit.check(
    `move-chips ${at}: every row's settings chips open and close, none ends on an error page`,
    opened > 0 && failed === 0 && stuck.length === 0,
    `${opened} opened, ${failed} on an error page${stuck.length > 0 ? `; Escape left open: ${stuck.join("; ")}` : ""}`
  );
  checks.report();
}

/**
 * What still stands after Escape on an open settings chip, or null when
 * nothing does: each kit popover still drawn (its state, its wrapper's
 * pointer-events), where the focus is, every bits-ui escape layer (the
 * topmost of which takes Escape) and each tooltip shown.
 */
async function standingAfterEscape(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const drawn = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="popover-content"]'
      ),
    ].filter((one) => {
      const r = one.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    if (drawn.length === 0) {
      return null;
    }
    const what = (el: Element | null) =>
      el
        ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.getAttribute("data-slot") ? `[data-slot=${el.getAttribute("data-slot")}]` : ""}${el.getAttribute("aria-label") ? `[aria-label="${el.getAttribute("aria-label")}"]` : ""}`
        : "none";
    const layers = (
      globalThis as unknown as {
        bitsEscapeLayers?: Map<
          { opts?: { ref?: { current?: Element } } },
          { current: string }
        >;
      }
    ).bitsEscapeLayers;
    const tips = [
      ...document.querySelectorAll(
        '[data-slot="tooltip-content"]:not([data-state="closed"]), [data-tooltip-content]:not([data-state="closed"])'
      ),
    ].map((tip) => tip.textContent?.trim().slice(0, 40));
    return JSON.stringify({
      drawn: drawn.map((one) => ({
        state: one.getAttribute("data-state"),
        wrapper: getComputedStyle(
          one.closest("[data-bits-floating-content-wrapper]") ?? one
        ).pointerEvents,
        holds: what(one.querySelector("input, button")),
      })),
      focus: what(document.activeElement),
      frameFocused: document.activeElement?.tagName === "IFRAME",
      layers: layers
        ? [...layers].map(
            ([layer, behaviour]) =>
              `${what(layer.opts?.ref?.current ?? null)}:${behaviour.current}`
          )
        : "none",
      tips,
    });
  });
}

/** move-runs: the row of two runs moves one run at a time, by a drag and by an arrow. */
async function moveRuns(kit: Kit, page: Page, at: string): Promise<void> {
  const barsOf = () =>
    page.evaluate((named) => {
      const lane = [...document.querySelectorAll('[data-slot="clip"]')].find(
        (one) => one.textContent?.includes(named)
      );
      return [...(lane?.querySelectorAll('[data-slot="run-bar"]') ?? [])].map(
        (bar) => {
          const box = bar.getBoundingClientRect();
          return {
            run: (bar as HTMLElement).dataset.run ?? "",
            now: Number(bar.getAttribute("aria-valuenow")),
            left: Math.round(box.left * 10) / 10,
            right: Math.round(box.right * 10) / 10,
          };
        }
      );
    }, RUNS_ROW);
  type Bar = Awaited<ReturnType<typeof barsOf>>[number];
  const same = (one: Bar | undefined, other: Bar | undefined) =>
    !!one &&
    !!other &&
    one.now === other.now &&
    Math.abs(one.left - other.left) < 0.5 &&
    Math.abs(one.right - other.right) < 0.5;
  const before = await barsOf();
  // Its runs as the engine ran them (motion.ts runsOf: clips whose windows overlap are one run): two or more, by the move's own timing.
  const [a] = before;
  const b = before.at(-1);
  kit.check(
    `move-runs ${at}: “${RUNS_ROW}” stands as more than one run, each its own bar`,
    before.length >= 2,
    JSON.stringify(before)
  );
  if (!(a && b && a !== b)) {
    return;
  }
  /** Every bar but run `moved`'s stands where it stood. */
  const restStay = (now: Bar[], was: Bar[], moved: string) =>
    was
      .filter((one) => one.run !== moved)
      .every((one) =>
        same(
          now.find((bar) => bar.run === one.run),
          one
        )
      );
  const row = rowNamed(page, RUNS_ROW);
  const box = await row
    .locator(`[data-slot="run-bar"][data-run="${a.run}"]`)
    .boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 8 });
    await page.mouse.up();
  }
  await settle(page);
  const dragged = await barsOf();
  kit.check(
    `move-runs ${at}: a drag on the first run moves it, and every other run's start and end stay`,
    dragged.find((one) => one.run === a.run)?.now !== a.now &&
      restStay(dragged, before, a.run),
    `before ${JSON.stringify(before)} after ${JSON.stringify(dragged)}`
  );
  await row
    .locator(`[data-slot="run-bar"][data-run="${b.run}"]`)
    .focus({ focusVisible: true } as never);
  await page.keyboard.press("ArrowRight");
  await settle(page);
  const keyed = await barsOf();
  kit.check(
    `move-runs ${at}: an arrow on the last run moves it, and every other run stays`,
    keyed.find((one) => one.run === b.run)?.now !==
      dragged.find((one) => one.run === b.run)?.now &&
      restStay(keyed, dragged, b.run),
    `before ${JSON.stringify(dragged)} after ${JSON.stringify(keyed)}`
  );
}

/** The graph-dials leg: dials 1 to 6. */
async function dialsLegs(
  kit: Kit,
  base: string,
  id: string,
  read: () => Promise<ValuesRead>,
  update: () => Promise<string>,
  checks: RenderedChecks
): Promise<void> {
  const ROOM = `${GRAPH} [data-slot="graph-room"]`;
  const { frame, page } = await graphPage(
    kit,
    base,
    id,
    "desk",
    '[data-probe="swatch"]',
    120_000,
    "?face=dials"
  );
  const rows = () => page.locator(`${ROOM} [data-dial-row]`).count();
  await page
    .waitForSelector(`${ROOM} [data-dial-row]`, { timeout: 30_000 })
    .catch(() => undefined);
  kit.check(
    "dials 1: all four dials stand in the Dials face at 1440",
    (await rows()) === DIALS.length,
    String(await rows())
  );
  await settle(page);
  await checks.at(page, "1440, the Dials face");
  const drawn = () =>
    frame.evaluate(() => {
      const body = document.querySelector<HTMLElement>("[data-stage-drawing]");
      const swatch = document.querySelector<HTMLElement>(
        '[data-probe="swatch"]'
      );
      const style = body ? getComputedStyle(body) : null;
      return {
        radius: style?.getPropertyValue("--swatch-radius").trim() ?? "",
        ink: style?.getPropertyValue("--swatch-ink").trim() ?? "",
        tone: swatch?.dataset.tone ?? "",
        framed: swatch?.dataset.framed ?? "",
      };
    });
  const before = await drawn();
  // dials 2. A turn of each.
  const radius = page
    .locator(`${ROOM} [data-dial="radius"] [role="spinbutton"]`)
    .first();
  await radius.focus();
  for (const _ of [0, 1, 2]) {
    await page.keyboard.press("ArrowUp");
  }
  const ink = page
    .locator(`${ROOM} [data-dial="ink"] input:not([type="color"])`)
    .first();
  await ink.fill("#aa1122");
  await ink.press("Enter");
  await page
    .locator(`${ROOM} [data-dial="tone"] [data-slot="select-trigger"]`)
    .first()
    .click();
  await page.locator('[role="option"]', { hasText: "loud" }).first().click();
  await page
    .locator(`${ROOM} [data-dial="framed"] [data-slot="switch"]`)
    .first()
    .click();
  const after = await until(
    "the drawing turned",
    drawn,
    (now) => now.tone === "loud" && now.framed === "true",
    10_000
  ).catch(drawn);
  kit.check(
    "dials 2: a turn of each changes the drawing: the radius and ink variables on its root, the tone and framed args after update",
    after.radius !== before.radius &&
      after.ink !== before.ink &&
      after.tone === "loud" &&
      after.framed === "true",
    JSON.stringify({ before, after })
  );
  // dials 3. The hub's read.
  const kept = await until(
    "the dials in the doc",
    async () => (await read()).dials ?? {},
    (said) => said.tone === "loud" && said.framed === true,
    10_000
  ).catch(async () => (await read()).dials ?? {});
  kit.check(
    "dials 3: the hub's read answers each turned value under dials",
    kept.tone === "loud" &&
      kept.framed === true &&
      typeof kept.radius === "number" &&
      typeof kept.ink === "string",
    JSON.stringify(kept)
  );
  // dials 4. A fifth, without a reopen.
  const updated = await update();
  const five = await until(
    "the fifth dial",
    rows,
    (n) => n === DIALS.length + 1,
    60_000
  ).catch(rows);
  kit.check(
    "dials 4: artifact_update adds a fifth dial, which stands without a reopen",
    five === DIALS.length + 1,
    `${five}; ${short(updated)}`
  );
  // dials 5. Nothing of the old dial panel's library on the stage.
  const live = await (
    await page.locator(FRAME).first().elementHandle()
  )?.contentFrame();
  const foreign = await (live ?? frame).evaluate(() => ({
    elements: document.querySelectorAll(
      '[class*="dialkit"], #cawco-dock-dials, #cawco-dock-timeline'
    ).length,
    scripts: [...document.scripts].filter((one) => one.src.includes("dialkit"))
      .length,
  }));
  kit.check(
    "dials 5: no element of the old dial panel's library stands on the stage page, and no script of it loads",
    foreign.elements === 0 && foreign.scripts === 0,
    JSON.stringify(foreign)
  );
  await page.close();

  // dials 1 and 6 at 390: the drawer at its half stop holds the dials.
  const phone = await graphPage(
    kit,
    base,
    id,
    "phone",
    '[data-probe="swatch"]',
    120_000,
    "?face=dials"
  );
  await phone.page
    .waitForSelector(`${GRAPH} [data-slot="drawer-content"] [data-dial-row]`, {
      timeout: 30_000,
    })
    .catch(() => undefined);
  const narrow = await phone.page
    .locator(`${GRAPH} [data-slot="drawer-content"] [data-dial-row]`)
    .count();
  kit.check(
    "dials 1: every dial stands in the drawer at 390",
    narrow >= DIALS.length,
    String(narrow)
  );
  // The drawer's title morphs once as the dials arrive and name the Dials face in it ("States, map, animation and dials"): read once it lands.
  await settle(phone.page);
  await checks.at(phone.page, "390, the Dials face in the drawer");
  await phone.page.close();
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await Promise.all(
    Object.entries(PROJECT).map(async ([file, text]) => {
      await mkdir(dirname(join(fleet.repo, file)), { recursive: true });
      await writeFile(join(fleet.repo, file), text);
    })
  );
  await Bun.$`bun install --lockfile-only --no-progress`
    .cwd(fleet.repo)
    .quiet();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Graph cards", fleet.repo);
  const callIn =
    (from: string) => async (n: string, name: string, input: object) => {
      calls.ask(n, { name, input: { response_format: "detailed", ...input } });
      await fleet.send(from, calls.words(n));
      return (await until(
        `${name}'s answer`,
        () => calls.answer(n),
        Boolean,
        240_000
      )) as string;
    };
  const call = callIn(session);
  const base = await fleet.dashboard();
  // The page open first, so the canvas the session makes stands in its panel.
  const watching = await kit.page("desk", { theme: "light" });
  await open(watching, `${base}/session/${session}`, '[data-slot="pane"]');
  const created = await call("1", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "graph-card",
    file: [STORY, BADGE],
    does: "judge",
    title: "Probe judge artifact",
    ask: ASK,
  });
  const id = created.match(ID)?.[1];
  if (!id) {
    kit.check("1: artifact_create answers an id", false, short(created));
    return;
  }
  await watching.waitForSelector(`${GRAPH}:not([data-arriving])`, {
    timeout: 120_000,
  });
  await componentsListed(kit, watching);

  // 2. The panel's own report, read from its rig: the hub's read waits on a section the panel is still drawing, and says one that outlasts its wait.
  let read = await call("2", "mcp__cawco__artifact_read", { id });
  // A read that says a section is still drawing is read again, as its words ask.
  for (let again = 1; again <= 2 && renderOf(read)?.drawing; again += 1) {
    read = await call(`2-again-${again}`, "mcp__cawco__artifact_read", { id });
  }
  const render = renderOf(read);
  const undrawn = (render?.frames ?? []).filter((one) => one.state !== "drawn");
  kit.check(
    "2: artifact_read answers every state's frame drawn, from the panel's report (by panel)",
    render?.by === "panel" &&
      (render.frames ?? []).length >= 3 &&
      undrawn.length === 0,
    render
      ? `by ${render.by} at ${render.at}; undrawn: ${undrawn.map((one) => `${one.story} (${one.interaction}) ${one.state}`).join(", ") || "none"}; still drawing: ${render.drawing ?? "none"}`
      : short(read)
  );
  await inspectorInPanel(kit, watching);
  await watching.close();

  const checks = new RenderedChecks(kit, "graph-stage", {
    scope: GRAPH,
  });
  await deskLegs(kit, base, id, checks);
  await phoneLegs(kit, base, id, checks);

  // The graph-map leg: a canvas of the card's states with groups and edges.
  const mapped = await call("map", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "graph-map",
    file: [STORY],
    does: "judge",
    title: "Probe judge artifact",
    ask: MAP_ASK,
    group: MAP_GROUP,
    edges: MAP_EDGES,
  });
  const mapId = mapped.match(ID)?.[1];
  kit.check(
    "map 0: artifact_create with group and edges answers an id",
    !!mapId,
    short(mapped)
  );
  if (mapId) {
    await mapDesk(kit, base, mapId, checks);
    await mapPhone(kit, base, mapId, checks);
  }

  // The graph-compare leg: the dashboard's routine form, from a session in this checkout.
  const routines = await fleet.spawn("claude", "Routine form", ROOT);
  const routine = await callIn(routines)(
    "compare",
    "mcp__cawco__artifact_create",
    {
      kind: "component",
      name: "graph-compare",
      file: [ROUTINE],
      does: "judge",
      title: "Routine form compared",
      ask: ROUTINE_ASK,
    }
  );
  const routineId = routine.match(ID)?.[1];
  kit.check(
    "compare 0: artifact_create of the routine form's states file answers an id",
    !!routineId,
    short(routine)
  );
  if (routineId) {
    await compareDesk(kit, base, routineId, checks);
    await compareWide(kit, base, routineId);
    await comparePhone(kit, base, routineId, checks);
  }

  // The graph-move leg: the routine form opened on the Animation face at Hub didn't answer.
  const moving = await callIn(routines)("move", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "graph-move",
    file: [ROUTINE],
    does: "judge",
    title: "Routine form's moves",
    ask: MOVE_ASK,
  });
  const moveId = moving.match(ID)?.[1];
  kit.check(
    "move 0: artifact_create of the routine form for its moves answers an id",
    !!moveId,
    short(moving)
  );
  if (moveId) {
    const readMove = () =>
      fleet.sessionApi<ValuesRead>(
        routines,
        hubRequest("GET /api/instances/:id/artifacts/:artifact", {
          path: { id: routines, artifact: moveId },
        })
      );
    await moveDesk(kit, base, moveId, readMove, checks);
    await movePhone(kit, base, moveId, checks);
  }

  // The graph-dials leg: a swatch with one dial of each kind.
  const dialed = await call("dials", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "graph-dials",
    file: [SWATCH],
    does: "judge",
    title: "Swatch dials",
    ask: "Tune the swatch",
    dials: DIALS,
  });
  const dialsId = dialed.match(ID)?.[1];
  kit.check(
    "dials 0: artifact_create with one dial of each kind answers an id",
    !!dialsId,
    short(dialed)
  );
  if (dialsId) {
    await dialsLegs(
      kit,
      base,
      dialsId,
      () =>
        fleet.sessionApi<ValuesRead>(
          session,
          hubRequest("GET /api/instances/:id/artifacts/:artifact", {
            path: { id: session, artifact: dialsId },
          })
        ),
      () =>
        call("dials-update", "mcp__cawco__artifact_update", {
          id: dialsId,
          dials: [...DIALS, FIFTH],
        }),
      checks
    );
  }
  checks.report();

  // 6. A picture of a state, through the daemon's render on the stage.
  const picture = await fleet.sessionApi<{ png?: string | null }>(
    session,
    hubRequest("GET /api/instances/:id/artifacts/:artifact", {
      path: { id: session, artifact: id },
      query: { png: "true", state: JSON.stringify({ story: "Two" }) },
    })
  );
  const size = picture.png ? pngSize(Buffer.from(picture.png, "base64")) : null;
  kit.check(
    "6: artifact_read with png and a state answers a picture of that state's drawing at 1:1, a desk's form wide",
    !!size && size.w === 1280 && size.h > 0,
    JSON.stringify(size)
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "graph-stage",
  host: "its stage runs in a place, a boundary of its own",
  run,
};
export default spec;
