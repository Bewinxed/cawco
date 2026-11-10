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
 *  (d) A session proposes a new file in the person's design system
 *      (design-system.ts `propose`), and the person then writes that file
 *      first: with nothing pressed, the proposal closes, the file stays
 *      theirs, and the session is sent why.
 *  (e) (b)'s refused Approve is said on the proposing session's page: its
 *      card stood there, though its ask is parked under the proposal.
 *  (f) A session with an approval waiting is continued by another session
 *      (`continue_session`), so it goes on as one session in its
 *      continuation: the approval is parked again under the session it went
 *      on in, and its card is drawn on that session's page.
 *  (g) is its own spec, proposal-closes-item-ended: it starts a workspace
 *      boundary, so it runs on the host.
 *  (h) (f)'s session also had a memory proposal and a design proposal
 *      waiting: after the fold both name the session it went on in, and
 *      still do once the hub restarts.
 *  (i) A host-scope delegate (no clone, no boundary) working in a
 *      repository of its own writes a design system there with
 *      design_write: it lands, run on the host as its session's commands
 *      are, and the file is in the repository.
 *
 * Main fails (a): the proposal stands until Approve is pressed, nobody is
 * told; (b): Approve is refused with "Reject it" and the card stays; (c):
 * the parent hears only that the ask was withdrawn.
 *
 *   bun scripts/probe-kit/run.ts proposal-closes-stale
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
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
import { payloadOf } from "../hub";
import { delegateStarted, open } from "../kit";
import type { Kit, KitFleet, Spec } from "../spec";

const PATH = "delegates/scout.md";
const TYPE = (line: string) =>
  `---\nharness: claude\nmodel: claude-opus-5-5\n---\n${line}\n`;
/** The type as the person wrote it, as the session proposes it, and as the person rewrites it. */
const FIRST = TYPE("Scouts the field.");
const PROPOSED = TYPE("Scouts the field and reports back.");
const REWRITTEN = TYPE("Scouts the field quietly.");
/** (b): the second proposal, and the edit on disk no commit carries. */
const PROPOSED_AGAIN = TYPE("Scouts the field loudly.");
/** (h): the folded session's proposal of a type of its own. */
const PROPOSED_FOLD = TYPE("Scouts the field after the fold.");
const ON_DISK = TYPE("Scouts the field at night.");

/** The card's buttons on the session's page. */
const APPROVE = "[data-slot=hitl] [data-prompt-grant]";
const DENY = "[data-slot=hitl] [data-prompt-refuse]";
const PROPOSAL_TOOL = "mcp__cawco__delegate_type_proposal";
export const pendingNow = (fleet: KitFleet) =>
  fleet.api((hub) => hub.api.pending.get());

/** Waits until `requestId` is off the ledger; answers whether it went. */
export const leaves = (fleet: KitFleet, requestId: string) =>
  until(
    `${requestId} off the ledger`,
    async () =>
      !(await pendingNow(fleet)).some((one) => one.requestId === requestId),
    Boolean,
    30_000
  ).catch(() => false);

/** Whether `instanceId` was sent words holding `text`, within the wait. */
export const sentTo = (fleet: KitFleet, instanceId: string, text: string) =>
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
          payloadOf(one).toolName === PROPOSAL_TOOL &&
          !before.has(one.requestId)
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
  await fleet.up();
  const base = await fleet.dashboard();
  await proposalLegs(kit, fleet, base);
  await delegateLeg(kit, fleet);
  await foldLeg(kit, fleet, base);
  await hostLeg(kit, fleet);
};

/** The project legs (a), (b) and (f) work in, once (a) made it. */
const scouting = { id: "" };

/** Legs (a) and (b): proposals to delegates/scout.md whose file changed under them. */
const proposalLegs = async (
  kit: Kit,
  fleet: KitFleet,
  base: string
): Promise<void> => {
  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Scouting",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    })
  );
  const write = (content: string) =>
    fleet.api((hub) =>
      hub.api
        .projects({ id: project.id })
        .folder.file.put({ path: PATH, content })
    );
  const read = async () =>
    (
      await fleet.api((hub) =>
        hub.api
          .projects({ id: project.id })
          .folder.file.get({ query: { path: PATH } })
      )
    ).content;
  await write(FIRST);
  scouting.id = project.id;
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
  const history = await fleet.api((hub) =>
    hub.api.projects({ id: project.id }).folder.history.get({
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
  // (e) The press's own answer was refused, its card gone: said over the
  // composer of the session the card stood in, not the proposal's.
  const refusal = await page
    .getByText(askWords.proposalClosedOnAnswer(PATH))
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  kit.check(
    "(e) the refused Approve is said in the proposing session's page, where its card stood",
    refusal,
    JSON.stringify({ refusal })
  );
  await designLeg(kit, fleet, base, project.id);
};

/** The person's design system, a reference the session proposes, and the one the person writes there first. */
export const DESIGN = "# Scouting\n\nThe field guide.\n";
const DESIGN_PROPOSED = "# Field notes\n\nThe proposal's notes.\n";
const DESIGN_THEIRS = "# Field notes\n\nThe person's notes.\n";
const DESIGN_PATH = "design/references/field-notes.md";

/** Leg (d): a design proposal whose file the person changes closes on its own. */
const designLeg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  projectId: string
): Promise<void> => {
  const put = (path: string, content: string) =>
    fleet.api((hub) =>
      hub.api.projects({ id: projectId }).folder.file.put({ path, content })
    );
  await put(
    "design/manifest.json",
    `${JSON.stringify({ sources: {}, files: {} })}\n`
  );
  await put("design/DESIGN.md", DESIGN);
  const folder = join(fleet.sandbox, "hub", "projects", projectId);
  const designer = await fleet.spawn("claude", "Designer", folder, {
    projectId,
  });
  const before = new Set((await pendingNow(fleet)).map((one) => one.requestId));
  const said = await toolWords(
    {
      base: fleet.base,
      id: designer,
      credential: await fleet.sessionCredential(designer),
    },
    "design_write",
    {
      files: [{ path: "references/field-notes.md", content: DESIGN_PROPOSED }],
      why: "The probe's change to the field guide",
    }
  );
  const proposal = await until(
    "the design proposal parked",
    async () =>
      (await pendingNow(fleet)).find(
        (one) => one.requestId?.startsWith("dp-") && !before.has(one.requestId)
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  if (!proposal?.requestId) {
    kit.check(
      "(d) the designer's design_write is a proposal waiting on the person",
      false,
      said.text.slice(0, 300)
    );
    return;
  }
  const page = await kit.page("desk");
  await open(page, `${base}/session/${designer}`, APPROVE);
  await put(DESIGN_PATH, DESIGN_THEIRS);
  const gone = await leaves(fleet, proposal.requestId);
  const cardGone = await page
    .locator(DENY)
    .waitFor({ state: "detached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const told = await sentTo(
    fleet,
    designer,
    askWords.proposalClosedTold(proposal.requestId, DESIGN_PATH)
  );
  const line = await page
    .getByText(askWords.proposalClosedLine(DESIGN_PATH), { exact: true })
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const file = (
    await fleet.api((hub) =>
      hub.api
        .projects({ id: projectId })
        .folder.file.get({ query: { path: DESIGN_PATH } })
    )
  ).content;
  kit.check(
    "(d) the person wrote design/references/field-notes.md under a design proposal of it: with nothing pressed it closes (off the ledger, its card off the page), the file stays the person's, and the designer is sent why, its transcript saying so",
    gone && cardGone && file === DESIGN_THEIRS && told.includes("ask") && line,
    JSON.stringify({ gone, cardGone, file, told, line })
  );
};

/** The repository's own design system, committed and pushed to its origin, so a change to it is a proposal. */
export const commitDesign = async (repo: string): Promise<void> => {
  const git = (...args: string[]) => {
    const ran = Bun.spawnSync(
      [
        "git",
        "-C",
        repo,
        "-c",
        "user.name=probe",
        "-c",
        "user.email=probe@example.invalid",
        ...args,
      ],
      { env: process.env }
    );
    if (ran.exitCode !== 0) {
      throw new Error(`git ${args[0]}: ${ran.stderr.toString()}`);
    }
  };
  await mkdir(join(repo, "design"), { recursive: true });
  await writeFile(
    join(repo, "design", "manifest.json"),
    `${JSON.stringify({ sources: {}, files: {} })}\n`
  );
  await writeFile(join(repo, "design", "DESIGN.md"), DESIGN);
  git("add", "design");
  git("commit", "-q", "-m", "The repository's design system");
  // On origin's default branch too: a workspace is cut from there (agent
  // workspace.ts `cutClone`), and the project's system is the one on its
  // base branch on origin (design-system.ts `placeOf`).
  git("push", "-q", "origin", "HEAD");
};

/**
 * Leg (f): a session's approval, the session folded into its continuation:
 * the ask is parked again under the session it went on in, and its card is
 * drawn there.
 */
const foldLeg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string
): Promise<void> => {
  await commitDesign(fleet.repo);
  const source = await fleet.spawn("claude", "Folded source", fleet.repo, {
    projectId: scouting.id,
  });
  const opened = await fleet.send(source, "Say ok.");
  await until(
    "the source's turn read and ended",
    () => ({ send: fleet.sendRow(opened), row: fleet.instance(source) }),
    ({ send, row }) => send?.state === "read" && !row?.turn_open_at,
    180_000
  );
  const said = await toolWords(
    {
      base: fleet.base,
      id: source,
      credential: await fleet.sessionCredential(source),
    },
    "admin_rules_write",
    {
      action: "create",
      name: "probe-fold-ask",
      enabled: false,
      pattern: "probe-fold-ask",
      reply: "Nothing to do.",
      reason: "The proposal-closes-stale probe's folded ask.",
    }
  );
  const ask = await until(
    "the source's approval waiting on the person",
    async () =>
      (await pendingNow(fleet)).find(
        (one) => one.instanceId === source && one.requestId?.startsWith("ask_")
      ),
    Boolean,
    30_000
  ).catch(() => undefined);
  if (!ask?.requestId) {
    kit.check(
      "(f) the source's admin_rules_write waits on the person",
      false,
      said.text.slice(0, 300)
    );
    return;
  }
  // (h) Its memory proposal and its design proposal, waiting too.
  const memory = await proposeOn(fleet, source, PROPOSED_FOLD);
  const designed = await toolWords(
    {
      base: fleet.base,
      id: source,
      credential: await fleet.sessionCredential(source),
    },
    "design_write",
    {
      files: [{ path: "references/fold-notes.md", content: "# Fold notes\n" }],
      why: "The probe's change from a session that goes on",
    }
  );
  const design = (await pendingNow(fleet)).find(
    (one) =>
      one.requestId?.startsWith("dp-") &&
      payloadOf(one).originInstanceId === source
  );
  const caller = await fleet.spawn("claude", "Continuing caller", fleet.repo);
  const known = new Set(
    (await fleet.api((hub) => hub.api.continuations.get())).map((one) => one.id)
  );
  const continued = await toolWords(
    {
      base: fleet.base,
      id: caller,
      credential: await fleet.sessionCredential(caller),
    },
    "continue_session",
    {
      session: source,
      from: "asks",
      target_harness: "claude",
      target_model: MODEL.claude,
    },
    { timeoutMs: 300_000 }
  );
  const job = await until(
    "the continuation started",
    async () =>
      (await fleet.api((hub) => hub.api.continuations.get())).find(
        (one) => !known.has(one.id)
      ),
    (one) => one !== undefined && ["started", "failed"].includes(one.stage),
    240_000
  ).catch(() => undefined);
  if (job?.stage !== "started") {
    kit.check(
      "(f) the source's continuation starts, one session with it",
      false,
      `${JSON.stringify(job)} ${continued.text.slice(0, 300)}`
    );
    return;
  }
  const parkedUnder = await until(
    "the ask parked under the session it went on in",
    async () =>
      (await pendingNow(fleet)).find((one) => one.requestId === ask.requestId)
        ?.instanceId,
    (id) => id === job.targetInstanceId,
    30_000
  ).catch(
    async () =>
      (await pendingNow(fleet)).find((one) => one.requestId === ask.requestId)
        ?.instanceId
  );
  const page = await kit.page("desk");
  await open(page, `${base}/session/${job.targetInstanceId}`, "body");
  const drawn = await page
    .locator(APPROVE)
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  kit.check(
    "(f) a session folded into its continuation: its open approval is parked under the session it went on in, and its card is drawn on that session's page",
    parkedUnder === job.targetInstanceId && drawn,
    JSON.stringify({
      parkedUnder,
      target: job.targetInstanceId,
      source,
      drawn,
    })
  );
  if (!(memory.requestId && design?.requestId)) {
    kit.check(
      "(h) the source's memory and design proposals wait on the person",
      false,
      `${memory.said} ${designed.text.slice(0, 300)}`
    );
    return;
  }
  const ids = [memory.requestId, design.requestId];
  /** Each proposal's session, as its parked card names it. */
  const origins = async () => {
    const parked = await pendingNow(fleet);
    return ids.map(
      (id) =>
        payloadOf(parked.find((one) => one.requestId === id) ?? {})
          .originInstanceId
    );
  };
  const target = job.targetInstanceId;
  const moved = await until(
    "the proposals parked under the session it went on in",
    origins,
    (now) => now.every((one) => one === target),
    30_000
  ).catch(origins);
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const afterRestart = await until(
    "the proposals parked again as the hub starts",
    origins,
    (now) => now.every((one) => one !== undefined),
    60_000
  ).catch(origins);
  kit.check(
    "(h) a session folded into its continuation: its memory and design proposals name the session it went on in, before and after the hub restarts",
    moved.every((one) => one === target) &&
      afterRestart.every((one) => one === target),
    JSON.stringify({ source, target, moved, afterRestart })
  );
};

/**
 * Leg (c): a delegate's ask, closed as its delegate ends: the session that
 * started it hears why.
 */
const delegateLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const steward = await fleet.spawn("claude", "Steward", fleet.repo);
  const delegate = delegateStarted(
    await fleet.api((hub) =>
      hub.api["work-items"].post({
        parentInstanceId: steward,
        title: "Asking delegate",
        prompt: `${SLOW}: work on.`,
        harness: "claude",
        model: MODEL.claude,
        host: true,
      })
    )
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

/** (i): the design guide a host-scope delegate writes. */
const HOST_DESIGN = "# Host notes\n\nWritten from the host.\n";

/** Leg (i): a host-scope delegate's design_write in its own repository lands. */
const hostLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const repo = join(fleet.sandbox, "host-repo");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), "# Host repo\n");
  for (const args of [
    ["init", "-q"],
    ["add", "README.md"],
    ["commit", "-q", "-m", "Start"],
  ]) {
    const ran = Bun.spawnSync(
      [
        "git",
        "-C",
        repo,
        "-c",
        "user.name=probe",
        "-c",
        "user.email=probe@example.invalid",
        ...args,
      ],
      { env: process.env }
    );
    if (ran.exitCode !== 0) {
      throw new Error(`git ${args[0]}: ${ran.stderr.toString()}`);
    }
  }
  const steward = await fleet.spawn("claude", "Host steward", fleet.repo, {
    projectId: scouting.id,
  });
  const delegate = delegateStarted(
    await fleet.api((hub) =>
      hub.api["work-items"].post({
        parentInstanceId: steward,
        title: "Host designer",
        prompt: `${SLOW}: work on.`,
        harness: "claude",
        model: MODEL.claude,
        host: true,
        cwd: repo,
      })
    )
  );
  await until(
    "the host designer running",
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
    "design_write",
    { files: [{ path: "DESIGN.md", content: HOST_DESIGN }] }
  );
  const landed = await readFile(join(repo, "design", "DESIGN.md"), "utf8")
    .then((text) => text === HOST_DESIGN)
    .catch(() => false);
  kit.check(
    "(i) a host-scope delegate's design_write in its own repository lands there, run on the host",
    landed,
    JSON.stringify({ landed, said: said.text.slice(0, 300) })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "proposal-closes-stale",
  run,
};
export default spec;
