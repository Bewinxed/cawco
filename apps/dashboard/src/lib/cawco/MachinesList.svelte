<script lang="ts">
  import { machineLabel } from "@cawco/core";
  /**
   * The machines as a list: each machine (its menu on right-click or
   * long-press: update, reload, log in, unlock, forget), then Add machine.
   * With no machine yet it is the empty fleet's compact form: one line and
   * the two ways in, each opening Connect a machine on its tab. Shown in the
   * wide bar's Machines popover and in the phone's sidebar; `onleave` is
   * called before a row opens a dialog, so the place it stands in can close.
   */
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { cawco } from "./client.svelte";
  import { home } from "./home/home-state.svelte";
  import { addMachine, JOIN_WAYS } from "./join/join.svelte";
  import MachineMenu from "./MachineMenu.svelte";

  let { onleave }: { onleave?: () => void } = $props();

  const liveOn = (machineId: string): number =>
    cawco.runningRows.filter((row) => row.machineId === machineId).length;
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

{#if cawco.machines.length === 0}
  <!-- No machine yet: the empty fleet's two ways in, as rows. -->
  <p class="none">Connect a machine to run sessions</p>
  <ul class="list">
    {#each JOIN_WAYS as way (way.way)}
      {@const Icon = way.icon}
      <li>
        <button
          aria-haspopup="dialog"
          class="row way press-tint focus-inset"
          onclick={() => {
            onleave?.();
            addMachine.show(way.way);
          }}
          type="button"
        >
          <span class="glyph" style:color={way.hue}><Icon /></span>
          <span class="words">
            <span class="name">{way.name}</span>
            <span class="meta">{way.meta}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <ul class="list">
    {#each cawco.machines as machine, index (machine.machineId)}
      {@const up = machine.status === "online"}
      {@const live = liveOn(machine.machineId)}
      {@const fault = faultOf(machine.machineId)}
      <li>
        <MachineMenu {machine}>
          <div class="row press-tint focus-inset" tabindex="-1">
            <MachineRow
              hue={machineHue(index, up)}
              icon={machineIcon(machine.os ?? "")}
              meta={[`${live} live`, fault].filter(Boolean).join(" · ")}
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
      onleave?.();
      addMachine.show();
    }}
    type="button"
  >
    <IconPlus aria-hidden="true" />
    Add machine
  </button>
{/if}

<style>
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
  .none {
    margin: 0;
    padding: var(--space-1) var(--space-2) var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .way {
    cursor: pointer;
  }
  /* The row's glyph in its way's hue, at the machine rows' 16px. */
  .glyph {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 16px;
  }
  .glyph :global(svg) {
    width: 16px;
    height: 16px;
  }
  .words {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .meta {
    font: var(--type-meta);
    color: var(--ink-muted);
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
