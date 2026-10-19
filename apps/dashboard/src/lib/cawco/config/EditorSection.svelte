<script lang="ts">
  /**
   * One part of an editor: a divider, a header with its hued icon and an
   * optional control on the right, then the fields a step apart.
   */
  import type { Component, Snippet } from "svelte";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";

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

<section
  data-slot="section"
  class="flex flex-col gap-space-2 min-w-0 pt-space-5 border-t border-t-border-hairline"
>
  <SectionHeader {hue} {icon} {label} {right} wrap />
  {@render children()}
</section>
