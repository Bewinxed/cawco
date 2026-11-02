<script lang="ts">
  /**
   * One state of the component in front (spec, The states): its name, its
   * one-line note, its marks (a failure, and a hole in its machine: nothing
   * reaches it, nothing leaves it), each a glyph and words in the status
   * ink, and its variants as named choices. One press: resting a fine
   * pointer on it previews it on the stage, pressing keeps it (a tap keeps
   * it too); while comparing, a press compares it with the kept one. The
   * kept state wears the selection wash, the compared one the changed
   * ring's edge.
   *
   * Its words are its name for a pin: the panel's Comment mode names a
   * remark on it by them ("State item · Failed save The hub didn't
   * answer…"). A row in the journey and the room's list; a card in the
   * whole set (`form="node"`), `c-graph-node-w` wide.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { IconError, IconWarningTriangle } from "#lib/icons.js";
  import type { GraphState, Holes } from "./model";

  let {
    state,
    holes,
    form = "row",
    kept = false,
    keptVariant = null,
    compared = false,
    onpreview,
    onpress,
  }: {
    state: GraphState;
    holes: Holes;
    form?: "row" | "node";
    /** It is the kept state. */
    kept?: boolean;
    /** The kept variant's id, when the kept state is this one. */
    keptVariant?: string | null;
    /** It is the state compared with the kept one. */
    compared?: boolean;
    /** A fine pointer rests on it (or its variant), or left it (null). */
    onpreview: (variant: string | null) => void;
    /** It (or its variant) was pressed. */
    onpress: (variant: string) => void;
  } = $props();

  const fine =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const first = $derived(state.variants[0]?.id ?? state.id);
  const others = $derived(state.variants.slice(1));
</script>

<div
  data-slot="state-item"
  data-form={form}
  data-kept={kept ? "" : undefined}
  data-compared={compared ? "" : undefined}
  class={[
    "group/state relative flex min-w-0 flex-col rounded-md",
    form === "node"
      ? "w-c-graph-node-w border border-border-control bg-surface-raised shadow-tile"
      : "w-full",
    kept && "bg-selected-bg",
    compared &&
      "outline-solid outline-(length:--c-change-ring-width) outline-c-change-ring",
  ]}
>
  <button
    type="button"
    aria-current={kept ? "true" : undefined}
    class={[
      "touch-hit flex min-w-0 flex-col items-start gap-space-1 rounded-md px-space-3 py-space-2 text-start transition-control can-hover:hover:bg-surface-hover",
      kept && "can-hover:hover:bg-selected-bg",
    ]}
    onpointerenter={() => {
      if (fine) {
        onpreview(first);
      }
    }}
    onpointerleave={() => {
      if (fine) {
        onpreview(null);
      }
    }}
    onclick={() => onpress(first)}
  >
    <span
      class={[
        "type-label min-w-0 wrap-anywhere",
        kept ? "text-selected-ink" : "text-ink-row",
      ]}>{state.name}</span
    >
    {#if state.note}
      <span
        class={[
          "type-meta line-clamp-2 min-w-0 text-pretty",
          kept ? "text-selected-ink" : "text-ink-muted",
        ]}>{state.note}</span
      >
    {/if}
    {#if state.failure || !holes.reaches || !holes.leaves}
      <span class="flex flex-wrap gap-x-space-3 gap-y-space-1">
        {#if state.failure}
          <span
            class="mark-line inline-flex items-center gap-space-1 type-meta text-status-fail-ink"
          >
            <IconError
              aria-hidden="true"
              class="size-icon-sm flex-none text-status-fail-glyph"
              data-box
            />
            <span>{words.failure}</span>
          </span>
        {/if}
        {#if !holes.reaches}
          <span
            class="mark-line inline-flex items-center gap-space-1 type-meta text-status-attn-ink"
          >
            <IconWarningTriangle
              aria-hidden="true"
              class="size-icon-sm flex-none text-status-attn-glyph"
              data-box
            />
            <span>{words.nothingReaches}</span>
          </span>
        {/if}
        {#if !holes.leaves}
          <span
            class="mark-line inline-flex items-center gap-space-1 type-meta text-status-attn-ink"
          >
            <IconWarningTriangle
              aria-hidden="true"
              class="size-icon-sm flex-none text-status-attn-glyph"
              data-box
            />
            <span>{words.nothingLeaves}</span>
          </span>
        {/if}
      </span>
    {/if}
  </button>

  {#if others.length > 0}
    <!-- Its variants, each a named choice a remark can stand on. -->
    <fieldset
      class="m-0 flex min-w-0 flex-wrap gap-space-1 border-0 px-space-3 pt-0 pb-space-2"
    >
      <legend class="sr-only">{words.variants(state.name)}</legend>
      {#each state.variants as variant (variant.id)}
        {@const chosen = kept && (keptVariant ?? first) === variant.id}
        <button
          type="button"
          data-slot="variant"
          aria-pressed={chosen}
          class={[
            "pointer-hit touch-hit h-c-btn-h-sm min-w-0 rounded-sm px-space-2 type-label transition-control",
            chosen
              ? "bg-surface-raised text-selected-ink shadow-xs"
              : "text-ink-muted can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong",
          ]}
          onpointerenter={() => {
            if (fine) {
              onpreview(variant.id);
            }
          }}
          onpointerleave={() => {
            if (fine) {
              onpreview(null);
            }
          }}
          onclick={() => onpress(variant.id)}
        >
          <span class="block truncate">{variant.name}</span>
        </button>
      {/each}
    </fieldset>
  {/if}
</div>
