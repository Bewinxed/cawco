<script lang="ts">
  /**
   * A tile of one heading and its open control: "Not under an outcome"
   * (Option 1, structure decision 9), with what it holds in a quieter line;
   * and, once the Room rule's last step gathers the met outcomes, "Met,
   * still watched", one sentence per outcome, each with its open control.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconEye, IconMaximize } from "#lib/icons.js";
  import { outcomesWords } from "./words";

  let {
    kind,
    note,
    sentences = [],
    onopen,
  }: {
    kind: "unplaced" | "met";
    /** What it holds, in words ("2 tasks and 1 routine"). */
    note?: string;
    /** The met outcomes it gathers, by id, each with its sentence. */
    sentences?: { id: string; sentence: string }[];
    /** Its open control; for the met tile, one per outcome. */
    onopen: (id: string | null) => void;
  } = $props();

  const title = $derived(
    kind === "met" ? outcomesWords.metTile : outcomesWords.unplaced
  );
</script>

<section
  aria-label={title}
  class="flex flex-col gap-space-2 rounded-lg bg-surface-raised px-space-4 py-space-3 shadow-tile @max-phone/view:gap-space-2 @max-phone/view:rounded-none @max-phone/view:border-b @max-phone/view:border-border-hairline @max-phone/view:bg-transparent @max-phone/view:px-0 @max-phone/view:py-space-2 @max-phone/view:shadow-none"
>
  <header class="mark-line flex items-center gap-space-2">
    {#if kind === "met"}
      <IconEye aria-hidden="true" class="size-icon-md text-status-done-glyph" />
    {/if}
    <h3 class="m-0 min-w-0 flex-1 type-label font-medium text-ink-strong">
      {title}
    </h3>
    {#if note}
      <span class="type-meta text-ink-muted">{note}</span>
    {/if}
    {#if kind === "unplaced"}
      <Button
        aria-label={outcomesWords.open(title)}
        icon={IconMaximize}
        onclick={() => onopen(null)}
        size="icon-xs"
        title={outcomesWords.open(title)}
        tone="quiet"
        variant="ghost"
      />
    {/if}
  </header>
  {#if kind === "met"}
    <ul class="m-0 flex list-none flex-col p-0">
      {#each sentences as one (one.id)}
        <li class="flex items-start gap-space-2 py-space-1">
          <span class="min-w-0 flex-1 type-body text-pretty text-ink-strong"
            >{one.sentence}</span
          >
          <Button
            aria-label={outcomesWords.open(one.sentence)}
            icon={IconMaximize}
            onclick={() => onopen(one.id)}
            size="icon-xs"
            title={outcomesWords.open(one.sentence)}
            tone="quiet"
            variant="ghost"
          />
        </li>
      {/each}
    </ul>
  {/if}
</section>
