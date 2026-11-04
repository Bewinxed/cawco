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
 * 6. `artifact_read({ png: true, state: { story: "Two" } })` answers a
 *    picture of Two's drawing at 1:1 through the daemon's render on the
 *    stage (`by=stage`): 1280 px wide, a desk's form, for a card of no
 *    width of its own.
 * 7. The rendered checks on the panel's design graph at 1440×900 and
 *    390×844, the bar, the room and the stage's head.
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
/** The ask the canvas is made with: it names the state the graph opens on. */
const ASK = "Judge the card at Two";

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

/** The card raised. */
export const Three = { args: { title: "Third", tone: "loud" } };
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
    file: STORY,
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
  await watching.close();

  const checks = new RenderedChecks(kit, "graph-stage", {
    scope: GRAPH,
  });
  await deskLegs(kit, base, id, checks);
  await phoneLegs(kit, base, id, checks);
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
