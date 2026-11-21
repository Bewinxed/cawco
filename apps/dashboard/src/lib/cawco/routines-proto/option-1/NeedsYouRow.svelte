<script lang="ts">
  /**
   * A routine that needs the person, drawn open: its mark, its name and what
   * it does, why it needs them in one sentence, and its choices on the row,
   * answered where they stand; Open at the trailing edge, as every row has.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import type { Routine } from "./harbor";
  import OpenButton from "./OpenButton.svelte";
  import RoutineMark from "./RoutineMark.svelte";

  let {
    routine,
    open = false,
    onopen,
    onchoose,
  }: {
    routine: Routine;
    open?: boolean;
    onopen: (id: string) => void;
    /** A choice pressed on the row: its label, as the hub would take it. */
    onchoose: (id: string, choice: string) => void;
  } = $props();
</script>

<li
  class="group/row flex items-start gap-space-3 py-space-2 ps-space-2 pe-space-1 rounded-sm data-open:bg-selected-bg"
  data-open={open || undefined}
  data-routine={routine.id}
>
  <span class="flex h-lh items-center type-label">
    <RoutineMark state={routine.state} words={routine.stateWords} />
  </span>
  <div
    class="flex flex-auto min-w-0 flex-col gap-space-2 @routine-row/list:flex-row @routine-row/list:gap-space-4"
  >
    <div class="flex min-w-0 flex-auto flex-col gap-space-1">
      <span class="type-label text-ink-strong">{routine.name}</span>
      <span
        class="type-body text-ink-muted group-data-open/row:text-selected-ink"
        >{routine.sentence}</span
      >
    </div>
    <div
      class="flex min-w-0 flex-col gap-space-2 @routine-row/list:w-111.5 @routine-row/list:flex-none"
    >
      <p class="m-0 type-body text-ink-strong wrap-anywhere">
        {routine.needs?.why}
      </p>
      <div class="flex flex-wrap items-center gap-space-2">
        {#each routine.needs?.choices ?? [] as choice (choice.label)}
          <Button
            label={choice.label}
            onclick={() => onchoose(routine.id, choice.label)}
            size="xs"
            variant={choice.primary ? "outline" : "ghost"}
          />
        {/each}
      </div>
    </div>
  </div>
  <div class="flex flex-none items-center gap-space-1 h-lh type-label">
    <span class="size-6"></span>
    <OpenButton
      kind="beside"
      label="Open {routine.name}"
      onopen={() => onopen(routine.id)}
      {open}
    />
  </div>
</li>
