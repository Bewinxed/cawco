<script lang="ts">
  /**
   * The journey's steps: Previous, where he stands in words ("3 of 5,
   * Saving"), Next. Each step keeps that state, so the stage shows it.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { IconChevronLeft, IconChevronRight } from "#lib/icons.js";

  let {
    path,
    at,
    name,
    machine,
    onstep,
  }: {
    /** The machine's path, its states in order. */
    path: readonly string[];
    /** Where the kept state stands on it; -1 when it stands on another machine's. */
    at: number;
    /** The kept state's name. */
    name: string;
    machine: string;
    onstep: (state: string) => void;
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
      {at >= 0 ? words.position(at + 1, path.length, name) : machine}
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
