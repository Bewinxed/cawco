/**
 * The page's host and its origin. A preview is an origin of its own: the
 * dashboard's pane that frames it is another (in the Apple app, the host
 * script standing in for it is the page's own). The host is `window.parent`
 * alone, on an origin that may host it ({@link mayHost}), and its origin is
 * the one its `cawco:hello` came from: after that only messages from that
 * origin are heard, and every post goes to it alone, never to `*`. What the
 * page says before the hello waits for it.
 */
let hostOrigin: string | null = null;
const waiting: unknown[] = [];
/** The most said before a hello that is kept. Our call: a page says a handful while it loads. */
const WAITING_MAX = 50;

/**
 * Whether `origin` may host this page: a dashboard the hub is reached from
 * (`__cawcoParents`, which the hub freezes on the window ahead of the
 * overlay, core `overlayResponse`), or the page's own origin, where the
 * app's host script stands in for the dashboard in the page itself.
 */
const mayHost = (origin: string): boolean =>
  origin === location.origin ||
  (
    (window as unknown as { __cawcoParents?: readonly string[] })
      .__cawcoParents ?? []
  ).includes(origin);

/** Whether `event` is the host's: its hello, from `window.parent` on an origin that may host, names the origin; then that origin only. */
export function heardFromHost(event: MessageEvent): boolean {
  if (event.source !== window.parent) {
    return false;
  }
  const type = (event.data as { type?: unknown } | null)?.type;
  if (type === "cawco:hello") {
    if (!mayHost(event.origin)) {
      return false;
    }
    hostOrigin = event.origin;
    for (const message of waiting.splice(0)) {
      window.parent.postMessage(message, hostOrigin);
    }
    return true;
  }
  return hostOrigin !== null && event.origin === hostOrigin;
}

/** Posts `message` to the host's origin; before its hello, once the hello comes. */
export function toHost(message: unknown): void {
  if (hostOrigin === null) {
    if (waiting.length < WAITING_MAX) {
      waiting.push(message);
    }
    return;
  }
  window.parent.postMessage(message, hostOrigin);
}
