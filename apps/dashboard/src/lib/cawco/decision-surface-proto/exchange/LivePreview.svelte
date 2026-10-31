<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import WhoDecides from "./WhoDecides.svelte";
  import { WORDS } from "./words.js";

  export type PreviewLoad = "loading" | "failed" | "ready";

  /**
   * The thing a decision refers to, live, in the well a preview stands in:
   * its own skeleton while it loads, its own fault line with Reload, then
   * the artifact itself, which he can use while the thread stays beside it.
   */
  let { project, load = "ready" }: { project: string; load?: PreviewLoad } =
    $props();
</script>

<div
  class="min-w-0 rounded-lg border border-border-well bg-surface-well p-space-4"
>
  {#if load === "loading"}
    <div class="flex flex-col gap-space-3" aria-busy="true">
      <Skeleton class="w-full" height="tabs" radius="tile" />
      {#each [0, 1, 2, 3, 4, 5] as i (i)}
        <Skeleton class="w-full" height="item" radius="tile" />
      {/each}
    </div>
  {:else if load === "failed"}
    <div class="flex flex-col items-start gap-space-3">
      <p class="type-body text-pretty text-ink-strong">
        Who decides didn't load: the hub answered (502). The thread beside it is
        unaffected.
      </p>
      <Button size="sm" variant="outline">{WORDS.reload}</Button>
    </div>
  {:else}
    <WhoDecides {project} />
  {/if}
</div>
