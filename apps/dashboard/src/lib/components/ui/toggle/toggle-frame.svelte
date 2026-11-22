<script lang="ts">
  /**
   * The kit's Toggle in a frame of its own (its states file's): its glyph
   * and words, pressed or not.
   */
  import type { Component } from "svelte";
  import Toggle from "./toggle.svelte";

  let {
    icon: Icon,
    words,
    pressed = false,
    variant,
    size,
    disabled = false,
  }: {
    /** Its glyph. */
    icon?: Component;
    /** Its words; none draws the glyph alone, named by them for the screen reader. */
    words: string;
    /** It is on. */
    pressed?: boolean;
    /** Edged. */
    variant?: "default" | "outline";
    /** Its size. */
    size?: "default" | "xs" | "sm" | "lg";
    /** Can't be pressed. */
    disabled?: boolean;
  } = $props();
</script>

<Toggle aria-label={words} {disabled} {pressed} {size} {variant}>
  {#if Icon}
    <Icon data-box data-icon="inline-start" />
  {/if}
  {words}
</Toggle>
