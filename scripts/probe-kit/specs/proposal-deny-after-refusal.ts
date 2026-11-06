/**
 * A proposal the hub refuses to apply can still be denied. Caw proposed a
 * change to `delegates/scout.md` (caw.ts `folder_write` → memory.ts
 * `proposeType`); the file changed under it; the person pressed Approve and
 * the hub refused it (memory.ts `apply`: "… changed since this was
 * proposed … Reject it"). The card said so and drew both Approve and Deny
 * greyed out: its press latch (transcript/Prompt.svelte `pressed`) stayed
 * set after the refusal, so every button read as a peer of a pending one.
 *
 * On a scratch fleet (real hub, agent, sessiond), at 1440, the proposing
 * session's page:
 *
 *  (a) Approve on the proposal's card is refused with the hub's words, and
 *      Deny stays pressable (Approve too, for another try).
 *  (b) Deny then closes the proposal: the hub holds it no longer
 *      (`GET /api/pending`), the card leaves the session and Needs you
 *      draws no row for it, and the file is the person's, untouched.
 *  (c) A move's approval (move/MoveWait.svelte), on a second machine: a
 *      plain folder's move to it waits on the person. The page's answer
 *      never reaches the hub (the probe drops it on the page's socket), so
 *      the ledger calls it off ("never acknowledged"): the card says
 *      "Couldn't send that answer." and why under its buttons, once on the
 *      page (nothing over the composer too), and both buttons stand again.
 *      Let through, Don't move then cancels the move.
 *
 * Main fails (a): both buttons are disabled after the refusal, so (b)'s
 * Deny is never pressed.
 *
 *   bun scripts/probe-kit/run.ts proposal-deny-after-refusal
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hubRequest } from "../../../packages/core/src/hub-request";
import type { MoveJob } from "../../../packages/core/src/move";
import { askWords } from "../../../packages/core/src/words/asks";
import { spawnWords } from "../../../packages/core/src/words/spawn";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const PATH = "delegates/scout.md";
const TYPE = (line: string) =>
  `---\nharness: claude\nmodel: claude-opus-5-5\n---\n${line}\n`;
/** The type as the person wrote it, as Caw proposes it, and as the person rewrites it before answering. */
const FIRST = TYPE("Scouts the field.");
const PROPOSED = TYPE("Scouts the field and reports back.");
const REWRITTEN = TYPE("Scouts the field quietly.");

/** The card's buttons on the session's page. */
const APPROVE = "[data-slot=hitl] [data-prompt-grant]";
const DENY = "[data-slot=hitl] [data-prompt-refuse]";
const REFUSED = '[data-slot=hitl] [data-slot="refused"]';
/** The card's refusal: the hub's words for a proposal its file outgrew, after "Couldn't send that answer." */
const STALE = `${askWords.cantSendAnswer} ${askWords.proposalStale(PATH, "Caw")}`;

interface Parked {
  payload?: { toolName?: string };
  requestId?: string;
}

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet((): Reply => ({ everyMs: 5, words: ["ok"] }));
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
  await moveLeg(kit, fleet, base);
};

/** Legs (a) and (b): a proposal to delegates/scout.md, refused, then denied. */
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
  const said = await toolWords(
    {
      base: fleet.base,
      id: session,
      credential: await fleet.sessionCredential(session),
    },
    "folder_write",
    { path: PATH, content: PROPOSED }
  );
  const proposal = await until(
    "the proposal parked",
    async () =>
      (await fleet.api<Parked[]>(hubRequest("GET /api/pending"))).find(
        (one) => one.payload?.toolName === "mcp__cawco__delegate_type_proposal"
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  if (!proposal?.requestId) {
    kit.check(
      "the session's folder_write of delegates/scout.md is a proposal waiting on the person",
      false,
      said.text.slice(0, 300)
    );
    return;
  }
  // The file changes under the proposal: the person rewrites the same line.
  await write(REWRITTEN);

  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, APPROVE);
  await page.locator(APPROVE).click();
  const refusal = await page
    .locator(REFUSED)
    .textContent({ timeout: 30_000 })
    .catch(() => null);
  // Settled: the refusal is drawn and the press latch has had its frame.
  await page.waitForTimeout(500);
  const after = {
    refusal,
    approve: await page.locator(APPROVE).isEnabled(),
    deny: await page.locator(DENY).isEnabled(),
  };
  kit.check(
    "(a) Approve on a proposal whose file changed is refused with the hub's words, and Deny (and Approve again) stay pressable",
    refusal?.trim() === STALE && after.approve && after.deny,
    JSON.stringify(after)
  );
  if (!after.deny) {
    return;
  }

  await page.locator(DENY).click();
  const gone = await until(
    "the proposal closed",
    async () =>
      !(await fleet.api<Parked[]>(hubRequest("GET /api/pending"))).some(
        (one) => one.requestId === proposal.requestId
      ),
    Boolean,
    30_000
  ).catch(() => false);
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
  const file = await read();
  kit.check(
    "(b) Deny then closes the proposal: the hub holds it no longer, its card leaves the session, Needs you draws no row for it, and the file stays as the person wrote it",
    gone && cardGone && needsRow === 0 && file === REWRITTEN,
    JSON.stringify({ gone, cardGone, needsRow, file })
  );
};

/** The second machine a move goes to. */
const B = "probe-refusal-b";
/** The move's approval card. */
const MOVE_CARD = '[data-slot="move-wait-card"]';

/** Leg (c): a move's approval whose answer never reached the hub. */
const moveLeg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string
): Promise<void> => {
  await fleet.launchMachine(B);
  // A plain folder: its move waits on the person's approval (move-settled).
  const folder = join(fleet.sandbox, "plain-move");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "README.md"), "# Plain move\n");
  const project = await fleet.api<{ id: string }>(
    hubRequest("POST /api/projects", {
      body: { name: "Plain move", machineId: MACHINE, cwd: folder },
    })
  );
  const started = await fleet.api<{ id?: string }>(
    hubRequest("POST /api/projects/:id/moves", {
      path: { id: project.id },
      body: {
        machineId: B,
        path: join(fleet.sandbox, "moved"),
        prompt: "PROBE-MOVE: say ok.",
        spawn: {
          harness: "claude",
          model: "claude-haiku-4-5",
          permissionMode: "default",
        },
      },
    })
  );
  const jobOf = async () =>
    (await fleet.api<MoveJob[]>(hubRequest("GET /api/moves"))).find(
      (each) => each.id === started.id
    );
  const job = await until(
    "the move waiting on the person",
    jobOf,
    (one) => one?.stage === "approval" && Boolean(one.askId),
    120_000
  ).catch(jobOf);
  if (!(job?.stage === "approval" && job.askId)) {
    kit.check(
      "(c) a plain folder's move to a second machine waits on the person's approval",
      false,
      JSON.stringify(job)
    );
    return;
  }
  const page = await kit.page("desk");
  // The page's answers are dropped on its socket while `link.dropping`.
  const link: { dropping: boolean } = { dropping: true };
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        if (!(link.dropping && String(message).includes("permission.answer"))) {
          server.send(message);
        }
      });
      server.onMessage((message) => ws.send(message));
      ws.onClose((code, why) => {
        server.close({ code, reason: why }).catch(() => undefined);
      });
      server.onClose((code, why) => {
        ws.close({ code, reason: why }).catch(() => undefined);
      });
    }
  );
  await open(page, `${base}/session/${job.targetInstanceId}`, MOVE_CARD);
  const card = page.locator(MOVE_CARD);
  const approve = card.getByRole("button", {
    name: spawnWords.moveIt,
    exact: true,
  });
  const deny = card.getByRole("button", {
    name: spawnWords.dontMove,
    exact: true,
  });
  await approve.click();
  // The ledger calls an unacknowledged answer off after 15 s (stream.ts).
  const refusal = await card
    .getByText(askWords.cantSendAnswer)
    .textContent({ timeout: 45_000 })
    .catch(() => null);
  await page.waitForTimeout(500);
  const reason = refusal?.trim().slice(askWords.cantSendAnswer.length).trim();
  const said = reason
    ? await page.evaluate(
        (words) => document.body.innerText.split(words).length - 1,
        reason
      )
    : 0;
  const after = {
    refusal,
    said,
    approve: await approve.isEnabled(),
    deny: await deny.isEnabled(),
  };
  kit.check(
    "(c) a move approval's answer refused on its way: the card says \"Couldn't send that answer.\" and why under its buttons, once on the page, and both buttons stand again",
    (refusal?.trim().startsWith(askWords.cantSendAnswer) ?? false) &&
      Boolean(reason) &&
      said === 1 &&
      after.approve &&
      after.deny,
    JSON.stringify(after)
  );
  if (!after.deny) {
    return;
  }
  link.dropping = false;
  await deny.click();
  const ended = await until(
    "the move cancelled",
    jobOf,
    (one) => one?.stage === "cancelled",
    30_000
  ).catch(jobOf);
  kit.check(
    "(c) let through, Don't move then cancels the move",
    ended?.stage === "cancelled",
    JSON.stringify({ stage: ended?.stage })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "proposal-deny-after-refusal",
  run,
};
export default spec;
