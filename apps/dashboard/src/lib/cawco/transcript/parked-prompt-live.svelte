<script lang="ts">
  /**
   * A session's conversation with a pick parked in its composer, as the
   * person meets it (ParkedPrompt.stories.ts): its turns, under them the
   * record of each pick already answered (ParkedRecord, at the call that
   * put it), and the real composer (Composer, the app's fleet) grown into
   * the first ask waiting: the agent's question, which holds its turn,
   * ahead of the picks, then the oldest pick, the rest queued behind it.
   *
   * A direction's drawing is the well the composer draws it in
   * (DirectionWell); where the product frames the graph's stage page in it,
   * this stands the stage's drawing in: the kit's ghost button under the
   * pointer, a command row highlighted and a field, in the direction's grey
   * at night (`DIRECTION_GREYS`). The mock stands at the queue's data: a pick
   * is written to the artifact's choices here and answers the item, as the
   * pane's queue does (parked-queue.svelte.ts), the composer folding back
   * and the next coming in, its record joining the turns; its Other line
   * and Dismiss put it down the same way. `picked`: the pick made on the
   * graph meanwhile, said in the composer before it folds.
   */
  import type { ChoiceEntry } from "@cawco/core/choices";
  import {
    type ParkedDirection,
    type ParkedItem,
    type ParkedPick,
    parkedId,
  } from "@cawco/core/parked";
  import { parkedWords } from "@cawco/core/words/parked";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { provideHub } from "#lib/cawco/hub-seam.js";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { minimizedAsks } from "#lib/cawco/minimized-asks.svelte.js";
  import Turn from "#lib/cawco/turn/Turn.svelte";
  import Who from "#lib/cawco/turn/Who.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconArchive, IconCopy, IconFolder, IconPen } from "#lib/icons.js";
  import { hubThrough } from "#lib/platform/hub.js";
  import { track } from "#lib/platform/track.js";
  import DirectionWell, {
    type DirectionDrawing,
  } from "../graph/DirectionWell.svelte";
  import Composer from "./Composer.svelte";
  import { ComposerDraft } from "./composer-draft.svelte";
  import { composerFleet } from "./composer-fleet";
  import type { ComposerAsk } from "./grown-ask.svelte";
  import ParkedRecord from "./ParkedRecord.svelte";
  import {
    createCall,
    DIRECTION_GREYS,
    QUEUED_QUESTION,
  } from "./parked-fixtures";

  let {
    items,
    settled = [],
    question = false,
    drawing = "drawn",
    picked = null,
    minimized = false,
    height = 820,
    again = 0,
  }: {
    /** The picks waiting, oldest first: the first parks in the composer. */
    items: ParkedItem[];
    /** Picks already answered: each record stands at its call in the turns. */
    settled?: ParkedItem[];
    /** The agent's question waits too: it holds its turn, so it comes up ahead of the picks. */
    question?: boolean;
    /** How the graph's stage draws each direction. */
    drawing?: "drawn" | "loading" | "failed";
    /** A direction picked on the graph while the pick stands here, by its name. */
    picked?: string | null;
    /** The first pick folded to its bar on the tray row. */
    minimized?: boolean;
    /** The frame's height, px. */
    height?: number;
    /** Start again's presses. */
    again?: number;
  } = $props();

  const frame = $props.id();
  const SESSION = `s-parked-${frame}`;
  const AGENT = "Claude Code";

  // The hub as the composer reads it: connected; nothing here reads its REST.
  provideHub({
    state: "connected",
    client: hubThrough(
      new Proxy(fetch, {
        apply: () => Promise.reject(new Error("The canvas reaches no hub.")),
      })
    ),
  });

  const draft = new ComposerDraft();
  const nothing = () => undefined;

  /** The picks answered here, as the hub's next list would hold them: each its record. */
  let answered = $state<ParkedItem[]>([]);
  /** The question answered here. */
  const asked = new SvelteSet<string>();
  /** Each artifact's choices as its doc holds them: what a pick here writes. */
  let choices = $state<Record<string, Record<string, ChoiceEntry>>>({});

  // A story's args are the live instance's inputs; Start again starts the queue afresh.
  $effect.pre(() => {
    track(again);
    track(items);
    answered = [];
    choices = {};
    asked.clear();
  });

  const entry = (patch: Partial<ChoiceEntry>): ChoiceEntry => ({
    options: [],
    note: null,
    value: null,
    pageHash: "fixture",
    at: "2026-11-24T09:30:00.000Z",
    ...patch,
  });

  /** The picks still waiting. */
  const waiting = $derived(
    items.filter(
      (item) => !answered.some((one) => parkedId(one) === parkedId(item))
    )
  );

  /** What the graph picked meanwhile, for the first pick: its file, and what the composer says. */
  const there = $derived.by(() => {
    const [first] = waiting;
    if (!(picked && first?.kind === "directions")) {
      return null;
    }
    const direction = first.directions.find((one) => one.name === picked);
    return direction
      ? {
          file: direction.file,
          said: parkedWords.pickedThere("graph", direction.name),
        }
      : null;
  });

  /** An item answered or dismissed here: its record carries what was written. */
  function answer(item: ParkedItem) {
    const kept = choices[item.artifact.id] ?? {};
    const put = kept[item.kind === "directions" ? "picked" : item.card.id];
    if (put?.dismissed) {
      answered = [
        ...answered,
        {
          ...item,
          state: "dismissed",
          dismissed: { at: put.at, note: put.note ?? "" },
        },
      ];
      return;
    }
    if (item.kind === "directions") {
      const value = kept.picked?.value;
      answered = [
        ...answered,
        {
          ...item,
          state: "answered",
          picked: typeof value === "string" ? value : null,
          pickedAt: "2026-11-24T09:30:00.000Z",
        },
      ];
      return;
    }
    const card = kept[item.card.id];
    answered = [
      ...answered,
      {
        ...item,
        state: "answered",
        answer: {
          at: "2026-11-24T09:30:00.000Z",
          options: card?.options ?? [],
          note: card?.note ?? "",
        },
      },
    ];
  }

  /** The agent's question still waits: it comes up first. */
  const questionWaits = $derived(question && !asked.has("q"));

  const ask = $derived.by((): ComposerAsk | null => {
    const [first] = waiting;
    const more = waiting.length - (questionWaits ? 0 : 1);
    if (first && !questionWaits) {
      const kept = choices[first.artifact.id] ?? {};
      return {
        kind: "parked",
        item: first,
        asker: AGENT,
        more,
        choices: there
          ? { ...kept, picked: entry({ value: there.file }) }
          : kept,
        elsewhere: there?.said ?? null,
        drawing: direction,
        onpick: (file) => {
          choices[first.artifact.id] = {
            ...kept,
            picked: entry({ value: file }),
          };
          return null;
        },
        onchoose: (card, change) => {
          choices[first.artifact.id] = {
            ...kept,
            [card]: entry({ ...kept[card], ...change }),
          };
          return null;
        },
        ondismiss: (note) => {
          const key = first.kind === "directions" ? "picked" : first.card.id;
          choices[first.artifact.id] = {
            ...kept,
            [key]: entry({ dismissed: true, note: note || null }),
          };
          return null;
        },
        onanswered: () => answer(first),
        onopen: nothing,
      };
    }
    if (!questionWaits) {
      return null;
    }
    return {
      asker: AGENT,
      more,
      onanswer: () => {
        asked.add("q");
        return null;
      },
      request: {
        heard: 0,
        instanceId: SESSION,
        requestId: "r-question",
        toolName: "AskUserQuestion",
        input: {
          questions: [
            {
              question: QUEUED_QUESTION,
              header: "Nightly",
              multiSelect: false,
              options: [
                { label: "Ship it now", description: "" },
                { label: "Wait for the checks", description: "" },
              ],
            },
          ],
        },
        presentation: {
          asker: AGENT,
          changes: [],
          fields: [],
          summary: QUEUED_QUESTION,
        },
      },
    };
  });

  // Folded to its bar as the story opens, when the story says so.
  $effect.pre(() => {
    const [first] = items;
    const fold = minimized;
    if (first) {
      // Untracked: the store reads its own set as it writes.
      untrack(() => minimizedAsks.set(parkedId(first), fold));
    }
  });

  /** The records in the turns: those the story starts with, then those answered here. */
  const records = $derived([...settled, ...answered]);
  /** How the stage draws direction `one`: a failure is the second's, whose component threw. */
  const wellOf = (one: ParkedDirection): DirectionDrawing =>
    drawing === "failed" && one.name === "Two steps up"
      ? {
          state: "failed",
          why: "This direction couldn't be drawn: HoverTwoSteps.stories.ts threw as it mounted (TypeError: tokens is undefined).",
        }
      : { state: drawing === "failed" ? "drawn" : drawing };
</script>

<!-- A direction as the graph's stage draws it, in its grey at night. -->
{#snippet direction(_pick: ParkedPick, one: ParkedDirection)}
  <DirectionWell drawing={wellOf(one)} name={one.name} onretry={nothing}>
    <div
      class="flex flex-col gap-space-3 p-space-4"
      style:--color-surface-hover={DIRECTION_GREYS[one.file]}
    >
      <div class="flex flex-wrap items-center gap-space-1">
        <!-- Its menu open: the ghost's look under the pointer. -->
        <Button
          aria-expanded={true}
          icon={IconArchive}
          label="Archive"
          size="sm"
          variant="ghost"
        />
        <Button icon={IconPen} label="Rename" size="sm" variant="ghost" />
      </div>
      <Command.Root value="move">
        <Command.List>
          <Command.Item value="move"
            ><IconFolder /><span>Move to project</span></Command.Item
          >
          <Command.Item value="copy"
            ><IconCopy /><span>Duplicate</span></Command.Item
          >
        </Command.List>
      </Command.Root>
      <Input aria-label="Session name" value="Nightly release notes" />
    </div>
  </DirectionWell>
{/snippet}

<div
  class="relative isolate flex h-(--fixture-h) flex-col overflow-clip bg-surface-raised text-ink-strong"
  data-slot="parked-fixture"
  style:--fixture-h="{height}px"
>
  <div
    class="min-h-0 flex-auto overflow-y-auto px-space-7 pt-space-6 max-desk:px-space-5"
  >
    <div class="tx-columns mx-auto max-w-c-measure">
      <Turn>
        <Who name={AGENT} />
        <MessageBody
          source="The night hover grey is the last open piece of the dark pass. I've put both greys on the real controls they reach, so you can see where each one lands."
          wrap="pretty"
        />
      </Turn>
      {#each records as record (parkedId(record))}
        <ParkedRecord
          asker={AGENT}
          items={[record]}
          message={createCall(record)}
        />
      {/each}
    </div>
  </div>
  <div class="pointer-events-none absolute inset-0 z-1">
    <Composer
      agentName={AGENT}
      {ask}
      {draft}
      fleet={composerFleet}
      onstop={nothing}
      onsubmit={nothing}
      showing={SESSION}
    />
  </div>
</div>
