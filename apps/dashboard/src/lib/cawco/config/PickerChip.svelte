<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  /**
   * A picker as a chip: what is chosen, and a popover listing the rest. Used
   * for the narrowings — machine, project, harness, model — where "every" is
   * the usual answer and the list can be long. Given `picked`, it holds
   * several: a pick toggles one in or out and the list stays open, and the
   * empty-string option (picked when nothing is) clears them.
   */
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconCheck, IconChevronDown, IconUnfold } from "#lib/icons.js";

  let {
    label,
    value = "",
    picked,
    options,
    onpick,
    field,
  }: {
    label: string;
    /**
     * It stands in a form among 36px fields, as one of them, under a Field's
     * label (whose `for` this id is): the Select trigger's recipe (DESIGN.md,
     * Inputs and fields: "Select trigger: the input's look with a
     * sort-vertical glyph"), not the setting chip, which is for a narrowing
     * shown as a small trigger.
     */
    field?: { id: string };
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
  {#if field}
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          id={field.id}
          align="trigger"
          aria-label="{label}: {chosen}"
          class="w-full"
          data-picker-field
          variant="outline"
        >
          <span
            data-slot="num"
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap num"
            ><MorphText text={chosen} /></span
          >
          <IconUnfold class="text-ink-muted" />
        </Button>
      {/snippet}
    </Popover.Trigger>
  {:else}
    <Popover.Trigger
      data-picker-chip
      aria-label="{label}: {chosen}"
      look="chip"
    >
      <span class="text-ink-muted">{label}</span>
      <span data-slot="num" class="min-w-0 truncate num"
        ><MorphText text={chosen} /></span
      >
      <IconChevronDown data-slot="chevron" />
    </Popover.Trigger>
  {/if}
  <Popover.Content
    align="start"
    gap="none"
    height="capped"
    overflow="scroll"
    width="narrow"
  >
    <!-- The kit's ghost and pill: the pill is the choice, and a pick takes
         the ghost's place under the pointer while the popover closes. -->
    <div
      aria-label={label}
      aria-multiselectable={picked ? true : undefined}
      class="flex flex-col"
      role="listbox"
      {@attach highlight({
        rows: '[data-slot="item"]',
        selected: '[aria-selected="true"]',
      })}
    >
      {#each options as option, index (option.value)}
        {#if option.group && option.group !== options[index - 1]?.group}
          <span
            data-slot="group"
            class="pt-space-2 px-space-3 pb-space-1 type-meta text-ink-muted"
            >{option.group}</span
          >
        {/if}
        <button
          data-slot="item"
          aria-selected={isChosen(option.value)}
          class={menuItemVariants({
            class:
              "flex items-center gap-space-2 w-full px-space-3 text-start type-label text-ink-strong focus-inset",
          })}
          data-menu-item
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
