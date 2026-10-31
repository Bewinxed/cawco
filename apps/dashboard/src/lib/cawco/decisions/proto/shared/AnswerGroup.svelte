<script lang="ts">
  /**
   * A question's answers as one kit OptionGroup in its list form (one row
   * per option, its description under its label), kept in the request's
   * state (its heads pick through it, so a press on a picked one clears
   * it): one tab stop, the arrows walk the answers, a digit picks while
   * focus is in them. `layout` lays the answers out: `columns` side by side
   * snapping one to the next, `row` side by side and stacked on a phone,
   * `list` one under another.
   */
  import type { Snippet } from "svelte";
  import { OptionGroup } from "#lib/components/ui/option-group/index.js";
  import type { DecisionState } from "./decision.svelte";
  import type { Question } from "./request";

  let {
    dec,
    question,
    layout,
    children,
  }: {
    dec: DecisionState;
    question: Question;
    layout: "columns" | "row" | "list";
    children: Snippet;
  } = $props();
</script>

<OptionGroup
  layout="list"
  value={dec.picks[question.id] ?? []}
  aria-label={question.question}
>
  {#if layout === "columns"}
    <div
      class="flex snap-x snap-mandatory gap-space-5 overflow-x-auto overscroll-x-contain pb-space-2"
    >
      {@render children()}
    </div>
  {:else if layout === "row"}
    <div
      class="flex gap-space-5 overflow-x-auto overscroll-x-contain pb-space-2 @max-phone:-mx-space-4 @max-phone:flex-col"
    >
      {@render children()}
    </div>
  {:else}
    <div class="flex flex-col gap-space-2">{@render children()}</div>
  {/if}
</OptionGroup>
