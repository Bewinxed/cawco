/**
 * The height each Configure page's card last settled at, by path. A cold
 * load of a Configure page shows its loading state until the fleet's
 * settings arrive; the card stands at this height meanwhile, the skeleton
 * fills it, and the rows arrive into a card that does not move. It is a
 * cookie, like the rail's width, so the server draws the first paint at
 * that size too (routes/config/+layout.server.ts).
 */
export const CARDS_COOKIE = "whiffle-config-cards";
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

const cookieValue = () => {
  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${CARDS_COOKIE}=`));
  return entry
    ? decodeURIComponent(entry.slice(CARDS_COOKIE.length + 1))
    : undefined;
};

/**
 * Attachment: keeps the height `node` settles at as `path`'s card, a moment
 * after it stops changing (a height tween in flight is not a settled size).
 */
export function rememberCard(path: string) {
  return (node: HTMLElement) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keep = () => {
      const cards = parseCards(cookieValue());
      delete cards[path];
      cards[path] = Math.round(node.getBoundingClientRect().height * 100) / 100;
      const paths = Object.keys(cards);
      for (const old of paths.slice(
        0,
        Math.max(0, paths.length - CARDS_LIMIT)
      )) {
        delete cards[old];
      }
      // biome-ignore lint/suspicious/noDocumentCookie: routes/config/+layout.server.ts reads this same cookie for the first paint, as with the rail's width
      document.cookie = `${CARDS_COOKIE}=${encodeURIComponent(JSON.stringify(cards))};path=/;max-age=31536000;samesite=lax`;
    };
    const sizes = new ResizeObserver(() => {
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
