/**
 * A continuation whose machine is connected but holds its starts (paused by
 * its owner, installing an update, or on a build older than its hub's:
 * start-holds.ts `startHold`) waits for that hold to end, and the hub answers
 * everything meanwhile (continuations.ts `advanceContinuation`, `StartsHeld`).
 *
 * 2026-11-04 23:16:55, obelisk's hub: "Check RadarBot services for failures"
 * went on from a summary as its move, its source on niftybot.art, which had
 * registered again three seconds before on a build older than the hub's.
 * The summariser's start threw the machine-away error though the machine was
 * connected, and the job, seeing its machine connected, advanced again at
 * once: a loop of microtasks that never let a timer or a socket run. The hub
 * logged nothing for 18 minutes at 100% CPU until it was killed.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model): a session takes one turn, its machine is paused, and the
 * session is continued from its asks as another session's `continue_session`
 * asks it (no filing turn, no summary: the job's first step starts the new
 * session, which the pause holds).
 *
 * (a) The continue is answered, and the hub answers `/health` within 2 s
 *     at every look for the next 10 s.
 * (b) The job is not failed: it stands at `starting`, and the hub's log says
 *     it waits for the pause, once.
 * (c) The pause ended, the job goes on by itself: its new session starts and
 *     the job ends `started`.
 *
 * 2026-11-04 23:38:10, the same hub restarted: Caw was compacting ahead of
 * a move when the continuation its earlier move had asked folded it into
 * its new session. The fold ended the compaction as a person's stop does,
 * which moves the session whole at once, and that move then wrote to the
 * row the fold had just deleted: `[move after compaction] failed:
 * SQLiteError: FOREIGN KEY constraint failed`.
 *
 * (d) A second session with a compaction ahead of a move on it (its plan as
 *     at-limit's `startCompaction` puts one) is continued the same way, its
 *     machine free: the job starts, the source's compaction is gone, the
 *     hub says it ended unfinished for the continuation, and nothing moves
 *     the folded source ("It moves to … now") nor fails after the fold.
 *
 *   bun scripts/probe-kit/run.ts continuation-held-start
 */

import { dataOf } from "../../../packages/agent/src/hub-client";
import { readWithin } from "../../../packages/core/src/bounded";
import { ACCOUNT, delay, MACHINE, MODEL, until } from "../../scratch-fleet";
import { answerText, hubAt } from "../hub";
import type { Kit, KitFleet, Spec } from "../spec";

/** How long the pause is asked for: past every read below, ended by hand. */
const PAUSE_MS = 10 * 60_000;
/** How long the hub is watched while the job waits on the pause. */
const WATCH_MS = 10_000;
/** The longest `/health` may take at any look meanwhile. */
const HEALTH_MS = 2000;
/** The hub's line for a job that waits on its machine's held starts (server.ts `heldContinuation`). */
const WAITS = "waits until it ends; it goes on by itself then";

/** The hub's line for a compaction a fold ended (server.ts `forgetCompaction`). */
const FOLDED = "ends unfinished, as it goes on as";
/** The hub's line for a compaction ended as a stop, ahead of its move (compaction.ts `endCompaction`). */
const MOVES_NOW = "It moves to";
/** The hub's line for a move after compaction that threw (compaction.ts `endCompaction`'s detach). */
const MOVE_FAILED = "[move after compaction] failed";

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

/** `source` continued from its asks, as another session's `continue_session` asks it: no filing turn, no summary. */
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

/** A job's stage once it settles, or why none came. */
const settled = (fleet: KitFleet, id: string) =>
  until(
    `continuation ${id}'s end`,
    async () =>
      (await fleet.api((hub) => hub.api.continuations.get())).find(
        (one) => one.id === id
      ),
    (one) => one !== undefined && ["started", "failed"].includes(one.stage),
    180_000
  ).catch((error: Error) => ({ stage: `none: ${error.message}` }));

/**
 * A compaction ahead of a move put on `id` at its filing step, as at-limit's
 * `startCompaction` puts one (`compactFirst`: the move waits for it).
 */
const compactingAheadOfMove = (fleet: KitFleet, id: string): void => {
  const move = {
    kind: "moved",
    from: { id: ACCOUNT, name: "Probe", hue: "blue" },
    to: { id: "acct-held-start-b", name: "B", hue: "green" },
    sameOrganization: false,
    tokens: 1000,
    window: null,
    resetsAt: null,
    compact: "filing",
    compactFirst: true,
  };
  fleet.write(
    "INSERT INTO limit_compactions (instance_id, stage, line_id, move, fill, carry_uuid, filing_uuid, compact_uuid, compacted, ended_step, created_at) VALUES (?, 'filing', ?, ?, NULL, NULL, ?, ?, 0, NULL, ?)",
    id,
    `probe-move-${id}`,
    JSON.stringify(move),
    crypto.randomUUID(),
    crypto.randomUUID(),
    Date.now()
  );
};

/** One look at `/health`: its time, or why it did not answer. */
const healthLook = async (
  base: string
): Promise<{ ms: number; ok: boolean }> => {
  const from = performance.now();
  const read = await readWithin(HEALTH_MS, (signal) =>
    hubAt(base, { signal })
      .health.get()
      .then((response) => response.error === null)
  );
  return {
    ms: Math.round(performance.now() - from),
    ok: read.kind === "answered" && read.value,
  };
};

const spec: Spec = {
  group: "The hub and machines",
  name: "continuation-held-start",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    await fleet.up();

    const source = await turnTaken(fleet, "held-start source");

    const paused = await hubAt(fleet.base)
      .api.machines({ machineId: MACHINE })
      .pause.post({
        until: new Date(Date.now() + PAUSE_MS).toISOString(),
      });
    if (paused.status !== 200) {
      throw new Error(
        `the machine could not be paused: ${paused.status} ${answerText(paused)}`
      );
    }

    const mark = await fleet.logMark("hub");
    const continued = await continueFromAsks(fleet, source);
    const looks: { ms: number; ok: boolean }[] = [];
    const watchEnd = Date.now() + WATCH_MS;
    while (Date.now() < watchEnd) {
      looks.push(await healthLook(fleet.base));
      await delay(500);
    }
    const job =
      continued.kind === "answered" ? continued.value.body : undefined;
    check(
      `a: the continue is answered, and the hub answers /health within ${HEALTH_MS} ms at every look for ${WATCH_MS / 1000} s while its machine holds the new session's start`,
      continued.kind === "answered" &&
        continued.value.status === 200 &&
        !!job?.continuationId &&
        looks.length > 0 &&
        looks.every((look) => look.ok),
      `continue ${JSON.stringify(continued)}; looks ${JSON.stringify(looks)}`
    );
    if (!job?.continuationId) {
      return;
    }

    const jobs = await fleet.api((hub) => hub.api.continuations.get());
    const standing = jobs.find((one) => one.id === job.continuationId);
    const said = (await mark.since())
      .split("\n")
      .filter((line) => line.includes(WAITS));
    check(
      "b: the job is not failed: it stands at starting, and the hub's log says once that it waits for the machine's pause",
      standing?.stage === "starting" &&
        said.length === 1 &&
        said[0]?.includes("paused") === true,
      `job ${JSON.stringify(standing)}; lines ${JSON.stringify(said)}`
    );

    await fleet.api((hub) =>
      hub.api.machines({ machineId: MACHINE }).resume.post()
    );
    const ended = await settled(fleet, job.continuationId);
    const target = job.targetInstanceId
      ? fleet.instance(job.targetInstanceId)
      : undefined;
    check(
      "c: the pause ended, the job goes on by itself: it ends started, its new session running",
      ended?.stage === "started" && target?.status === "running",
      `job ${JSON.stringify(ended)}; target ${JSON.stringify(target)}`
    );

    // (d) A compacting source, folded.
    const moving = await turnTaken(fleet, "held-start compacting");
    compactingAheadOfMove(fleet, moving);
    const foldMark = await fleet.logMark("hub");
    const folding = await continueFromAsks(fleet, moving);
    const foldJob =
      folding.kind === "answered" ? folding.value.body : undefined;
    const folded = foldJob?.continuationId
      ? await settled(fleet, foldJob.continuationId)
      : { stage: `not started: ${JSON.stringify(folding)}` };
    await delay(3000);
    const foldLines = (await foldMark.since())
      .split("\n")
      .filter((line) => line.includes(moving.slice(0, 8)));
    const plan = fleet.query<{ stage: string }>(
      "SELECT stage FROM limit_compactions WHERE instance_id = ?",
      moving
    );
    const failed = (await foldMark.since())
      .split("\n")
      .filter((line) => line.includes(MOVE_FAILED));
    check(
      "d: a source compacting ahead of a move, folded into its continuation, is moved by nothing: its compaction is gone, said ended for the continuation, and no move of it starts or fails",
      folded.stage === "started" &&
        plan.length === 0 &&
        foldLines.some((line) => line.includes(FOLDED)) &&
        !foldLines.some((line) => line.includes(MOVES_NOW)) &&
        failed.length === 0,
      `job ${JSON.stringify(folded)}; plan ${JSON.stringify(plan)}; lines ${JSON.stringify(foldLines)}; failed ${JSON.stringify(failed)}`
    );
  },
};

export default spec;
