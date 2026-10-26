<script lang="ts">
  /**
   * A task, a to-do, a plan, a step, a routine, a project or a machine named in written words (`[label](cawco:<kind>/<id>)`,
   * core references.ts), drawn as its chip: the inline chip (ui/chip
   * `inline`) in its kind's look (reference-looks.ts, the one place a kind's
   * look is written), its name as the dashboard reads it now
   * (reference-things.svelte.ts), else the written label, and its state.
   * Its whole name and state are its accessible name.
   *
   * Resting a mouse on it peeks it under it after `--dur-peek`: its name,
   * its state and its facts (the floating tag recipe, as a pin's chip
   * peeks). Pressed, it opens where the thing lives: its page, its project
   * at the task or to-do, the session's plan at the step, the machines.
   */
  import { Portal } from "bits-ui";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { chipPeek } from "./chip-peek.svelte";
  import { numberOf } from "./motion/curves.svelte";
  import { REFERENCE_LOOKS } from "./reference-looks";
  import { openThing } from "./reference-open.svelte";
  import { type ThingKind, thingNamed } from "./reference-things.svelte";

  let {
    id,
    kind,
    label = "",
  }: { id: string; kind: ThingKind; label?: string } = $props();

  const thing = $derived(thingNamed(kind, id));
  const look = $derived(REFERENCE_LOOKS[kind]);
  const words = $derived(thing?.label || label);
  const name = $derived(thing?.state ? `${words}, ${thing.state}` : words);

  let chip = $state<HTMLButtonElement>();
  // Inside the viewport: a chip near its end side peeks back from it.
  const peek = chipPeek(
    () => chip,
    () => !!thing,
    (r) => {
      const room = numberOf("--c-pin-card-w") || 280;
      const inset = numberOf("--space-2") || 8;
      return {
        x: Math.max(inset, Math.min(r.left, innerWidth - room - inset)),
        y: r.bottom,
      };
    }
  );
</script>

<button
  aria-label={name}
  class={chipVariants({
    variant: "inline",
    class: look.mark ? undefined : "ps-space-2",
  })}
  data-reference-chip={kind}
  data-reference-id={id}
  onblur={peek.leave}
  onclick={() => {
    peek.leave();
    if (thing) {
      openThing(thing);
    }
  }}
  onpointerenter={peek.rest}
  onpointerleave={peek.leave}
  type="button"
  bind:this={chip}
>
  {#if look.mark}
    {@const Mark = look.mark}
    <span
      data-slot="mark"
      aria-hidden="true"
      class="grid size-c-row-mark flex-none place-items-center text-ink-muted"
      data-box
    >
      <Mark class="block size-icon-sm" />
    </span>
  {/if}
  <span data-slot="label">{words}</span>
  {#if thing?.state}
    <span data-slot="state" class={["flex-none", look.state]}
      >{thing.state}</span
    >
  {/if}
</button><Portal>
  {#if peek.at && thing}
    <!-- The viewport is its room: a transcript's rows clip what stands inside them. -->
    <div
      class="pointer-events-none fixed inset-0 z-(--layer-float)"
      data-slot="reference-peek"
    >
      <div
        aria-hidden="true"
        class="absolute start-(--peek-x) top-(--peek-y) flex flex-col gap-space-1 max-w-c-pin-card-w mt-space-1 px-space-2 py-space-1 border border-border-control rounded-sm bg-surface-raised shadow-tile motion-safe:animate-arrive"
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
