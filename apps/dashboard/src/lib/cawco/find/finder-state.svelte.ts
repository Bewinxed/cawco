/**
 * What the finder knows and shows, apart from how it is drawn: the words
 * typed, the two answers (the hub's names on every keystroke, every
 * machine's transcripts once typing settles), what waits for him, and which
 * row is active.
 *
 * Two speeds, made honest (docs/tom/find-and-mention-chosen.md, must-fixes
 * 5–7):
 * - names are asked per keystroke; machines once typing has settled
 *   (SETTLE_MS after the last keystroke);
 * - every answer carries the words it answers, and an answer to older words
 *   never replaces a newer one: each ask has a number and only the newest
 *   number lands (and the older request is aborted);
 * - nothing claims "no sessions" until the names and every machine have
 *   answered for the words in the field; a machine missing with nothing
 *   back is a coverage head, never an empty state;
 * - when the hub-side section is empty, the first row of "Where it was
 *   said" is active the moment it lands.
 */
import { SvelteSet } from "svelte/reactivity";
import {
  type FindAnswer,
  type FindBy,
  type FindConversation,
  type FindCoverage,
  type FindMoment,
  type FindResult,
  type FindThread,
  findEverywhere,
  findNames,
  findWaiting,
  type Read,
  type WaitingAnswer,
  type WaitingItem,
} from "./find-client";

/** After the last keystroke, how long before every machine is asked (ms). The critique's call, under the 1 s wait grace. */
export const SETTLE_MS = 250;
/** How long a wait goes unremarked before skeleton rows stand in (DESIGN.md --dur-wait-grace). */
export const GRACE_MS = 1000;

export type Who = "anyone" | FindBy;
export const WHO: { label: string; value: Who }[] = [
  { value: "anyone", label: "Anyone" },
  { value: "me", label: "You" },
  { value: "report", label: "Reports" },
  { value: "caw", label: "Caw" },
];

/** Time words he types, kept out of the words sent and applied here. */
const TIMES = [
  { words: ["this", "week"], label: "this week", days: 7 },
  { words: ["today"], label: "today", days: 0 },
  { words: ["yesterday"], label: "yesterday", days: 1 },
] as const;
export type TimeWord = (typeof TIMES)[number]["label"];

/** Kind words: a non-session kind he names goes to the Go-to row. */
const KIND_WORDS: Record<string, FindResult["kind"][]> = {
  task: ["task"],
  tasks: ["task"],
  preview: ["artifact"],
  previews: ["artifact"],
  page: ["artifact"],
  pages: ["artifact"],
  canvas: ["artifact"],
  artifact: ["artifact"],
  artifacts: ["artifact"],
  decision: ["decision"],
  decisions: ["decision"],
  routine: ["routine"],
  routines: ["routine"],
  machine: ["machine"],
  machines: ["machine"],
  project: ["project"],
  projects: ["project"],
  commit: ["commit"],
  commits: ["commit"],
  file: ["file"],
  files: ["file"],
};

export interface Parsed {
  /** "me" typed: a shortcut to the You chip. */
  me: boolean;
  /** What is sent to the hub. */
  sent: string;
  time: TimeWord | null;
  /** Each word as typed, for removing a chip's word from the field. */
  words: string[];
}

const SPACES = /\s+/;

export function parse(text: string): Parsed {
  const words = text.trim().split(SPACES).filter(Boolean);
  const lower = words.map((w) => w.toLowerCase());
  let time: TimeWord | null = null;
  const drop = new Set<number>();
  for (const t of TIMES) {
    for (let i = 0; i + t.words.length <= lower.length; i += 1) {
      if (t.words.every((w, j) => lower[i + j] === w)) {
        time ??= t.label;
        for (let j = 0; j < t.words.length; j += 1) {
          drop.add(i + j);
        }
      }
    }
  }
  let me = false;
  lower.forEach((w, i) => {
    if (w === "me") {
      me = true;
      drop.add(i);
    }
  });
  return {
    words,
    me,
    time,
    sent: words.filter((_, i) => !drop.has(i)).join(" "),
  };
}

const startOfDay = (now: number, back: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - back);
  return d.getTime();
};

/** Whether `at` falls in the time word's span. */
export function within(time: TimeWord | null, at: number | null, now: number) {
  if (time === null) {
    return true;
  }
  if (at === null) {
    return false;
  }
  if (time === "today") {
    return at >= startOfDay(now, 0);
  }
  if (time === "yesterday") {
    return at >= startOfDay(now, 1) && at < startOfDay(now, 0);
  }
  return at >= startOfDay(now, 6);
}

/** An answer's state, for one set of words. */
export type Answer<T> =
  | { state: "idle" }
  | { state: "asking"; for: string; since: number }
  | { state: "ok"; for: string; value: T }
  | { state: "unreached"; for: string }
  | { state: "refused"; for: string; detail: string };

export type Spoken = FindConversation | FindThread;

const isSpoken = (r: FindResult): r is Spoken =>
  r.kind === "conversation" || r.kind === "thread";

/** One Go-to entry: a thing, or several of one kind folded behind one row. */
export type GoTo =
  | { type: "one"; result: FindResult }
  | { type: "fold"; kind: FindResult["kind"]; results: FindResult[] };

/** Everything the keyboard can land on, in the order it is drawn. */
export type Stop =
  | { type: "waiting"; key: "waiting" }
  | { type: "goto"; key: string; result: FindResult }
  | { type: "fold"; key: string; entry: Extract<GoTo, { type: "fold" }> }
  | { type: "row"; key: string; result: Spoken; section: "names" | "said" }
  | { type: "moment"; key: string; result: Spoken; moment: FindMoment }
  | { type: "act"; key: string; result: FindResult; act: MachineAct }
  | { type: "wait-item"; key: string; item: WaitingItem };

export type MachineAct = "start" | "see";

export interface Opening {
  /** A moment to open at, scrolled and highlighted; else its latest. */
  moment: FindMoment | null;
  result: FindResult;
}

const keyOf = (r: FindResult) => `${r.kind}:${r.id}`;

/** The engine's word for a machine it would not ask: it is offline. */
const OFFLINE = "it is offline";
/** Machines a full find asks: those a names answer lists, less the offline. */
const askable = (coverage: FindCoverage) =>
  coverage.machines.filter((m) => m.reason !== OFFLINE).length;

export class FinderState {
  text = $state("");
  who = $state<Who>("anyone");
  view = $state<"find" | "waiting">("find");
  waitingSort = $state<"age" | "project">("age");
  names = $state<Answer<FindAnswer>>({ state: "idle" });
  everywhere = $state<Answer<FindAnswer>>({ state: "idle" });
  waiting = $state<Answer<WaitingAnswer>>({ state: "idle" });
  /** The active stop's key: kept while it is still drawn, so ↵ never lands on a row that moved under it. */
  chosen = $state<string | null>(null);
  peeked = $state<string | null>(null);
  unfolded = new SvelteSet<string>();
  now = $state(Date.now());
  /**
   * How many machines a full find asks, from the names answer (which lists
   * every machine it would ask, an offline one named so): "Searching 3
   * machines…" from the first keystroke.
   */
  askable = $state(0);
  /** Typing has not settled yet: the machines are about to be asked. */
  settling = $state(false);
  /** A names ask in flight while the last answer stays drawn. */
  #pendingNames = $state<{ for: string; since: number; late: boolean } | null>(
    null
  );
  namesPending = $derived(this.#pendingNames);
  /** A machines ask in flight while the last answer stays drawn. */
  #pendingEvery = $state<{ for: string; since: number } | null>(null);
  everywherePending = $derived(this.#pendingEvery);

  #namesAsk = 0;
  #everyAsk = 0;
  #namesAbort: AbortController | null = null;
  #everyAbort: AbortController | null = null;
  #settle: ReturnType<typeof setTimeout> | null = null;
  #clock: ReturnType<typeof setInterval> | null = null;

  parsed = $derived(parse(this.text));
  /** Who said it, with "me" typed counting as You. */
  by = $derived.by((): FindBy | null => {
    if (this.parsed.me) {
      return "me";
    }
    return this.who === "anyone" ? null : this.who;
  });
  /** The words the field holds now, as asked. */
  asked = $derived(this.parsed.sent);
  typed = $derived(this.text.trim().length > 0);

  /** The names answer, only when it answers the words in the field now. */
  namesNow = $derived(
    this.names.state === "ok" && this.names.for === this.#key(false)
      ? this.names.value
      : null
  );
  everywhereNow = $derived(
    this.everywhere.state === "ok" && this.everywhere.for === this.#key(true)
      ? this.everywhere.value
      : null
  );
  /** The last machines answer, for whatever words it answers (its head says which). */
  everywhereShown = $derived(
    this.everywhere.state === "ok" ? this.everywhere.value : null
  );

  /** Kinds the words name ("task drift"). */
  kindsNamed = $derived(
    new Set(this.parsed.words.flatMap((w) => KIND_WORDS[w.toLowerCase()] ?? []))
  );

  /** Project words he typed that name a project in the answer: each becomes a chip. */
  projectChips = $derived.by(() => {
    const answer = this.namesNow;
    if (!answer) {
      return [] as string[];
    }
    const names = new Set(
      answer.results
        .filter((r) => r.kind === "project")
        .map((r) => r.title.toLowerCase())
    );
    return this.parsed.words.filter((w) => names.has(w.toLowerCase()));
  });

  /** Moments by result, from the machines' answer, to fill the peek of a hub-side row. */
  momentsOf = $derived.by(() => {
    const map = new Map<string, FindMoment[]>();
    for (const r of this.everywhereShown?.results ?? []) {
      if (isSpoken(r) && r.moments.length > 0) {
        map.set(keyOf(r), r.moments);
      }
    }
    return map;
  });

  /**
   * Rows drawn in the hub section, the best first: the answer to the words
   * in the field, else the last answer while the next is on its way. A names
   * answer takes milliseconds, and a row in both answers stays the same row
   * and slides; emptying the list between them would destroy and redraw it.
   * The doorway's recent sessions never stand under typed words for longer
   * than the wait grace, nor typed matches at the doorway: past it, an
   * answer of the other sort is let go. A failed ask leaves none.
   */
  shownNameRows = $derived.by(() => {
    const { names } = this;
    const sameSort =
      names.state === "ok" && (names.for === "") === (this.asked === "");
    const inFlight = this.namesPending !== null && !this.namesPending.late;
    const answer =
      names.state === "ok" && (sameSort || inFlight) ? names.value : null;
    if (!answer) {
      return [] as Spoken[];
    }
    return answer.results
      .filter(isSpoken)
      .filter((r) => within(this.parsed.time, r.lastActivity, this.now));
  });

  /** Go-to entries: things of other kinds, only when a kind word or a strong name match says so. */
  goTo = $derived.by((): GoTo[] => {
    const answer = this.namesNow;
    if (!(answer && this.typed)) {
      return [];
    }
    const best =
      answer.results.find(isSpoken)?.score ?? Number.NEGATIVE_INFINITY;
    const groups = new Map<FindResult["kind"], FindResult[]>();
    for (const r of answer.results) {
      if (isSpoken(r)) {
        continue;
      }
      const group = groups.get(r.kind) ?? [];
      group.push(r);
      groups.set(r.kind, group);
    }
    const entries: GoTo[] = [];
    for (const [kind, results] of groups) {
      const strong = (results[0]?.score ?? 0) >= best;
      if (!(strong || this.kindsNamed.has(kind))) {
        continue;
      }
      entries.push(
        results.length === 1
          ? { type: "one", result: results[0] as FindResult }
          : { type: "fold", kind, results }
      );
    }
    return entries;
  });

  /** "Where it was said": sessions and threads the machines found it in, not already above. */
  saidRows = $derived.by(() => {
    const answer = this.everywhereShown;
    if (!(answer && this.typed)) {
      return [] as Spoken[];
    }
    const above = new Set(this.shownNameRows.map(keyOf));
    return answer.results
      .filter(isSpoken)
      .filter((r) => r.moments.length > 0 && !above.has(keyOf(r)))
      .filter((r) =>
        within(this.parsed.time, r.moments[0]?.at ?? r.lastActivity, this.now)
      );
  });

  /** The machines answer's words, for its head: what it answers, not what is typed. */
  saidFor = $derived(
    this.everywhere.state === "ok" ? this.everywhere.value.query : this.asked
  );

  coverage = $derived<FindCoverage | null>(
    this.everywhereShown?.coverage ?? null
  );
  missing = $derived(
    (this.coverage?.machines ?? []).filter((m) => !m.answered)
  );
  /** Machines that answered while their index was still catching up: their part may be short. */
  indexing = $derived(
    (this.coverage?.machines ?? []).filter((m) => m.answered && m.indexing)
  );
  /** Asking the machines for the words in the field now. */
  searching = $derived(
    this.typed &&
      (this.settling ||
        this.everywhere.state === "asking" ||
        this.everywherePending !== null)
  );

  /**
   * Every source has answered for the words in the field, and none found
   * anything: only then is "No sessions for …" drawn.
   */
  nothing = $derived(
    this.typed &&
      this.namesNow !== null &&
      this.everywhereNow !== null &&
      this.missing.length === 0 &&
      this.indexing.length === 0 &&
      this.namesNow.results.length === 0 &&
      this.saidRows.length === 0
  );

  hubDown = $derived(
    this.names.state === "unreached" || this.everywhere.state === "unreached"
  );
  refused = $derived.by(() => {
    if (this.names.state === "refused") {
      return this.names.detail;
    }
    return this.everywhere.state === "refused" ? this.everywhere.detail : null;
  });

  waitingItems = $derived.by(() => {
    if (this.waiting.state !== "ok") {
      return [] as WaitingItem[];
    }
    const items = [...this.waiting.value.items];
    if (this.waitingSort === "project") {
      items.sort(
        (a, b) =>
          (a.project?.name ?? "").localeCompare(b.project?.name ?? "") ||
          a.since - b.since
      );
    }
    return items;
  });

  /** Every stop in drawn order. */
  stops = $derived.by((): Stop[] => {
    if (this.view === "waiting") {
      return this.waitingItems.map((item) => ({
        type: "wait-item",
        key: `wait:${item.kind}:${item.id}`,
        item,
      }));
    }
    const out: Stop[] = [];
    if (!this.typed && this.waitingItems.length > 0) {
      out.push({ type: "waiting", key: "waiting" });
    }
    for (const entry of this.goTo) {
      if (entry.type === "one") {
        out.push({
          type: "goto",
          key: keyOf(entry.result),
          result: entry.result,
        });
        this.#actsOf(entry.result, out);
      } else {
        const key = `fold:${entry.kind}`;
        out.push({ type: "fold", key, entry });
        if (this.unfolded.has(key)) {
          for (const r of entry.results) {
            out.push({ type: "goto", key: keyOf(r), result: r });
            this.#actsOf(r, out);
          }
        }
      }
    }
    for (const r of this.shownNameRows) {
      out.push({ type: "row", key: keyOf(r), result: r, section: "names" });
      this.#momentsOf(r, out);
    }
    for (const r of this.saidRows) {
      out.push({ type: "row", key: keyOf(r), result: r, section: "said" });
      this.#momentsOf(r, out);
    }
    return out;
  });

  /** The active stop: the one chosen while it is drawn, else the first. */
  active = $derived.by(() => {
    const found = this.stops.find((s) => s.key === this.chosen);
    return found ?? this.stops[0] ?? null;
  });

  #actsOf(result: FindResult, out: Stop[]) {
    if (result.kind === "machine" && this.peeked === keyOf(result)) {
      out.push(
        { type: "act", key: `${keyOf(result)}#start`, result, act: "start" },
        { type: "act", key: `${keyOf(result)}#see`, result, act: "see" }
      );
    }
  }

  #momentsOf(result: Spoken, out: Stop[]) {
    if (this.peeked !== keyOf(result)) {
      return;
    }
    for (const [i, moment] of this.peekMoments(result).entries()) {
      out.push({
        type: "moment",
        key: `${keyOf(result)}#m${i}`,
        result,
        moment,
      });
    }
  }

  /** The moments a peek lists: its own, else what the machines found for it. */
  peekMoments(result: Spoken): FindMoment[] {
    return (
      result.moments.length > 0
        ? result.moments
        : (this.momentsOf.get(keyOf(result)) ?? [])
    ).slice(0, 3);
  }

  /** The words the answer for `text` is keyed by (who said it counts for the machines). */
  #key(everywhere: boolean) {
    return everywhere ? `${this.asked}\u0000${this.by ?? ""}` : this.asked;
  }

  /** Typed: names now, the machines once typing settles. */
  ask() {
    const words = this.asked;
    this.#askNames(words);
    if (this.#settle) {
      clearTimeout(this.#settle);
      this.#settle = null;
    }
    if (words.length === 0) {
      this.#everyAbort?.abort();
      this.#everyAsk += 1;
      this.#pendingEvery = null;
      this.settling = false;
      this.everywhere = { state: "idle" };
      return;
    }
    this.settling = true;
    this.#settle = setTimeout(() => {
      this.#settle = null;
      this.settling = false;
      this.#askEverywhere();
    }, SETTLE_MS);
  }

  /** Who-said changed: only the machines' part changes. */
  askWho() {
    if (this.typed) {
      this.#askEverywhere();
    }
  }

  retry() {
    this.#askNames(this.asked);
    if (this.typed) {
      this.#askEverywhere();
    }
  }

  async #askNames(words: string) {
    this.#namesAbort?.abort();
    const abort = new AbortController();
    this.#namesAbort = abort;
    this.#namesAsk += 1;
    const n = this.#namesAsk;
    const key = words;
    if (this.names.state === "ok") {
      // The last answer stays drawn (shownNameRows) while this one is asked,
      // for as long as the wait grace.
      this.#pendingNames = { for: key, since: Date.now(), late: false };
      setTimeout(() => {
        if (n === this.#namesAsk && this.#pendingNames) {
          this.#pendingNames = { ...this.#pendingNames, late: true };
        }
      }, GRACE_MS);
    } else {
      this.names = { state: "asking", for: key, since: Date.now() };
    }
    const read = await findNames(words, { limit: 20, signal: abort.signal });
    if (read === null || n !== this.#namesAsk) {
      return;
    }
    this.#pendingNames = null;
    this.names = this.#land(read, key);
    if (read.ok) {
      this.askable = askable(read.value.coverage);
    }
  }

  async #askEverywhere() {
    this.#everyAbort?.abort();
    const abort = new AbortController();
    this.#everyAbort = abort;
    this.#everyAsk += 1;
    const n = this.#everyAsk;
    const key = this.#key(true);
    const words = this.asked;
    if (this.everywhere.state === "ok") {
      this.#pendingEvery = { for: key, since: Date.now() };
    } else {
      this.everywhere = { state: "asking", for: key, since: Date.now() };
    }
    const read = await findEverywhere(words, {
      limit: 20,
      by: this.by,
      signal: abort.signal,
    });
    if (read === null || n !== this.#everyAsk) {
      return;
    }
    this.#pendingEvery = null;
    this.everywhere = this.#land(read, key);
  }

  #land<T>(read: Read<T>, key: string): Answer<T> {
    if (read.ok) {
      return { state: "ok", for: key, value: read.value };
    }
    if (read.unreached) {
      return { state: "unreached", for: key };
    }
    return { state: "refused", for: key, detail: read.detail };
  }

  async loadWaiting() {
    const read = await findWaiting();
    if (read === null) {
      return;
    }
    this.waiting = this.#land(read, "");
  }

  /** Opened: the doorway's answers, and a clock that keeps ages true. */
  open() {
    this.now = Date.now();
    this.#clock ??= setInterval(() => {
      this.now = Date.now();
    }, 30_000);
    this.ask();
    this.loadWaiting();
  }

  close() {
    this.#namesAbort?.abort();
    this.#everyAbort?.abort();
    if (this.#settle) {
      clearTimeout(this.#settle);
      this.#settle = null;
    }
    this.settling = false;
    if (this.#clock) {
      clearInterval(this.#clock);
      this.#clock = null;
    }
  }

  /** Moves the active stop by `step`, held at the ends. */
  move(step: number) {
    const { stops } = this;
    if (stops.length === 0) {
      return;
    }
    const at = Math.max(
      0,
      stops.findIndex((s) => s.key === this.active?.key)
    );
    const next = Math.min(stops.length - 1, Math.max(0, at + step));
    this.chosen = (stops[next] as Stop).key;
  }

  /** → on the active stop: peek a row, unfold a fold, open the waiting list. */
  peek() {
    const stop = this.active;
    if (!stop) {
      return;
    }
    if (stop.type === "waiting") {
      this.showWaiting();
    } else if (stop.type === "fold") {
      this.unfolded.add(stop.key);
    } else if (stop.type === "row") {
      this.peeked = stop.key;
    } else if (stop.type === "goto" && stop.result.kind === "machine") {
      this.peeked = stop.key;
    }
  }

  /** ← folds what is open, the active stop landing on the row it hung from. */
  fold() {
    const stop = this.active;
    if (this.peeked) {
      const owner = this.peeked;
      this.peeked = null;
      this.chosen = owner;
      return true;
    }
    if (stop?.type === "goto" || stop?.type === "fold") {
      for (const key of this.unfolded) {
        if (stop.type === "fold" ? stop.key === key : true) {
          this.unfolded.delete(key);
          this.chosen = key;
          return true;
        }
      }
    }
    if (this.view === "waiting") {
      this.showFind();
      return true;
    }
    return false;
  }

  togglePeek(key: string) {
    this.peeked = this.peeked === key ? null : key;
    this.chosen = key;
  }

  showWaiting() {
    this.view = "waiting";
    this.chosen = null;
  }

  showFind() {
    this.view = "find";
    this.chosen =
      this.waitingItems.length > 0 && !this.typed ? "waiting" : null;
  }

  /** Removes a chip's words from the field. */
  removeWords(remove: string[]) {
    const lower = remove.map((w) => w.toLowerCase());
    const { words } = this.parsed;
    let out = words;
    for (let i = 0; i + lower.length <= words.length; i += 1) {
      if (lower.every((w, j) => (words[i + j] as string).toLowerCase() === w)) {
        out = [...words.slice(0, i), ...words.slice(i + lower.length)];
        break;
      }
    }
    this.text = out.join(" ");
    this.ask();
  }

  /** What ↵ on the active stop opens, or null when ↵ does something in place. */
  opening(): Opening | null {
    const stop = this.active;
    if (!stop) {
      return null;
    }
    switch (stop.type) {
      case "row":
        return {
          result: stop.result,
          moment:
            stop.section === "said" ? (stop.result.moments[0] ?? null) : null,
        };
      case "moment":
        return { result: stop.result, moment: stop.moment };
      case "goto":
        return { result: stop.result, moment: null };
      case "act":
      case "fold":
      case "wait-item":
      case "waiting":
        return null;
    }
  }
}
