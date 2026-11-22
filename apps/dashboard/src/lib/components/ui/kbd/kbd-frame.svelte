<script lang="ts">
  /**
   * The kit's Kbd in a frame of its own (its states file's): the keys a
   * hint names, one cap each.
   */
  import Kbd from "./kbd.svelte";

  let {
    keys,
  }: {
    /** Each key, as it is drawn. */
    keys: string[];
  } = $props();
</script>

<span class="inline-flex items-center gap-space-1">
  {#each keys as key (key)}
    <Kbd>{key}</Kbd>
  {/each}
</span>
