/**
 * What a story's `play` is handed on the canvas (CSF's play function,
 * storybook.js.org/docs/writing-stories/play-function): `update` changes the
 * live instance's props without a re-mount, so the component's own motion
 * plays; `userEvent` dispatches pointer and key events from script (a hover
 * also puts the rewrite's `.cawco-hover` on the element, since no script can
 * make the browser's own `:hover` match), and on a measuring page sends real
 * input instead (agent canvas real-input.ts); `canvas` finds elements in the
 * frame and the layers it opened by their words and roles, a small kin of
 * Testing Library's queries.
 */

import {
  computeAccessibleName,
  getRole,
  isInaccessible,
} from "dom-accessibility-api";

const settle = () =>
  new Promise<void>((done) => requestAnimationFrame(() => done()));

const POINTER = { bubbles: true, cancelable: true, composed: true } as const;

function pointer(el: Element, type: string): void {
  const box = el.getBoundingClientRect();
  const at = {
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  };
  if (type.startsWith("pointer")) {
    el.dispatchEvent(
      new PointerEvent(type, {
        ...POINTER,
        ...at,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: !(type === "pointerenter" || type === "pointerleave"),
      })
    );
  } else {
    el.dispatchEvent(
      new MouseEvent(type, {
        ...POINTER,
        ...at,
        bubbles: !(type === "mouseenter" || type === "mouseleave"),
      })
    );
  }
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export interface UserEvent {
  click: (el: Element) => Promise<void>;
  hover: (el: Element) => Promise<void>;
  keyboard: (key: string) => Promise<void>;
  tab: () => Promise<void>;
  type: (el: Element, text: string) => Promise<void>;
  unhover: (el: Element) => Promise<void>;
  wait: (ms: number) => Promise<void>;
}

/** Events made in script into a frame, its focus kept inside it: the person's browser's plays, which no DevTools Protocol reaches. */
export function userEventIn(frame: HTMLElement): UserEvent {
  const key = async (target: Element, name: string) => {
    for (const type of ["keydown", "keypress", "keyup"]) {
      target.dispatchEvent(new KeyboardEvent(type, { ...POINTER, key: name }));
    }
    await settle();
  };
  return {
    async hover(el) {
      for (const type of [
        "pointerover",
        "pointerenter",
        "mouseover",
        "mouseenter",
        "pointermove",
        "mousemove",
      ]) {
        pointer(el, type);
      }
      el.classList.add("cawco-hover");
      await settle();
    },
    async unhover(el) {
      el.classList.remove("cawco-hover", "cawco-active");
      for (const type of [
        "pointerout",
        "pointerleave",
        "mouseout",
        "mouseleave",
      ]) {
        pointer(el, type);
      }
      await settle();
    },
    async click(el) {
      await this.hover(el);
      pointer(el, "pointerdown");
      pointer(el, "mousedown");
      el.classList.add("cawco-active");
      if (el instanceof HTMLElement) {
        el.focus();
      }
      pointer(el, "pointerup");
      pointer(el, "mouseup");
      el.classList.remove("cawco-active");
      if (el instanceof HTMLElement) {
        el.click();
      }
      await settle();
    },
    async type(el, text) {
      if (el instanceof HTMLElement) {
        el.focus();
      }
      for (const char of text) {
        el.dispatchEvent(
          new KeyboardEvent("keydown", { ...POINTER, key: char })
        );
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          el.value += char;
          el.dispatchEvent(
            new InputEvent("input", {
              ...POINTER,
              data: char,
              inputType: "insertText",
            })
          );
        }
        el.dispatchEvent(new KeyboardEvent("keyup", { ...POINTER, key: char }));
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    },
    keyboard: (name) => {
      const active = document.activeElement;
      return key(active && frame.contains(active) ? active : frame, name);
    },
    async tab() {
      const all = [...frame.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const active = document.activeElement;
      const at = active instanceof HTMLElement ? all.indexOf(active) : -1;
      all[(at + 1) % Math.max(1, all.length)]?.focus();
      await settle();
    },
    wait: (ms) => new Promise((done) => setTimeout(done, ms)),
  };
}

/** An element's rendered text (`innerText`), when it is an HTML element; else undefined. */
const renderedText = (el: Element): string | undefined =>
  "innerText" in el && typeof el.innerText === "string"
    ? el.innerText
    : undefined;

const matches = (text: string, want: string | RegExp): boolean =>
  typeof want === "string" ? text.trim() === want.trim() : want.test(text);

const WHITESPACE = /\s+/gu;

/** An element as a refusal lists it: its role, else its tag, and its name. */
export const elementSaid = (el: Element): string => {
  const name = nameOf(el).replace(WHITESPACE, " ");
  return `${roleOf(el) ?? el.localName}${name ? ` “${name.length > 40 ? `${name.slice(0, 39)}…` : name}”` : ""}`;
};

export interface CanvasQueries {
  getByRole: (role: string, options?: { name?: string | RegExp }) => Element;
  getByTestId: (id: string) => Element;
  getByText: (text: string | RegExp) => Element;
  queryAllByRole: (
    role: string,
    options?: { name?: string | RegExp }
  ) => Element[];
  queryAllByTestId: (id: string) => Element[];
  queryAllByText: (text: string | RegExp) => Element[];
  queryByRole: (
    role: string,
    options?: { name?: string | RegExp }
  ) => Element | null;
  queryByText: (text: string | RegExp) => Element | null;
  querySelector: (selector: string) => Element | null;
  querySelectorAll: (selector: string) => Element[];
}

/**
 * Whether `el` is in the accessibility tree: not inside an inert or
 * `aria-hidden` subtree, and rendered and visible. A role query skips the
 * rest, as Testing Library's `*ByRole` does by default: a layer built
 * ahead and kept shut (bits-ui's `forceMount`) holds options no one can
 * reach.
 */
const accessible = (el: Element): boolean =>
  el.closest('[inert], [aria-hidden="true"]') === null &&
  el.checkVisibility({ visibilityProperty: true });

const ARTICLED = /^[aeiou]/u;

/** Runs one query: as it stands, or marked as the stage's own work on a measuring page (agent canvas harness.ts). */
type QueryRun = <T>(query: () => T) => T;

/**
 * The frame's elements by their words, roles and test ids, with those of
 * the `layers` it opened outside itself (a popover's content portalled to
 * the body), searched after it: what a person sees of the drawing. A
 * `getBy` that finds none throws, as Testing Library's does, and takes the
 * first of several. Each query runs through `run`.
 */
export function queriesIn(
  frame: HTMLElement,
  layers: () => readonly HTMLElement[] = () => [],
  run: QueryRun = (query) => query()
): CanvasQueries {
  const roots = () => [frame, ...layers()];
  const all = () => roots().flatMap((root) => [...root.querySelectorAll("*")]);
  const allByText = (want: string | RegExp) =>
    all().filter(
      (el) =>
        [...el.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            matches(node.textContent ?? "", want)
        ) ||
        (matches(renderedText(el) ?? "", want) && el.children.length === 0)
    );
  const allByRole = (role: string, options?: { name?: string | RegExp }) =>
    all().filter(
      (el) =>
        roleOf(el) === role &&
        (options?.name === undefined || matches(nameOf(el), options.name)) &&
        accessible(el)
    );
  const allByTestId = (id: string) =>
    roots().flatMap((root) => [
      ...root.querySelectorAll(`[data-testid="${CSS.escape(id)}"]`),
    ]);
  const byText = (want: string | RegExp) => allByText(want)[0] ?? null;
  const byRole = (role: string, options?: { name?: string | RegExp }) =>
    allByRole(role, options)[0] ?? null;
  const found = <T>(value: T | null, what: string): T => {
    if (value === null) {
      throw new Error(
        `Nothing in the frame or the layers it opened is ${what}.`
      );
    }
    return value;
  };
  return {
    queryAllByText: (text) => run(() => allByText(text)),
    queryAllByRole: (role, options) => run(() => allByRole(role, options)),
    queryAllByTestId: (id) => run(() => allByTestId(id)),
    queryByText: (text) => run(() => byText(text)),
    getByText: (text) =>
      found(
        run(() => byText(text)),
        `the text ${String(text)}`
      ),
    queryByRole: (role, options) => run(() => byRole(role, options)),
    getByRole: (role, options) =>
      found(
        run(() => byRole(role, options)),
        `${ARTICLED.test(role) ? "an" : "a"} ${role}${options?.name ? ` named ${String(options.name)}` : ""}`
      ),
    getByTestId: (id) =>
      found(
        run(() => allByTestId(id)[0] ?? null),
        `test id ${id}`
      ),
    querySelector: (selector) =>
      run(
        () =>
          roots()
            .map((root) => root.querySelector(selector))
            .find((one) => one !== null) ?? null
      ),
    querySelectorAll: (selector) =>
      run(() =>
        roots().flatMap((root) => [...root.querySelectorAll(selector)])
      ),
  };
}
