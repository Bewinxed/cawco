<script lang="ts">
  import { machineLabel } from "@cawco/core";
  /**
   * The machines, one click away beside Jump rather than always on screen.
   * The button says how many are online; its glyph takes the fail ink when
   * one has dropped and the attention ink when one needs a hand (behind the
   * hub, a stuck sync), so a dropped machine is still seen without the list.
   * The popover lists each machine (its menu on right-click or long-press:
   * update, reload, log in, unlock, forget) and ends with Add machine.
   */
  import { mergeProps } from "bits-ui";
  import { Button } from "$lib/components/ui/button";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "$lib/components/ui/machine-row";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import Tip from "$lib/components/ui/tooltip/tip.svelte";
  import { IconPlus, IconServer } from "$lib/icons";
  import { cawco } from "./client.svelte";
  import { home } from "./home/home.svelte";
  import { addMachine } from "./join/join.svelte";
  import MachineMenu from "./MachineMenu.svelte";

  let shown = $state(false);

  const online = $derived(
    cawco.machines.filter((machine) => machine.status === "online").length
  );
  /** What the glyph says at a glance: a machine down, one in trouble, or nothing. */
  const tone = $derived.by(() => {
    if (cawco.machines.some((machine) => machine.status !== "online")) {
      return "fail";
    }
    return home.exceptions.length > 0 ? "attn" : null;
  });

  const liveOn = (machineId: string): number =>
    cawco.runningInstances.filter((row) => row.machineId === machineId).length;
  /** The row's dot: down, up but in trouble, or fine. */
  function presenceOf(
    up: boolean,
    fault: string | undefined
  ): "online" | "away" | "off" {
    if (!up) {
      return "off";
    }
    return fault ? "away" : "online";
  }
  const faultOf = (machineId: string): string | undefined =>
    home.exceptions.find((entry) => entry.machineId === machineId)?.text;
</script>

<Popover.Root bind:open={shown}>
  <Tip label="Machines">
    {#snippet children(tip)}
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            {...mergeProps(props, tip)}
            aria-label="Machines"
            class="jump machines"
            data-tone={tone ?? undefined}
            size="sm"
            variant="outline"
          >
            <IconServer />
            <span class="num">{online}</span>
          </Button>
        {/snippet}
      </Popover.Trigger>
    {/snippet}
  </Tip>
  <Popover.Content
    align="end"
    aria-label="Machines"
    class="machines-pop w-[min(20rem,calc(100vw-16px))] gap-0"
    collisionPadding={8}
    side="bottom"
    sideOffset={6}
  >
    <ul class="list">
      {#each cawco.machines as machine, index (machine.machineId)}
        {@const up = machine.status === 'online'}
        {@const live = liveOn(machine.machineId)}
        {@const fault = faultOf(machine.machineId)}
        <li>
          <MachineMenu {machine}>
            <div class="row press-tint focus-inset" tabindex="-1">
              <MachineRow
                hue={machineHue(index, up)}
                icon={machineIcon(machine.os ?? '')}
                meta={[`${live} live`, fault].filter(Boolean).join(' · ')}
                name={machineLabel(machine.hostname)}
                presence={presenceOf(up, fault)}
              />
            </div>
          </MachineMenu>
        </li>
      {/each}
    </ul>
    <button
      class="row add press-tint focus-inset"
      onclick={() => {
        shown = false;
        addMachine.show();
      }}
      type="button"
    >
      <IconPlus aria-hidden="true" />
      Add machine
    </button>
  </Popover.Content>
</Popover.Root>

<style>
  /* The glyph alone carries a machine in trouble; it crosses over
     --dur-fade, never pulses. */
  :global(.machines svg) {
    transition: color var(--dur-fade) var(--ease-out);
  }
  :global(.machines[data-tone="fail"] svg) {
    color: var(--status-fail-glyph);
  }
  :global(.machines[data-tone="attn"] svg) {
    color: var(--status-attn-glyph);
  }
  /* Opens with a short scale from its corner, closes faster. */
  :global(.kit-pop.machines-pop) {
    --pop-scale: 0.97;
    --pop-rise: 0px;
    transition-timing-function: var(--ease-out);
  }
  :global(.kit-pop.machines-pop:not([data-state="closed"])) {
    transition-duration: var(--dur-menu);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The session rows' row: compact at a desk, 44px under a finger. */
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--space-8);
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-strong);
    text-align: start;
    transition: var(--transition-control);

    @media (pointer: coarse) {
      min-height: 44px;
    }
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
      }
    }
  }
  .add {
    margin-top: var(--space-1);
    border-top: 1px solid var(--seam);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .add :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
