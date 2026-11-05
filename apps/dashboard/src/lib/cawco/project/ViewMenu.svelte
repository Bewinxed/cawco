<script lang="ts" module>
  /** A view as the menu lists it: Caw's drafts marked. */
  export interface MenuView {
    draft: boolean;
    label: string;
    value: string;
  }
</script>

<script lang="ts">
  /**
   * The project's views, one menu in the head beside the project's name
   * at every width: its trigger names the view on screen, its list holds
   * every view in the page's order, the one on screen ticked, each Caw
   * drafted marked `draft`. The workspace's tab strip is the window's one
   * row of tabs and its chosen tab the one mark of where you are (the
   * owner's rules 1, 2 and 6): the views are a second axis, so they are a
   * menu, never a row of their own. No view carries a count: what waits is
   * counted once, by Needs you (rule 7).
   */
  import { viewsWords } from "@cawco/core/words/views";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconChevronDown } from "#lib/icons.js";

  let {
    views,
    current,
    onchoose,
  }: {
    /** Every view, in the page's order. */
    views: MenuView[];
    current: string;
    onchoose: (view: string) => void;
  } = $props();

  const currentLabel = $derived(
    views.find((view) => view.value === current)?.label ?? ""
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-label={viewsWords.pick(currentLabel)}
        class="touch-hit min-w-0 flex-none"
        data-views-picker
        size="sm"
        variant="ghost"
      >
        <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{currentLabel}</span
        >
        <IconChevronDown />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="w-auto">
    <DropdownMenu.RadioGroup onValueChange={onchoose} value={current}>
      {#each views as view (view.value)}
        <DropdownMenu.RadioItem value={view.value}>
          <span>{view.label}</span>
          {#if view.draft}
            <!-- The tag stands after the view's name, never over it. -->
            <Badge class="ms-space-1" data-box variant="secondary"
              ><span>draft</span></Badge
            >
          {/if}
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
