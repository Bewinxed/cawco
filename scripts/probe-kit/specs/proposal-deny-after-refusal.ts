/**
 * A refused answer frees its card: an answer the hub never took leaves
 * both buttons standing, with why under them, so the person can answer
 * again. A move's approval (move/MoveWait.svelte), on a second machine: a
 * plain folder's move to it waits on the person. The page's answer never
 * reaches the hub (the probe drops it on the page's socket), so the ledger
 * calls it off ("never acknowledged"): the card says "Couldn't send that
 * answer." and why under its buttons, once on the page (nothing over the
 * composer too), and both buttons stand again. Let through, Don't move then
 * cancels the move.
 *
 * Its first legs, a proposal whose file changed refused at Approve and then
 * denied, are gone with that refusal: such a proposal now closes itself
 * (proposal-closes-stale).
 *
 *   bun scripts/probe-kit/run.ts proposal-deny-after-refusal
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { askWords } from "../../../packages/core/src/words/asks";
import { spawnWords } from "../../../packages/core/src/words/spawn";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { open } from "../kit";
import type { Kit, KitFleet, Spec } from "../spec";

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
  await moveLeg(kit, fleet, base);
};

/** The second machine a move goes to. */
const B = "probe-refusal-b";
/** The move's approval card. */
const MOVE_CARD = '[data-slot="move-wait-card"]';

/** A move's approval whose answer never reached the hub. */
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
  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Plain move",
      machineId: MACHINE,
      cwd: folder,
    })
  );
  const started = await fleet.api((hub) =>
    hub.api.projects({ id: project.id }).moves.post({
      machineId: B,
      path: join(fleet.sandbox, "moved"),
      prompt: "PROBE-MOVE: say ok.",
      spawn: {
        harness: "claude",
        model: "claude-haiku-4-5",
        permissionMode: "default",
      },
    })
  );
  const jobOf = async () =>
    (await fleet.api((hub) => hub.api.moves.get())).find(
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
      "a plain folder's move to a second machine waits on the person's approval",
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
    "a move approval's answer refused on its way: the card says \"Couldn't send that answer.\" and why under its buttons, once on the page, and both buttons stand again",
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
    "let through, Don't move then cancels the move",
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
