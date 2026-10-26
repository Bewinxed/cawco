<script lang="ts">
  /**
   * An artifact named in written words (`[name](cawco:artifact/<id>)`, core
   * references.ts), drawn as its chip: the inline chip (ui/chip `inline`)
   * with its kind's glyph as its mark and its name as the dashboard holds it
   * now. Pressed, it comes to the front of the panel of the session whose
   * conversation it stands in, else of its own session's
   * (reference-open.svelte.ts).
   */
  import { ARTIFACT_GLYPH } from "./artifact-glyph";
  import { artifactNamed } from "./artifact-names.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";

  let { id, label = "" }: { id: string; label?: string } = $props();

  const named = $derived(artifactNamed(id));
  const words = $derived(named?.name ?? label);
</script>

<ReferenceChip
  artifact={id}
  at={{ top: true }}
  data-artifact-chip={id}
  glyph={ARTIFACT_GLYPH[named?.kind ?? "page"]}
  refKey="ref:{id}:top"
  title={words}
  {words}
/>
