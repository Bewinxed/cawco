<script lang="ts">
  /**
   * One part of an editor: a divider, a header with its hued icon and an
   * optional control on the right, then the fields 8px apart.
   */
  import type { Component, Snippet } from "svelte";
  import { SectionHeader } from "$lib/components/ui/section-header";

  let {
    icon,
    hue,
    label,
    right,
    children,
  }: {
    icon: Component;
    hue: string;
    label: string;
    right?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="section">
  <SectionHeader {hue} {icon} {label} {right} wrap />
  {@render children()}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding-top: 18px;
    border-top: 1px solid var(--border-hairline);
  }
</style>
