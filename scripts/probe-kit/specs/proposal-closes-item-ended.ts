/**
 * A design proposal with nowhere to land closes itself: the "target is
 * gone" case of the rule every proposal holds to (proposal-closes-stale,
 * whose leg (g) this is). A delegate in a workspace cut from the
 * repository proposes a change to the repository's design system in its
 * clone (design-system.ts `propose`), and is stopped, its work item ended:
 * nothing would land a commit in that clone any more, so the proposal
 * closes (design-system.ts `itemGone`), and the session that started the
 * delegate is told CawCo closed it and why (delegate-waits.ts); its row
 * leaves Needs you. The design system is committed and pushed to the
 * repository's origin first: a workspace is cut from origin's default
 * branch, and the project's system is the one on its base branch there.
 *
 * Main fails it: the proposal stands, and Approve is refused with "Deny it".
 *
 *   bun scripts/probe-kit/run.ts proposal-closes-item-ended
 */
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
import type { Kit, Spec } from "../spec";
import {
  commitDesign,
  leaves,
  pendingNow,
  sentTo,
} from "./proposal-closes-stale";

/** The delegate's brief: its turn streams on slowly, so it is working when it proposes. */
const SLOW = "PROBE-ITEM-ENDED";

/** The mock: the delegate answers word by word for minutes; every other request says ok. */
const respond = (request: Seen): Reply =>
  request.all.includes(SLOW)
    ? { everyMs: 1000, words: Array.from({ length: 600 }, () => "working") }
    : { everyMs: 5, words: ["ok"] };

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  await fleet.up();
  const base = await fleet.dashboard();
  await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Scouting",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    })
  );
  await commitDesign(fleet.repo);
  const steward = await fleet.spawn("claude", "Item steward", fleet.repo);
  const delegate = delegateStarted(
    await fleet.api((hub) =>
      hub.api["work-items"].post({
        parentInstanceId: steward,
        title: "Item designer",
        prompt: `${SLOW}: work on.`,
        harness: "claude",
        model: MODEL.claude,
        cwd: fleet.repo,
        lands: "none",
      })
    )
  );
  await until(
    "the item's designer running",
    () => fleet.instance(delegate.instanceId),
    (row) => row?.status === "running",
    180_000
  );
  const before = new Set((await pendingNow(fleet)).map((one) => one.requestId));
  const said = await toolWords(
    {
      base: fleet.base,
      id: delegate.instanceId,
      credential: await fleet.sessionCredential(delegate.instanceId),
    },
    "design_write",
    {
      files: [{ path: "references/item-notes.md", content: "# Item notes\n" }],
      why: "The probe's change from a work item",
    }
  );
  const proposal = await until(
    "the item's design proposal parked",
    async () =>
      (await pendingNow(fleet)).find(
        (one) => one.requestId?.startsWith("dp-") && !before.has(one.requestId)
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  if (!proposal?.requestId) {
    kit.check(
      "the item's design_write is a proposal waiting on the person",
      false,
      said.text.slice(0, 300)
    );
    return;
  }
  // The person's view of it: its row in Needs you, by what it asks.
  const { presentation } = payloadOf(
    (await pendingNow(fleet)).find(
      (one) => one.requestId === proposal.requestId
    ) ?? {}
  );
  const summary =
    typeof presentation === "object" &&
    presentation !== null &&
    "summary" in presentation &&
    typeof presentation.summary === "string"
      ? presentation.summary
      : undefined;
  const needs = await kit.page("desk");
  await open(needs, `${base}/`, "body");
  const needsRow = summary ? needs.getByText(summary).first() : undefined;
  const shown = needsRow
    ? await needsRow
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
    : false;
  await fleet.stopSession(delegate.instanceId);
  const gone = await leaves(fleet, proposal.requestId);
  const rowGone = needsRow
    ? await needsRow
        .waitFor({ state: "detached", timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
    : false;
  const told = await sentTo(
    fleet,
    steward,
    delegateWaitWords.closed(
      askWords.proposalItemEnded(
        fleet.query<{ path: string }>(
          "SELECT path FROM workspaces WHERE id = (SELECT workspace_id FROM work_items WHERE instance_id = ?)",
          delegate.instanceId
        )[0]?.path ?? ""
      )
    )
  );
  kit.check(
    "a delegate's design proposal in its workspace's clone, its work item ended: the proposal closes (off the ledger, its row gone from Needs you), and the session that started the delegate is told CawCo closed it and why (the delegate itself ended, so it is told nothing)",
    shown && gone && rowGone && told.length > 0,
    JSON.stringify({ summary, shown, gone, rowGone, told })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "proposal-closes-item-ended",
  host: "it starts a delegate's workspace boundary, and no boundary starts inside another",
  run,
};
export default spec;
