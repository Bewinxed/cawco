<!--
  The desk board, D1 or D2 (report part 2a). Both: one column per stage on
  the live column's band, its head (StageHead), its cards; an empty stage is
  its head over a one-row well, not a page-tall void; Ready keeps the live
  board's Add task (NewTaskForm, the real one), off while the hub doesn't
  answer. Each card's place (`data-card`) takes its drawing from the frame.

  - D2: the stage strip always, columns `--po-col` (300px) wide, the board
    scrolling sideways under the strip.
  - D1: five 224px columns side by side when the board is
    `--container-po-fit` (1100px) or wider, with no strip; narrower, it is
    D2 (at his 1037 window both are D2).

  `stale`: the board as it last read, its rows at `account-stale-opacity`
  (the house's out-of-date reading), the card whose file didn't read kept
  whole with its own failure. The stage heads and their counts keep their
  ink: that opacity is a graphic's (3:1, DESIGN.md), and a count is text
  that holds 4.5:1.
-->
<script>
  import { board, cardKey, STAGES } from "./data.js";
  import { NewTaskForm } from "./kit.js";
  import StageHead from "./StageHead.svelte";
  import Strip from "./Strip.svelte";

  let { option, state = "rest", ask = "C1" } = $props();
  const columns = $derived(board(state));
  const counts = $derived(
    Object.fromEntries(STAGES.map((stage) => [stage.key, columns[stage.key].length]))
  );
  const create = () => Promise.resolve();
</script>

<div data-board={option} class="@container flex h-full min-h-0 flex-col gap-space-3">
  <Strip class={option === "D1" ? "@po-fit:hidden" : ""} {counts} />
  <div
    data-columns
    class={[
      "kit-edge-fade grid min-h-0 flex-auto grid-flow-col auto-cols-(--po-col) grid-rows-1 gap-space-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-space-3",
      option === "D1" && "@po-fit:grid-flow-row @po-fit:grid-cols-[repeat(5,var(--po-col-fit))] @po-fit:auto-cols-auto",
    ]}
  >
    {#each STAGES as stage (stage.key)}
      {@const cards = columns[stage.key]}
      <section
        data-column={stage.key}
        aria-label="{stage.name}, {cards.length} {cards.length === 1 ? 'task' : 'tasks'}"
        class="flex max-h-full min-h-0 min-w-0 flex-col gap-space-1 self-start rounded-lg bg-surface-band p-space-1 inset-ring inset-ring-border-hairline"
      >
        <header class="px-space-2 py-space-1">
          <StageHead count={cards.length} {stage} />
        </header>
        {#if cards.length > 0}
          <ol class="kit-edge-fade-block m-0 flex min-h-0 list-none flex-col gap-space-1 overflow-y-auto overscroll-y-contain p-0">
            {#each cards as item (item.task.id)}
              <li class={state === "stale" && !item.fault ? "opacity-(--account-stale-opacity)" : ""} data-card={cardKey(item, ask)}></li>
            {/each}
          </ol>
        {:else}
          <div data-empty-well class="h-c-row-h flex-none rounded-sm bg-surface-recess"></div>
        {/if}
        {#if stage.key === "ready"}
          <!-- While the hub doesn't answer, writes are off (report part 4): the fieldset disables Add task. -->
          <fieldset class="m-0 flex-none border-0 p-0 *:w-full" disabled={state === "stale"}>
            <NewTaskForm oncreate={create} stage="ready" />
          </fieldset>
        {/if}
      </section>
    {/each}
  </div>
</div>
