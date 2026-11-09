import { frameObserver } from "#lib/platform/frame-observer.js";
import { CONFIG_CARDS_PREF, keepPrefs } from "#lib/platform/prefs.js";
import { store, stored } from "#lib/platform/storage.js";

/**
 * The height each Configure page's card last settled at, by path. A cold
 * load of a Configure page shows its loading state until the fleet's
 * settings arrive; the card stands at this height meanwhile, the skeleton
 * fills it, and the rows arrive into a card that does not move. Kept in
 * localStorage, and as a pref (lib/platform/prefs.ts), like the rail's width,
 * so the server draws the first paint at that size too
 * (routes/config/+layout.server.ts).
 */
/** The paths remembered: the sections and the editors opened last. */
const CARDS_LIMIT = 24;

export type Cards = Record<string, number>;

/** The cookie's value, as sent by the browser: anything, so it is checked. */
export function parseCards(raw: string | undefined): Cards {
  if (!raw) {
    return {};
  }
  let held: unknown;
  try {
    held = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!held || typeof held !== "object") {
    return {};
  }
  const cards: Cards = {};
  for (const [path, height] of Object.entries(held)) {
    if (typeof height === "number" && Number.isFinite(height) && height > 0) {
      cards[path] = height;
    }
  }
  return cards;
}

/** No storage: the server's copy is where it starts. */
const storedValue = (): string | undefined =>
  stored("local", CONFIG_CARDS_PREF) ?? undefined;

/**
 * Attachment: keeps the height `node` settles at as `path`'s card, a moment
 * after it stops changing (a height tween in flight is not a settled size).
 */
export function rememberCard(path: string) {
  return (node: HTMLElement) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keep = () => {
      const cards = parseCards(storedValue());
      delete cards[path];
      cards[path] = Math.round(node.getBoundingClientRect().height * 100) / 100;
      const paths = Object.keys(cards);
      for (const old of paths.slice(
        0,
        Math.max(0, paths.length - CARDS_LIMIT)
      )) {
        delete cards[old];
      }
      const value = JSON.stringify(cards);
      store("local", CONFIG_CARDS_PREF, value);
      keepPrefs({ [CONFIG_CARDS_PREF]: value });
    };
    const sizes = frameObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(keep, 400);
    });
    sizes.observe(node);
    return () => {
      clearTimeout(timer);
      sizes.disconnect();
    };
  };
}
