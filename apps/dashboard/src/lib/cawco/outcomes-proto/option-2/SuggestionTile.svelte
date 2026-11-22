<script lang="ts">
  /**
   * Caw's suggested outcome (S7): advice, so it wears the house badge,
   * never the Needs you mark and never coral, on a dashed edge, since it is
   * no outcome yet. `full`: the suggested sentence and its "Done when:"
   * lines with no answers, Take it, Change the words first and Don't
   * suggest this, and the way to the next suggestion; `lead` is the same
   * opened as the lead, with Close. `folded` (beside a lead, and the Room
   * rule's first step): the badge, the sentence and the two answers that
   * settle it. `line` (under 640): the badge and the sentence on one line,
   * its open control opening it as the lead.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import OpenControl from "../OpenControl.svelte";
  import LeadHead from "./LeadHead.svelte";
  import type { SuggestedOutcome } from "./outcomes";

  let {
    suggestion,
    form,
    offline,
    ontake,
    onchange,
    ondismiss,
    onnext,
    onlead,
    onclose,
  }: {
    suggestion: SuggestedOutcome;
    form: "full" | "lead" | "folded" | "line";
    offline: string | null;
    ontake: () => void;
    onchange: () => void;
    ondismiss: () => void;
    onnext: () => void;
    /** Open it as the lead. */
    onlead: () => void;
    onclose: () => void;
  } = $props();

  const whole = $derived(form === "full" || form === "lead");
</script>

{#snippet badge()}
  <Badge variant="raised"><span>Caw suggests</span></Badge>
{/snippet}

{#if form === "line"}
  <article
    aria-label="Caw suggests: {suggestion.sentence}"
    class="mark-line flex min-w-0 items-center gap-space-2 rounded-lg border border-dashed border-border-control py-space-1 ps-space-3 pe-space-2"
    data-slot="suggestion"
  >
    <span class="flex-none" data-box>{@render badge()}</span>
    <span
      class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
      >{suggestion.sentence}</span
    >
    <span data-box
      ><OpenControl label="Open Caw's suggestion" onopen={onlead} /></span
    >
  </article>
{:else}
  <article
    aria-label="Caw suggests: {suggestion.sentence}"
    class={[
      "flex min-w-0 flex-col gap-space-3 rounded-lg border border-dashed border-border-control max-phone:p-space-3",
      form === "lead" ? "p-space-5" : "p-space-4",
    ]}
    data-slot="suggestion"
  >
    {#if form === "lead"}
      <div class="flex min-w-0 flex-col gap-space-2">
        <span>{@render badge()}</span>
        <LeadHead {onclose} title={suggestion.sentence} />
      </div>
    {:else}
      <div class="flex min-w-0 flex-col gap-space-2">
        <span>{@render badge()}</span>
        <h2
          class={[
            "min-w-0 type-label text-ink-strong",
            form === "folded" && "line-clamp-2",
          ]}
        >
          {suggestion.sentence}
        </h2>
      </div>
    {/if}
    {#if whole}
      <div class="flex min-w-0 flex-col gap-space-1">
        <p class="type-meta text-ink-muted">Done when:</p>
        <ul class="flex min-w-0 flex-col gap-space-1">
          {#each suggestion.lines as line (line)}
            <li class="type-meta text-ink-row">{line}</li>
          {/each}
        </ul>
      </div>
    {/if}
    <div class="flex min-w-0 flex-wrap items-center gap-space-2">
      <Button
        disabled={offline !== null}
        label="Take it"
        onclick={ontake}
        size="xs"
        variant="outline"
      />
      {#if whole}
        <Button
          disabled={offline !== null}
          label="Change the words first"
          onclick={onchange}
          size="xs"
          variant="ghost"
        />
      {/if}
      <Button
        disabled={offline !== null}
        label="Don't suggest this"
        onclick={ondismiss}
        size="xs"
        variant="ghost"
      />
    </div>
    {#if whole && suggestion.more > 0}
      <span>
        <Button
          pad="none"
          label="Next suggestion ({suggestion.more} more)"
          onclick={onnext}
          size="xs"
          variant="link"
        />
      </span>
    {/if}
  </article>
{/if}
