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
 * 3. Then the canvas through its preview origin answers 200, and the stage
 *    started once since the restart: the request found it live, never woke
 *    it.
 *
 *   bun scripts/probe-kit/run.ts stage-carried
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { STAGE_RESUMED_SAID } from "../../../packages/core/src/stage";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import type { Kit, Spec } from "../kit";
import { passedFetch } from "../preview-pass";

const CREATE = "mcp__cawco__artifact_create";
const STORY = "src/Card.stories.js";
const STATUS = /"status":"(\w+)"/u;
const ID = /"id":"([0-9a-f-]{36})"/u;
const short = (said: string) => said.replaceAll(/\s+/gu, " ").slice(0, 600);
/** Ours: a stage clone's install and its host's start, with room. */
const BACK_MS = 240_000;

/** The session's numbered calls (scripts/tool-calls.ts). */
const calls = new ToolCalls();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  return calls.reply(request) ?? text("ok");
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

const ROOT_STAGE_LINE = /\[stage\] [0-9a-z-]+ \.: (.*)$/u;

/** The agent's `[stage]` lines for the sheet stage at the checkout's root (stage.ts `tell`): what each says after its name. */
const rootStageLines = (log: string): string[] =>
  log
    .split("\n")
    .map((line) => ROOT_STAGE_LINE.exec(line)?.[1])
    .filter((said): said is string => said !== undefined);

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

  // 2. The agent's restart, as an update's: the stage is started again with nothing asked of it.
  const mark = await fleet.logMark("agent");
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const resumed = await until(
    "the stage started again after the agent's restart",
    async () => rootStageLines(await mark.since()),
    (said) =>
      said.some((one) => one.startsWith("live")) &&
      said.some((one) => one.startsWith(STAGE_RESUMED_SAID)),
    BACK_MS
  ).catch(async () => rootStageLines(await mark.since()));
  check(
    "2: with no viewer and no request, the restarted agent starts the stage that was live, which answers live, said as started again after the restart",
    resumed.some((one) => one.startsWith("live")) &&
      resumed.some((one) => one.startsWith(STAGE_RESUMED_SAID)),
    `the stage's lines since the restart: ${resumed.join(" | ") || "none"}`
  );

  // 3. Its canvas answers through its preview origin, and the request woke nothing.
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
  const starts = rootStageLines(await mark.since()).filter(
    (one) => one === "starting" || one === "waking"
  );
  check(
    "3: after the restart its canvas answers 200 through its preview origin, the stage started once since: the request found it live",
    status === "200" && starts.length === 1,
    `preview port ${port}: ${status}; starts since the restart: ${starts.length}`
  );
};

export default {
  group: "Previews, pages and comments",
  name: "stage-carried",
  host: "it starts a stage, whose place's stage clone runs in a boundary of its own",
  run,
} satisfies Spec;
