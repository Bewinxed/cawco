<script lang="ts">
  /**
   * PROPOSED (pin 1): the tasks Caw filed under his reply. Each says what it
   * is (its title), what it holds (the task
   * file's first body line) and why he filed it, the line that waits on
   * you marked with the house's needs-you glyph. Three lines at most; a
   * task with nothing to say past its title is one (The Idle Has No Fill
   * Rule).
   *
   * - `cards` (A): the TaskCard recipe (raised, tile shadow, radius-sm,
   *   space-2 space-3 space-3), one column under 30rem of room, two from
   *   30rem, three from 46rem; the last card of a row it can't fill takes
   *   the row.
   * - `rows` (B): one list in the reply's column, no card surface.
   *
   * Landing live, the head line then each task is uncovered top to bottom
   * on one clock: --pop-rise to none and 0 to 1 over --dur-pop, the n-th
   * starting n × min(--dur-stagger, --dur-cascade / n) after the first.
   * Nothing leads to the board: each task opens itself.
   *
   * Each task reads as the link it is. Its title is the row's name at the
   * top of the house's scale (label, 500, `ink-strong`: The 500 Ceiling
   * Rule makes the ink the step left); under the pointer or the focus ring
   * it takes the link's underline (from the font, its colour fading in, as
   * a named link's does, SystemLine `.aname`). No id: the owner reads
   * titles, and the task opens from its row.
   */
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import { extraOf } from "./fixtures";

  let {
    tasks,
    form,
    live = false,
    projectId,
  }: {
    tasks: TaskSummary[];
    form: "cards" | "rows";
    live?: boolean;
    projectId: string;
  } = $props();

  const head = $derived(
    `Filed ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · Backlog`
  );
  const taskHref = (id: string) =>
    `/project/${encodeURIComponent(projectId)}?task=${encodeURIComponent(id)}`;
</script>

<div
  class={["filed", { live }]}
  style:--count={tasks.length + 1}
  data-design-filed={form}
>
  <p class="head" style:--at={0}>{head}</p>
  <ul class={form} data-design-grid>
    {#each tasks as task, at (task.id)}
      {@const extra = extraOf(task.id)}
      <li class="item" style:--at={at + 1}>
        <a
          class="task press-tint focus-inset group/task"
          data-task={task.id}
          href={taskHref(task.id)}
          onclick={(event) => event.preventDefault()}
        >
          <span class="line">
            <!-- The row's name at the scale's top (label, 500, ink-strong),
                 with the link's underline from the font, held clear until
                 the task is under the pointer or the focus ring. -->
            <span
              class="title text-[var(--ink-strong)] underline decoration-transparent decoration-from-font transition-[text-decoration-color] duration-(--dur-control) ease-(--ease-out) [text-underline-position:from-font] group-hover/task:decoration-[color-mix(in_oklab,currentColor_35%,transparent)] group-focus-visible/task:decoration-[color-mix(in_oklab,currentColor_35%,transparent)]"
              >{task.title}</span
            >
          </span>
          {#if extra.summary}
            <span class="summary">{extra.summary}</span>
          {/if}
          {#if extra.why}
            <span class="why">
              {#if extra.waits}
                <span class="mark-cell"
                  ><IconNeedsYou aria-hidden="true" class="attn" /></span
                >
              {/if}
              <span class="why-words">{extra.why}</span>
            </span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
</div>

<style>
  .filed {
    container: filed / inline-size;
    min-inline-size: 0;
    padding-block-start: var(--space-3);
    /* One clock: the n-th starts n steps after the first, the last within the cascade. */
    --step: min(var(--dur-stagger), calc(var(--dur-cascade) / var(--count)));
  }
  .head {
    min-inline-size: 0;
    margin: 0 0 var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .item {
    display: grid;
    min-inline-size: 0;
  }
  .task {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
    color: var(--ink-strong);
    text-decoration: none;
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .title {
    flex: 1 1 auto;
    min-inline-size: 0;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-label);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .summary,
  .why-words {
    min-inline-size: 0;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .why {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    min-inline-size: 0;
    font: var(--type-meta);
  }
  /* The needs-you hand beside meta words: 12px (DESIGN.md, the Solar
     Duotone Rule's sizes), in the needs-you ink with its second layer at
     the status glyphs' weight, so it reads as a mark on a disc, not a
     yellow blob. */
  .why :global(.attn) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--status-attn-ink);
  }
  .why :global(.attn [opacity]) {
    opacity: var(--glyph-duo-status-opacity);
  }

  /* A: the TaskCard recipe, in columns by the room the reply has. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);

    @container filed (30rem <= width < 46rem) {
      grid-template-columns: repeat(2, minmax(0, 1fr));

      & .item:last-child:nth-child(2n + 1) {
        grid-column: 1 / -1;
      }
    }
    @container filed (width >= 46rem) {
      grid-template-columns: repeat(3, minmax(0, 1fr));

      & .item:last-child:nth-child(3n + 1) {
        grid-column: 1 / -1;
      }
    }
    & .task {
      padding: var(--space-2) var(--space-3) var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      box-shadow: var(--shadow-tile);
      transition: background-color var(--dur-control) var(--ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      & .task:hover {
        background: var(--surface-hover);
      }
    }
  }

  /* B: one list in the reply's column, rows on the transcript's own
     ground, a hairline between each; the hover reaches --space-2 past the
     words on each side as a shadow, which takes no room. */
  .rows {
    display: flex;
    flex-direction: column;

    & .item + .item {
      border-block-start: 1px solid var(--border-hairline);
    }
    & .task {
      padding-block: var(--space-2);
      border-radius: var(--radius-sm);
      transition:
        background-color var(--dur-control) var(--ease-out),
        box-shadow var(--dur-control) var(--ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      & .task:hover {
        background: var(--surface-hover);
        box-shadow:
          calc(var(--space-2) * -1) 0 0 0 var(--surface-hover),
          var(--space-2) 0 0 0 var(--surface-hover);
      }
    }
  }

  /* Landing live: the head, then each task, uncovered on one clock. Reduced
     motion keeps the fade and drops the rise. */
  .live :is(.head, .item) {
    animation: filed-fade var(--dur-pop) var(--ease-out) both;
    animation-delay: calc(var(--at) * var(--step));

    @media (prefers-reduced-motion: no-preference) {
      animation-name: filed-rise;
    }
  }
  @keyframes filed-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes filed-rise {
    from {
      opacity: 0;
      translate: 0 var(--pop-rise);
    }
  }
</style>
