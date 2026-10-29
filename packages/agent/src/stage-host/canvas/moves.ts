/**
 * The kept move on the stage (Projects spec §5.10, "The design graph", the
 * dock): the move into the kept state played where the person sees it, in
 * the kept frame, and each animation it fired held to be played again on
 * its own element with its own keyframes: from the start with the pane's
 * timings, held at a moment of them while the playhead is scrubbed, or let
 * go at rest, when the frame stands as the move left it. What it fired is
 * said to the pane (`cawco:move`, core design-graph.ts `MoveModel`), with
 * the page's own motion tokens, which the dock offers first.
 */
import {
  bezierOf,
  type ClipKind,
  type ClipRun,
  type DurationToken,
  type EasingToken,
  MOVE_LIMITS,
  type MoveAsk,
  type MoveClip,
  type MoveModel,
  type MoveTokens,
  type TunedClip,
} from "@cawco/core/design-graph";
import type { AnimationRead, MoveRender } from "@cawco/core/stage";

/** One animation a move fired, as the page caught it starting. */
export interface PlayedRecord {
  animation: Animation;
  /** Its element's words, as the dock's row says them. */
  element: string;
  keyframes: Keyframe[];
  kind: ClipKind;
  read: AnimationRead;
  source: string | null;
  target: Element | null;
}

/** A move played in a frame: what it rendered and every animation it fired. */
export interface Played {
  move: MoveRender;
  records: PlayedRecord[];
}

/** One clip held for playing again: its element's own animation, made anew from its keyframes. */
interface Replay {
  animation: Animation | null;
  id: number;
  keyframes: Keyframe[];
  target: Element | null;
}

/** The longest words an element is said by in the dock, in characters. Ours: a button's label. */
const ELEMENT_WORDS = 40;

/**
 * The words a person sees in an element: its text whose element is drawn,
 * not transparent, not hidden and not the screen reader's alone. A button
 * that tells a reader its pending label beside its label ("Create routine",
 * with an `sr-only` "Creating…") is said by its label alone.
 */
function seenWords(el: Element): string {
  const words: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const holder = node.parentElement;
    const box = holder?.getBoundingClientRect();
    // Drawn, not transparent or hidden, and not the screen reader's alone (`sr-only`: a 1px box, clipped).
    if (
      box &&
      box.width > 1 &&
      box.height > 1 &&
      holder?.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      })
    ) {
      words.push(node.textContent ?? "");
    }
  }
  return words.join(" ").replaceAll(/\s+/g, " ").trim();
}

/**
 * An element as the dock's row names it: its own words (a label, a line),
 * its accessible name, else the words a person sees in it, else its tag and
 * class as `describe` writes them.
 */
export function elementWords(el: Element | null, described: string): string {
  if (!el) {
    return described;
  }
  const own = [...el.childNodes]
    .filter((one) => one.nodeType === Node.TEXT_NODE)
    .map((one) => one.textContent ?? "")
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const said = own || el.getAttribute("aria-label")?.trim() || seenWords(el);
  if (!said) {
    return described;
  }
  return said.length > ELEMENT_WORDS
    ? `${said.slice(0, ELEMENT_WORDS - 1).trimEnd()}…`
    : said;
}

/** What a clip did to its element: brought it in (not there before the move), took it away (gone after), else changed it. */
export const kindOf = (
  target: Element | null,
  before: ReadonlySet<Element>
): ClipKind => {
  if (!target?.isConnected) {
    return "exit";
  }
  return before.has(target) ? "change" : "enter";
};

const TIME = /^(-?[\d.]+)(ms|s)$/;
const ROOT_SELECTOR = /(^|,)\s*(:root|html)\b/;
const VAR_ONLY = /^var\(\s*(--[\w-]+)\s*\)$/;

/** A declaration block's custom properties, the first of each name kept. */
function customProperties(
  style: CSSStyleDeclaration,
  into: Map<string, string>
): void {
  for (const name of style) {
    if (name.startsWith("--") && !into.has(name)) {
      into.set(name, style.getPropertyValue(name).trim());
    }
  }
}

/**
 * Every custom property a rule set on the root (`:root` or `html`), at any
 * depth of media, layers and supports, the first one kept. A root rule's
 * declarations after a rule nested in it (Tailwind writes a token's
 * `@supports (color: color-mix(…))` fallback inside `:root`) are a nested
 * declarations rule of their own (CSS Nesting's `CSSNestedDeclarations`),
 * not its `style`: read through `style` alone, every token after the first
 * nested rule went unread.
 */
function rootProperties(
  rules: CSSRuleList,
  into: Map<string, string>,
  inRoot = false
): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      if (ROOT_SELECTOR.test(rule.selectorText)) {
        customProperties(rule.style, into);
        rootProperties(rule.cssRules, into, true);
      }
    } else if (inRoot && "style" in rule) {
      customProperties(
        (rule as CSSRule & { style: CSSStyleDeclaration }).style,
        into
      );
    } else if ("cssRules" in rule) {
      rootProperties((rule as CSSGroupingRule).cssRules, into, inRoot);
    }
  }
}

/**
 * The page's own motion tokens, from the custom properties its stylesheets
 * set on the root (`:root` or `html`): each whose value is a time a
 * duration token, each whose value is a cubic-bézier an easing token. A
 * value that names another (`var(--x)`) is read through it. `sheets` are
 * the project's own: the canvas's sheets are none of them.
 */
export function motionTokens(sheets: readonly CSSStyleSheet[]): MoveTokens {
  const raw = new Map<string, string>();
  for (const sheet of sheets) {
    try {
      rootProperties(sheet.cssRules, raw);
    } catch {
      // A sheet from another origin keeps its rules: it has no tokens to read.
    }
  }
  const resolve = (value: string, depth = 0): string => {
    const ref = value.match(VAR_ONLY)?.[1];
    if (!ref || depth > 8) {
      return value;
    }
    const next = raw.get(ref);
    return next === undefined ? value : resolve(next, depth + 1);
  };
  const durations: DurationToken[] = [];
  const easings: EasingToken[] = [];
  for (const [name, value] of raw) {
    const resolved = resolve(value);
    const time = resolved.match(TIME);
    if (time) {
      const ms = Number(time[1]) * (time[2] === "s" ? 1000 : 1);
      if (Number.isFinite(ms) && ms > 0) {
        durations.push({ name, ms });
      }
      continue;
    }
    if (resolved.startsWith("cubic-bezier(")) {
      const points = bezierOf(resolved);
      if (points) {
        easings.push({ name, points });
      }
    }
  }
  // Shortest first; two tokens at one length keep the first the sheets set.
  const seen = new Set<number>();
  const ladder = durations
    .sort((a, b) => a.ms - b.ms)
    .filter((one) => {
      if (seen.has(one.ms)) {
        return false;
      }
      seen.add(one.ms);
      return true;
    });
  return {
    durations: ladder.slice(0, MOVE_LIMITS.durations),
    easings: easings.slice(0, MOVE_LIMITS.easings),
  };
}

/**
 * A two-keyframe effect's curve moved onto the effect: a CSS transition
 * runs its timing function on its first keyframe and none on the effect, so
 * the effect's own is what the dock reads and edits. An effect of more
 * keyframes keeps each keyframe's.
 */
export function effectEasing(
  read: AnimationRead,
  keyframes: Keyframe[]
): {
  easing: string;
  keyframes: Keyframe[];
} {
  const [first] = keyframes;
  if (
    keyframes.length === 2 &&
    read.easing === "linear" &&
    typeof first?.easing === "string" &&
    first.easing !== "linear"
  ) {
    return {
      easing: first.easing,
      keyframes: keyframes.map(({ easing: _easing, ...rest }) => rest),
    };
  }
  return { easing: read.easing, keyframes };
}

export interface MoveStageOptions {
  /** Plays move `to` of states file `file` in its kept frame; null when that frame isn't drawn. */
  play: (file: string, to: string) => Promise<Played | null>;
  /** Says the kept move to the pane (`cawco:move`): null when the kept state has none that animates. */
  say: (move: MoveModel | null) => void;
  /** The page's own motion tokens, read now. */
  tokens: () => MoveTokens;
  /** Keeps the person's timing in the artifact (`tuned`). */
  tune: (tuned: TunedClip[]) => void;
}

/** The kept move, held for the dock. */
export class MoveStage {
  readonly #o: MoveStageOptions;
  #open: { file: string; to: string; replays: Replay[] } | null = null;
  /** The move being opened: a newer ask makes an older one's answer stale. */
  #asked = "";

  constructor(options: MoveStageOptions) {
    this.#o = options;
  }

  /** The move kept: `file`'s `to` played in its kept frame, its clips said. Null closes it. */
  async keep(move: { file: string; to: string } | null): Promise<void> {
    const key = move ? `${move.file}|${move.to}` : "";
    if (key === this.#asked) {
      return;
    }
    this.#asked = key;
    this.#letGo();
    this.#open = null;
    if (!move) {
      this.#o.say(null);
      return;
    }
    const played = await this.#o.play(move.file, move.to);
    if (this.#asked !== key) {
      return;
    }
    if (!played) {
      this.#asked = "";
      this.#o.say(null);
      return;
    }
    const records = played.records.slice(0, MOVE_LIMITS.clips);
    const clips: MoveClip[] = records.map((one, id) => {
      const { easing } = effectEasing(one.read, one.keyframes);
      return {
        id,
        kind: one.kind,
        element: one.element,
        source: one.source,
        property: one.read.property,
        start: Math.round(one.read.start + one.read.delay),
        duration: Math.round(one.read.duration),
        easing,
      };
    });
    this.#open = {
      file: move.file,
      to: move.to,
      replays: records.map((one, id) => ({
        id,
        animation: null,
        keyframes: effectEasing(one.read, one.keyframes).keyframes,
        target: one.target,
      })),
    };
    this.#o.say({
      file: move.file,
      from: played.move.from,
      to: played.move.to,
      clips,
      tokens: this.#o.tokens(),
      error: played.move.error?.message ?? null,
    });
  }

  /** The pane's ask of the kept move: play it, hold it at a moment, let it rest, or keep the person's timing. */
  ask(ask: MoveAsk): void {
    if (ask.op === "tune") {
      this.#o.tune(ask.tuned);
      return;
    }
    if (ask.op === "rest") {
      this.#letGo();
      return;
    }
    const open = this.#open;
    if (!open) {
      return;
    }
    for (const replay of open.replays) {
      const run = ask.runs.find((one) => one.id === replay.id);
      const animation = this.#replayOf(replay, run);
      if (!animation) {
        continue;
      }
      if (ask.op === "play") {
        animation.currentTime = 0;
        animation.play();
      } else {
        animation.pause();
        animation.currentTime = Math.max(0, ask.time);
      }
    }
  }

  /** A clip's animation on its element, made once and retimed to `run`; null where its element is gone (an exit's, once the move ended). */
  #replayOf(replay: Replay, run: ClipRun | undefined): Animation | null {
    if (!(run && replay.target?.isConnected && replay.keyframes.length > 0)) {
      return null;
    }
    const timing = {
      delay: run.start,
      duration: Math.max(1, run.duration),
      easing: run.easing,
      fill: "both" as const,
    };
    if (replay.animation) {
      replay.animation.effect?.updateTiming(timing);
      return replay.animation;
    }
    try {
      const animation = replay.target.animate(replay.keyframes, timing);
      animation.pause();
      // Played out, the frame stands as the move left it, with no fill held over it.
      animation.addEventListener("finish", () => {
        if (replay.animation === animation) {
          animation.cancel();
          replay.animation = null;
        }
      });
      replay.animation = animation;
      return animation;
    } catch {
      // An easing the engine refuses (the person's own custom curve, mistyped) plays nothing.
      return null;
    }
  }

  /** Every replay let go: the frame stands as the move left it. */
  #letGo(): void {
    for (const replay of this.#open?.replays ?? []) {
      replay.animation?.cancel();
      replay.animation = null;
    }
  }
}
