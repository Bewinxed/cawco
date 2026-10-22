<script lang="ts">
  /**
   * A decision card named in written words
   * (`[question](cawco:decision/<artifact>/<card>)`, core references.ts),
   * drawn as its chip: the inline chip (ui/chip `inline`) with a decision
   * page's glyph as its mark and the card's question, as written, as its
   * label. Its tip says whether the person has picked on it, when the
   * dashboard holds the page's picks. Pressed, the page comes to the front
   * of the panel scrolled to the card, outlined for a moment
   * (reference-open.svelte.ts).
   */
  import { decisionReference } from "@cawco/core";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconDecisions } from "#lib/icons.js";
  import { artifactMarks } from "./artifact-names.svelte";
  import RowFault from "./RowFault.svelte";
  import { openReference } from "./reference-open.svelte";
  import { refusals } from "./refusals.svelte";

  let { id, label = "" }: { id: string; label?: string } = $props();

  const named = $derived(decisionReference(id));
  const picked = $derived.by(() => {
    const at = named;
    const marks = at ? artifactMarks(at.artifact) : null;
    if (!(at && marks)) {
      return null;
    }
    const entry = marks.choices[at.card];
    return (
      !!entry &&
      (entry.options.length > 0 ||
        (entry.value !== null && entry.value !== undefined))
    );
  });
  const words = $derived(label || named?.card || "");
  const title = $derived(
    picked === null ? words : `${words} · ${picked ? "picked" : "not picked"}`
  );
  /** Where the last press's refusal is said: beside the chip, kept through a reload. */
  const refKey = $derived(`ref:${id}:card`);
  async function press(): Promise<void> {
    if (!named) {
      return;
    }
    const key = refKey;
    const refused = await openReference(named.artifact, { card: named.card });
    if (refused) {
      refusals.set(key, { reason: refused });
    } else {
      refusals.delete(key);
    }
  }
</script>

<button
  class={chipVariants({ variant: "inline" })}
  data-decision-chip={id}
  onclick={press}
  {title}
  type="button"
>
  <span
    data-slot="mark"
    aria-hidden="true"
    class="grid size-c-row-mark flex-none place-items-center text-ink-muted"
    data-box
  >
    <IconDecisions class="block size-icon-sm" />
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
