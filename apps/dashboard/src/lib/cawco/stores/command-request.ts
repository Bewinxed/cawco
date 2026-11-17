/**
 * A command the page submits (commands.svelte.ts `submitCommand`), its kind
 * and the intent that kind takes: apart from the store, so the socket's
 * bench (hub/socket.svelte.ts `BenchHub`), which the store reads, can name
 * one.
 */
import type { EffortLevel } from "@cawco/core/harness/kinds";
import type { PermissionMode } from "@cawco/core/harness/modes";
import type { PermissionResult } from "@cawco/core/session-messages";
import type { CommandKind } from "@cawco/core/stream";
import type { SendExtras } from "../send-store";

/** What each command kind carries, in the shape the caller already has to hand. */
interface CommandIntents {
  interrupt: Record<string, never>;
  "permission.answer": { requestId: string; result: PermissionResult };
  /** `replaces`: the failed send this one retries, which the hub then retires. */
  send: { text: string; extras?: SendExtras; replaces?: string };
  /**
   * Takes back a queued or failed send. `replace`: the words that go in its
   * place once it is withdrawn (a queued message's edit), under
   * `replacementId`, known before it goes so the words can fly into its row;
   * none, the message is removed (Remove from queue, a failed send's Remove).
   */
  "send.withdraw": {
    sendId: string;
    replace?: {
      extras: SendExtras;
      replacement: string;
      replacementId: string;
    };
  };
  "set-effort": { effort: EffortLevel };
  "set-model": { model: string };
  "set-permission-mode": { mode: PermissionMode };
}

/** One command to submit: its kind, and the intent that kind takes. */
export type CommandRequest = {
  [K in CommandKind]: { kind: K; intent: CommandIntents[K] };
}[CommandKind];
