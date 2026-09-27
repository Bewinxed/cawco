<script lang="ts">
  /**
   * The turn's live tail: the indicator while the agent works, its reasoning
   * while it reasons, its answer once it speaks — one row the whole time, so
   * the space is never given up between them.
   *
   * A change of phase is a crossfade inside the row: the outgoing face fades
   * out on top while the incoming one fades in, and the row's height tweens
   * from one to the other (--dur-pop, --ease-in-out: this is movement on
   * screen, not an entrance). Measured before and after the change, never
   * from a ResizeObserver, so nothing here writes layout in an observer.
   *
   * The row is ONE generation of the tail (see `rows.ts`). When the answer or
   * the reasoning settles into a row of its own, that row is this one wearing
   * its final key, and this component simply goes; the next generation, if
   * the turn goes on, arrives as a row of its own.
   */
  import { untrack } from "svelte";
  import type { Trail } from "$lib/components/ui/markdown/trail";
  import { motionOk } from "$lib/whiffle/motion/curves.svelte";
  import { useLedger } from "./arrivals.svelte";
  import MessageBody from "./MessageBody.svelte";
  import type { Row } from "./rows";
  import Thinking from "./Thinking.svelte";
  import Who from "./Who.svelte";

  type Live = Extract<Row, { kind: "live" }>;
  type Phase = "answer" | "reasoning";

  let {
    row,
    agentName,
    announce,
  }: { row: Live; agentName: string; announce: boolean } = $props();

  const ledger = useLedger();
  const phaseOf = (r: Live): Phase => (r.text ? "answer" : "reasoning");

  interface Face {
    /** Entering: fading in over the face that is leaving. */
    entering: boolean;
    id: number;
    /** Leaving: held on top, fading out, with the row as it last was. */
    leaving: Live | null;
    phase: Phase;
  }

  let serial = 0;
  let faces = $state<Face[]>([
    {
      id: 0,
      phase: untrack(() => phaseOf(row)),
      leaving: null,
      entering: false,
    },
  ]);
  let box = $state<HTMLElement>();
  let tweening = $state(false);
  /** The row as the last flush drew it — what a leaving face keeps showing. */
  let drawn = untrack(() => row);
  /** The height the row had when its phase changed, until the tween reads it. */
  let from: number | null = null;

  const ms = (style: CSSStyleDeclaration, token: string): number =>
    Number.parseFloat(style.getPropertyValue(token));

  $effect.pre(() => {
    const next = row;
    untrack(() => {
      const current = faces.at(-1) as Face;
      const phase = phaseOf(next);
      if (phase !== current.phase) {
        const moving = !!box && motionOk.current && !!ledger?.watched;
        serial += 1;
        if (moving && box) {
          from = box.getBoundingClientRect().height;
          faces = [
            { ...current, leaving: drawn, entering: false },
            { id: serial, phase, leaving: null, entering: true },
          ];
          if (phase === "answer" && ledger) {
            // The face fading in is the fade of the words it opens with: if
            // the answer settles before it ends, its row plays it on.
            ledger.trail(next.key).chunks.push({
              from: 0,
              start: document.timeline.currentTime as number,
            });
          }
        } else {
          faces = [{ id: serial, phase, leaving: null, entering: false }];
        }
      }
      drawn = next;
    });
  });

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: the tween is armed by the faces changing.
    void faces.length;
    untrack(() => {
      if (from === null || !box) {
        return;
      }
      const start = from;
      from = null;
      const end = box.getBoundingClientRect().height;
      if (Math.abs(end - start) < 0.5) {
        return;
      }
      const style = getComputedStyle(box);
      tweening = true;
      box
        .animate([{ blockSize: `${start}px` }, { blockSize: `${end}px` }], {
          duration: ms(style, "--dur-pop"),
          easing: style.getPropertyValue("--ease-in-out"),
        })
        .finished.then(
          () => {
            tweening = false;
          },
          () => {
            tweening = false;
          }
        );
    });
  });

  function settle(face: Face, event: AnimationEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (face.leaving) {
      faces = faces.filter((f) => f.id !== face.id);
    } else if (face.entering) {
      face.entering = false;
    }
  }
</script>

{#snippet body(live: Live, phase: Phase, trail: Trail | undefined)}
  {#if phase === 'answer'}
    <section class="turn">
      <Who name={agentName} />
      <MessageBody
        fades={ledger?.watched ?? false}
        source={live.text}
        streaming
        {trail}
      />
    </section>
  {:else}
    <Thinking
      {announce}
      fades={ledger?.watched ?? false}
      live={live.indicating}
      text={live.thinking ?? ''}
    />
  {/if}
{/snippet}

<div class="live" bind:this={box} class:tweening={tweening}>
  {#each faces as face (face.id)}
    <div
      aria-hidden={face.leaving ? true : undefined}
      class="face"
      inert={face.leaving !== null}
      onanimationend={(event) => settle(face, event)}
      class:entering={face.entering}
      class:leaving={face.leaving !== null}
    >
      <!-- Only the answer on screen to stay records its chunks. -->
      {@render body(face.leaving ?? row, face.phase, face.leaving || face.phase !== 'answer' ? undefined : ledger?.trail(row.key))}
    </div>
  {/each}
</div>

<style>
  .live {
    position: relative;

    &.tweening {
      overflow: hidden;
    }
  }
  /* A face contains its content's top margin, so the row's height is the
     same whichever face draws it — and the same as the settled row it
     becomes. */
  .face {
    display: flow-root;
    min-inline-size: 0;

    &.leaving {
      position: absolute;
      inset-block-start: 0;
      inset-inline: 0;
      pointer-events: none;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .face.leaving {
      animation: face-out var(--dur-exit) var(--ease-out) forwards;
    }
    .face.entering {
      animation: face-in var(--dur-menu) var(--ease-out) backwards;
    }
  }
  @keyframes face-out {
    to {
      opacity: 0;
    }
  }
  @keyframes face-in {
    from {
      opacity: 0;
    }
  }
  .turn {
    margin-block-start: var(--space-4);
  }
</style>
