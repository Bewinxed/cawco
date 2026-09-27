<script lang="ts">
  import type { Collapsible } from "bits-ui";
  import CollapsibleContent from "../collapsible/collapsible-content.svelte";

  let { class: className = "", ...rest }: Collapsible.ContentProps = $props();
</script>

<!-- Grows open and folds shut on the kit's reveal, fading as it goes. The
     transcript keeps its bottom pinned while it runs (Transcript.svelte,
     `revealstart` / `revealend`). -->
<CollapsibleContent
  {...rest}
  class="thinking-content {className}"
  data-slot="thinking-steps-content"
  fade
  reveal
/>
