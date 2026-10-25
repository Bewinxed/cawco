// Where the reader is, kept in a cookie the server's load reads: `cawco-place`,
// a small map of session id → `{ b: block, i: into }`, the block at the view's
// top and how far past that row's top the view stood. The tail is no entry.
// The session page's server `load` reads it (`cookies.get`) and starts the
// window read from it as a deferred promise; here `readPlace` stands in for
// that, read before anything mounts. Written as the reader scrolls, at most
// once per THROTTLE_MS, and on `pagehide`. It keeps the MAX_SESSIONS most
// recent sessions, so it stays well under a cookie's 4 KB.
//
// A cookie is per browser, not per tab: two tabs on one session share one
// place, the last one written.
//
// The rows' measured sizes are kept beside it, per tab (sessionStorage), by
// row key, with the width and root font size they were measured at; a
// mismatch drops them. The landing builds virtua's cache from them, which
// lands its first write within rounding (prototype question 1).

export const PLACE_COOKIE = "cawco-place";
const THROTTLE_MS = 300;
const MAX_SESSIONS = 20;
const MAX_AGE_S = 60 * 60 * 24 * 180;

/** Every session's kept place, most recent last. */
function readAll() {
  const raw = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${PLACE_COOKIE}=`))
    ?.slice(PLACE_COOKIE.length + 1);
  if (!raw) {
    return {};
  }
  try {
    const all = JSON.parse(decodeURIComponent(raw));
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

/** The place kept for `session`: what the server's load reads from the cookie. */
export function readPlace(session) {
  const kept = readAll()[session];
  if (!(kept && typeof kept.b === "string")) {
    return null;
  }
  const into = Number(kept.i);
  return { block: kept.b, into: Number.isFinite(into) && into > 0 ? into : 0 };
}

function write(session, place) {
  const all = readAll();
  delete all[session];
  if (place) {
    all[session] = { b: place.block, i: Math.round(place.into) };
  }
  const sessions = Object.keys(all);
  for (const old of sessions.slice(0, Math.max(0, sessions.length - MAX_SESSIONS))) {
    delete all[old];
  }
  document.cookie = `${PLACE_COOKIE}=${encodeURIComponent(JSON.stringify(all))}; path=/; max-age=${MAX_AGE_S}; samesite=lax`;
  lastWrite = performance.now();
}

let pending = null;
let timer = 0;
let lastWrite = 0;

/** Keep `place` (null: the tail) for `session`, throttled. */
export function keepPlace(session, place) {
  pending = { session, place };
  if (timer) {
    return;
  }
  const wait = Math.max(0, lastWrite + THROTTLE_MS - performance.now());
  timer = setTimeout(() => {
    timer = 0;
    const next = pending;
    pending = null;
    if (next) {
      write(next.session, next.place);
    }
  }, wait);
}

/** Write what is pending now: the page is going. */
export function flushPlace() {
  clearTimeout(timer);
  timer = 0;
  if (pending) {
    write(pending.session, pending.place);
    pending = null;
  }
}

const SIZES_KEY = "cold-load-demo:sizes";
const measuredAt = () => ({
  width: document.documentElement.clientWidth,
  font: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
});

/** The sizes kept for this tab, by row key, or none if they were measured at another width or font size. */
export function readSizes() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SIZES_KEY) ?? "null");
    const now = measuredAt();
    return saved && saved.at.width === now.width && saved.at.font === now.font ? saved.sizes : {};
  } catch {
    return {};
  }
}

/** Keep every size measured, `fresh` (row key → px) over what was kept. */
export function keepSizes(fresh) {
  const sizes = { ...readSizes(), ...fresh };
  sessionStorage.setItem(SIZES_KEY, JSON.stringify({ at: measuredAt(), sizes }));
}
