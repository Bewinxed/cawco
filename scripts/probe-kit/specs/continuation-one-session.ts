/**
 * A continuation anything but the person's own Continue asks for is its
 * source going on in a new session: one session, its steps all or nothing
 * (continuations.ts `oneSession`).
 *
 * 2026-11-05 10:13:07, obelisk's hub, project Private office: Caw went on
 * from a summary as its move. The new session took Caw's 30 delegates
 * (`adoptChildren`, committed on its own), was handed its opening, and only
 * then was Caw folded into it; the fold failed (`UNIQUE constraint failed:
 * instance_conversations.next_event_id`: Caw had gone on in a fresh
 * conversation before, and the fold copied that conversation's row, which
 * names the line after it, while Caw's own row of it still stood). Nothing
 * was undone: two Caws ran, the delegates' reports going to the new one and
 * the project's conversation to the old.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), each continuation asked as a session's `continue_session`
 * asks it, from its asks (no filing turn, no summary):
 *
 * (a) A session with a running delegate is continued, and its fold made to
 *     fail (a trigger refuses the source's former-id row). Exactly one
 *     session holds the work: the source runs on and its delegate is still
 *     its own, the new session is removed, and the job failed in the
 *     trigger's words.
 * (b) A session is continued, and the session it went on as is continued
 *     again: both jobs end started, the second fold holding both earlier
 *     conversations, and of the three sessions only the last runs.
 *
 *   bun scripts/probe-kit/run.ts continuation-one-session
 */

import { dataOf } from "../../../packages/agent/src/hub-client";
import { readWithin } from "../../../packages/core/src/bounded";
import type { InstanceStatus } from "../../../packages/core/src/protocol";
import { MODEL, until } from "../../scratch-fleet";
import { hubAt } from "../hub";
import type { Kit, KitFleet, Spec } from "../spec";

/** The words the trigger refuses the fold in. */
const REFUSED = "probe: the fold fails";

/** A session on the fleet's machine that has taken one turn. */
const turnTaken = async (fleet: KitFleet, title: string): Promise<string> => {
  const id = await fleet.spawn("claude", title, fleet.sandbox);
  const asked = await fleet.send(id, "Say ok.");
  await until(
    `${title}'s turn read and ended`,
    () => ({ send: fleet.sendRow(asked), row: fleet.instance(id) }),
    ({ send, row }) => send?.state === "read" && !row?.turn_open_at,
    180_000
  );
  return id;
};

/** `source` continued from its asks, as its own `continue_session` asks it: one session. */
const continueFromAsks = (fleet: KitFleet, source: string) =>
  readWithin(30_000, async (signal) => {
    const response = await hubAt(fleet.base, { signal })
      .api.instances({ id: source })
      .continue.post({
        asksOnly: true,
        askedBy: source,
        target: {
          harness: "claude",
          model: MODEL.claude,
          permissionMode: "bypassPermissions",
        },
      });
    const body = dataOf(response);
    return { status: response.status, body };
  });

/** A job's record once it settles, or why none came. */
const settled = (fleet: KitFleet, id: string) =>
  until(
    `continuation ${id}'s end`,
    async () =>
      (await fleet.api((hub) => hub.api.continuations.get())).find(
        (one) => one.id === id
      ),
    (one) => one !== undefined && ["started", "failed"].includes(one.stage),
    180_000
  ).catch((error: Error) => ({
    stage: `none: ${error.message}`,
    error: null,
  }));

/** A session's row as the hub's database holds it, or none. */
const stored = (fleet: KitFleet, id: string) =>
  fleet.query<{
    end_intent: string | null;
    parent_instance_id: string | null;
    status: string;
  }>(
    "SELECT status, end_intent, parent_instance_id FROM instances WHERE id = ?",
    id
  )[0];

/** The statuses of a session ended or ending. */
const ENDED = [
  "stopping",
  "stopped",
  "discarded",
  "error",
] as const satisfies readonly InstanceStatus[];

/** Whether a session runs on: recorded, not ended and not ending. */
const runsOn = (fleet: KitFleet, id: string): boolean => {
  const one = stored(fleet, id);
  return (
    !!one &&
    one.end_intent === null &&
    !(ENDED as readonly string[]).includes(one.status)
  );
};

/** One continuation asked and settled: its job and new session's ids, and how it ended. */
const continued = async (fleet: KitFleet, source: string) => {
  const asked = await continueFromAsks(fleet, source);
  const job = asked.kind === "answered" ? asked.value.body : undefined;
  const ended = job?.continuationId
    ? await settled(fleet, job.continuationId)
    : { stage: `not started: ${JSON.stringify(asked)}`, error: null };
  return { target: job?.targetInstanceId, ended };
};

const spec: Spec = {
  group: "The hub and machines",
  name: "continuation-one-session",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    await fleet.up();

    // (a) The fold fails: nothing of the continuation stands.
    const source = await turnTaken(fleet, "one-session source");
    const delegate = await turnTaken(fleet, "one-session delegate");
    fleet.write(
      "UPDATE instances SET parent_instance_id = ? WHERE id = ?",
      source,
      delegate
    );
    fleet.write(
      `CREATE TRIGGER probe_fold_fails BEFORE INSERT ON instance_aliases WHEN NEW.id = '${source}' BEGIN SELECT RAISE(ABORT, '${REFUSED}'); END`
    );
    const failed = await continued(fleet, source);
    // The removed session's end is owed to its machine: give it a moment.
    await until(
      "the new session ended or ending",
      () => (failed.target ? stored(fleet, failed.target) : undefined),
      (one) => one === undefined || one.end_intent === "delete",
      30_000
    ).catch(() => undefined);
    const delegateNow = stored(fleet, delegate);
    const targetNow = failed.target ? stored(fleet, failed.target) : undefined;
    check(
      "a: a continuation whose fold fails leaves exactly one session holding the work: the source runs on, its delegate still its own, the new session removed, and the job failed in the fold's words",
      failed.ended.stage === "failed" &&
        (failed.ended.error ?? "").includes(REFUSED) &&
        runsOn(fleet, source) &&
        delegateNow?.parent_instance_id === source &&
        !!failed.target &&
        !runsOn(fleet, failed.target),
      `job ${JSON.stringify(failed)}; source ${JSON.stringify(stored(fleet, source))}; delegate ${JSON.stringify(delegateNow)}; target ${JSON.stringify(targetNow)}`
    );
    fleet.write("DROP TRIGGER probe_fold_fails");

    // (b) Continued twice: the second fold carries the first's conversation.
    const first = await turnTaken(fleet, "twice-continued source");
    const once = await continued(fleet, first);
    const twice = once.target
      ? await continued(fleet, once.target)
      : { target: undefined, ended: { stage: "never asked", error: null } };
    const held = twice.target
      ? fleet.query<{ ord: number; next_event_id: string | null }>(
          "SELECT ord, next_event_id FROM instance_conversations WHERE instance_id = ? ORDER BY ord",
          twice.target
        )
      : [];
    const sessions = [first, once.target, twice.target].filter(
      (id): id is string => !!id
    );
    check(
      "b: a session continued, then continued again as the session it went on as, is folded both times: both jobs started, the last session holds both earlier conversations, and of the three only it runs",
      once.ended.stage === "started" &&
        twice.ended.stage === "started" &&
        held.length === 2 &&
        sessions.length === 3 &&
        sessions.filter((id) => runsOn(fleet, id)).length === 1 &&
        !!twice.target &&
        runsOn(fleet, twice.target),
      `first ${JSON.stringify(once)}; second ${JSON.stringify(twice)}; conversations ${JSON.stringify(held)}; rows ${JSON.stringify(sessions.map((id) => stored(fleet, id) ?? null))}`
    );
  },
};

export default spec;
