/// <reference lib="dom" />

/**
 * Every field of a page is state (Projects spec §5.10): each `input`,
 * `select`, `textarea` and `[contenteditable]` with a `name` or an `id` is
 * kept in the artifact's `state` under that name, in the entry shape a
 * choice has. A radio group, a set of checkboxes and a select keep the
 * values picked as `options`; the rest keep their text as `value`. Typing
 * is written once it pauses ({@link TYPING_MS}); a `change` is written at
 * once. Fields are filled from the doc when the page loads, after a morph,
 * and when another view or the agent changes them, except the one being
 * typed in.
 *
 * Passwords, files, hidden inputs and buttons are not kept: they are not
 * answers, and a password is never the agent's to read.
 */
import type { ChoiceEntry } from "@cawco/core/choices";

const FIELDS = "input, select, textarea, [contenteditable]";

/** Inputs that are not an answer to keep. Our call. */
const UNKEPT = new Set([
  "button",
  "file",
  "hidden",
  "image",
  "password",
  "reset",
  "submit",
]);

/** How long typing pauses before it is written: the brief's 300 ms. */
const TYPING_MS = 300;

type Kept = { options: string[] } | { value: string };

const isChoice = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement &&
  (el.type === "radio" || el.type === "checkbox");

/** A field typed into: its text is the person's while it has focus. */
const isText = (el: Element): boolean =>
  !(isChoice(el) || el instanceof HTMLSelectElement);

/** The key a field is kept under, or null when it is not kept. */
function keyOf(el: Element): string | null {
  if (!el.matches(FIELDS)) {
    return null;
  }
  if (el instanceof HTMLInputElement && UNKEPT.has(el.type)) {
    return null;
  }
  const control =
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement;
  if (!(control || (el as HTMLElement).isContentEditable)) {
    return null;
  }
  return el.getAttribute("name") || el.id || null;
}

/** The radios or checkboxes that answer together: the same name, or the one alone. */
const groupOf = (el: HTMLInputElement): HTMLInputElement[] =>
  el.name
    ? [
        ...document.querySelectorAll<HTMLInputElement>(
          `input[type="${el.type}"][name="${CSS.escape(el.name)}"]`
        ),
      ]
    : [el];

/** What a field holds now, as its entry keeps it. */
function keptOf(el: Element): Kept {
  if (isChoice(el)) {
    return {
      options: groupOf(el)
        .filter((one) => one.checked)
        .map((one) => one.value),
    };
  }
  if (el instanceof HTMLSelectElement) {
    return { options: [...el.selectedOptions].map((option) => option.value) };
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return { value: el.value };
  }
  return { value: el.textContent ?? "" };
}

/** The text an entry's value is in a field; null when it is not text. */
const textOf = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : null;
};

/** Sets one field from its entry. */
function fill(el: Element, entry: ChoiceEntry) {
  if (isChoice(el)) {
    el.checked = entry.options.includes(el.value);
    return;
  }
  if (el instanceof HTMLSelectElement) {
    for (const option of el.options) {
      option.selected = entry.options.includes(option.value);
    }
    return;
  }
  const text = textOf(entry.value);
  if (text === null) {
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.value !== text) {
      el.value = text;
    }
  } else if (el.textContent !== text) {
    el.textContent = text;
  }
}

/** Typing waiting for its pause, by key. */
const typing = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Fills every kept field from `state` (only those at `keys` when given),
 * leaving alone the one being typed in and any whose typing is not yet
 * written.
 */
export function fillFields(
  state: Record<string, ChoiceEntry>,
  keys: Set<string> | null = null
) {
  const active = document.activeElement;
  for (const el of document.querySelectorAll(FIELDS)) {
    const key = keyOf(el);
    const entry = key === null ? undefined : state[key];
    if (
      !(key && entry) ||
      (keys && !keys.has(key)) ||
      typing.has(key) ||
      (el === active && isText(el))
    ) {
      continue;
    }
    fill(el, entry);
  }
}

/** Starts keeping every field's changes, each handed to `write` with what the field holds. */
export function trackFields(
  write: (key: string, kept: Kept, el: Element) => void
) {
  const now = (el: Element, key: string) => {
    clearTimeout(typing.get(key));
    typing.delete(key);
    write(key, keptOf(el), el);
  };
  window.addEventListener(
    "input",
    (event) => {
      const el = event.target;
      if (!(el instanceof Element)) {
        return;
      }
      const key = keyOf(el);
      // A pick's `change` follows its `input` at once and writes it.
      if (!key || isChoice(el) || el instanceof HTMLSelectElement) {
        return;
      }
      clearTimeout(typing.get(key));
      typing.set(
        key,
        setTimeout(() => now(el, key), TYPING_MS)
      );
    },
    true
  );
  window.addEventListener(
    "change",
    (event) => {
      const el = event.target;
      const key = el instanceof Element ? keyOf(el) : null;
      if (el instanceof Element && key) {
        now(el, key);
      }
    },
    true
  );
}
