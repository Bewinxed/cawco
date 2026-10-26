<script lang="ts">
  /**
   * The chip every reference to a place in an artifact is drawn as (an
   * artifact's, a spot an update changed, a decision card's, a pin's): the
   * inline chip (ui/chip `inline`) with its mark and its words, which opens
   * `artifact` at `at` when pressed (reference-open.svelte.ts), and the
   * press the hub refused said beside it, kept through a reload under
   * `refKey`, with Try again.
   *
   * Its mark is `glyph` in the row mark's box, tinted by `tone`, or `mark`
   * drawn whole.
   */
  import type { Component, Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import type { OpenAt } from "./artifact-names.svelte";
  import RowFault from "./RowFault.svelte";
  import { openReference } from "./reference-open.svelte";
  import { refusals } from "./refusals.svelte";
  import { sessionHere } from "./session-here";

  let {
    artifact,
    at,
    refKey,
    words,
    glyph: Glyph,
    tone = "text-ink-muted",
    mark,
    onpress,
    ref = $bindable(),
    ...rest
  }: Omit<HTMLButtonAttributes, "onclick"> & {
    /** The artifact it opens; nothing happens on a press while it is unknown. */
    artifact: string | undefined;
    at: OpenAt;
    /** Where its refusal is kept (refusals.svelte.ts). */
    refKey: string;
    words: string;
    glyph?: Component;
    /** The glyph's colour, a text utility. */
    tone?: string;
    mark?: Snippet;
    /** Runs as it is pressed, before the artifact opens. */
    onpress?: () => void;
    ref?: HTMLButtonElement;
  } = $props();
  const here = sessionHere();

  async function press(): Promise<void> {
    if (!artifact) {
      return;
    }
    const key = refKey;
    const refused = await openReference(artifact, at, here?.());
    if (refused) {
      refusals.set(key, { reason: refused });
    } else {
      refusals.delete(key);
    }
  }
</script>

<button
  class={chipVariants({ variant: "inline" })}
  onclick={() => {
    onpress?.();
    return press();
  }}
  type="button"
  {...rest}
  bind:this={ref}
>
  {#if mark}
    {@render mark()}
  {:else if Glyph}
    <span
      data-slot="mark"
      aria-hidden="true"
      class="grid size-c-row-mark flex-none place-items-center {tone}"
      data-box
    >
      <Glyph class="block size-icon-sm" />
    </span>
  {/if}
  <span data-slot="label">{words}</span>
</button>
<!-- A press the hub refused, said beside the chip in the sentence it
     stands in, with Try again. -->
<RowFault
  again={press}
  class="inline-block max-w-full align-baseline"
  data-reference-refused
  reason={refusals.reason(refKey)}
/>
