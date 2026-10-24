<script lang="ts" module>
  /** Which drawing of the reader's own message. */
  export type RowOption = "strip" | "hug" | "select";
  /** Which of the reader's messages stand in the frame (msgrow.ts). */
  export type RowSet = "one" | "run" | "long" | "both" | "failed";
</script>

<script lang="ts">
  /**
   * The reader's own message in the session it was sent in, as the three
   * message-row drawings show it (their states files' fixture): the agent's
   * turn before it and its answer after (the real MessageRow), the reader's
   * message in the option's form, and the real composer under them
   * (Composer, with the app's own `composerFleet`). In option C the
   * composer answers a chosen message in its lead row (msgrow-chip). Nothing
   * reaches a hub: the stories' hub stand-in answers, and every press goes
   * nowhere.
   */
  import { untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import type { Message } from "../types";
  import Composer from "./Composer.svelte";
  import { ComposerDraft } from "./composer-draft.svelte";
  import { composerFleet } from "./composer-fleet";
  import MessageRow from "./MessageRow.svelte";
  import MessageRowHug from "./MessageRowHug.svelte";
  import MessageRowSelect from "./MessageRowSelect.svelte";
  import MessageRowStrip from "./MessageRowStrip.svelte";
  import {
    AFTER,
    BEFORE,
    FAILED,
    LONG,
    ONE,
    type RowMoment,
    RUN,
    type RunPart,
  } from "./msgrow";
  import Chip from "./msgrow-chip.svelte";

  let {
    option,
    set = "one",
    moment = "rest",
    touch = false,
    height = 460,
    pick,
  }: {
    option: RowOption;
    set?: RowSet;
    moment?: RowMoment;
    /** Which of the reader's messages, in order, the moment is about; the last when unset. */
    pick?: number;
    /** A touch screen: nothing hovers, and a finger taps. */
    touch?: boolean;
    /** The pane's least height, px: the room over the composer. */
    height?: number;
  } = $props();

  const AGENT = "Claude Code";
  const instanceId = "probe-instance";
  const said = (id: string, content: string, at: string): Message => ({
    id,
    instanceId,
    content,
    type: "assistant",
    timestamp: at,
  });

  const SETS: Record<RowSet, RunPart[][]> = {
    one: [ONE],
    run: [RUN],
    long: [LONG],
    both: [LONG, ONE],
    failed: [FAILED],
  };
  const runs = $derived(SETS[set]);
  /** The message a moment is about: the one at `pick`, else the last one the reader sent. */
  const focus = $derived(
    (pick === undefined ? runs.at(-1)?.at(-1) : runs.flat()[pick]) ?? null
  );
  /**
   * The message under the pointer; in A and B a chosen message keeps its
   * strip showing too (its focus is inside it, or it is being edited).
   */
  const hovered = $derived(
    moment === "hover" || (option !== "select" && moment === "selected")
      ? (focus?.id ?? null)
      : null
  );
  const held = $derived(
    moment === "selected" ||
      moment === "editing" ||
      (option === "select" && moment === "tap")
      ? (focus?.id ?? null)
      : null
  );

  /** Option C's chosen message: the moment's, then the person's own clicks. */
  let chosen = $state<string | null>(null);
  $effect.pre(() => {
    chosen = held;
  });
  const chosenPart = $derived(
    runs.flat().find((part) => part.id === chosen) ?? null
  );
  /** What the composer's chip shows of it. */
  const chipMode = $derived.by(() => {
    if (moment === "editing") {
      return "editing" as const;
    }
    return chosenPart?.failed ? ("failed" as const) : ("selected" as const);
  });
  const CLOCK = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const draft = new ComposerDraft();
  untrack(() => {
    if (moment === "editing" && focus) {
      draft.text = focus.content;
    }
  });
  /** The lead row's height: the transcript keeps that much more room over the pill. */
  let leadH = $state(0);
</script>

{#snippet lead()}
  {#if chosenPart}
    <div
      class="w-full min-w-0"
      {@attach frameSize<HTMLElement>((node) => {
        leadH = node.offsetHeight;
      })}
    >
      <Chip
        at={CLOCK.format(new Date(chosenPart.at))}
        mode={chipMode}
        onclose={() => {
          chosen = null;
        }}
        {touch}
      />
    </div>
  {/if}
{/snippet}

<!-- The app shell's tooltip provider, which every tooltip in the pane reads. -->
<TooltipProvider>
  <div
    data-slot="msgrow-frame"
    class="relative w-full min-h-(--frame-h) overflow-clip bg-surface-page"
    style:--frame-h="{height}px"
  >
    <div
      data-slot="tx"
      class="flex flex-col justify-end min-h-(--frame-h) pt-space-6 pb-(--tx-room) ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 tx-columns"
      style:--tx-room="calc(var(--c-composer-panel) + var(--c-tray-row) + {chosenPart
        ? leadH
        : 0}px + {chosenPart ? 'var(--space-2)' : '0px'} + var(--space-4))"
    >
      <MessageRow
        agentName={AGENT}
        message={said("a-before", BEFORE, "2026-10-24T11:37:00")}
      />
      {#each runs as parts, r (r)}
        {#if r > 0}
          <MessageRow
            agentName={AGENT}
            message={said(
              "a-between",
              "The headline, then. I'll keep the button as it is for now.",
              "2026-10-24T11:39:00"
            )}
          />
        {/if}
        {#if option === "strip"}
          <MessageRowStrip
            {hovered}
            menuOpen={moment === "tap"}
            {parts}
            selected={held}
            {touch}
          />
        {:else if option === "hug"}
          <MessageRowHug
            {hovered}
            menuOpen={moment === "tap"}
            {parts}
            selected={held}
            {touch}
          />
        {:else}
          <MessageRowSelect
            {hovered}
            onselect={(id) => {
              chosen = id;
            }}
            {parts}
            selected={chosen}
          />
        {/if}
      {/each}
      <MessageRow
        agentName={AGENT}
        message={said("a-after", AFTER, "2026-10-24T11:43:00")}
      />
    </div>
    <Composer
      agentName={AGENT}
      {draft}
      fleet={composerFleet}
      lead={option === "select" && chosenPart ? lead : undefined}
      onstop={() => undefined}
      onsubmit={() => undefined}
    />
  </div>
</TooltipProvider>
