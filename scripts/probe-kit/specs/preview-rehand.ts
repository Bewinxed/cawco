/**
 * A preview handed up again under the same name follows its row: its
 * origin reaches exactly the source the artifact's row names now (hub
 * preview-service.ts `reach`, db artifacts.ts `resource`), and a workspace
 * that serves something still waiting on the person can't be discarded
 * (hub work-items.ts `waitingFrom`). On 2026-11-04 most of the owner's
 * previews answered 502: a re-hand rewrote the row's workspace, the old
 * workspace retired, and every request still went down a cached chain to
 * it ("No workspace … is on this machine").
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included: it delegates, so it runs on the host.
 * Two delegates, A and B, of one parent, each in a workspace of its own
 * (WA, WB), hand up a preview named `p` whose server CawCo's stage runs in
 * their workspace (`serve`), each page saying its own word: each calls
 * artifact_create itself, in its own turn, as a delegate does, then rests
 * in a wait, its item live. (Its first run, round 403, called the create
 * from outside the delegate's turn: the hub ended the delegate's item for
 * three empty turns meanwhile, retired WA between the server's start and
 * the row that names it, and the check met a boundary already stopped.)
 * Read off the hub's answers, the preview's own origin and the artifact's
 * own tab:
 *
 * - (1) A hands `p` up from WA and the parent opens it: its tab reads A's
 *   word.
 * - (2) B hands `p` up from WB while the parent has it open: it is held
 *   as `p`'s next version (Projects spec §5.10), and the tab still reads
 *   A's word.
 * - (3) The parent opens it: `p`'s row names WB. A is stopped and WA,
 *   which nothing names now, retires at the next sweep.
 * - (4) With WA gone, `p`'s tab, reloaded, reads B's word with no down
 *   page, and its origin answers B's page.
 * - (5) B stopped, the parent's discard_workspace of WB is refused while
 *   `p` waits on the person, its words naming `p`; nothing is deleted.
 * - (6) The person sends `p`: it waits on the person no more.
 * - (7) The discard goes through, and `p`'s tab, reloaded, says its
 *   workspace is gone (the pane's `gone` down state), its origin answering
 *   that down page, never a 502.
 *
 *   bun scripts/probe-kit/run.ts preview-rehand
 */
import { downOf } from "../../../packages/core/src/preview-proxy";
import { toolRecord, toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { writePagePins } from "../pins";
import { passedFetch } from "../preview-pass";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** The pane's down state, over the frame. */
const DOWN = '[data-slot="down"]';
const PORT_A = 47_641;
const PORT_B = 47_642;
const WORD_A = "rehand page A";
const WORD_B = "rehand page B";
/** A workspace's settle once nothing holds it. */
const SETTLE_MS = 180_000;
/** A delegate's ask to its hand-up answered: its server's start and the check of its page. */
const HAND_UP_MS = 300_000;
const CREATE = "mcp__cawco__artifact_create";
const WAIT = "mcp__cawco__wait_item";
const TAG = /PROBE-REHAND-([AB]):/u;
type Tag = "A" | "B";

/** `word` as one single-quoted shell word. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/** What serves a delegate's preview: a page saying `word` on the `PORT` the stage gives it. */
const served = (word: string): string =>
  `bun -e ${quoted(
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

/** Delegate `tag`'s hand-up of `p`: its own page, served in its workspace. */
const handUp = (tag: Tag): object => ({
  kind: "preview",
  does: "judge",
  ask: "Judge whether this page reads right",
  name: "p",
  port: tag === "A" ? PORT_A : PORT_B,
  serve: { command: served(tag === "A" ? WORD_A : WORD_B) },
  to: "parent",
});

/** A delegate: its hand-up, in its own turn, then a wait, its item live. */
const work = (request: Seen, tag: Tag): Reply => {
  const step = steps[tag] ?? 0;
  if (step === 0) {
    steps[tag] = 1;
    return want(request, tag, CREATE, handUp(tag));
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

/** What `page`'s artifact frame shows now: the word its page says, and whether the pane's down state stands. */
const tabReads = async (page: Parameters<typeof open>[0]) => {
  const word = await page
    .frameLocator(FRAME)
    .first()
    .locator("#word")
    .textContent({ timeout: 1000 })
    .catch(() => null);
  const down = await page
    .locator(DOWN)
    .first()
    .isVisible()
    .catch(() => false);
  const said = down
    ? await page
        .locator(DOWN)
        .first()
        .innerText({ timeout: 1000 })
        .catch(() => "")
    : "";
  /** The hop the pane's down state draws (PreviewPane `data-down`). */
  const kind = down
    ? await page
        .locator(DOWN)
        .first()
        .getAttribute("data-down", { timeout: 1000 })
        .catch(() => null)
    : null;
  return { word, down, kind, said };
};

/**
 * What `p`'s own origin answers at its root: its status, its down page's
 * hop when it is one, which delegate's page it is (read off the whole
 * body: the overlay the hub keys into its head comes first), and its first
 * words.
 */
const originReads = async (fleet: KitFleet, id: string) => {
  const { port } = await fleet.api<{ port: number }>(
    `/api/artifacts/${id}/preview-address`,
    {}
  );
  const response = await passedFetch(fleet, `http://127.0.0.1:${port}/`, {
    headers: { "sec-fetch-mode": "navigate" },
  });
  const body = await response.text();
  return {
    status: response.status,
    down: downOf(body)?.down ?? null,
    page: [WORD_A, WORD_B].find((word) => body.includes(word)) ?? null,
    body: body.slice(0, 200),
  };
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-rehand",
  host: "its delegates' previews are served in their workspaces' boundaries",
  run: async (kit: Kit) => {
    const { check } = kit;
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
    const home = fleet.env.HOME as string;
    const repo = `${fleet.sandbox}/code`;
    await Bun.write(
      `${home}/.gitconfig`,
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`mkdir -p ${repo} && cd ${repo} && git init -q -b main && echo rehand > README.md && git add -A && git commit -qm 'First commit'`
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Preview rehand",
      machineId: MACHINE,
      cwd: repo,
    });
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    const as = async (id: string) => ({
      base: fleet.base,
      id,
      credential: await fleet.sessionCredential(id),
    });
    const delegate = (tag: Tag) =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title: `Hand up page ${tag}`,
        prompt: `PROBE-REHAND-${tag}: hand up your page, then wait.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: repo,
      });
    const workspaceState = (id: string) =>
      fleet.query<{ state: string }>(
        "SELECT state FROM workspaces WHERE id = ?",
        id
      )[0]?.state;
    const sourceOf = (id: string) =>
      fleet.query<{ source_workspace: string | null }>(
        "SELECT source_workspace FROM artifacts WHERE id = ?",
        id
      )[0]?.source_workspace;
    /** `p`'s artifact row, or a version held for it (`held`), as the hub holds it. */
    const rowOf = (held?: string) =>
      fleet.query<{ id: string; made_by: string | null }>(
        held
          ? "SELECT id, made_by FROM artifacts WHERE held_for = ?"
          : "SELECT id, made_by FROM artifacts WHERE name = 'p' AND kind = 'preview' AND held_for IS NULL",
        ...(held ? [held] : [])
      )[0];
    /** Delegate `tag`'s hand-up answered and the delegate resting in its wait: its row, read when it rests. */
    const handedUp = async (tag: Tag, held?: string) => {
      await until(
        `${tag} resting in its wait after its hand-up`,
        () => steps[tag] ?? 0,
        (step) => step >= 2,
        HAND_UP_MS
      ).catch(() => undefined);
      return rowOf(held);
    };

    for (const tag of ["A", "B"] as const) {
      delete steps[tag];
      delete pending[tag];
    }
    const a = await delegate("A");

    // (1) A hands p up from WA, in its own turn; the parent opens it.
    const fromA = await handedUp("A");
    if (!fromA || fromA.made_by !== a.instanceId) {
      check(
        "(1) A hands p up from WA",
        false,
        JSON.stringify({ row: fromA ?? null, step: steps.A ?? 0 })
      );
      return;
    }
    const p = fromA.id;
    const shownA = await toolWords(await as(parent), "artifact_show", {
      id: p,
    });
    const tab = await kit.page("desk");
    await open(tab, `${base}/artifact/${p}`, FRAME);
    const readsA = await until(
      "p's tab reading A",
      () => tabReads(tab),
      (now) => now.word === WORD_A,
      60_000
    ).catch(() => tabReads(tab));
    check(
      "(1) A hands p up from WA, the parent opens it, and its tab reads A's page",
      !shownA.refused &&
        sourceOf(p) === a.workspaceId &&
        readsA.word === WORD_A &&
        !readsA.down,
      JSON.stringify({ shown: shownA.text.slice(0, 200), readsA })
    );

    // (2) B hands p up from WB while the parent has it open: held.
    const b = await delegate("B");
    const fromB = await handedUp("B", p);
    const heldTab = await tabReads(tab);
    check(
      "(2) B's hand-up of p from WB is held as its next version, and the tab still reads A's page",
      fromB?.made_by === b.instanceId &&
        sourceOf(fromB.id) === b.workspaceId &&
        sourceOf(p) === a.workspaceId &&
        heldTab.word === WORD_A,
      JSON.stringify({ held: fromB ?? null, step: steps.B ?? 0, heldTab })
    );

    // (3) The parent opens it: p names WB, and WA retires once A stops.
    const shownB = await toolWords(await as(parent), "artifact_show", {
      id: p,
    });
    const stoppedA = await toolWords(await as(parent), "stop_delegate", {
      target: a.instanceId,
    });
    const retired = await until(
      "WA retired",
      async () => {
        await fleet.api("/api/workspaces/retire", {});
        return workspaceState(a.workspaceId);
      },
      (state) => state === "archived",
      SETTLE_MS
    ).catch(() => workspaceState(a.workspaceId));
    check(
      "(3) the parent opens it: p's row names WB, and with A stopped WA, which nothing names now, retires",
      !(shownB.refused || stoppedA.refused) &&
        sourceOf(p) === b.workspaceId &&
        retired === "archived",
      JSON.stringify({
        shown: shownB.text.slice(0, 200),
        stopped: stoppedA.text.slice(0, 200),
        source: sourceOf(p),
        wa: retired,
      })
    );

    // (4) With WA gone, p's tab reads B's page, and its origin answers it.
    await tab.reload({ waitUntil: "domcontentloaded" });
    const readsB = await until(
      "p's tab reading B",
      () => tabReads(tab),
      (now) => now.word === WORD_B,
      60_000
    ).catch(() => tabReads(tab));
    const originB = await originReads(fleet, p);
    check(
      "(4) with WA retired, p's tab reads B's page with no down page, and p's origin answers B's page",
      readsB.word === WORD_B &&
        !readsB.down &&
        originB.status === 200 &&
        originB.down === null &&
        originB.page === WORD_B,
      JSON.stringify({ readsB, originB })
    );

    // (5) The person leaves a pin on p and has not sent it, so p waits on
    // them (needs.ts: a page to judge with marks not sent); B stopped, WB's
    // discard is refused.
    const page = await (
      await tab.locator(FRAME).first().elementHandle()
    )
      ?.contentFrame()
      .catch(() => null);
    const pinnedAt = new Date().toISOString();
    if (page) {
      await writePagePins(page, {
        id: crypto.randomUUID(),
        number: 1,
        kind: "comment",
        by: "person",
        at: pinnedAt,
        anchor: { selector: "#word", source: null, text: WORD_B },
        elements: [],
        thread: [
          {
            id: crypto.randomUUID(),
            by: "person",
            text: "Say it bigger",
            at: pinnedAt,
          },
        ],
      });
    }
    const waitingOn = async () => {
      const listed = await toolRecord<{
        artifacts: { id: string; waitingOn: string[] }[];
      }>(await as(parent), "artifact_list", {});
      return listed.refused
        ? [listed.text]
        : (listed.record.artifacts.find((one) => one.id === p)?.waitingOn ??
            []);
    };
    const asking = await until(
      "p waiting on the person",
      waitingOn,
      (on) => on.includes("person"),
      30_000
    ).catch(waitingOn);
    const stoppedB = await toolWords(await as(parent), "stop_delegate", {
      target: b.instanceId,
    });
    const refused = await toolWords(await as(parent), "discard_workspace", {
      workspace: b.workspaceId,
    });
    check(
      "(5) with an unsent pin of the person's on p, so p waits on the person, the parent's discard_workspace of WB is refused, its words naming p, and WB stays",
      asking.includes("person") &&
        !stoppedB.refused &&
        refused.refused &&
        refused.text.includes(p) &&
        workspaceState(b.workspaceId) === "active",
      JSON.stringify({
        pinned: !!page,
        waitingOn: asking,
        stopped: stoppedB.text.slice(0, 200),
        refused: refused.text.slice(0, 400),
        wb: workspaceState(b.workspaceId),
      })
    );

    // (6) The person sends p: it waits on the person no more.
    const { port } = await fleet.api<{ port: number }>(
      `/api/artifacts/${p}/preview-address`,
      {}
    );
    const sent = await passedFetch(
      fleet,
      `http://127.0.0.1:${port}/__cawco/artifact/${p}/send`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "It reads right." }),
      }
    );
    const listed = await toolRecord<{
      artifacts: { id: string; waitingOn: string[] }[];
    }>(await as(parent), "artifact_list", {});
    const waiting = listed.refused
      ? listed.text
      : listed.record.artifacts.find((one) => one.id === p)?.waitingOn;
    check(
      "(6) the person sends p, and it waits on the person no more",
      sent.ok && Array.isArray(waiting) && !waiting.includes("person"),
      JSON.stringify({ sent: sent.status, waiting })
    );

    // (7) The discard goes through; p's tab says its workspace is gone.
    const discarded = await toolWords(await as(parent), "discard_workspace", {
      workspace: b.workspaceId,
    });
    await tab.reload({ waitUntil: "domcontentloaded" });
    const gone = await until(
      "p's tab saying its workspace is gone",
      () => tabReads(tab),
      (now) => now.down,
      60_000
    ).catch(() => tabReads(tab));
    const originGone = await originReads(fleet, p);
    check(
      "(7) WB's discard goes through, and p's tab says its workspace is gone (the pane's gone state), its origin answering that down page, never a 502",
      !discarded.refused &&
        workspaceState(b.workspaceId) === "archived" &&
        gone.kind === "gone" &&
        originGone.status !== 502 &&
        originGone.down === "gone",
      JSON.stringify({
        discarded: discarded.text.slice(0, 200),
        wb: workspaceState(b.workspaceId),
        gone,
        originGone,
      })
    );
  },
};
export default spec;
