<script lang="ts">
  import { spawnWords } from "@cawco/core/words/spawn";
  import { staggered } from "#lib/cawco/motion/curves.svelte.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import { MachineRow } from "#lib/components/ui/machine-row/index.js";
  /**
   * Machines chip + popover (§1.4, §2.5): multi-select rows, then "Connect a
   * machine…", which closes the popover and opens Add machine (connect/),
   * the one way a machine is added; focus comes back to the chip as it
   * closes. A machine it adds has its row in this list once it checks in.
   */
  import {
    IconAddLinear as Add,
    IconSuccess as Check,
    IconChevronDown as Down,
    IconServerSquare as Server,
  } from "#lib/icons.js";
  import { connect } from "../connect/installs.svelte";
  import { machineRowRadius } from "./machine-rows";
  import NsPopover from "./NsPopover.svelte";
  import type { MachineItem } from "./ns-types";

  let {
    machines,
    selected,
    open,
    onchange,
    ontoggle,
  }: {
    machines: MachineItem[];
    selected: string[];
    open: boolean;
    onchange: (open: boolean) => void;
    ontoggle: (id: string) => void;
  } = $props();
  const picked = $derived(machines.filter((row) => selected.includes(row.id)));
  const label = $derived.by(() => {
    if (picked.length === 0) {
      return spawnWords.machines.select;
    }
    return picked.length === 1
      ? picked[0].name
      : spawnWords.machines.count(picked.length);
  });
  /** Add machine, its focus coming back to this chip as it closes. */
  function addMachine() {
    onchange(false);
    connect.openNew(
      document.querySelector<HTMLElement>(
        '[aria-controls="session-machines-popover"]'
      )
    );
  }
  const presenceOf = (row: MachineItem) => {
    if (!row.online) {
      return "off";
    }
    return row.load === spawnWords.machines.idle ? "online" : "away";
  };
  const radius = (index: number, on: boolean) =>
    machineRowRadius(
      on,
      index > 0 && selected.includes(machines[index - 1].id),
      index < machines.length - 1 && selected.includes(machines[index + 1].id)
    );
</script>

<NsPopover
  id="session-machines"
  label={spawnWords.machines.chip(label)}
  {onchange}
  {open}
  rows="[data-fh]"
  triggerClass={chipVariants({
    variant: "setting",
    tone: picked.length ? undefined : "fail",
    // Never wider than its row: a long name ends in its ellipsis.
    class: "min-w-0",
  })}
>
  {#snippet trigger()}
    <Server class="text-hue-cyan-500" />
    <span data-slot="chip-label">{label}</span>
    <Down data-slot="chevron" />
  {/snippet}
  {#each machines as row, index (row.id)}
    {@const on = selected.includes(row.id)}
    <button
      data-slot="row"
      aria-pressed={on}
      class="select-none ns-in press-tint relative flex h-c-row-h w-full items-center gap-space-3 border-none border-current bg-transparent px-space-2 py-space-2 text-start text-ink-strong transition-[background-color,border-radius] duration-(--dur-toggle) ease-out aria-pressed:bg-selected-bg aria-pressed:[&_:is([data-slot=name],[data-slot=meta])]:text-selected-ink disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-[background-color,border-radius,transform]"
      data-fh="1"
      data-machine-id={row.id}
      disabled={!row.online}
      onclick={() => ontoggle(row.id)}
      style:--delay={staggered(index + 1)}
      style:border-radius={radius(index, on)}
      type="button"
    >
      <MachineRow
        hue={row.hue}
        icon={row.icon}
        ink={on}
        meta={`${row.os ? `${row.os} · ` : ""}${row.load}${row.place ? ` · ${row.place}` : ""}`}
        name={row.name}
        presence={presenceOf(row)}
      />
      <Check
        class="size-icon-md flex-none text-ink-strong in-aria-pressed:text-selected-icon transition-[opacity] duration-(--dur-toggle) ease-out motion-safe:transition-[opacity,transform]"
        style={`opacity:${on ? 1 : 0};transform:scale(${on ? 1 : 0.94})`}
      />
    </button>
  {/each}
  {#if machines.length === 0}
    <div
      class="ns-in px-space-2 py-space-4 text-center type-meta text-ink-subtle"
    >
      {spawnWords.machines.noneCheckedIn}
    </div>
  {/if}
  <div
    data-slot="divider"
    class="mx-space-row my-space-1 border-t border-border-hairline"
  ></div>
  <button
    data-slot="row"
    data-add
    class="select-none ns-in press-tint relative flex h-c-row-h w-full items-center gap-space-3 rounded-glide-row border-none border-current bg-transparent px-space-2 py-space-2 text-start text-ink-muted transition-[background-color,border-radius] duration-(--dur-toggle) ease-out hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-[background-color,border-radius,transform]"
    data-fh="1"
    onclick={addMachine}
    style:--delay={staggered(machines.length + 1)}
    type="button"
  >
    <span data-slot="tile" class={iconTileVariants({ empty: true })}
      ><Add class="size-icon-md" /></span
    >
    <span class="type-label">{spawnWords.machines.connect}</span>
  </button>
</NsPopover>
