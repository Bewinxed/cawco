<script lang="ts">
  /**
   * A side card's head with a pane's own `actions` beside its name, for the
   * side-head probe: the real SideSurface as wide as Split stands it beside a
   * page (45% of it, never under its 320px floor, inside its 12px inset),
   * once for each kind of name a side card carries, beside a pane's actions:
   * - the plan's: its title, its progress ring and figure (`titleControl`,
   *   the title its lead);
   * - a task attempt's to-dos (`title`);
   * - a project file's name (`title`), beside icon actions.
   * The probe reads every word and the ring of the name against every action.
   */
  import { planWords } from "@cawco/core/words/plan";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconCopy, IconExternal, IconMaximize } from "#lib/icons.js";

  const CARDS = [
    { key: "plan", title: undefined },
    { key: "todos", title: planWords.todos },
    {
      key: "file",
      title: "2026-10-06-projects-plan-view-proposal.md",
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
      style:--card-w={"calc(max(45vw, var(--spacing-c-side-surface-min)) - 2 * var(--spacing-space-3))"}
    >
      <SideSurface
        label="Bench {card.key}"
        onclose={noop}
        recessed={false}
        title={card.title}
        titleControl={card.key === "plan" ? planName : undefined}
      >
        {#snippet actions()}
          <Button aria-label="Copy" data-action size="icon-sm" variant="ghost"
            ><IconCopy /></Button
          >
          {#if card.key === "file"}
            <Button
              aria-label="Expand"
              data-action
              size="icon-sm"
              variant="ghost"><IconMaximize /></Button
            >
          {:else}
            <Button data-action size="sm" variant="ghost"
              ><IconExternal /><span>{planWords.openInCanvas}</span></Button
            >
            <!-- A desk's split gives every side card its Expand. -->
            <Button
              aria-label="Expand"
              data-action
              size="icon-sm"
              variant="ghost"><IconMaximize /></Button
            >
          {/if}
        {/snippet}
        <p class="pt-(--side-room)">Body</p>
      </SideSurface>
    </div>
  {/each}
</main>
