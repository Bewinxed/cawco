<script lang="ts">
  /**
   * Session lifetime as a composer chip. Choosing between keeping a session
   * and letting it end with its task is a decision worth a look at both
   * options, so the chip opens them rather than flipping on a click.
   */
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Check from "~icons/solar/check-circle-bold-duotone";
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
      desc: "A spin-off: ends and clears itself when the task is done.",
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
  label={`Session lifetime: ${current.name}`}
  {onchange}
  {open}
  rows="[data-fh]"
  triggerClass="ns-chip-btn"
  width={300}
>
  {#snippet trigger()}
    {@const Icon = current.icon}
    {#key current.name}
      <!-- literal: 6px -->
      <span
        data-slot="swap"
        class="swap inline-flex items-center gap-(--gap)"
        style:--gap="6px"
      >
        <Icon
          class="size-icon-md flex-none text-(--hue)"
          style={`--hue:${current.hue}`}
        />
        <span data-slot="chip-label">{current.name}</span>
      </span>
    {/key}
    <Down data-slot="chevron" />
  {/snippet}
  {#each OPTIONS as option, index (option.name)}
    {@const Icon = option.icon}
    {@const on = option.ephemeral === ephemeral}
    <!-- literal: 10px gap, 48px height, 6px 8px padding, 26px tile -->
    <button
      data-slot="row"
      aria-pressed={on}
      class="ns-in press-tint relative flex min-h-(--min-h) w-full cursor-pointer items-center gap-(--gap) rounded-sm border-0 bg-transparent px-(--pad-x) py-(--pad-y) text-left text-ink-strong aria-pressed:bg-surface-fill"
      data-fh="1"
      onclick={() => {
        onlifetime(option.ephemeral);
        onchange(false);
      }}
      style={`--delay:${index * 35}ms`}
      style:--gap="10px"
      style:--min-h="48px"
      style:--pad-x="8px"
      style:--pad-y="6px"
      type="button"
    >
      <span
        data-slot="tile"
        class="ns-tile size-(--tile) text-(--hue)"
        style:--hue={option.hue}
        style:--tile="26px"><Icon class="size-icon-md" /></span
      >
      <span data-slot="text" class="min-w-0 flex-1">
        <span data-slot="name" class="type-label block">{option.name}</span>
        <span
          data-slot="meta"
          class="type-meta block text-pretty text-ink-subtle"
          >{option.desc}</span
        >
      </span>
      {#if on}
        <Check class="ns-check size-icon-md flex-none text-ink-strong" />
      {/if}
    </button>
  {/each}
</NsPopover>

<style>
  /* residual: keyframes */
  .swap {
    @media (prefers-reduced-motion: no-preference) {
      animation: ns-in var(--ns-row-ms) var(--ease-out) both;
    }
  }
</style>
