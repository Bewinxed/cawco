<script lang="ts">
  /**
   * A side card's head with a pane's own `actions` beside its name, for the
   * side-head probe: the real SideSurface as wide as Split stands it beside a
   * page (45% of it, never under its 320px floor, inside its 12px inset),
   * once for each kind of name a side card carries, beside a pane's actions:
   * - the plan's: its title, its progress ring and figure (`titleControl`,
   *   the title its lead);
   * - a task attempt's to-dos with the task id under them (`title`, and
   *   `subtitle` set as code, `subtitleCode`, as PlanPane sets it);
   * - a project file's path (`title`), the longest, beside icon actions.
   * The probe reads every word and the ring of the name against every action.
   */
  import { planWords } from "@cawco/core";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { IconCopy, IconExternal, IconMaximize } from "#lib/icons.js";

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
  <!-- The plan's name as the plan proposal draws it: one line, the title
       word, the ring and the figure, none of them cut. -->
  <span
    class="mark-line inline-flex items-center gap-space-1 type-label whitespace-nowrap text-ink-strong"
    data-name-row
  >
    <span data-slot="name-lead">{planWords.plan}</span>
    <span data-box><TaskRing done={3} size="md" total={12} /></span>
    <span class="text-ink-muted num">{planWords.figure(3, 12)}</span>
  </span>
{/snippet}

<main class="grid gap-space-4 p-space-3">
  {#each CARDS as card (card.key)}
    <div
      class="h-c-side-bench-h w-(--card-w) max-w-full"
      data-card={card.key}
      style:--card-w="calc(max(45vw, var(--c-side-surface-min)) - 2 * var(--space-3))"
    >
      <SideSurface
        label="Bench {card.key}"
        onclose={noop}
        recessed={false}
        subtitle={card.subtitle}
        subtitleCode={card.key === "todos"}
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
            <button class="mark-line" data-action type="button"
              ><IconExternal /><span>{planWords.openInCanvas}</span></button
            >
            <!-- A desk's split gives every side card its Expand. -->
            <button aria-label="Expand" data-action type="button"
              ><IconMaximize /></button
            >
          {/if}
        {/snippet}
        <p>Body</p>
      </SideSurface>
    </div>
  {/each}
</main>
