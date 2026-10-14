import type { Snippet } from "svelte";

/**
 * The strip a page hands the shell's bar (Shell, "The bar's slot"): a
 * project's views stand where the crumb would, as a conversation's tabs do,
 * so the bar does not repeat the name the page's head already says.
 *
 * The page says it hands one in its data (`barStrip`), so the server draws
 * the bar without the crumb; the page puts its snippet here once mounted,
 * on a wide screen only (a phone keeps the strip as the page's own row),
 * and takes it back as it goes. The snippet keeps the page's own state and
 * scoped styles wherever it is drawn.
 */
export const barStrip = $state<{ strip: Snippet | null }>({ strip: null });
