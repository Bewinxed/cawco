<script lang="ts">
  import { planWords } from "@cawco/core/words/plan";
  /**
   * One task of a session's plan, as a row of the plan's list (ui/lead-row):
   * its state glyph in the lead column, its title, and at its end its
   * to-dos' count, the fold's chevron and the mark of the session on it,
   * each in a fixed cell so they read down one column. Under the title,
   * what the person needs at a glance and nothing more: the to-do under way
   * while it moves (its own words, its glyph breathing), what a held task
   * waits for, or that it waits on them, which leads to the list of what
   * does.
   *
   * A row with no to-dos and no one on it has no trailing cells, so its
   * title takes the row's width; a row with either keeps all three, so its
   * count stands in the count column.
   *
   * Its to-dos fold to their count; a press anywhere on the row opens them
   * under it, from the title's edge, and folds them again (the title is the
   * button; its hit area and hover fill lie under the whole row). A task
   * with none is no switch.
   */
  import StepMark from "#lib/cawco/connect/StepMark.svelte";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { sessionPlace } from "#lib/cawco/session-names.svelte.js";
  import { LeadCell, LeadRow } from "#lib/components/ui/lead-row/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { movingTodos, type PlanRow } from "./plan-view";

  let {
    row,
    open = false,
    who = true,
    ontoggle,
    onwaiting,
  }: {
    row: PlanRow;
    /** Its to-dos stand open under it. */
    open?: boolean;
    /** Its end shows the mark of the session on it (in order; by who, the group says it). */
    who?: boolean;
    ontoggle?: () => void;
    /** Opens the list of what waits on the person. */
    onwaiting?: () => void;
  } = $props();

  const todosId = $props.id();
  const moving = $derived(movingTodos(row));
  const folds = $derived(row.todos.length > 0);
  /** What stands under the title: every to-do while open, else the ones under way. */
  const shown = $derived(open ? row.todos : moving);
  const quiet = $derived(row.state === "done" || row.state === "gone");
  const words = $derived(
    row.state === "gone" ? planWords.gone(row.handle) : row.words
  );
</script>

{#snippet trailing()}
  <LeadCell size="figure">
    {#if folds}
      <span aria-hidden="true" class="type-meta num text-ink-muted"
        >{planWords.todosOf(row.todosDone, row.todos.length)}</span
      >
      <span class="sr-only"
        >{planWords.todosLabel(row.todosDone, row.todos.length)}</span
      >
    {/if}
  </LeadCell>
  <LeadCell size="chevron">
    {#if folds}
      <IconChevronDown
        aria-hidden="true"
        class={[
          "size-icon-sm text-ink-subtle transition-transform duration-(--duration-control)",
          open && "rotate-180",
        ]}
      />
    {/if}
  </LeadCell>
  {#if who}
    <LeadCell size="mark">
      {#if row.who}
        <span class="contents" title={row.who.name}>
          <SessionMark
            id={row.who.id}
            place={sessionPlace(row.who.id)}
            status={row.who.working ? "live" : "idle"}
          />
        </span>
      {/if}
    </LeadCell>
  {/if}
{/snippet}

<LeadRow
  data-flip
  data-state={row.state}
  data-step={row.handle}
  ends={folds || (who && row.who) ? trailing : undefined}
>
  {#snippet mark()}
    <StepMark state={row.state} />
  {/snippet}
  {#if folds}
    <button
      aria-controls={todosId}
      aria-expanded={open}
      class={[
        "text-start text-pretty after:absolute after:-inset-x-space-1 after:inset-y-0 after:-z-1 after:rounded-sm after:transition-colors after:duration-(--duration-control) hover:after:bg-surface-hover focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus-ring",
        quiet ? "text-ink-muted" : "text-ink-strong",
      ]}
      onclick={ontoggle}
      type="button">{words}</button
    >
  {:else}
    <span
      class={[
        "block text-pretty",
        quiet ? "text-ink-muted" : "text-ink-strong",
      ]}>{words}</span
    >
  {/if}
  {#if row.state === "you"}
    <button
      class="relative mt-space-1 block rounded-xs text-start type-meta font-medium text-status-attn-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
      onclick={onwaiting}
      type="button">{planWords.needsYou}</button
    >
  {:else if row.wait}
    <span class="mt-space-1 block text-pretty type-meta text-ink-muted"
      >{row.wait.words}</span
    >
  {/if}
  {#snippet below()}
    {#if shown.length > 0}
      <ul class="flex flex-col" id={todosId} transition:unfold>
        {#each shown as todo (todo.handle)}
          <LeadRow data-step={todo.handle} step="sub">
            {#snippet mark()}
              <StepMark size="sm" state={todo.state} />
            {/snippet}
            <span
              class={[
                "block text-pretty",
                todo.state === "done" || todo.state === "gone"
                  ? "text-ink-muted"
                  : "text-ink-strong",
              ]}
              >{todo.state === "gone"
                ? planWords.gone(todo.handle)
                : todo.words}</span
            >
          </LeadRow>
        {/each}
      </ul>
    {/if}
  {/snippet}
</LeadRow>
