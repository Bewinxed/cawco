<script lang="ts">
  /**
   * How much work sits in each stage (TOM task 1), every stage named, a
   * stage with nothing in it named without a number; each opens the board
   * at that stage. `list`: a column of rows in the briefing's knowing
   * column, names on one edge and counts on the other in tabular figures,
   * Archive under a hairline at its foot. `chips`: one line of chips that
   * scrolls sideways, the next one peeking past the edge (the phone, 900,
   * and the briefing in one column).
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import type { Stage } from "./model";

  let {
    stages,
    archive,
    form = "list",
    stale = false,
    onopen,
  }: {
    stages: Stage[];
    archive: number;
    form?: "list" | "chips";
    stale?: boolean;
    onopen?: (stage: string) => void;
  } = $props();
</script>

{#if form === "list"}
  <ul
    class="m-0 flex list-none flex-col p-space-1"
    data-stale={stale ? "" : undefined}
  >
    {#each stages as stage (stage.id)}
      <li>
        <button
          class="mark-line press-tint flex h-c-btn-h w-full items-center gap-space-2 rounded-sm px-space-3 text-start transition-control hover:bg-surface-hover"
          aria-label={words.stages.openAt(stage.name)}
          onclick={() => onopen?.(stage.id)}
          type="button"
        >
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
            >{stage.name}</span
          >
          {#if stage.kind === "you"}
            <span class="type-meta text-ink-muted">{words.stages.yours}</span>
          {/if}
          {#if stage.count > 0}
            {#if stage.kind === "you"}
              <span
                aria-hidden="true"
                class="ms-auto size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
                data-box
              ></span>
            {/if}
            <span
              class={[
                "w-c-count-digit flex-none text-end type-label tabular-nums",
                stage.kind !== "you" && "ms-auto",
                "text-ink-strong",
              ]}>{stage.count}</span
            >
          {/if}
        </button>
      </li>
    {/each}
    <li class="mt-space-1 border-t border-t-border-hairline pt-space-1">
      <button
        class="mark-line press-tint flex h-c-btn-h w-full items-center gap-space-2 rounded-sm px-space-3 text-start transition-control hover:bg-surface-hover"
        aria-label={words.stages.openAt(words.stages.archive)}
        onclick={() => onopen?.("archive")}
        type="button"
      >
        <span class="type-label text-ink-muted">{words.stages.archive}</span>
        {#if archive > 0}
          <span
            class="ms-auto w-c-count-digit flex-none text-end type-label text-ink-muted tabular-nums"
            >{archive}</span
          >
        {/if}
      </button>
    </li>
  </ul>
{:else}
  <ul
    class="m-0 flex list-none snap-x gap-space-2 overflow-x-auto p-0 pb-space-1"
    data-stale={stale ? "" : undefined}
  >
    {#each [...stages, { id: "archive", name: words.stages.archive, kind: "dropped", count: archive } as Stage] as stage (stage.id)}
      <li class="flex-none snap-start">
        <button
          class={chipVariants({ variant: "option" })}
          aria-label={words.stages.openAt(stage.name)}
          onclick={() => onopen?.(stage.id)}
          type="button"
        >
          {#if stage.kind === "you" && stage.count > 0}
            <span
              aria-hidden="true"
              class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
              data-box
            ></span>
          {/if}
          <span class={stage.id === "archive" ? "text-ink-muted" : undefined}
            >{stage.name}</span
          >
          {#if stage.count > 0}
            <span class="type-meta text-ink-muted tabular-nums"
              >{stage.count}</span
            >
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}
