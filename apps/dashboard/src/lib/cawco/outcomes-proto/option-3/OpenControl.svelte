<script lang="ts">
  /**
   * The one control a thing opens from, never its title or its row (the
   * owner's rule): the house's open arrow on an edged button, so it reads as
   * a button at rest and not only under a pointer a phone does not have.
   * Its name says what it opens, in its tooltip and to a screen reader; on
   * a finger it keeps the kit's 44px area.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize } from "#lib/icons.js";

  let {
    label,
    onopen,
  }: {
    /** What a press opens, as a verb and its object. */
    label: string;
    onopen: () => void;
  } = $props();
</script>

<Tip {label}>
  {#snippet children(tip)}
    <Button
      {...tip}
      aria-label={label}
      icon={IconMaximize}
      onclick={onopen}
      press="pressable"
      size="icon-xs"
      variant="outline"
    />
  {/snippet}
</Tip>
