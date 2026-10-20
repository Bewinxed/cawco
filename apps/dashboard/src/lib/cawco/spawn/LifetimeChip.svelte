<script lang="ts">
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
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
  triggerClass={chipVariants({ variant: "setting" })}
  width={300}
>
  {#snippet trigger()}
    {@const Icon = current.icon}
    {#key current.name}
      <span data-slot="swap" class="ns-in inline-flex items-center gap-space-2">
        <Icon class="size-icon-md flex-none" style={`color:${current.hue}`} />
        <span data-slot="chip-label">{current.name}</span>
      </span>
    {/key}
    <Down data-slot="chevron" />
  {/snippet}
  {#each OPTIONS as option, index (option.name)}
    {@const Icon = option.icon}
    {@const on = option.ephemeral === ephemeral}
    <button
      data-slot="row"
      aria-pressed={on}
      class="ns-in press-tint transition-control relative flex min-h-c-row-h w-full items-center gap-space-3 rounded-sm border-none border-current bg-transparent px-space-2 py-space-2 text-start text-ink-strong aria-pressed:bg-selected-bg aria-pressed:text-selected-ink"
      data-fh="1"
      onclick={() => {
        onlifetime(option.ephemeral);
        onchange(false);
      }}
      style={`--delay:${index * 35}ms`}
      type="button"
    >
      <span data-slot="tile" class={iconTileVariants()} style:color={option.hue}
        ><Icon class="size-icon-md" /></span
      >
      <span data-slot="text" class="min-w-0 flex-1">
        <span data-slot="name" class="type-label block">{option.name}</span>
        <span
          data-slot="meta"
          class="type-meta block text-pretty text-ink-subtle in-aria-pressed:text-selected-ink"
          >{option.desc}</span
        >
      </span>
      {#if on}
        <Check class="ns-check size-icon-md flex-none text-selected-icon" />
      {/if}
    </button>
  {/each}
</NsPopover>
