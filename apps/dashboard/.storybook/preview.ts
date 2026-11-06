/**
 * What every states file's story stands in, as every surface of the app
 * stands in Overlays (src/lib/cawco/Overlays.svelte): the one tooltip
 * provider, which each kit tooltip reads (`Tooltip.Provider`; without it a
 * story threw as it mounted, ImageDefault's Saved: "Context
 * \"Tooltip.Provider\" not found"). The component canvas's stage reads this
 * file as Storybook reads its preview file (stage-host host.ts
 * `previewFile`): its decorators wrap every story, outside its own and its
 * meta's.
 *
 * Overlays' other part, the lightbox, stays out: it is the page's one
 * (lightbox-state.svelte.ts), and a copy round each story would open one
 * lightbox per drawing.
 */
import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";

export default {
  decorators: [() => ({ Component: TooltipProvider, props: {} })],
};
