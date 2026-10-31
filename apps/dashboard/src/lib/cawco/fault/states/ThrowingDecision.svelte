<script lang="ts">
  /**
   * The decision library's Decision for the failure states' frames
   * (FailedParts): the real card, but the one whose id is `throws` throws as
   * it is built, every time, as a card reading a record it can't draw does.
   */
  import type { ComponentProps } from "svelte";
  import Decision from "../../decisions/host/Decision.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props, renderNode, statementId }: OpenUIRenderProps = $props();

  if (props.id === "throws") {
    throw new TypeError(
      "Cannot read properties of undefined (reading 'label')"
    );
  }
</script>

<Decision
  props={props as ComponentProps<typeof Decision>["props"]}
  {renderNode}
  {statementId}
/>
