/**
 * Choices in previews (§5.7 of the Projects spec): what a previewed page may
 * say about its picks, notes and dials, and the bounds every field is held to.
 *
 * The page is code an agent wrote, sharing a window with CawCo's overlay, so
 * anything it says is checked here before it is stored: the dashboard reads
 * the overlay's messages through {@link choiceOp}, and the hub reads the same
 * shapes again off its REST body.
 *
 * The overlay's methods carry MCP Apps' names where they mean the same thing:
 * a pick, a note or a dial is `ui/update-model-context` (it changes what the
 * model will read), and a send is `ui/message` (one message to the session).
 */

/** A choice id or a dial key: `hero`, `d1`, `voice.round-2`. */
export const CHOICE_ID_MAX = 100;
export const CHOICE_OPTION_MAX = 200;
/** Options one choice that takes several may hold. */
export const CHOICE_OPTIONS_MAX = 50;
export const CHOICE_NOTE_MAX = 2000;
/** A dial's value, as JSON. */
export const CHOICE_DIAL_MAX = 4000;
/** Choices one canvas keeps; a page past it is refused the next new id. */
export const CHOICES_PER_CANVAS = 500;
export const DIALS_PER_CANVAS = 100;
/** What a page may add to the one message a send makes. */
export const CHOICE_SEND_TEXT_MAX = 2000;

/** The MCP Apps method each overlay call maps onto. */
export const CHOICE_METHODS = {
  choose: "ui/update-model-context",
  note: "ui/update-model-context",
  set: "ui/update-model-context",
  send: "ui/message",
} as const;

export type ChoiceOp =
  | { op: "choose"; id: string; option: string | null }
  | { op: "choose"; id: string; options: string[] }
  | { op: "note"; id: string; text: string }
  | { op: "set"; key: string; value: unknown };

const hasControl = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
};

/** An id or key: 1 to {@link CHOICE_ID_MAX} printable characters, trimmed. */
export const choiceId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const id = value.trim();
  return id.length > 0 && id.length <= CHOICE_ID_MAX && !hasControl(id)
    ? id
    : null;
};

const option = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const picked = value.trim();
  return picked.length > 0 &&
    picked.length <= CHOICE_OPTION_MAX &&
    !hasControl(picked)
    ? picked
    : null;
};

/** A note as kept: cut to {@link CHOICE_NOTE_MAX}, line breaks allowed. */
export const choiceNote = (value: unknown): string | null =>
  typeof value === "string" ? value.slice(0, CHOICE_NOTE_MAX) : null;

/**
 * A dial's value: anything JSON can carry, at most {@link CHOICE_DIAL_MAX}
 * characters of it; undefined when it cannot be kept. Null clears the dial.
 */
export const choiceDial = (value: unknown): unknown => {
  let json: unknown;
  try {
    // `undefined`, a function or a symbol stringify to undefined; a cycle or a BigInt throws.
    json = JSON.stringify(value);
  } catch {
    json = null;
  }
  return typeof json === "string" && json.length <= CHOICE_DIAL_MAX
    ? JSON.parse(json)
    : undefined;
};

/** One pick, note or dial as a page said it, or null when its shape is wrong. */
export function choiceOp(value: unknown): ChoiceOp | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.op === "set") {
    const key = choiceId(raw.key);
    const dial = choiceDial(raw.value);
    return key === null || dial === undefined
      ? null
      : { op: "set", key, value: dial };
  }
  const id = choiceId(raw.id);
  if (id === null) {
    return null;
  }
  if (raw.op === "note") {
    const text = choiceNote(raw.text);
    return text === null ? null : { op: "note", id, text };
  }
  if (raw.op !== "choose") {
    return null;
  }
  if (Array.isArray(raw.options)) {
    if (raw.options.length > CHOICE_OPTIONS_MAX) {
      return null;
    }
    const options = raw.options.map(option);
    return options.every((entry): entry is string => entry !== null)
      ? { op: "choose", id, options: [...new Set(options)] }
      : null;
  }
  if (raw.option === null) {
    return { op: "choose", id, option: null };
  }
  const picked = option(raw.option);
  return picked === null ? null : { op: "choose", id, option: picked };
}
