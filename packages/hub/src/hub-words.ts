/**
 * THE HUB'S WORDS BY WHAT THEY ARE (decided by the owner 2026-11-23,
 * cockpit#8eabb628, the cold-wakes page): the hub starts a turn in a
 * session that is not warm only to let it finish work someone set going in
 * that session. What a session only needs to know waits as a quiet note
 * (`shouldQuery: false`) for its next turn. A cold first request costs 12
 * to 20 times a warm one (keep-alive.ts `keepAliveCap`), paid once per
 * resume whoever starts it: it is wasted only on a turn that does nothing.
 *
 * Every send names its origin, and this table alone says what an origin's
 * words are ({@link hubWordOf}). The one decision reads it (decide.ts, a
 * `hub-turn`, through server.ts `hubTurn`) for each word the hub would start
 * a turn with, a session's process up or not; and the gate on a session at
 * rest reads it (server.ts `startsTurnIn`). The gate is the cache, never
 * the process: a session asleep within its cache's life is warm, and one
 * up for hours on the person's answer is cold (keep-alive.ts `cacheState`).
 *
 * - **finish**: the far end of something a person, the session's parent or
 *   the session itself set going in it. Runs, cold or not, and wakes it at
 *   rest: the re-read is paid once whenever that work resumes.
 * - **know**: tells of something already done. A quiet note unless its cache
 *   is warm (unknown counts cold) and the person has not stopped it since
 *   they last wrote to it (db `personStopped`); some are a note always, and
 *   some run while the session waits on the work they tell of
 *   ({@link KnowRuns}).
 * - **person**: the person's own act (core `byPerson`). Runs, and wakes even
 *   a stopped session.
 * - **warm**: sent within seconds of the session's own frame, so warm by
 *   construction: runs, and waits for the next wake if no process takes it.
 *
 * New work on a project's thing is no word to a standing session: the
 * trigger router (triggers.ts) gives it to the thing's own session, whose
 * word is a finish, or starts a fresh one.
 */
import { byPerson } from "@cawco/core/harness";
import {
  COMPACTION_ORIGIN,
  CONTINUATION_ORIGIN,
  DELEGATE_WAIT_ORIGIN,
  WORK_ITEM_ORIGIN,
} from "@cawco/core/harness/kinds";
import type { NeutralOrigin } from "@cawco/core/session-messages";
import { PAUSE_ORIGIN } from "./machine-pause";
import { LIMIT_ORIGIN } from "./session-word";
import { PROJECT_ORIGIN } from "./trigger-event";

/**
 * When a `know` word runs rather than waiting as a note: `warm`, while its
 * session's cache is; `own-work`, that or while the session waits on its
 * own work (its last turn ended waiting on work of its own, db
 * `wakesItself`, or it holds a live work item), which the word may be the
 * end of; `never`, a note always.
 */
export type KnowRuns = "never" | "own-work" | "warm";

/** One origin's words, as the table says them. */
export type HubWord =
  | { kind: "finish" }
  | { kind: "know"; runs: KnowRuns }
  | { kind: "person" }
  | { kind: "warm" };

/** The hub's word that a session's process left processes running or climbing in memory (session-notes.ts `tellLeak`). */
export const LEAK_ORIGIN = "leak";
/** The hub's word that a session's containers stopped as it ended, or will not stop with it (session-notes.ts `tellContainers`). */
export const CONTAINERS_ORIGIN = "containers";
/** The hub's hand-back of the turn a restart or a kill cut (cut-turns.ts `handTurnBack`). */
export const RESTORE_ORIGIN = "restore";
/** The hub's word of the background tasks a restart or a kill cut (cut-turns.ts `tellCutTasks`). */
export const TASKS_CUT_ORIGIN = "tasks-cut";
/** The hub's word of what a move to another account ended with the old process (account-carry.ts `tellEndedByMove`). */
export const MOVE_ENDED_ORIGIN = "move-ended";
/** The hub's word that a delegate handed its artifact up, not opened (artifact-events.ts `handArtifactUp`). */
export const ARTIFACT_HANDED_ORIGIN = "artifact-handed";
/** Fleet watch's word to the steward of a delegate it judged (fleet-watch.ts `nudge`), and its triage run's brief. */
export const FLEET_WATCH_ORIGIN = "fleet-watch";
/** The hub's word to a live attempt that a wait of its task moved (server.ts, tasks.ts `tell`). */
export const TASK_WAITS_ORIGIN = "task-waits";
/** The hub's word to a sender that its message did not arrive (sends.ts). */
export const UNDELIVERED_ORIGIN = "undelivered";
/** A fork's note to the session it forked (sends.ts `forkNotice`). */
export const FORK_ORIGIN = "fork";
/** The hub's word of where a session's folder moved (server.ts, folder-moves.ts). */
export const FOLDER_MOVE_ORIGIN = "folder-move";
/** The hub's word on a browser's take-over (browsers.ts). */
export const BROWSER_ORIGIN = "browser";
/** A keep-alive ping (keep-alive.ts `isKeepAlive`): no turn of the session's own. */
const KEEPALIVE_ORIGIN = "keepalive";
/** A routine's run or report, `routine:<id>`, to the session the router gives it (triggers.ts). */
export const ROUTINE_ORIGIN = "routine:";
/** A rule's reply, `rule:<name>` (rules.ts). */
const RULE_ORIGIN = "rule:";

const FINISH: HubWord = { kind: "finish" };
const PERSON: HubWord = { kind: "person" };
const WARM: HubWord = { kind: "warm" };
const NOTE: HubWord = { kind: "know", runs: "never" };
const KNOW: HubWord = { kind: "know", runs: "warm" };
const OWN_WORK: HubWord = { kind: "know", runs: "own-work" };

/**
 * THE TABLE: each `system` origin the hub sends under, by name. The
 * person's acts (core `byPerson`: `artifact`, `ask`, `plan`, `act`) are
 * read before it ({@link hubWordOf}).
 */
const HUB_WORDS: Readonly<Record<string, HubWord>> = {
  // The turn its account's limit or refused sign-in cut, carried on at the
  // reset; its refused first turn answered on the hub's next model.
  [LIMIT_ORIGIN]: FINISH,
  // The turn a restart or a kill cut, handed back once.
  [RESTORE_ORIGIN]: FINISH,
  // The turn its machine's pause cut, carried on as the pause ends.
  [PAUSE_ORIGIN]: FINISH,
  // Its open work item: the sweep's "still open", a declared wait's end, a
  // landing or a queued delegate that could not go, a design check's verdict.
  [WORK_ITEM_ORIGIN]: FINISH,
  // A trigger on its own project's thing, as the router gives it to the
  // thing's own session, even idle past its cache (triggers.ts).
  [PROJECT_ORIGIN]: FINISH,
  // A wait of its own task moved, to its live attempt.
  [TASK_WAITS_ORIGIN]: FINISH,
  // Its looping delegate, to it as that delegate's steward: the delegate is
  // its live work, spending now (the owner's pick: wake the session that
  // started it); and the triage run's brief, to the session just started.
  [FLEET_WATCH_ORIGIN]: FINISH,
  // A process it started left running or climbing in memory: the session
  // that started it is told, cold or not (the owner's pick: the session
  // itself), so it judges whether that is normal.
  [LEAK_ORIGIN]: FINISH,
  // The opening of the session a Continue goes on in.
  [CONTINUATION_ORIGIN]: FINISH,
  // A person's Continue's filing turn (continuations.ts `filesFirst`, warm
  // sources only), and the steps of a compaction a move at its limit runs:
  // either may wake a session that was stopped.
  [COMPACTION_ORIGIN]: PERSON,
  // Its delegate waits on the person, or that wait ended: the person holds
  // the ask in Needs you, and the report carries the rest.
  [DELEGATE_WAIT_ORIGIN]: NOTE,
  // Containers it or its delegate started were stopped, or won't stop with it.
  [CONTAINERS_ORIGIN]: NOTE,
  // Notes of what is already so: a fork, a folder's move, a browser's
  // take-over, a message that did not arrive.
  [FORK_ORIGIN]: NOTE,
  [FOLDER_MOVE_ORIGIN]: NOTE,
  [BROWSER_ORIGIN]: NOTE,
  [UNDELIVERED_ORIGIN]: NOTE,
  // A delegate handed it an artifact, not opened.
  [ARTIFACT_HANDED_ORIGIN]: KNOW,
  // Background work its old process ran ended with a move or a restart: it
  // runs when the session was waiting on that work, and rides in the turn a
  // carry-on or a cut turn's hand-back starts.
  [MOVE_ENDED_ORIGIN]: OWN_WORK,
  [TASKS_CUT_ORIGIN]: OWN_WORK,
  [KEEPALIVE_ORIGIN]: WARM,
};

/** Origins named by a prefix and what follows it, by that prefix. */
const PREFIXED: readonly (readonly [string, HubWord])[] = [
  // A routine's run or report, to the session the router gives it.
  [ROUTINE_ORIGIN, FINISH],
  // A rule's reply, on the frame that tripped it.
  [RULE_ORIGIN, WARM],
];

/**
 * What a send's words are, by its origin ({@link HubWord}): the person's
 * own act; another session's word (a delegate's report or question, a
 * hand-off), which finishes what was set going; else the hub's, by the
 * table. A hub origin the table does not name is a note while its session
 * is cold: nothing unnamed starts a cold turn.
 */
export const hubWordOf = (origin: NeutralOrigin): HubWord => {
  if (byPerson(origin)) {
    return PERSON;
  }
  if (origin.kind !== "system") {
    return FINISH;
  }
  const name = origin.name ?? "";
  return (
    HUB_WORDS[name] ??
    PREFIXED.find(([prefix]) => name.startsWith(prefix))?.[1] ??
    KNOW
  );
};
