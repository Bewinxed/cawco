<script lang="ts">
  /**
   * A side card's head with a pane's own `actions` beside its name, for the
   * side-head probe: the real SideSurface as wide as Split stands it beside a
   * page (45% of it, never under its 320px floor, inside its 12px inset),
   * once for each kind of name a side card carries, beside a pane's actions:
   * - the plan's: its title, its progress ring and figure (`titleControl`);
   * - a task attempt's to-dos with the task id under them (`title`, `subtitle`);
   * - a project file's path (`title`), the longest, beside icon actions.
   * The probe reads every word and the ring of the name against every action.
   */
  import { planWords } from "@cawco/core";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { IconCopy, IconMaximize } from "#lib/icons.js";

  const CARDS = [
    { key: "plan", title: undefined, subtitle: undefined },
    { key: "todos", title: planWords.todos, subtitle: "tsk-2026-10-19-plan" },
    {
      key: "file",
      title: "design/plans/2026-10-06-projects-plan-view-proposal.md",
      subtitle: undefined,
    },
  ] as const;
  const noop = () => undefined;
</script>

{#snippet planName()}
  <span class="plan-name" data-name-row>
    <span>{planWords.plan}</span>
    <TaskRing done={3} size="md" total={12} />
    <span class="figure">{planWords.figure(3, 12)}</span>
  </span>
{/snippet}

<main class="bench">
  {#each CARDS as card (card.key)}
    <div class="card" data-card={card.key}>
      <SideSurface
        label="Bench {card.key}"
        onclose={noop}
        recessed={false}
        subtitle={card.subtitle}
        title={card.title}
        titleControl={card.key === "plan" ? planName : undefined}
      >
        {#snippet actions()}
          <button aria-label="Copy" data-action type="button"
            ><IconCopy /></button
          >
          {#if card.key === "file"}
            <button aria-label="Expand" data-action type="button"
              ><IconMaximize /></button
            >
          {:else}
            <button data-action type="button"
              ><IconMaximize />{planWords.openInCanvas}</button
            >
          {/if}
        {/snippet}
        <p>Body</p>
      </SideSurface>
    </div>
  {/each}
</main>

<style>
  .bench {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-3);
  }
  .card {
    inline-size: calc(max(45vw, 320px) - 2 * var(--space-3));
    max-inline-size: 100%;
    block-size: 120px;
  }
  /* The plan's name as the plan proposal draws it: one line, the title word,
     the ring and the figure, none of them cut. */
  .plan-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    white-space: nowrap;
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .figure {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
