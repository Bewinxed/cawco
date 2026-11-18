<script lang="ts">
  /**
   * What an option tile says (ui/option-group `tiles`): its mark and name
   * on one line, then a few words on what picking it does.
   */
  import type { Snippet } from "svelte";

  let {
    name,
    note,
    mark,
  }: {
    name: string;
    note: string;
    /** Its glyph or logo, at the control's 16px. */
    mark: Snippet;
  } = $props();
</script>

<span class="mark-line flex items-center gap-space-2">
  {@render mark()}
  <span class="type-label font-medium">{name}</span>
</span>
<span class="type-meta text-pretty text-ink-muted">{note}</span>
