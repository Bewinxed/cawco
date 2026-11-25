<script lang="ts">
  /**
   * A status's glyph in its one cell (SessionStatus, the stop trays): its
   * icon, or the spinner while it is on its way (`icon` null), the glyphs
   * of a change giving way to one another on the house's glyph swap. It
   * wears its status's hue (`tone`), or each icon's own (`ink`); a working
   * session's glyph breathes (`breathes`).
   */
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import { GlyphSwap } from "#lib/components/ui/glyph-swap/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { loopInStep } from "#lib/platform/motion/in-step.svelte.js";
  import { cn } from "#lib/utils.js";

  let {
    icon,
    tone,
    ink,
    breathes = false,
  }: {
    /** The status's icon; null while it is on its way. */
    icon: Component<SVGAttributes<SVGSVGElement>> | Component | null;
    /** The status's tone, whose hue the glyph wears; unset, its holder's ink. */
    tone?: string;
    /** An icon's own ink, where it is not the tone's. */
    ink?: (icon: unknown) => string;
    /** It breathes, as a working session's glyph does. */
    breathes?: boolean;
  } = $props();
</script>

<span
  data-slot="glyph"
  class="inline-grid flex-none data-breathes:breathe data-breathes:loops data-[tone=attention]:text-orange data-[tone=failed]:text-red data-[tone=quiet]:text-tx-2 data-[tone=working]:text-cyan"
  data-box
  data-breathes={breathes || undefined}
  data-tone={tone}
  {@attach loopInStep}
>
  <GlyphSwap shows={icon ?? Spinner}>
    {#snippet glyph(Mark)}
      {#if Mark === Spinner}
        <Spinner aria-hidden="true" class="flex-none" role="presentation" />
      {:else}
        <Mark
          aria-hidden="true"
          class={cn("size-icon-md flex-none", ink?.(Mark))}
        />
      {/if}
    {/snippet}
  </GlyphSwap>
</span>
