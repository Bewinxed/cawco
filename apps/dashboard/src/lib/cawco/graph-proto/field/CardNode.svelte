<script lang="ts" module>
  import type { Judge } from "../shared/judge.svelte";

  export interface CardData extends Record<string, unknown> {
    held: boolean;
    judge: Judge;
    /** The kept state: its card is the live card's room, the live card standing over it. */
    kept: boolean;
    /** A resting pointer or a held finger previews it; null lets it go. */
    onhold: (story: string | null) => void;
    /** A press keeps it. */
    onkeep: (story: string) => void;
    story: string;
  }
</script>

<script lang="ts">
  /**
   * A state on the field: a card with its name and its account (T5: never
   * a bare dot), a seen mark once the person has stood on it, its remarks'
   * count dimmed (they are the kept state's on the live card), and "No way
   * in" or "No way on" where no arrow reaches or leaves it. The kept state's
   * card is the live card's room: the live component stands over it.
   */
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { IconChat, IconEye } from "#lib/icons.js";
  import { noWayIn, noWayOn, stateOf } from "../shared/review.svelte";

  let { data }: NodeProps = $props();
  const card = $derived(data as CardData);
  const state = $derived(stateOf(card.story));
  const seen = $derived(card.judge.seen.includes(card.story));
  const remarks = $derived(card.judge.remarksOn(card.story).length);
  let timer: ReturnType<typeof setTimeout> | undefined;
</script>

<div
  class="relative size-full"
  style:--xy-handle-background-color="transparent"
  style:--xy-handle-border-color="transparent"
>
  <Handle
    id="in"
    isConnectable={false}
    position={Position.Left}
    type="target"
  />
  {#if !card.kept}
    <button
      class={[
        "flex size-full flex-col items-start gap-space-row rounded-md px-space-3 py-space-2 text-start touch-hit transition-colors duration-(--dur-control) ease-out focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring",
        card.held
          ? "bg-surface-hover inset-ring inset-ring-border-control"
          : "bg-surface-raised inset-ring inset-ring-border-hairline hover:bg-surface-hover",
      ]}
      data-card={card.story}
      onclick={() => card.onkeep(card.story)}
      onpointerdown={(event) => {
        if (event.pointerType !== "mouse") {
          timer = setTimeout(
            () => card.onhold(card.story),
            dur("--dur-press-hold")
          );
        }
      }}
      onpointerenter={(event) => {
        if (event.pointerType === "mouse") {
          card.onhold(card.story);
        }
      }}
      onpointerleave={() => {
        clearTimeout(timer);
        card.onhold(null);
      }}
      onpointerup={() => clearTimeout(timer)}
      type="button"
    >
      <span class="flex w-full items-center gap-space-1">
        <span class="min-w-0 flex-1 truncate type-label text-ink-strong"
          >{state.name}</span
        >
        {#if remarks > 0}
          <span
            aria-label={words.openRemarks(remarks)}
            role="img"
            class="flex items-center gap-px type-meta text-ink-subtle tabular-nums"
            ><IconChat class="size-icon-sm" />{remarks}</span
          >
        {/if}
        {#if seen}
          <IconEye
            aria-label={words.seen}
            class="size-icon-sm text-ink-subtle"
          />
        {/if}
      </span>
      <span class="line-clamp-2 type-meta text-ink-muted">{state.note}</span>
      {#if noWayIn(card.story)}
        <span class="type-meta text-ink-subtle">{words.noWayIn}</span>
      {:else if noWayOn(card.story)}
        <span class="type-meta text-ink-subtle">{words.noWayOn}</span>
      {/if}
    </button>
  {/if}
  <Handle
    id="out"
    isConnectable={false}
    position={Position.Right}
    type="source"
  />
</div>
