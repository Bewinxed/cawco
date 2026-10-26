<script lang="ts">
  /**
   * A config section's button that opens its write popover (Fetch skill,
   * Link marketplace, New document): disabled, saying why as its title,
   * while the hub cannot take a write (`down`).
   */
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import {
    Button,
    type ButtonSize,
    type ButtonVariant,
  } from "#lib/components/ui/button/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";

  let {
    down,
    label,
    icon: Glyph,
    size,
    variant,
  }: {
    down: string | null;
    label: string;
    icon: Component<SVGAttributes<SVGSVGElement>>;
    size?: ButtonSize;
    variant?: ButtonVariant;
  } = $props();
</script>

<Popover.Trigger disabled={down !== null}>
  {#snippet child({ props })}
    <Button
      {...props}
      disabled={down !== null}
      {size}
      title={down ?? undefined}
      {variant}
    >
      <Glyph />
      <span>{label}</span>
    </Button>
  {/snippet}
</Popover.Trigger>
