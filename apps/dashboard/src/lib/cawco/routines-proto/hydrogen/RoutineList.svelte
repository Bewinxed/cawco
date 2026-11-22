<script lang="ts">
  import type { Snippet } from "svelte";
  import RoutineTile from "./RoutineTile.svelte";
  import { MOCK_NOW, type Routine } from "./routines-data";

  interface Props {
    headerAction?: Snippet;
    now?: number;
    onfix: (prompt: string) => void;
    onopen: (id: string) => void;
    routines: Routine[];
    selectedRoutineId: string | null;
    stale?: boolean;
  }

  let {
    routines,
    selectedRoutineId,
    stale = false,
    now = MOCK_NOW,
    headerAction,
    onopen,
    onfix,
  }: Props = $props();
</script>

<div class="flex flex-col gap-space-3" data-slot="routine-bento-view">
  <header
    class="flex flex-wrap items-center justify-between gap-space-2"
    data-slot="routines-header"
  >
    <h2 class="m-0 type-label text-ink-strong">Routines</h2>
    {@render headerAction?.()}
  </header>

  <div
    class="rounded-lg bg-surface-recess p-space-1 inset-ring inset-ring-border-hairline"
    data-slot="routines-bento"
  >
    <ul
      class="m-0 grid list-none grid-cols-(--bento-cols) gap-space-1 p-0"
      style:--bento-cols={"repeat(auto-fill, minmax(max(min(100%, var(--spacing-c-board-col-min)), calc((100% - 3 * var(--spacing-space-1)) / 4)), 1fr))"}
    >
      {#each routines as routine (routine.id)}
        <li class="min-w-0">
          <RoutineTile
            {now}
            {onfix}
            {onopen}
            {routine}
            selected={selectedRoutineId === routine.id}
            {stale}
          />
        </li>
      {/each}
    </ul>
  </div>
</div>
