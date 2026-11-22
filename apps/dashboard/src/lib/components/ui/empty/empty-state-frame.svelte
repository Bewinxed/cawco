<script lang="ts">
  /**
   * The kit's EmptyState in a frame of its own (its states file's): its
   * mark, its title, its why and the kit Button as the one way on, as the
   * fleet's empty lists compose it.
   */
  import type { Component } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import EmptyState from "./empty-state.svelte";

  let {
    icon,
    title,
    line,
    act,
    inline = false,
  }: {
    /** Its mark. */
    icon: Component;
    /** What is missing. */
    title: string;
    /** Why, and what to do. */
    line?: string;
    /** Its one action's words; none draws no action. */
    act?: string;
    /** One line in a strip's room. */
    inline?: boolean;
  } = $props();
</script>

<div class="w-sm max-w-full">
  <EmptyState {icon} {inline} {line} {title}>
    {#snippet action()}
      {#if act}
        <Button label={act} variant="outline" />
      {/if}
    {/snippet}
  </EmptyState>
</div>
