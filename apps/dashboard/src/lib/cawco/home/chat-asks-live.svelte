<script lang="ts">
  /**
   * What waits on him, answered in the conversation he is in (shaping
   * tsk-521, his pick): the project's conversation with Caw under the top
   * bar, and every question, open decision card, design pick, pin question
   * and permission from the fleet coming to its composer as its own card,
   * the lean card (only what answering needs), its title naming the session
   * that asks. Caw's panel stays the short list of what waits: a press on a
   * row closes it and brings that ask up in the composer. Each ask waits
   * folded on the composer's bar until he opens it there or from the panel
   * (his pick, "Folded on the bar"). `where`
   * "none": he is on a page with no conversation; a press on a row takes
   * him to his last conversation with that ask up.
   *
   * The conversation, the composer, the cards, the panel and its rows are
   * the product's; the lane is needs-fixtures.ts, and what the hub would do
   * with an answer is this file's: the ask leaves the composer and its row
   * leaves the panel.
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
  import type { NeedsEntry, NeedsItem } from "./home-state.svelte";
  import type { NeedsAnswers } from "./needs-answer.svelte";
  import { ASKERS, NEEDS, PICKS } from "./needs-fixtures";

  let {
    where = "chat",
    start = null,
    panel = false,
    again = 0,
  }: {
    /** A row of the panel pressed as it starts, by its key: its ask is up on the composer. */
    start?: string | null;
    /** He is in a conversation, or on a page with none. */
    where?: "chat" | "none";
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

  const SESSION = "s-cawco-dev-caw";
  const AGENT = "Caw";
  const draft = new ComposerDraft();

  /** What the hub would list now: the fixture, less what was answered. */
  let needs = $state<NeedsEntry[]>([]);
  /** The picks of each artifact answered, by `artifact:key`. */
  let done = $state<string[]>([]);
  let choices = $state<Record<string, Record<string, ChoiceEntry>>>({});
  /** The ask he brought up from the panel, ahead of the rest. */
  let front = $state<string | null>(null);
  let panelOpen = $state(false);
  /** He is in a conversation: on a page with none, a press on a row takes him to his last. */
  let inChat = $state(true);

  /** Every item, in the order the panel lists them, newest first. */
  const items = (list: NeedsEntry[]): NeedsItem[] =>
    list.flatMap((row) => (row.kind === "work" ? row.items : [row]));

  const picksOf = (artifactId: string): ParkedItem[] =>
    (PICKS[artifactId] ?? []).filter(
      (one) => !done.includes(`${artifactId}:${one.key}`)
    );

  /** An ask from elsewhere, as the composer takes it: the row it came from, and its card. */
  interface Waiting {
    ask: ComposerAsk;
    row: string;
  }

  /** `key` answered: it leaves the panel, and a piece of work with nothing left in it leaves too. */
  function leave(key: string): void {
    needs = needs.flatMap((row): NeedsEntry[] => {
      if (row.kind !== "work") {
        return row.key === key ? [] : [row];
      }
      const rest = row.items.filter((one) => one.key !== key);
      if (rest.length === 0 && row.task?.reason === null) {
        return [];
      }
      return [{ ...row, items: rest }];
    });
  }

  const entry = (patch: Partial<ChoiceEntry>): ChoiceEntry => ({
    options: [],
    note: null,
    value: null,
    pageHash: "fixture",
    at: new Date().toISOString(),
    ...patch,
  });

  /** A pick of a page or a design answered here; the row leaves once none of its picks is open. */
  function pickDone(row: string, artifactId: string, pick: ParkedItem): void {
    done = [...done, `${artifactId}:${pick.key}`];
    if (picksOf(artifactId).length === 0) {
      leave(row);
    }
  }

  /** Every ask from elsewhere, newest first, as the composer takes them. */
  const waiting = $derived.by((): Waiting[] =>
    items(needs).flatMap((one): Waiting[] => {
      if (one.kind === "ask") {
        return [
          {
            row: one.key,
            ask: {
              asker: one.title,
              fromElsewhere: true,
              more: 0,
              request: one.request,
              onanswer: () => {
                leave(one.key);
                return null;
              },
            },
          },
        ];
      }
      if (one.kind !== "artifact") {
        return [];
      }
      return picksOf(one.artifactId).map((pick) => {
        const key = pick.kind === "card" ? pick.card.id : "picked";
        const kept = () => choices[one.artifactId] ?? {};
        return {
          row: one.key,
          ask: {
            kind: "parked",
            asker: ASKERS[one.artifactId] ?? one.title,
            fromElsewhere: true,
            more: 0,
            item: pick,
            choices: choices[one.artifactId] ?? {},
            elsewhere: null,
            drawing: direction,
            onpick: (file) => {
              choices[one.artifactId] = {
                ...kept(),
                picked: entry({ value: file }),
              };
              return null;
            },
            onchoose: (card, change) => {
              choices[one.artifactId] = {
                ...kept(),
                [card]: entry({ ...kept()[card], ...change }),
              };
              return null;
            },
            onwords: (words) => {
              choices[one.artifactId] = {
                ...kept(),
                [key]: entry({ ownWords: true, note: words }),
              };
              return null;
            },
            onanswered: () => pickDone(one.key, one.artifactId, pick),
          },
        };
      });
    })
  );

  /** The ask up on the composer: the one he brought up, else the newest. */
  const ask = $derived.by((): ComposerAsk | null => {
    if (!inChat) {
      return null;
    }
    const first =
      waiting.find((one) => askIdOf(one.ask) === front) ?? waiting[0];
    return first ? { ...first.ask, more: waiting.length - 1 } : null;
  });

  // A story's args are the live instance's inputs; Start again starts afresh.
  $effect.pre(() => {
    [again, where, panel].join();
    untrack(() => {
      needs = structuredClone(NEEDS);
      done = [];
      choices = {};
      front = null;
      panelOpen = panel;
      inChat = where === "chat";
    });
  });

  // An ask from elsewhere waits on the composer's bar until he opens it
  // there or from the panel.
  $effect.pre(() => {
    const ids = waiting.map((one) => askIdOf(one.ask));
    const opened = front;
    untrack(() => {
      for (const id of ids) {
        minimizedAsks.set(id, id !== opened);
      }
    });
  });

  const answers: NeedsAnswers = {
    /** A row pressed: the panel closes and its first ask comes up in his conversation, his last one if he is in none. */
    press(key) {
      const first = waiting.find((one) => one.row === key);
      if (!first) {
        return;
      }
      const id = askIdOf(first.ask);
      minimizedAsks.set(id, false);
      front = id;
      inChat = true;
      panelOpen = false;
    },
  };

  // A row pressed as it starts: its ask up on the composer.
  $effect.pre(() => {
    const key = start;
    String(again);
    if (key !== null) {
      untrack(() => answers.press(key));
    }
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
</script>

<!-- A direction as the graph's stage draws it, in its grey at night. -->
{#snippet direction(_pick: ParkedPick, one: ParkedDirection)}
  <DirectionStandIn direction={one} />
{/snippet}

<!-- The conversation he is in: the project's, with Caw. -->
{#snippet chat()}
  {#if inChat}
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
            <MessageBody
              source="Where are we on the Needs you rework? I want the panel to stay a short list."
              wrap="pretty"
            />
          </Turn>
          <Turn>
            <Who name={AGENT} />
            <MessageBody
              source="The panel now lists what waits and nothing else. Questions from the rest of the fleet come here, one card at a time, so you answer them without leaving this chat."
              wrap="pretty"
            />
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
          showing={SESSION}
        />
      </div>
    </div>
  {/if}
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
