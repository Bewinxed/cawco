/**
 * A page's component canvases load one at a time (Preview.svelte).
 *
 * Each canvas embed asks for its whole module graph at once (stage-host
 * host.ts `preloadsOf`: every module a `modulepreload`, 626 for the pairing
 * canvas), and every embed of a page stands in one renderer process: the
 * hub's host is one site whatever the port. Chromium caps a process's
 * requests in flight at 2,700 (services/network/network_context.h,
 * `kMaxOutstandingRequestsPerProcess = 2700`) and fails each past it with
 * `net::ERR_INSUFFICIENT_RESOURCES`: twelve Previews of the pairing canvas
 * asked for some 7,500 modules at once, six said "Pairing didn't load" (the
 * section's import refused) and five never drew (their entry's). One at a
 * time, every embed after the first of a canvas reads the modules the first
 * kept (host.ts `KEPT`, `immutable`).
 *
 * A turn ends when its embed says its shape (it drew, or says why it
 * didn't), when its Preview goes, or after {@link TURN_MS}, so a canvas that
 * never answers holds the rest no longer than that.
 */

/** How long one embed holds the page's turn at most. Our call. */
const TURN_MS = 20_000;

/** The embeds waiting for their turn, first asked first. */
const waiting: (() => void)[] = [];
let loading = false;

const next = () => {
  if (loading) {
    return;
  }
  const start = waiting.shift();
  if (start) {
    loading = true;
    start();
  }
};

export interface EmbedTurn {
  /** Ends the turn, or takes it out of the queue before it came: once, later calls do nothing. */
  done: () => void;
  /** Settles when it is this embed's turn to load. */
  granted: Promise<void>;
}

/** A place in the page's queue of canvas embeds. */
export function embedTurn(): EmbedTurn {
  let state: "waiting" | "loading" | "done" = "waiting";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: () => void = () => undefined;
  const done = () => {
    if (state === "loading") {
      clearTimeout(timer);
      loading = false;
      state = "done";
      next();
    } else if (state === "waiting") {
      state = "done";
      const at = waiting.indexOf(start);
      if (at >= 0) {
        waiting.splice(at, 1);
      }
    }
  };
  const granted = new Promise<void>((resolve) => {
    start = () => {
      state = "loading";
      timer = setTimeout(done, TURN_MS);
      resolve();
    };
  });
  waiting.push(start);
  next();
  return { done, granted };
}
