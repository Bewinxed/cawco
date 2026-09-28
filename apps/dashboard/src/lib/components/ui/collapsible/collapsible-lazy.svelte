<script lang="ts">
  import { type Snippet, untrack } from "svelte";

  /** Children exist in the DOM only while the panel is open (or closing):
   *  a transcript can hold hundreds of collapsed panels, and mounting their
   *  pre blocks and diffs eagerly is what made route renders take seconds.
   *
   *  What opens draws its head first. The snippet is handed how many of its
   *  `count` rows to draw: enough to fill the fold, then — once the fold has
   *  settled — the rest, a batch a frame, below the view. A delegate's
   *  transcript drawn whole held the click for 100–120ms before the fold's
   *  first frame. A panel that mounts open is drawn whole. */
  let {
    open,
    count,
    children,
  }: { open: boolean; count: number; children?: Snippet<[number]> } = $props();

  /**
   * Rows drawn before the fold, and per frame after it. A transcript row can
   * be a tool body or a page of markdown: in WebKit twenty at once was a
   * 53-63ms frame and twelve a frame up to 65ms, where four rows (already
   * taller than the view) and one a frame keep every frame under 50ms.
   */
  const HEAD = 4;
  const BATCH = 1;
  /** The fold opening (`collapsible-content`, 240ms from the frame after
   *  the click), after which the rest is drawn. */
  const FOLDED_MS = 280;

  // Seeded from the initial `open` so a panel that starts open is server-rendered:
  // effects do not run during SSR, so waiting for one would ship it empty.
  // svelte-ignore state_referenced_locally
  let rendered = $state(open);
  // A panel that mounts open — the virtualiser building its row again, a
  // pane coming back — is drawn whole, at the height it was left at.
  // svelte-ignore state_referenced_locally
  let limit = $state(open ? Number.POSITIVE_INFINITY : HEAD);

  $effect.pre(() => {
    if (open) {
      rendered = true;
    }
  });

  // Keep content through the 160ms fold shut (`collapsible-content`) plus slack, then drop it.
  $effect(() => {
    if (!open && rendered) {
      const timer = setTimeout(() => {
        rendered = false;
        limit = HEAD;
      }, 200);
      return () => clearTimeout(timer);
    }
  });

  // The head holds until the fold has settled, however many rows arrive
  // meanwhile; then the rest is drawn a batch a frame, and so is whatever
  // arrives after.
  $effect(() => {
    if (!(open && rendered && limit === HEAD)) {
      return;
    }
    const timer = setTimeout(() => {
      limit = HEAD + BATCH;
    }, FOLDED_MS);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (!open || limit === HEAD || limit >= count) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      limit = untrack(() => limit) + BATCH;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#if rendered}
  {@render children?.(limit)}
{/if}
