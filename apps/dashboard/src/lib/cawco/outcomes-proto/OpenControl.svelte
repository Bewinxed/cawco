<script lang="ts">
  /**
   * The open control both Outcomes prototypes share: a thing opens from this button at its row's end,
   * never from its title or the whole row (the owner's rule). Its glyph is
   * the house's open arrow, the Peek glyph the Needs you rows carry; its
   * name says what it opens, in its tooltip and to a screen reader. On a
   * finger it keeps the house's 44px area (`touch-hit`, in the kit's
   * button).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize } from "#lib/icons.js";

  let {
    label,
    onopen,
    disabled = false,
  }: {
    /** What a press opens, as a verb and its object: "Open Main stays green". */
    label: string;
    onopen: () => void;
    disabled?: boolean;
  } = $props();
</script>

<Tip {label}>
  {#snippet children(tip)}
    <Button
      {...tip}
      aria-label={label}
      {disabled}
      icon={IconMaximize}
      onclick={onopen}
      press="pressable"
      size="icon-xs"
      tone="quiet"
      variant="ghost"
    />
  {/snippet}
</Tip>
