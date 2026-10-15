import { sceneOne } from './scene';

/**
 * The stage as a HyperFrames composition (scripts/hero-composition.ts) builds scene 1 with this:
 * the same timeline the site plays. The composition's own inline script registers it under the
 * root's `data-composition-id` once the fonts are in. The site never loads this file.
 */
(window as unknown as { cawcoHeroScene: typeof sceneOne }).cawcoHeroScene = sceneOne;
