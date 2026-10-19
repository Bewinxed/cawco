<script lang="ts">
  /**
   * The tasks Caw filed, under the reply that filed them (pin 1): his
   * receipt, read to see he got it right. Each says what it is (its title),
   * what it holds (the task file's first line) and why he filed it, the why
   * that waits on you led by the needs-you glyph. A task with nothing past
   * its title is one line. Nothing leads to the board (pin 2): each task
   * opens itself.
   *
   * - `cards`: each task a raised card (the TaskCard recipe: radius-sm, the
   *   tile shadow), one column in the panel, two from 30rem of room.
   * - `rows`: one list in the reply's column on the thread's own ground, a
   *   hairline between rows, the hover tint reaching the row's edges.
   *
   * Landing live, the head line then each task is uncovered top to bottom
   * on one clock (DESIGN.md, The Nothing Jumps Rule): a fade from nothing
   * and, motion allowed, a rise from --pop-rise, over --dur-pop on
   * --ease-out, the n-th starting n × min(--dur-stagger, --dur-cascade / n)
   * after the first. With less motion, the fade alone.
   */
  import {
    dur,
    easeOut,
    motionOk,
    popRise,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import type { Filed } from "./fixtures";

  let {
    tasks,
    form,
  }: {
    tasks: Filed[];
    form: "cards" | "rows";
  } = $props();

  const head = $derived(
    `Filed ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · Backlog`
  );

  /** The n-th of the block's rows, on the block's one clock. */
  function arrive(_node: Element, at: number) {
    const step = Math.min(
      dur("--dur-stagger"),
      dur("--dur-cascade") / (tasks.length + 1)
    );
    const travel = motionOk.current;
    const rise = popRise();
    return {
      delay: at * step,
      duration: dur("--dur-pop"),
      easing: easeOut,
      css: (t: number) =>
        travel
          ? `opacity: ${t}; translate: 0 ${(1 - t) * rise}px`
          : `opacity: ${t}`,
    };
  }
</script>

{#if tasks.length > 0}
  <div class="@container min-w-0 pt-(--space-2)" data-filed={form}>
    <p
      class="m-0 mb-(--space-2) text-(--ink-muted) text-meta"
      in:arrive|global={0}
    >
      {head}
    </p>
    <ul
      class={[
        "m-0 list-none p-0",
        form === "cards"
          ? "grid grid-cols-1 gap-(--space-2) @min-[30rem]:grid-cols-2"
          : "flex flex-col divide-y divide-(--border-hairline)",
      ]}
    >
      {#each tasks as task, at (task.id)}
        <li class="grid min-w-0" in:arrive|global={at + 1}>
          <a
            class={[
              "group/task press-tint flex min-w-0 flex-col gap-(--space-1) text-(--ink-strong) no-underline transition-colors focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-(--focus-ring) focus-visible:outline-solid focus-visible:[outline-offset:calc(var(--focus-ring-width)*-1)]",
              form === "cards"
                ? "rounded-sm bg-(--surface-raised) px-(--space-3) pt-(--space-2) pb-(--space-3) shadow-(--shadow-tile) hover:bg-(--surface-hover)"
                : "-mx-(--space-2) rounded-sm px-(--space-2) py-(--space-2) hover:bg-(--surface-hover)",
            ]}
            data-filed-task={task.id}
            href="#{task.id}"
            onclick={(event) => event.preventDefault()}
          >
            <span
              class="line-clamp-2 min-w-0 text-label underline decoration-transparent decoration-from-font transition-[text-decoration-color] duration-(--dur-control) ease-(--ease-out) [overflow-wrap:anywhere] [text-underline-position:from-font] group-hover/task:decoration-[color-mix(in_oklab,currentColor_35%,transparent)] group-focus-visible/task:decoration-[color-mix(in_oklab,currentColor_35%,transparent)]"
              >{task.title}</span
            >
            {#if task.summary}
              <span
                class="line-clamp-2 min-w-0 text-(--ink-muted) text-meta [overflow-wrap:anywhere] [text-wrap:pretty]"
                >{task.summary}</span
              >
            {/if}
            {#if task.why}
              <span
                class="mark-line flex min-w-0 items-start gap-(--space-1) text-(--ink-muted) text-meta"
              >
                {#if task.waits}
                  <span class="mark-cell"
                    ><IconNeedsYou
                      aria-hidden="true"
                      class="size-(--icon-sm) [&_[opacity]]:opacity-(--glyph-duo-status-opacity)"
                    /></span
                  >
                {/if}
                <span
                  class="line-clamp-2 min-w-0 [overflow-wrap:anywhere] [text-wrap:pretty]"
                  >{task.why}</span
                >
              </span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </div>
{/if}
