<script lang="ts">
  /**
   * One of a player's controls (MediaPlayer): a Video.js button element
   * (`media-play-button`, `media-mute-button`, `media-fullscreen-button`),
   * which is itself the button (its role, keys and action are the
   * library's), dressed as a bar item (BarItem's recipe, `barItemVariants`):
   * a bare symbol until hovered, its states on its own box in the contour
   * of the row it stands in (DESIGN.md, The Glass Contour Rule). Named by
   * `label`, read out and in its tooltip, which joins its glass's one
   * tooltip where it stands in a BarGlass.
   */
  import type { Component } from "svelte";
  import { barItemVariants } from "#lib/components/ui/bar-glass/index.js";
  import { glideHere } from "#lib/components/ui/tooltip/glide.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let {
    element,
    label,
    icon: Icon,
  }: {
    element:
      "media-play-button" | "media-mute-button" | "media-fullscreen-button";
    /** Its name now (Play or Pause, Mute or Unmute): its aria-label and its tooltip. */
    label: string;
    /** Its symbol now. */
    icon: Component<Record<string, unknown>>;
  } = $props();

  const glide = glideHere();
  const look = barItemVariants();
</script>

<Tip {glide} {label} side="top">
  {#snippet children(tipProps)}
    <svelte:element this={element} {...tipProps} class={look} data-box {label}>
      <Icon data-slot="bar-symbol" aria-hidden="true" />
    </svelte:element>
  {/snippet}
</Tip>
