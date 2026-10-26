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
  import { IconRefresh } from "#lib/icons.js";
  import ReferenceChip from "./ReferenceChip.svelte";

  let { id, label = "" }: { id: string; label?: string } = $props();

  const named = $derived(changeReference(id));
  const words = $derived(label || commentWords.changed);
</script>

<ReferenceChip
  aria-label={commentWords.changeChip(words)}
  artifact={named?.artifact}
  at={{ change: named?.anchor ?? "" }}
  data-change-chip={id}
  glyph={IconRefresh}
  refKey="ref:{id}:change"
  tone="text-c-change-ring"
  {words}
/>
