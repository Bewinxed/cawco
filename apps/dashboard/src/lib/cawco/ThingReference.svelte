<script lang="ts">
  /**
   * A task, a to-do, a plan, a step, a routine, a project or a machine named in written words (`[label](cawco:<kind>/<id>)`,
   * core references.ts), drawn as its chip: the inline chip (ui/chip
   * `inline`) in its kind's look (reference-looks.ts, the one place a kind's
   * look is written), its name as the dashboard reads it now
   * (reference-things.svelte.ts), else the written label, and its state.
   * Its whole name and state are its accessible name.
   *
   * Resting a mouse on it peeks it under it after `--duration-slow`: its name,
   * its state and its facts (the floating tag recipe, as a pin's chip
   * peeks). Pressed in a conversation, a task or a to-do stands beside it
   * (the conversation's side card, or on a phone its sheet), the
   * conversation staying on screen; elsewhere it opens where the thing
   * lives: its page, its project at the task or to-do, the session's plan
   * at the step, the machines (reference-open.svelte.ts `openThing`).
   */
  import { Portal } from "bits-ui";
  import { numberOf } from "#lib/platform/motion/curves.svelte.js";
  import { chipPeek } from "./chip-peek.svelte";
  import type { ElementProps } from "./markdown-fleet";
  import ReferenceFace, { referenceChipClass } from "./ReferenceFace.svelte";
  import { REFERENCE_LOOKS } from "./reference-looks";
  import { openThing } from "./reference-open.svelte";
  import { isThingKind, thingNamed } from "./reference-things.svelte";
  import { besideHere } from "./tasks/beside-here";

  let { id, kind, label = "" }: ElementProps = $props();

  // The registry draws this element for a thing's kind alone (references.ts `thing`).
  const thing = $derived(isThingKind(kind) ? thingNamed(kind, id) : null);
  const look = $derived(isThingKind(kind) ? REFERENCE_LOOKS[kind] : null);
  const words = $derived(thing?.label || label);
  const name = $derived(thing?.state ? `${words}, ${thing.state}` : words);

  /** The conversation it stands in, which a task or a to-do stands beside. */
  const beside = besideHere();

  let chip = $state<HTMLButtonElement>();
  // Inside the viewport: a chip near its end side peeks back from it.
  const peek = chipPeek(
    () => chip,
    () => !!thing,
    (r) => {
      const room = 70 * (numberOf("--spacing-space-1") || 4);
      const inset = numberOf("--spacing-space-2") || 8;
      return {
        x: Math.max(inset, Math.min(r.left, innerWidth - room - inset)),
        y: r.bottom,
      };
    }
  );
</script>

{#if look}<button
    aria-label={name}
    class={referenceChipClass(!!look.mark)}
    data-reference-chip={kind}
    data-reference-id={id}
    onblur={peek.leave}
    onclick={() => {
      peek.leave();
      if (thing) {
        openThing(thing, beside?.());
      }
    }}
    onpointerenter={peek.rest}
    onpointerleave={peek.leave}
    type="button"
    bind:this={chip}
  >
    <ReferenceFace
      glyph={look.mark ?? undefined}
      state={thing?.state}
      stateClass={look.state}
      {words}
    />
  </button>{/if}<Portal>
  {#if peek.at && thing}
    <!-- The viewport is its room: a transcript's rows clip what stands inside them. -->
    <div
      class="pointer-events-none fixed inset-0 z-(--layer-float)"
      data-slot="reference-peek"
    >
      <div
        aria-hidden="true"
        class="absolute start-(--peek-x) top-(--peek-y) flex flex-col gap-space-1 max-w-70 mt-space-1 px-space-2 py-space-1 border border-border-control rounded-sm bg-surface-raised shadow-sm motion-safe:animate-fade-in motion-safe:anim-dur-fast"
        style:--peek-x="{peek.at.x}px"
        style:--peek-y="{peek.at.y}px"
      >
        <span class="type-label text-ink-strong text-pretty wrap-anywhere"
          >{thing.label}</span
        >
        {#if thing.state}
          <span class="type-meta text-ink-muted">{thing.state}</span>
        {/if}
        {#each thing.peek as line, at (at)}
          <span
            class="type-meta text-ink-muted line-clamp-2 text-pretty wrap-anywhere"
            >{line}</span
          >
        {/each}
      </div>
    </div>
  {/if}
</Portal>
