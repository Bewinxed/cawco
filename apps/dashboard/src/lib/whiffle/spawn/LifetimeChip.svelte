<script lang="ts">
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  /**
   * Session lifetime as a composer chip. Choosing between keeping a session
   * and letting it end with its task is a decision worth a look at both
   * options, so the chip opens them rather than flipping on a click.
   */
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Check from "~icons/solar/check-circle-bold";
  import Database from "~icons/solar/database-bold-duotone";
  import Fire from "~icons/solar/fire-bold-duotone";
  import NsPopover from "./NsPopover.svelte";

  let {
    ephemeral,
    onlifetime,
    open,
    onchange,
  }: {
    ephemeral: boolean;
    onlifetime: (ephemeral: boolean) => void;
    open: boolean;
    onchange: (open: boolean) => void;
  } = $props();
  const OPTIONS = [
    {
      ephemeral: false,
      name: "Persistent",
      desc: "Stays on the board after its task, to pick up again.",
      icon: Database,
      hue: "var(--hue-blue-500)",
    },
    {
      ephemeral: true,
      name: "Ephemeral",
      desc: "A side quest: ends and clears itself when the task is done.",
      icon: Fire,
      hue: "var(--hue-orange-500)",
    },
  ];
  const current = $derived(
    OPTIONS.find((option) => option.ephemeral === ephemeral) ?? OPTIONS[0]
  );
</script>

<NsPopover
  gap={2}
  id="session-lifetime"
  label="Session lifetime"
  {onchange}
  {open}
  triggerClass="ns-chip-btn"
  width={300}
  {@attach highlight({ rows: "[data-fh]" })}
>
  {#snippet trigger()}
    {@const Icon = current.icon}
    {#key current.name}
      <span class="swap">
        <Icon style={`color:${current.hue}`} />
        <span class="chip-label">{current.name}</span>
      </span>
    {/key}
    <Down class="chevron" />
  {/snippet}
  {#each OPTIONS as option, index (option.name)}
    {@const Icon = option.icon}
    {@const on = option.ephemeral === ephemeral}
    <button
      aria-pressed={on}
      class="row ns-in"
      data-fh="1"
      onclick={() => { onlifetime(option.ephemeral); onchange(false); }}
      style={`--delay:${index * 35}ms`}
      type="button"
      class:on={on}
    >
      <span class="ns-tile tile" style={`color:${option.hue}`}><Icon /></span>
      <span class="text">
        <span class="name">{option.name}</span>
        <span class="meta">{option.desc}</span>
      </span>
      {#if on}
        <Check class="check ns-check" />
      {/if}
    </button>
  {/each}
</NsPopover>

<style>
  .swap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    animation: ns-in 200ms var(--ease-out) both;
  }
  .swap :global(svg) {
    width: 15px;
    height: 15px;
    flex: none;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 6px 8px;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: var(--ink-strong);
  }
  .row.on {
    background: var(--surface-fill);
  }
  .tile {
    width: 26px;
    height: 26px;
  }
  .tile :global(svg) {
    width: 15px;
    height: 15px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: block;
    font: var(--type-label);
  }
  .meta {
    display: block;
    font: var(--type-meta);
    color: var(--ink-subtle);
    text-wrap: pretty;
  }
  .row :global(svg.check) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-strong);
  }
</style>
