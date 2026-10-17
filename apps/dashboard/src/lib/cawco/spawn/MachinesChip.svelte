<script lang="ts">
  import { MachineRow } from "#lib/components/ui/machine-row/index.js";
  /**
   * Machines chip + popover (§1.4, §2.5): multi-select rows, then "Connect a
   * machine…", which swaps the list in place for the pairing panel — the
   * install command and a live wait for the machine to check in. The command
   * box and the watcher are the Connect a machine dialog's own (join/), so the
   * two surfaces cannot drift. Closing the popover, or opening another,
   * cancels pairing (design L237); a machine checking in ends it, and its row
   * is then in the list.
   */
  import Add from "~icons/solar/add-circle-linear";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Check from "~icons/solar/check-circle-bold-duotone";
  import Server from "~icons/solar/server-square-bold-duotone";
  import CheckInStatus from "../join/CheckInStatus.svelte";
  import CopyBox from "../join/CopyBox.svelte";
  import { CheckIn, installCommand, joinInfo } from "../join/join.svelte";
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
      return "Select machine";
    }
    return picked.length === 1 ? picked[0].name : `${picked.length} machines`;
  });
  /** The watcher while pairing, null while the list shows. */
  let pairing = $state<CheckIn | null>(null);
  $effect(() => {
    if (!open || pairing?.joined) {
      pairing = null;
    }
  });
  function startPairing() {
    pairing = new CheckIn();
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the command renders from joinInfo when it lands
    void joinInfo.refresh();
  }
  /** Tailscale first: the address that works from wherever the machine is. */
  const pairUrl = $derived(joinInfo.value?.addresses[0]?.url);
  const presenceOf = (row: MachineItem) => {
    if (!row.online) {
      return "off";
    }
    return row.load === "Idle" ? "online" : "away";
  };
  const radius = (index: number, on: boolean) => {
    const prev = index > 0 && selected.includes(machines[index - 1].id);
    const next =
      index < machines.length - 1 && selected.includes(machines[index + 1].id);
    return `${on && prev ? "0 0" : "8px 8px"} ${on && next ? "0 0" : "8px 8px"}`;
  };
</script>

<NsPopover
  id="session-machines"
  label={`Machines: ${label}`}
  {onchange}
  {open}
  rows="[data-fh]"
  triggerClass="ns-chip-btn"
  triggerTone={picked.length ? undefined : "fail"}
>
  {#snippet trigger()}
    <Server class="text-hue-cyan-500" />
    <span data-slot="chip-label">{label}</span>
    <Down data-slot="chevron" />
  {/snippet}
  {#if pairing}
    <!-- literal: 10px gap -->
    <div class="ns-panel grid gap-(--gap) p-space-1" style:--gap="10px">
      <p class="type-meta text-ink-muted">
        Run this on the machine. It appears here as soon as the agent checks in.
      </p>
      {#if pairUrl}
        <CopyBox label="Install command" text={installCommand(pairUrl)} />
      {:else if joinInfo.error}
        <p class="type-meta text-status-fail-ink" role="alert">
          {joinInfo.error}
        </p>
      {:else}
        <p class="type-meta text-ink-muted">Reading this hub's addresses…</p>
      {/if}
      <CheckInStatus>
        {#snippet trail()}
          <button
            class="ns-btn touch-hit"
            data-size="sm"
            onclick={() => {
              pairing = null;
            }}
            type="button"
          >
            Back
          </button>
        {/snippet}
      </CheckInStatus>
    </div>
  {:else}
    {#each machines as row, index (row.id)}
      {@const on = selected.includes(row.id)}
      <!-- literal: 10px gap, 44px height, 6px 8px padding -->
      <button
        data-slot="row"
        aria-pressed={on}
        class="ns-in press-tint relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-(--r) border-none border-current bg-transparent px-(--pad-x) py-(--pad-y) text-left text-ink-strong transition-[background-color,border-radius] dur-toggle ease-out aria-pressed:bg-surface-fill disabled:cursor-not-allowed disabled:opacity-55 motion-safe:transition-[background-color,border-radius,transform]"
        data-fh="1"
        disabled={!row.online}
        onclick={() => ontoggle(row.id)}
        style={`--delay:${80 + index * 45}ms`}
        style:--gap="10px"
        style:--h="44px"
        style:--pad-x="8px"
        style:--pad-y="6px"
        style:--r={radius(index, on)}
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
          class="size-icon-md flex-none transform-(--t) text-ink-strong opacity-(--o) transition-[opacity] dur-toggle ease-out motion-safe:transition-[opacity,transform]"
          style={`--o:${on ? 1 : 0};--t:scale(${on ? 1 : 0.94})`}
        />
      </button>
    {/each}
    {#if machines.length === 0}
      <!-- literal: 8px inline padding -->
      <div
        class="ns-in px-(--pad-x) py-space-4 text-center type-meta text-ink-subtle"
        style:--pad-x="8px"
      >
        No machines have checked in.
      </div>
    {/if}
    <!-- literal: 1px rule -->
    <div
      data-slot="divider"
      class="mx-space-row my-space-1 h-(--h) bg-border-hairline"
      style:--h="1px"
    ></div>
    <!-- literal: 10px gap, 40px height, 6px 8px padding, 26px tile, 14px icon -->
    <button
      data-slot="row"
      data-add
      class="ns-in press-tint relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-sm border-none border-current bg-transparent px-(--pad-x) py-(--pad-y) text-left text-ink-muted transition-[background-color,border-radius] dur-toggle ease-out hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-55 motion-safe:transition-[background-color,border-radius,transform]"
      data-fh="1"
      onclick={startPairing}
      style="--delay:140ms"
      style:--gap="10px"
      style:--h="40px"
      style:--pad-x="8px"
      style:--pad-y="6px"
      type="button"
    >
      <span
        data-slot="tile"
        class="ns-tile size-(--tile)"
        data-variant="dashed"
        style:--icon="14px"
        style:--tile="26px"><Add class="size-(--icon)" /></span
      >
      <span class="type-label">Connect a machine…</span>
    </button>
  {/if}
</NsPopover>
