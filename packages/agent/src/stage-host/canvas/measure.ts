/**
 * Reading a frame from the engine (the fleet's rule 6: state and geometry,
 * never the picture): whether it drew, its words, the component files its
 * elements came from, the computed-style delta a forced state makes, and the
 * animations a change fired, from `getAnimations()`.
 */
import type {
  AnimationRead,
  PageError,
  PartUse,
  StyleDelta,
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
const STAMPED = /^(.*):(\d+):(\d+):([\w.$-]+)$/;
const EXTENSION = /\.[^./]+$/;
const CAPITALISED = /^[A-Z]/;
const DIR = /^.*\//;
const HASH_CLASS = /^(?:svelte-|s-)[\w-]+$/;

/** A file from the toolchain root: a dev path made relative, its query dropped. */
export const fromRoot = (file: string, root: string): string => {
  const plain = file.split("?")[0] ?? file;
  return plain.startsWith(`${root}/`) ? plain.slice(root.length + 1) : plain;
};

const nameOfFile = (file: string): string =>
  file.replace(DIR, "").replace(EXTENSION, "");

/** An element as a selector a person reads: its tag, id and first two classes the project wrote. */
export function describe(el: Element | null): string {
  if (!el) {
    return "?";
  }
  const classes = [...el.classList]
    .filter((one) => !(HASH_CLASS.test(one) || one.startsWith("cawco-")))
    .slice(0, 2);
  return `${el.localName}${el.id ? `#${el.id}` : ""}${classes.map((one) => `.${one}`).join("")}`;
}

/** Where an element is written, `file:line:column`, when the dev build marks it. */
export function sourceOf(el: Element, root: string): string | null {
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
  (body.innerText ?? "").replaceAll(/\s+/g, " ").trim().slice(0, 80);

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
  const message = (
    error instanceof Error ? error.message : String(error ?? "error")
  )
    .split("\n")[0]
    ?.trim()
    .slice(0, 300) as string;
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  for (const line of stack.split("\n")) {
    const at = line.match(STACK_PLACE);
    if (!at) {
      continue;
    }
    let path: string;
    try {
      path = new URL(at[1] as string).pathname;
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
const STACK_PLACE = /(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/;
const LEADING_SLASH = /^\//;
