<script lang="ts">
  /**
   * The project's stages in one line (the option's Home › Stages): each its
   * name and how many tasks stand in it, a way into the board at that
   * stage, Archive at its end. A stage with none is still named and draws
   * no number; the stage meant for the person carries the needs-you dot
   * while it holds a task. Under the phone line it scrolls as one strip.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { IconArchive } from "#lib/icons.js";
  import type { Project } from "./model";

  let {
    project,
    reading = false,
    stale = false,
    onstage,
  }: {
    project: Project;
    reading?: boolean;
    stale?: boolean;
    onstage: (stage: string) => void;
  } = $props();

  const counts = $derived(
    Object.fromEntries(
      project.stages.map((stage) => [
        stage.key,
        project.tasks.filter((task) => task.stage === stage.key).length,
      ])
    )
  );
</script>

<nav
  aria-label={w.stagesGroup}
  class="-mx-space-2 overflow-x-auto no-scrollbar"
>
  <ul class="flex w-max items-stretch gap-space-1">
    {#each project.stages as stage (stage.key)}
      {@const count = counts[stage.key] ?? 0}
      <li>
        <button
          type="button"
          class="press-tint focus-inset touch-hit mark-line flex h-c-btn-h items-center gap-space-2 rounded-sm px-space-2 text-ink-row hover:bg-surface-hover"
          onclick={() => onstage(stage.key)}
        >
          <span class="type-label whitespace-nowrap">{stage.name}</span>
          {#if stage.kind === "you" && count > 0 && !stale && !reading}
            <span
              class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
              data-box
              aria-hidden="true"
            ></span>
          {/if}
          {#if count > 0 && !reading}
            <span class="type-meta num text-ink-muted">{count}</span>
          {/if}
        </button>
      </li>
    {/each}
    <li class="ms-space-2 border-s border-border-hairline ps-space-2">
      <button
        type="button"
        class="press-tint focus-inset touch-hit mark-line flex h-c-btn-h items-center gap-space-2 rounded-sm px-space-2 text-ink-row hover:bg-surface-hover"
        onclick={() => onstage("archive")}
      >
        <IconArchive class="size-icon-md text-ink-muted" aria-hidden="true" />
        <span class="type-label">{w.archive}</span>
        {#if project.archived > 0 && !reading}
          <span class="type-meta num text-ink-muted">{project.archived}</span>
        {/if}
      </button>
    </li>
  </ul>
</nav>
