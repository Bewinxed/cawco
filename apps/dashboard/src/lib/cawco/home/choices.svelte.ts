/**
 * The owner's three open design choices, as temporary switches.
 *
 * Read from `?choice=` in development only, e.g.
 * `/session?choice=ipad:a,answer:b,finished:a`. Every choice not named takes
 * its recommended variant, which is also what a production build always
 * runs. The pick is kept for the browser tab (sessionStorage), because the
 * workspace writes conversation URLs without a query string.
 *
 * Each variant is read in exactly one place in the app, so the losers are
 * deleted by deleting their branch once the owner picks:
 * - `ipad`     layout-policy.svelte.ts and SessionSurface (deck or grid)
 * - `answer`   NeedsCard.svelte
 * - `finished` home.svelte.ts
 */
import { browser, dev } from "$app/environment";

export interface Choices {
  /** One answer form on the needs-you cards: (a) Approve/Deny, (b) open only. */
  answer: "a" | "b";
  /** (a) no Finished group, (b) a Finished group. */
  finished: "a" | "b";
  /**
   * Wide layouts: (a) one transcript, the others as tabs; (b) up to two
   * panes side by side on a tablet in landscape, one in portrait, free
   * splits on a desktop; (c) free splits everywhere.
   */
  ipad: "a" | "b" | "c";
}

const RECOMMENDED: Choices = { ipad: "b", answer: "a", finished: "b" };
const KEY = "cawco-choice";
const OPTIONS: { [K in keyof Choices]: readonly Choices[K][] } = {
  ipad: ["a", "b", "c"],
  answer: ["a", "b"],
  finished: ["a", "b"],
};

function parse(raw: string | null): Partial<Choices> {
  const picked: Partial<Choices> = {};
  for (const part of (raw ?? "").split(",")) {
    const [name, value] = part.split(":") as [keyof Choices, string];
    if (
      name in OPTIONS &&
      (OPTIONS[name] as readonly string[]).includes(value)
    ) {
      (picked as Record<string, string>)[name] = value;
    }
  }
  return picked;
}

function read(): Choices {
  if (!(browser && dev)) {
    return RECOMMENDED;
  }
  const fromUrl = new URL(location.href).searchParams.get("choice");
  if (fromUrl !== null) {
    sessionStorage.setItem(KEY, fromUrl);
  }
  return { ...RECOMMENDED, ...parse(sessionStorage.getItem(KEY)) };
}

export const choices: Choices = read();
