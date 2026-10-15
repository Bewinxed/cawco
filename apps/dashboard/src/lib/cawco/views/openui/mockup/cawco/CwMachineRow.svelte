<script lang="ts">
  /** MachineRow for a mockup: the kit's MachineRow over a made-up machine; inert. */
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let {
    props,
  }: OpenUIRenderProps<{ name: unknown; meta: unknown; presence: string }> =
    $props();
  const presence = $derived(
    props.presence === "online" || props.presence === "away"
      ? props.presence
      : "off"
  );
</script>

<div class="machine" data-mk="MachineRow" inert>
  <MachineRow
    hue={machineHue(textOf(props.name).length, presence !== "off")}
    icon={machineIcon(textOf(props.meta))}
    meta={textOf(props.meta)}
    name={textOf(props.name)}
    {presence}
  />
</div>

<style>
  .machine {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-inline-size: 0;
    padding: var(--space-2) var(--space-3);
  }
</style>
