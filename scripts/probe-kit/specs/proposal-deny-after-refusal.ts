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
 *
 * Main fails (a): both buttons are disabled after the refusal, so (b)'s
 * Deny is never pressed.
 *
 *   bun scripts/probe-kit/run.ts proposal-deny-after-refusal
 */
import { hubRequest } from "../../../packages/core/src/hub-request";
import { askWords } from "../../../packages/core/src/words/asks";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

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

  const base = await fleet.dashboard();
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

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "proposal-deny-after-refusal",
  run,
};
export default spec;
