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
  label="Machines"
  {onchange}
  {open}
  rows="[data-fh]"
  triggerClass="ns-chip-btn"
  triggerStyle={picked.length
    ? ""
    : "color:var(--status-fail-ink);border-color:var(--status-fail-ink)"}
>
  {#snippet trigger()}
    <Server style="color:var(--hue-cyan-500)" />
    <span class="chip-label">{label}</span>
    <Down class="chevron" />
  {/snippet}
  {#if pairing}
    <div class="ns-panel pair">
      <p class="pair-line">
        Run this on the machine. It appears here as soon as the agent checks in.
      </p>
      {#if pairUrl}
        <CopyBox label="Install command" text={installCommand(pairUrl)} />
      {:else if joinInfo.error}
        <p class="pair-error" role="alert">{joinInfo.error}</p>
      {:else}
        <p class="pair-line">Reading this hub's addresses…</p>
      {/if}
      <CheckInStatus checkIn={pairing}>
        {#snippet trail()}
          <button
            class="ns-btn sm touch-hit"
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
      <button
        aria-pressed={on}
        class="row ns-in press-tint"
        data-fh="1"
        disabled={!row.online}
        onclick={() => ontoggle(row.id)}
        style={`--delay:${80 + index * 45}ms;border-radius:${radius(index, on)}`}
        type="button"
        class:on={on}
      >
        <MachineRow
          hue={row.hue}
          icon={row.icon}
          ink={on}
          meta={`${row.os ? `${row.os} · ` : ""}${row.load}`}
          name={row.name}
          presence={presenceOf(row)}
        />
        <Check
          class="check"
          style={`opacity:${on ? 1 : 0};transform:scale(${on ? 1 : 0.94})`}
        />
      </button>
    {/each}
    {#if machines.length === 0}
      <div class="none ns-in">No machines have checked in.</div>
    {/if}
    <div class="divider"></div>
    <button
      class="row add ns-in press-tint"
      data-fh="1"
      onclick={startPairing}
      style="--delay:140ms"
      type="button"
    >
      <span class="ns-tile tile dashed"><Add /></span>
      <span class="add-label">Connect a machine…</span>
    </button>
  {/if}
</NsPopover>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 44px;
    padding: 6px 8px;
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: left;
    color: var(--ink-strong);
    transition:
      background-color var(--dur-toggle) var(--ease-out),
      border-radius var(--dur-toggle) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-toggle) var(--ease-out),
        border-radius var(--dur-toggle) var(--ease-out),
        transform var(--dur-toggle) var(--ease-out);
    }
  }
  .row.on {
    background: var(--surface-fill);
  }
  .row:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .row :global(svg.check) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-strong);
    transition: opacity var(--dur-toggle) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        opacity var(--dur-toggle) var(--ease-out),
        transform var(--dur-toggle) var(--ease-out);
    }
  }
  .divider {
    height: 1px;
    margin: 4px 2px;
    background: var(--border-hairline);
  }
  .add {
    height: 40px;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .add:hover {
      color: var(--ink-strong);
    }
  }
  .tile {
    width: 26px;
    height: 26px;
  }
  .tile :global(svg) {
    width: 14px;
    height: 14px;
  }
  .add-label {
    font: var(--type-label);
  }
  .pair {
    display: grid;
    gap: 10px;
    padding: 4px;
  }
  .pair-line {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .pair-error {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
  .none {
    padding: 14px 8px;
    font: var(--type-meta);
    color: var(--ink-subtle);
    text-align: center;
  }
</style>
