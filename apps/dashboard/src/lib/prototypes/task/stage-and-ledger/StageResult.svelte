<script lang="ts">
  /**
   * The stage for a task waiting on you: the result, drawn whole. First the
   * line saying how the hub knows of it (an attempt's hand-in, or only a
   * comment naming it), then the page the session presented at its own
   * size, the commits it landed, and what to check at its foot. When the
   * hub knows of no result by any route, the stage says so and why.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconArrowUpRight, IconDocument } from "#lib/icons.js";
  import ChecksStrip from "./ChecksStrip.svelte";
  import { provenanceOf } from "./derive";
  import type { ResultView } from "./records";

  let { result, now }: { result: ResultView | null; now: number } = $props();

  const provenance = $derived(provenanceOf(result, now));
</script>

<div class="flex flex-col gap-space-5">
  <p class="type-meta text-pretty text-ink-muted">{provenance}</p>
  {#if result}
    {#if result.page}
      <figure
        class="flex flex-col overflow-clip rounded-lg bg-surface-raised shadow-tile"
      >
        <figcaption
          class="mark-line flex min-h-c-row-h items-center gap-space-2 border-b border-border-hairline px-space-3"
        >
          <IconDocument
            aria-hidden="true"
            class="size-icon-md flex-none text-ink-muted"
          />
          <span
            class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
            >{result.page.title}</span
          >
          <Button
            data-box
            icon={IconArrowUpRight}
            label={words.openArtifact}
            size="sm"
            variant="ghost"
          />
        </figcaption>
        <iframe
          class="block h-c-result-page-h w-full border-0 bg-system-canvas"
          sandbox=""
          srcdoc={result.page.html}
          title={result.page.title}
        ></iframe>
      </figure>
    {/if}
    {#if result.commits.length > 0}
      <section class="flex flex-col gap-space-2">
        <h2 class="type-meta text-ink-muted">{words.landedCommits}</h2>
        <ul class="flex flex-col">
          {#each result.commits as commit (commit.sha)}
            <li
              class="grid min-h-c-row-h grid-cols-(--commit-cols) items-center gap-x-space-3 border-b border-border-hairline last:border-b-0"
              style:--commit-cols={"var(--c-task-col-id-w) minmax(0, 1fr)"}
            >
              <code class="font-mono text-size-code text-ink-muted"
                >{commit.sha}</code
              >
              <span class="min-w-0 truncate type-body text-ink-strong"
                >{commit.subject}</span
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    <ChecksStrip checks={result.checks} />
  {/if}
</div>
