<script lang="ts">
  /**
   * NeedsCard as Caw's panel holds it, for its sheet (NeedsCard.stories.ts):
   * inside the shell's tooltip provider (Overlays.svelte), which its Peek
   * reads.
   */
  import type { ComponentProps } from "svelte";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import NeedsCard from "./NeedsCard.svelte";

  const props: ComponentProps<typeof NeedsCard> = $props();
</script>

<TooltipProvider>
  <NeedsCard {...props} />
</TooltipProvider>
