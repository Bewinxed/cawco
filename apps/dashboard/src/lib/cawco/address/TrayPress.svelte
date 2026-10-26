<script lang="ts">
  /**
   * One of a tray's presses as its button: the words morph in their held
   * box, and a press that opens another page carries ↗ at its end.
   * `primary` marks the tray's one primary (data-tray-primary).
   */
  import {
    Button,
    type ButtonSize,
    type ButtonVariant,
  } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconExternal } from "#lib/icons.js";
  import type { Press } from "./words";

  let {
    press,
    primary = false,
    size,
    variant,
    iconClass,
  }: {
    press: Press;
    primary?: boolean;
    size: ButtonSize;
    variant?: ButtonVariant;
    /** The ↗'s class, for a button whose size leaves its icon unsized. */
    iconClass?: string;
  } = $props();
</script>

<Button
  data-icon={press.away ? "inline-end" : undefined}
  data-tray-primary={primary ? "" : undefined}
  disabled={press.disabled}
  onclick={press.act}
  {size}
  {variant}
>
  <MorphText text={press.label} />
  {#if press.away}
    <IconExternal aria-hidden="true" class={iconClass} />
  {/if}
</Button>
