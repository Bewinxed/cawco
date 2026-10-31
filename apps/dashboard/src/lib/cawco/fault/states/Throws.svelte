<script lang="ts">
  /**
   * A part that throws as it is built, for the failure states' frames
   * (FailedParts): the first build throws, as a part reading a record it
   * can't draw does; with `stuck` every rebuild throws the same way, so Try
   * again turns the face to Reload page. Rebuilt, it stands as `children`.
   */
  import type { Snippet } from "svelte";

  let {
    builds,
    stuck = false,
    children,
  }: {
    /** How many times it has been built, kept by the frame across rebuilds. */
    builds: { n: number };
    stuck?: boolean;
    children?: Snippet;
  } = $props();

  builds.n += 1;
  if (stuck || builds.n === 1) {
    throw new TypeError("Cannot read properties of undefined (reading 'name')");
  }
</script>

{@render children?.()}
