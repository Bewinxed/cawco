<script lang="ts">
  /**
   * A decision page's column for the failure states' frames (FailedParts):
   * its cards on the page's recessed ground at the page's inset, without the
   * page's own head, foot and bridge (decisions/host/Decisions).
   */
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props, renderNode }: OpenUIRenderProps = $props();
</script>

<div
  class="mx-auto flex w-full max-w-c-page-column-w min-w-0 flex-col gap-space-5 p-space-4"
  style:--card-in="var(--space-5)"
>
  {@render renderNode(props.children)}
</div>
