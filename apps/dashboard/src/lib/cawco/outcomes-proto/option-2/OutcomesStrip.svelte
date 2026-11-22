<script lang="ts">
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import type { BarView } from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  /**
   * The project page's view strip while Outcomes is the view (ProjectPage
   * `strip`, as it ships, from 640): the views as tabs (ViewTabs), the rule,
   * Needs you, and the view's own act in the slot New task takes on the
   * Board (S10): Say an outcome, which opens Caw's conversation with a
   * starter he edits.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconPlus } from "#lib/icons.js";

  let {
    views,
    current,
    needs,
    needsOn,
    onchoose,
    ontoggleneeds,
    onsay,
  }: {
    views: BarView[];
    current: string;
    /** What waits on him across the project. */
    needs: number;
    needsOn: boolean;
    onchoose: (view: string) => void;
    ontoggleneeds: () => void;
    onsay: () => void;
  } = $props();
</script>

<div
  class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
  data-slot="strip"
>
  <ViewTabs {current} hrefOf={(view) => `#${view}`} {onchoose} {views} />
  <span
    aria-hidden="true"
    class="h-c-btn-h-sm w-px flex-none bg-border-hairline"
  ></span>
  <div class="flex flex-none items-center gap-space-2" data-form="compact">
    {#if needs > 0}
      <NeedsYouChip count={needs} on={needsOn} ontoggle={ontoggleneeds} />
    {/if}
    <Button
      icon={IconPlus}
      label="Say an outcome"
      onclick={onsay}
      press="pressable"
      size="sm"
      variant="ghost"
    />
  </div>
</div>
