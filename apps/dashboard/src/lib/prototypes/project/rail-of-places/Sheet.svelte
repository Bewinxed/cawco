<script lang="ts">
  /**
   * An edge sheet over the screen, for the rare holds (DESIGN.md, Dialog,
   * sheet and drawer): the places sheet from the leading edge under the
   * desk line, Configure and Caw from the trailing edge. A sheet that
   * `drops` becomes a bottom drawer under the desk line, a grabber and one
   * header, as tall as its content up to 85% of the screen. The scrim takes
   * a press as Close; the bar's Close is a bare symbol named by where it goes.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { scrimFade, sheetIn, sheetOut } from "./motion";
  import SheetHead from "./SheetHead.svelte";

  let {
    title,
    closeLabel,
    side = "end",
    size = "panel",
    drops = false,
    onclose,
    head,
    children,
  }: {
    title: string;
    closeLabel: string;
    side?: "start" | "end";
    /** `rail`: the shell's rail sheet width; `panel`: a side panel's. */
    size?: "rail" | "panel";
    /** Under the desk line it is a bottom drawer. */
    drops?: boolean;
    onclose: () => void;
    /** What stands in the bar before Close, after the title. */
    head?: Snippet;
    children: Snippet;
  } = $props();

  const desk = new MediaQuery("(min-width: 900px)");
  const bottom = $derived(drops && !desk.current);
  const travel = $derived(bottom ? "bottom" : side);
  // The side it leaves by, written down while it stands: an outro cannot
  // read a derived (derived_inert).
  let leaving: "start" | "end" | "bottom" = "end";
  $effect(() => {
    leaving = travel;
  });
</script>

<button
  type="button"
  class="absolute inset-0 z-(--layer-float) bg-scrim"
  aria-label={closeLabel}
  tabindex="-1"
  onclick={onclose}
  in:scrimFade
  out:scrimFade={{ leaving: true }}
></button>
<section
  class="group/sheet absolute z-(--layer-float) flex flex-col overflow-hidden bg-surface-raised shadow-drawer data-[at=end]:inset-y-0 data-[at=end]:end-0 data-[at=start]:inset-y-0 data-[at=start]:start-0 data-[at=bottom]:inset-x-0 data-[at=bottom]:bottom-0 data-[at=bottom]:max-h-c-sheet-max-h data-[at=bottom]:rounded-t-lg phone:data-[size=panel]:data-[at=end]:w-c-panel-w data-[size=rail]:w-c-rail-sheet-w max-phone:data-[size=panel]:data-[at=end]:w-full"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  data-at={travel}
  data-size={size}
  in:sheetIn={{ side: travel }}
  out:sheetOut={{ side: leaving }}
>
  {#if bottom}
    <div
      class="mx-auto mt-space-2 h-c-grabber-h w-c-grabber-w flex-none rounded-pill bg-surface-fill-strong"
      aria-hidden="true"
    ></div>
  {/if}
  <SheetHead {title} {closeLabel} {onclose} symbols={head} />
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    {@render children()}
  </div>
</section>
