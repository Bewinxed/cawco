<script lang="ts">
  /**
   * The decision library's Diagram for the failure states' frames
   * (FailedParts): it throws as it is built, every time, as a diagram whose
   * Mermaid text can't be read does, so a part that is not a card fails as
   * one line in its place.
   */
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ mermaid: unknown }> = $props();

  throw new Error(
    `Parse error on line 2: ${String(props.mermaid).split("\n").at(-1)} ... Expecting 'SEMI', got 'EOF'`
  );
</script>
