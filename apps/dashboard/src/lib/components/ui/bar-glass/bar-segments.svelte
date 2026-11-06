<script lang="ts" generics="T extends string">
  /**
   * A segmented control standing in a bar's glass (a mode switch:
   * Interact, Comment, Draw), and the only one: bits-ui Tabs whose list is
   * the glass itself (BarGlass `form="group"`) and whose segments are bar
   * items (BarItem), so each segment is its neighbours' size and glyph,
   * takes its corners from where it stands in the glass (The Glass Contour
   * Rule) and draws hover, pressed and focus on its own box, its ring
   * inside it; the chosen one is in the selected wash from the first paint,
   * drawn from `value` in its own markup, never by a thumb placed after
   * a measure. Under a finger each segment's area is 44px wide (the glass's
   * coarse gap, The 44 Touch Rule). The glass is the switch's one container
   * (HIG, Toolbars: "the section provides a visible container, and the
   * system defines hover and selection state appearances"), so no groove
   * stands inside it: the kit's groove (tabs/thumb.ts) is the segmented
   * control on a page's ground. Tab reaches the chosen segment; the arrow
   * keys move the choice.
   *
   * It follows `value` while mounted; a press asks for another through
   * `onValueChange` (or `bind:value`).
   */
  import { Tabs } from "bits-ui";
  import type { Component } from "svelte";
  import BarGlass from "./bar-glass.svelte";
  import BarItem from "./bar-item.svelte";

  interface Segment {
    icon: Component<Record<string, unknown>>;
    /** Its shortcut, as the tooltip draws it (and `aria-keyshortcuts`). */
    keys?: string;
    /** Its name, for the screen reader and in its tooltip. */
    label: string;
    /** Its tooltip's words, where they say more than its name. */
    tip?: string;
    value: T;
  }

  let {
    segments,
    value = $bindable(),
    onValueChange,
    label,
  }: {
    /** The segments, in the order they stand. */
    segments: readonly Segment[];
    /** The chosen segment's value. */
    value: T;
    /** A press chose another segment. */
    onValueChange?: (value: T) => void;
    /** The switch's name, for the screen reader. */
    label: string;
  } = $props();

  const choose = (next: string) => {
    const chosen = segments.find((one) => one.value === next)?.value;
    if (chosen !== undefined && chosen !== value) {
      value = chosen;
      onValueChange?.(chosen);
    }
  };
</script>

<Tabs.Root class="contents" onValueChange={choose} {value}>
  <Tabs.List aria-label={label}>
    {#snippet child({ props })}
      <BarGlass {...props} form="group">
        {#each segments as segment (segment.value)}
          <Tabs.Trigger value={segment.value}>
            {#snippet child({ props: trigger })}
              <BarItem
                aria-keyshortcuts={segment.keys}
                icon={segment.icon}
                keys={segment.keys}
                label={segment.label}
                marked={segment.value === value}
                props={trigger}
                tip={segment.tip}
              />
            {/snippet}
          </Tabs.Trigger>
        {/each}
      </BarGlass>
    {/snippet}
  </Tabs.List>
</Tabs.Root>
