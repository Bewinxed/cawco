import { readWithin } from "@cawco/core/bounded";
import type {
  CarrySessionOutcome,
  CarrySessionRequest,
  MoveEnded,
} from "@cawco/core/session/controls";
import { CONTROL_CARRY_SESSIONS } from "@cawco/core/session/controls";
import { unhandled } from "@cawco/core/unhandled";
import { carryRefusal, carrySessions } from "../claude-sessions";
import type {
  CarryHost,
  Harness,
  HarnessSession,
  SessionCarry,
} from "../harness";
import { isKeeperHarness } from "../harness";
import { parseProcId } from "../proc-id";
import { warn } from "../session-log";

/**
 * The bounds of a carry's steps ({@link ClaudeCarry.carrySessions}):
 * reading what the keepers hold, ending a process between turns (Claude
 * Code's stdin EOF and the SDK's ~2 s grace, sessiond-client.ts
 * `sessiondBridge`) and what its background tasks run in its workspace
 * (boundary/work.ts `endSessionWork`, at most its 5 s grace and 2 s kill wait),
 * and moving its entries within one disk. Together under the hub's 120 s
 * for the whole carry (hub `CARRY_TIMEOUT_MS`), so the hub always hears the
 * machine's own reason, never "not answering". Ours.
 */
const CARRY_KEEPERS_MS = 15_000;
const CARRY_STOP_MS = 30_000;
const CARRY_COPY_MS = 45_000;

/** A carry step that was not answered: `step` did not end within `ms`, or what it waited on ended first. */
const carryLate = (
  step: string,
  ms: number,
  { reason }: { reason: "timeout" | "dead" }
): string =>
  reason === "timeout"
    ? `${step} did not end within ${ms / 1000} s`
    : `${step} did not end: what it waited on ended before it answered`;

/**
 * Why a carry without `stop` leaves a session's data where it is, in words
 * a line can quote; nothing when nothing of it runs here.
 */
const liveBecause = (of: {
  adopting: boolean;
  held: boolean;
  queued: boolean;
  running: boolean;
}): string | undefined => {
  if (of.running) {
    return "its process is running, and this carry does not stop it";
  }
  if (of.adopting) {
    return "its custody is still being decided";
  }
  if (of.queued) {
    return "something sent to it is still on its way";
  }
  return of.held
    ? "sessiond still holds its process from before the agent restarted"
    : undefined;
};

/** A carry's outcome as its end line says it. */
const carryWords = (outcome: CarrySessionOutcome | undefined): string => {
  switch (outcome?.state) {
    case "carried":
      return `carried, ${outcome.entries} entr${outcome.entries === 1 ? "y" : "ies"} moved${outcome.ended ? `, ending ${outcome.ended.tasks.length} background task(s) and ${outcome.ended.wakeups} one-time wake-up(s)` : ""}`;
    case "live":
      return `left running: ${outcome.why}`;
    case "failed":
      return `not carried: ${outcome.error}`;
    case undefined:
      return "not carried: no outcome was reached";
  }
};

/** The Claude adapter's {@link SessionCarry}, one per supervisor. */
export class ClaudeCarry implements SessionCarry {
  readonly #adapter: Harness;
  readonly #host: CarryHost;

  constructor(adapter: Harness, host: CarryHost) {
    this.#adapter = adapter;
    this.#host = host;
  }

  /**
   * Carries each Claude session's own data into the dir its row is to say
   * ({@link CONTROL_CARRY_SESSIONS}). A session whose process runs is left
   * where it is, `live`, unless the request says `stop` and it is between
   * turns (no turn running, no ask parked, no send unread, and nothing it
   * would lose: a background task, a wake-up its resume does not bring back,
   * unless the request says `endLater`, when what ends is answered as
   * `ended`): then its process ends first, the way a relaunch ends it, and
   * the hub starts it again on the account it moved to. A process sessiond
   * still holds that no session here has taken back is live too.
   *
   * Every step is bounded ({@link CARRY_KEEPERS_MS}, {@link CARRY_STOP_MS},
   * {@link CARRY_COPY_MS}) and logged with its time, so the hub hears the
   * machine's own reason within its wait. A session whose process its keeper
   * reports exited is not live: what this daemon still holds of it is let go
   * and its conversation carried, never a stop asked of a process that is
   * gone. A conversation another carry is moving now is refused, not waited
   * for.
   */
  async carrySessions(
    requests: CarrySessionRequest[]
  ): Promise<Record<string, CarrySessionOutcome>> {
    const began = Date.now();
    const outcomes: Record<string, CarrySessionOutcome> = {};
    const mine = requests.filter((request) => {
      if (this.#carrying.has(request.sessionId)) {
        outcomes[request.instanceId] = {
          state: "failed",
          error: "another move is copying its conversation right now",
          clash: true,
        };
        return false;
      }
      this.#carrying.add(request.sessionId);
      return true;
    });
    if (mine.length > 0) {
      console.info(
        `[carry] started: ${mine.map((one) => `${one.instanceId} → ${one.accountId ?? "the machine's own login"}${one.stop ? " (its process ended between turns)" : ""}`).join("; ")}`
      );
    }
    try {
      await this.#carry(mine, outcomes, began);
    } finally {
      for (const request of mine) {
        this.#carrying.delete(request.sessionId);
      }
    }
    for (const request of requests) {
      const outcome = outcomes[request.instanceId];
      // One already in its dir is no news: an agent's start carries every
      // conversation on the machine, thousands of lines of nothing moved
      // (obelisk, 2026-10-23); the start's count says them.
      if (
        outcome?.state === "carried" &&
        outcome.entries === 0 &&
        !outcome.ended
      ) {
        continue;
      }
      console.info(
        `[carry] ${request.instanceId}: ${carryWords(outcome)}, ${Date.now() - began} ms after it started`
      );
    }
    return outcomes;
  }
  /** The conversations a carry is moving now, by session id ({@link carrySessions}). */
  readonly #carrying = new Set<string>();
  /** {@link carrySessions}' steps for `requests`, each outcome into `outcomes`. */
  async #carry(
    requests: CarrySessionRequest[],
    outcomes: Record<string, CarrySessionOutcome>,
    began: number
  ): Promise<void> {
    if (requests.length === 0) {
      return;
    }
    const held = await carryHeld(this.#adapter);
    const go: CarrySessionRequest[] = [];
    const ended = new Map<string, MoveEnded>();
    for (const request of requests) {
      const left = await this.#carryReady(request, held, ended);
      if (left) {
        outcomes[request.instanceId] = left;
      } else {
        go.push(request);
      }
    }
    if (go.length === 0) {
      return;
    }
    const copyAt = Date.now();
    const copied = await readWithin(CARRY_COPY_MS, () => carrySessions(go));
    let carried: Awaited<ReturnType<typeof carrySessions>>;
    switch (copied.kind) {
      case "answered":
        carried = copied.value;
        break;
      case "unanswered":
        for (const request of go) {
          outcomes[request.instanceId] = {
            state: "failed",
            error: `${carryLate("moving its conversation's files", CARRY_COPY_MS, copied)}; what moved stays in the new dir, and its next start moves the rest`,
          };
        }
        return;
      default:
        unhandled("read", copied);
    }
    console.info(
      `[carry] files of ${go.length} session(s) moved in ${Date.now() - copyAt} ms (${Date.now() - began} ms in)`
    );
    for (const request of go) {
      const result = carried.get(request.sessionId);
      const work = ended.get(request.instanceId);
      outcomes[request.instanceId] =
        result && "error" in result
          ? { state: "failed", error: result.error }
          : {
              state: "carried",
              entries: result?.entries ?? 0,
              ...(work ? { ended: work } : {}),
            };
    }
  }
  /**
   * Whether `request`'s conversation may be moved now: undefined when
   * nothing of its process runs (ended now for a `stop` between turns, or
   * reported exited by its keeper and let go), else why it stays where it is.
   */
  async #carryReady(
    request: CarrySessionRequest,
    held: { alive: Set<string>; exited: Set<string> } | undefined,
    /** What a stop with `endLater` ended, by instance id ({@link #stopForCarry}). */
    ended: Map<string, MoveEnded>
  ): Promise<CarrySessionOutcome | undefined> {
    const { instanceId } = request;
    // Refused before anything is done to it: a carry that cannot happen
    // never ends a session's process.
    const refused = await carryRefusal(request);
    if (refused) {
      return { state: "failed", error: refused };
    }
    const running = this.#host.running(instanceId);
    if (running && held?.exited.has(instanceId)) {
      // Its process is gone and nothing told this daemon: nothing of it can
      // answer a stop, and nothing writes its conversation.
      this.#host.drop(instanceId, { why: "exited", ended: running });
      running
        .dispose()
        .catch((error: unknown) =>
          warn(`letting go of ${instanceId}'s exited process failed: ${error}`)
        );
      console.info(
        `[carry] ${instanceId}: its keeper reports its process exited, so it is let go and carried without a stop`
      );
      return;
    }
    if (running && request.stop) {
      return await this.#stopForCarry(request, running, held, ended);
    }
    if (!held) {
      return {
        state: "failed",
        error: `its keepers didn't say within ${CARRY_KEEPERS_MS / 1000} s whether its process still runs, so its conversation was not copied`,
      };
    }
    const live = liveBecause({
      running: !!running,
      adopting: this.#host.adopting(instanceId),
      queued: this.#host.queued(instanceId),
      held: held.alive.has(instanceId),
    });
    return live ? { state: "live", why: live } : undefined;
  }
  /**
   * Ends `running`'s process for a carry when it is between turns, within
   * {@link CARRY_STOP_MS}. Undefined once it has ended (its conversation may
   * be moved); else why it was left: `live` with what keeps it running, or
   * `failed` when the stop did not end in time and its keeper does not report
   * the process gone. Work it holds for later keeps it `live` (`later`),
   * unless the request says `endLater`: then what that work is goes into
   * `ended` first, and the process ends with it, and so does everything its
   * background tasks run, as a stop of it ends that ({@link #stop},
   * {@link #endWork}): in a workspace a task's command runs inside the
   * boundary, which the CLI's end never reaches, and the session is told on
   * its new account that the move ended it (hub server.ts
   * `endedByMoveWords`).
   */
  async #stopForCarry(
    request: CarrySessionRequest,
    running: HarnessSession,
    held: { alive: Set<string> } | undefined,
    ended: Map<string, MoveEnded>
  ): Promise<CarrySessionOutcome | undefined> {
    const { instanceId } = request;
    const awake = await this.#host.awakeForMove(instanceId, running);
    if (awake && !(awake.later && request.endLater)) {
      return {
        state: "live",
        why: awake.why,
        ...(awake.later ? { later: true as const } : {}),
      };
    }
    let endsTasks = false;
    if (awake && running.endedForMove) {
      const work = await running.endedForMove();
      ended.set(instanceId, work);
      endsTasks = work.tasks.length > 0;
      console.info(
        `[carry] ${instanceId}: the move waited its bound for ${awake.why}; its process ends with ${work.tasks.length} background task(s) and ${work.wakeups} one-time wake-up(s), which the session is told of on the new account`
      );
    }
    if (this.#host.queued(instanceId)) {
      return { state: "live", why: "something sent to it is still on its way" };
    }
    if (held && !held.alive.has(instanceId)) {
      // No keeper lists it: what this daemon holds is not a process under
      // sessiond, and a stop would end nothing it can see.
      console.warn(
        `[carry] ${instanceId}: no keeper lists its process, yet this daemon holds it running; it is stopped as any other`
      );
    }
    // Ended by this daemon for a move: its end is no failure.
    this.#host.drop(instanceId, { why: "carried", ended: running });
    const at = Date.now();
    const stopped = await readWithin(CARRY_STOP_MS, () => running.stop());
    switch (stopped.kind) {
      case "answered":
        console.info(
          `[carry] ${instanceId}: its process ended between turns in ${Date.now() - at} ms`
        );
        if (endsTasks) {
          await this.#host.endWork(instanceId, "moved");
        }
        return;
      case "unanswered":
        console.warn(
          `[carry] ${instanceId}: ${carryLate("ending its Claude Code process", CARRY_STOP_MS, stopped)}`
        );
        break;
      default:
        unhandled("read", stopped);
    }
    // The stop did not finish: the conversation moves only once its keeper
    // reports no live process writing it.
    const after = await carryHeld(this.#adapter);
    if (after && !after.alive.has(instanceId)) {
      console.info(
        `[carry] ${instanceId}: its keeper reports its process gone, so its conversation is carried`
      );
      if (endsTasks) {
        await this.#host.endWork(instanceId, "moved");
      }
      return;
    }
    return {
      state: "failed",
      error: `its Claude Code process didn't end within ${CARRY_STOP_MS / 1000} s of being told to between turns${after ? "" : ", and its keepers didn't say whether it still runs"}, so its conversation was not copied`,
    };
  }
}

/**
 * What the keepers hold of Claude's sessions, by instance id: `alive`, and
 * `exited` (listed by a keeper, none of them alive). Undefined when they
 * did not answer within {@link CARRY_KEEPERS_MS}.
 */
async function carryHeld(
  adapter: Harness
): Promise<{ alive: Set<string>; exited: Set<string> } | undefined> {
  const at = Date.now();
  const read = await readWithin(CARRY_KEEPERS_MS, () =>
    isKeeperHarness(adapter)
      ? adapter.custody.candidates()
      : Promise.resolve({ procs: [] })
  );
  let listing: { procs: { alive: boolean; procId: string }[] };
  switch (read.kind) {
    case "answered":
      listing = read.value;
      break;
    case "unanswered":
      console.warn(
        `[carry] ${carryLate("reading what its keepers hold", CARRY_KEEPERS_MS, read)}`
      );
      return undefined;
    default:
      unhandled("read", read);
  }
  const alive = new Set<string>();
  const listed = new Set<string>();
  for (const proc of listing.procs) {
    const identity = parseProcId(proc.procId);
    if (identity.kind !== adapter.kind) {
      continue;
    }
    listed.add(identity.instanceId);
    if (proc.alive) {
      alive.add(identity.instanceId);
    }
  }
  const exited = new Set([...listed].filter((id) => !alive.has(id)));
  console.info(
    `[carry] its keepers hold ${alive.size} live Claude process(es), ${exited.size} exited, read in ${Date.now() - at} ms`
  );
  return { alive, exited };
}
