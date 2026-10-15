/**
 * A harness page has no backend: its components run on fixture data, so any
 * request one of them makes throws, naming what it reached for, and the
 * check (design-explore scripts/check.mjs) fails on the console error. The
 * one way out is CawCo's own bridge, under `/__cawco/`: the overlay the hub
 * serves with the page keeps its picks and dials there (preview-overlay
 * artifact.ts opens its socket through `window.WebSocket` when it opens).
 * Imported first by every entry.
 */
const BRIDGE = /\/__cawco\//;

const refuse = (what: string, url: string | URL | Request): never => {
  throw new Error(
    `A harness page has no backend: ${what} ${String(url instanceof Request ? url.url : url)}. Feed the component fixture data instead.`
  );
};

const address = (url: string | URL | Request): string =>
  url instanceof Request ? url.url : String(url);

const ownFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  BRIDGE.test(address(input)) ? ownFetch(input, init) : refuse("fetch", input);

const OwnSocket = window.WebSocket;
window.WebSocket = class extends OwnSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    if (!BRIDGE.test(address(url))) {
      refuse("WebSocket", url);
    }
    super(url, protocols);
  }
};

const ownOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  ...rest: [boolean?, string?, string?]
) {
  if (!BRIDGE.test(address(url))) {
    refuse("XMLHttpRequest", url);
  }
  // biome-ignore lint/suspicious/noExplicitAny: open's overloads, passed through as called.
  return (ownOpen as any).call(this, method, url, ...rest);
};

window.EventSource = class {
  constructor(url: string | URL) {
    refuse("EventSource", url);
  }
} as unknown as typeof EventSource;

export {};
