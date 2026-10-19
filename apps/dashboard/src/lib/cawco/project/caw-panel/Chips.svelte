<script lang="ts">
  /**
   * The things to ask Caw on an empty thread as the kit's option chips
   * (app.css `.kit-chip` in a `.kit-chips` row), each a short label with its
   * kind's glyph, as wide as its words, standing side by side and wrapping
   * like words from the column's start edge (pin 22). The whole sentence is
   * the chip's tooltip and its name, and a press puts the sentence in the
   * message box, unsent. The hub writes no short label yet (`LABELS`); a
   * suggestion without one shows its sentence.
   */
  import { GLYPHS } from "#lib/cawco/project/StarterCards.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { LABELS, type Suggestion } from "./fixtures";

  let {
    suggestions,
    onpick,
  }: { suggestions: Suggestion[]; onpick: (text: string) => void } = $props();
</script>

<ul
  aria-label="Things to ask Caw"
  class="kit-chips m-0 list-none justify-start p-0"
  data-suggestion-chips
>
  {#each suggestions as one (one.text)}
    {@const Glyph = GLYPHS[one.glyph]}
    <li class="flex max-w-full">
      <Tip label={one.text}>
        {#snippet children(tip)}
          <button
            {...tip}
            aria-label={one.text}
            class="kit-chip touch-hit max-w-full transition-[background-color,scale] duration-(--dur-control) ease-(--ease-out) active:scale-(--press-scale)"
            onclick={() => onpick(one.text)}
            type="button"
          >
            <Glyph
              aria-hidden="true"
              class="size-(--icon-md) shrink-0 text-(--ink-muted) [&_[opacity]]:opacity-(--glyph-duo-status-opacity)"
            />
            <span class="min-w-0 [overflow-wrap:anywhere]"
              >{LABELS[one.text] ?? one.text}</span
            >
          </button>
        {/snippet}
      </Tip>
    </li>
  {/each}
</ul>
