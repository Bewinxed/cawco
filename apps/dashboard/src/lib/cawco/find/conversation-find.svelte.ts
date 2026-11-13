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
 * The places come from two reads, put together oldest first:
 * - the turns the transcript holds now, read here at once, the live turn
 *   included (its place breathes while it is written);
 * - the hub's find engine, narrowed to this conversation with what tools
 *   returned (`GET /api/find/places`), which reaches the turns not loaded.
 *   A machine that does not answer leaves the first read alone, said with
 *   its name and Retry (The Claim Of Nothing Rule: a place is never claimed
 *   absent while its machine is not heard).
 */
import type { FindPlace, FindPlacesAnswer } from "@cawco/core/find";
import { unhandled } from "@cawco/core/unhandled";
import { findInWords } from "@cawco/core/words/find-in";
import type { Component } from "svelte";
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
  /** Stable across reads: the record, or for a tool's output the call. */
  key: string;
  /** Said as this turn is written: its glyph breathes. */
  live: boolean;
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
  | { kind: "answered"; places: FindPlace[] }
  | { kind: "unreached"; machine: string }
  /** The machine's agent is older than the places read: an update brings it. */
  | { kind: "outdated"; machine: string }
  | { kind: "refused"; detail: string };

/** What reads the hub: the engine's session-scoped find, or a bench's fixture. */
export type AskPlaces = (
  viewId: string,
  words: string,
  signal: AbortSignal
) => Promise<Read<FindPlacesAnswer> | null>;

/** How long typing settles before the hub is asked, ms: the finder's own pace (Finder `SETTLE_MS`). */
const SETTLE_MS = 180;

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
        // A call's output is in the record its result came in.
        record: message.metadata?.resultRecord ?? message.sdkUuid ?? message.id,
        title: said.title,
        whose: said.whose,
        word: said.word,
      },
    ];
  });
}

/** A place the hub found, in a turn the transcript has not loaded; `n`, its place among those of its record. */
function placeFound(place: FindPlace, n: number, agent: string): Place {
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
  const key = `found:${place.docId}:${n}`;
  return {
    at: place.at,
    docId: place.docId,
    excerpt: excerptParts(place.excerpt, place.secrets, (i) => `${key}|${i}`),
    glyph: face.glyph,
    key,
    live: false,
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
  /** The hub's read of the turns not loaded. */
  hub = $state<HubRead>({ kind: "idle" });
  /** The place stepped to, by its key; null before the first step. */
  at = $state<string | null>(null);
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
  sought: { back: boolean; docId: string } | null = null;
  /** The step count as find last opened: a later step moved the conversation. */
  #openedAt = 0;
  /** The place stepped to, by whose words and its record, for when its key changes as its turn loads. */
  #atRecord = $state<string | null>(null);

  readonly #ask: AskPlaces;
  readonly #agent: () => string;
  #reading: () => { tail: true } | { tail: false; docId: string } | null = () =>
    null;
  #settle: ReturnType<typeof setTimeout> | undefined;
  #abort: AbortController | null = null;

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
    this.#reading = reading;
    return () => {
      if (this.#reading === reading) {
        this.#reading = () => null;
      }
    };
  }

  /** The places in the turns loaded now, the live one too. */
  readonly #held = $derived.by((): Place[] => {
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
        record: "",
        title: agent,
        whose: "agent",
        word: findInWords.writing,
      });
    }
    return held;
  });

  /** Every place, the hub's and the loaded turns', oldest first; the live one last. */
  readonly all = $derived.by((): Place[] => {
    const held = this.#held;
    if (this.hub.kind !== "answered") {
      return held;
    }
    // A place the hub found whose turn is loaded is the transcript's own.
    const loaded = new Set(
      held.map((place) => `${place.whose}|${place.record}`)
    );
    const agent = this.#agent();
    const ofRecord = new Map<string, number>();
    const found = this.hub.places
      .map((place) => {
        const n = ofRecord.get(place.docId) ?? 0;
        ofRecord.set(place.docId, n + 1);
        return placeFound(place, n, agent);
      })
      .filter((place) => !loaded.has(`${place.whose}|${place.record}`));
    const said = [...found, ...held.filter((place) => !place.live)].toSorted(
      (a, b) => (a.at ?? 0) - (b.at ?? 0)
    );
    return [...said, ...held.filter((place) => place.live)];
  });

  /** The places the filter keeps. */
  readonly places = $derived(
    this.all.filter(
      (place) => this.whose === "all" || place.whose === this.whose
    )
  );

  /** Each filter's count. */
  readonly counts = $derived.by((): Record<WhoseFilter, number> => {
    const counts = { all: 0, me: 0, agent: 0, tools: 0, delegates: 0 };
    for (const place of this.all) {
      counts.all += 1;
      counts[place.whose] += 1;
    }
    return counts;
  });

  /**
   * The place stepped to, among those kept: by its key, or, a place the hub
   * found whose turn has loaded since, by its record.
   */
  readonly current = $derived(
    this.places.find((place) => place.key === this.at) ??
      this.places.find(
        (place) =>
          this.#atRecord !== null &&
          `${place.whose}|${place.record}` === this.#atRecord
      ) ??
      null
  );

  /** Its number among the places kept, from 1; 0 with none. */
  readonly placeNo = $derived(
    this.current ? this.places.indexOf(this.current) + 1 : 0
  );

  /** The hub is still being asked: nothing is claimed absent yet. */
  readonly asking = $derived(this.hub.kind === "asking");

  /** Open find (Command-F, Attach's Find): the field takes the focus. */
  show(): void {
    if (!this.open) {
      this.reading = this.landed ? this.reading : this.#reading();
      this.open = true;
      this.landed = false;
      this.#openedAt = this.stepped;
      this.listOpen = true;
      if (this.words) {
        this.#askHub();
      }
      // Find opens again at the place it stood at: it is stepped to, so the
      // place the count names is the one the conversation shows.
      if (this.current) {
        this.goTo(this.current);
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
    clearTimeout(this.#settle);
    this.messageAsked += 1;
  }

  /** Command-F: open, or close what is open. */
  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.show();
    }
  }

  /** The words typed: the places are read again once typing settles. */
  type(words: string): void {
    this.words = words;
    this.at = null;
    this.#atRecord = null;
    clearTimeout(this.#settle);
    this.#abort?.abort();
    if (!words.trim()) {
      this.hub = { kind: "idle" };
      return;
    }
    this.hub = { kind: "asking" };
    this.#settle = setTimeout(() => this.#askHub(), SETTLE_MS);
  }

  /** Ask the hub again (Retry). */
  retry(): void {
    this.#askHub();
  }

  async #askHub(): Promise<void> {
    const words = this.words.trim();
    if (!words) {
      return;
    }
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;
    this.hub = { kind: "asking" };
    const read = await this.#ask(this.viewId, words, abort.signal);
    if (read === null || abort.signal.aborted) {
      return;
    }
    if (read.ok) {
      const { heard, name } = read.value.machine;
      switch (heard) {
        case "answered":
          this.hub = { kind: "answered", places: read.value.places };
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
    if (this.at === null) {
      this.#first();
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
    const said = this.places.filter((place) => !place.live);
    const last = said.at(-1);
    if (last) {
      this.goTo(last);
    }
  }

  /** Whose words to keep: the place stays when it is kept, else the newest kept. */
  filter(whose: WhoseFilter): void {
    this.whose = whose;
    if (!this.current) {
      this.#first();
    }
  }

  /** Step to the next place (1) or the previous (-1), round from the ends. */
  step(by: 1 | -1): void {
    const n = this.places.length;
    if (n === 0) {
      return;
    }
    const now = this.current ? this.places.indexOf(this.current) : -1;
    const start = by === 1 ? 0 : n - 1;
    const next = now < 0 ? start : (now + by + n) % n;
    this.goTo(this.places[next]);
  }

  /** A place picked from the list: stepped to, and, `fold`, the list folds so it reads whole. */
  pick(key: string, fold: boolean): void {
    const place = this.places.find((each) => each.key === key);
    if (place) {
      this.goTo(place);
      if (fold) {
        this.listOpen = false;
      }
    }
  }

  /** Seek the place, its fold opened; the live turn's is the conversation's tail (Transcript). */
  goTo(place: Place | undefined): void {
    if (!place) {
      return;
    }
    this.at = place.key;
    this.#atRecord = `${place.whose}|${place.record}`;
    if (place.live) {
      this.stepped += 1;
      return;
    }
    this.stepped += 1;
    this.sought = { back: false, docId: place.docId };
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
      this.sought = { back: true, docId: reading.docId };
      askOpenAt(this.viewId, reading.docId);
      return { tail: false };
    }
    return { tail: true };
  }

  /**
   * The transcript arrived at the place stepped to: a place the hub found
   * is the transcript's own now that its turn is loaded.
   */
  arrived(): void {
    const place = this.current;
    if (!place) {
      return;
    }
    this.at = place.key;
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
  | "all"
  | "asking"
  | "at"
  | "close"
  | "counts"
  | "filter"
  | "hub"
  | "pick"
  | "places"
  | "retry"
  | "viewId"
  | "whose"
  | "words"
>;

/** Each conversation's find, by its view id. */
const finds = new Map<string, ConversationFind>();

/** How the hub is asked: the engine's places read, or a bench's fixture. */
let asker: AskPlaces = async (viewId, words, signal) => {
  const asked = await findPlaces(viewId, words, signal);
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
 * pressed and the list unchanged. It stands as long as the page does, as
 * each pane's composer layer does (composer-layer.svelte.ts).
 *
 * A server render makes one for that render alone and holds none: no
 * effect root runs there (`$effect.root` compiles to nothing), nothing
 * there unmounts, and a module-level find would outlive the request into
 * the next person's page.
 */
export function findIn(viewId: string): ConversationFind {
  const held = finds.get(viewId);
  if (held) {
    return held;
  }
  const make = (): ConversationFind =>
    new ConversationFind(
      viewId,
      (id, words, signal) => asker(id, words, signal),
      () =>
        cawOf(viewId) === null
          ? speakerName(sessionsStore.session(viewId)?.harness)
          : "Caw"
    );
  if (!browser) {
    return make();
  }
  let find!: ConversationFind;
  $effect.root(() => {
    find = make();
  });
  finds.set(viewId, find);
  return find;
}
