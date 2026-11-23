<script lang="ts">
  /**
   * Where a folder goes: the fleet's machines as one pick, each by its OS
   * mark and its name, one that is offline saying so (Add folder, and a
   * place's Move and Copy elsewhere).
   */
  import { settingsViewWords as words } from "@cawco/core/words/settings-view";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { machineIcon } from "#lib/components/ui/machine-row/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import type { FleetMachine } from "./records";

  let {
    machines,
    value,
    labelledby,
    disabled,
    onpick,
  }: {
    machines: FleetMachine[];
    /** The machine picked, by id; null while none is. */
    value: string | null;
    /** The id of the field's label. */
    labelledby: string;
    disabled: boolean;
    onpick: (machineId: string | null) => void;
  } = $props();
</script>

<OptionGroup
  aria-labelledby={labelledby}
  bind:value={() => (value ? [value] : []), (next) => onpick(next[0] ?? null)}
  {disabled}
  glide
>
  {#each machines as machine (machine.id)}
    {@const Glyph = machineIcon(machine.os)}
    <OptionGroupItem value={machine.id}>
      <span class="mark-line flex min-w-0 items-center gap-x-space-2">
        <Glyph aria-hidden="true" class="size-icon-md flex-none" />
        <span>{machine.name}</span>
        {#if !machine.online}
          <Badge data-box variant="attn"><span>{words.places.away}</span></Badge
          >
        {/if}
      </span>
    </OptionGroupItem>
  {/each}
</OptionGroup>
