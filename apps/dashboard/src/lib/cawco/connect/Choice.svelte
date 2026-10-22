<script lang="ts" generics="T extends string">
  /**
   * A choice set inside a sentence ("Bring it in [over SSH ▾]", "Sign in
   * [with the hub's key ▾]"): the kit's setting chip (30px, 8px corner, a
   * 12px chevron) opening the kit's menu of radio items, each its words and,
   * where it has one, the consequence in meta under them. The chip's words
   * morph as the choice changes (The Steady Swap Rule).
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconChevronDown } from "#lib/icons.js";

  let {
    value,
    options,
    label,
    onchoose,
    id,
  }: {
    value: T;
    options: { value: T; words: string; says?: string }[];
    /** Its name for a screen reader: the sentence it stands in. */
    label: string;
    onchoose: (next: T) => void;
    id?: string;
  } = $props();

  const chosen = $derived(
    options.find((one) => one.value === value) ?? options[0]
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        {id}
        type="button"
        aria-label="{label}: {chosen?.words}"
        class="select-none pressable touch-hit mark-line inline-flex h-c-btn-h-sm max-w-full items-center gap-space-1 rounded-sm border border-border-control bg-surface-raised px-space-2 type-label text-ink-strong shadow-xs transition-control hover:bg-surface-hover"
      >
        <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          ><MorphText text={chosen?.words ?? ""} /></span
        >
        <IconChevronDown
          aria-hidden="true"
          class="size-icon-sm text-ink-muted"
        />
      </button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" width="wide">
    <DropdownMenu.RadioGroup
      {value}
      onValueChange={(next) => onchoose(next as T)}
    >
      {#each options as option (option.value)}
        <DropdownMenu.RadioItem value={option.value}>
          <span class="flex min-w-0 flex-col" data-box>
            <span class="type-label text-ink-strong">{option.words}</span>
            {#if option.says}
              <span class="type-meta text-pretty text-ink-muted"
                >{option.says}</span
              >
            {/if}
          </span>
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
