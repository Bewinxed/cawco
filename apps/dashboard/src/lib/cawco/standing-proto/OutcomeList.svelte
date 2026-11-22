<script lang="ts">
  /**
   * The Routines tab: the project's goals, each a light heading over its
   * facts, the acceptance he defined for it. A fact is a task that repeats
   * (part of its goal), and its row reads as an outcome: what must be true
   * (or what each run delivers), its answer now as a word read down one
   * column, one sentence of what its newest run found or delivered, and,
   * only where it needs him, the Needs you mark and Fix with Caw. The open
   * button at the row's end opens the task that keeps checking it, the same
   * page a board card opens.
   *
   * Goals with a fact that needs him lead, and those facts lead their goal;
   * the rest keep the board's order. A task that repeats under no goal
   * stands after the goals, with no heading. Under a 640px list each row is
   * one card: the fact, the mark when it needs him and the open button,
   * with the answer under them; the fix is in the opened task.
   */
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconNeedsYou, IconSparkles } from "#lib/icons.js";
  import { readRepeat } from "./repeat-words";
  import type { Repeat } from "./repeating-data";

  interface Props {
    /** Asks Caw to fix a repeating task, with the words that say what went wrong. */
    onfix: (prompt: string) => void;
    onopen: (id: string) => void;
    /** The repeat behind each task that has one. */
    repeatOf: (id: string) => Repeat | null;
    /** The task open beside the list. */
    selected: string | null;
    /** The project's tasks; the list keeps those that repeat. */
    tasks: TaskSummary[];
  }

  let { tasks, repeatOf, selected, onopen, onfix }: Props = $props();

  /** Those that need him first, then the board's order. */
  const needsFirst = <T extends { needsYou: boolean }>(rows: T[]): T[] =>
    rows.toSorted((a, b) => Number(b.needsYou) - Number(a.needsYou));

  /** Each goal with its facts, the tasks that repeat under it; then those under none. */
  const groups = $derived.by(() => {
    const facts = tasks.flatMap((task) => {
      const repeat = repeatOf(task.id);
      if (!repeat) {
        return [];
      }
      const reading = readRepeat(task.title, repeat);
      return [{ needsYou: reading.needsYou, reading, task }];
    });
    const goals = tasks.flatMap((goal) => {
      const rows = needsFirst(
        facts.filter((fact) => fact.task.partOf === goal.id)
      );
      return rows.length > 0
        ? [{ goal, needsYou: rows.some((row) => row.needsYou), rows }]
        : [];
    });
    const loose = facts.filter(
      (fact) => !goals.some((group) => group.goal.id === fact.task.partOf)
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
          variant="band">What must be true</Table.Head
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
              >{group.goal.title}</Table.Head
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
