<script lang="ts">
  /**
   * A spot an update changed, named in written words
   * (`[label](cawco:change/<artifact>/<anchor>)`, core references.ts): the
   * hub writes one for each thing an agent's update changed, and the turn
   * that made the update carries it as a chip under its row (ToolGroup).
   * Drawn as the inline chip (ui/chip `inline`) with the changed glyph as
   * its mark and what changed as its label. Its tip says whether the person
   * has looked at it yet, while the dashboard holds the page's doc. Pressed,
   * the artifact comes to the front of the panel at that spot: scrolled to
   * it, its ring pinging, with its comment's thread open
   * (reference-open.svelte.ts, PreviewPane's open at a change).
   */
  import { changeReference, commentWords } from "@cawco/core";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import RowFault from "./RowFault.svelte";
  import { openReference } from "./reference-open.svelte";
  import { refusals } from "./refusals.svelte";
  import { sessionHere } from "./session-here";

  let { id, label = "" }: { id: string; label?: string } = $props();
  const here = sessionHere();

  const named = $derived(changeReference(id));
  const words = $derived(label || commentWords.changed);
  /** Where the last press's refusal is said: beside the chip, kept through a reload. */
  const refKey = $derived(`ref:${id}:change`);
  async function press(): Promise<void> {
    if (!named) {
      return;
    }
    const key = refKey;
    const refused = await openReference(
      named.artifact,
      { change: named.anchor },
      here?.()
    );
    if (refused) {
      refusals.set(key, { reason: refused });
    } else {
      refusals.delete(key);
    }
  }
</script>

<button
  aria-label={commentWords.changeChip(words)}
  class={chipVariants({ variant: "inline" })}
  data-change-chip={id}
  onclick={press}
  type="button"
>
  <span
    data-slot="mark"
    aria-hidden="true"
    class="grid size-c-row-mark flex-none place-items-center text-c-change-ring"
    data-box
  >
    <IconRefresh class="block size-icon-sm" />
  </span>
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
