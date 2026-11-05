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
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { IconClose } from "#lib/icons.js";
  import { scrimFade, sheetIn, sheetOut } from "./motion";

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
  out:sheetOut={{ side: travel }}
>
  {#if bottom}
    <div
      class="mx-auto mt-space-2 h-c-grabber-h w-c-grabber-w flex-none rounded-pill bg-surface-fill-strong"
      aria-hidden="true"
    ></div>
  {/if}
  <header
    class="flex h-c-top-bar-h flex-none items-center gap-space-3 ps-space-5 pe-space-3"
  >
    <h2 class="min-w-0 flex-1 truncate type-label text-ink-strong">{title}</h2>
    {@render head?.()}
    <BarGlass form="group">
      <button
        data-bar-item
        type="button"
        class="select-none touch-hit press-tint"
        aria-label={closeLabel}
        onclick={onclose}
      >
        <IconClose data-slot="bar-symbol" aria-hidden="true" />
      </button>
    </BarGlass>
  </header>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    {@render children()}
  </div>
</section>
