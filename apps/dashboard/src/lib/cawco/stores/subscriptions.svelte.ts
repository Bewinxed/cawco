/**
 * What this page follows (follows.svelte.ts), applied on the socket: a
 * session no longer followed has its stream forgotten, and one followed and
 * held is read again, its page subscribing it.
 */

import { detach } from "@cawco/core/detach";
import { untrack } from "svelte";
import { connectionCount, connectionState, hubRun } from "../hub/socket.svelte";
import {
  following,
  followUnread,
  forgetUnwatched,
  resumeHeld,
} from "../stream";
import {
  peek,
  subscriptionIds,
  watchedDelegates,
  watchedIds,
} from "./follows.svelte";
import { streamHost, streamState } from "./ledger.svelte";
import { hydrate, session, sessionsState } from "./sessions.svelte";
import { pageReads, readTranscript } from "./transcript-reads.svelte";
import { loadWorkItems } from "./work-items.svelte";

/** Opens a session's view state — the route's half of arriving at `/session/[id]`. */
export function openSession(instanceId: string): void {
  hydrate(session(instanceId));
  detach(loadWorkItems(instanceId), "loadWorkItems");
  // Opening a view is the moment its frames become this browser's to render.
  // (The subscription effect in the route layout already names its tab; this makes
  // the direct route the only trigger the store needs to know about.)
  syncSubscriptions();
}

/** The last watched set synced, so an unchanged set of tabs stays quiet. */
let lastSubscriptionKey = "";

/**
 * The watched set, applied: every session the dashboard no longer watches
 * has its stream forgotten, and every watched one whose transcript this tab
 * holds and does not follow on this socket is read, the read's page
 * subscribing it ({@link followHeld}). A session a tab, the peek or a
 * delegate card holds nothing of yet is read by what shows it
 * ({@link readTranscript}). A no-op when the set is unchanged since the last
 * sync.
 */
export function syncSubscriptions(): void {
  const ids = subscriptionIds().sort();
  const key = ids.join("\u0000");
  if (key === lastSubscriptionKey) {
    return;
  }
  lastSubscriptionKey = key;
  untrack(() => {
    forgetUnwatched(streamState, streamHost, watchedIds());
    followHeld(ids, "follow");
  });
}

/**
 * A watched transcript this tab holds (its rows, or a read of it that went
 * out, landed or failed) and does not follow on the socket open now, read
 * again: its page subscribes it from the page's own `seq` ({@link adoptPage}).
 * Held rows stand for everything the session said up to the moment its stream
 * was let go (its tab closed or re-addressed, its read landing while it was
 * not watched, the socket gone), and a reader shown them again with no read
 * behind them sees that moment for good. A read that landed holds the
 * transcript though it held no rows: a session just started is empty, and a
 * page's first visit names its tabs again (workspace `restore`), unwatching
 * the pane's tab while its read is out; landing then, the read follows
 * nothing, and with nothing read again the pane shows that empty moment for
 * good, the agent's every word after it never drawn.
 *
 * A stream whose place counts in this socket's hub run resumes from it
 * instead ({@link resumeHeld}): a page that landed before the socket's
 * board (or before its tab was named), or the last event a dropped socket
 * applied, when the socket that replaces it reaches the same hub run. The hub
 * replays what came after out of its ring, or resets, and the reset reads the
 * page again. Only a place in another run (the hub restarted) is read again.
 *
 * `reconnect`: the socket is new, and a read in flight was asked of the
 * connection before: it is ended and read again. A page's first connection
 * had none before it: a read in flight is joined, and one whose read failed
 * is left to the read again that failure scheduled.
 */
function followHeld(ids: string[], cause: "follow" | "reconnect"): void {
  if (connectionState.status !== "connected") {
    return;
  }
  const fresh = cause === "reconnect" && connectionCount() > 1;
  const first = connectionCount() === 1;
  const run = hubRun();
  for (const id of ids) {
    if (run !== null && resumeHeld(streamState, streamHost, id, run)) {
      continue;
    }
    const held = sessionsState.sessions[id];
    // A read that failed before the first board already waits on what can
    // answer it (`readFailed`: the backoff, the machine's deadline, or the
    // board listing its machine online), and a 404 is the hub's answer. Its
    // stream is followed now, as `readFailed` follows one on an open socket
    // (stream.ts `followUnread`): a send the hub refuses meanwhile reaches
    // its row. A 404's cursor still reads, and is left.
    if (first && !pageReads.has(id) && (held?.readFault || held?.behind)) {
      if (streamState.cursors[id] && !following(streamState, id)) {
        followUnread(streamState, streamHost, id, true);
      }
      continue;
    }
    const holds = Boolean(
      streamState.cursors[id] ||
      held?.blocks.length ||
      held?.reads ||
      held?.loading ||
      held?.readFault ||
      held?.behind
    );
    if (holds && (cause === "reconnect" || !following(streamState, id))) {
      detach(readTranscript(id, cause, fresh), "readTranscript");
    }
  }
}

/** The board peeking a session subscribes it for frames; `null` closes the peek. */
export function setPeeked(id: string | null): void {
  if (peek.id === id) {
    return;
  }
  peek.id = id;
  syncSubscriptions();
}

/** One more reader of this delegate: its frames stream while any reader remains. */
export function watchDelegate(instanceId: string): void {
  watchedDelegates.set(instanceId, (watchedDelegates.get(instanceId) ?? 0) + 1);
  syncSubscriptions();
}

/** A reader let go; the last one stops the instance's frames. */
export function unwatchDelegate(instanceId: string): void {
  const count = watchedDelegates.get(instanceId);
  if (count === undefined) {
    return;
  }
  if (count > 1) {
    watchedDelegates.set(instanceId, count - 1);
    return;
  }
  watchedDelegates.delete(instanceId);
  syncSubscriptions();
}

/**
 * A new connection: every transcript the dashboard follows resumes its
 * stream from the place it holds when that place counts in the board's hub
 * run ({@link followHeld}), and is read again otherwise, merged into the rows
 * held ({@link mergeRows}), with this tab's own sends kept in `local` until
 * the hub places them, the read's page subscribing it on this socket
 * ({@link adoptPage}). Never resumed across hub runs: the hub numbers a
 * session's stream in memory, from 1 again after a restart, so a place from
 * another run sits inside another process's numbering, and a resume from it
 * would replay that process's events onto rows they do not follow. An open
 * tab never read yet waits for its pane's own read.
 */
export function rereadFollowed(): void {
  const ids = subscriptionIds().sort();
  lastSubscriptionKey = ids.join("\u0000");
  forgetUnwatched(streamState, streamHost, watchedIds());
  followHeld(ids, "reconnect");
}
