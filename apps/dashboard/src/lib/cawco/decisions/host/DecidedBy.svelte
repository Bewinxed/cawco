<!--
  Under a card settled for the person (core decides.ts):
  "Decided by Advisor · Claude Code · Opus 5.5 · why · 2 sources", then each
  source: a web link as a link, a repository path as its words. The card's
  own pick carries it (core choices.ts `settled`); his own pick drops it.
-->
<script lang="ts">
  import type { SettledBy } from "@cawco/core/choices";
  import { decidedByLine } from "@cawco/core/words/decides-lines";
  import { sourceShown } from "./decided-by.js";

  let { settled }: { settled: SettledBy } = $props();
</script>

<div class="flex min-w-0 flex-col gap-space-1" data-slot="decided-by">
  <p class="type-meta max-w-c-measure text-pretty text-ink-muted">
    {decidedByLine(settled)}
  </p>
  {#if settled.sources.length > 0}
    <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops list semantics when list styles are removed; an explicit role="list" keeps them -->
    <ul
      aria-label="Sources"
      class="m-0 flex list-none flex-wrap gap-x-space-3 gap-y-space-1 p-0"
      role="list"
    >
      <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
      {#each settled.sources as source (source)}
        {@const shown = sourceShown(source)}
        <li class="min-w-0">
          {#if shown.href}
            <a
              class="type-meta wrap-anywhere text-link-ink"
              href={shown.href}
              rel="noreferrer"
              target="_blank">{shown.label}</a
            >
          {:else}
            <span class="type-meta wrap-anywhere text-ink-muted"
              >{shown.label}</span
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
