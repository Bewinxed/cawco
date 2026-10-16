/**
 * A page that is leaving starts no read and hears no read's end.
 *
 * From the moment a navigation away begins the browser tears the document's
 * loads down. WebKit then refuses every fetch the page starts, each with its
 * own console line ("… due to access control checks."), and fails every
 * fetch still in flight with "Load failed", which the page's readers would
 * report as their own error. Neither is a failure: nobody is left to read the
 * answer. So once the page is leaving, a new fetch never starts, and an
 * in-flight one that fails, or whose body read fails, never settles.
 *
 * Three things close the gate: the page's own navigations away, which go
 * through {@link leaveThePage}; `beforeunload`, for the person's reload, back
 * or address bar; and `pagehide`, the only one of the two Safari on iOS fires
 * (MDN, Window: beforeunload event, "Safari on iOS – No support"). A page
 * brought back from the back/forward cache (`pageshow` with `persisted`)
 * opens it again. Nothing in the app cancels a leave (no `beforeNavigate`
 * cancels), so a closed gate means the document is going. A `keepalive` send
 * is made to outlive the page (the error reporter's, hooks.client.ts) and
 * always goes.
 *
 * SvelteKit's router listens for `beforeunload` already, so this listener
 * costs no back/forward cache entry in Firefox.
 */

/** The ways the page reads a response's body: each one's failure while leaving is held too. */
const BODY_READS = ["arrayBuffer", "blob", "json", "text"] as const;

/** What a read the page will never hear the end of returns. */
const held = new Promise<never>(() => undefined);

let leaving = false;

/** Installs the gate on the page's `fetch`; the client's init hook calls it once. */
export function holdReadsWhileLeaving(): void {
  const native = globalThis.fetch.bind(globalThis);
  const leave = () => {
    leaving = true;
  };
  addEventListener("beforeunload", leave);
  addEventListener("pagehide", leave);
  addEventListener("pageshow", (event) => {
    if (event.persisted) {
      leaving = false;
    }
  });
  const heardWhileHere = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) => (leaving ? held : Promise.reject(error)));
  globalThis.fetch = (input, init) => {
    const outlivesThePage =
      init?.keepalive ?? (input instanceof Request && input.keepalive);
    if (outlivesThePage) {
      return native(input, init);
    }
    if (leaving) {
      return held;
    }
    return heardWhileHere(native(input, init)).then((response) => {
      // A body larger than its first packet streams after the headers, and
      // the teardown fails its read ("Load failed") as it fails the fetch.
      for (const read of BODY_READS) {
        const original = response[read].bind(response);
        Object.defineProperty(response, read, {
          value: () => heardWhileHere(original()),
        });
      }
      return response;
    });
  };
}

/**
 * The page's own navigation away (a reload, a sign-in redirect): the gate
 * closes first, so the reads its teardown cuts are never heard, even where
 * the browser fires no `beforeunload`.
 */
export function leaveThePage(go: () => void): void {
  leaving = true;
  go();
}
