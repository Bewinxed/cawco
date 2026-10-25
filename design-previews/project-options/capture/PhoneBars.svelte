<!--
  The phone's two bars, the same in H1 and H2′ (report part 1, 390):

  - `top`: one row, no ground: the Shell's sidebar toggle (a cut of the live
    capture), the title, More in its glass (the place is More's first row),
    and the Shell's Caw tab at the trailing edge. `stale` (F2) puts the
    hollow ring in `error-9` and "stale" in `error-11` beside the title.
  - `narrow`: a desk page column narrower than the phone's breakpoint
    (placement A at his 1037 window, beside a full-height pane): the page
    bar's phone form, the title and More alone, its views, hand and Ask Caw
    in the foot dock (the rulings' A at 1037).
  - `foot`: the docked bar where today's ViewBar docks, in the composer's
    shell (dock-shell): the view pill (the kit Select's trigger, as the live
    bar draws it), the waiting toggle, and the Ask Caw slot the frame fills
    (AskCaw.svelte, phone size).
-->
<script>
  import { PROJECT } from "./data.js";
  import { BarGlass, dockShellVariants, IconMore, IconNeedsYou } from "./kit.js";
  import * as Select from "../../../apps/dashboard/src/lib/components/ui/select/index.js";

  let { bar, view = "Board", waiting = 0, stale = false } = $props();
</script>

{#if bar === "narrow"}
  <div data-phone-bar="narrow" data-bar class="flex h-c-top-bar-h items-center gap-space-2 ps-space-7 pe-space-6">
    <h1 class="m-0 min-w-0 flex-auto type-title text-ink-strong">{PROJECT.title}</h1>
    {#if stale}
      <span data-stale-mark class="mark-line inline-flex flex-none items-center gap-space-1 type-meta text-error-11">
        <span aria-hidden="true" data-hollow-ring class="size-(--status-dot-size) rounded-pill border-2 border-error-9"></span>
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
  </div>
{:else if bar === "top"}
  <div data-phone-bar="top" data-bar class="flex h-c-top-bar-h items-center gap-space-2 ps-space-3">
    <span data-img="shell/phone-toggle.png" data-natural class="block flex-none"></span>
    <span class="min-w-0 flex-auto type-label text-ink-strong">{PROJECT.title}</span>
    {#if stale}
      <span data-stale-mark class="mark-line inline-flex flex-none items-center gap-space-1 type-meta text-error-11">
        <span aria-hidden="true" data-hollow-ring class="size-(--status-dot-size) rounded-pill border-2 border-error-9"></span>
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
    <span data-slot-part="askcaw" class="contents"></span>
  </div>
{/if}
