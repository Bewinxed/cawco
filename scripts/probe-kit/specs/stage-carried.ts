/**
 * A stage that is live with no viewer answers again after the agent
 * restarts, as every update restarts it (tsk-254: during nightly 6981's
 * install on obelisk-of-light a workspace's component stage, live before the
 * update, stayed down after it until a new artifact used it, and its
 * delegate's `rendered-checks.ts` against the stage's port got connection
 * refused). The daemon's end writes down each stage that answers and the
 * next daemon starts it again at its port (agent stage.ts `carryStages`,
 * `resumeStages`); before, it ended them and started one again only on its
 * next use (session.ts `detach`: "the next one starts it again on its next
 * open").
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a session in a committed Vite + Svelte checkout (its bun.lock,
 * nothing installed), whose stage runs in its place's stage clone:
 *
 * 1. `artifact_create(kind: "component")` answers its stage `live`. Nothing
 *    opens it: no panel, no preview request, no viewer.
 * 2. The agent stops (SIGTERM, as an update's restart stops it) and starts
 *    again. With nothing asked of the stage, the new agent's log says the
 *    stage `starting`, then `live`, and that it was started again after the
 *    agent's restart. Before the fix this leg fails: nothing starts it.
 * 3. Then, the agent's log saying the stage `live` and started once since
 *    the restart before anything asks for it, the canvas through its preview
 *    origin answers 200, and the stage still started once since the restart:
 *    the request found it live, never woke it. A start is a `starting` or
 *    `waking` line: the daemon's re-send of each stage's state on
 *    registering with the hub (stage.ts `tellStages`) logs no line.
 *
 * Beside it, before the restart, a delegate in a workspace of its own hands
 * up a preview whose server CawCo's stage runs there (`serve`, agent
 * stage.ts `ensureServed`), then rests in a wait, its item live; nobody
 * opens the preview but the probe's one read of it (1b). Across the same
 * restart:
 *
 * 2b. With nothing asked of it, the new agent's log says the served
 *     preview's port `live` and started again after the agent's restart.
 * 4. Then, its server said `live` and started once since the restart before
 *    the read, the preview's origin answers the delegate's page, and the
 *    server still started once since the restart.
 *
 *   bun scripts/probe-kit/run.ts stage-carried
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { shellQuote } from "../../../packages/core/src/shell-quote";
import {
  STAGE_RESUMED_SAID,
  type StageStatus,
} from "../../../packages/core/src/stage";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import type { Kit, Spec } from "../kit";
import { passedFetch } from "../preview-pass";

const CREATE = "mcp__cawco__artifact_create";
const STORY = "src/Card.stories.js";
const STATUS = /"status":"(\w+)"/u;
const STATUSES: StageStatus[] = [
  "starting",
  "waking",
  "live",
  "error",
  "asleep",
];
const ID = /"id":"([0-9a-f-]{36})"/u;
const short = (said: string) => said.replaceAll(/\s+/gu, " ").slice(0, 600);
/** Ours: a stage clone's install and its host's start, with room. */
const BACK_MS = 240_000;

const WAIT = "mcp__cawco__wait_item";
/** The delegate's prompt marker. */
const DELEGATE = "PROBE-STAGE-CARRIED-D";
/** The port the delegate's server is served on, in its workspace. */
const SERVED_PORT = 47_651;
const SERVED_WORD = "carried served page";
/** The stage's name for it in the agent's `[stage]` lines (stage.ts `tell`). */
const SERVED_AT = `port ${SERVED_PORT}`;

/** What serves the delegate's preview: a page saying {@link SERVED_WORD} on the `PORT` the stage gives it. */
const SERVED = `bun -e ${shellQuote(
  `const page=${JSON.stringify(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${SERVED_WORD}</title></head><body><h1 id="word">${SERVED_WORD}</h1></body></html>`)};Bun.serve({hostname:"127.0.0.1",port:Number(process.env.PORT),fetch:()=>new Response(page,{headers:{"content-type":"text/html"}})});`
)}`;

/** The session's numbered calls (scripts/tool-calls.ts). */
const calls = new ToolCalls();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The delegate's step: 1 once it asked for its hand-up, 2 once it asked for its wait. */
let step = 0;
/** The CawCo tool the delegate asked for once ToolSearch has loaded it. */
let pending: { input: object; name: string } | undefined;

/** A call of `name`, through ToolSearch while it is not loaded yet. */
const want = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    pending = undefined;
    return tool(name, input);
  }
  pending = { name, input };
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** The delegate: its served preview, in its own turn, then a wait, its item live. */
const work = (request: Seen): Reply => {
  if (step === 0) {
    step = 1;
    return want(request, CREATE, {
      kind: "preview",
      does: "try",
      title: "Probe try artifact",
      ask: "Try this page and say whether it works",
      name: "served",
      port: SERVED_PORT,
      serve: { command: SERVED },
    });
  }
  if (!request.afterTool) {
    return text("ok");
  }
  if (pending) {
    return want(request, pending.name, pending.input);
  }
  if (step === 1) {
    step = 2;
    return want(request, WAIT, {
      minutes: 30,
      reason: "its parent's word on the page",
    });
  }
  return text("ok");
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (calls.markerOf(request)) {
    return calls.reply(request) ?? text("ok");
  }
  return request.all.includes(DELEGATE) ? work(request) : text("ok");
};

/** A Vite + Svelte project with one card and its states file. */
const CARDS: Record<string, string> = {
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name: "stage-carried-cards",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { plugins: [svelte()] };
`,
  "index.html": "<!doctype html><html><head></head><body></body></html>\n",
  "src/Card.svelte": `<script>
  let { title } = $props();
</script>

<h2 data-probe="title">{title}</h2>
`,
  [STORY]: `import Card from "./Card.svelte";

export default { component: Card, args: { title: "Hello" } };

export const One = { args: {} };
`,
};

const STAGE_MARK = "[stage] ";

/**
 * The agent's `[stage]` lines for the stage it names `at` after its
 * workspace (stage.ts `tell`): `.` for the sheet stage at the checkout's
 * root, `port <n>` for a served preview. What each says after that name.
 */
const stageLines = (log: string, at: string): string[] =>
  log.split("\n").flatMap((line) => {
    const mark = line.indexOf(STAGE_MARK);
    if (mark < 0) {
      return [];
    }
    const rest = line.slice(mark + STAGE_MARK.length);
    const named = rest.slice(rest.indexOf(" ") + 1);
    return named.startsWith(`${at}: `) ? [named.slice(at.length + 2)] : [];
  });
const rootStageLines = (log: string): string[] => stageLines(log, ".");
/** Whether a stage's lines say it answered again after the restart: `live`, and started again by it. */
const backAfter = (said: string[]): boolean =>
  said.some((one) => one.startsWith("live")) &&
  said.some((one) => one.startsWith(STAGE_RESUMED_SAID));
/** A line's status word, when it is a status line (stage.ts `tell`: `live`, `starting (why)`, `live, 2 error(s)`). */
const statusOf = (one: string): StageStatus | undefined =>
  STATUSES.find(
    (status) =>
      one === status ||
      one.startsWith(`${status} (`) ||
      one.startsWith(`${status}, `)
  );
/**
 * How many times its lines say it started: each `starting` or `waking` line
 * is one start, as stage.ts `tell` logs a move and the daemon's re-send on
 * registering with the hub (`tellStages`) logs none.
 */
const startsIn = (said: string[]): number =>
  said.filter((one) => {
    const status = statusOf(one);
    return status === "starting" || status === "waking";
  }).length;
/** Where its last status line says it is now. */
const nowIn = (said: string[]): string =>
  said.map(statusOf).findLast((status) => status !== undefined) ?? "unsaid";

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  const cards = join(fleet.sandbox, "cards");
  await Promise.all(
    Object.entries(CARDS).map(async ([file, body]) => {
      await mkdir(dirname(join(cards, file)), { recursive: true });
      await writeFile(join(cards, file), body);
    })
  );
  const env = { ...process.env, HOME: fleet.env.HOME as string };
  await Bun.$`bun install --lockfile-only --no-progress`
    .cwd(cards)
    .env(env)
    .quiet();
  await Bun.$`git init -q -b main && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm 'First commit'`
    .cwd(cards)
    .env(env)
    .quiet();

  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Cards", cards);

  // 1. A canvas whose stage is live, and nothing viewing it.
  const created = await calls.call(
    fleet,
    session,
    CREATE,
    {
      response_format: "detailed",
      kind: "component",
      name: "cards",
      file: STORY,
      does: "judge",
      title: "Probe judge artifact",
      ask: "Judge the card in each of its states",
    },
    { timeoutMs: BACK_MS }
  );
  const artifact = created.match(ID)?.[1];
  check(
    "1: artifact_create(kind: component) answers its stage live",
    created.match(STATUS)?.[1] === "live" && artifact !== undefined,
    short(created)
  );
  if (!artifact) {
    return;
  }

  // 1b. A delegate's served preview in its workspace, its item resting in a wait.
  const home = fleet.env.HOME as string;
  const repo = join(fleet.sandbox, "code");
  await Bun.$`mkdir -p ${repo} && cd ${repo} && git init -q -b main && echo carried > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm 'First commit'`
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>(
    hubRequest("POST /api/projects", {
      body: { name: "Stage carried", machineId: MACHINE, cwd: repo },
    })
  );
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  await fleet.api(
    hubRequest("POST /api/work-items", {
      body: {
        parentInstanceId: parent,
        title: "Serve a page",
        prompt: `${DELEGATE}: hand up your page, then wait.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: repo,
      },
    })
  );
  await until(
    "the delegate resting in its wait",
    () => step,
    (at) => at >= 2,
    BACK_MS
  ).catch(() => undefined);
  const servedId = fleet.query<{ id: string }>(
    "SELECT id FROM artifacts WHERE name = 'served' AND kind = 'preview'"
  )[0]?.id;
  /** What the served preview's own origin answers at its root: its status and whether it is the delegate's page. */
  const servedReads = async () => {
    if (!servedId) {
      return "no preview row";
    }
    const { port: at } = await fleet.api<{ port: number }>(
      hubRequest("POST /api/artifacts/:artifact/preview-address", {
        path: { artifact: servedId },
      })
    );
    const response = await passedFetch(fleet, `http://127.0.0.1:${at}/`, {
      headers: { "sec-fetch-mode": "navigate" },
    }).catch((error: unknown) => String(error));
    if (typeof response === "string") {
      return response;
    }
    const body = await response.text();
    return `${response.status} ${body.includes(SERVED_WORD) ? "the page" : body.slice(0, 160)}`;
  };
  const servedFirst = await until(
    "the served preview",
    servedReads,
    (said) => said === "200 the page",
    60_000
  ).catch(servedReads);
  check(
    "1b: the delegate's served preview answers its page through its origin, its item resting in a wait",
    step >= 2 && servedFirst === "200 the page",
    `delegate step ${step}; the preview: ${servedFirst}`
  );

  // 2. The agent's restart, as an update's: the stage is started again with nothing asked of it.
  const mark = await fleet.logMark("agent");
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const resumed = await until(
    "the stages started again after the agent's restart",
    async () => await mark.since(),
    (log) =>
      backAfter(rootStageLines(log)) && backAfter(stageLines(log, SERVED_AT)),
    BACK_MS
  ).catch(async () => await mark.since());
  check(
    "2: with no viewer and no request, the restarted agent starts the stage that was live, which answers live, said as started again after the restart",
    backAfter(rootStageLines(resumed)),
    `the stage's lines since the restart: ${rootStageLines(resumed).join(" | ") || "none"}`
  );
  check(
    "2b: with nothing viewing it, the restarted agent starts the served preview's server that was live, which answers live, said as started again after the restart",
    backAfter(stageLines(resumed, SERVED_AT)),
    `its lines since the restart: ${stageLines(resumed, SERVED_AT).join(" | ") || "none"}`
  );

  // 3. Its canvas answers through its preview origin, and the request woke nothing.
  const rootBefore = rootStageLines(await mark.since());
  const rootNow = nowIn(rootBefore);
  const rootStartsBefore = startsIn(rootBefore);
  const { port } = (await (
    await fetchHub(
      fetch,
      fleet.base,
      hubRequest("POST /api/artifacts/:artifact/preview-address", {
        path: { artifact },
      })
    )
  ).json()) as { port?: number };
  const answered = () =>
    passedFetch(
      fleet,
      `http://127.0.0.1:${port ?? 0}/@cawco/canvas?file=${encodeURIComponent(STORY)}`
    ).then(
      (response) => String(response.status),
      (error: unknown) => String(error)
    );
  const status = await until(
    "the canvas through its preview origin",
    answered,
    (said) => said === "200",
    60_000
  ).catch(answered);
  const starts = startsIn(rootStageLines(await mark.since()));
  check(
    "3: after the restart the stage is live before its canvas is asked for, its canvas answers 200 through its preview origin, and the stage started once since: the request found it live and started nothing",
    rootNow === "live" &&
      rootStartsBefore === 1 &&
      status === "200" &&
      starts === 1,
    `before the request: ${rootNow}, starts since the restart ${rootStartsBefore}; preview port ${port}: ${status}; starts since the restart after it: ${starts}`
  );

  // 4. The served preview answers at its port, and the read woke nothing.
  const servedBefore = stageLines(await mark.since(), SERVED_AT);
  const servedNow = nowIn(servedBefore);
  const servedStartsBefore = startsIn(servedBefore);
  const servedAfter = await until(
    "the served preview after the restart",
    servedReads,
    (said) => said === "200 the page",
    60_000
  ).catch(servedReads);
  const servedStarts = startsIn(stageLines(await mark.since(), SERVED_AT));
  check(
    "4: after the restart the served preview's server is live before it is read, the preview answers the delegate's page through its origin, and its server started once since: the read found it live and started nothing",
    servedNow === "live" &&
      servedStartsBefore === 1 &&
      servedAfter === "200 the page" &&
      servedStarts === 1,
    `before the read: ${servedNow}, starts since the restart ${servedStartsBefore}; the preview: ${servedAfter}; starts since the restart after it: ${servedStarts}`
  );
};

export default {
  group: "Previews, pages and comments",
  name: "stage-carried",
  host: "it starts stages in boundaries: a place's stage clone's and a delegate's workspace's",
  run,
} satisfies Spec;
