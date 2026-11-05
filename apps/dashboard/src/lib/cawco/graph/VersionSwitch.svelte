<script lang="ts" module>
  /** A version on the switch: his, the agent's as written, or one he kept, by its place among those kept. */
  export type Version = "yours" | "written" | number;
</script>

<script lang="ts">
  /**
   * The whole versions of what he tuned on the graph, once he changed
   * anything (the owner's pick): As written | Yours, Yours counting what he
   * changed, on the house's segmented control. Keep, after it, keeps Yours
   * as a version of its own, named by its place
   * after As written ("Version 2", "Version 3"…), each on the switch
   * between As written and Yours; past three, the rest stand in a menu at
   * the switch's end. A kept version, like As written, is shown and played
   * as it was kept and changes nothing. The Animation face's timing and the
   * Dials face's values each have one, in the same place at their head.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconChevronDown, IconKeep } from "#lib/icons.js";
  import { figureOf } from "./figures";

  let {
    label,
    version,
    changed,
    lang,
    onversion,
    kept = 0,
    onkeep,
  }: {
    /** What the versions are of, said to a reader ("Timing", "Values"). */
    label: string;
    version: Version;
    /** How many things his version changes. */
    changed: number;
    lang: string | undefined;
    onversion: (version: Version) => void;
    /** How many versions he kept. */
    kept?: number;
    /** Yours kept as a version of its own; absent, nothing is kept. */
    onkeep?: () => void;
  } = $props();

  /** The kept versions the switch holds itself; past them, the menu. */
  const ON_SWITCH = 3;
  /** A kept version's name: its place after As written, which is Version 1. */
  const nameOf = (at: number) => words.versionN(figureOf(at + 2, lang));
  const keyOf = (at: number) => `kept-${at}`;
  const pickedOf = (key: string): Version | null => {
    if (key === "yours" || key === "written") {
      return key;
    }
    const at = Number(key.slice("kept-".length));
    return key.startsWith("kept-") && Number.isInteger(at) ? at : null;
  };
  const shownKept = $derived(
    Array.from({ length: Math.min(kept, ON_SWITCH) }, (_, at) => at)
  );
  const menuKept = $derived(
    Array.from(
      { length: Math.max(0, kept - ON_SWITCH) },
      (_, at) => at + ON_SWITCH
    )
  );
  const value = $derived(
    typeof version === "number" ? keyOf(version) : version
  );
</script>

<div class="flex min-w-0 items-center gap-space-1" data-slot="versions">
  <ToggleGroup.Root
    aria-label={label}
    onValueChange={(next: string) => {
      const picked = pickedOf(next);
      if (picked !== null) {
        onversion(picked);
      }
    }}
    type="single"
    {value}
  >
    <ToggleGroup.Item value="written">{words.written}</ToggleGroup.Item>
    {#each shownKept as at (at)}
      <ToggleGroup.Item value={keyOf(at)}>{nameOf(at)}</ToggleGroup.Item>
    {/each}
    <ToggleGroup.Item
      aria-label="{words.yours}, {words.changedCount(figureOf(changed, lang))}"
      value="yours"
    >
      <span>{words.yours}</span>
      <span class="type-meta text-ink-muted num" data-slot="changed-count"
        >{figureOf(changed, lang)}</span
      >
    </ToggleGroup.Item>
  </ToggleGroup.Root>
  {#if menuKept.length > 0}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label={words.moreVersions}
            icon={IconChevronDown}
            size="icon-sm"
            title={words.moreVersions}
            variant="ghost"
          />
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.RadioGroup
          bind:value={
            () => value,
            (next: string) => {
              const picked = pickedOf(next);
              if (picked !== null) {
                onversion(picked);
              }
            }
          }
        >
          {#each menuKept as at (at)}
            <DropdownMenu.RadioItem value={keyOf(at)}
              >{nameOf(at)}</DropdownMenu.RadioItem
            >
          {/each}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
  {#if onkeep && version === "yours" && changed > 0}
    <Tip label={words.keep}>
      {#snippet children(tip)}
        <Button
          {...tip}
          aria-label={words.keep}
          data-slot="keep"
          icon={IconKeep}
          onclick={onkeep}
          press="pressable"
          size="icon-sm"
          variant="ghost"
        />
      {/snippet}
    </Tip>
  {/if}
</div>
