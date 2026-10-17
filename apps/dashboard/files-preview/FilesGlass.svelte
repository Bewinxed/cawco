<script lang="ts">
  /**
   * Files as a face of the glass's one card (GlassCard): the HangCard on
   * the top bar's glass, right-aligned under it, flush with its trailing
   * flank, one silhouette with the glass. Its top is cut across the glass's
   * span with the flared neck, the glass draws its join while it stands
   * drawn out of it (`joined`), it wears the hung shadow (motion/hung-shadow,
   * drawn here as the Shell draws it) and it comes down out of the glass's
   * foot and goes back up into it on `hang`, a fade under Reduce Motion.
   * Every prop is GlassCard's own for its faces; what it holds is Files.
   * Non-modal: no scrim, no trap.
   */
  import type { Snippet } from "svelte";
  import { hangShadow } from "#lib/cawco/motion/hung-shadow";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";

  let {
    glass,
    open,
    joined = $bindable(false),
    children,
  }: {
    /** The bar's glass group it hangs from. */
    glass: HTMLElement | null;
    open: boolean;
    joined?: boolean;
    children: Snippet;
  } = $props();

  // The hung shadow, as the Shell draws it for every card on the glass.
  $effect(() => {
    const corner = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--radius-lg")
    );
    hangShadow(".kit-pop.glass-card", "--shadow-overlay-hung", [
      corner,
      0,
      corner,
      corner,
    ]).catch((error: unknown) => {
      console.error("The glass's card shadow did not draw", error);
    });
  });
</script>

<Popover.Root {open}>
  <HangCard
    align="end"
    anchor={glass}
    aria-label="Files"
    class="files-pop"
    collisionPadding={8}
    customAnchor={glass}
    data-float="files"
    forceMount
    glass
    inert={!open}
    onOpenAutoFocus={(event) => event.preventDefault()}
    side="bottom"
    sideOffset={0}
    strategy="fixed"
    trapFocus={false}
    bind:joined
  >
    <div class="files-face">{@render children()}</div>
  </HangCard>
</Popover.Root>

<style>
  /* css-scope .files-pop: the frame of Files' face, as CawPanel draws
     Caw's (`.caw-pop`): the panel's width, 7px in from the drawn edge, as
     tall as what it holds up to the room under the glass. */
  :global(.kit-pop.files-pop) {
    display: flex;
    flex-direction: column;
    inline-size: min(var(--c-panel-w), calc(100vw - 24px));
    max-block-size: min(
      var(--c-caw-panel-h),
      calc(var(--bits-popover-content-available-height, 85dvh) - 2px)
    );
    padding: 7px;
  }
  .files-face {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
</style>
