/**
 * Host mode's sign-in gate, for preview names behind a proxy that signs the
 * person in (Cloudflare Access). The proxy's login page refuses to be framed
 * (`frame-ancestors 'none'`), so a preview name the browser holds no session
 * for yet can't sign in inside the dashboard's frame. The frame opens the
 * preview at {@link PREVIEW_GATE_PATH}`?next=<path>` instead, the one path the
 * proxy leaves public. The gate asks {@link PREVIEW_GATE_DONE_PATH}, which
 * the proxy still guards, whether the frame gets through: if it does, the
 * gate goes on to `next` at once; if the proxy answers with its redirect, the
 * gate offers a sign-in in a window of its own, where the login page is a
 * top-level page, and that window's done page closes itself. The window
 * shares the frame's cookies, so the gate sees the new session and goes on.
 * (After https://risanb.com/posts/loading-a-cloudflare-access-app-in-an-iframe/.)
 *
 * The gate serves nothing of the previewed app's and passes nothing through:
 * it asks a page of the hub's own and moves the frame to a path on its own
 * origin. It asks the done page rather than `next`, so an app that redirects
 * on its own (`/` to `/login`) never reads as signed out.
 */
import { PREVIEW_GATE_DONE_PATH, PREVIEW_GATE_PATH } from "@cawco/core";
import { kitTokens } from "./decision-page";

/** How often the gate asks again while the sign-in window is open. Our call: a sign-in takes seconds, and one small request a second costs nothing. */
const POLL_MS = 1000;

/**
 * `next` as a path on the gate's own origin: a path that leaves it (`//host`,
 * `/\host`, a scheme), or names the gate itself, is the root instead.
 */
const placeOf = (url: URL): string => {
  const next = url.searchParams.get("next") ?? "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  const at = new URL(next, url.origin);
  if (
    at.origin !== url.origin ||
    at.pathname === PREVIEW_GATE_PATH ||
    at.pathname === PREVIEW_GATE_DONE_PATH
  ) {
    return "/";
  }
  return `${at.pathname}${at.search}${at.hash}`;
};

/** A JSON value safe inside a `<script>`. */
const scripted = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/** The page's frame: the fleet's tokens, a surface and a measure. */
const STYLE = `
:root { color-scheme: light dark; }
html, body { height: 100%; margin: 0; }
body {
  display: grid;
  place-items: center;
  padding: var(--space-5);
  box-sizing: border-box;
  background: var(--surface-page);
  color: var(--ink-strong);
  font: var(--type-body);
  -webkit-font-smoothing: antialiased;
}
::selection { background: var(--selection); }
main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  max-width: 44ch;
}
h1 { margin: 0; font: var(--type-title); letter-spacing: -0.01em; text-wrap: balance; }
p { margin: 0; color: var(--ink-muted); text-wrap: pretty; }
.status { font: var(--type-meta); min-height: 1lh; }
button {
  margin-top: var(--space-2);
  height: var(--c-btn-h);
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-md);
  background-color: var(--action-solid);
  background-image: var(--action-surface);
  color: var(--on-action);
  font: var(--type-button);
  letter-spacing: -0.01em;
  cursor: pointer;
  transition:
    background-color var(--dur-control) var(--ease-out),
    scale var(--dur-toggle) var(--ease-out);
}
button:hover { background-color: var(--action-hover); background-image: var(--action-surface-hover); }
button:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset); }
button[aria-disabled="true"] { cursor: default; }
@media (prefers-reduced-motion: no-preference) {
  button:active:not([aria-disabled="true"]) { scale: var(--press-scale); }
}
[hidden] { display: none !important; }
`;

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${kitTokens()}${STYLE}</style></head><body>${body}</body></html>`;

/** The gate's words (WORDS.md: what happened, why, the way on). */
const WORDS = {
  sign: "Sign in to show this preview",
  /** The button's pending wording (DESIGN.md Buttons, Pending): it keeps its colour and place, and swallows presses. */
  waiting: "Waiting for sign-in…",
  blocked:
    "The sign-in window didn't open: allow pop-ups for this page, then sign in again.",
  closed:
    "The sign-in window closed before you were signed in. Sign in again to show this preview.",
};

/** The gate for a request to {@link PREVIEW_GATE_PATH}: it goes on to `next`, or offers the sign-in. */
export function gateResponse(request: Request): Response {
  const next = placeOf(new URL(request.url));
  // Nothing shows while the first ask is out: a frame that gets through
  // moves on with no flash of the sign-in.
  const body = `<main hidden>
<h1>This preview is behind your sign-in</h1>
<p>The sign-in page can't open inside the dashboard, so it opens in a window of its own and closes itself once you're in.</p>
<button type="button">${WORDS.sign}</button>
<p class="status" role="status" aria-live="polite"></p>
</main>
<script>
(function () {
  var next = ${scripted(next)};
  var done = ${scripted(PREVIEW_GATE_DONE_PATH)};
  var words = ${scripted(WORDS)};
  var main = document.querySelector("main");
  var button = document.querySelector("button");
  var status = document.querySelector(".status");
  var popup = null;
  var timer = 0;
  function signedIn() {
    return fetch(done, { credentials: "include", redirect: "manual", cache: "no-store" })
      .then(function (answer) { return answer.ok; })
      .catch(function () { return false; });
  }
  function go() {
    clearInterval(timer);
    location.replace(next);
  }
  function waiting(on) {
    button.setAttribute("aria-disabled", on ? "true" : "false");
    button.textContent = on ? words.waiting : words.sign;
  }
  button.addEventListener("click", function () {
    if (button.getAttribute("aria-disabled") === "true") return;
    popup = window.open(done, "cawco-sign-in", "popup,width=520,height=720");
    if (!popup) {
      status.textContent = words.blocked;
      return;
    }
    waiting(true);
    status.textContent = "";
    clearInterval(timer);
    timer = setInterval(function () {
      signedIn().then(function (yes) {
        if (yes) return go();
        if (popup && popup.closed) {
          clearInterval(timer);
          waiting(false);
          status.textContent = words.closed;
        }
      });
    }, ${POLL_MS});
  });
  signedIn().then(function (yes) {
    if (yes) return go();
    main.hidden = false;
  });
})();
</script>`;
  return new Response(page("Sign in to show this preview", body), {
    headers: HEADERS,
  });
}

/** The page the sign-in window lands on once the proxy lets it through: it closes itself. */
export function gateDoneResponse(): Response {
  const body = `<main>
<h1>You're signed in</h1>
<p>This window closes itself. If it stays open, close it and go back to the dashboard.</p>
</main>
<script>window.close();</script>`;
  return new Response(page("Signed in", body), { headers: HEADERS });
}
