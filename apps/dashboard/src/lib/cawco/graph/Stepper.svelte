<script lang="ts">
  /**
   * The journey's steps: Previous, where he stands in words ("8 of 11,
   * Failed save"), Next, along the component's one path, the order the
   * states list shows (model `pathOf`), so the steps count what the list
   * holds. Each step keeps that state, so the stage shows it.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { IconChevronLeft, IconChevronRight } from "#lib/icons.js";
  import { figureOf } from "./figures";

  let {
    path,
    at,
    onstep,
    lang,
  }: {
    /** The component's path, its states in the list's order. */
    path: readonly string[];
    /** Where the kept state stands on it. */
    at: number;
    onstep: (state: string) => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
  } = $props();

  const step = (by: number) => {
    const next = path[Math.max(0, Math.min(path.length - 1, at + by))];
    if (next) {
      onstep(next);
    }
  };
  const control =
    "pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-strong transition-control can-hover:hover:bg-surface-hover disabled:opacity-50";
</script>

{#if path.length > 1}
  <div
    data-slot="journey-steps"
    class="mark-line flex min-w-0 items-center gap-space-2"
  >
    <button
      type="button"
      aria-label={words.previous}
      class={control}
      data-box
      disabled={at <= 0}
      title={words.previous}
      onclick={() => step(-1)}
    >
      <IconChevronLeft aria-hidden="true" class="size-icon-md" />
    </button>
    <p
      class="m-0 min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap text-center type-label text-ink-row num"
      aria-live="polite"
    >
      {words.position(figureOf(at + 1, lang), figureOf(path.length, lang))}
    </p>
    <button
      type="button"
      aria-label={words.next}
      class={control}
      data-box
      disabled={at >= path.length - 1}
      title={words.next}
      onclick={() => step(1)}
    >
      <IconChevronRight aria-hidden="true" class="size-icon-md" />
    </button>
  </div>
{/if}
