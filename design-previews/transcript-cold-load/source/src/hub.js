// The hub, faked in the page: the conversation's blocks and the reads the
// design asks of it, each answering after the bar's latency.
//
// - `load(place)` stands for the session page's server `load`: started before
//   anything mounts, it hands back a promise the shell renders past (SvelteKit
//   streams an un-awaited promise to the browser as it resolves,
//   svelte.dev/docs/kit/load#Streaming-with-promises). With a place it reads
//   the window around it, 120 blocks; a block the hub no longer holds (the
//   bar's "Spot no longer exists") is the window read's 409, and the load
//   answers the newest page instead, saying the place is gone. Without a
//   place, the newest page.
// - `older(cursor)` and `newer(after)`: a page of 60 either side of what the
//   reader holds, as the list asks for them.
import all from "./rows.json";

/** The one session the demo shows: the key its place is kept under. */
export const SESSION = "ses-obsidian-7k2q";

export const WINDOW = 120;
export const PAGE = 60;

const LATENCY_KEY = "cold-load-demo:latency";
const GONE_KEY = "cold-load-demo:gone";
export const LATENCIES = [300, 1000, 2000];

export const settings = {
  get latency() {
    const saved = Number(sessionStorage.getItem(LATENCY_KEY));
    return LATENCIES.includes(saved) ? saved : 1000;
  },
  set latency(ms) {
    sessionStorage.setItem(LATENCY_KEY, String(ms));
  },
  get gone() {
    return sessionStorage.getItem(GONE_KEY) === "1";
  },
  set gone(on) {
    sessionStorage.setItem(GONE_KEY, on ? "1" : "0");
  },
};

const after = (ms, value) => new Promise((done) => setTimeout(() => done(value), ms));

/** A slice of the conversation, with the reads either side of it. */
const range = (from, to) => ({
  blocks: all.slice(from, to),
  cursor: from > 0 ? from : null,
  after: to < all.length ? to : null,
});

const newest = () => range(Math.max(0, all.length - PAGE), all.length);

/** The window around `block`: half before it, half from it on, kept inside the conversation. */
function windowAt(block) {
  const at = all.findIndex((row) => row.key === block);
  if (at < 0 || settings.gone) {
    return null;
  }
  const from = Math.max(0, Math.min(at - WINDOW / 2, all.length - WINDOW));
  return range(from, Math.min(all.length, from + WINDOW));
}

/**
 * The page's load: `{ landing, page }` once the hub has answered. `landing`
 * is the place to land on, the tail, or `gone` (the place asked for is not
 * held any more, so the tail).
 */
export function load(place) {
  const latency = settings.latency;
  if (!place) {
    return after(latency, { landing: { tail: true }, page: newest() });
  }
  const window = windowAt(place.block);
  return window
    ? after(latency, { landing: { tail: false, ...place }, page: window })
    : after(latency, { landing: { tail: true, gone: true }, page: newest() });
}

/** The page before `cursor`. */
export const older = (cursor) =>
  after(settings.latency, range(Math.max(0, cursor - PAGE), cursor));

/** The page from `from` on. */
export const newer = (from) =>
  after(settings.latency, range(from, Math.min(all.length, from + PAGE)));
