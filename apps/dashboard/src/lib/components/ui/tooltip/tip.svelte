<script lang="ts">
  /**
   * The kit tooltip (Root, Trigger, Content) put on one control: a plain
   * label and, where there is one, the keys that do the same thing. The
   * control is passed as a snippet and spreads the trigger's props, so it
   * stays the element it was (button or link) and keeps its own aria-label,
   * which says the same as the label here.
   */
  import type { Snippet } from "svelte";
  import Root from "./tooltip.svelte";
  import Content from "./tooltip-content.svelte";
  import Trigger from "./tooltip-trigger.svelte";

  let {
    label,
    keys,
    side = "bottom",
    children,
  }: {
    label: string;
    /** The shortcut, as it is drawn: "⇧⌘N". */
    keys?: string;
    side?: "top" | "right" | "bottom" | "left";
    children: Snippet<[Record<string, unknown>]>;
  } = $props();
</script>

<Root>
  <Trigger>
    {#snippet child({ props })}
      {@render children(props)}
    {/snippet}
  </Trigger>
  <Content {side}>
    <span>{label}</span>
    {#if keys}
      <kbd class="font-sans opacity-70">{keys}</kbd>
    {/if}
  </Content>
</Root>
