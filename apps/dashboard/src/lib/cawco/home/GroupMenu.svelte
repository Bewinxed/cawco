<script generics="T extends string" lang="ts">
  /**
   * A list's groupings, in the rail's own menu (Recent's and Projects'):
   * one surface, a column a level side by side ("Group by", then each "Then
   * by"), a hairline between them, stacked on a phone so the menu keeps to
   * the screen. Each column is the kit's tick items: a press on the ticked
   * one clears its level, on another picks it, and a grouping another level
   * holds is greyed there. It stays open while the reader picks, and every
   * pick regroups the list behind it.
   */
  import { sidebarWords } from "@cawco/core/words/sidebar";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconSort } from "#lib/icons.js";
  import type { Levels } from "./grouping.svelte";

  let {
    label,
    levels,
    options,
    onpick,
  }: {
    /** The button's name ("Group sessions"). */
    label: string;
    /** The levels as they stand, a cleared one `null`: one column each. */
    levels: Levels<T>;
    /** What each level may group by, in the menu's order. */
    options: readonly T[];
    /** A press on `by` in the column of level `at`. */
    onpick: (at: number, by: T) => void;
  } = $props();

  const WORD: Record<string, string> = {
    day: sidebarWords.byDay,
    project: sidebarWords.byProject,
    area: sidebarWords.byArea,
    machine: sidebarWords.byMachine,
  };
</script>

<DropdownMenu.Root>
  <Tip {label}>
    {#snippet children(tip)}
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...tip}
            {...props}
            aria-label={label}
            data-group-menu
            size="icon-sm"
            variant="ghost"
          >
            <IconSort />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
    {/snippet}
  </Tip>
  <DropdownMenu.Content
    align="end"
    class="w-auto"
    onOpenAutoFocus={(event) => event.preventDefault()}
  >
    <div
      class="grid grid-flow-col auto-cols-fr divide-x divide-border-hairline max-desk:grid-flow-row max-desk:divide-x-0 max-desk:divide-y"
    >
      {#each levels as chosen, at (at)}
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading
            >{at === 0
              ? sidebarWords.groupBy
              : sidebarWords.thenBy}</DropdownMenu.GroupHeading
          >
          {#each options as option (option)}
            <DropdownMenu.CheckboxItem
              checked={chosen === option}
              closeOnSelect={false}
              disabled={levels.some(
                (other, where) => where !== at && other === option
              )}
              onCheckedChange={() => onpick(at, option)}
              >{WORD[option]}</DropdownMenu.CheckboxItem
            >
          {/each}
        </DropdownMenu.Group>
      {/each}
    </div>
  </DropdownMenu.Content>
</DropdownMenu.Root>
