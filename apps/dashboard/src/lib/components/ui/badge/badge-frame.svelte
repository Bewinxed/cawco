<script lang="ts">
  /**
   * The kit's Badge in a frame of its own (its states file's): its words in
   * the variant asked, with the Status dot or glyph its callers put before
   * them where they do.
   */
  import Badge, { type BadgeVariant } from "./badge.svelte";

  let {
    variant,
    words,
  }: {
    /** Its look: what the badge says about its row. */
    variant?: BadgeVariant;
    /** Its words. */
    words: string;
  } = $props();
</script>

<Badge {variant}><span>{words}</span></Badge>
