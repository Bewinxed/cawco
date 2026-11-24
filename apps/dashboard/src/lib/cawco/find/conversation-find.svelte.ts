/**
 * FIND IN A CONVERSATION. Command-F, or Find in Attach's menu, grows the
 * composer a find field on its top, and every place the words are in
 * rises out of the composer as its layer (FindLayer), at every width; each
 * step seeks the place, opens the fold it is in and marks the words
 * (Transcript, find-marks.ts).
 *
 * One record per conversation, by its view id, so the composer (lent by
 * the pane's group, PaneLeaf) and the transcript read the same find.
 *
 * The places are a list by position, oldest first, drawn from two reads:
 * - the hub's find engine, narrowed to this conversation with what tools
 *   returned (`GET /api/find/places`): how many places there are of each
 *   whose, read in windows (`PLACES_WINDOW`), the newest first, where find
 *   starts, then each window a step or a scroll of the list comes near
 *   (`need`). The engine finds them on the machine; the page holds only
 *   the windows read, per words (`FOUND_HELD`), so words typed again are
 *   drawn at once and read again behind them;
 * - the turns the transcript holds now, read here at once: what the
 *   machine's index has not reached (said after its `through`, the live
 *   turn breathing as it is written) follows the engine's places, and
 *   every place stands on these alone while the engine is asked, or when
 *   its machine does not answer, said with its name and Retry (The Claim
 *   Of Nothing Rule: a place is never claimed absent while its machine is
 *   not heard). A place the engine found whose turn is loaded is drawn as
 *   the transcript names it.
 */

import { detach } from "@cawco/core/detach";
import type { FindPlace, FindPlacesAnswer } from "@cawco/core/find";
import { PLACES_WINDOW } from "@cawco/core/find";
import { unhandled } from "@cawco/core/unhandled";
import { findInWords } from "@cawco/core/words/find-in";
import type { Component } from "svelte";
import { createSubscriber, SvelteMap } from "svelte/reactivity";
import { describeTool } from "#lib/components/features/tool-cards/descriptors.js";
import {
  IconAgent,
  IconCpu,
  IconReport,
  IconToolTerminal,
  IconUser,
} from "#lib/icons.js";
import { browser } from "$app/env";
import { cawOf } from "../session-status";
import { boardStore } from "../stores/board.svelte";
import { sessionsStore } from "../stores/sessions.svelte";
import { askOpenAt } from "../transcript/open-at.svelte";
import { speakerName } from "../transcript/speaker";
import type { Message } from "../types";
import { findPlaces, type Read } from "./find-client";
import { excerptParts, type Run } from "./find-rows";

/** Whose words a place is: the person's, the agent's, what its tools returned, a delegate's report. */
export type Whose = FindPlace["whose"];

/** The whose-words filter: everyone's, or one kind of speaker's. */
export type WhoseFilter = "all" | Whose;

/** One place the words are in, as the places list draws it and a step seeks it. */
export interface Place {
  /** When it was said, ms; null when nothing kept the time. */
  at: number | null;
  /** The record to open at. */
  docId: string;
  /** Its words around the match, matched runs strong. */
  excerpt: Run[];
  glyph: Component;
  /** Stable across reads: the record the engine found it in, else the transcript's own record, or for a tool's output the call. */
  key: string;
  /** Said as this turn is written: its glyph breathes. */
  live: boolean;
  /** Its position among every place the engine found (`FindPlace.n`); null for one only the transcript holds. */
  n: number | null;
  /**
   * The transcript record it is in, as the hub's index names it (a block's
   * stored entry, `sdkUuid`; for a tool's output, the record its result
   * came in, `resultRecord`): how a place the hub found is known again once
   * its turn is loaded.
   */
  record: string;
  /** Who said it, or what returned it. */
  title: string;
  whose: Whose;
  /** What line 2 says: the call a tool's output came from; "Writing" for the live turn; none for words said. */
  word: string;
}

/** How the hub's read stands. */
export type HubRead =
  | { kind: "idle" }
  | { kind: "asking" }
  /** The engine counted its places (`counts`, by whose); its windows are in the find's `found`. */
  | {
      kind: "answered";
      counts: Record<Whose, number>;
      /** Said after this, ms: no window holds it yet (`FindPlacesAnswer.through`). */
      through: number | null;
    }
  | { kind: "unreached"; machine: string }
  /** The machine's agent is older than the places read: an update brings it. */
  | { kind: "outdated"; machine: string }
  | { kind: "refused"; detail: string };

/** Which window of the places a read asks for (`GET /api/find/places`): none, the newest. */
export interface PlacesWindow {
  /** The window round the place at this position among every place (a place's `n`). */
  near?: number;
  /** The window's first place, by its position among those `whose` keeps. */
  offset?: number;
  /** Whose words it keeps; every place when absent. */
  whose?: Whose;
}

/** What reads the hub: the engine's session-scoped find, or a bench's fixture. */
export type AskPlaces = (
  viewId: string,
  words: string,
  window: PlacesWindow,
  signal: AbortSignal
) => Promise<Read<FindPlacesAnswer> | null>;

/** The engine's windows of one find's places, by the filter they were read for, then by position, each as its row draws it. */
interface Found {
  /** How many places the engine last counted of each whose, and how far its index reached. */
  counts: Record<Whose, number>;
  /** The words, as their find is held by (`foundKey`). */
  key: string;
  through: number | null;
  windows: Record<WhoseFilter, SvelteMap<number, Place>>;
}

/**
 * How many finds' windows a conversation holds: the words being found and
 * those typed just before, so a word taken back and typed again draws its
 * places at once (and is read again behind them). Our own call: a few
 * windows each, a few tens of KB.
 */
const FOUND_HELD = 8;

/** The words a find is held by: the engine matches without case. */
const foundKey = (words: string): string => words.trim().toLowerCase();

const WHOSE: readonly Whose[] = ["me", "agent", "tools", "delegates"];

/**
 * How many characters of a place's words stand before the match and after
 * it: little before, so the match stands near the row's start and a narrow
 * row still shows it.
 */
const LEAD = 32;
const TAIL = 96;

/** A headline already ending its sentence. */
const SENTENCE_END = /[.!?…:]$/u;

/** `text` cut round its first `words` (case aside), the match marked as the engine marks it. */
function excerptOf(text: string, at: number, length: number): Run[] {
  const from = Math.max(0, at - LEAD);
  const to = Math.min(text.length, at + length + TAIL);
  const flat = (s: string) => s.replace(/\s+/gu, " ");
  return [
    {
      matched: false,
      text: `${from > 0 ? "…" : ""}${flat(text.slice(from, at))}`,
    },
    { matched: true, text: flat(text.slice(at, at + length)) },
    {
      matched: false,
      text: `${flat(text.slice(at + length, to))}${to < text.length ? "…" : ""}`,
    },
  ].filter((run) => run.text !== "");
}

interface Said {
  glyph: Component;
  text: string;
  title: string;
  whose: Whose;
  word: string;
}

/** What of `message` find reads, and how its place is drawn; none for a row that is not words. */
function saidIn(message: Message, agent: string): Said | null {
  switch (message.type) {
    case "user":
      return {
        glyph: IconUser,
        text: message.content,
        title: findInWords.me,
        whose: "me",
        word: "",
      };
    case "assistant":
      return {
        glyph: IconAgent,
        text: message.content,
        title: agent,
        whose: "agent",
        word: "",
      };
    case "thinking":
      // As the transcript names it: its fold's glyph and word.
      return {
        glyph: IconCpu,
        text: message.content || (message.metadata?.thinking ?? ""),
        title: findInWords.reasoning,
        whose: "agent",
        word: "",
      };
    case "tool.use": {
      // The call as its row in the transcript reads it: its glyph, its
      // sentence, and what it acted on.
      const call = describeTool(
        message.metadata?.toolName,
        message.metadata?.toolInput,
        message.metadata?.toolResult,
        message.metadata?.toolStatus ?? "success"
      );
      return {
        glyph: call.icon,
        text: message.metadata?.toolResult ?? "",
        title: call.label,
        whose: "tools",
        word: call.object ?? "",
      };
    }
    case "user.peer": {
      const headline = message.metadata?.reportHeadline;
      return {
        glyph: IconReport,
        // The headline a sentence of its own before the body, as the
        // report's card reads them.
        text: headline
          ? `${headline}${SENTENCE_END.test(headline) ? "" : "."} ${message.content}`
          : message.content,
        // As the transcript's report line names it (Peer).
        title: findInWords.reportFrom(
          message.metadata?.peerName ?? findInWords.report
        ),
        whose: "delegates",
        word: "",
      };
    }
    case "result.error":
    case "result.success":
    case "send.ref":
    case "tool.handoff":
    case "tool.progress":
    case "tool.result":
    case "user.delegate_ask":
    case "user.rule":
      return null;
    default:
      return null;
  }
}

/** The places in the turns the transcript holds, oldest first. */
function placesHeld(
  messages: readonly Message[],
  words: string,
  agent: string
): Place[] {
  const needle = words.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return messages.flatMap((message): Place[] => {
    const said = saidIn(message, agent);
    if (!said) {
      return [];
    }
    const at = said.text.toLowerCase().indexOf(needle);
    if (at < 0) {
      return [];
    }
    const stamp = message.timestamp
      ? Date.parse(message.timestamp)
      : Number.NaN;
    return [
      {
        at: Number.isNaN(stamp) ? null : stamp,
        docId: message.id,
        excerpt: excerptOf(said.text, at, needle.length),
        glyph: said.glyph,
        key:
          message.type === "tool.use"
            ? `call:${message.toolCallId ?? message.id}`
            : message.id,
        live: false,
        n: null,
        // A call's output is in the record its result came in.
        record: message.metadata?.resultRecord ?? message.sdkUuid ?? message.id,
        title: said.title,
        whose: said.whose,
        word: said.word,
      },
    ];
  });
}

/** A place the hub found, as its row draws it until its turn is loaded. */
function placeFound(place: FindPlace, agent: string): Place {
  const FACE: Record<Whose, { glyph: Component; title: string }> = {
    me: { glyph: IconUser, title: findInWords.me },
    agent: { glyph: IconAgent, title: agent },
    tools: {
      glyph: IconToolTerminal,
      // The tool is named once its turn is loaded and its call is read.
      title: findInWords.toolOutput(findInWords.tool),
    },
    delegates: {
      glyph: IconReport,
      title: findInWords.reportFrom(findInWords.report),
    },
  };
  const face = place.thinking
    ? { glyph: IconCpu, title: findInWords.reasoning }
    : FACE[place.whose];
  const key = `found:${place.docId}`;
  return {
    at: place.at,
    docId: place.docId,
    excerpt: excerptParts(place.excerpt, place.secrets, (i) => `${key}|${i}`),
    glyph: face.glyph,
    key,
    live: false,
    n: place.n,
    record: place.docId,
    title: face.title,
    whose: place.whose,
    word: "",
  };
}

/** One conversation's find. */
export class ConversationFind {
  readonly viewId: string;
  /** Find stands open: the field on the composer, the places beside. */
  open = $state(false);
  /** The words being found. */
  words = $state("");
  /** Whose words the places keep. */
  whose = $state<WhoseFilter>("all");
  /** How the hub's read stands. */
  hub = $state<HubRead>({ kind: "idle" });
  /** Find closed at a place: its wash stays, and Back where you were stands. */
  landed = $state(false);
  /** Narrow, the places stand over the conversation until one is picked. */
  listOpen = $state(true);
  /** Where the conversation was being read as find opened: a record, or its tail. */
  reading = $state<{ tail: true } | { tail: false; docId: string } | null>(
    null
  );
  /** A step's ask of the field: the field takes the focus (the composer's FindLine). */
  focusAsked = $state(0);
  /** Find closed: the caret goes back to the message (the composer). */
  messageAsked = $state(0);
  /** Each step, counted: the transcript brings its words clear of the composer once per step. */
  stepped = $state(0);
  /**
   * The record find asked the transcript to open at: it is sought without
   * the row's own mark and its "Opened at that line" (the words are marked,
   * and the place is said by the count).
   */
  sought: string | null = null;
  /** The step count as find last opened: a later step moved the conversation. */
  #openedAt = 0;
  /** The position of the place stepped to among those kept; null before the first step. */
  #index = $state<number | null>(null);
  /** The engine's windows of the words being found; null before it answered them. */
  #found = $state.raw<Found | null>(null);
  /** Each find's windows, by its words, the latest last ({@link FOUND_HELD}). */
  readonly #held = new Map<string, Found>();
  /** The windows being read, by words, filter and first position: each asked once. */
  readonly #reading = new Set<string>();
  /** A place stepped to whose window was being read: sought once it is. */
  #unsought: number | null = null;

  readonly #ask: AskPlaces;
  readonly #agent: () => string;
  #readFrom: () => { tail: true } | { tail: false; docId: string } | null =
    () => null;
  /** The read of the newest window, let go when the words change. */
  #abort: AbortController | null = null;
  /** Every read of the words being found, let go together when they change. */
  #windows = new AbortController();

  constructor(viewId: string, ask: AskPlaces, agent: () => string) {
    this.viewId = viewId;
    this.#ask = ask;
    this.#agent = agent;
  }

  /** The agent answering in this conversation, by name: the whose-words filter's word for its words. */
  get agent(): string {
    return this.#agent();
  }

  /** The transcript says where it is being read, for Back where you were. */
  readFrom(
    reading: () => { tail: true } | { tail: false; docId: string } | null
  ) {
    this.#readFrom = reading;
    return () => {
      if (this.#readFrom === reading) {
        this.#readFrom = () => null;
      }
    };
  }

  /** The places in the turns loaded now, the live one last. */
  readonly held = $derived.by((): Place[] => {
    const session = sessionsStore.session(this.viewId);
    if (!((this.open || this.landed) && session)) {
      return [];
    }
    const agent = this.#agent();
    const held = placesHeld(session.messages, this.words, agent);
    const needle = this.words.trim().toLowerCase();
    const { streaming } = session;
    const at = needle ? streaming.toLowerCase().indexOf(needle) : -1;
    if (at >= 0) {
      held.push({
        at: Date.now(),
        docId: "",
        excerpt: excerptOf(streaming, at, needle.length),
        glyph: IconAgent,
        key: `${this.viewId}:live`,
        live: true,
        n: null,
        record: "",
        title: agent,
        whose: "agent",
        word: findInWords.writing,
      });
    }
    return held;
  });

  /** The loaded turns' places, by whose words and record: how a place the engine found is drawn once its turn is loaded. */
  readonly #heldByRecord = $derived(
    new Map(this.held.map((place) => [`${place.whose}|${place.record}`, place]))
  );

  /**
   * The places that follow the engine's: with its answer, those of the
   * loaded turns said after its index's reach, the live one last; without
   * it, every place of the loaded turns.
   */
  readonly #after = $derived.by((): Place[] => {
    const { hub } = this;
    if (hub.kind !== "answered") {
      return this.held;
    }
    const { through } = hub;
    const later = this.held.filter(
      (place) =>
        !place.live &&
        place.at !== null &&
        (through === null || place.at > through)
    );
    return [
      ...later.toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0)),
      ...this.held.filter((place) => place.live),
    ];
  });

  /** Of {@link ConversationFind.#after}, the places the filter keeps. */
  readonly #afterKept = $derived(
    this.#after.filter(
      (place) => this.whose === "all" || place.whose === this.whose
    )
  );

  /** How many of the engine's places the filter keeps. */
  readonly #engine = $derived.by((): number => {
    const { hub } = this;
    if (hub.kind !== "answered") {
      return 0;
    }
    return this.whose === "all"
      ? WHOSE.reduce((sum, whose) => sum + hub.counts[whose], 0)
      : hub.counts[this.whose];
  });

  /** How many places the filter keeps: the list's length. */
  readonly total = $derived(this.#engine + this.#afterKept.length);

  /** Each filter's count. */
  readonly counts = $derived.by((): Record<WhoseFilter, number> => {
    const { hub } = this;
    const counts = { all: 0, me: 0, agent: 0, tools: 0, delegates: 0 };
    if (hub.kind === "answered") {
      for (const whose of WHOSE) {
        counts[whose] = hub.counts[whose];
        counts.all += hub.counts[whose];
      }
    }
    for (const place of this.#after) {
      counts.all += 1;
      counts[place.whose] += 1;
    }
    return counts;
  });

  /**
   * The place at `index` among those the filter keeps; null for one of the
   * engine's whose window is not read yet (its row stands as a skeleton,
   * and the list asks for it, `need`).
   */
  placeAt(index: number): Place | null {
    const engine = this.#engine;
    if (index >= engine) {
      return this.#afterKept[index - engine] ?? null;
    }
    const place = this.#found?.windows[this.whose].get(index);
    if (!place) {
      return null;
    }
    // A place the engine found whose turn is loaded is drawn as the
    // transcript names it: its call, its report's sender. Made once for
    // each pair, so a row drawn again is handed the place it had.
    const loaded = this.#heldByRecord.get(`${place.whose}|${place.record}`);
    if (!loaded) {
      return place;
    }
    const drawn = this.#drawn.get(place);
    if (drawn?.loaded === loaded) {
      return drawn.place;
    }
    const named = { ...loaded, key: place.key, n: place.n };
    this.#drawn.set(place, { loaded, place: named });
    return named;
  }

  /** Each place the engine found whose turn is loaded, as the transcript names it, by the place and the loaded one it was drawn from. */
  readonly #drawn = new WeakMap<Place, { loaded: Place; place: Place }>();

  /** The place stepped to; null before the first step, or while its window is read. */
  readonly current = $derived(
    this.#index === null ? null : this.placeAt(this.#index)
  );

  /** The place stepped to, by its key; null before the first step. */
  readonly at = $derived(this.current?.key ?? null);

  /** Its position among the places kept, from 0; null before the first step. */
  get index(): number | null {
    return this.#index;
  }

  /** Its number among the places kept, from 1; 0 with none. */
  readonly placeNo = $derived(
    this.#index === null || this.total === 0 ? 0 : this.#index + 1
  );

  /** The hub is still being asked: nothing is claimed absent yet. */
  readonly asking = $derived(this.hub.kind === "asking");

  /**
   * What the find holds that the person set, for the find made again when a
   * pane next shows the conversation ({@link findIn}); every read under way
   * is let go.
   */
  release(): FindKept {
    this.#abort?.abort();
    this.#windows.abort();
    return {
      index: this.#index,
      landed: this.landed,
      listOpen: this.listOpen,
      open: this.open,
      reading: this.reading,
      whose: this.whose,
      words: this.words,
    };
  }

  /** Stands as `left` (a released find) left it: its words found again, at the place stepped to. */
  restore(left: FindKept): void {
    this.whose = left.whose;
    this.landed = left.landed;
    this.listOpen = left.listOpen;
    this.reading = left.reading;
    this.open = left.open;
    if (left.words) {
      this.type(left.words);
    }
    this.#index = left.index;
  }

  /** Open find (Command-F, Attach's Find): the field takes the focus. */
  show(): void {
    if (!this.open) {
      this.reading = this.landed ? this.reading : this.#readFrom();
      this.open = true;
      this.landed = false;
      this.#openedAt = this.stepped;
      this.listOpen = true;
      if (this.words.trim()) {
        this.#askNewest();
      }
      // Find opens again at the place it stood at: it is stepped to, so the
      // place the count names is the one the conversation shows.
      if (this.#index !== null) {
        this.goTo(this.#index);
      }
    }
    this.focusAsked += 1;
  }

  /** Close find at the place found: the caret goes back to the message. */
  close(): void {
    if (!this.open) {
      return;
    }
    // Read before find closes: closed, it holds no places. Only a find that
    // moved the conversation leaves a place to come back from.
    this.landed = this.stepped !== this.#openedAt && this.current !== null;
    this.open = false;
    this.#abort?.abort();
    this.messageAsked += 1;
  }

  /**
   * The words typed: the hub is asked at once, the read of the words
   * before let go (no settle: each read is the engine's index and one
   * window, and the newer one takes the older one's place). Words found
   * before draw their windows at once while they are read again.
   */
  type(words: string): void {
    this.words = words;
    this.#index = null;
    this.#abort?.abort();
    this.#windows.abort();
    this.#windows = new AbortController();
    this.#reading.clear();
    const key = foundKey(words);
    if (!key) {
      this.#found = null;
      this.hub = { kind: "idle" };
      return;
    }
    const held = this.#held.get(key) ?? null;
    this.#found = held;
    if (held) {
      // Drawn at once as last found, and read again behind.
      this.hub = {
        kind: "answered",
        counts: held.counts,
        through: held.through,
      };
    }
    this.#askNewest();
  }

  /** Ask the hub again (Retry). */
  retry(): void {
    this.#askNewest();
  }

  /** The words' windows, held for when they are typed again. */
  #foundFor(
    key: string,
    counts: Record<Whose, number>,
    through: number | null
  ): Found {
    const held = this.#held.get(key);
    this.#held.delete(key);
    const found: Found = held ?? {
      counts,
      key,
      through,
      windows: {
        all: new SvelteMap(),
        me: new SvelteMap(),
        agent: new SvelteMap(),
        tools: new SvelteMap(),
        delegates: new SvelteMap(),
      },
    };
    this.#held.set(key, found);
    for (const old of this.#held.keys()) {
      if (this.#held.size <= FOUND_HELD) {
        break;
      }
      this.#held.delete(old);
    }
    return found;
  }

  /**
   * One window of the words' places for `filter`, read and kept, its
   * counts taken as the engine's latest; the answer, or null when it was
   * let go or failed (a failed window's rows stay skeletons, and are asked
   * again as the list comes near them).
   */
  async #read(
    words: string,
    filter: WhoseFilter,
    window: Omit<PlacesWindow, "whose">,
    signal: AbortSignal
  ): Promise<Read<FindPlacesAnswer> | null> {
    const read = await this.#ask(
      this.viewId,
      words,
      { ...window, ...(filter === "all" ? {} : { whose: filter }) },
      signal
    );
    if (
      read === null ||
      signal.aborted ||
      foundKey(this.words) !== foundKey(words)
    ) {
      return null;
    }
    if (read.ok && read.value.machine.heard === "answered") {
      const { counts, through } = read.value;
      const found = this.#foundFor(foundKey(words), counts, through);
      found.counts = counts;
      found.through = through;
      this.#found = found;
      const kept = found.windows[filter];
      const agent = this.#agent();
      for (const [i, place] of read.value.places.entries()) {
        kept.set(read.value.offset + i, placeFound(place, agent));
      }
      const was = this.hub;
      // A window that moved no count leaves the read as it stood: what
      // reads it (every row's place) is not drawn again for it.
      if (!(
        was.kind === "answered" &&
        was.through === through &&
        WHOSE.every((whose) => was.counts[whose] === counts[whose])
      )) {
        this.hub = { kind: "answered", counts, through };
      }
      const waiting = this.#unsought;
      const place = waiting === null ? null : this.placeAt(waiting);
      if (place && waiting === this.#index && filter === this.whose) {
        this.#unsought = null;
        this.#seek(place);
      }
    }
    return read;
  }

  /** Ask the hub for the newest window, where find starts: its places' counts too. */
  async #askNewest(): Promise<void> {
    const words = this.words.trim();
    if (!words) {
      return;
    }
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;
    if (!this.#found) {
      this.hub = { kind: "asking" };
    }
    const read = await this.#read(words, this.whose, {}, abort.signal);
    if (read === null) {
      return;
    }
    if (read.ok) {
      const { heard, name } = read.value.machine;
      switch (heard) {
        case "answered":
          break;
        case "outdated":
          this.hub = { kind: "outdated", machine: name };
          break;
        case "silent":
          this.hub = { kind: "unreached", machine: name };
          break;
        default:
          unhandled("places heard", heard);
      }
    } else {
      this.hub = read.unreached
        ? { kind: "unreached", machine: this.#machine() }
        : { kind: "refused", detail: read.detail };
    }
    if (this.#index === null) {
      this.#first();
    }
  }

  /**
   * Read the windows that hold the places from `from` to `to` among those
   * kept, each not read yet: the list asks for the rows near its view, a
   * step for the window ahead of it.
   */
  need(from: number, to: number): void {
    const words = this.words.trim();
    const filter = this.whose;
    const kept = this.#found?.windows[filter];
    const end = Math.min(to, this.#engine - 1);
    if (!(words && this.hub.kind === "answered")) {
      return;
    }
    for (
      let start = Math.floor(Math.max(0, from) / PLACES_WINDOW) * PLACES_WINDOW;
      start <= end;
      start += PLACES_WINDOW
    ) {
      const last = Math.min(start + PLACES_WINDOW, this.#engine) - 1;
      const id = `${foundKey(words)}|${filter}|${start}`;
      if (this.#reading.has(id) || (kept?.has(start) && kept.has(last))) {
        continue;
      }
      this.#reading.add(id);
      detach(
        this.#readWindow(id, words, filter, start),
        "find's places window"
      );
    }
  }

  /** One window of the places from `start` read; a window that came to nothing is asked again when the list comes near it. */
  async #readWindow(
    id: string,
    words: string,
    filter: WhoseFilter,
    start: number
  ): Promise<void> {
    const { signal } = this.#windows;
    let read: Read<FindPlacesAnswer> | null = null;
    try {
      read = await this.#read(words, filter, { offset: start }, signal);
    } finally {
      if (!read?.ok) {
        this.#reading.delete(id);
      }
    }
  }

  #machine(): string {
    const machineId = sessionsStore.session(this.viewId)?.machineId ?? "";
    return (
      boardStore.machines.find((machine) => machine.machineId === machineId)
        ?.hostname ?? machineId
    );
  }

  /** The newest place said before the live turn: where find starts. */
  #first(): void {
    for (let index = this.total - 1; index >= 0; index -= 1) {
      if (!this.placeAt(index)?.live) {
        this.goTo(index);
        return;
      }
    }
  }

  /**
   * Whose words to keep: the place stays when it is kept (the engine says
   * where it stands among them, `near`), else the newest kept.
   */
  filter(whose: WhoseFilter): void {
    const was = this.current;
    this.whose = whose;
    this.#index = null;
    if (was !== null && (whose === "all" || was.whose === whose)) {
      const after = this.#afterKept.findIndex((place) => place.key === was.key);
      if (after >= 0) {
        this.#index = this.#engine + after;
        return;
      }
      const { n } = was;
      if (n !== null && this.hub.kind === "answered") {
        detach(this.#keepAt(whose, n), "find's places filter");
        return;
      }
    }
    if (this.hub.kind === "answered") {
      this.#askNewest();
    } else {
      this.#first();
    }
  }

  /**
   * The place at `n` among every place stepped to again among those
   * `whose` keeps, where the engine says it stands; else the newest kept.
   */
  async #keepAt(whose: WhoseFilter, n: number): Promise<void> {
    const read = await this.#read(
      this.words.trim(),
      whose,
      { near: n },
      this.#windows.signal
    );
    if (!read?.ok || this.whose !== whose || this.#index !== null) {
      return;
    }
    const at = read.value.places.findIndex((place) => place.n === n);
    if (at >= 0) {
      this.#index = read.value.offset + at;
    } else {
      this.#first();
    }
  }

  /** Step to the next place (1) or the previous (-1), round from the ends. */
  step(by: 1 | -1): void {
    const n = this.total;
    if (n === 0) {
      return;
    }
    const now = this.#index ?? -1;
    const start = by === 1 ? 0 : n - 1;
    const next = now < 0 ? start : (now + by + n) % n;
    this.goTo(next);
  }

  /** A place picked from the list, by its position: stepped to, and, `fold`, the list folds so it reads whole. */
  pick(index: number, fold: boolean): void {
    this.goTo(index);
    if (fold) {
      this.listOpen = false;
    }
  }

  /**
   * Seek the place at `index`, its fold opened; the live turn's is the
   * conversation's tail (Transcript). One whose window is not read yet is
   * read first, and sought once it is, unless a later step moved on.
   */
  goTo(index: number): void {
    if (index < 0 || index >= this.total) {
      return;
    }
    this.#index = index;
    this.stepped += 1;
    const place = this.placeAt(index);
    this.#unsought = place ? null : index;
    if (place) {
      this.#seek(place);
    } else {
      this.need(index, index);
    }
    // The windows a step either way reaches next are read before it does:
    // half a window on, and round from either end.
    const n = this.total;
    for (const ahead of [
      index + PLACES_WINDOW / 2,
      index - PLACES_WINDOW / 2,
      (index + 1) % n,
      (index - 1 + n) % n,
    ]) {
      this.need(ahead, ahead);
    }
  }

  /** The transcript opens at `place`, its words brought into the room the reader sees. */
  #seek(place: Place): void {
    if (place.live) {
      return;
    }
    this.sought = place.docId;
    // The seek brings the words themselves into the room the reader sees,
    // opening the fold they are in (Transcript `seekInto`).
    askOpenAt(this.viewId, place.docId, [this.words.trim()]);
  }

  /**
   * Back where you were: the conversation goes back to the record it was
   * read at as find opened. Said whether that was its tail, which the
   * transcript goes to itself (Jump to latest's glide).
   */
  back(): { tail: boolean } {
    const { reading } = this;
    this.landed = false;
    this.reading = null;
    // The caret goes back to the message, as the pill it was pressed on goes.
    this.messageAsked += 1;
    if (reading && !reading.tail) {
      this.sought = reading.docId;
      askOpenAt(this.viewId, reading.docId);
      return { tail: false };
    }
    return { tail: true };
  }

  /** The reader moved on from the place find closed at: its wash goes. */
  leave(): void {
    this.landed = false;
  }
}

/** What the places list reads of a find, and asks of it (FindPlaces): a find, or a states file's fixture. */
export type PlacesView = Pick<
  ConversationFind,
  | "agent"
  | "asking"
  | "at"
  | "close"
  | "counts"
  | "filter"
  | "hub"
  | "index"
  | "need"
  | "pick"
  | "placeAt"
  | "retry"
  | "total"
  | "viewId"
  | "whose"
  | "words"
>;

/** The places list of the find in `viewId`, by id: what the find field controls. */
export const placesId = (viewId: string): string => `places-${viewId}`;

/** The row of the place at `index` in the find in `viewId`, by id: what the find field names as the one stepped to. */
export const placeId = (viewId: string, index: number): string =>
  `place-${viewId}-${index}`;

/** What a conversation's find keeps while no pane shows it ({@link ConversationFind.release}). */
interface FindKept {
  index: number | null;
  landed: boolean;
  listOpen: boolean;
  open: boolean;
  reading: { tail: true } | { tail: false; docId: string } | null;
  whose: WhoseFilter;
  words: string;
}

/** Each conversation's find while something reads it, by its view id, with its hold. */
const finds = new Map<string, { find: ConversationFind; hold: () => void }>();
/** What each conversation's find held when its last reader went, by view id. */
const keptFinds = new Map<string, FindKept>();

/** How the hub is asked: the engine's places read, or a bench's fixture. */
let asker: AskPlaces = async (viewId, words, window, signal) => {
  const asked = await findPlaces(viewId, words, window, signal);
  return asked.kind === "answered" ? asked.read : null;
};

/** Set how every find asks the hub (the dashboard's find-client; a bench's fixture). */
export function askPlacesWith(ask: AskPlaces): void {
  asker = ask;
}

/**
 * The find of the conversation shown as `viewId`. Made in an effect root
 * of its own, never in the component that first asks for it: its derived
 * places, counts and filter would otherwise belong to that component's
 * effect, and once that one unmounted (a tab switched, the composer handed
 * to another pane) they would answer their last value for good, a filter
 * pressed and the list unchanged.
 *
 * It stands while an effect reads it (`createSubscriber`): a reactive read
 * holds it. Its deriveds keep the component context they were made under
 * (Svelte's `ctx`, for `getContext` inside them), and with it that
 * component's props and DOM, so a find held for the page's life kept the
 * first pane that showed each conversation alive after it unmounted. Once
 * the last reader has gone its root is destroyed and what the person set
 * (its words, filter, place) is kept, so a pane that shows the
 * conversation again finds it standing as it was left.
 *
 * A server render makes one for that render alone and holds none: no
 * effect root runs there (`$effect.root` compiles to nothing), nothing
 * there unmounts, and a module-level find would outlive the request into
 * the next person's page.
 */
export function findIn(viewId: string): ConversationFind {
  const make = (): ConversationFind =>
    new ConversationFind(
      viewId,
      (id, words, window, signal) => asker(id, words, window, signal),
      () =>
        cawOf(viewId) === null
          ? speakerName(sessionsStore.session(viewId)?.harness)
          : "Caw"
    );
  if (!browser) {
    return make();
  }
  let held = finds.get(viewId);
  if (!held) {
    let find!: ConversationFind;
    const destroy = $effect.root(() => {
      find = make();
      const left = keptFinds.get(viewId);
      if (left) {
        keptFinds.delete(viewId);
        find.restore(left);
      }
    });
    const made = {
      find,
      hold: createSubscriber(() => () => {
        if (finds.get(viewId) === made) {
          finds.delete(viewId);
          keptFinds.set(viewId, find.release());
          destroy();
        }
      }),
    };
    finds.set(viewId, made);
    held = made;
  }
  held.hold();
  return held.find;
}
