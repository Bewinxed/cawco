<svelte:options css="injected" />

<script lang="ts">
  /** Image: one of the project's own images, by its asset name, from the design's files. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { mockupContext, textOf } from "./context";

  let {
    props,
  }: OpenUIRenderProps<{ asset: unknown; height?: number; fit?: string }> =
    $props();
  const mockup = mockupContext();
  const asset = $derived(mockup.asset(textOf(props.asset)));
</script>

{#if asset}
  <img
    alt={asset.alt}
    class="image"
    data-asset={textOf(props.asset)}
    data-mk="Image"
    src={asset.url}
    style:block-size={props.height ? `${props.height}px` : undefined}
    style:object-fit={props.fit ?? "cover"}
  />
{/if}

<style>
  .image {
    display: block;
    max-inline-size: 100%;
    border-radius: var(--mk-radius-small);
  }
</style>
