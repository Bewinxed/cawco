<script lang="ts">
  /**
   * The tasks Caw filed, under the reply that filed them (advisor report
   * §2, "A filed task says what it is and why"): a head line, then a card
   * each (the TaskCard recipe: radius-sm, the tile shadow), one column in
   * the panel, two from 30rem of room. Each card: its title (label) and
   * Caw's one-line reason (meta); its stage only where it isn't the head
   * line's. The card opens the task; nothing leads to the board.
   *
   * Landing live, the head line then each card is uncovered top to bottom
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
  import type { Filed } from "./fixtures";

  let { tasks }: { tasks: Filed[] } = $props();

  /** The stage the head line names: the first task's; a card in it doesn't say it again. */
  const stage = $derived(tasks[0]?.stage ?? "");
  const head = $derived(
    `Filed ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · ${stage}`
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
  <div class="@container min-inline-0 pbs-space-2" data-filed>
    <p class="m-0 mbe-space-2 text-ink-muted text-meta" in:arrive|global={0}>
      {head}
    </p>
    <ul
      class="m-0 grid list-none grid-cols-1 gap-space-2 p-0 @min-[30rem]:grid-cols-2"
    >
      {#each tasks as task, at (task.id)}
        <li class="grid min-inline-0" in:arrive|global={at + 1}>
          <a
            class="group/task press-tint flex min-inline-0 flex-col gap-space-1 rounded-sm bg-surface-raised px-space-3 pbs-space-2 pbe-space-3 text-ink-strong no-underline shadow-tile transition-colors hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-solid focus-visible:outline-offset-(--focus-ring-inset)"
            data-filed-task={task.id}
            href="#{task.id}"
            onclick={(event) => event.preventDefault()}
          >
            <span class="line-clamp-2 min-inline-0 text-label wrap-anywhere"
              >{task.title}</span
            >
            <span
              class="line-clamp-2 min-inline-0 text-ink-muted text-meta wrap-anywhere text-pretty"
              >{task.why}</span
            >
            {#if task.stage !== stage}
              <span class="min-inline-0 text-ink-muted text-meta"
                >{task.stage}</span
              >
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </div>
{/if}
