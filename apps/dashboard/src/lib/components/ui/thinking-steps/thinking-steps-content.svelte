<script lang="ts">
  import type { Collapsible } from "bits-ui";
  import type { Snippet } from "svelte";
  import Unfold from "$lib/whiffle/transcript/Unfold.svelte";

  let {
    class: className = "",
    children,
    ...rest
  }: { children: Snippet } & Omit<
    Collapsible.ContentProps,
    "children"
  > = $props();
</script>

<!-- Grows open and folds shut on its own height, fading as it goes (`Unfold`).
     The transcript keeps its bottom pinned while it runs (Transcript.svelte,
     `revealstart` / `revealend`). -->
<Unfold
  {...rest}
  class="thinking-content {className}"
  data-slot="thinking-steps-content"
>
  {@render children()}
</Unfold>
