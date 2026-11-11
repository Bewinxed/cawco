<!--
  A Diagram in an agent's block (the block library's, in a reply and in the
  panel once kept): one its program gives no size fits the reply's words,
  `medium` (Diagram.svelte), where a decision page's stands at its natural
  size.
-->
<script lang="ts">
  import Diagram from "../../decisions/host/Diagram.svelte";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
    statementId,
  }: OpenUIRenderProps<{ mermaid: unknown }> = $props();
</script>

<Diagram fit="medium" {props} {renderNode} {statementId} />
