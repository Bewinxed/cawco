/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

/**
 * The choices bridge (§5.7 of the Projects spec), part of the overlay CawCo
 * injects into every preview. A page marks its choices in HTML, or calls the
 * same things from script:
 *
 * ```html
 * <div data-cawco-choice="hero">
 *   <button data-option="a">Calm</button><button data-option="b">Bold</button>
 * </div>
 * <article data-cawco-choice="layout" data-option="grid">…</article>
 * <div data-cawco-choice="tags" data-cawco-multi>…</div>   (several picks)
 * <textarea data-cawco-note="hero"></textarea>
 * ```
 *
 * ```js
 * cawco.choose("hero", "b");            // null clears; an array for several
 * cawco.note("hero", "Less shouty");
 * cawco.set("dials", { density: 0.4 }); // any JSON, bounded
 * cawco.on("picks", (choices) => …);    // now, and on every change
 * cawco.send("Done for today");         // one message to the session
 * ```
 *
 * Each call goes to the pane (the page's parent) as an MCP Apps method:
 * picks, notes and dials as `ui/update-model-context`, a send as
 * `ui/message`. The pane checks every field (`@cawco/core/choices`) before
 * the hub keeps it, and posts the stored picks back as `cawco:picks`. A
 * picked option carries `data-cawco-picked` and `aria-pressed` (or
 * `aria-checked` on a radio) so the page styles it with CSS alone.
 */
import {
  CHOICE_METHODS,
  CHOICE_NOTE_MAX,
  CHOICE_SEND_TEXT_MAX,
  type ChoiceOp,
  choiceOp,
} from "@cawco/core/choices";

interface Pick {
  id: string;
  note: string | null;
  option: string | null;
  options: string[] | null;
}

interface Choices {
  dials: Record<string, unknown>;
  picks: Pick[];
}

type Listener = (choices: Choices) => void;

const CHOICE = "data-cawco-choice";
const OPTION = "data-option";
const NOTE = "data-cawco-note";
const NOTE_WAIT_MS = 600;

let state: Choices = { picks: [], dials: {} };
let heard = false;
const listeners = {
  picks: new Set<Listener>(),
  sent: new Set<Listener>(),
};

const copy = (value: Choices): Choices =>
  JSON.parse(JSON.stringify(value)) as Choices;

/** The choice an option element belongs to: its own id, or its group's. */
const choiceOf = (el: Element): Element | null =>
  el.hasAttribute(CHOICE)
    ? el
    : (el.parentElement?.closest(`[${CHOICE}]`) ?? null);

const pickOf = (id: string): Pick | undefined =>
  state.picks.find((pick) => pick.id === id);

const isPicked = (id: string, option: string): boolean => {
  const pick = pickOf(id);
  return pick?.options
    ? pick.options.includes(option)
    : pick?.option === option;
};

/** Marks every option on the page as the picks say, and fills the notes. */
function mark() {
  for (const el of document.querySelectorAll(`[${OPTION}]`)) {
    const group = choiceOf(el);
    const id = group?.getAttribute(CHOICE);
    if (!id) {
      continue;
    }
    const on = isPicked(id, el.getAttribute(OPTION) ?? "");
    el.toggleAttribute("data-cawco-picked", on);
    if (el.getAttribute("role") === "radio") {
      el.setAttribute("aria-checked", String(on));
    } else if (
      el instanceof HTMLButtonElement ||
      el.getAttribute("role") === "button"
    ) {
      el.setAttribute("aria-pressed", String(on));
    }
  }
  for (const el of document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >(`input[${NOTE}], textarea[${NOTE}]`)) {
    if (document.activeElement !== el) {
      el.value = pickOf(el.getAttribute(NOTE) ?? "")?.note ?? "";
    }
  }
}

function emit(kind: keyof typeof listeners) {
  for (const listener of listeners[kind]) {
    try {
      listener(copy(state));
    } catch (error) {
      console.error("[cawco] a choices listener threw", error);
    }
  }
}

/** What the page did, applied here at once so the page answers before the hub does. */
function local(op: ChoiceOp) {
  if (op.op === "set") {
    if (op.value === null) {
      delete state.dials[op.key];
    } else {
      state.dials[op.key] = op.value;
    }
    return;
  }
  const pick = pickOf(op.id) ?? {
    id: op.id,
    option: null,
    options: null,
    note: null,
  };
  if (op.op === "note") {
    pick.note = op.text.trim() ? op.text : null;
  } else if ("options" in op) {
    pick.option = null;
    pick.options = op.options.length ? op.options : null;
  } else {
    pick.option = op.option;
    pick.options = null;
  }
  state.picks = [...state.picks.filter((p) => p.id !== op.id), pick];
}

export function startChoices(
  post: (type: string, payload: object) => void,
  selecting: () => boolean
) {
  const say = (raw: Record<string, unknown>) => {
    const op = choiceOp(raw);
    if (!op) {
      console.warn(
        "[cawco] a choice was not kept: its id, option or value is out of bounds",
        raw
      );
      return;
    }
    local(op);
    mark();
    emit("picks");
    post("cawco:choice", { method: CHOICE_METHODS[op.op], params: op });
  };

  const api = Object.freeze({
    version: 1,
    choose(id: string, option: string | string[] | null) {
      say(
        Array.isArray(option)
          ? { op: "choose", id, options: option }
          : { op: "choose", id, option }
      );
    },
    note(id: string, text: unknown) {
      say({
        op: "note",
        id,
        text: String(text ?? "").slice(0, CHOICE_NOTE_MAX),
      });
    },
    set(key: string, value: unknown) {
      say({ op: "set", key, value });
    },
    /** The picks as last known; empty until the hub has answered. */
    picks(): Choices {
      return copy(state);
    },
    on(kind: "picks" | "sent", listener: Listener): () => void {
      const set = listeners[kind];
      if (!set || typeof listener !== "function") {
        return () => undefined;
      }
      set.add(listener);
      if (kind === "picks" && heard) {
        listener(copy(state));
      }
      return () => set.delete(listener);
    },
    /**
     * Sends the picks to the session that made the page: one message. Only
     * from a press of the operator's (a page cannot send on its own).
     */
    send(text?: string): boolean {
      if (navigator.userActivation && !navigator.userActivation.isActive) {
        console.warn(
          "[cawco] cawco.send() needs a click or key press of the operator's"
        );
        return false;
      }
      post("cawco:send", {
        method: CHOICE_METHODS.send,
        params: {
          text:
            typeof text === "string" ? text.slice(0, CHOICE_SEND_TEXT_MAX) : "",
        },
      });
      return true;
    },
  });
  Object.defineProperty(window, "cawco", {
    value: api,
    configurable: false,
    writable: false,
  });

  // Clicks on marked options; the page's own handlers still run.
  window.addEventListener("click", (event) => {
    if (selecting() || !(event.target instanceof Element)) {
      return;
    }
    const el = event.target.closest(`[${OPTION}]`);
    const group = el && choiceOf(el);
    const id = group?.getAttribute(CHOICE);
    const option = el?.getAttribute(OPTION);
    if (!(el && group && id && option)) {
      return;
    }
    if (group.hasAttribute("data-cawco-multi")) {
      const now = pickOf(id)?.options ?? [];
      api.choose(
        id,
        now.includes(option)
          ? now.filter((o) => o !== option)
          : [...now, option]
      );
    } else {
      api.choose(id, isPicked(id, option) ? null : option);
    }
  });

  // An option that is not a button (a variant's figure with role="button")
  // picks on Enter and Space too, as a button would.
  window.addEventListener("keydown", (event) => {
    const el = event.target;
    if (
      selecting() ||
      (event.key !== "Enter" && event.key !== " ") ||
      !(el instanceof HTMLElement) ||
      !el.hasAttribute(OPTION) ||
      el instanceof HTMLButtonElement ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLAnchorElement
    ) {
      return;
    }
    event.preventDefault();
    el.click();
  });

  const waits = new Map<string, ReturnType<typeof setTimeout>>();
  window.addEventListener("input", (event) => {
    const el = event.target;
    if (
      !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
    ) {
      return;
    }
    const id = el.getAttribute(NOTE);
    if (!id) {
      return;
    }
    clearTimeout(waits.get(id));
    waits.set(
      id,
      setTimeout(() => {
        waits.delete(id);
        api.note(id, el.value);
      }, NOTE_WAIT_MS)
    );
  });

  // A page that draws its options after load is marked as they arrive.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mark, { once: true });
  }
}

/** The pane's word on the picks: what the hub keeps, or that a send went. */
export function receiveChoices(message: { type?: unknown; choices?: unknown }) {
  if (message.type === "cawco:sent") {
    emit("sent");
    return;
  }
  const raw = message.choices as Partial<Choices> | null | undefined;
  if (!(raw && Array.isArray(raw.picks))) {
    return;
  }
  state = {
    picks: raw.picks.map((pick) => ({
      id: String(pick.id),
      option: pick.option ?? null,
      options: pick.options ?? null,
      note: pick.note ?? null,
    })),
    dials: raw.dials && typeof raw.dials === "object" ? raw.dials : {},
  };
  heard = true;
  mark();
  emit("picks");
}
