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
 *    `c-graph-drawer-head`; whole up to the bar's foot) and no lower, its
 *    grabber takes a press where it is drawn, and past its head a state
 *    row in it takes one; the stage ends at its top.
 * 6. `artifact_read({ png: true, state: { story: "Two" } })` answers a
 *    picture of Two's drawing at 1:1 through the daemon's render on the
 *    stage (`by=stage`): 1280 px wide, a desk's form, for a card of no
 *    width of its own.
 * 7. The rendered checks on the panel's design graph at 1440×900 and
 *    390×844, the bar, the room and the stage's head.
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
 * The stage's boundary is made of user namespaces: like a spec that
 * delegates, it runs outside every workspace boundary (README "A spec that
 * delegates runs on the host").
 *
 *   bun scripts/probe-kit/run.ts graph-stage
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Frame, Page } from "playwright-core";
import {
  STAGE_LAID,
  STAGE_REACH,
  STAGE_REACHED,
} from "../../../packages/core/src/stage-graph";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import { type Kit, open, type Spec } from "../kit";
import { RenderedChecks } from "../rendered-checks";

const STORY = "src/Card.stories.js";
/** The canvas's second states file: a component of its own (legs 9). */
const BADGE = "src/Badge.stories.js";
/** The ask the canvas is made with: it names the state the graph opens on. */
const ASK = "Judge the card at Two";
/** The map's canvas: the card's states under two headings, and one move the agent names (the graph-map leg). */
const MAP_ASK = "Judge the card's map at One";
const MAP_GROUP = { One: "Quiet", Two: "Quiet", Three: "Loud" };
const MAP_EDGES = [{ from: "Three", to: "One", label: "Calm down" }];
/** Two's card's name, alone: not Two → Three. */
const TWO_ALONE = /^\s*Two\s*$/u;

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
  view: "desk" | "phone"
): Promise<{ frame: Frame; page: Page }> {
  const page = await kit.page(view, { theme: "light" });
  await hearAnswers(page);
  await open(page, `${base}/artifact/${id}`, GRAPH, 120_000);
  await page.waitForSelector(`${GRAPH}:not([data-arriving])`, {
    timeout: 120_000,
  });
  const frame = await (
    await page.locator(FRAME).first().elementHandle()
  )?.contentFrame();
  if (!frame) {
    throw new Error("The design graph's stage holds no frame.");
  }
  await frame.waitForSelector('[data-cawco-story] [data-probe="title"]', {
    timeout: 60_000,
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
    ([reached, laid]) => {
      if (window !== window.top) {
        return;
      }
      const heard: unknown[] = [];
      (window as unknown as { __answers: unknown[] }).__answers = heard;
      addEventListener("message", (event) => {
        const type = (event.data as { type?: unknown } | null)?.type;
        if (type === reached || type === laid) {
          heard.push(event.data);
        }
      });
    },
    [STAGE_REACHED, STAGE_LAID] as const
  );
}

/** What the frame hears from the panel of the stage's reaches, from now. */
async function listen(frame: Frame): Promise<void> {
  await frame.evaluate((type) => {
    const heard: unknown[] = [];
    (window as unknown as { __reaches: unknown[] }).__reaches = heard;
    addEventListener("message", (event) => {
      if ((event.data as { type?: unknown } | null)?.type === type) {
        heard.push(event.data);
      }
    });
  }, STAGE_REACH);
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
        "--c-graph-stage-min"
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
        const bar = root?.querySelector('[data-slot="graph-bar"]');
        const head = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--c-graph-drawer-head"
          )
        );
        const box = (el: Element | null | undefined) =>
          el ? el.getBoundingClientRect() : null;
        const surface = box(root);
        return {
          head,
          foot: surface ? Math.round(surface.bottom) : null,
          barFoot: box(bar)?.bottom ?? null,
          top: box(sheet)?.top ?? null,
          stageFoot: box(stage)?.bottom ?? null,
          screen: innerHeight,
        };
      },
      [GRAPH, DRAWER] as const
    );
  type Read = Awaited<ReturnType<typeof read>>;
  /** The height a stop stands over the surface's foot: the head's token, whole up to the bar's foot; half is read, not named. */
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
    "5b: at 390 each of the drawer's stops stands its height over the surface's foot (head, half, whole up to the bar), its grabber and a state row take a press, the stage ends at its top",
    stops.length === 3 && stops.every(ok),
    JSON.stringify(stops)
  );
}

/** Leg 9: both states files stand in the components' menu from the graph's first paint. */
async function componentsListed(kit: Kit, page: Page): Promise<void> {
  const trigger = page
    .locator(`${GRAPH} [data-slot="graph-bar"] button[aria-haspopup="menu"]`)
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
    "map 4: a press on the arrow Three → One keeps its to state until the Animation face stands: the drawing stands at One",
    atOne === "One",
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

/** The width and height a png's header says. */
const pngSize = (png: Buffer) => ({
  w: png.readUInt32BE(16),
  h: png.readUInt32BE(20),
});

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
  const call = async (n: string, name: string, input: object) => {
    calls.ask(n, { name, input: { response_format: "detailed", ...input } });
    await fleet.send(session, calls.words(n));
    return (await until(
      `${name}'s answer`,
      () => calls.answer(n),
      Boolean,
      240_000
    )) as string;
  };
  const base = await fleet.dashboard();
  // The page open first, so the canvas the session makes stands in its panel.
  const watching = await kit.page("desk", { theme: "light" });
  await open(watching, `${base}/session/${session}`, '[data-slot="pane"]');
  const created = await call("1", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "graph-card",
    file: [STORY, BADGE],
    does: "judge",
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

  // 2. The panel's own report, read from its rig.
  const read = await call("2", "mcp__cawco__artifact_read", { id });
  const states = [...read.matchAll(/"state":"(\w+)"/gu)].map((one) => one[1]);
  kit.check(
    "2: artifact_read answers every state's frame drawn, from the panel's report (by panel)",
    read.includes('"by":"panel"') &&
      states.length >= 3 &&
      states.every((one) => one === "drawn"),
    short(read)
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
  checks.report();

  // 6. A picture of a state, through the daemon's render on the stage.
  const picture = await fleet.api<{ png?: string | null }>(
    `/api/instances/${session}/artifacts/${id}?png=true&state=${encodeURIComponent(JSON.stringify({ story: "Two" }))}`
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
