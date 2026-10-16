/**
 * A page that is leaving starts no read and hears no read's end.
 *
 * From the moment a navigation away begins the browser tears the document's
 * loads down. WebKit then refuses every fetch the page starts, each with its
 * own console line ("… due to access control checks."), and fails every
 * fetch still in flight with "Load failed", which the page's readers would
 * report as their own error. Neither is a failure: nobody is left to read the
 * answer. So once the page is leaving, a new fetch does not start, and an
 * in-flight one that fails, or whose body read fails, is not told: each is
 * held until the page comes back, which a page that goes never does.
 *
 * What closes the gate, each the first word a browser gives that the page is
 * going:
 *
 *  - the page's own navigations away, through {@link leaveThePage};
 *  - `beforeunload`, for every navigation away, the person's reload and
 *    address bar included, wherever it fires; Safari on iOS never fires it
 *    (MDN, Window: beforeunload event, "Safari on iOS – No support");
 *  - the Navigation API's cross-document `navigate`, which Safari on iOS
 *    fires from 26.2 (MDN, Navigation: navigate event) for back and forward,
 *    links, forms and `location`, but, by design, not for the reload button,
 *    the address bar or a bookmark (the API's explainer, "Appendix: types of
 *    navigations": "Browser UI (non-back/forward other) | Cross | No");
 *  - `pagehide`, which every browser fires, last.
 *
 * On back and forward WebKit fails the reads in flight before it fires
 * `beforeunload` or `navigate` (measured: the failures one task ahead of
 * `navigate`, and still ahead after a deferred look), so there the gate holds
 * only the reads the page would start after.
 *
 * A page brought back from the back/forward cache (`pageshow` with
 * `persisted`) opens it again. Nothing in the app cancels a leave (no
 * `beforeNavigate` cancels, no other `navigate` listener) and no same-window
 * navigation ends in a download (the app's downloads are `<a download>`), so
 * a closed gate means the document is going. A `keepalive` send is made to
 * outlive the page (the error reporter's, hooks.client.ts) and always goes.
 *
 * SvelteKit's router listens for `beforeunload` already, so this listener
 * costs no back/forward cache entry in Firefox.
 */

/** The ways the page reads a response's body: each one's failure while leaving is held too. */
const BODY_READS = ["arrayBuffer", "blob", "json", "text"] as const;

let leaving = false;

/**
 * What each held read does if the page comes back: a failure held while
 * leaving is told then, and a fetch held before it started starts then.
 * WebKit restores a page from the back/forward cache at the point its reads
 * failed (WebKit bug 282506), so a held read is deferred, never dropped: the
 * readers that mark a read as made and unmark it only on failure read again.
 * A page that goes for good runs none of them.
 */
const onReturn: (() => void)[] = [];

/** Defers `settle` until the page comes back; the returned read settles as it does. */
function heldUntilBack<T>(settle: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    onReturn.push(() => {
      settle().then(resolve, reject);
    });
  });
}

/** Installs the gate on the page's `fetch`; the client's init hook calls it once. */
export function holdReadsWhileLeaving(): void {
  const native = globalThis.fetch.bind(globalThis);
  const leave = () => {
    leaving = true;
  };
  addEventListener("beforeunload", leave);
  addEventListener("pagehide", leave);
  // A browser without the Navigation API has no `navigation`; there this
  // signal does not start.
  globalThis.navigation?.addEventListener("navigate", (event) => {
    if (!event.destination.sameDocument && event.downloadRequest === null) {
      leave();
    }
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) {
      leaving = false;
      for (const told of onReturn.splice(0)) {
        told();
      }
    }
  });
  const heardWhileHere = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) =>
      leaving
        ? heldUntilBack<T>(() => Promise.reject(error))
        : Promise.reject(error)
    );
  const gated: typeof fetch = (input, init) => {
    const outlivesThePage =
      init?.keepalive ?? (input instanceof Request && input.keepalive);
    if (outlivesThePage) {
      return native(input, init);
    }
    if (leaving) {
      return heldUntilBack(() => gated(input, init));
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
  globalThis.fetch = gated;
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
