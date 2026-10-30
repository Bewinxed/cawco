/**
 * THE CUT-CALL RULE. A CawCo call its harness cancels before it takes the
 * answer leaves nothing running that the call started.
 *
 * The owner's Stop cuts a running call. Claude Code then aborts the MCP
 * request: Claude Code 2.1.311 calls `callTool({name,arguments,_meta},…,
 * {signal:h,…})`, and the MCP SDK's `Protocol.request` answers that
 * signal's abort with `method: 'notifications/cancelled', params:
 * {requestId: messageId, reason}` on its transport (protocol.js, 1.32.0), a
 * POST of its own on Streamable HTTP. It writes "The user doesn't want to proceed with this tool use. The tool
 * use was rejected …" as the call's answer. MCP asks the receiver to act on
 * it: "Receivers of a cancellation notification SHOULD: Stop processing the
 * cancelled request; Free associated resources"
 * (modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation).
 * The hub's endpoint is stateless, one server per POST (delegation-mcp.ts
 * `open`), so the notification reached a server that held no such request
 * and was dropped. Twice on 2026-10-30 the owner stopped an orchestrator's
 * `delegate` while it ran, the model read "rejected", and the delegate the
 * call was starting ran on: one landed a commit.
 *
 * So the hub keeps each running call by its caller and JSON-RPC id, and a
 * cancel naming it cuts it. What a call started (a session, a queued start)
 * is stopped once it is cut ({@link whenCut}), whichever comes first. A
 * cancel may cross the answer on the wire ("The notification may arrive
 * after processing is already completed", the same page); the harness drops
 * that answer, so a cancel within {@link LATE_CANCEL_MS} of it still cuts.
 */

/** How long after its answer a call can still be cut: the answer and the cancel crossing. */
const LATE_CANCEL_MS = 30_000;

/** One running call: its cut, and the moment it answered. */
export interface CallCut {
  /** The call answered: a cancel still cuts it for {@link LATE_CANCEL_MS}. */
  answered: () => void;
  /** Aborts when the call's harness cancels it. */
  readonly signal: AbortSignal;
}

/** What a call started, for the hub to stop if the call is cut. */
export type Started =
  | { kind: "session"; instanceId: string }
  | { kind: "queued-delegate"; queued: string }
  | { kind: "queued-task"; projectId: string; taskId: string };

/** The running calls, by caller (the session a connection is bound to) and JSON-RPC id. */
export const createCallCuts = (
  later: (run: () => void, ms: number) => void = (run, ms) => {
    setTimeout(run, ms).unref?.();
  }
) => {
  const calls = new Map<string, AbortController>();
  const keyOf = (caller: string, id: string | number): string =>
    `${caller}\n${typeof id}:${id}`;
  return {
    begin(caller: string, id: string | number): CallCut {
      const key = keyOf(caller, id);
      const controller = new AbortController();
      calls.set(key, controller);
      return {
        signal: controller.signal,
        answered: () =>
          later(() => {
            if (calls.get(key) === controller) {
              calls.delete(key);
            }
          }, LATE_CANCEL_MS),
      };
    },
    /** A cancel naming `id` from `caller`: whether it cut a call. */
    cancel(caller: string, id: string | number, reason?: string): boolean {
      const key = keyOf(caller, id);
      const controller = calls.get(key);
      if (!controller) {
        return false;
      }
      calls.delete(key);
      controller.abort(reason);
      return true;
    },
    /** How many calls can still be cut. */
    get size(): number {
      return calls.size;
    },
  };
};

/** Runs `undo` once if `signal` is cut: now, when it was already, or when it is. */
export const whenCut = (
  signal: AbortSignal | undefined,
  undo: () => void
): void => {
  if (!signal) {
    return;
  }
  if (signal.aborted) {
    undo();
    return;
  }
  signal.addEventListener("abort", undo, { once: true });
};
