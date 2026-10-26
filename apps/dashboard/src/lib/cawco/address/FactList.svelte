<script lang="ts">
  /**
   * A tray's few drawn facts, each by its mark: a tick, a no, the live dot
   * while it waits, or a quiet mark for a plain fact. `cell` sizes the
   * marks' column.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconNeutral, IconNotYet, IconSuccess } from "#lib/icons.js";
  import type { Fact } from "./tray.svelte";
  import Words from "./Words.svelte";

  let {
    facts,
    cell,
  }: {
    facts: Fact[];
    cell: "grid size-icon-md place-items-center" | "w-icon-md";
  } = $props();
</script>

<!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
<ul class="m-0 grid list-none gap-space-2 p-0" role="list">
  <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
  {#each facts as fact (fact.text)}
    <li class="mark-line flex min-w-0 items-start gap-space-2 type-body">
      <span class={["mark-cell", cell]}>
        {#if fact.mark === "yes"}
          <IconSuccess
            aria-label="Yes"
            class="size-icon-md text-status-done-ink"
          />
        {:else if fact.mark === "no"}
          <IconNeutral aria-label="No" class="size-icon-md text-ink-muted" />
        {:else if fact.mark === "wait"}
          <LiveDot />
        {:else}
          <IconNotYet class="size-icon-md text-ink-subtle" />
        {/if}
      </span>
      <span class="mark-text min-w-0 text-ink-strong"
        ><Words text={fact.text} /></span
      >
    </li>
  {/each}
</ul>
