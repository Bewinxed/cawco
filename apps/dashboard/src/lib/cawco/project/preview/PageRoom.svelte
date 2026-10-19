<script lang="ts">
  /**
   * The project page's pane on a sheet: the recessed field with the page's
   * own padding (DESIGN.md Layout: 25px on the inline start, 21px on the
   * end; 18px a side on a phone), so a view stands where the page puts it.
   */
  import type { Snippet } from "svelte";

  let {
    phone = false,
    bare = false,
    children,
  }: {
    /** A phone's pane: 18px a side. */
    phone?: boolean;
    /** What it holds pads itself (the project's head). */
    bare?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class={["room", { bare, phone }]}>{@render children()}</div>

<style>
  .room {
    display: flex;
    flex-direction: column;
    inline-size: 100%;
    min-block-size: 480px;
    padding: var(--space-5) var(--space-6) var(--space-6) var(--space-7);
    background: var(--surface-recess);
  }
  .room.phone {
    padding-inline: var(--space-5);
  }
  .room.bare {
    min-block-size: 0;
    padding: 0;
  }
</style>
