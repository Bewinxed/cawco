/**
 * A state's props as the Dials face's rows (the owner's pick, 2026-11-10:
 * the artifact panel's Inspect folds into Dials): each prop the stage's
 * docgen read, as the dial of its kind, so the props and the agent's dials
 * read down one grid with one set of controls. A slot and a code-typed prop
 * have no row (they stay pins); a prop the agent already made a dial for
 * (its `arg` target) shows once, as the dial.
 */
import type { PropMeta } from "@cawco/core/stage";
import { graphWords } from "@cawco/core/words/graph";
import { controlOf } from "../preview/sheet-inspector.svelte";
import {
  type DialValue,
  type DialValues,
  fitsInPlace,
  type GraphDial,
  isColour,
} from "./dials";

/** How a line of words is entered, read off its prop's type and value: a date, a time, both, or a link; none for free words. */
type WordsFormat = "date" | "time" | "datetime" | "url";

/** A prop as the face lists it: its dial, and for words with a form of their own, that form. */
export type PropDial = GraphDial & { format?: WordsFormat };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
const CLOCK = /^\d{2}:\d{2}(?::\d{2})?$/u;
const LINK = /^https?:\/\//u;
/** A figure counted in milliseconds by its name (`delayMs`, `duration`, `timeout`). */
const MILLIS = /(?:Ms|^ms|Duration|^duration|Delay|^delay|Timeout|^timeout)$/u;
/** A colour written out (a hex, a colour function), never a word the browser also reads as one ("red" stays words). */
const WRITTEN_COLOUR = /^#|\(/u;

/** A default's quotes, as docgen writes it (`"neutral"`). */
const QUOTES = /^["'`]|["'`]$/gu;

const { cases } = graphWords.dials;

/**
 * A name that says the words are an identifier (a branch, a path, a link, a
 * key): its content is one unbroken run in one script, so it takes the
 * length cases and none of the shapes prose from people and locales takes.
 */
const IDENTIFIER =
  /(?:^(?:url|href|link|path|file|branch|ref|slug|id|key|sha|email|hash)|[a-z](?:Url|URL|Href|Link|Path|File|Branch|Ref|Slug|Id|ID|Key|Sha|Email|Hash))s?$/u;

/**
 * The words each case fills a text prop with where its own data holds no
 * longer value: the break skill's content length and content shape axes
 * (interfaces/skills/break/scenarios.md), as a delegate row's or a task
 * card's words could stand.
 */
const SAMPLE = {
  long: "The tray's chips wrap onto a second line once a project has more than nine sessions, and the last chip slides under the composer, so pressing it opens the wrong session.",
  longIdentifier:
    "https://github.com/bewinxed/cockpit/compare/main...cawco/5d20079d-fix-tray-chip-overflow-when-a-project-has-more-than-nine-sessions",
  noSpaces: "Donaudampfschiffahrtsgesellschaftskapitänsmützenabzeichen",
  emoji: "🚀 Ship the tray fix 🎉🔥 before Thursday 👀",
  rightToLeft: "إصلاح شريحة CawCo tray على iOS 27 قبل الإصدار",
};

/** A case of the component's words: its name, and the words it fills each text prop it reaches with, by prop name. */
export interface ContentCase {
  fill: Record<string, string>;
  label: string;
}

/**
 * The cases the component's words can be put in, at once across its text
 * props (the owner's pick, 2026-11-10: one switch for the whole component,
 * after interfaces `break`), each kept only where it reaches a prop: Empty
 * and Long reach every text prop (Long with the longest value the prop's own
 * data holds, `longest`, else a sample); No spaces, Emoji and Right to left
 * only words people or other locales write, never an identifier (a
 * branch, a path, a link), which runs unbroken in one script.
 */
export function contentCases(
  props: readonly PropDial[],
  longest: DialValues = {}
): ContentCase[] {
  const text = props.filter((dial) => dial.kind === "text" && !dial.format);
  const prose = text.filter((dial) => !IDENTIFIER.test(dial.name));
  const fill = (
    dials: readonly GraphDial[],
    words: (dial: GraphDial) => string
  ): Record<string, string> =>
    Object.fromEntries(dials.map((dial) => [dial.name, words(dial)]));
  const long = (dial: GraphDial): string => {
    const real = longest[dial.name];
    if (typeof real === "string") {
      return real;
    }
    return IDENTIFIER.test(dial.name) ? SAMPLE.longIdentifier : SAMPLE.long;
  };
  return [
    { label: cases.empty, fill: fill(text, () => "") },
    { label: cases.long, fill: fill(text, long) },
    { label: cases.noSpaces, fill: fill(prose, () => SAMPLE.noSpaces) },
    { label: cases.emoji, fill: fill(prose, () => SAMPLE.emoji) },
    { label: cases.rightToLeft, fill: fill(prose, () => SAMPLE.rightToLeft) },
  ].filter((one) => Object.keys(one.fill).length > 0);
}

/** A word's start inside an identifier: a capital after a small letter or a figure, or an underscore or hyphen. */
const WORD_START = /(?<=[a-z0-9])(?=[A-Z])|[_-]+/gu;

/**
 * An identifier said as words in sentence case, as a dial's name is
 * written: `showBranch` "Show branch", `DelegateRow` "Delegate row",
 * `titleFont` "Title font". A run of capitals (`URL`) stays as written.
 */
export function wordsOf(identifier: string): string {
  const parts = identifier.split(WORD_START).filter(Boolean);
  return parts
    .map((part, at) => {
      const acronym = part.length > 1 && part === part.toUpperCase();
      if (acronym) {
        return part;
      }
      const small = part.toLowerCase();
      return at === 0 ? small.charAt(0).toUpperCase() + small.slice(1) : small;
    })
    .join(" ");
}

/**
 * A prop as the dial of its kind, named in words; none for a slot or a
 * code-typed prop. Whatever selects a look or a behaviour is picked: an
 * enum of a few looks and a size or font token as a choice, a colour token
 * as its swatches, a boolean as a switch, a figure as a number; data (free
 * words, and a set of names too long to stand in place) is one line of
 * words, its length and script the words' switch's.
 */
function dialOf(prop: PropMeta, value: DialValue | undefined): PropDial | null {
  const base = {
    name: prop.name,
    label: wordsOf(prop.name),
    target: { arg: prop.name },
  };
  const options = (prop.options ?? []).map(String);
  if (prop.type.name === "token-color" && options.length > 0) {
    return { ...base, kind: "color", options };
  }
  if (
    (prop.type.name === "token-size" || prop.type.name === "token-font") &&
    options.length > 0
  ) {
    return { ...base, kind: "select", options };
  }
  switch (controlOf(prop)) {
    case "segments":
    case "select":
      // A set too long to stand in place names data (projects, people),
      // not looks: which one it holds changes the drawing only by its
      // length and script, so it is a line of words under the words'
      // switch, never a list of its values (the owner's pin, 2026-11-10).
      return fitsInPlace(options)
        ? { ...base, kind: "select", options }
        : { ...base, kind: "text" };
    case "switch":
      return { ...base, kind: "toggle" };
    case "number":
      return MILLIS.test(prop.name)
        ? { ...base, kind: "number", unit: "ms" }
        : { ...base, kind: "number" };
    case "text": {
      const words = typeof value === "string" ? value : "";
      const format = formatOf(prop, words);
      if (!format && WRITTEN_COLOUR.test(words) && isColour(words)) {
        return { ...base, kind: "color" };
      }
      return format
        ? { ...base, kind: "text", format }
        : { ...base, kind: "text" };
    }
    case "slot":
    case "code":
      return null;
  }
}

/** The form a prop's words take, by its type and its value: a `Date` or an ISO date, a time, both, a link. */
function formatOf(prop: PropMeta, words: string): WordsFormat | undefined {
  if (ISO_DATETIME.test(words)) {
    return "datetime";
  }
  if (prop.type.raw === "Date" || ISO_DATE.test(words)) {
    return "date";
  }
  if (CLOCK.test(words)) {
    return "time";
  }
  if (LINK.test(words)) {
    return "url";
  }
}

/**
 * The props the face lists, each as the dial of its kind, in the
 * component's order: the control read off its type and its saved value
 * (`saved`, by name) before it falls back to a line of words.
 */
export function propDials(
  props: readonly PropMeta[],
  dials: readonly GraphDial[],
  saved: DialValues = {}
): PropDial[] {
  const dialed = new Set(
    dials.flatMap((dial) => ("arg" in dial.target ? [dial.target.arg] : []))
  );
  return props
    .filter((prop) => !dialed.has(prop.name))
    .map((prop) => dialOf(prop, saved[prop.name]))
    .filter((dial) => dial !== null);
}

/** A default as docgen writes it, read as the value it is: a boolean, a number, or words without their quotes. */
const defaultOf = (prop: PropMeta): DialValue | undefined => {
  const raw = prop.defaultValue?.trim();
  if (raw === undefined || raw === "") {
    return;
  }
  if (raw === "true" || raw === "false") {
    return raw === "true";
  }
  if (prop.type.name === "number" && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return raw.replaceAll(QUOTES, "");
};

/**
 * Each prop's value as the state mounts it from its file: its args (the
 * story's over the meta's), else the component's default; an enum's as its
 * option's words, as its select names it.
 */
export function savedOf(
  props: readonly PropMeta[],
  args: Record<string, unknown>
): DialValues {
  const saved: DialValues = {};
  for (const prop of props) {
    const value = prop.name in args ? args[prop.name] : defaultOf(prop);
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string"
    ) {
      saved[prop.name] = prop.type.name === "enum" ? String(value) : value;
    }
  }
  return saved;
}
