<script lang="ts" module>
  /** A figure and a unit written together ("36px", "1.5rem", "250 ms"). */
  const FIGURE_UNIT = /^(-?\d+(?:\.\d+)?)\s*([a-z%]+)$/iu;
  /** A name's lead up to its first hyphen ("radius-" of "radius-md"). */
  const LEAD = /^[^-]+-/u;
  /** At most this many options, their words this long in all, stand as one segmented row. */
  const SEGMENTS_MAX = 3;
  const SEGMENTS_CHARS = 18;

  /** A design system's colour name: words joined by hyphens, as its variable is named. */
  const TOKEN_NAME = /^[a-z]+(?:-[a-z0-9]+)+$/u;
  /** A colour as CSS paints it: a design system name as its variable, any other as written. */
  export const paint = (colour: string): string =>
    TOKEN_NAME.test(colour) ? `var(--color-${colour})` : colour;

  /** An option said as a figure and its unit where it is one ("36px": "36 px"), else as written. */
  export const optionSaid = (option: string): string => {
    const match = FIGURE_UNIT.exec(option.trim());
    return match ? `${match[1]} ${match[2]}` : option;
  };

  /**
   * Each option's words: a lead every option shares (`radius-` of
   * `radius-sm`, `radius-md`) said once by the row's name and left off.
   */
  export function optionWords(options: readonly string[]): string[] {
    const lead = options[0]?.match(LEAD)?.[0];
    const shared =
      options.length > 1 &&
      lead !== undefined &&
      options.every((one) => one.startsWith(lead) && one.length > lead.length);
    return options.map((one) =>
      optionSaid(shared && lead ? one.slice(lead.length) : one)
    );
  }
</script>

<script lang="ts">
  import { graphWords } from "@cawco/core/words/graph";
  /**
   * A choice among known values, its options in sight where they fit (the
   * owner, 2026-11-10: a dropdown is the last resort): a few short ones the
   * kit's segmented control on one line (config Choice), a handful a
   * wrapping row of option chips (OptionGroup), a colour's set as swatches,
   * each its colour drawn beside its name. Only a set too many or too long
   * for the card's width stands as a list, under a trigger in the kit
   * Select's look: a popover with a field that narrows it, its values
   * listed, the chosen one ticked (the owner's pick, Design graph Controls
   * card fixes, `fixed-list-props`). Whatever is typed only searches: the
   * value is always one of the set.
   */
  import Choice from "#lib/cawco/config/Choice.svelte";
  import * as Command from "#lib/components/ui/command/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconUnfold } from "#lib/icons.js";
  import { fitsInPlace } from "./dials";

  let {
    options,
    value,
    label,
    id,
    swatches = false,
    open = false,
    onopenchange,
    onchange,
  }: {
    options: readonly string[];
    value: string;
    label: string;
    id: string;
    /** The options are colours: each drawn as its swatch (a design system name as its variable). */
    swatches?: boolean;
    /** The list stands open (a set too long to show in place). */
    open?: boolean;
    onopenchange: (open: boolean) => void;
    onchange: (next: string) => void;
  } = $props();

  const words = $derived(optionWords(options));
  /** A set too long to stand in place is a list he searches: the last resort. */
  const listed = $derived(!(swatches || fitsInPlace(words)));
  /** What he typed in the list's field: it narrows the list, never sets the value. */
  let typed = $state("");
  /** The row the list's keys stand on, the chosen one as it opens. */
  let onRow = $state("");
  const segmented = $derived(
    !swatches &&
      options.length <= SEGMENTS_MAX &&
      words.join("").length <= SEGMENTS_CHARS
  );
</script>

<!-- A row of chips stands a step in from its row's top and foot, so its
     first line sits on the name's line, as a field's words do. -->
<div
  class={["min-w-0 flex-1", !(listed || segmented) && "py-space-1"]}
  id={listed ? undefined : id}
>
  {#if listed}
    <Popover.Root
      onOpenChange={(next: boolean) => {
        typed = "";
        onRow = value;
        onopenchange(next);
      }}
      {open}
    >
      <Popover.Trigger
        aria-label={label}
        class="w-full min-w-0"
        {id}
        aria-expanded={open}
        look="select"
        role="combobox"
      >
        <span
          class="mark-text min-w-0 overflow-clip text-ellipsis whitespace-nowrap max-phone:text-(length:--text-field-floor) coarse:text-(length:--text-field-floor)"
          >{optionSaid(value)}</span
        >
        <IconUnfold class="size-icon-md text-ink-muted pointer-events-none" />
      </Popover.Trigger>
      <!-- At least the trigger's width, its rows wrapping whole where a
           value is longer than the list is wide. -->
      <Popover.Content
        align="start"
        class="min-w-(--bits-popover-anchor-width)"
        pad="none"
        width="wide"
      >
        <Command.Root bind:value={onRow}>
          <Command.Input
            aria-label={graphWords.dials.searchSaid(label)}
            placeholder={graphWords.dials.search}
            bind:value={typed}
          />
          <Command.List>
            <Command.Empty
              >{graphWords.dials.noMatch(typed.trim())}</Command.Empty
            >
            {#each options as option (option)}
              <Command.Item
                data-checked={option === value}
                onSelect={() => {
                  onchange(option);
                  onopenchange(false);
                }}
                value={option}
                ><span class="min-w-0 flex-1 text-pretty wrap-anywhere"
                  >{optionSaid(option)}</span
                ></Command.Item
              >
            {/each}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  {:else if segmented}
    <Choice
      {label}
      {onchange}
      options={options.map((one, at) => ({
        value: one,
        label: words[at] ?? one,
      }))}
      {value}
    />
  {:else}
    <OptionGroup
      aria-label={label}
      bind:value={() => [value], (next) => next[0] && onchange(next[0])}
      glide
    >
      {#each options as option, at (option)}
        {#if swatches}
          <!-- A colour's chip: its swatch, then its name, so each reads
               without a hover. -->
          <OptionGroupItem value={option}>
            <!-- A box, not a run of words: the chip's mark line leaves its
                 size alone (design.css `mark-line`). -->
            <span
              aria-hidden="true"
              data-box
              class="block size-icon-sm flex-none rounded-full border border-border-hairline bg-(--paint)"
              style:--paint={paint(option)}
            ></span>
            {words[at]}
          </OptionGroupItem>
        {:else}
          <OptionGroupItem value={option}>{words[at]}</OptionGroupItem>
        {/if}
      {/each}
    </OptionGroup>
  {/if}
</div>
