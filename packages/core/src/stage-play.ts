/**
 * What a story's `play` is handed on the canvas (CSF's play function,
 * storybook.js.org/docs/writing-stories/play-function): `update` changes the
 * live instance's props without a re-mount, so the component's own motion
 * plays; `userEvent` dispatches real pointer and key events (a hover also
 * puts the rewrite's `.cawco-hover` on the element, since no script can make
 * the browser's own `:hover` match); `canvas` finds elements in the frame
 * by their words and roles, a small kin of Testing Library's queries.
 */

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

const HEADING = /^h[1-6]$/u;
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

/** Real events into a frame, its focus kept inside it. */
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
    keyboard: (name) =>
      key(
        frame.contains(document.activeElement)
          ? (document.activeElement as Element)
          : frame,
        name
      ),
    async tab() {
      const all = [...frame.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const at = all.indexOf(document.activeElement as HTMLElement);
      all[(at + 1) % Math.max(1, all.length)]?.focus();
      await settle();
    },
    wait: (ms) => new Promise((done) => setTimeout(done, ms)),
  };
}

/** The implicit ARIA role of the elements a story most often asks by. */
function roleOf(el: Element): string | null {
  const own = el.getAttribute("role");
  if (own) {
    return own;
  }
  const tag = el.localName;
  if (
    tag === "button" ||
    (tag === "input" &&
      ["button", "submit", "reset"].includes((el as HTMLInputElement).type))
  ) {
    return "button";
  }
  if (tag === "a" && el.hasAttribute("href")) {
    return "link";
  }
  if (tag === "input") {
    const { type } = el as HTMLInputElement;
    return type === "checkbox" || type === "radio" ? type : "textbox";
  }
  if (tag === "textarea") {
    return "textbox";
  }
  if (HEADING.test(tag)) {
    return "heading";
  }
  if (tag === "img") {
    return "img";
  }
  return tag === "select" ? "combobox" : null;
}

const nameOf = (el: Element): string =>
  (
    el.getAttribute("aria-label") ??
    el.getAttribute("alt") ??
    (el as HTMLElement).innerText ??
    el.textContent ??
    ""
  ).trim();

const matches = (text: string, want: string | RegExp): boolean =>
  typeof want === "string" ? text.trim() === want.trim() : want.test(text);

export interface CanvasQueries {
  getByRole: (role: string, options?: { name?: string | RegExp }) => Element;
  getByTestId: (id: string) => Element;
  getByText: (text: string | RegExp) => Element;
  queryByRole: (
    role: string,
    options?: { name?: string | RegExp }
  ) => Element | null;
  queryByText: (text: string | RegExp) => Element | null;
  querySelector: (selector: string) => Element | null;
  querySelectorAll: (selector: string) => Element[];
}

/** The frame's elements by their words, roles and test ids; a `getBy` that finds none throws, as Testing Library's does. */
export function queriesIn(frame: HTMLElement): CanvasQueries {
  const all = () => [...frame.querySelectorAll("*")];
  const byText = (want: string | RegExp) =>
    all().find(
      (el) =>
        [...el.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            matches(node.textContent ?? "", want)
        ) ||
        (matches((el as HTMLElement).innerText ?? "", want) &&
          el.children.length === 0)
    ) ?? null;
  const byRole = (role: string, options?: { name?: string | RegExp }) =>
    all().find(
      (el) =>
        roleOf(el) === role &&
        (options?.name === undefined || matches(nameOf(el), options.name))
    ) ?? null;
  const found = <T>(value: T | null, what: string): T => {
    if (value === null) {
      throw new Error(`Nothing in the frame is ${what}.`);
    }
    return value;
  };
  return {
    queryByText: byText,
    getByText: (text) => found(byText(text), `the text ${String(text)}`),
    queryByRole: byRole,
    getByRole: (role, options) =>
      found(
        byRole(role, options),
        `a ${role}${options?.name ? ` named ${String(options.name)}` : ""}`
      ),
    getByTestId: (id) =>
      found(
        frame.querySelector(`[data-testid="${CSS.escape(id)}"]`),
        `test id ${id}`
      ),
    querySelector: (selector) => frame.querySelector(selector),
    querySelectorAll: (selector) => [...frame.querySelectorAll(selector)],
  };
}
