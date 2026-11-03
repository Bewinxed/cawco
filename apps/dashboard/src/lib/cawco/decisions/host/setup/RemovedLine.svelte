<!--
  What was removed from a setup page's list and can come back: one line of
  meta under the list, "Removed", then each by its name with Add back, as
  the house keeps a removed delegate type in reach.
-->
<script lang="ts">
  import { setupPageWords as words } from "@cawco/core/words/onboarding";
  import { Button } from "#lib/components/ui/button/index.js";

  let {
    names,
    onback,
  }: {
    /** Each removed one's key and name. */
    names: { key: string; name: string }[];
    onback: (key: string) => void;
  } = $props();
</script>

{#if names.length > 0}
  <p
    class="m-0 flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
    data-slot="setup-removed"
  >
    <span>{words.removed}</span>
    {#each names as one (one.key)}
      <span class="flex items-center gap-space-1">
        <span class="text-ink-strong">{one.name}</span>
        <Button
          aria-label="{words.addBack}: {one.name}"
          onclick={() => onback(one.key)}
          size="xs"
          variant="ghost">{words.addBack}</Button
        >
      </span>
    {/each}
  </p>
{/if}
