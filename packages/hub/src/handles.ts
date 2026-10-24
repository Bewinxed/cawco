/**
 * The one way a tool reads an id it is given (presenters/words.ts `handle`):
 * the full id, its short handle (six or more of its first characters), or
 * the thing's name, among what the caller may name. Ambiguity is refused
 * with what it matched, never guessed.
 */

/** The fewest characters of an id that name it. */
export const HANDLE_MIN = 6;

/** How many candidates a refusal names; the rest are counted. */
const NAMED_AT_MOST = 12;

/** A handle: hex and dashes, at least {@link HANDLE_MIN} of them. */
const HANDLE = /^[0-9a-f-]+$/;

/** A mention chip as a composer writes it: `Fix the tray <cockpit#5a167bde>`, its handle in angle brackets. */
const CHIP = /<([^<>]+)>\s*$/;

export interface Handled<T> {
  /** The thing's id. */
  id: (thing: T) => string;
  /** The names it answers to besides its id. */
  names?: (thing: T) => readonly (string | null | undefined)[];
  /** How a refusal names it: its handle and name. */
  said: (thing: T) => string;
}

/**
 * The one candidate `asked` names: by its full id, by a handle of
 * {@link HANDLE_MIN} or more characters (bare, after a `name#` as tools
 * write a session's, `cockpit#5a167bde`, or in a mention chip's angle
 * brackets), else by a name (exact, any case). Refused, saying why and what
 * there is, when none or several do. `what` names the kind for the refusal:
 * "artifact", "pin".
 */
export function byHandle<T>(
  asked: string,
  candidates: readonly T[],
  keys: Handled<T>,
  what: string
): T {
  const wanted = CHIP.exec(asked.trim())?.[1]?.trim() ?? asked.trim();
  const exact = candidates.find((thing) => keys.id(thing) === wanted);
  if (exact) {
    return exact;
  }
  const lower = wanted.toLowerCase();
  const idPart = lower.slice(lower.lastIndexOf("#") + 1);
  const byId =
    idPart.length >= HANDLE_MIN && HANDLE.test(idPart)
      ? candidates.filter((thing) => keys.id(thing).startsWith(idPart))
      : [];
  const byName =
    byId.length > 0
      ? byId
      : candidates.filter((thing) =>
          (keys.names?.(thing) ?? []).some(
            (name) => name?.toLowerCase() === lower
          )
        );
  if (byName.length === 1 && byName[0] !== undefined) {
    return byName[0];
  }
  const named = (things: readonly T[]) =>
    `${things.slice(0, NAMED_AT_MOST).map(keys.said).join("; ")}${things.length > NAMED_AT_MOST ? `; and ${things.length - NAMED_AT_MOST} more` : ""}`;
  if (byName.length > 1) {
    throw new Error(
      `"${wanted}" names ${byName.length} ${what}s: ${named(byName)}. Give more of its id.`
    );
  }
  throw new Error(
    candidates.length === 0
      ? `No ${what} is "${wanted}": there are none you can name.`
      : `No ${what} is "${wanted}". Yours: ${named(candidates)}.`
  );
}
