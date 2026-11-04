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
 * their workspace (`serve`), each page saying its own word. Read off the
 * hub's answers, the preview's own origin and the artifact's own tab:
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
 * - (7) The discard goes through, and `p`'s tab, reloaded, says its server
 *   isn't running (the pane's `server` down state), its origin answering
 *   that down page, never a 502.
 *
 *   bun scripts/probe-kit/run.ts preview-rehand
 */
import { downOf } from "../../../packages/core/src/preview-proxy";
import { toolRecord, toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { passedFetch } from "../preview-pass";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** The pane's down state, over the frame. */
const DOWN = '[data-slot="down"]';
const PORT_A = 47_641;
const PORT_B = 47_642;
const WORD_A = "rehand page A";
const WORD_B = "rehand page B";
/** A delegate's turn to its end, a workspace's settle once nothing holds it. */
const SETTLE_MS = 180_000;

/** `word` as one single-quoted shell word. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/** What serves a delegate's preview: a page saying `word` on the `PORT` the stage gives it. */
const served = (word: string): string =>
  `bun -e ${quoted(
    `const page=${JSON.stringify(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${word}</title></head><body><h1 id="word">${word}</h1></body></html>`)};Bun.serve({hostname:"127.0.0.1",port:Number(process.env.PORT),fetch:()=>new Response(page,{headers:{"content-type":"text/html"}})});`
  )}`;

/** Every delegate and the parent end their turns at once: the probe calls their tools itself. */
const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

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
  return { word, down, said };
};

/** What `p`'s own origin answers at its root: its status, its down page's hop when it is one, and its first words. */
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
    const delegate = (tag: "A" | "B") =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title: `Hand up page ${tag}`,
        prompt: `PROBE-REHAND-${tag}: wait.`,
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
    const handUp = async (tag: "A" | "B", by: string) =>
      await toolRecord<{ held?: string; id: string }>(
        await as(by),
        "artifact_create",
        {
          kind: "preview",
          does: "try",
          ask: "Try this page and say whether it reads right",
          name: "p",
          port: tag === "A" ? PORT_A : PORT_B,
          serve: { command: served(tag === "A" ? WORD_A : WORD_B) },
          to: "parent",
        }
      );

    const a = await delegate("A");
    const b = await delegate("B");

    // (1) A hands p up from WA; the parent opens it.
    const fromA = await handUp("A", a.instanceId);
    if (fromA.refused) {
      check("(1) A hands p up from WA", false, fromA.text);
      return;
    }
    const p = fromA.record.id;
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
    const fromB = await handUp("B", b.instanceId);
    const heldTab = await tabReads(tab);
    check(
      "(2) B's hand-up of p from WB is held as its next version, and the tab still reads A's page",
      !fromB.refused &&
        fromB.record.id === p &&
        !!fromB.record.held &&
        sourceOf(p) === a.workspaceId &&
        heldTab.word === WORD_A,
      JSON.stringify({
        fromB: fromB.refused ? fromB.text : fromB.record,
        heldTab,
      })
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
        originB.body.includes(WORD_B),
      JSON.stringify({ readsB, originB })
    );

    // (5) B stopped, WB's discard is refused while p waits on the person.
    const stoppedB = await toolWords(await as(parent), "stop_delegate", {
      target: b.instanceId,
    });
    const refused = await toolWords(await as(parent), "discard_workspace", {
      workspace: b.workspaceId,
    });
    check(
      "(5) the parent's discard_workspace of WB is refused while p waits on the person, its words naming p, and WB stays",
      !stoppedB.refused &&
        refused.refused &&
        refused.text.includes(p) &&
        workspaceState(b.workspaceId) === "active",
      JSON.stringify({
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

    // (7) The discard goes through; p's tab says its server isn't running.
    const discarded = await toolWords(await as(parent), "discard_workspace", {
      workspace: b.workspaceId,
    });
    await tab.reload({ waitUntil: "domcontentloaded" });
    const gone = await until(
      "p's tab saying its server isn't running",
      () => tabReads(tab),
      (now) => now.down,
      60_000
    ).catch(() => tabReads(tab));
    const originGone = await originReads(fleet, p);
    check(
      "(7) WB's discard goes through, and p's tab says its server isn't running (the pane's server state), its origin answering that down page, never a 502",
      !discarded.refused &&
        workspaceState(b.workspaceId) === "archived" &&
        gone.down &&
        originGone.status !== 502 &&
        originGone.down === "server",
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
