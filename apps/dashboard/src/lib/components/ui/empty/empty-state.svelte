<script lang="ts">
  /**
   * The one empty state: a Solar duotone mark, a title in the title role,
   * one plain line saying why, and at most one next action. It is a claim
   * that there is nothing to show, so it renders only once the data is known
   * to be empty — never while it is still being read.
   */
  import type { Component, Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils.js";

  let {
    icon: Mark,
    title,
    line,
    action,
    class: className,
    ...restProps
  }: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
    icon: Component;
    title: string;
    line: string | Snippet;
    action?: Snippet;
  } = $props();
</script>

<div class={cn("kit-empty", className)} data-slot="empty" {...restProps}>
  <Mark aria-hidden="true" data-slot="empty-mark" />
  <p class="kit-empty-title">{title}</p>
  <p class="kit-empty-line">
    {#if typeof line === "string"}
      {line}
    {:else}
      {@render line()}
    {/if}
  </p>
  {#if action}
    <div class="kit-empty-action">{@render action()}</div>
  {/if}
</div>
