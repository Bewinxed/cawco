<svelte:options css="injected" />

<script lang="ts">
  /**
   * Stack: its children one under another, or side by side (`across`); a
   * mockup's root. Its styles ride with it (`css="injected"`), into the
   * shadow root a project's mockup is drawn in, and read the mockup's roles
   * (`--mk-*`) alone.
   */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    children: unknown[];
    across?: boolean;
    gap?: string;
    align?: string;
    justify?: string;
    pad?: string;
  }> = $props();
</script>

<div
  class="stack"
  data-across={props.across ? "" : undefined}
  data-align={props.align ?? "stretch"}
  data-gap={props.gap ?? "medium"}
  data-justify={props.justify ?? "start"}
  data-mk="Stack"
  data-pad={props.pad ?? "none"}
>
  {@render renderNode(props.children)}
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    gap: calc(var(--mk-space) * 4);
  }
  .stack[data-across] {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .stack[data-gap="none"] {
    gap: 0;
  }
  .stack[data-gap="small"] {
    gap: calc(var(--mk-space) * 2);
  }
  .stack[data-gap="large"] {
    gap: calc(var(--mk-space) * 8);
  }
  .stack[data-pad="small"] {
    padding: calc(var(--mk-space) * 2);
  }
  .stack[data-pad="medium"] {
    padding: calc(var(--mk-space) * 4);
  }
  .stack[data-pad="large"] {
    padding: calc(var(--mk-space) * 8);
  }
  .stack[data-align="start"] {
    align-items: flex-start;
  }
  .stack[data-align="center"] {
    align-items: center;
  }
  .stack[data-align="end"] {
    align-items: flex-end;
  }
  .stack[data-justify="center"] {
    justify-content: center;
  }
  .stack[data-justify="end"] {
    justify-content: flex-end;
  }
  .stack[data-justify="between"] {
    justify-content: space-between;
  }
</style>
