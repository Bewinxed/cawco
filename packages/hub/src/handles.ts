/**
 * The one way a tool reads an id it is given (presenters/words.ts `handle`):
 * the full id, its short handle (six or more of its first characters), or
 * the thing's name, among what the caller may name. Ambiguity is refused
 * with what it matched, never guessed. A session's, an item's, an
 * artifact's and every other id a tool takes is read here; a tool keeps
 * only its own scope (which candidates the caller may name).
 */

/** The fewest characters of an id that name it. */
export const HANDLE_MIN = 6;

/** How many candidates a refusal names; the rest are counted. */
const NAMED_AT_MOST = 12;

/** A handle: hex and dashes, at least {@link HANDLE_MIN} of them. */
const HANDLE = /^[0-9a-f-]+$/u;

/** A mention chip as a composer writes it: `Fix the tray <cockpit#5a167bde>`, its handle in angle brackets. */
const CHIP = /<([^<>]+)>\s*$/u;

/** An `@` a mention begins with. */
const AT = /^@/u;

/** What `asked` says, trimmed: a mention chip's handle when it is one, else the words. */
const said = (asked: string): string =>
  CHIP.exec(asked.trim())?.[1]?.trim() ?? asked.trim();

/**
 * What a mention names, lowercased: a chip's handle (`@Fix the tray
 * <cockpit#5a167bde>` names `cockpit#5a167bde`), else the words, an `@`
 * before them aside. What a tool matches a name or a title against.
 */
export const mentioned = (asked: string): string =>
  said(asked).toLowerCase().replace(AT, "");

/**
 * The id `asked` names a thing by, lowercased: what follows a `name#` as
 * tools write a session's (`cockpit#5a167bde`), else the id given bare,
 * each as a mention may carry it ({@link mentioned}). What a caller looks a
 * whole id up by, or a prefix in its store; matched among candidates by
 * {@link byId}.
 */
export const handleId = (asked: string): string => {
  const lower = mentioned(asked);
  return lower.slice(lower.lastIndexOf("#") + 1);
};

/** Whether `asked` can name a thing by a prefix of its id: {@link HANDLE_MIN} or more hex characters. */
export const isHandle = (asked: string): boolean => {
  const id = handleId(asked);
  return id.length >= HANDLE_MIN && HANDLE.test(id);
};

/**
 * The candidates `asked` names by id: the one whose whole id it is, else
 * every one whose id its handle ({@link handleId}, {@link HANDLE_MIN} or
 * more characters) begins. None when it names none by id (it may be a
 * name); several when it is ambiguous, for the caller to refuse.
 */
export function byId<T>(
  asked: string,
  candidates: readonly T[],
  id: (thing: T) => string
): T[] {
  const whole = said(asked);
  const exact = candidates.find((thing) => id(thing) === whole);
  if (exact) {
    return [exact];
  }
  const wanted = handleId(asked);
  const same = candidates.find((thing) => id(thing) === wanted);
  if (same) {
    return [same];
  }
  return isHandle(asked)
    ? candidates.filter((thing) => id(thing).startsWith(wanted))
    : [];
}

export interface Handled<T> {
  /** The thing's id. */
  id: (thing: T) => string;
  /** The names it answers to besides its id. */
  names?: (thing: T) => readonly (string | null | undefined)[];
  /** How a refusal names it: its handle and name. */
  said: (thing: T) => string;
}

/** `things` as a refusal lists them, at most {@link NAMED_AT_MOST}. */
const listed = <T>(things: readonly T[], keys: Handled<T>): string =>
  `${things.slice(0, NAMED_AT_MOST).map(keys.said).join("; ")}${things.length > NAMED_AT_MOST ? `; and ${things.length - NAMED_AT_MOST} more` : ""}`;

/** The refusal of `asked` naming several of `what`: each listed, and to give more of its id. */
export const ambiguousHandle = <T>(
  asked: string,
  things: readonly T[],
  keys: Handled<T>,
  what: string
): Error =>
  new Error(
    `"${said(asked)}" names ${things.length} ${what}s: ${listed(things, keys)}. Give more of its id.`
  );

/**
 * The one candidate `asked` names: by id ({@link byId}: its full id, or a
 * handle of {@link HANDLE_MIN} or more characters, bare, after a `name#`,
 * after an `@`, or in a mention chip's angle brackets), else by a name
 * (exact, any case). Refused, saying why and what there is, when none or
 * several do. `what` names the kind for the refusal: "artifact", "pin".
 */
export function byHandle<T>(
  asked: string,
  candidates: readonly T[],
  keys: Handled<T>,
  what: string
): T {
  const wanted = said(asked);
  const lower = wanted.toLowerCase();
  const ided = byId(asked, candidates, keys.id);
  const found =
    ided.length > 0
      ? ided
      : candidates.filter((thing) =>
          (keys.names?.(thing) ?? []).some(
            (name) => name?.toLowerCase() === lower
          )
        );
  if (found.length === 1 && found[0] !== undefined) {
    return found[0];
  }
  if (found.length > 1) {
    throw ambiguousHandle(asked, found, keys, what);
  }
  throw new Error(
    candidates.length === 0
      ? `No ${what} is "${wanted}": there are none you can name.`
      : `No ${what} is "${wanted}". Yours: ${listed(candidates, keys)}.`
  );
}
