/**
 * The libraries whose own sheets reach the page with what draws them, not
 * through a house sheet: vite.config.ts wraps each in the `vendor` layer as
 * it enters the build, and scripts/preflight.ts reads their pseudo-elements.
 */

/** The libraries whose Svelte components carry a `<style>` of their own. */
export const VENDOR_COMPONENT_SHEETS = [
  "svelte-sonner",
  "vaul-svelte",
  "bits-ui",
  "@xyflow/svelte",
];

/** The folders of the sheets a library's components import themselves. */
export const VENDOR_IMPORTED_SHEETS = [
  "@event-calendar/core/src/styles",
  "photoswipe/dist",
];
