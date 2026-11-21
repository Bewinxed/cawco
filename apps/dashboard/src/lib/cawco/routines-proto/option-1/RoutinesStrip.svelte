<script lang="ts">
  /**
   * The project page's view strip on Routines, as the page draws it under
   * its head: the views (ViewTabs, Routines chosen), then the view's acts.
   * New routine is the view's one prominent act, where New task stands for
   * the board: it opens Caw with words written for this project; More
   * holds Set up by hand.
   */
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMoreLinear, IconPenLinear } from "#lib/icons.js";
  import type { BarView } from "../../project/ViewBar.svelte";
  import ViewTabs from "../../project/ViewTabs.svelte";

  let {
    views,
    onchoose,
    onnew,
    onbyhand,
  }: {
    views: BarView[];
    onchoose: (view: string) => void;
    /** New routine: Caw, with words ready. */
    onnew: () => void;
    /** Set up by hand: the form, where a routine opens. */
    onbyhand: () => void;
  } = $props();
</script>

<div
  data-slot="strip"
  class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
>
  <ViewTabs
    current="routines"
    hrefOf={(view) => `?view=${view}`}
    {onchoose}
    {views}
  />
  <div class="ms-auto flex flex-none items-center gap-space-2">
    <BarGlass form="group">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <BarItem {props} icon={IconMoreLinear} label="More" />
          {/snippet}
        </DropdownMenu.Trigger>
        <BarMenu label="More for Routines" width="regular">
          <DropdownMenu.Item onSelect={onbyhand}
            ><IconPenLinear /><span>Set up by hand</span></DropdownMenu.Item
          >
        </BarMenu>
      </DropdownMenu.Root>
    </BarGlass>
    <Button label="New routine" onclick={onnew} shape="capsule" size="sm" />
  </div>
</div>
