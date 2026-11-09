import type { SessionPulse } from "@cawco/core/protocol";
import type { NeutralMessage } from "@cawco/core/session-messages";
import { getToolGlance } from "@cawco/core/transcript-rules";
import type { Harness, HarnessSession } from "./harness";
import type { FrameSink } from "./session";

/** What the live sessions read of the supervisor around them, and where their pulses go. */
export interface LiveHost {
  /** Whether a reattach has claimed the session's child and is deciding or attaching it. */
  adopting: (instanceId: string) => boolean;
  /** Whether the hub's keep-alive is pinging the session now: its pings are no pulse. */
  keptAlive: (instanceId: string) => boolean;
  /** A frame to the hub. */
  sink: FrameSink;
}

/** At most one pulse per instance per this long, unless busy/blocked moves. */
const PULSE_THROTTLE_MS = 1000;

export class LiveSessions {
  readonly #host: LiveHost;

  constructor(host: LiveHost) {
    this.#host = host;
  }

  readonly sessions = new Map<string, HarnessSession>();
  /**
   * When each carried session was last seen doing, or holding, anything: the
   * moment its rest is counted from (session.ts `IDLE_SLEEP_MS`). Moved by every
   * turn starting or ending, every ask parked or settled and every send, and
   * by each sweep that finds the session not at rest.
   */
  readonly activeAt = new Map<string, number>();
  /**
   * Sessions this daemon is stopping itself (a sleep, a stop, a relaunch, a
   * move's carry): their process closing, on whatever signal or exit, is
   * that stop's to say, never a failure and never a process going away on
   * its own.
   */
  readonly ending = new WeakSet<HarnessSession>();
  /** The sessions with a turn in flight — from the `send` that starts one until the turn ends. */
  readonly busy = new Set<string>();
  /**
   * Per-instance pulse, folded from the frames already passing through (Part 2
   * of per-instance subscription). Only the parts a rail needs without frames:
   * the tool in flight, the parked-permission count, and the running-subagent
   * task ids. `busy` reuses {@link busy}; the pulse is rebuilt on emit.
   */
  readonly pulseTool = new Map<
    string,
    { name: string; glance: string; toolId: string }
  >();
  readonly pulseBlocked = new Map<string, number>();
  readonly pulseSubagents = new Map<string, Set<string>>();
  /** Last emit per instance — the 1/sec throttle — and its trailing-edge timer. */
  readonly pulseAt = new Map<string, number>();
  readonly pulseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The pulse as it stands, computed from the parts rather than stored. */
  #buildPulse(instanceId: string): SessionPulse {
    const blocked = (this.pulseBlocked.get(instanceId) ?? 0) > 0;
    const busy = this.busy.has(instanceId);
    const running = this.pulseSubagents.get(instanceId)?.size ?? 0;
    const activity = ((): SessionPulse["activity"] => {
      if (blocked) {
        return "blocked";
      }
      return busy || running > 0 ? "working" : "idle";
    })();
    return {
      instanceId,
      busy,
      activity,
      currentTool: this.pulseTool.get(instanceId) ?? null,
      runningSubagents: running,
      at: Date.now(),
    };
  }
  /**
   * Whether this daemon speaks for an instance: it carries the session, or a
   * reattach has claimed the child and is deciding or attaching it — a turn
   * that child is running is this daemon's to report from the decision on.
   */
  #speaksFor(instanceId: string): boolean {
    return this.sessions.has(instanceId) || this.#host.adopting(instanceId);
  }
  /**
   * Pushes the current pulse, throttled to {@link PULSE_THROTTLE_MS} per
   * instance. A busy/blocked transition always goes immediately; everything
   * else waits for the trailing edge of the window.
   */
  emitPulse(instanceId: string, important: boolean): void {
    if (!this.#speaksFor(instanceId) || this.#host.keptAlive(instanceId)) {
      return;
    }
    const now = Date.now();
    const last = this.pulseAt.get(instanceId) ?? 0;
    const sendNow = () => {
      const timer = this.pulseTimers.get(instanceId);
      if (timer) {
        clearTimeout(timer);
      }
      this.pulseTimers.delete(instanceId);
      this.pulseAt.set(instanceId, Date.now());
      this.#host.sink({
        kind: "pulse",
        instanceId,
        pulse: this.#buildPulse(instanceId),
      });
    };
    if (important || now - last >= PULSE_THROTTLE_MS) {
      sendNow();
    } else if (!this.pulseTimers.has(instanceId)) {
      this.pulseTimers.set(
        instanceId,
        setTimeout(
          () => {
            this.pulseTimers.delete(instanceId);
            if (!this.#speaksFor(instanceId)) {
              return;
            }
            this.pulseAt.set(instanceId, Date.now());
            this.#host.sink({
              kind: "pulse",
              instanceId,
              pulse: this.#buildPulse(instanceId),
            });
          },
          PULSE_THROTTLE_MS - (now - last)
        )
      );
    }
  }
  /** A carried session did something: its rest is counted from now. */
  touch(instanceId: string): void {
    if (this.sessions.has(instanceId)) {
      this.activeAt.set(instanceId, Date.now());
    }
  }
  /**
   * Folds one neutral frame into the pulse, then emits. Only the main loop's
   * frames move the tool; a subagent's carry `parent_tool_use_id` and belong to
   * the subagent count, not the rail's tool line.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: folds every neutral frame shape (assistant tool_use, user tool_result, …) into the pulse in one pass
  foldPulse(
    instanceId: string,
    adapter: Harness,
    message: NeutralMessage
  ): void {
    const main = !(
      "parent_tool_use_id" in message && message.parent_tool_use_id
    );
    if (message.type === "assistant" && main) {
      for (const block of message.message.content) {
        if (block.type !== "tool_use") {
          continue;
        }
        this.pulseTool.set(instanceId, {
          name: block.name,
          glance: getToolGlance(block.input as Record<string, unknown>),
          toolId: block.id,
        });
        this.emitPulse(instanceId, false);
        return;
      }
      return;
    }
    if (message.type === "user" && main) {
      const { content } = message.message;
      if (!Array.isArray(content)) {
        return;
      }
      for (const block of content) {
        if (block.type !== "tool_result") {
          continue;
        }
        this.pulseTool.delete(instanceId);
        this.emitPulse(instanceId, false);
        return;
      }
      return;
    }
    if (message.type === "result") {
      this.pulseTool.delete(instanceId);
      this.emitPulse(instanceId, false);
      return;
    }
    const change = adapter.subagentChange(message);
    if (!change) {
      return;
    }
    const running = this.pulseSubagents.get(instanceId);
    if (change.kind === "started") {
      if (running) {
        running.add(change.taskId);
      } else {
        this.pulseSubagents.set(instanceId, new Set([change.taskId]));
      }
      this.emitPulse(instanceId, false);
    } else if (running?.has(change.taskId)) {
      running.delete(change.taskId);
      this.emitPulse(instanceId, false);
    }
  }
}
