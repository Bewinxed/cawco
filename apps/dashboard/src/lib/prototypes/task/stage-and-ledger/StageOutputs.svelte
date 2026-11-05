<script lang="ts">
  /**
   * The stage for a done task: what landed, each drawn as what it is (a
   * commit with its subject, a page by its title), with where and when it
   * landed. Each opens where it lives.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconArrowUpRight, IconDocument, IconFolderGit } from "#lib/icons.js";
  import { when } from "./format";
  import { LIVENESS } from "./marks";
  import type { OutputRow } from "./records";
  import StatusMark from "./StatusMark.svelte";

  let {
    outputs,
    since,
    now,
  }: { outputs: OutputRow[]; since: number; now: number } = $props();
</script>

<div class="flex flex-col gap-space-5">
  <div
    class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-1"
  >
    <StatusMark mark={LIVENESS.done} />
    <span class="type-meta text-ink-muted"
      >{words.landedOn(words.onMain, when(since, now))}</span
    >
  </div>
  <section class="flex flex-col gap-space-2">
    <h2 class="type-label text-ink-strong">{words.outputs}</h2>
    <ul class="flex flex-col rounded-lg bg-surface-raised shadow-tile">
      {#each outputs as output (output.ref)}
        <li
          class="mark-line grid min-h-c-row-h grid-cols-(--out-cols) items-center gap-x-space-3 border-b border-border-hairline px-space-3 last:border-b-0"
          style:--out-cols={"var(--c-row-lead) var(--c-task-col-id-w) minmax(0, 1fr) auto"}
        >
          <span data-box class="flex justify-center">
            {#if output.kind === "commit"}
              <IconFolderGit
                aria-label={words.commit}
                class="size-icon-md text-ink-muted"
                role="img"
              />
            {:else}
              <IconDocument
                aria-label={words.page}
                class="size-icon-md text-ink-muted"
                role="img"
              />
            {/if}
          </span>
          <code
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-mono text-size-code text-ink-muted"
            >{output.ref}</code
          >
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-body text-ink-strong"
            >{output.name}</span
          >
          <Button
            aria-label={words.openWait(output.ref)}
            icon={IconArrowUpRight}
            size="icon-sm"
            title={words.openWait(output.ref)}
            variant="ghost"
          />
        </li>
      {/each}
    </ul>
  </section>
</div>
