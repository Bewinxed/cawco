/*
 * Every Iconify icon (Solar's, and the brand marks), from its own package:
 * the dev server serves them as one pre-bundled module (vite.config.ts
 * `optimizeDeps.include`), where each was a module of its own.
 */
// biome-ignore lint/performance/noBarrelFile: central icon barrel — every consumer imports icons from this index
// biome-ignore lint/performance/noReExportAll: the barrel's Iconify half, named one by one in @cawco/icons
export * from "@cawco/icons";
// Not solar: the set has no bare plus or close (only circled/squared ones),
// and an enclosed glyph double-encloses inside pill buttons. Local, set-matched.
export { default as IconClose } from "#lib/components/icons/Close.svelte";
export { default as IconMinus } from "#lib/components/icons/Minus.svelte";
export { default as IconPlus } from "#lib/components/icons/Plus.svelte";
export { default as IconTick } from "#lib/components/icons/Tick.svelte";
