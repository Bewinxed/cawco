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
   * The row is ONE generation of the tail (see `rows.ts`). When the answer
   * lands as its message, that message keeps this row's key (`keepLive`) and
   * this component goes on drawing it: the same face, the same rendered
   * markdown, now with its clock and its last words — so the settle changes
   * only what changed, instead of rendering the whole reply again. Reasoning
   * settles into a row of its own, and this component goes; the next
   * generation, if the turn goes on, arrives as a row of its own.
   */
  import { untrack } from "svelte";
  import { dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import MessageBody from "../MessageBody.svelte";
  import { useVoice } from "../turn/voice";
  import Who from "../turn/Who.svelte";
  import { useLedger } from "./arrivals.svelte";
  import type { Row } from "./rows";
  import Thinking from "./Thinking.svelte";

  type Live = Extract<Row, { kind: "live" }>;
  /** The answer this row streamed, landed as its message (rows.ts `streamed`). */
  type Said = Extract<Row, { kind: "single" }>;
  type Phase = "answer" | "reasoning";

  let {
    row,
    agentName,
    announce,
  }: { row: Live | Said; agentName: string; announce: boolean } = $props();

  /** The transcript's voice: a face of its own puts the thinking beat on its speaker line. */
  const voice = useVoice() ?? {};

  const ledger = useLedger();
  const phaseOf = (r: Live | Said): Phase =>
    r.kind === "single" || r.text ? "answer" : "reasoning";

  interface Face {
    /** Entering: fading in over the face that is leaving. */
    entering: boolean;
    id: number;
    /** Leaving: held on top, fading out, with the row as it last was. */
    leaving: Live | Said | null;
    phase: Phase;
    /**
     * The rail a leaving face keeps: the gap and head it was drawn with. The
     * row's continuation is read off the phase (Transcript's `railLed`), so
     * the change that sends this face out also restyles its rail, and the
     * fading reasoning block dropped 14px under the answer coming in.
     */
    rail: Rail | null;
  }
  /** A rail's gap and head, as the row's custom properties hold them. */
  interface Rail {
    gap: string;
    head: string;
  }

  let serial = 0;
  let faces = $state<Face[]>([
    {
      id: 0,
      phase: untrack(() => phaseOf(row)),
      leaving: null,
      entering: false,
      rail: null,
    },
  ]);

  /** The rail the row draws right now (`--rail-gap`, `--rail-head`). */
  function railNow(live: HTMLElement): Rail {
    const style = getComputedStyle(live);
    const gap = style.getPropertyValue("--rail-gap").trim();
    const head = style.getPropertyValue("--rail-head").trim();
    return { gap: gap || "var(--space-4)", head: head || "var(--rail)" };
  }
  let box = $state<HTMLElement>();
  let tweening = $state(false);
  /** The row as the last flush drew it — what a leaving face keeps showing. */
  let drawn = untrack(() => row);
  /** The height the row had when its phase changed, until the tween reads it. */
  let from: number | null = null;

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
            {
              ...current,
              leaving: drawn,
              entering: false,
              rail: railNow(box),
            },
            { id: serial, phase, leaving: null, entering: true, rail: null },
          ];
        } else {
          faces = [
            { id: serial, phase, leaving: null, entering: false, rail: null },
          ];
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
          duration: dur("--dur-pop"),
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

<!-- MessageRow's assistant turn, drawn by this row while it streams and once
     it has landed: the same section, header and body, so landing adds the
     clock and the last words and nothing else. -->
{#snippet body(live: Live | Said, phase: Phase)}
  {#if phase === "answer"}
    <!-- MessageRow's turn spacing; grouped, MessageRow's grouped turn, so
         the answer settles without moving. -->
    <section
      data-slot="turn"
      data-grouped={live.grouped || undefined}
      class="mt-space-4 data-grouped:flow-root data-grouped:mt-space-2"
    >
      <Who
        grouped={live.grouped}
        live={live.kind === "live"}
        name={agentName}
        timestamp={live.kind === "single" ? live.message.timestamp : undefined}
      />
      <MessageBody
        fades={ledger?.watched ?? false}
        source={live.kind === "single" ? live.message.content : live.text}
        streaming={live.kind === "live"}
      />
    </section>
  {:else if voice.face}
    <!-- A voice with a face of its own (a project's Caw, turn/voice.ts)
         is on his speaker line from the first beat of a turn: his working
         still over what he is thinking. -->
    <section
      data-slot="turn"
      data-grouped={live.grouped || undefined}
      class="mt-space-4 data-grouped:flow-root data-grouped:mt-space-2"
    >
      <Who grouped={live.grouped} live name={agentName} />
      {@render thinking(live)}
    </section>
  {:else}
    {@render thinking(live)}
  {/if}
{/snippet}

{#snippet thinking(live: Live | Said)}
  <!-- Live for as long as this row is: a block that has closed keeps its
       label until its settled row takes its place. Relabelled here, the
       narrower label pulled the chevron after it 16px across. -->
  <Thinking
    {announce}
    fades={ledger?.watched ?? false}
    live
    text={live.kind === "live" ? (live.thinking ?? "") : ""}
  />
{/snippet}

<div
  data-slot="live"
  data-tweening={tweening || undefined}
  class="relative data-tweening:overflow-hidden"
  bind:this={box}
>
  {#each faces as face (face.id)}
    <!-- A face contains its content's top margin (flow-root), so the row's
         height is the same whichever face draws it — and the same as the
         settled row it becomes. A leaving face keeps the rail it was drawn
         with (railNow): its --rail-gap and --rail-head. -->
    <div
      aria-hidden={face.leaving ? true : undefined}
      class="flow-root min-w-0 data-leaving:absolute data-leaving:top-0 data-leaving:inset-x-0 data-leaving:pointer-events-none"
      data-entering={face.entering || undefined}
      data-leaving={face.leaving !== null || undefined}
      inert={face.leaving !== null}
      onanimationend={(event) => settle(face, event)}
      style:--rail-gap={face.rail?.gap}
      style:--rail-head={face.rail?.head}
    >
      {@render body(face.leaving ?? row, face.phase)}
    </div>
  {/each}
</div>

<style>
  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-leaving] {
      animation: face-out var(--dur-exit) var(--ease-out) forwards;
    }
    [data-entering] {
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
</style>
