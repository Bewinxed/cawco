<script lang="ts">
  /**
   * A task the agents planned: its number and name, where it stands with a
   * live mark while a session works it, and its open control, as tasks
   * open everywhere in the project.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import OpenControl from "./OpenControl.svelte";
  import type { Work } from "./outcomes";
  import { words } from "./words";

  let { work, onopen }: { work: Work; onopen: () => void } = $props();
</script>

<li class="flex min-w-0 items-start gap-space-3">
  <span class="flex min-w-0 flex-1 flex-col">
    <span class="flex min-w-0 gap-space-2 type-label">
      <span class="flex-none font-mono text-ink-subtle tabular-nums liga-none"
        >{work.ref}</span
      >
      <span class="min-w-0 text-ink-strong">{work.title}</span>
    </span>
    <span
      class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
    >
      {#if work.live}<LiveDot size="row" />{/if}
      <span>{work.state}</span>
    </span>
  </span>
  <span class="flex-none">
    <OpenControl label={words.openTask(work.ref, work.title)} {onopen} />
  </span>
</li>
