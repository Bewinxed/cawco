<script lang="ts">
  /**
   * Sound on or off, beside the theme: the composer's cues (the recall
   * wheel's detents, a queued message lifted and given back) are quiet until
   * the reader turns them on here (feel.svelte.ts).
   */
  import { setSound, sound } from "#lib/cawco/feel.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconSound, IconSoundOff } from "#lib/icons.js";

  const label = $derived(sound.on ? "Turn sound off" : "Turn sound on");
</script>

<Tip {label}>
  {#snippet children(
    tip
  )}
    <Button
      {...tip}
      aria-label="Sound"
      aria-pressed={sound.on}
      onclick={() => setSound(!sound.on)}
      size="icon-sm"
      variant="ghost"
    >
      <span class="icon-swap size-4">
        <span data-active={sound.on}><IconSound class="size-4" /></span>
        <span data-active={!sound.on}><IconSoundOff class="size-4" /></span>
      </span>
    </Button>
  {/snippet}
</Tip>
