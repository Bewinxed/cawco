<script lang="ts">
  /**
   * A picker as a chip: what is chosen, and a popover listing the rest. Used
   * for the narrowings — machine, project, harness, model — where "every" is
   * the usual answer and the list can be long. Given `picked`, it holds
   * several: a pick toggles one in or out and the list stays open, and the
   * empty-string option (picked when nothing is) clears them.
   */
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconCheck, IconChevronDown } from "#lib/icons.js";

  let {
    label,
    value = "",
    picked,
    options,
    onpick,
  }: {
    label: string;
    /** The chosen option's value; the empty string is the "every" option. */
    value?: string;
    /** The chosen options' values, when it holds several. */
    picked?: readonly string[];
    /** Options sharing a `group` are listed under that heading. */
    options: { value: string; label: string; group?: string }[];
    onpick: (next: string) => void;
  } = $props();

  let expanded = $state(false);
  const labelOf = (of: string) =>
    options.find((option) => option.value === of)?.label ?? of;
  const isChosen = (of: string) =>
    picked
      ? picked.includes(of) || (of === "" && picked.length === 0)
      : of === value;
  const chosen = $derived(
    picked && picked.length > 0
      ? picked.map(labelOf).join(", ")
      : labelOf(picked ? "" : value)
  );
</script>

<Popover.Root bind:open={expanded}>
  <Popover.Trigger
    data-picker-chip
    aria-label="{label}: {chosen}"
    class="inline-flex items-center gap-(--chip-gap) max-w-full h-(--chip-h) px-(--chip-pad) border border-border-control rounded-md bg-surface-raised type-label text-ink-strong transition-control hover:bg-surface-hover motion-safe:transition-control-press motion-safe:active:transform-(--tpress) mark-line"
    style="--chip-gap: 6px; --chip-h: 32px; --chip-pad: 10px; --tpress: scale(var(--press-scale))"
  >
    <span class="text-ink-muted">{label}</span>
    <span
      data-slot="num"
      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap num"
      ><MorphText text={chosen} /></span
    >
    <IconChevronDown class="size-icon-md flex-none text-ink-muted" />
  </Popover.Trigger>
  <Popover.Content align="start" class="max-h-80 w-64 gap-0 overflow-y-auto">
    <!-- The kit's ghost and pill: the pill is the choice, and a pick takes
         the ghost's place under the pointer while the popover closes. -->
    <!-- literal: 8px, 10px -->
    <div
      aria-label={label}
      aria-multiselectable={picked ? true : undefined}
      class="flex flex-col"
      role="listbox"
      style:--opt-gap="8px"
      style:--opt-pad="10px"
      style:--group-pt="8px"
      {@attach highlight({
        rows: '[data-slot="item"]',
        selected: '[aria-selected="true"]',
      })}
    >
      {#each options as option, index (option.value)}
        {#if option.group && option.group !== options[index - 1]?.group}
          <span
            data-slot="group"
            class="pt-(--group-pt) px-(--opt-pad) pb-space-1 type-meta text-ink-muted"
            >{option.group}</span
          >
        {/if}
        <button
          data-slot="item"
          aria-selected={isChosen(option.value)}
          class="kit-item flex items-center gap-(--opt-gap) w-full px-(--opt-pad) text-left type-label text-ink-strong focus-inset"
          onclick={() => {
            onpick(option.value);
            // One of several stays open for the next.
            expanded = picked !== undefined && option.value !== "";
          }}
          role="option"
          type="button"
        >
          <span
            data-slot="picker-chip-label"
            class="flex-1 min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{option.label}</span
          >
          {#if isChosen(option.value)}
            <IconCheck class="size-icon-md flex-none" />
          {/if}
        </button>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>
