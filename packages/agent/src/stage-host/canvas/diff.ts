/**
 * What differs between two drawings of one component at one width (the
 * design graph's Compare, stage.ts): the state compared with, drawn hidden
 * under the stage's drawing (or beside it), and the kept state, the
 * stage's drawing. An element is a part a person reads: a form control, an
 * element with words of its own, an image or a glyph with a name, or a
 * house part (`data-slot`). Each is matched by what a person calls it, else
 * by its part's name and place, else by its words; what only the kept one
 * has came in, what only the compared one has went, and a matched pair
 * whose words, value or availability differ changed. A part inside a part
 * that came in or went is said by its outermost part alone.
 */
import type { DifferenceRead, DrawingBox } from "@cawco/core/stage-graph";
import { graphWords as words } from "@cawco/core/words/graph";
import { nameOf, wordsOf } from "./names";

const READ =
  "input, textarea, select, button, img, svg[aria-label], [data-slot]";

interface Part {
  disabled: boolean;
  el: Element;
  /** What a person calls it (names `nameOf`): a field by its label, a menu by its field's. */
  ident: string;
  key: string;
  text: string;
  value: string;
}

/** Whether the element has words of its own (a text node of its own that isn't blank). */
const ownWords = (el: Element): boolean =>
  [...el.childNodes].some(
    (node) =>
      node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== ""
  );

const drawn = (el: Element): boolean => {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
};

/** Its place: each ancestor's tag and its rank among its siblings of that tag, up to `root`. */
function placeOf(el: Element, root: Element): string {
  const steps: string[] = [];
  let at: Element | null = el;
  while (at && at !== root) {
    const tag = at.localName;
    const rank = at.parentElement
      ? [...at.parentElement.children]
          .filter((one) => one.localName === tag)
          .indexOf(at)
      : 0;
    steps.push(`${tag}${rank}`);
    at = at.parentElement;
  }
  return steps.reverse().join("/");
}

function partsOf(root: Element): Part[] {
  const parts: Part[] = [];
  for (const el of root.querySelectorAll("*")) {
    // A decoration a reader is never told of (a menu's chevron) is no part:
    // its wrapper changing named "Native select icon removed".
    // (The compared drawing is hidden from a reader whole: only a hider
    // inside the root counts.)
    const hider = el.closest("[aria-hidden='true']");
    if (
      !((el.matches(READ) || ownWords(el)) && drawn(el)) ||
      (hider && hider !== root && root.contains(hider))
    ) {
      continue;
    }
    const slot = el.getAttribute("data-slot");
    parts.push({
      el,
      // Its name and its element: a kit wrapper is named by the one control
      // it holds, and the two are two parts.
      ident: `${nameOf(el)}#${el.localName}`,
      key: slot ? `${slot}@${placeOf(el, root)}` : placeOf(el, root),
      text: ownWords(el) ? wordsOf(el) : "",
      value:
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
          ? el.value
          : "",
      disabled: "disabled" in el && el.disabled === true,
    });
  }
  return parts;
}

const boxIn = (el: Element, root: Element, scale: number): DrawingBox => {
  const a = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return {
    x: (a.left - b.left) / scale,
    y: (a.top - b.top) / scale,
    w: a.width / scale,
    h: a.height / scale,
  };
};

const SHORT = 40;
const short = (text: string) =>
  text.length > SHORT ? `${text.slice(0, SHORT - 1).trimEnd()}…` : text;

/** The parts of `list` by what a person calls them, only the names one part holds. */
const byOneName = (list: Part[]): Map<string, Part> => {
  const counts = new Map<string, number>();
  for (const part of list) {
    counts.set(part.ident, (counts.get(part.ident) ?? 0) + 1);
  }
  return new Map(
    list
      .filter((part) => counts.get(part.ident) === 1)
      .map((part) => [part.ident, part])
  );
};

/**
 * Each part of `after` matched to its part of `before`: by what a person
 * calls it, where one part on each side holds that name; else by its
 * part's name and place; else by its words. Paired by place first, the
 * Time zone menu of Every hour was matched to the day menu standing where
 * it stands in Every week ("Menu “Time zone”: 1 → Asia/Qatar").
 */
function pair(before: Part[], after: Part[]): Map<Part, Part> {
  const pairs = new Map<Part, Part>();
  const unpaired = new Set(before);
  const byKey = new Map(before.map((part) => [part.key, part]));
  const take = (part: Part, match: Part | undefined) => {
    if (match && unpaired.has(match)) {
      pairs.set(part, match);
      unpaired.delete(match);
    }
  };
  const named = byOneName(before);
  const namedAfter = byOneName(after);
  for (const part of after) {
    if (namedAfter.get(part.ident) === part) {
      take(part, named.get(part.ident));
    }
  }
  for (const part of after) {
    if (!pairs.has(part)) {
      take(part, byKey.get(part.key));
    }
  }
  for (const part of after) {
    if (!pairs.has(part) && part.text) {
      take(
        part,
        [...unpaired].find((one) => one.text === part.text)
      );
    }
  }
  return pairs;
}

/** What a matched pair says changed: its words, else its value; null when neither did. */
function saidOf(part: Part, was: Part): [string, string] | null {
  if (part.text !== was.text) {
    return [was.text, part.text];
  }
  if (part.value !== was.value) {
    return [was.value, part.value];
  }
  return null;
}

const radiusOf = (el: Element): string =>
  getComputedStyle(el).borderTopLeftRadius.split(" ")[0] ?? "0px";

/** The parts of `list` no other part of it holds. */
const outermost = (list: Part[]): Part[] =>
  list.filter(
    (part) =>
      !list.some((other) => other !== part && other.el.contains(part.el))
  );

/**
 * The differences from `compared` to `kept`, two roots holding one
 * component each at one width; `scale` is how the stage draws them. Each
 * box is in its own root's px: what went, in `compared`'s.
 */
export function differences(
  compared: Element,
  kept: Element,
  scale: number
): DifferenceRead[] {
  const before = partsOf(compared);
  const after = partsOf(kept);
  const pairs = pair(before, after);
  const matched = new Set(pairs.values());
  const mark = (
    part: Part,
    root: Element,
    kind: DifferenceRead["kind"],
    line: string
  ): DifferenceRead => ({
    kind,
    line,
    box: boxIn(part.el, root, scale),
    radius: radiusOf(part.el),
  });
  const found: DifferenceRead[] = outermost(
    after.filter((part) => !pairs.has(part))
  ).map((part) => mark(part, kept, "came", words.cameIn(nameOf(part.el))));
  for (const [part, was] of pairs) {
    const said = saidOf(part, was);
    if (said || part.disabled !== was.disabled) {
      const name = nameOf(part.el.closest("[data-slot]") ?? part.el);
      found.push(
        mark(
          part,
          kept,
          "changed",
          said
            ? // In the order the two drawings stand side by side, the kept
              // one first (its value is `part`'s, the compared one's `was`'s).
              words.changed(name, short(said[1]), short(said[0]))
            : words.changedPlain(name)
        )
      );
    }
  }
  for (const part of outermost(before.filter((one) => !matched.has(one)))) {
    found.push(mark(part, compared, "went", words.went(nameOf(part.el))));
  }
  return found.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}
