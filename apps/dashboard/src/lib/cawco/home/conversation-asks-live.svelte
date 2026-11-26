<script lang="ts">
  /**
   * What waits on him, answered in the conversation it belongs to (tsk-521,
   * his pick): Caw's panel lists each conversation with how many things
   * wait in it, beside what no conversation holds (a machine that stopped
   * answering, a task in review), and a press on a conversation opens it
   * with its newest ask up on its composer. A conversation's composer holds
   * only its own asks and picks and its delegates', each card titled by the
   * session that asks; another conversation's never reach it.
   *
   * The conversation, the composer, the cards, the panel and its rows are
   * the product's; the lane is needs-fixtures.ts, and what the hub would do
   * with an answer is this file's: the ask leaves the composer, and the
   * conversation's count drops, its row leaving with its last ask.
   */
  import type { ChoiceEntry } from "@cawco/core/choices";
  import type {
    ParkedDirection,
    ParkedItem,
    ParkedPick,
  } from "@cawco/core/parked";
  import { untrack } from "svelte";
  import { provideHub } from "#lib/cawco/hub-seam.js";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { minimizedAsks } from "#lib/cawco/minimized-asks.svelte.js";
  import Turn from "#lib/cawco/turn/Turn.svelte";
  import Who from "#lib/cawco/turn/Who.svelte";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { hubThrough } from "#lib/platform/hub.js";
  import CawCardFrame from "../hang-frames/caw-card-frame.svelte";
  import Composer from "../transcript/Composer.svelte";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";
  import { composerFleet } from "../transcript/composer-fleet";
  import DirectionStandIn from "../transcript/DirectionStandIn.svelte";
  import { askIdOf, type ComposerAsk } from "../transcript/grown-ask.svelte";
  import CawPanel from "./CawPanel.svelte";
  import type { CawFeed } from "./caw-feed.svelte";
  import type {
    ArtifactItem,
    ConversationItem,
    NeedsEntry,
  } from "./home-state.svelte";
  import type { NeedsAnswers } from "./needs-answer.svelte";
  import { ASKERS, CHATS, NEEDS, PICKS } from "./needs-fixtures";

  let {
    shows = "s-antigravity",
    start = null,
    panel = false,
    again = 0,
  }: {
    /** The conversation he is in, by its session. */
    shows?: string;
    /** A conversation's row pressed as it starts, by its key: it opens with its newest ask up. */
    start?: string | null;
    /** Caw's panel stands open as it starts. */
    panel?: boolean;
    /** Start again: every ask back. */
    again?: number;
  } = $props();

  // The hub as the composer reads it: connected; nothing here reads its REST.
  provideHub({
    state: "connected",
    client: hubThrough(
      new Proxy(fetch, {
        apply: () => Promise.reject(new Error("The canvas reaches no hub.")),
      })
    ),
  });

  const AGENT = "Caw";
  const draft = new ComposerDraft();

  /** What the panel would list now: the fixture, less what was answered. */
  let needs = $state<NeedsEntry[]>([]);
  /** The picks of each artifact answered, by `artifact:key`. */
  let done = $state<string[]>([]);
  let choices = $state<Record<string, Record<string, ChoiceEntry>>>({});
  /** The ask a row's press brought up, ahead of the rest. */
  let front = $state<string | null>(null);
  let panelOpen = $state(false);
  /** The conversation he is in, by its session. */
  let here = $state("s-antigravity");

  const picksOf = (artifactId: string): ParkedItem[] =>
    (PICKS[artifactId] ?? []).filter(
      (one) => !done.includes(`${artifactId}:${one.key}`)
    );

  /** The conversation he is in, as the panel lists it; null once nothing waits in it. */
  const conversation = $derived(
    needs.find(
      (entry): entry is ConversationItem =>
        entry.kind === "conversation" && entry.instanceId === here
    ) ?? null
  );

  /** What still waits in `entry`: its asks, and its artifacts with a pick still open, counted as the product counts them. */
  function recount(entry: ConversationItem): NeedsEntry[] {
    const items = entry.items.filter(
      (one) => one.kind === "ask" || picksOf(one.artifactId).length > 0
    );
    if (items.length === 0) {
      return [];
    }
    const waiting = items.reduce(
      (sum, one) =>
        sum + (one.kind === "ask" ? 1 : picksOf(one.artifactId).length),
      0
    );
    return [{ ...entry, items, waiting }];
  }

  /** `key` answered: it leaves its conversation, which leaves the panel with its last. */
  function leave(key: string): void {
    needs = needs.flatMap((entry): NeedsEntry[] =>
      entry.kind === "conversation"
        ? recount({
            ...entry,
            items: entry.items.filter((one) => one.key !== key),
          })
        : [entry]
    );
  }

  /** A pick of a page or a design answered here: its conversation counts one fewer. */
  function pickDone(artifact: ArtifactItem, pick: ParkedItem): void {
    done = [...done, `${artifact.artifactId}:${pick.key}`];
    leave("");
  }

  const choice = (patch: Partial<ChoiceEntry>): ChoiceEntry => ({
    options: [],
    note: null,
    value: null,
    pageHash: "fixture",
    at: new Date().toISOString(),
    ...patch,
  });

  /** A pick of `artifact`, as the composer takes it: named by the session that asks. */
  function parkedAsk(artifact: ArtifactItem, pick: ParkedItem): ComposerAsk {
    const id = artifact.artifactId;
    const key = pick.kind === "card" ? pick.card.id : "picked";
    const kept = () => choices[id] ?? {};
    return {
      kind: "parked",
      asker: ASKERS[id] ?? artifact.title,
      more: 0,
      item: pick,
      choices: choices[id] ?? {},
      elsewhere: null,
      drawing: direction,
      onpick: (file) => {
        choices[id] = { ...kept(), picked: choice({ value: file }) };
        return null;
      },
      onchoose: (card, change) => {
        choices[id] = {
          ...kept(),
          [card]: choice({ ...kept()[card], ...change }),
        };
        return null;
      },
      onwords: (words) => {
        choices[id] = {
          ...kept(),
          [key]: choice({ ownWords: true, note: words }),
        };
        return null;
      },
      onanswered: () => pickDone(artifact, pick),
    };
  }

  /**
   * Every ask the composer holds, in the order it takes them, as the
   * product orders them: the asks first, oldest raised first, then the
   * picks, oldest put first; each with the Needs you item it stands for.
   */
  const waiting = $derived.by((): { ask: ComposerAsk; item: string }[] => {
    const items = (conversation?.items ?? []).toReversed();
    return [
      ...items.flatMap((one) =>
        one.kind === "ask"
          ? [
              {
                item: one.key,
                ask: {
                  asker: one.title,
                  more: 0,
                  request: one.request,
                  onanswer: () => {
                    leave(one.key);
                    return null;
                  },
                } satisfies ComposerAsk,
              },
            ]
          : []
      ),
      ...items.flatMap((one) =>
        one.kind === "artifact"
          ? picksOf(one.artifactId).map((pick) => ({
              item: one.key,
              ask: parkedAsk(one, pick),
            }))
          : []
      ),
    ];
  });

  /** The ask up on the composer: the one a press brought up, else the first in order. */
  const ask = $derived.by((): ComposerAsk | null => {
    const first =
      waiting.find((one) => askIdOf(one.ask) === front) ?? waiting[0];
    return first ? { ...first.ask, more: waiting.length - 1 } : null;
  });

  // A story's args are the live instance's inputs; Start again starts afresh.
  $effect.pre(() => {
    [again, shows, panel].join();
    untrack(() => {
      needs = structuredClone(NEEDS);
      done = [];
      choices = {};
      front = null;
      panelOpen = panel;
      here = shows;
    });
  });

  const answers: NeedsAnswers = {
    /** A conversation's row pressed: the panel closes, and it opens with its newest ask up. */
    press(pressed) {
      here = pressed.instanceId;
      const [newest] = pressed.items;
      const first = waiting.find((one) => one.item === newest?.key);
      front = first ? askIdOf(first.ask) : null;
      if (front !== null) {
        minimizedAsks.set(front, false);
      }
      panelOpen = false;
    },
  };

  // A row pressed as it starts: its conversation open, its newest ask up.
  $effect.pre(() => {
    const key = start;
    String(again);
    if (key === null) {
      return;
    }
    untrack(() => {
      const pressed = needs.find(
        (one): one is ConversationItem =>
          one.kind === "conversation" && one.key === key
      );
      if (pressed) {
        answers.press(pressed);
      }
    });
  });

  const feed: CawFeed = {
    acknowledge: () => undefined,
    actOnUpdate: () => undefined,
    artifactNotices: [],
    connected: true,
    dismissUpdate: () => undefined,
    live: true,
    moved: [],
    get needs() {
      return needs;
    },
    noticesDamaged: null,
    rebalanced: [],
    resetNotices: () => Promise.resolve(),
    updated: null,
  };

  /** The frame's width, as it lays out: the shell the card and the page read. */
  let width = $state(0);
  const measure = frameSize(
    (node: HTMLElement) => node.clientWidth,
    (next) => {
      width = next;
    }
  );
  const chatWords = $derived(CHATS[here] ?? { you: "", agent: "" });
</script>

<!-- A direction as the graph's stage draws it, in its grey at night. -->
{#snippet direction(_pick: ParkedPick, one: ParkedDirection)}
  <DirectionStandIn direction={one} />
{/snippet}

<!-- The conversation he is in. -->
{#snippet chat()}
  <div
    class="absolute inset-x-0 top-c-top-bar-h bottom-0 isolate flex flex-col overflow-clip bg-surface-raised text-ink-strong"
    data-slot="chat"
  >
    <div
      class="min-h-0 flex-auto overflow-y-auto px-space-7 pt-space-6 max-desk:px-space-5"
    >
      <div class="tx-columns mx-auto max-w-c-measure">
        <Turn you>
          <Who name="You" shown you />
          <MessageBody source={chatWords.you} wrap="pretty" />
        </Turn>
        <Turn>
          <Who name={AGENT} />
          <MessageBody source={chatWords.agent} wrap="pretty" />
        </Turn>
      </div>
    </div>
    <div
      class="pointer-events-none absolute inset-0 z-1"
      data-slot="composer-dock"
    >
      <Composer
        {ask}
        agentName={AGENT}
        {draft}
        fleet={composerFleet}
        onstop={() => undefined}
        onsubmit={() => undefined}
        paneVisible
        showing={here}
      />
    </div>
  </div>
{/snippet}

<div class="w-full" {@attach measure}>
  {#if width > 0}
    <CawCardFrame
      height={900}
      oncaw={() => {
        panelOpen = !panelOpen;
      }}
      open={panelOpen}
      page={chat}
      {width}
    >
      <CawPanel
        {answers}
        {feed}
        onchoose={() => undefined}
        quiet="All caught up"
      />
    </CawCardFrame>
  {/if}
</div>
