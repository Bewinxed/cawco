<script lang="ts">
  /**
   * A decision card named in written words
   * (`[question](cawco:decision/<artifact>/<card>)`, core references.ts),
   * drawn as its chip: the inline chip (ui/chip `inline`) with a decision
   * page's glyph as its mark and the card's question, as written, as its
   * label. Its tip says whether the person has picked on it, when the
   * dashboard holds the page's picks. Pressed, the page comes to the front
   * of the panel scrolled to the card, outlined for a moment
   * (reference-open.svelte.ts). On a task's sheet it is a link to the card
   * in the project's Decisions, its tip the hub's word on the task's wait
   * (tasks/sheet-cards.ts).
   */
  import { decisionReference } from "@cawco/core/references";
  import { IconDecisions } from "#lib/icons.js";
  import { artifactMarks } from "./artifact-names.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";
  import { sheetCardsHere } from "./tasks/sheet-cards";

  let { id, label = "" }: { id: string; label?: string } = $props();
  /** This chip's own: two chips of one card (a sheet's line and its words) each say only their own press's refusal. */
  const uid = $props.id();

  const named = $derived(decisionReference(id));
  /** On a task's sheet: where the card is picked, and the hub's word on whether it is. */
  const sheet = sheetCardsHere();
  const onSheet = $derived(named ? sheet(named.artifact, named.card) : null);
  const picked = $derived.by(() => {
    if (onSheet && onSheet.picked !== null) {
      return onSheet.picked;
    }
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
  href={onSheet?.href}
  refKey="ref:{id}:card:{uid}"
  {title}
  {words}
/>
