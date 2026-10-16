/**
 * A page that is leaving starts no read and hears no read's end.
 *
 * From the moment a navigation away begins (`beforeunload`) the browser tears
 * the document's loads down. WebKit then refuses every fetch the page starts,
 * each with its own console line ("… due to access control checks."), and
 * fails every fetch still in flight with "Load failed", which the page's
 * readers would report as their own error. Neither is a failure: nobody is
 * left to read the answer. So once the page is leaving, a new fetch never
 * starts and an in-flight one that fails never settles.
 *
 * `beforeunload` closes the gate; `pagehide` does too, since Safari on iOS
 * never fires `beforeunload` (MDN, Window: beforeunload event, "Safari on iOS
 * – No support"). A page brought back from the back/forward cache
 * (`pageshow` with `persisted`) opens it again. Nothing in the app cancels a
 * leave (no `beforeNavigate` cancels), so a closed gate means the document is
 * going. A `keepalive` send is made to outlive the page (the error reporter's,
 * hooks.client.ts) and always goes.
 *
 * SvelteKit's router listens for `beforeunload` already, so this listener
 * costs no back/forward cache entry in Firefox.
 */
export function holdReadsWhileLeaving(): void {
  const native = globalThis.fetch.bind(globalThis);
  const held = new Promise<never>(() => undefined);
  let leaving = false;
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
  globalThis.fetch = (input, init) => {
    const outlivesThePage =
      init?.keepalive ?? (input instanceof Request && input.keepalive);
    if (outlivesThePage) {
      return native(input, init);
    }
    if (leaving) {
      return held;
    }
    return native(input, init).catch((error: unknown) =>
      leaving ? held : Promise.reject(error)
    );
  };
}
