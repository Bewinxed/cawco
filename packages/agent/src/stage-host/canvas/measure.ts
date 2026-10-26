/**
 * Reading a frame from the engine (the fleet's rule 6: state and geometry,
 * never the picture): whether it drew, its words, the component files its
 * elements came from, the computed-style delta a forced state makes, and the
 * animations a change fired, from `getAnimations()`.
 */
import {
  type AnimationRead,
  MODULES_PATH,
  type PageError,
  type PartUse,
  type StyleDelta,
  unkeyedPath,
} from "@cawco/core/stage";

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
type DevElement = Element & { __svelte_meta?: SvelteMeta };

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
  const meta = (el as DevElement).__svelte_meta?.loc;
  if (meta) {
    return `${fromRoot(meta.file, root)}:${meta.line}:${meta.column + 1}`;
  }
  const stamp = el.getAttribute("data-insp-path")?.match(STAMPED);
  return stamp
    ? `${fromRoot(stamp[1] as string, root)}:${stamp[2]}:${stamp[3]}`
    : null;
}

/** The elements of a frame's body a reading walks: at most this many. Ours: a screen's first screenful. */
const ELEMENTS_READ = 600;

const elementsOf = (body: Element): Element[] =>
  [...body.querySelectorAll("*")].slice(0, ELEMENTS_READ);

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
    const meta = (el as DevElement).__svelte_meta;
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
    if (stamp) {
      const [, file, line, column, tag] = stamp as unknown as string[];
      if (CAPITALISED.test(tag as string)) {
        add(
          file as string,
          tag as string,
          `${fromRoot(file as string, root)}:${line}:${column}`
        );
      } else {
        add(file as string, nameOfFile(file as string), null);
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
): StyleDelta[] {
  const deltas: StyleDelta[] = [];
  for (const [el, was] of before) {
    const now = after.get(el);
    if (!now) {
      continue;
    }
    const changed: Record<string, [string, string]> = {};
    WATCHED.forEach((name, at) => {
      if (was[at] !== now[at]) {
        changed[name] = [was[at] as string, now[at] as string];
      }
    });
    if (Object.keys(changed).length > 0) {
      deltas.push({
        selector: describe(el),
        source: sourceOf(el, root),
        changed,
      });
      if (deltas.length >= DELTAS_KEPT) {
        break;
      }
    }
  }
  return deltas;
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
  list.length === 0 ? "" : (list[at % list.length] as string);

/** An element's motion as its computed style declares it: the properties it transitions and the keyframes it runs, each with its timing. */
interface ElementMotion {
  animation: {
    delay: string[];
    duration: string[];
    easing: string[];
    name: string[];
  };
  transition: {
    delay: string[];
    duration: string[];
    easing: string[];
    property: string[];
  };
}
export type Motion = Map<Element, ElementMotion>;

export function motionOf(body: Element): Motion {
  const motion: Motion = new Map();
  for (const el of elementsOf(body)) {
    const style = getComputedStyle(el);
    motion.set(el, {
      transition: {
        property: listOf(style.transitionProperty),
        duration: listOf(style.transitionDuration),
        delay: listOf(style.transitionDelay),
        easing: listOf(style.transitionTimingFunction),
      },
      animation: {
        name: listOf(style.animationName),
        duration: listOf(style.animationDuration),
        delay: listOf(style.animationDelay),
        easing: listOf(style.animationTimingFunction),
      },
    });
  }
  return motion;
}

/** The properties an element transitions by name (`all` stands for every watched one). */
const transitioned = (lists: ElementMotion): string[] =>
  lists.transition.property.flatMap((one) => {
    if (one === "all") {
      return [...WATCHED];
    }
    return one === "none" ? [] : [one];
  });

/** Each element's value of every property it transitions, now: what a state's change is read from. */
export type Values = Map<Element, Map<string, string>>;

export function valuesOf(motion: Motion): Values {
  const values: Values = new Map();
  for (const [el, lists] of motion) {
    const names = transitioned(lists);
    if (names.length === 0) {
      continue;
    }
    const style = getComputedStyle(el);
    values.set(
      el,
      new Map(names.map((name) => [name, style.getPropertyValue(name)]))
    );
  }
  return values;
}

/**
 * What a state fires, read from computed style alone, never from the
 * engine's animation list: a transition for each property an element
 * transitions (a duration past 0) whose value the state changed, and a CSS
 * animation for each keyframes name the state adds to an element. A probe
 * forces a state by its class, so no script hears it, and what it fires
 * is CSS's: its declared motion is all of it.
 */
export function firedBetween(
  rest: Motion,
  forced: Motion,
  before: Values,
  after: Values
): AnimationRead[] {
  const fired: AnimationRead[] = [];
  for (const [el, lists] of forced) {
    const { transition, animation } = lists;
    transition.property.forEach((named, at) => {
      const duration = msOf(nth(transition.duration, at));
      if (duration <= 0 || named === "none") {
        return;
      }
      const properties = named === "all" ? [...WATCHED] : [named];
      for (const property of properties) {
        const was = before.get(el)?.get(property);
        const now = after.get(el)?.get(property);
        if (was !== undefined && now !== undefined && was !== now) {
          fired.push({
            kind: "transition",
            property,
            duration,
            delay: msOf(nth(transition.delay, at)),
            easing: nth(transition.easing, at) || "ease",
            start: 0,
            target: describe(el),
          });
        }
      }
    });
    const had = new Set(rest.get(el)?.animation.name ?? []);
    animation.name.forEach((name, at) => {
      if (name === "none" || had.has(name)) {
        return;
      }
      fired.push({
        kind: "animation",
        property: name,
        duration: msOf(nth(animation.duration, at)),
        delay: msOf(nth(animation.delay, at)),
        easing: nth(animation.easing, at) || "ease",
        start: 0,
        target: describe(el),
      });
    });
  }
  return fired;
}

/** One animation as the report says it: its kind, property, timing, element and when it began after `t0`. */
export function readAnimation(animation: Animation, t0: number): AnimationRead {
  const effect = animation.effect as KeyframeEffect | null;
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
  const message = (
    error instanceof Error ? error.message : String(error ?? "error")
  )
    .split("\n")[0]
    ?.replace(KEYED_PREFIX, "")
    .replace(VITE_STAMP, "")
    .trim()
    .slice(0, 300) as string;
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  for (const line of stack.split("\n")) {
    const at = line.match(STACK_PLACE);
    if (!at) {
      continue;
    }
    let path: string;
    try {
      // A module the stage keyed at its generation is named by its own address.
      path = unkeyedPath(new URL(at[1] as string).pathname);
    } catch {
      continue;
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
    return { message, file, line: Number(at[2]), column: Number(at[3]) };
  }
  return { message, file: null, line: null, column: null };
}
const STACK_PLACE = /(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/u;
/** A keyed module's prefix in a message: `/@cawco/m/<key>`, before the module's own address. */
const KEYED_PREFIX = new RegExp(`${MODULES_PATH}[^/\\s'"]+`, "gu");
/** Vite's stamp on a quoted module address, closing it: an HMR update's `?t=<ms>`, a pre-bundle's `?v=<its hash>`. */
const VITE_STAMP = /\?[tv]=[\w-]+(?=['"])/gu;
const LEADING_SLASH = /^\//u;
