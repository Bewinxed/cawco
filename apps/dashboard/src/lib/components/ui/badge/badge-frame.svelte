<script lang="ts">
  /**
   * The kit's Badge in a frame of its own (its states file's): its words in
   * the variant asked, with the Status dot or glyph its callers put before
   * them where they do.
   */
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import Badge, { type BadgeVariant } from "./badge.svelte";

  let {
    variant,
    words,
    icon,
  }: {
    /** A glyph before its words. */
    icon?: Component<SVGAttributes<SVGSVGElement>>;
    /** Its look: what the badge says about its row. */
    variant?: BadgeVariant;
    /** Its words. */
    words: string;
  } = $props();
</script>

<Badge {icon} {variant}><span>{words}</span></Badge>
