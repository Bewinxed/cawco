/*
 * Every Iconify icon (Solar's, and the brand marks), from its own package:
 * the dev server serves them as one pre-bundled module (vite.config.ts
 * `optimizeDeps.include`), where each was a module of its own.
 */
// biome-ignore lint/performance/noBarrelFile: central icon barrel — every consumer imports icons from this index
export * from "@cawco/icons";
// Local, to Solar's grid and stroke: each a step inside Solar's own bare linear
// close, add and minus, which reach the grid's edge; the tick one stroke, so it
// can draw itself along its path.
export { default as IconClose } from "#lib/components/icons/Close.svelte";
export { default as IconMinus } from "#lib/components/icons/Minus.svelte";
export { default as IconPlus } from "#lib/components/icons/Plus.svelte";
export { default as IconTick } from "#lib/components/icons/Tick.svelte";
