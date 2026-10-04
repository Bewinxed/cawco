<script lang="ts">
  /**
   * Drawn as the kit trigger's child by `context-menu-lazy`: it draws
   * nothing, and hands the trigger's props to the element that already
   * stands. `to` is given a reader, so whoever spreads the props follows
   * them as the menu opens and shuts.
   */
  import { untrack } from "svelte";

  let {
    props,
    to,
  }: {
    props: Record<string, unknown>;
    to: (read: () => Record<string, unknown>) => void;
  } = $props();

  // Once, as it is built: the reader follows `props` from then on.
  untrack(() => to(() => props));
</script>
