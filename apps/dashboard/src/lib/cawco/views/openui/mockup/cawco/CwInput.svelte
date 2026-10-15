<script lang="ts">
  /** Input, drawn as CawCo's: the kit's Label over its Input or Textarea, read-only; inert. */
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let {
    props,
  }: OpenUIRenderProps<{
    label?: unknown;
    value?: unknown;
    placeholder?: unknown;
    multiline?: boolean;
  }> = $props();
</script>

<div class="input" data-mk="Input" inert>
  {#if textOf(props.label)}
    <Label>{textOf(props.label)}</Label>
  {/if}
  {#if props.multiline}
    <Textarea
      placeholder={textOf(props.placeholder)}
      readonly
      value={textOf(props.value)}
    />
  {:else}
    <Input
      placeholder={textOf(props.placeholder)}
      readonly
      value={textOf(props.value)}
    />
  {/if}
</div>

<style>
  .input {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
</style>
