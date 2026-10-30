<!--
  Under a card settled for the person (core decides.ts):
  "Decided by Advisor · Claude Code · Opus 5.5 · why · 2 sources", then each
  source as a link.
  Picked otherwise since, the card is his, and the line says whose pick he
  took back.
-->
<script lang="ts">
  import type { SettledBy } from "@cawco/core/choices";
  import { decidedByLine } from "@cawco/core/decides";
  import { sourceLabel } from "./decided-by.js";

  let {
    settled,
    takenBack,
  }: {
    settled: SettledBy | null;
    takenBack: { name: string; option: string } | undefined;
  } = $props();
</script>

{#if settled}
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
          <li class="min-w-0">
            <a
              class="type-meta wrap-anywhere text-link-ink"
              href={source}
              rel="noreferrer"
              target="_blank">{sourceLabel(source)}</a
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{:else if takenBack}
  <p
    class="type-meta max-w-c-measure text-pretty text-ink-muted"
    data-slot="decided-by"
  >
    Your decision now. {takenBack.name} had picked {takenBack.option}.
  </p>
{/if}
