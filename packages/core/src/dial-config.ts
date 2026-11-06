/**
 * A decision page's dials as agents write them (a program's `Dials` piece,
 * an HTML page's `cawcoDials(name, config)`), read into the design graph's
 * dials (stage.ts `CanvasDial`): a number as `[default, min, max, step?]` or
 * bare, a colour as a CSS colour, a boolean, a string, `{ type: "select" |
 * "color" | "text" | "action" | "pad", … }`, a nested object as a folder
 * (its controls under its name), each dial by its path (`shadow.blur`).
 * What it can't read as one of those (a `{ type: "spring" }`, a list of
 * words) is named under `unread`, by path and kind: the panel draws the
 * rest, and the hub refuses a program that writes one (hub
 * decision-program.ts).
 */
import type { CanvasDial } from "./stage";

/** A dial's value as written: a number dial's figure, a colour, words or an option, a toggle's state. */
type WrittenValue = number | string | boolean;

/** A control the panel doesn't draw: its path, and its kind (the `type` it names, else its shape in words). */
interface UnreadControl {
  kind: string;
  path: string;
}

/** A panel's config read: its dials, each by its path, each one's value as written, and the controls it doesn't draw. */
export interface ConfigDials {
  dials: CanvasDial[];
  unread: UnreadControl[];
  written: Record<string, WrittenValue>;
}

/** The `type`s a control may name. */
const TYPES = ["select", "color", "text", "action", "pad"] as const;

/** What the panel draws, in the words a refusal says it with. */
export const DRAWN_CONTROLS = `a number ([default, min, max, step?] or bare), a colour, a boolean, words, {type: ${TYPES.map((one) => `"${one}"`).join(" | ")}}, and an object of these as a heading over them`;

/** A select's option as a page's config writes it: its words, or a value with its own label. */
type ConfigOption = string | { label?: string; value: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A key in words, camelCase broken: `shadowBlur` → "Shadow blur". */
const CASE_BREAK = /([a-z0-9])([A-Z])/gu;
const labelOf = (key: string): string => {
  const spaced = key.replace(CASE_BREAK, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** A value's shape in words, for one the panel doesn't draw. */
const shapeOf = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "an empty value";
  }
  return Array.isArray(value) ? "a list of words" : `a ${typeof value}`;
};

/** How a page's config is read: whether a string is a colour (the browser's own reading on a page; the hub tells none apart, and draws nothing). */
interface Reading {
  isColour: (typed: string) => boolean;
  out: ConfigDials;
}

/** One control of a page's config read as a dial or two (a pad's X and Y), at `path`, under `group`. */
function configDial(
  path: string,
  key: string,
  value: unknown,
  group: string | undefined,
  reading: Reading
): void {
  const { out } = reading;
  const base = {
    name: path,
    label: labelOf(key),
    target: { arg: path },
    ...(group ? { group } : {}),
  };
  const add = (dial: CanvasDial, written: WrittenValue) => {
    out.dials.push(dial);
    out.written[dial.name] = written;
  };
  if (Array.isArray(value) && typeof value[0] === "number") {
    const [start, min, max, step] = value as number[];
    add(
      { ...base, kind: "number", min, max, ...(step ? { step } : {}) },
      start ?? 0
    );
  } else if (typeof value === "number") {
    add({ ...base, kind: "number" }, value);
  } else if (typeof value === "boolean") {
    add({ ...base, kind: "toggle" }, value);
  } else if (typeof value === "string") {
    add({ ...base, kind: reading.isColour(value) ? "color" : "text" }, value);
  } else if (isObject(value) && typeof value.type === "string") {
    typedDial(base, key, { ...value, type: value.type }, reading, add);
  } else if (isObject(value)) {
    // A folder: its controls under its name as a heading.
    for (const [child, inner] of Object.entries(value)) {
      if (child !== "_collapsed") {
        configDial(`${path}.${child}`, child, inner, labelOf(key), reading);
      }
    }
  } else {
    out.unread.push({ path, kind: shapeOf(value) });
  }
}

/** A pad's two number dials, X and Y, under its one name: each `[default, min, max, step?]` as a number dial's. */
function padDials(
  base: Omit<CanvasDial, "kind">,
  key: string,
  value: Record<string, unknown>,
  reading: Reading
): void {
  for (const axis of ["x", "y"] as const) {
    const said = value[axis];
    const [start = 0, min = 0, max = 1, step] = Array.isArray(said)
      ? (said as number[])
      : [];
    configDial(
      `${base.name}.${axis}`,
      axis,
      [start, min, max, ...(step ? [step] : [])],
      labelOf(key),
      reading
    );
  }
}

/** A select's options as a page's config writes them: each its words, or a value with its own label. */
const optionsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? (value as ConfigOption[]).map((one) =>
        typeof one === "string" ? one : one.value
      )
    : [];

/** A control a page's config writes with its `type`: a select, a colour, words, an action, or a pad (two number dials, X and Y, under its one name); any other `type` is unread. */
function typedDial(
  base: Omit<CanvasDial, "kind">,
  key: string,
  value: Record<string, unknown> & { type: string },
  reading: Reading,
  add: (dial: CanvasDial, written: WrittenValue) => void
): void {
  const said = (fallback: string) => String(value.default ?? fallback);
  if (value.type === "select") {
    const options = optionsOf(value.options);
    add({ ...base, kind: "select", options }, said(options[0] ?? ""));
  } else if (value.type === "color") {
    add({ ...base, kind: "color" }, said("#000000"));
  } else if (value.type === "text") {
    add({ ...base, kind: "text" }, said(""));
  } else if (value.type === "action") {
    add(
      { ...base, kind: "action", label: String(value.label ?? base.label) },
      0
    );
  } else if (value.type === "pad") {
    padDials(base, key, value, reading);
  } else {
    reading.out.unread.push({
      path: base.name,
      kind: `{type: "${value.type}"}`,
    });
  }
}

/** A panel's `config` read into its dials, `isColour` telling a colour from words. */
export function dialsOfConfig(
  config: Record<string, unknown>,
  isColour: (typed: string) => boolean
): ConfigDials {
  const reading: Reading = {
    isColour,
    out: { dials: [], unread: [], written: {} },
  };
  for (const [key, value] of Object.entries(config)) {
    configDial(key, key, value, undefined, reading);
  }
  return reading.out;
}
