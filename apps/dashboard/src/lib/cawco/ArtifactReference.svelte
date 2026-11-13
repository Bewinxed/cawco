<script lang="ts">
  /**
   * An artifact named in written words (`[title](cawco:artifact/<id>)`, core
   * references.ts), drawn as its chip: the inline chip (ui/chip `inline`)
   * with its kind's glyph as its mark and its title as the dashboard holds it
   * now. Pressed, it comes to the front of the panel of the session whose
   * conversation it stands in, else of its own session's
   * (reference-open.svelte.ts).
   */
  import { artifactNamed } from "./artifact-names.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";
  import { markLook } from "./reference-looks";

  let { id, label = "" }: { id: string; label?: string } = $props();

  const named = $derived(artifactNamed(id));
  const words = $derived(named?.title ?? label);
</script>

<ReferenceChip
  artifact={id}
  at={{ top: true }}
  data-artifact-chip={id}
  glyph={markLook({ of: "artifact", kind: named?.kind ?? "page" }).glyph}
  refKey="ref:{id}:top"
  title={words}
  {words}
/>
