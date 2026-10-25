<!--
  The phone's two bars, the same in H1 and H2 (report part 1, 390):

  - `top`: one row, no ground: the Shell's sidebar toggle (a cut of the live
    capture), the title, More in its glass (the place is More's first row),
    and the Shell's Caw tab at the trailing edge. `stale` (F2) puts the
    Status dot and "stale" beside the title.
  - `foot`: the docked bar where today's ViewBar docks, in the composer's
    shell (dock-shell): the view pill (the kit Select's trigger, as the live
    bar draws it), the waiting toggle, and Ask Caw, the screen's one coral,
    Caw's face its glyph.
-->
<script>
  import { PROJECT } from "./data.js";
  import { BarGlass, Button, dockShellVariants, IconMore, IconNeedsYou } from "./kit.js";
  import * as Select from "../../../apps/dashboard/src/lib/components/ui/select/index.js";

  let { bar, view = "Board", waiting = 0, stale = false } = $props();
</script>

{#if bar === "top"}
  <div data-phone-bar="top" class="flex h-c-top-bar-h items-center gap-space-2 ps-space-3">
    <span data-img="shell/phone-toggle.png" data-natural class="block flex-none"></span>
    <span class="min-w-0 flex-auto type-label text-ink-strong">{PROJECT.title}</span>
    {#if stale}
      <span class="mark-line inline-flex flex-none items-center gap-space-1 type-meta text-status-fail-ink">
        <span aria-hidden="true" class="size-(--status-dot-size) rounded-pill bg-status-fail-glyph"></span>
        <span>stale</span>
      </span>
    {/if}
    <BarGlass>
      {#snippet head()}
        <button data-bar-item aria-label="More" class="select-none touch-hit press-tint" type="button">
          <IconMore data-slot="bar-symbol" aria-hidden="true" />
        </button>
      {/snippet}
    </BarGlass>
    <span data-img="shell/phone-caw.png" data-natural class="block flex-none self-start"></span>
  </div>
{:else}
  <div
    data-phone-bar="foot"
    class={dockShellVariants({
      class: "group flex items-center gap-space-2 p-c-composer-inset hit-gap-x-space-2 coarse:gap-space-3 coarse:hit-gap-x-space-3",
    })}
    data-bar
  >
    <Select.Root type="single" value={view}>
      <Select.Trigger aria-label="View: {view}" look="in-bar" mark="chevron" size="composer">
        <span>{view}</span>
      </Select.Trigger>
    </Select.Root>
    <button
      data-waiting-toggle
      aria-label={waiting > 0 ? `Waiting on you, ${waiting}` : "Nothing waits on you"}
      aria-pressed="false"
      class={[
        "flex h-c-composer-field min-w-c-composer-field flex-none items-center justify-center gap-space-1 rounded-sm border-0 bg-transparent px-space-2 text-ink-strong select-none touch-hit press-tint",
        waiting === 0 && "opacity-50",
      ]}
      type="button"
    >
      <IconNeedsYou aria-hidden="true" class="size-icon-md" />
      {#if waiting > 0}<span data-slot="num" class="num type-label">{waiting}</span>{/if}
    </button>
    <span class="flex-auto"></span>
    <Button class="h-c-composer-field ps-space-2" data-ask-caw>
      <span data-img="caw/seat-idle-a.png" class="block size-icon-lg flex-none"></span>
      <span>Ask Caw</span>
    </Button>
  </div>
{/if}
