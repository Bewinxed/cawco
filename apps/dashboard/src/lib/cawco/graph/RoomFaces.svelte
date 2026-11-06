<script lang="ts" generics="F extends string">
  /**
   * The design graph's room faces on one switch (fluid-tabs, compact), each
   * its Solar duotone glyph before its name at the tabs' own icon size and
   * ink; the switch is named as the room is, by its faces (DesignGraph's
   * room head and its drawer's). It follows `value` while mounted; a press
   * asks for another face through `onchoose`.
   */
  import type { Component } from "svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";

  let {
    faces,
    value,
    label,
    onchoose,
  }: {
    /** The faces, in the switch's order. */
    faces: readonly {
      value: F;
      label: string;
      icon: Component<{ class?: string }>;
    }[];
    /** The face shown. */
    value: F;
    /** The room's name, the switch's. */
    label: string;
    /** A press chose another face. */
    onchoose: (face: F) => void;
  } = $props();
</script>

<Tabs
  class="min-w-0 flex-1"
  onValueChange={(next: string) => {
    const face = faces.find((one) => one.value === next);
    if (face) {
      onchoose(face.value);
    }
  }}
  size="compact"
  {value}
>
  <TabsList aria-label={label}>
    {#each faces as one (one.value)}
      <TabItem icon={one.icon} label={one.label} value={one.value} />
    {/each}
  </TabsList>
</Tabs>
