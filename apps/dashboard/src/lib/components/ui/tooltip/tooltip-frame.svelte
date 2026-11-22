<script lang="ts">
  /**
   * The kit's Tooltip in a frame of its own (its states file's): open over
   * the kit Button it names, drawn in place (the portal off) in a box that
   * holds it (`contain: layout`), its words and the keys that do the same.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconSessionAdd } from "#lib/icons.js";
  import * as Tooltip from "./index.js";

  let {
    label,
    keys,
    room,
  }: {
    /** What it says. */
    label: string;
    /** The keys that do the same, as they are drawn. */
    keys?: string;
    /** The room over the trigger, px, that the tooltip stands in. */
    room: number;
  } = $props();

  /**
   * Opened once its trigger stands, as a resting pointer opens it: open
   * from the first frame, it was placed before its trigger was there to
   * place it against, and stood at the frame's corner. The frame holds a
   * provider of its own, so its tooltip stands open beside another frame's
   * (the app's one provider keeps one open at a time).
   */
  let open = $state(false);
  let rested = $state(false);
  $effect(() => {
    const frame = requestAnimationFrame(() => {
      rested = true;
    });
    return () => cancelAnimationFrame(frame);
  });
  /** The pointer stays on it: what would close it (the page scrolling under it) opens it again. */
  $effect(() => {
    if (rested && !open) {
      open = true;
    }
  });
</script>

<div
  class="relative flex w-sm max-w-full justify-center pt-(--frame-room)"
  style:--frame-room={`${room}px`}
>
  <Tooltip.TooltipProvider>
    <Tooltip.Root bind:open>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label={label}
            icon={IconSessionAdd}
            size="icon-sm"
            variant="ghost"
          />
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content forceMount portalProps={{ disabled: true }} side="top">
        <span>{label}</span>
        {#if keys}
          <kbd class="font-sans opacity-70">{keys}</kbd>
        {/if}
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.TooltipProvider>
</div>
