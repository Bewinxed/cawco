<script lang="ts">
  /**
   * The Routines tab: the project's goals, each a light heading over the
   * tasks that repeat to keep it (each names its goal by its repeat's
   * `outcome`; a goal is a name, never a task). Each row reads as what is
   * done when it holds (or what each run delivers), its answer now as a word read down one
   * column, one sentence of what its newest run found or delivered, and,
   * only where it needs him, the Needs you mark and Fix with Caw. The open
   * button at the row's end opens the task that keeps checking it, the same
   * page a board card opens.
   *
   * Goals with a row that needs him lead, and those rows lead their goal;
   * the rest keep the goals' order and the board's. A task that repeats
   * under no goal stands after the goals, with no heading. Under a 640px
   * list each row is one card: its sentence, the mark when it needs him and the open button,
   * with the answer under them; the fix is in the opened task.
   */
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconNeedsYou, IconSparkles } from "#lib/icons.js";
  import { readRepeat } from "./repeat-words";
  import type { Outcome, Repeat } from "./repeating-data";

  interface Props {
    /** Asks Caw to fix a repeating task, with the words that say what went wrong. */
    onfix: (prompt: string) => void;
    onopen: (id: string) => void;
    /** The project's goals, each a heading. */
    outcomes: Outcome[];
    /** The repeat behind each task that has one. */
    repeatOf: (id: string) => Repeat | null;
    /** The task open beside the list. */
    selected: string | null;
    /** The project's tasks; the list keeps those that repeat. */
    tasks: TaskSummary[];
  }

  let { tasks, outcomes, repeatOf, selected, onopen, onfix }: Props = $props();

  /** Those that need him first, then the board's order. */
  const needsFirst = <T extends { needsYou: boolean }>(rows: T[]): T[] =>
    rows.toSorted((a, b) => Number(b.needsYou) - Number(a.needsYou));

  /** Each goal with the tasks that repeat under it; then those under none. */
  const groups = $derived.by(() => {
    const repeating = tasks.flatMap((task) => {
      const repeat = repeatOf(task.id);
      if (!repeat) {
        return [];
      }
      const reading = readRepeat(task.title, repeat);
      return [
        { needsYou: reading.needsYou, outcome: repeat.outcome, reading, task },
      ];
    });
    const goals = outcomes.flatMap((goal) => {
      const rows = needsFirst(
        repeating.filter((row) => row.outcome === goal.id)
      );
      return rows.length > 0
        ? [{ goal, needsYou: rows.some((row) => row.needsYou), rows }]
        : [];
    });
    const loose = repeating.filter(
      (row) => !goals.some((group) => group.goal.id === row.outcome)
    );
    const loneGroup =
      loose.length > 0
        ? [{ goal: null, needsYou: false, rows: needsFirst(loose) }]
        : [];
    return [...needsFirst(goals), ...loneGroup];
  });

  /** Each fixed column's width, its head's and its cells' alike; Now takes the rest. */
  const COL_W = {
    open: "calc(var(--spacing) * 6 + 2 * var(--spacing-space-3))",
    outcome: "calc(var(--spacing) * 68)",
    state:
      "calc(var(--spacing-icon-md) + var(--spacing-space-2) + var(--spacing) * 28 + 2 * var(--spacing-space-3))",
  };
</script>

<div
  class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
  data-slot="ledger"
  style:--answer-cols="calc(var(--spacing) * 26) minmax(0, 1fr)"
  style:--card-cols="minmax(0, 1fr) auto auto"
>
  <Table.Root data-outcomes ghostRows="tbody tr" layout="ledger" stacks="phone">
    <Table.Header>
      <Table.Row variant="band">
        <Table.Head
          class="w-(--col-w)"
          style="--col-w: {COL_W.outcome}"
          variant="band">Done when</Table.Head
        >
        <Table.Head variant="band">Now</Table.Head>
        <Table.Head
          class="w-(--col-w)"
          style="--col-w: {COL_W.state}"
          variant="band"><span class="sr-only">Needs you</span></Table.Head
        >
        <Table.Head
          class="w-(--col-w)"
          style="--col-w: {COL_W.open}"
          variant="band"><span class="sr-only">Open</span></Table.Head
        >
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each groups as group (group.goal?.id ?? "")}
        {#if group.goal}
          <Table.Row data-goal={group.goal.id} variant="unruled">
            <Table.Head colspan={4} variant="group"
              >{group.goal.name}</Table.Head
            >
          </Table.Row>
        {/if}
        {#each group.rows as { task, reading } (task.id)}
          {@const picked = selected === task.id}
          <Table.Row
            class="group/row"
            data-needs-you={reading.needsYou || undefined}
            data-outcome-row={task.id}
            data-picked={picked || undefined}
            variant="picks-stacks"
          >
            <Table.Cell
              class="w-(--col-w)"
              data-outcome-col="outcome"
              style="--col-w: {COL_W.outcome}"
              variant="ledger-picks-stacks-lead"
            >
              <span
                class={[
                  "line-clamp-2 min-w-0 type-label text-pretty",
                  picked ? "text-selected-ink" : "text-ink-row",
                ]}>{task.title}</span
              >
            </Table.Cell>
            <Table.Cell
              class="@max-phone/table:col-span-3 @max-phone/table:row-start-2"
              data-outcome-col="now"
              variant="ledger-picks-stacks-lead"
            >
              <p
                class="m-0 grid min-w-0 grid-cols-(--answer-cols) items-baseline gap-x-space-3 @max-phone/table:flex @max-phone/table:gap-x-space-2"
                data-slot="outcome-answer"
                title={reading.sentence}
              >
                <span
                  class={[
                    "type-label whitespace-nowrap",
                    reading.needsYou ? "text-ink-strong" : "text-ink-row",
                  ]}
                  data-slot="answer-word">{reading.answer}</span
                >
                <span
                  class={[
                    "line-clamp-2 min-w-0 type-meta text-pretty wrap-anywhere",
                    reading.needsYou ? "text-ink-strong" : "text-ink-muted",
                  ]}>{reading.sentence}</span
                >
              </p>
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w) @max-phone/table:col-start-2 @max-phone/table:row-start-1"
              data-outcome-col="state"
              inCard="drops-empty"
              style="--col-w: {COL_W.state}"
              variant="ledger-picks-stacks"
            >
              {#if reading.needsYou}
                <span class="flex items-center gap-space-2">
                  <span
                    class="inline-flex flex-none items-center"
                    data-box
                    title="Needs you"
                  >
                    <IconNeedsYou
                      aria-hidden="true"
                      class="size-icon-md text-status-attn-glyph"
                    />
                    <span class="sr-only">Needs you</span>
                  </span>
                  {#if reading.fixPrompt}
                    {@const prompt = reading.fixPrompt}
                    <!-- The opened task holds it on a phone. -->
                    <span class="@max-phone/table:hidden">
                      <Button
                        aria-label="Fix with Caw: {task.title}"
                        icon={IconSparkles}
                        label="Fix with Caw"
                        onclick={() => onfix(prompt)}
                        size="xs"
                        variant="outline"
                      />
                    </span>
                  {/if}
                </span>
              {/if}
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w) @max-phone/table:col-start-3 @max-phone/table:row-start-1"
              data-outcome-col="open"
              edge="end"
              style="--col-w: {COL_W.open}"
              variant="ledger-picks-stacks"
            >
              <!-- The task opens only here, as everywhere in the dashboard. -->
              <Tip label="Open">
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-label="Open {task.title}"
                    data-open-task={task.id}
                    icon={IconMaximize}
                    onclick={() => onopen(task.id)}
                    size="icon-xs"
                    tone="muted"
                    variant="ghost"
                  />
                {/snippet}
              </Tip>
            </Table.Cell>
          </Table.Row>
        {/each}
      {/each}
    </Table.Body>
  </Table.Root>
</div>
