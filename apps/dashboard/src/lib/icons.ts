/*
 * Every Iconify icon (Solar's, and the brand marks), from its own package:
 * the dev server serves them as one pre-bundled module (vite.config.ts
 * `optimizeDeps.include`), where each was a module of its own.
 */
export * from "@cawco/icons";
// Not Solar's: glyphs drawn to its grid where the set ships the glyph only in
// a container (Info, Plug, Not yet's dotted ring, the double tick, the fork
// turned down for Subagent), and the linear Close, Plus and Tick that sit in
// pill buttons and checkboxes beside linear chevrons (DESIGN.md, The Solar
// Duotone Rule).
export { default as IconCheck } from "#lib/components/icons/CheckRead.svelte";
export { default as IconClose } from "#lib/components/icons/Close.svelte";
export { default as IconInfo } from "#lib/components/icons/Info.svelte";
export { default as IconNotYet } from "#lib/components/icons/NotYet.svelte";
export { default as IconToolMcp } from "#lib/components/icons/Plug.svelte";
export { default as IconPlus } from "#lib/components/icons/Plus.svelte";
export { default as IconSubagent } from "#lib/components/icons/Subagent.svelte";
export { default as IconTick } from "#lib/components/icons/Tick.svelte";
