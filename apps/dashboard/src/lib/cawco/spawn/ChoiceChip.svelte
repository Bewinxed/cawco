<script lang="ts" module>
  import type { Component } from "svelte";

  /** One option: the value it picks, its name and line, its mark and the mark's hue. */
  export interface ChoiceOption<V> {
    desc: string;
    hue: string;
    icon: Component<{ class?: string; style?: string }>;
    name: string;
    value: V;
  }
</script>

<script lang="ts" generics="T">
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  /**
   * A composer chip that opens its few options rather than flipping on a
   * click: each a row with its tile, its name and what it does, the chosen
   * one ticked. The setting chips that choose between two ways a session
   * starts (Lifetime, Context) are each this with their options.
   */
  import { IconSuccess as Check, IconChevronDown as Down } from "#lib/icons.js";
  import { staggered } from "#lib/platform/motion/curves.svelte.js";
  import NsPopover from "./NsPopover.svelte";

  let {
    id,
    label,
    options,
    value,
    onpick,
    open,
    onchange,
  }: {
    /** The popover's id, as the form's other chips name theirs. */
    id: string;
    /** The trigger's accessible name, given the chosen option's name. */
    label: (name: string) => string;
    options: readonly ChoiceOption<T>[];
    value: T;
    onpick: (value: T) => void;
    open: boolean;
    onchange: (open: boolean) => void;
  } = $props();
  const current = $derived(
    options.find((option) => option.value === value) ?? options[0]
  );
</script>

<NsPopover
  gap={2}
  {id}
  label={label(current.name)}
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
  {#each options as option, index (option.name)}
    {@const Icon = option.icon}
    {@const on = option.value === value}
    <button
      data-slot="row"
      aria-pressed={on}
      class="select-none ns-in press-tint transition-control relative flex min-h-c-row-h w-full items-center gap-space-3 rounded-glide-row border-none border-current bg-transparent px-space-2 py-space-2 text-start text-ink-strong aria-pressed:bg-selected-bg aria-pressed:text-selected-ink"
      data-fh="1"
      onclick={() => {
        onpick(option.value);
        onchange(false);
      }}
      style:--delay={staggered(index)}
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
