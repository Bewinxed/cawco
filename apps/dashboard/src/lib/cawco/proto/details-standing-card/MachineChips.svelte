<script lang="ts">
  /**
   * Every machine of the fleet as a chip, its OS mark beside its name: the
   * one pick of where a place goes (Add place, Move to).
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";

  let {
    label,
    machines,
    value,
    onpick,
  }: {
    label: string;
    machines: Machine[];
    value: string | null;
    onpick: (machineId: string) => void;
  } = $props();
</script>

<OptionGroup
  aria-label={label}
  bind:value={
    () => (value ? [value] : []),
    (next) => {
      const [machineId] = next;
      if (machineId && machineId !== value) {
        onpick(machineId);
      }
    }
  }
>
  {#each machines as machine (machine.machineId)}
    <OptionGroupItem value={machine.machineId}>
      <span class="mark-line flex min-w-0 items-center gap-space-2">
        <OsMark
          aria-hidden="true"
          class="size-icon-sm"
          data-box
          face="linear"
          os={machine.os}
        />
        <span>{machineLabel(machine.hostname)}</span>
      </span>
    </OptionGroupItem>
  {/each}
</OptionGroup>
