/**
 * A proposal that no longer applies closes itself, and its proposer hears
 * why, so it proposes again from where things stand now (the owner's pick of
 * 2026-11-06, "Close and re-propose"). It replaces the card that stood after
 * its file changed, refusing Approve with "Reject it" (97e6c881a).
 *
 * On a scratch fleet (real hub, agent, sessiond), at 1440:
 *
 *  (a) A session proposes a change to `delegates/scout.md` (caw.ts
 *      `folder_write` → memory.ts `proposeType`), and its card stands on
 *      the session's page. The person rewrites the same line (a commit to
 *      the folder). With nothing pressed, the hub closes the proposal: it
 *      leaves `GET /api/pending`, its card leaves the page and Needs you,
 *      its file leaves `memory/proposals/` in a commit that says why, the
 *      file stays as the person wrote it, and the proposing session is sent
 *      the notice (under the ask's origin, which wakes it), its transcript
 *      saying "Proposal closed: …" once where the card stood.
 *  (b) The race the hub cannot see coming: a second proposal, and the file
 *      changed on disk with no commit, so the proposal still stands. Approve
 *      on its card closes it then: it leaves `GET /api/pending` and the
 *      page, the transcript says why, and the session is sent the notice.
 *  (c) A delegate (a work item of a session) asks something (asks.ts), and
 *      is stopped before anyone answers: its ask closes and leaves `GET
 *      /api/pending`, and the session that started it is told CawCo closed
 *      it and why (delegate-waits.ts). A delegate makes no proposal of its
 *      own (roles.ts: no folder_write, memory_propose or admin write), so
 *      its ask is a question.
 *
 * Main fails (a): the proposal stands until Approve is pressed, nobody is
 * told; (b): Approve is refused with "Reject it" and the card stays; (c):
 * the parent hears only that the ask was withdrawn.
 *
 *   bun scripts/probe-kit/run.ts proposal-closes-stale
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { askWords } from "../../../packages/core/src/words/asks";
import { delegateWaitWords } from "../../../packages/core/src/words/delegates";
import { toolWords } from "../../lib/tool-call";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const PATH = "delegates/scout.md";
const TYPE = (line: string) =>
  `---\nharness: claude\nmodel: claude-opus-5-5\n---\n${line}\n`;
/** The type as the person wrote it, as the session proposes it, and as the person rewrites it. */
const FIRST = TYPE("Scouts the field.");
const PROPOSED = TYPE("Scouts the field and reports back.");
const REWRITTEN = TYPE("Scouts the field quietly.");
/** (b): the second proposal, and the edit on disk no commit carries. */
const PROPOSED_AGAIN = TYPE("Scouts the field loudly.");
const ON_DISK = TYPE("Scouts the field at night.");

/** The card's buttons on the session's page. */
const APPROVE = "[data-slot=hitl] [data-prompt-grant]";
const DENY = "[data-slot=hitl] [data-prompt-refuse]";
const PROPOSAL_TOOL = "mcp__cawco__delegate_type_proposal";

interface Parked {
  instanceId?: string;
  payload?: { toolName?: string };
  requestId?: string;
}

const pendingNow = (fleet: KitFleet) =>
  fleet.api<Parked[]>(hubRequest("GET /api/pending"));

/** Waits until `requestId` is off the ledger; answers whether it went. */
const leaves = (fleet: KitFleet, requestId: string) =>
  until(
    `${requestId} off the ledger`,
    async () =>
      !(await pendingNow(fleet)).some((one) => one.requestId === requestId),
    Boolean,
    30_000
  ).catch(() => false);

/** Whether `instanceId` was sent words holding `text`, within the wait. */
const sentTo = (fleet: KitFleet, instanceId: string, text: string) =>
  until(
    `${instanceId.slice(0, 8)} sent ${text.slice(0, 40)}…`,
    async () =>
      fleet
        .query<{ origin: string | null }>(
          "SELECT json_extract(body, '$.origin.name') AS origin FROM sent_messages WHERE instance_id = ? AND instr(body, ?) > 0",
          instanceId,
          text
        )
        .map((row) => row.origin),
    (origins) => origins.length > 0,
    30_000
  ).catch(() => [] as (string | null)[]);

/** The closing notice's line in the proposing session's transcript. */
const LINE = askWords.proposalClosedLine(PATH);

/** How many closing lines `page` shows, once it shows `n` (or the wait ends). */
const linesShown = (page: Page, n: number) =>
  until(
    `${n} closing line(s) on the session's page`,
    () => page.getByText(LINE, { exact: true }).count(),
    (count) => count >= n,
    30_000
  ).catch(() => page.getByText(LINE, { exact: true }).count());

/** The session's proposal of `content` to scout.md, parked: its request id. */
const proposeOn = async (
  fleet: KitFleet,
  session: string,
  content: string
): Promise<{ requestId?: string; said: string }> => {
  const before = new Set((await pendingNow(fleet)).map((one) => one.requestId));
  const said = await toolWords(
    {
      base: fleet.base,
      id: session,
      credential: await fleet.sessionCredential(session),
    },
    "folder_write",
    { path: PATH, content }
  );
  const parked = await until(
    "the proposal parked",
    async () =>
      (await pendingNow(fleet)).find(
        (one) =>
          one.payload?.toolName === PROPOSAL_TOOL && !before.has(one.requestId)
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  return { requestId: parked?.requestId, said: said.text.slice(0, 300) };
};

/** (c)'s delegate's brief: its turn streams on slowly, so it is working when it asks. */
const SLOW = "PROBE-CLOSE-STALE";

/** The mock: (c)'s delegate answers word by word for minutes; every other request says ok. */
const respond = (request: Seen): Reply =>
  request.all.includes(SLOW)
    ? { everyMs: 1000, words: Array.from({ length: 600 }, () => "working") }
    : { everyMs: 5, words: ["ok"] };

const run = async (kit: Kit): Promise<void> => {
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
  await proposalLegs(kit, fleet, base);
  await delegateLeg(kit, fleet);
};

/** Legs (a) and (b): proposals to delegates/scout.md whose file changed under them. */
const proposalLegs = async (
  kit: Kit,
  fleet: KitFleet,
  base: string
): Promise<void> => {
  const project = await fleet.api<{ id: string }>(
    hubRequest("POST /api/projects", {
      body: {
        name: "Scouting",
        machineId: MACHINE,
        cwd: fleet.repo,
        caw: false,
      },
    })
  );
  const write = (content: string) =>
    fleet.api(
      hubRequest("PUT /api/projects/:id/folder/file", {
        path: { id: project.id },
        body: { path: PATH, content },
      })
    );
  const read = async () =>
    (
      await fleet.api<{ content: string }>(
        hubRequest("GET /api/projects/:id/folder/file", {
          path: { id: project.id },
          query: { path: PATH },
        })
      )
    ).content;
  await write(FIRST);
  const session = await fleet.spawn("claude", "Scouting", fleet.repo, {
    projectId: project.id,
  });

  // (a) The person rewrites the file under the proposal; nothing is pressed.
  const first = await proposeOn(fleet, session, PROPOSED);
  if (!first.requestId) {
    kit.check(
      "(a) the session's folder_write of delegates/scout.md is a proposal waiting on the person",
      false,
      first.said
    );
    return;
  }
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, APPROVE);
  await write(REWRITTEN);
  const gone = await leaves(fleet, first.requestId);
  const cardGone = await page
    .locator(DENY)
    .waitFor({ state: "detached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const needs = await kit.page("desk");
  await open(needs, `${base}/`, "body");
  await needs.waitForTimeout(3000);
  const needsRow = await needs
    .locator('button[data-deny][aria-label*="scout"]')
    .count();
  const history = await fleet.api<{ commits: { message: string }[] }>(
    hubRequest("GET /api/projects/:id/folder/history", {
      path: { id: project.id },
      query: { path: `memory/proposals/${first.requestId}.json` },
    })
  );
  const closedCommit = history.commits.some(
    (commit) =>
      commit.message ===
      `memory: ${first.requestId} closed: ${askWords.proposalClosed(PATH)}`
  );
  const told = await sentTo(
    fleet,
    session,
    askWords.proposalClosedTold(first.requestId, PATH)
  );
  const file = await read();
  const lines = await linesShown(page, 1);
  kit.check(
    "(a) the file changed under a proposal: with nothing pressed it closes (off the ledger, its card off the page and Needs you), its file leaves in a commit saying why, the file stays the person's, and the proposing session is sent why under the ask's origin, its transcript saying so once",
    gone &&
      cardGone &&
      needsRow === 0 &&
      closedCommit &&
      file === REWRITTEN &&
      told.includes("ask") &&
      lines === 1,
    JSON.stringify({
      gone,
      cardGone,
      needsRow,
      closedCommit,
      file,
      told,
      lines,
    })
  );

  // (b) The file changes on disk with no commit: only Approve finds it out.
  const second = await proposeOn(fleet, session, PROPOSED_AGAIN);
  if (!second.requestId) {
    kit.check(
      "(b) a second proposal of delegates/scout.md waits on the person",
      false,
      second.said
    );
    return;
  }
  await writeFile(
    join(fleet.sandbox, "hub", "projects", project.id, PATH),
    ON_DISK
  );
  await open(page, `${base}/session/${session}`, APPROVE);
  await page.waitForTimeout(1000);
  const standing = (await pendingNow(fleet)).some(
    (one) => one.requestId === second.requestId
  );
  await page.locator(APPROVE).click();
  const goneAtPress = await leaves(fleet, second.requestId);
  const cardGoneAtPress = await page
    .locator(DENY)
    .waitFor({ state: "detached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const said = (await linesShown(page, 2)) === 2;
  const toldAtPress = await sentTo(
    fleet,
    session,
    askWords.proposalClosedTold(second.requestId, PATH)
  );
  kit.check(
    "(b) a change no commit carried, found by Approve: the proposal closes then (off the ledger, its card off the page), the session's transcript says why, and the session is sent why under the ask's origin",
    standing &&
      goneAtPress &&
      cardGoneAtPress &&
      said &&
      toldAtPress.includes("ask"),
    JSON.stringify({
      standing,
      goneAtPress,
      cardGoneAtPress,
      said,
      toldAtPress,
    })
  );
};

/**
 * Leg (c): a delegate's ask, closed as its delegate ends: the session that
 * started it hears why.
 */
const delegateLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const steward = await fleet.spawn("claude", "Steward", fleet.repo);
  const delegate = await fleet.api<{ instanceId: string }>(
    hubRequest("POST /api/work-items", {
      body: {
        parentInstanceId: steward,
        title: "Asking delegate",
        prompt: `${SLOW}: work on.`,
        harness: "claude",
        model: MODEL.claude,
        host: true,
      },
    })
  );
  await until(
    "the delegate running",
    () => fleet.instance(delegate.instanceId),
    (row) => row?.status === "running",
    180_000
  );
  const said = await toolWords(
    {
      base: fleet.base,
      id: delegate.instanceId,
      credential: await fleet.sessionCredential(delegate.instanceId),
    },
    "ask",
    {
      questions: [
        {
          header: "Scope",
          question: "Should the scout cover the north field too?",
          multiSelect: false,
          options: [
            { label: "Yes", description: "Both fields." },
            { label: "No", description: "The south field only." },
          ],
        },
      ],
      blocks: false,
      meanwhile: "Going ahead with the south field.",
    }
  );
  const ask = await until(
    "the delegate's question waiting",
    async () =>
      (await pendingNow(fleet)).find(
        (one) =>
          one.instanceId === delegate.instanceId &&
          one.requestId?.startsWith("ask_")
      ),
    Boolean,
    30_000
  ).catch(() => undefined);
  if (!ask?.requestId) {
    kit.check(
      "(c) the delegate's question waits",
      false,
      said.text.slice(0, 300)
    );
    return;
  }
  await fleet.stopSession(delegate.instanceId);
  const gone = await leaves(fleet, ask.requestId);
  // "CawCo closed it …: <why>." with the hub's reason (asks.ts `ENDED_WHY`).
  const [closedOpening] = delegateWaitWords.closed("\u0000").split("\u0000");
  const told = await sentTo(
    fleet,
    steward,
    `${closedOpening}its session ended before anyone answered`
  );
  kit.check(
    "(c) a delegate stopped while its ask waits: the ask closes, and the session that started it is told CawCo closed it and why",
    gone && told.length > 0,
    JSON.stringify({ gone, told })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "proposal-closes-stale",
  run,
};
export default spec;
