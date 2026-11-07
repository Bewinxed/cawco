/**
 * A design proposal with nowhere to land closes itself: the "target is
 * gone" case of the rule every proposal holds to (proposal-closes-stale,
 * whose leg (g) this is). A delegate in a workspace cut from the
 * repository proposes a change to the repository's design system in its
 * clone (design-system.ts `propose`), and is stopped, its work item ended:
 * nothing would land a commit in that clone any more, so the proposal
 * closes (design-system.ts `itemGone`), and the session that started the
 * delegate is told CawCo closed it and why (delegate-waits.ts).
 *
 * Main fails it: the proposal stands, and Approve is refused with "Deny it".
 *
 *   bun scripts/probe-kit/run.ts proposal-closes-item-ended
 */
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
import type { Kit, Spec } from "../kit";
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
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await fleet.api(
    hubRequest("POST /api/projects", {
      body: {
        name: "Scouting",
        machineId: MACHINE,
        cwd: fleet.repo,
        caw: false,
      },
    })
  );
  await commitDesign(fleet.repo);
  const steward = await fleet.spawn("claude", "Item steward", fleet.repo);
  const delegate = await fleet.api<{ instanceId: string }>(
    hubRequest("POST /api/work-items", {
      body: {
        parentInstanceId: steward,
        title: "Item designer",
        prompt: `${SLOW}: work on.`,
        harness: "claude",
        model: MODEL.claude,
        cwd: fleet.repo,
        lands: "none",
      },
    })
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
  await fleet.stopSession(delegate.instanceId);
  const gone = await leaves(fleet, proposal.requestId);
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
    "a delegate's design proposal in its own repository, its work item ended: the proposal closes, and the session that started the delegate is told CawCo closed it and why",
    gone && told.length > 0,
    JSON.stringify({ gone, told })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "proposal-closes-item-ended",
  host: "it starts a delegate's workspace boundary, and no boundary starts inside another",
  run,
};
export default spec;
