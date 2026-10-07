<script lang="ts">
  /**
   * Caw's motion while a project's lead works, beside the theme and sound:
   * his `working` loop plays (the default), or he holds its still
   * (feel.svelte.ts `cawLoop`).
   */
  import { cawLoop, setCawLoop } from "#lib/cawco/feel.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconPause, IconPlay } from "#lib/icons.js";

  const label = $derived(
    cawLoop.on
      ? "Caw moves while the lead works"
      : "Caw holds still while the lead works"
  );
</script>

<Tip {label}>
  {#snippet children(
    tip
  )}
    <Button
      {...tip}
      aria-label="Caw moves while the lead works"
      aria-pressed={cawLoop.on}
      onclick={() => setCawLoop(!cawLoop.on)}
      size="icon-sm"
      variant="ghost"
    >
      <span class="icon-swap size-4">
        <span data-active={cawLoop.on}><IconPlay class="size-4" /></span>
        <span data-active={!cawLoop.on}><IconPause class="size-4" /></span>
      </span>
    </Button>
  {/snippet}
</Tip>
