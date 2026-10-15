<script lang="ts">
  /** Alert for a mockup: the kit's Alert, a notice or a warning. */
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let {
    props,
  }: OpenUIRenderProps<{ text: unknown; title?: unknown; warning?: boolean }> =
    $props();
</script>

<div data-mk="Alert" inert>
  <Alert variant={props.warning ? "warning" : "default"}>
    {#if textOf(props.title)}
      <AlertTitle>{textOf(props.title)}</AlertTitle>
    {/if}
    <AlertDescription>{textOf(props.text)}</AlertDescription>
  </Alert>
</div>
