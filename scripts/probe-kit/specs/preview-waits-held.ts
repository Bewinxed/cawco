/**
 * A preview a decision page shows stays up while that page waits on the
 * person (hub artifacts service `servedOwed`, `keepWaitingUp`; work-items.ts
 * `owedFrom`). On 2026-11-07 and 2026-11-08 the owner opened a decision page
 * and saw a blank area where its frames should be: the page's previews had
 * been put to sleep by their idle half hour while the page still waited
 * (agent stage.ts `watch`). And the row alone held a workspace, so nothing
 * but deleting the artifact ever let one retire: his answer freed nothing.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included: it delegates, so it runs on the host. Its
 * stages sleep after {@link IDLE_MS}. Delegates A and B each hand up a served
 * preview to the parent, which shows it on a decision page of its own, then
 * each is stopped: its work item has ended.
 *
 * - (1) Past its idle time, with A's page unanswered, A's workspace is still
 *   active, the sweep naming the preview as what holds it, its server is
 *   live, and its origin answers its page.
 * - (2) The person answers A's page: at the next sweep A's workspace retires,
 *   its server stopped, and its origin answers the down page.
 * - (3) B's page unanswered, B's preview deleted: B's workspace retires.
 *
 *   bun scripts/probe-kit/run.ts preview-waits-held
 */

import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { downOf } from "../../../packages/core/src/preview-proxy";
import { shellQuote } from "../../../packages/core/src/shell-quote";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, pressIn, type Spec } from "../kit";
import { passedFetch } from "../preview-pass";

/** How long the fleet's stages run unused before they sleep (agent stage.ts `CAWCO_STAGE_IDLE_MS`). */
const IDLE_MS = 45_000;
/** Longer than a stage's idle time and its next health look (`STAGE_HEALTH_MS`): a stage nothing holds has slept by now. */
const PAST_IDLE_MS = IDLE_MS + 40_000;
const SETTLE_MS = 180_000;
const HAND_UP_MS = 300_000;
const PORT_A = 47_651;
const PORT_B = 47_652;
const WORD_A = "held page A";
const WORD_B = "held page B";
/** The artifact panel's frame (PreviewPane). */
const FRAME = 'iframe[title="Preview"]';
const CREATE = "mcp__cawco__artifact_create";
const WAIT = "mcp__cawco__wait_item";
const TAG = /PROBE-HELD-([AB]):/u;
const LIVE_WORD = /: live\b/u;
type Tag = "A" | "B";
const PAGES: Record<
  Tag,
  { name: string; port: number; title: string; word: string }
> = {
  A: { name: "held-a", port: PORT_A, title: "Held page A", word: WORD_A },
  B: { name: "held-b", port: PORT_B, title: "Held page B", word: WORD_B },
};

/** What serves a delegate's preview: a page saying `word` on the `PORT` the stage gives it. */
const served = (word: string): string =>
  `bun -e ${shellQuote(
    `const page=${JSON.stringify(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${word}</title></head><body><h1 id="word">${word}</h1></body></html>`)};Bun.serve({hostname:"127.0.0.1",port:Number(process.env.PORT),fetch:()=>new Response(page,{headers:{"content-type":"text/html"}})});`
  )}`;

/** Each delegate's step: 1 once it asked for its hand-up, 2 once it asked for its wait. */
const steps: Partial<Record<Tag, number>> = {};
/** The CawCo tool a delegate asked for once ToolSearch has loaded it. */
const pending: Partial<Record<Tag, { input: object; name: string }>> = {};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** A call of `name`, through ToolSearch while it is not loaded yet. */
const want = (request: Seen, tag: Tag, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    delete pending[tag];
    return tool(name, input);
  }
  pending[tag] = { name, input };
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** A delegate: its hand-up, in its own turn, then a wait, its item live. */
const work = (request: Seen, tag: Tag): Reply => {
  const step = steps[tag] ?? 0;
  if (step === 0) {
    steps[tag] = 1;
    return want(request, tag, CREATE, {
      kind: "preview",
      does: "judge",
      title: PAGES[tag].title,
      ask: "Look at this page and say whether it reads right",
      name: PAGES[tag].name,
      port: PAGES[tag].port,
      serve: { command: served(PAGES[tag].word) },
      to: "parent",
    });
  }
  if (!request.afterTool) {
    return text("ok");
  }
  const asked = pending[tag];
  if (asked) {
    return want(request, tag, asked.name, asked.input);
  }
  if (step === 1) {
    steps[tag] = 2;
    return want(request, tag, WAIT, {
      minutes: 30,
      reason: "its parent's word on the page",
    });
  }
  return text("ok");
};

/** The delegates work by their tag; the parent ends its turns at once (the probe calls its tools). */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = TAG.exec(request.all)?.[1];
  return tag === "A" || tag === "B" ? work(request, tag) : text("ok");
};

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

interface Sweep {
  kept: { hold: string; workspaceId: string }[];
}

/** What the artifact's own origin answers at its root: its status, its down page's hop when it is one, and whether it reads `word`. */
const originReads = async (fleet: KitFleet, id: string, word: string) => {
  const { port } = await fleet.api<{ port: number }>(
    hubRequest("POST /api/artifacts/:artifact/preview-address", {
      path: { artifact: id },
    })
  );
  const response = await passedFetch(fleet, `http://127.0.0.1:${port}/`, {
    headers: { "sec-fetch-mode": "navigate" },
  });
  const body = await response.text();
  return {
    status: response.status,
    down: downOf(body)?.down ?? null,
    reads: body.includes(word),
  };
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-waits-held",
  host: "its delegates' previews are served in their workspaces' boundaries",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    const stageIdle = { CAWCO_STAGE_IDLE_MS: String(IDLE_MS) };
    fleet.launch("hub", [], stageIdle);
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], stageIdle);
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    const home = fleet.env.HOME as string;
    const repo = `${fleet.sandbox}/code`;
    await Bun.write(
      `${home}/.gitconfig`,
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`mkdir -p ${repo} && cd ${repo} && git init -q -b main && echo held > README.md && git add -A && git commit -qm 'First commit'`
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>(
      hubRequest("POST /api/projects", {
        body: { name: "Held previews", machineId: MACHINE, cwd: repo },
      })
    );
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    const as = async () => ({
      base: fleet.base,
      id: parent,
      credential: await fleet.sessionCredential(parent),
    });
    const stateOf = (id: string) =>
      fleet.query<{ state: string }>(
        "SELECT state FROM workspaces WHERE id = ?",
        id
      )[0]?.state;
    const sweep = () =>
      fleet.api<Sweep>(hubRequest("POST /api/workspaces/retire"));
    /** A delegate's hand-up made, its preview on a decision page of the parent's, and the delegate stopped: its item ended. */
    const handedAndStopped = async (tag: Tag) => {
      const started = await fleet.api<Started>(
        hubRequest("POST /api/work-items", {
          body: {
            parentInstanceId: parent,
            title: `Hand up page ${tag}`,
            prompt: `PROBE-HELD-${tag}: hand up your page, then wait.`,
            harness: "claude",
            model: "claude-haiku-4-5",
            cwd: repo,
          },
        })
      );
      await until(
        `${tag} resting in its wait after its hand-up`,
        () => steps[tag] ?? 0,
        (step) => step >= 2,
        HAND_UP_MS
      );
      const [row] = fleet.query<{ id: string }>(
        "SELECT id FROM artifacts WHERE name = ? AND kind = 'preview' AND held_for IS NULL",
        PAGES[tag].name
      );
      if (!row) {
        throw new Error(`no row for ${PAGES[tag].name}`);
      }
      const made = await toolWords(await as(), "artifact_create", {
        kind: "page",
        does: "pick",
        ask: "Say whether the page reads right",
        name: `page-${tag.toLowerCase()}`,
        title: `Page ${tag}`,
        program: `root = Decisions("Page ${tag}", [keep])
keep = Decision("keep", "Does page ${tag} read right?", [yes, no], "Drawn live.", [], [], false, null, "behaviour")
yes = Option("yes", "It reads right", "Keep it.", true, [drawn], "Nothing changes.")
no = Option("no", "It does not", "Change it.", false, [], "One more round.")
drawn = Preview("${row.id}", "Page ${tag}")`,
      });
      const stopped = await toolWords(await as(), "stop_delegate", {
        target: started.instanceId,
      });
      check(
        `(0) ${tag}'s preview goes on a decision page and ${tag} is stopped`,
        !(made.refused || stopped.refused),
        JSON.stringify({
          made: made.text.slice(0, 200),
          stopped: stopped.text.slice(0, 200),
        })
      );
      return { ...started, artifact: row.id };
    };

    const a = await handedAndStopped("A");
    const b = await handedAndStopped("B");

    // (1) Past its idle time: the workspace holds, the server is up.
    const end = Date.now() + PAST_IDLE_MS;
    while (Date.now() < end) {
      await sweep();
      await Bun.sleep(5000);
    }
    const hold = (await sweep()).kept.find(
      (one) => one.workspaceId === a.workspaceId
    )?.hold;
    const read = await toolWords(await as(), "artifact_read", {
      id: a.artifact,
    });
    const answers = await originReads(fleet, a.artifact, WORD_A);
    check(
      "(1) past its idle time with its page unanswered, A's workspace stands, the sweep naming the preview, its server stays live and its origin answers it",
      stateOf(a.workspaceId) === "active" &&
        (hold ?? "").includes("held-a") &&
        LIVE_WORD.test(read.text) &&
        answers.status === 200 &&
        answers.reads,
      JSON.stringify({
        state: stateOf(a.workspaceId),
        hold,
        read: read.text.slice(0, 300),
        answers,
      })
    );

    // (2) The person answers the page: the workspace retires, the server stops.
    const [pageA] = fleet.query<{ id: string }>(
      "SELECT id FROM artifacts WHERE name = 'page-a' AND held_for IS NULL"
    );
    const shownPage = await toolWords(await as(), "artifact_show", {
      id: pageA?.id ?? "",
    });
    check(
      "(2) A's page is the one the panel opens",
      !shownPage.refused,
      shownPage.text.slice(0, 200)
    );
    const tab = await kit.page("desk");
    await open(tab, `${base}/session/${parent}`, FRAME);
    const frame = tab.frameLocator(FRAME);
    await frame.locator('[data-option="yes"]').waitFor({ timeout: 60_000 });
    await until(
      "the page's bridge marking its options",
      () => frame.locator('[data-option="yes"][aria-pressed]').count(),
      (count) => count === 1,
      30_000
    );
    await pressIn(frame, '[data-option="yes"]');
    const retired = await until(
      "A's workspace retired",
      async () => {
        await sweep();
        return stateOf(a.workspaceId);
      },
      (state) => state === "archived",
      SETTLE_MS
    ).catch(() => stateOf(a.workspaceId));
    const gone = await originReads(fleet, a.artifact, WORD_A);
    check(
      "(2) the person answers A's page: A's workspace retires and its server stops, its origin answering a down page",
      retired === "archived" && !gone.reads && gone.down !== null,
      JSON.stringify({ retired, gone })
    );

    // (3) The other half: deleting the preview lets B retire, its page unanswered.
    const response = await fetchHub(
      fetch,
      fleet.base,
      hubRequest("DELETE /api/instances/:id/artifacts/:artifact", {
        path: { id: parent, artifact: b.artifact },
      })
    );
    const deleted = await until(
      "B's workspace retired",
      async () => {
        await sweep();
        return stateOf(b.workspaceId);
      },
      (state) => state === "archived",
      SETTLE_MS
    ).catch(() => stateOf(b.workspaceId));
    check(
      "(3) B's preview deleted with its page unanswered: B's workspace retires",
      response.status === 200 && deleted === "archived",
      JSON.stringify({ status: response.status, deleted })
    );
  },
};

export default spec;
