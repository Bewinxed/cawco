/**
 * A send its session read is read, however long the turn that read it ran
 * on: the hub's settle read (server.ts `settleWindows`) reaches back past
 * the oldest send it decides, never just the transcript's newest 50
 * entries.
 *
 * The case is r363's transcript (2026-10-19, session 8ba2cd95): a hand-off
 * the CLI absorbed mid-turn at 05:30, the turn running 83 entries on before
 * its usage limit stopped it. The settle read of the newest 50 entries did
 * not see it, owed it again, and an hour later the session read it twice.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model): a send's turn calls Bash {@link CALLS} times, so more than 50
 * entries stand after the send. Its record is put back as a hub that never
 * heard the read keeps it, pending, neither owed nor held, and the session's
 * process is killed: the hub settles the send against the transcript.
 * Asserted:
 *
 *   - the transcript holds more than 50 entries after the send;
 *   - the hub reads it read, and never owes it again;
 *   - the model is asked nothing more.
 *
 *   bun scripts/probe-kit/run.ts settle-far-back
 */
import { delay, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** The Bash calls the send's turn makes: two entries each, a call and its result. */
const CALLS = 40;
/** What marks the send's words. */
const MARKER = "settle-far-back";

let calls = 0;

/** The title, then the send's turn: {@link CALLS} Bash calls and a word. */
const respond = (request: Seen) => {
  if (!(request.tools && request.all.includes(MARKER))) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  if (calls < CALLS) {
    calls += 1;
    return {
      everyMs: 1,
      words: [],
      tool: {
        name: "Bash",
        input: { command: `echo step ${calls}`, description: `step ${calls}` },
      },
    };
  }
  return { everyMs: 5, words: ["Done."] };
};

const spec: Spec = {
  name: "settle-far-back",
  async run({ check, fleet: makeFleet }: Kit) {
    const fleet = await makeFleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const instanceId = await fleet.spawn("claude", "Settle far back");
    const uuid = await fleet.send(
      instanceId,
      `${MARKER} ${crypto.randomUUID()}: run the steps`
    );
    await until(
      "the send read",
      () => fleet.sendRow(uuid),
      (sent) => sent?.state === "read",
      120_000
    );
    await until(
      "its turn over",
      () => fleet.instance(instanceId),
      (instance) => instance?.turn_open_at === null,
      300_000
    );
    const [row] = fleet.query<{ session_id: string }>(
      "SELECT session_id FROM instances WHERE id = ?",
      instanceId
    );
    const answer = await fleet.controlAnswer(
      "getSessionMessages",
      [row?.session_id, { dir: fleet.workdir, whole: true }],
      60_000,
      undefined,
      "claude"
    );
    const entries = (answer.result ?? []) as { uuid: string }[];
    const after =
      entries.length - 1 - entries.findIndex((e) => e.uuid === uuid);
    check(
      `the transcript holds more than 50 entries after the send (${after} of ${entries.length})`,
      after > 50,
      `calls made ${calls}`
    );
    const asked = fleet.seen.length;

    // A hub that never heard the read (r363: the CLI absorbed the send
    // mid-turn and said nothing of it the hub kept): the record pending,
    // neither owed nor held. Then the process ends under it, as a usage
    // limit ended r363's, and the hub settles the send against what the
    // transcript stored.
    fleet.write(
      "UPDATE sent_messages SET state = 'pending', held = 0, owed = NULL WHERE uuid = ?",
      uuid
    );
    // A send owed again is handed again: a new delivery under a new time.
    const handedOf = () =>
      JSON.stringify(
        fleet.query<{ accepted_at: number; delivery: string | null }>(
          "SELECT accepted_at, delivery FROM sent_messages WHERE uuid = ?",
          uuid
        )[0] ?? null
      );
    const handed = handedOf();
    const pid = await fleet.sessionPid(instanceId);
    check("the session's process is found", pid !== undefined);
    if (pid !== undefined) {
      await fleet.killTree(pid, "SIGKILL");
    }

    const settled = await until(
      "the send settled",
      () => fleet.sendRow(uuid),
      (sent) => sent?.state === "read",
      120_000
    ).catch(() => fleet.sendRow(uuid));
    await delay(8000);
    const handedNow = handedOf();
    check(
      "settled against its transcript, the send reads read and is never handed again",
      settled?.state === "read" && handedNow === handed,
      `record: ${JSON.stringify(settled)}; hand-off ${handed} then ${handedNow}`
    );
    check(
      "the model is asked nothing more",
      fleet.seen.length === asked,
      `requests since: ${fleet.seen.length - asked}`
    );
  },
};

export default spec;
