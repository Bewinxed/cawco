<script lang="ts">
  /**
   * The whole result a run left, as it left it: its words drawn as a
   * message's are (the kit's Markdown), its delegate's report included
   * where the result carries it, in the well a task's output stands in.
   * Where no session did the run, who did it is said under the words.
   */
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import type { Run } from "./harbor";

  let { run }: { run: Run } = $props();
</script>

<div class="flex min-w-0 flex-col gap-space-2">
  <div
    class="rounded-sm border border-border-well bg-surface-well px-space-4 py-space-3 type-body text-ink-strong wrap-anywhere"
  >
    {#if run.result}
      <Markdown look="surface" source={run.result} />
    {:else}
      <p class="m-0">{run.words}</p>
    {/if}
  </div>
  {#if !run.sessionId && run.by}
    <span class="type-meta text-ink-muted">{run.by}</span>
  {/if}
</div>
