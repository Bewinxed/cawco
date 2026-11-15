/**
 * Reading a frame from the engine (the fleet's rule 6: state and geometry,
 * never the picture): whether it drew, its words, the component files its
 * elements came from, the computed-style delta a forced state makes, and the
 * animations a change fired, from `getAnimations()`.
 */

import { fnv1a } from "@cawco/core/fnv1a";
import {
  type AnimationRead,
  MODULES_PATH,
  type PageError,
  type PartUse,
  type StyleDelta,
  unkeyedPath,
} from "@cawco/core/stage";
import { cutShort } from "@cawco/core/words/helpers";
import { ownPlace } from "./own";

/** Svelte's dev stack on an element (a dev compile's `__svelte_meta`). */
interface SvelteMeta {
  loc?: { column: number; file: string; line: number };
  parent?: SvelteCall | null;
}
interface SvelteCall {
  column: number;
  componentTag?: string;
  file: string;
  line: number;
  parent?: SvelteCall | null;
  type: string;
}
declare global {
  interface Element {
    /** Svelte's dev stack, stamped on an element by a dev compile. */
    __svelte_meta?: SvelteMeta;
  }
}

/** A stamped element's place (`data-insp-path="<file>:<line>:<column>:<tag>"`, stage-host `stamp`). */
const STAMPED = /^(.*):(\d+):(\d+):([\w.$-]+)$/u;
const EXTENSION = /\.[^./]+$/u;
const CAPITALISED = /^[A-Z]/u;
const DIR = /^.*\//u;
const HASH_CLASS = /^(?:svelte-|s-)[\w-]+$/u;

/** A file from the toolchain root: a dev path made relative, its query dropped. */
export const fromRoot = (file: string, root: string): string => {
  const plain = file.split("?")[0] ?? file;
  return plain.startsWith(`${root}/`) ? plain.slice(root.length + 1) : plain;
};

const nameOfFile = (file: string): string =>
  file.replace(DIR, "").replace(EXTENSION, "");

/** An element as a selector a person reads: its tag, id and first two classes the project wrote. */
function describe(el: Element | null): string {
  if (!el) {
    return "?";
  }
  const classes = [...el.classList]
    .filter((one) => !(HASH_CLASS.test(one) || one.startsWith("cawco-")))
    .slice(0, 2);
  return `${el.localName}${el.id ? `#${el.id}` : ""}${classes.map((one) => `.${one}`).join("")}`;
}

/** Where an element is written, `file:line:column`, when the dev build marks it. */
function sourceOf(el: Element, root: string): string | null {
  const meta = el.__svelte_meta?.loc;
  if (meta) {
    return `${fromRoot(meta.file, root)}:${meta.line}:${meta.column + 1}`;
  }
  const [, file, line, column] =
    el.getAttribute("data-insp-path")?.match(STAMPED) ?? [];
  return file === undefined
    ? null
    : `${fromRoot(file, root)}:${line}:${column}`;
}

/** The elements of a frame's body a reading walks: at most this many. Ours: a screen's first screenful. */
const ELEMENTS_READ = 600;

const elementsOf = (body: Element): Element[] =>
  [...body.querySelectorAll("*")].slice(0, ELEMENTS_READ);

/** How many elements the body held and how many a reading walks of them, when it holds more than it walks. */
export const elementsUnread = (
  body: Element
): { of: number; read: number } | null => {
  const of = body.querySelectorAll("*").length;
  return of > ELEMENTS_READ ? { of, read: ELEMENTS_READ } : null;
};

/**
 * The components whose elements a frame drew, each once: Svelte's dev
 * stack gives each element's own file and, up its parents, where each
 * component is called; elsewhere each element's stamp gives its file.
 */
export function partsOf(body: Element, root: string): PartUse[] {
  const parts = new Map<string, PartUse>();
  const add = (file: string, name: string, at: string | null) => {
    const key = fromRoot(file, root);
    const had = parts.get(key);
    if (!had || (had.at === null && at)) {
      parts.set(key, { file: key, name, at });
    }
  };
  for (const el of elementsOf(body)) {
    const meta = el.__svelte_meta;
    if (meta?.loc) {
      // Files up the stack: the element's own, then each call's.
      let { file } = meta.loc;
      for (let call = meta.parent; call; call = call.parent) {
        if (call.type !== "component") {
          continue;
        }
        add(
          file,
          call.componentTag ?? nameOfFile(file),
          `${fromRoot(call.file, root)}:${call.line}:${call.column + 1}`
        );
        ({ file } = call);
      }
      add(file, nameOfFile(file), null);
      continue;
    }
    const stamp = el.getAttribute("data-insp-path")?.match(STAMPED);
    const [, file, line, column, tag] = stamp ?? [];
    if (file !== undefined && tag !== undefined) {
      if (CAPITALISED.test(tag)) {
        add(file, tag, `${fromRoot(file, root)}:${line}:${column}`);
      } else {
        add(file, nameOfFile(file), null);
      }
    }
  }
  return [...parts.values()];
}

/** Whether a body drew something a person sees: a box with area and words, media, a control, or a painted box. */
export function drew(body: HTMLElement): boolean {
  const box = body.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) {
    return false;
  }
  if ((body.innerText ?? "").trim()) {
    return true;
  }
  if (
    body.querySelector(
      "img,svg,canvas,video,picture,input,button,textarea,select,iframe"
    )
  ) {
    return true;
  }
  return elementsOf(body).some((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      (style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        style.backgroundImage !== "none" ||
        Number.parseFloat(style.borderTopWidth) > 0 ||
        style.boxShadow !== "none")
    );
  });
}

/** A body's first words, at most 80 characters, on one line. */
export const firstWords = (body: HTMLElement): string =>
  (body.innerText ?? "").replaceAll(/\s+/gu, " ").trim().slice(0, 80);

/** The most elements a frame's look reads; past it the frame has none. Ours: well past a whole settings page. */
const LOOK_LIMIT = 6000;

/** What a reading of the engine can't see the picture of: moving pictures, a page of its own. A 2D canvas is read by its pixels ({@link canvasPixels}). */
const UNREAD_LOOK = "video, iframe, object, embed";
/** The largest canvas whose pixels a look reads, px². Ours: a few avatars' worth, read in well under a frame. */
const CANVAS_READ = 250_000;

const SPACE_RUN = /\s+/gu;

/** A long text as a short key: its length and two FNV-1a hashes of it, one seeded, so two looks match only when their texts do. */
const hashed = (text: string): string =>
  `${text.length.toString(36)}-${fnv1a(text).toString(36)}-${fnv1a(`~${text}`).toString(36)}`;

/** An element's own words: its text nodes, white space run together. */
const ownText = (el: Element): string =>
  [...el.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => (node.textContent ?? "").replace(SPACE_RUN, " ").trim())
    .join("|");

/**
 * A canvas's picture as a key: its 2D pixels' data URL, hashed. Null when
 * it can't be read so (a WebGL or bitmap canvas, which `getContext("2d")`
 * answers null for; a tainted one; one past {@link CANVAS_READ}).
 */
function canvasPixels(canvas: HTMLCanvasElement): string | null {
  if (canvas.width * canvas.height > CANVAS_READ || !canvas.getContext("2d")) {
    return null;
  }
  try {
    return hashed(canvas.toDataURL());
  } catch {
    return null;
  }
}

/** A form control's state its attributes don't carry: the value typed or set, checked, the option picked. */
function controlState(el: Element): string {
  if (el instanceof HTMLInputElement) {
    return `${el.value}|${el.checked}|${el.indeterminate}`;
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el instanceof HTMLSelectElement ? String(el.selectedIndex) : "";
}

/**
 * A frame's look (core `FrameRender.look`): a fingerprint of every element
 * of `body` (its tag, its attributes with each id written as its place
 * among the frame's ids, so a mount's own ids match, its own words, a
 * control's state, a 2D canvas's pixels, its scroll and its box in the
 * frame's own px). Null when it holds what the engine can't read the
 * picture of, or more elements than {@link LOOK_LIMIT}.
 */
export function lookOf(body: HTMLElement): string | null {
  const elements = [...body.querySelectorAll("*")];
  if (
    elements.length > LOOK_LIMIT ||
    body.querySelector(UNREAD_LOOK) ||
    elements.some(
      (el) =>
        el.shadowRoot ||
        (el.localName.includes("-") && customElements.get(el.localName))
    )
  ) {
    return null;
  }
  const pixels = new Map<Element, string>();
  for (const canvas of body.querySelectorAll("canvas")) {
    const read = canvasPixels(canvas);
    if (read === null) {
      return null;
    }
    pixels.set(canvas, read);
  }
  const frame = body.getBoundingClientRect();
  const scale = body.offsetWidth > 0 ? frame.width / body.offsetWidth : 0;
  if (scale <= 0) {
    return null;
  }
  const ids = new Map(
    elements
      .filter((el) => el.id)
      .map((el, place) => [el.id, `#${place}`] as const)
  );
  const withIds = (value: string) =>
    value
      .split(" ")
      .map((token) => ids.get(token) ?? token)
      .join(" ");
  const lineOf = (el: Element) => {
    const box = el.getBoundingClientRect();
    const attributes = [...el.attributes]
      .map((one) => `${one.name}=${withIds(one.value)}`)
      .sort()
      .join(" ");
    return [
      el.localName,
      attributes,
      ownText(el),
      controlState(el),
      pixels.get(el) ?? "",
      `${el.scrollTop},${el.scrollLeft}`,
      // A box-less element (`display: contents`, `none`) paints nothing of its own; where the engine puts its empty box is no part of the picture.
      box.width === 0 && box.height === 0
        ? "-"
        : [box.left - frame.left, box.top - frame.top, box.width, box.height]
            .map((px) => Math.round(px / scale))
            .join(","),
    ].join("\u0001");
  };
  return hashed([body, ...elements].map(lineOf).join("\u0002"));
}

/** The properties a forced state's delta reads. Ours: what a hover, ring or press changes. */
const WATCHED = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-width",
  "border-radius",
  "box-shadow",
  "outline-color",
  "outline-style",
  "outline-width",
  "outline-offset",
  "opacity",
  "transform",
  "scale",
  "translate",
  "rotate",
  "filter",
  "text-decoration-line",
  "text-decoration-color",
  "width",
  "height",
  "visibility",
] as const;

export type Snapshot = Map<Element, string[]>;

/** Each element's watched computed values, now. */
export function snapshot(body: Element): Snapshot {
  const taken: Snapshot = new Map();
  for (const el of elementsOf(body)) {
    const style = getComputedStyle(el);
    taken.set(
      el,
      WATCHED.map((name) => style.getPropertyValue(name))
    );
  }
  return taken;
}

/** The deltas between two snapshots of the same elements: at most this many elements. */
const DELTAS_KEPT = 24;

export function deltaOf(
  before: Snapshot,
  after: Snapshot,
  root: string
): { changed: StyleDelta[]; more: number } {
  const deltas: StyleDelta[] = [];
  let more = 0;
  for (const [el, was] of before) {
    const now = after.get(el);
    if (!now) {
      continue;
    }
    const changed: Record<string, [string, string]> = {};
    WATCHED.forEach((name, at) => {
      const from = was[at];
      const to = now[at];
      if (from !== to && from !== undefined && to !== undefined) {
        changed[name] = [from, to];
      }
    });
    if (Object.keys(changed).length > 0) {
      if (deltas.length >= DELTAS_KEPT) {
        more += 1;
        continue;
      }
      deltas.push({
        selector: describe(el),
        source: sourceOf(el, root),
        changed,
      });
    }
  }
  return { changed: deltas, more };
}

/** A computed list property split at its top-level commas (`cubic-bezier(…)` keeps its own). */
const listOf = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < value.length; at += 1) {
    const c = value[at];
    depth += Number(c === "(") - Number(c === ")");
    if (c === "," && depth === 0) {
      parts.push(value.slice(from, at).trim());
      from = at + 1;
    }
  }
  parts.push(value.slice(from).trim());
  return parts.filter(Boolean);
};

/** A CSS time (`0.3s`, `300ms`) in ms. */
const msOf = (time: string): number =>
  time.endsWith("ms")
    ? Number.parseFloat(time)
    : (Number.parseFloat(time) || 0) * 1000;

/** The `at`th entry of a CSS list, repeated as the list repeats to the names' length (CSS Animations, Transitions). */
const nth = (list: string[], at: number): string =>
  list[at % list.length] ?? "";

/** One transition or keyframes run an element declares: the property it transitions (`all` for every one) or the keyframes it names, with its timing. */
interface Run {
  delay: number;
  duration: number;
  easing: string;
  name: string;
}

/**
 * An element's motion as its computed style declares it: the transitions
 * that run (a duration past 0, a property named) and the keyframes it
 * names. A transition of no duration runs nothing, and every element
 * declares one (`all 0s`, the initial value), so none is kept.
 */
interface ElementMotion {
  animations: Run[];
  transitions: Run[];
}
/** Each element of a body that declares motion; one that declares none is left out. */
export type Motion = Map<Element, ElementMotion>;

/** The transitions `style` runs: its timing lists read only when one of its durations is past 0. */
function transitionsOf(style: CSSStyleDeclaration): Run[] {
  const durations = listOf(style.transitionDuration);
  if (!durations.some((one) => msOf(one) > 0)) {
    return [];
  }
  const delays = listOf(style.transitionDelay);
  const easings = listOf(style.transitionTimingFunction);
  return listOf(style.transitionProperty).flatMap((name, at) => {
    const duration = msOf(nth(durations, at));
    return duration > 0 && name !== "none"
      ? [
          {
            name,
            duration,
            delay: msOf(nth(delays, at)),
            easing: nth(easings, at) || "ease",
          },
        ]
      : [];
  });
}

/** The keyframes `style` names: its timing lists read only when it names one. */
function animationsOf(style: CSSStyleDeclaration): Run[] {
  const names = listOf(style.animationName);
  if (names.every((one) => one === "none")) {
    return [];
  }
  const durations = listOf(style.animationDuration);
  const delays = listOf(style.animationDelay);
  const easings = listOf(style.animationTimingFunction);
  return names.flatMap((name, at) =>
    name === "none"
      ? []
      : [
          {
            name,
            duration: msOf(nth(durations, at)),
            delay: msOf(nth(delays, at)),
            easing: nth(easings, at) || "ease",
          },
        ]
  );
}

export function motionOf(body: Element): Motion {
  const motion: Motion = new Map();
  for (const el of elementsOf(body)) {
    const style = getComputedStyle(el);
    const transitions = transitionsOf(style);
    const animations = animationsOf(style);
    if (transitions.length > 0 || animations.length > 0) {
      motion.set(el, { transitions, animations });
    }
  }
  return motion;
}

/** The keyframes each element of a body names, by element; one that names none is left out. */
export type Named = Map<Element, Set<string>>;

/** What a body's elements name of keyframes now: a state's motion is read against them (a name already running fires nothing new). */
export function namedOf(body: Element): Named {
  const named: Named = new Map();
  for (const el of elementsOf(body)) {
    const names = listOf(getComputedStyle(el).animationName).filter(
      (one) => one !== "none"
    );
    if (names.length > 0) {
      named.set(el, new Set(names));
    }
  }
  return named;
}

/** The properties a transition runs on by name (`all` stands for every watched one). */
const runOn = (run: Run): readonly string[] =>
  run.name === "all" ? WATCHED : [run.name];

/** Each element's value of every property it transitions, now: what a state's change is read from. */
export type Values = Map<Element, Map<string, string>>;

/** Each element's value now of every property a transition of `motions` runs on (an element in several, each property once). */
export function valuesOf(...motions: Motion[]): Values {
  const names = new Map<Element, Set<string>>();
  for (const motion of motions) {
    for (const [el, { transitions }] of motion) {
      const own = names.get(el) ?? new Set<string>();
      names.set(el, own);
      for (const run of transitions) {
        for (const name of runOn(run)) {
          own.add(name);
        }
      }
    }
  }
  const values: Values = new Map();
  for (const [el, own] of names) {
    if (own.size === 0) {
      continue;
    }
    const style = getComputedStyle(el);
    values.set(
      el,
      new Map([...own].map((name) => [name, style.getPropertyValue(name)]))
    );
  }
  return values;
}

/**
 * What a state fires, read from computed style alone, never from the
 * engine's animation list: a transition for each property an element
 * transitions (a duration past 0) whose value the state changed, and a CSS
 * animation for each keyframes name the state adds to an element (one it
 * named at rest, `named`, is no new run). A probe forces a state by its
 * class, so no script hears it, and what it fires is CSS's: its declared
 * motion is all of it.
 */
export function firedBetween(
  named: Named,
  forced: Motion,
  before: Values,
  after: Values
): AnimationRead[] {
  const fired: AnimationRead[] = [];
  for (const [el, { transitions, animations }] of forced) {
    for (const run of transitions) {
      for (const property of runOn(run)) {
        const was = before.get(el)?.get(property);
        const now = after.get(el)?.get(property);
        if (was !== undefined && now !== undefined && was !== now) {
          fired.push({
            kind: "transition",
            property,
            duration: run.duration,
            delay: run.delay,
            easing: run.easing,
            start: 0,
            target: describe(el),
          });
        }
      }
    }
    const had = named.get(el);
    for (const run of animations) {
      if (had?.has(run.name)) {
        continue;
      }
      fired.push({
        kind: "animation",
        property: run.name,
        duration: run.duration,
        delay: run.delay,
        easing: run.easing,
        start: 0,
        target: describe(el),
      });
    }
  }
  return fired;
}

/** The keyframe effect an animation runs; null where it runs another kind of effect (or none). */
export const keyframeEffectOf = (
  animation: Animation
): KeyframeEffect | null =>
  animation.effect instanceof KeyframeEffect ? animation.effect : null;

/** One animation as the report says it: its kind, property, timing, element and when it began after `t0`. */
export function readAnimation(animation: Animation, t0: number): AnimationRead {
  const effect = keyframeEffectOf(animation);
  const timing = effect?.getComputedTiming();
  let kind: AnimationRead["kind"] = "web";
  let property = "";
  if (
    typeof CSSTransition !== "undefined" &&
    animation instanceof CSSTransition
  ) {
    kind = "transition";
    property = animation.transitionProperty;
  } else if (
    typeof CSSAnimation !== "undefined" &&
    animation instanceof CSSAnimation
  ) {
    kind = "animation";
    property = animation.animationName;
  } else {
    const keys = new Set<string>();
    for (const frame of effect?.getKeyframes() ?? []) {
      for (const key of Object.keys(frame)) {
        if (
          !["offset", "computedOffset", "easing", "composite"].includes(key)
        ) {
          keys.add(key);
        }
      }
    }
    property = [...keys].join(" ");
  }
  const started =
    typeof animation.startTime === "number" ? animation.startTime : t0;
  return {
    kind,
    property,
    duration: Number(timing?.duration) || 0,
    delay: Number(timing?.delay) || 0,
    easing: effect?.getTiming().easing ?? "linear",
    start: Math.max(0, Math.round(started - t0)),
    target: describe(effect?.target ?? null),
  };
}

/** A thrown value as the report says it: its message and, from its stack, the first place in the project's code. */
export function pageError(
  error: unknown,
  root: string,
  base: string
): PageError {
  // Its first line: a framework's own trail ("in <unknown>") is not the message.
  // A module it names at the stage's key, or with Vite's stamp ("The requested module '/@cawco/m/<key>/src/x.ts?t=…' does not provide …"), is named by its own address.
  const first =
    (error instanceof Error ? error.message : String(error ?? "error")).split(
      "\n"
    )[0] ?? "";
  const message = cutShort(
    first.replace(KEYED_PREFIX, "").replace(VITE_STAMP, "").trim(),
    300
  );
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  for (const frame of stack.split("\n")) {
    const at = frame.match(STACK_PLACE);
    if (!at) {
      continue;
    }
    let path: string;
    let line = Number(at[2]);
    let column = Number(at[3]);
    try {
      // A module the stage keyed at its generation is named by its own address.
      path = unkeyedPath(new URL(at[1] ?? "").pathname);
    } catch {
      continue;
    }
    // A story runner's code, at its place in the client code the stage's map reads.
    const placed = ownPlace(path, line, column);
    if (placed) {
      ({ path, line, column } = placed);
    }
    if (
      path.includes("/node_modules/") ||
      path.includes("/@id/") ||
      path.includes("/@vite/")
    ) {
      continue;
    }
    const file = path.startsWith("/@fs/")
      ? fromRoot(path.slice("/@fs".length), root)
      : path.slice(base.length).replace(LEADING_SLASH, "");
    return { message, file, line, column };
  }
  return { message, file: null, line: null, column: null };
}
const STACK_PLACE = /(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/u;
/** A keyed module's prefix in a message: `/@cawco/m/<key>`, before the module's own address. */
const KEYED_PREFIX = new RegExp(`${MODULES_PATH}[^/\\s'"]+`, "gu");
/** Vite's stamp on a quoted module address, closing it: an HMR update's `?t=<ms>`, a pre-bundle's `?v=<its hash>`. */
const VITE_STAMP = /\?[tv]=[\w-]+(?=['"])/gu;
const LEADING_SLASH = /^\//u;
