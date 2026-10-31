<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconImage, IconMaximize } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import type { Decision } from "./model.js";
  import OptionGrid from "./OptionGrid.svelte";
  import { KIND, WORDS } from "./words.js";

  /**
   * One open decision, read in the anatomy's order: the question, why now
   * (two lines, the rest disclosed), its kind and where it went, its
   * picture, then the options as peers.
   */
  let {
    decision,
    number,
    after,
    picked = [],
    waiting = false,
    goesTo = "goes to you",
    choosing = true,
    onpick,
    onkind,
    onpicture,
  }: {
    decision: Decision;
    /** Its place in a group, or none for a single ask. */
    number?: number;
    /** The number of the decision it comes after, while that one is open. */
    after?: number;
    picked?: string[];
    /** It waits on the one it comes after: drawn dim, its options shut. */
    waiting?: boolean;
    goesTo?: string;
    /** Its options are drawn to pick from; off where only its words are read. */
    choosing?: boolean;
    onpick?: (next: string[]) => void;
    onkind?: () => void;
    onpicture?: () => void;
  } = $props();

  let whyOpen = $state(false);
</script>

<section
  class={cn(
    "flex min-w-0 flex-col gap-space-3 motion-safe:transition-opacity motion-safe:duration-(--dur-control) motion-safe:ease-out",
    waiting && "opacity-50"
  )}
  aria-label={decision.question}
>
  <div class="flex min-w-0 flex-col gap-space-1">
    {#if number !== undefined}
      <p class="type-meta text-ink-muted">
        <span class="tabular-nums">{number}</span>{#if after !== undefined}
          · after <span class="tabular-nums">{after}</span>, opens when it is
          picked{/if}
      </p>
    {/if}
    <h3
      class={cn(
        "text-balance text-ink-strong",
        number === undefined ? "type-title" : "type-row"
      )}
    >
      {decision.question}
    </h3>
  </div>

  <div class="flex min-w-0 flex-col items-start gap-space-1">
    <p
      class={cn(
        "type-body text-pretty text-ink-muted",
        !whyOpen && "line-clamp-2"
      )}
    >
      {decision.why}
    </p>
    <div class="flex flex-wrap items-center gap-x-space-4 gap-y-space-1">
      <Button
        aria-expanded={whyOpen}
        onclick={() => {
          whyOpen = !whyOpen;
        }}
        pad="none"
        size="xs"
        variant="link">{whyOpen ? WORDS.showLess : WORDS.readWhy}</Button
      >
      {#if decision.kind}
        <Button
          onclick={onkind}
          pad="none"
          size="xs"
          tone="quiet"
          variant="link">{KIND[decision.kind]} · {goesTo}</Button
        >
      {/if}
    </div>
  </div>

  {#if decision.picture}
    <button
      class="press-tint mark-line flex min-w-0 items-center gap-space-3 rounded-md border border-border-hairline bg-surface-well p-space-3 text-start hover:bg-surface-hover"
      onclick={onpicture}
      type="button"
    >
      <IconImage aria-hidden="true" class="size-icon-lg text-ink-muted" />
      <span class="flex min-w-0 flex-1 flex-col" data-box>
        <span class="type-label text-ink-strong">{decision.picture.title}</span>
        <span class="type-meta truncate text-ink-muted"
          >{decision.picture.caption}</span
        >
      </span>
      <span
        class="type-label flex items-center gap-space-1 text-link-ink"
        data-box
      >
        <IconMaximize aria-hidden="true" class="size-icon-md" />
        <span class="max-phone:sr-only">{WORDS.openPreview}</span>
      </span>
    </button>
  {/if}

  {#if choosing}
    <OptionGrid
      disabled={waiting}
      label={decision.question}
      multiple={decision.multiple}
      {onpick}
      options={decision.options}
      {picked}
    />
  {/if}
</section>
