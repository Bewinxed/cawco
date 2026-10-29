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
  import { decisionReference } from "@cawco/core/references";
  import { IconDecisions } from "#lib/icons.js";
  import { artifactMarks } from "./artifact-names.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";

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
</script>

<ReferenceChip
  artifact={named?.artifact}
  at={{ card: named?.card ?? "" }}
  data-decision-chip={id}
  glyph={IconDecisions}
  refKey="ref:{id}:card"
  {title}
  {words}
/>
