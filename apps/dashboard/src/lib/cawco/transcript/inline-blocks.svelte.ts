/**
 * An agent's blocks in one conversation (tsk-330): each named `openui`
 * fence in its replies (core inline-blocks.ts), which of them is the newest
 * version under its name, which name was kept as an artifact, and what the
 * reader's screen keeps of each block.
 *
 * - **Versions** are read off the conversation's own text: its settled
 *   replies (each read once, by the message, `fencesOf`) and the reply being
 *   written. The newest fence under a name is its `latest`; every earlier
 *   one a `fossil`. A block is one fence: its message (`at`, the message's
 *   id, or `live` while it is written), its name, and which of that name's
 *   fences in the message it is (`nth`).
 * - **Kept**: a name whose slug names a page artifact of the session's
 *   (Files' read of its artifacts, files.svelte.ts) is `promoted`.
 * - **Reader state** lives here, outside the row, as the disclosures do
 *   (disclosure.svelte.ts): virtua takes a row down when it scrolls away
 *   and builds it again when it comes back. Each block's measured height
 *   stands in for it until it draws again, and a replaced block's drawing
 *   is kept as plain markup (`frozen`), so it never runs its renderer again.
 * - **Jump to latest version** asks the transcript to bring the newest
 *   version's row into view (`reveal`, read by Transcript as it reads
 *   `trayReveal`), and that block is marked for a moment (`marked`).
 */

import { fnv1a } from "@cawco/core/fnv1a";
import {
  type InlineBlockFence,
  inlineBlockSlug,
  inlineBlocksIn,
} from "@cawco/core/inline-blocks";
import type { ArtifactSummary } from "@cawco/core/protocol";
import {
  type Component,
  type ComponentProps,
  getContext,
  setContext,
} from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { dur } from "../../platform/motion/curves.svelte";
import type { SessionState } from "../client.svelte";
import { artifactsOf, readArtifacts } from "../files/files.svelte";
import { LIVE_REPLY as LIVE } from "../markdown-blocks";
import type { Message } from "../types";
import type InlineBlock from "./InlineBlock.svelte";

/** Where a block stands in its conversation: its reply, and which fence of its name in it. */
export interface BlockPlace {
  /** Its reply: the message's id, or {@link LIVE} for the reply being written. */
  at: string;
  name: string;
  nth: number;
}

/** What a block is now: the newest under its name, replaced by a later one, or kept as an artifact. */
export type BlockState = "latest" | "fossil" | "promoted";

/** Each settled reply's fences, read once per message. */
const fenced = new WeakMap<Message, InlineBlockFence[]>();
const fencesOf = (message: Message): InlineBlockFence[] => {
  let found = fenced.get(message);
  if (!found) {
    found = message.type === "assistant" ? inlineBlocksIn(message.content) : [];
    fenced.set(message, found);
  }
  return found;
};

/** The newest place of each name in `fences`, a reply at `at`. */
const newestIn = (
  at: string,
  fences: readonly InlineBlockFence[],
  into: Map<string, BlockPlace>
): void => {
  const seen = new Map<string, number>();
  for (const { name } of fences) {
    const nth = seen.get(name) ?? 0;
    seen.set(name, nth + 1);
    into.set(name, { at, name, nth });
  }
};

const same = (a: BlockPlace, b: BlockPlace): boolean =>
  a.at === b.at && a.name === b.name && a.nth === b.nth;

/** A block's key in the reader's state and on its element. */
export const blockKey = (session: string, place: BlockPlace): string =>
  `${session}\u0000${place.at}\u0000${place.name}\u0000${place.nth}`;

/** What the reader's screen keeps of one block, by its key and its program. */
interface Kept {
  /** Its replaced drawing, as plain markup: cloned in, never drawn again. */
  frozen?: Element;
  /** Its drawn height, px. */
  height?: number;
}
const kept = new Map<string, Kept>();

/**
 * A block's reader state: its height and its frozen drawing, kept outside
 * its row, by its key and its program (a reply being written is `live` for
 * every turn, so its place alone names more than one block).
 */
export const keptOf = (key: string, source: string): Kept => {
  const at = `${key}\u0000${fnv1a(source).toString(36)}`;
  let one = kept.get(at);
  if (!one) {
    one = {};
    kept.set(at, one);
  }
  return one;
};

/** The block each conversation asks its transcript to bring into view: by session. */
export const blockReveal = new SvelteMap<string, BlockPlace>();

/** What a conversation's blocks are read from: its session's replies, and the one being written. */
type BlockSource = Pick<SessionState, "instanceId" | "messages" | "streaming">;

/** One conversation's blocks, read off its session. */
export class ConversationBlocks {
  readonly #session: () => BlockSource;
  readonly #keptAs: ((slug: string) => ArtifactSummary | undefined) | null;
  /** The block marked as the reader jumped to it, and whether the mark is fading. */
  marked = $state<{ key: string; state: "on" | "off" } | null>(null);
  #asked = false;

  /**
   * Over `session`; `keptAs`, where a block's slug finds its artifact, is
   * the session's artifacts as Files reads them unless given (a fixture's
   * own list).
   */
  constructor(
    session: () => BlockSource,
    keptAs?: (slug: string) => ArtifactSummary | undefined
  ) {
    this.#session = session;
    this.#keptAs = keptAs ?? null;
  }

  get instanceId(): string {
    return this.#session().instanceId;
  }

  /** The newest place of each name in the settled replies. */
  readonly #settled = $derived.by(() => {
    const newest = new Map<string, BlockPlace>();
    for (const message of this.#session().messages) {
      const fences = fencesOf(message);
      if (fences.length > 0) {
        newestIn(message.id, fences, newest);
      }
    }
    return newest;
  });

  /** The reply being written's fences, read again as it grows. */
  readonly #live = $derived.by(() => inlineBlocksIn(this.#session().streaming));

  /** The newest place of each name in the reply being written. */
  readonly #liveNewest = $derived.by(() => {
    const newest = new Map<string, BlockPlace>();
    newestIn(LIVE, this.#live, newest);
    return newest;
  });

  /** The newest place of `name`: the reply being written's, else the settled replies'. */
  newest(name: string): BlockPlace | undefined {
    return this.#liveNewest.get(name) ?? this.#settled.get(name);
  }

  /**
   * Which fence of its name in reply `at` a block is, by its program: the
   * one whose program it is, else the last (a fence still being written,
   * whose drawn program trails the reply's text).
   */
  nthOf(at: string, name: string, source: string): number {
    const fences =
      at === LIVE
        ? this.#live
        : (() => {
            const message = this.#session().messages.find(
              (one) => one.id === at
            );
            return message ? fencesOf(message) : [];
          })();
    const mine = fences.filter((fence) => fence.name === name);
    const found = mine.findIndex((fence) => fence.source === source);
    return found === -1 ? Math.max(0, mine.length - 1) : found;
  }

  /** The page artifact a name was kept as, from the session's artifacts; reads them once. */
  keptAs(name: string): ArtifactSummary | undefined {
    const slug = inlineBlockSlug(name);
    if (this.#keptAs) {
      return this.#keptAs(slug);
    }
    const read = artifactsOf(this.instanceId);
    if (!(read || this.#asked)) {
      this.#asked = true;
      queueMicrotask(() => readArtifacts(this.instanceId));
    }
    return read?.list?.find(
      (artifact) => artifact.kind === "page" && artifact.name === slug
    );
  }

  /** What the block at `place` is now. */
  stateOf(place: BlockPlace): BlockState {
    const newest = this.newest(place.name);
    if (newest && !same(newest, place)) {
      return "fossil";
    }
    return this.keptAs(place.name) ? "promoted" : "latest";
  }

  /** Brings the newest version of `name` into view, and marks it for a moment. */
  jump(name: string): void {
    const newest = this.newest(name);
    if (!newest) {
      return;
    }
    blockReveal.set(this.instanceId, newest);
    const key = blockKey(this.instanceId, newest);
    this.marked = { key, state: "on" };
    setTimeout(() => {
      if (this.marked?.key !== key) {
        return;
      }
      this.marked = { key, state: "off" };
      setTimeout(() => {
        if (this.marked?.key === key && this.marked.state === "off") {
          this.marked = null;
        }
      }, dur("--duration-panel"));
    }, dur("--duration-hold"));
  }
}

const KEY = Symbol("inline-blocks");

/** The conversation whose replies the markdown under this component draws blocks for. */
export function provideInlineBlocks(blocks: ConversationBlocks): void {
  setContext(KEY, blocks);
}

/** The conversation's blocks here, or none outside a transcript (a block there stays code). */
export const inlineBlocksHere = (): ConversationBlocks | undefined =>
  getContext<ConversationBlocks | undefined>(KEY);

/**
 * InlineBlock, with the block library and lang-core's runtime it draws
 * with, once the first block of the session has come near the view
 * (TranscriptBlock): a transcript with no block loads none of it.
 */
export const loadedBlock = $state<{
  InlineBlock: Component<ComponentProps<typeof InlineBlock>> | null;
}>({ InlineBlock: null });
let asked = false;

/** Loads InlineBlock once; {@link loadedBlock} holds it when it has come. */
export const loadInlineBlock = (): void => {
  if (asked) {
    return;
  }
  asked = true;
  import("./InlineBlock.svelte").then((module) => {
    loadedBlock.InlineBlock = module.default;
  });
};
