/**
 * Naming a session, a thread or a machine while writing (T2), on the
 * finder's own rows and ranking (find-rows.ts): the words after an "@"
 * keep narrowing through spaces; ↵ inserts a chip that reads as the title
 * and is sent as `@<title> <handle>` — `@<title> · <machine> <handle>` when
 * another candidate shares the title — which the hand-off resolver takes.
 *
 * Every candidate comes from the hub's names (never what this device holds),
 * the session being written in is never one, and a stored session the hub
 * never started (no handle) cannot be named.
 */
import {
  type FindAnswer,
  type FindKind,
  type FindResult,
  findNames,
} from "./find-client";
import { age, rowOf } from "./find-rows";
import type { Answer } from "./finder-state.svelte";

const SPACES = /\s+/;
const ENDS_IN_SPACE = /\s$/;

/** How many candidates the menu holds (the wireframe's "up to five"). */
export const MENU_ROWS = 5;

/** What @ offers without a kind word: what a message hands work to. */
const NAMED: FindKind[] = ["conversation", "thread", "machine"];
/** Kind words that widen it to things a message can point at (T7). */
const KIND_WORDS = new Set([
  "task",
  "tasks",
  "preview",
  "previews",
  "page",
  "decision",
  "decisions",
  "artifact",
  "routine",
  "commit",
  "file",
]);

export interface Chip {
  /** The handle the hub resolves. */
  handle: string;
  /** What the chip reads, in his words: the title, and what tells it apart when another shares it. */
  label: string;
  result: FindResult;
  /** Sent in the message. */
  serialised: string;
  /** Said on hover or press: the row's facts. */
  tip: string;
}

/** The fact that tells `result` apart from others with its title, as the row shows it. */
function apart(result: FindResult, twins: FindResult[], now: number): string {
  if (result.kind === "conversation") {
    const machines = twins.map((t) =>
      t.kind === "conversation" ? t.machine.name : ""
    );
    if (!machines.includes(result.machine.name)) {
      return result.machine.name;
    }
    const row = rowOf(result, now);
    const states = twins.map((t) => rowOf(t, now).state.word);
    if (!states.includes(row.state.word)) {
      return row.state.word;
    }
  }
  if (
    result.project &&
    !twins.some((t) => t.project?.id === result.project?.id)
  ) {
    return result.project.name;
  }
  return age(result.lastActivity, now);
}

/** The facts a chip says on hover or press: its row's state, meta and age. */
const tipOf = (result: FindResult, now: number): string => {
  const row = rowOf(result, now);
  return [row.state.word, ...row.meta, age(result.lastActivity, now)]
    .filter(Boolean)
    .join(" · ");
};

/** The chip `result` becomes, beside the other candidates it was chosen from. */
export function chipOf(
  result: FindResult,
  candidates: FindResult[],
  now: number
): Chip {
  const handle = result.handle as string;
  const title = result.title.trim();
  const twins = candidates.filter(
    (c) => c !== result && c.title.trim().toLowerCase() === title.toLowerCase()
  );
  const label =
    twins.length > 0 ? `${title} · ${apart(result, twins, now)}` : title;
  return {
    result,
    handle,
    label,
    serialised: `@${label} <${handle}>`,
    tip: tipOf(result, now),
  };
}

/**
 * A chip in a message's text, in its serialised form (`@<label> <handle>`):
 * the label (a title, and what tells it apart after " · "), and the handle.
 * A draft put back (restored, recalled, lifted for an edit) is parsed by it
 * into its chips again.
 */
export const SERIALISED = /@([^\n<>@]+?) <([^\s<>]+)>/g;

/** A message's text with each chip as it reads, `@<label>`: what a copy of the words shows. */
export const readAs = (text: string): string =>
  text.replace(SERIALISED, (_, label: string) => `@${label}`);

/** Every chip made in this tab, by its serialised form: a draft put back finds its chips here. */
const made = new Map<string, Chip>();

/** `chip` was put in a message: its draft finds it again when put back. */
export function remember(chip: Chip): void {
  made.set(chip.serialised, chip);
}

/** The chip a serialised mention was made as in this tab, if it was. */
export const madeChip = (serialised: string): Chip | undefined =>
  made.get(serialised);

const looking = new Map<string, Promise<Chip | null>>();

/**
 * The chip a serialised mention stands for, asked of the hub's names (a
 * draft kept from another visit, whose chips this tab never made): the
 * result with its handle among those its title finds. Its serialised form
 * stays as the draft holds it; null when the hub names nothing by it.
 */
export function lookUp(label: string, handle: string): Promise<Chip | null> {
  const serialised = `@${label} <${handle}>`;
  const known = looking.get(serialised);
  if (known) {
    return known;
  }
  const title = label.split(" · ")[0]?.trim() ?? label;
  const asked = findNames(title, { limit: 12 }).then((read) => {
    const result = read?.ok
      ? read.value.results.find((r) => r.handle === handle)
      : undefined;
    if (!result) {
      looking.delete(serialised);
      return null;
    }
    const chip: Chip = {
      result,
      handle,
      label,
      serialised,
      tip: tipOf(result, Date.now()),
    };
    made.set(serialised, chip);
    return chip;
  });
  looking.set(serialised, asked);
  return asked;
}

export class MentionState {
  /** The words after the "@", or null while no mention is being typed. */
  query = $state<string | null>(null);
  answer = $state<Answer<FindAnswer>>({ state: "idle" });
  chosen = $state<string | null>(null);
  now = $state(Date.now());

  readonly #here: () => string | null;
  #ask = 0;
  #abort: AbortController | null = null;

  constructor(here: () => string | null) {
    this.#here = here;
  }

  open = $derived(this.query !== null);
  words = $derived((this.query ?? "").trim());
  kindNamed = $derived(
    this.words
      .toLowerCase()
      .split(SPACES)
      .some((w) => KIND_WORDS.has(w))
  );

  /** Candidates for the words typed now (the last answer while the next is asked). */
  candidates = $derived.by(() => {
    if (this.answer.state !== "ok") {
      return [] as FindResult[];
    }
    const here = this.#here();
    return this.answer.value.results
      .filter((r) => r.handle !== null)
      .filter(
        (r) =>
          !(
            r.kind === "conversation" &&
            (r.id === here || r.instanceId === here)
          )
      )
      .slice(0, MENU_ROWS);
  });

  /** The answer is for the words typed now. */
  current = $derived(
    this.answer.state !== "idle" &&
      this.answer.state !== "asking" &&
      this.answer.for === this.words
  );

  active = $derived(
    this.candidates.find((c) => `${c.kind}:${c.id}` === this.chosen) ??
      this.candidates[0] ??
      null
  );

  /** The text after "@" changed. Returns false when a whole word matched nothing: the mention closes. */
  type(query: string): boolean {
    const missed =
      ENDS_IN_SPACE.test(query) &&
      this.answer.state === "ok" &&
      this.answer.for === query.trim() &&
      this.candidates.length === 0;
    if (missed) {
      this.close();
      return false;
    }
    const before = this.words;
    this.query = query;
    if (this.words !== before || this.answer.state === "idle") {
      this.chosen = null;
      this.#fetch(this.words);
    }
    return true;
  }

  close() {
    this.query = null;
    this.chosen = null;
    this.#abort?.abort();
  }

  move(step: number) {
    const list = this.candidates;
    if (list.length === 0) {
      return;
    }
    const at = Math.max(0, this.active ? list.indexOf(this.active) : 0);
    const next = list[Math.min(list.length - 1, Math.max(0, at + step))];
    if (next) {
      this.chosen = `${next.kind}:${next.id}`;
    }
  }

  chip(result: FindResult | null = this.active): Chip | null {
    if (!result) {
      return null;
    }
    return chipOf(result, this.candidates, this.now);
  }

  retry() {
    this.#fetch(this.words);
  }

  async #fetch(words: string) {
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;
    this.#ask += 1;
    const n = this.#ask;
    this.now = Date.now();
    if (this.answer.state !== "ok") {
      this.answer = { state: "asking", for: words, since: Date.now() };
    }
    const read = await findNames(words, {
      limit: 12,
      kinds: this.kindNamed ? undefined : NAMED,
      signal: abort.signal,
    });
    if (read === null || n !== this.#ask) {
      return;
    }
    if (read.ok) {
      this.answer = { state: "ok", for: words, value: read.value };
    } else if (read.unreached) {
      this.answer = { state: "unreached", for: words };
    } else {
      this.answer = { state: "refused", for: words, detail: read.detail };
    }
  }
}
