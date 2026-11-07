/**
 * FIND IN A CONVERSATION. Command-F, or Find in Attach's menu, grows the
 * composer a find field on its top; every place the words are in stands
 * beside the conversation (a desk: the side panel's Find; narrow: the
 * composer's layer), and each step seeks the place, opens the fold it is
 * in and marks the words (Transcript, find-marks.ts).
 *
 * One record per conversation, by its view id, so the composer (lent by
 * the pane's group, PaneLeaf), the side panel (SideSplit) and the
 * transcript read the same find.
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
import { markedRuns } from "@cawco/core/find-match";
import { findInWords } from "@cawco/core/words/find-in";
import type { Component } from "svelte";
import {
  IconAgent,
  IconReport,
  IconStars,
  IconToolTerminal,
  IconUser,
} from "#lib/icons.js";
import { cawco } from "../client.svelte";
import { cawOf } from "../session-status";
import { disclosureAt } from "../transcript/disclosure.svelte";
import { askOpenAt } from "../transcript/open-at.svelte";
import { speakerName } from "../transcript/speaker";
import type { Message } from "../types";
import type { Read } from "./find-client";
import type { Run } from "./find-rows";

/** Whose words a place is: the person's, the agent's, what its tools returned, a delegate's report. */
export type Whose = FindPlace["whose"];

/** The whose-words filter: everyone's, or one kind of speaker's. */
export type WhoseFilter = "all" | Whose;

/** One place the words are in, as the places list draws it and a step seeks it. */
export interface Place {
  /** When it was said, ms; null when nothing kept the time. */
  at: number | null;
  /** The tool call or report whose fold it is in, by its disclosure id; null for words said in the open. */
  call: string | null;
  /** The record to open at. */
  docId: string;
  /** Its words around the match, matched runs strong. */
  excerpt: Run[];
  glyph: Component;
  /** Stable across reads: the record, or for a tool's output the call. */
  key: string;
  /** Said as this turn is written: its glyph breathes. */
  live: boolean;
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
  | { kind: "refused"; detail: string };

/** What reads the hub: the engine's session-scoped find, or a bench's fixture. */
export type AskPlaces = (
  viewId: string,
  words: string,
  signal: AbortSignal
) => Promise<Read<FindPlacesAnswer> | null>;

/** How long typing settles before the hub is asked, ms: the finder's own pace (Finder `SETTLE_MS`). */
const SETTLE_MS = 180;

/** How many characters of a place's words stand either side of the match. */
const ROOM = 64;

/** `text` cut round its first `words` (case aside), the match marked as the engine marks it. */
function excerptOf(text: string, at: number, length: number): Run[] {
  const from = Math.max(0, at - ROOM);
  const to = Math.min(text.length, at + length + ROOM);
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

/** A tool call's short face: its command or its description, else its name. */
function callWord(message: Message): string {
  const input = message.metadata?.toolInput ?? {};
  for (const key of ["description", "command", "pattern", "file_path"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().split("\n")[0] ?? value;
    }
  }
  return "";
}

interface Said {
  call: string | null;
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
        call: null,
        glyph: IconUser,
        text: message.content,
        title: findInWords.me,
        whose: "me",
        word: "",
      };
    case "assistant":
      return {
        call: null,
        glyph: IconAgent,
        text: message.content,
        title: agent,
        whose: "agent",
        word: "",
      };
    case "thinking":
      return {
        call: message.id,
        glyph: IconStars,
        text: message.content || (message.metadata?.thinking ?? ""),
        title: agent,
        whose: "agent",
        word: "",
      };
    case "tool.use":
      return {
        call: String(message.toolCallId ?? message.id),
        glyph: IconToolTerminal,
        text: message.metadata?.toolResult ?? "",
        title: findInWords.toolOutput(
          message.metadata?.toolName ?? findInWords.tool
        ),
        whose: "tools",
        word: callWord(message),
      };
    case "user.peer": {
      const headline = message.metadata?.reportHeadline;
      return {
        call: String(message.toolCallId ?? message.id),
        glyph: IconReport,
        text: headline ? `${headline}\n${message.content}` : message.content,
        title: message.metadata?.peerName ?? findInWords.report,
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
export function placesHeld(
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
    const stamp = message.timestamp ? Date.parse(message.timestamp) : Number.NaN;
    return [
      {
        at: Number.isNaN(stamp) ? null : stamp,
        call: said.call,
        docId: message.id,
        excerpt: excerptOf(said.text, at, needle.length),
        glyph: said.glyph,
        key: said.whose === "tools" && said.call ? `call:${said.call}` : message.id,
        live: false,
        title: said.title,
        whose: said.whose,
        word: said.word,
      },
    ];
  });
}

/** A place the hub found, in a turn the transcript has not loaded. */
function placeFound(place: FindPlace, agent: string): Place {
  const FACE: Record<Whose, { glyph: Component; title: string }> =
    {
      me: { glyph: IconUser, title: findInWords.me },
      agent: { glyph: IconAgent, title: agent },
      tools: {
        glyph: IconToolTerminal,
        title: findInWords.toolOutput(place.tool ?? findInWords.tool),
      },
      delegates: {
        glyph: IconReport,
        title: findInWords.report,
      },
    };
  const face = FACE[place.whose];
  return {
    at: place.at,
    call: place.call,
    docId: place.docId,
    excerpt: markedRuns(place.excerpt),
    glyph: place.thinking ? IconStars : face.glyph,
    key: place.whose === "tools" && place.call ? `call:${place.call}` : place.docId,
    live: false,
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
  reading = $state<{ tail: true } | { tail: false; docId: string } | null>(null);
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

  /** The transcript says where it is being read, for Back where you were. */
  readFrom(reading: () => { tail: true } | { tail: false; docId: string } | null) {
    this.#reading = reading;
    return () => {
      if (this.#reading === reading) {
        this.#reading = () => null;
      }
    };
  }

  /** The places in the turns loaded now, the live one too. */
  readonly #held = $derived.by((): Place[] => {
    const session = cawco.session(this.viewId);
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
        call: null,
        docId: "",
        excerpt: excerptOf(streaming, at, needle.length),
        glyph: IconAgent,
        key: `${this.viewId}:live`,
        live: true,
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
    const keys = new Set(held.map((place) => place.key));
    const agent = this.#agent();
    const found = this.hub.places
      .map((place) => placeFound(place, agent))
      .filter((place) => !keys.has(place.key));
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

  /** The place stepped to, among those kept; the first when none was. */
  readonly current = $derived(
    this.places.find((place) => place.key === this.at) ?? null
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
      this.listOpen = true;
      if (this.words) {
        this.#askHub();
      }
    }
    this.focusAsked += 1;
  }

  /** Close find at the place found: the caret goes back to the message. */
  close(): void {
    if (!this.open) {
      return;
    }
    // Read before find closes: closed, it holds no places.
    this.landed = this.current !== null;
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
    if (!read.ok) {
      this.hub = read.unreached
        ? { kind: "unreached", machine: this.#machine() }
        : { kind: "refused", detail: read.detail };
    } else if (read.value.machine.answered) {
      this.hub = { kind: "answered", places: read.value.places };
    } else {
      this.hub = { kind: "unreached", machine: read.value.machine.name };
    }
    if (this.at === null) {
      this.#first();
    }
  }

  #machine(): string {
    const machineId = cawco.session(this.viewId)?.machineId ?? "";
    return (
      cawco.machines.find((machine) => machine.machineId === machineId)
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

  /** A place picked from the list: stepped to, and narrow the list folds so it reads whole. */
  pick(key: string, narrow: boolean): void {
    const place = this.places.find((each) => each.key === key);
    if (place) {
      this.goTo(place);
      if (narrow) {
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
    if (place.live) {
      this.stepped += 1;
      return;
    }
    if (place.call) {
      disclosureAt(this.viewId, place.call).set(true);
    }
    this.stepped += 1;
    this.sought = place.docId;
    askOpenAt(this.viewId, place.docId);
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

/** Each conversation's find, by its view id. */
const finds = new Map<string, ConversationFind>();

/** How the hub is asked: set once by find-client's reader, or a bench's fixture. */
let asker: AskPlaces = () => Promise.resolve(null);

/** Set how every find asks the hub (the dashboard's find-client; a bench's fixture). */
export function askPlacesWith(ask: AskPlaces): void {
  asker = ask;
}

/** The find of the conversation shown as `viewId`. */
export function findIn(viewId: string): ConversationFind {
  let find = finds.get(viewId);
  if (!find) {
    find = new ConversationFind(
      viewId,
      (id, words, signal) => asker(id, words, signal),
      () =>
        cawOf(viewId) === null
          ? speakerName(cawco.session(viewId)?.harness)
          : "Caw"
    );
    finds.set(viewId, find);
  }
  return find;
}
