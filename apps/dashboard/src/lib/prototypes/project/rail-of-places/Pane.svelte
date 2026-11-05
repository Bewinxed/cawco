<script lang="ts">
  /**
   * Where a task, a routine or a decision page opens (the option: "A task
   * opens as a pane, never a page"). From the desk line up it slides over
   * the trailing third of the list it was opened from, which stays live and
   * pressable beside it (DESIGN.md, The Open Page Rule); under it, it is a
   * bottom drawer as tall as its content up to 85% of the screen, a grabber
   * and one header (DESIGN.md, Drawer). Its bar is one row: the thing's short
   * name, then Close as a bare symbol named by where it goes.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { scrimFade, sheetIn, sheetOut } from "./motion";
  import SheetHead from "./SheetHead.svelte";

  let {
    title,
    closeLabel,
    onclose,
    children,
  }: {
    title: string;
    /** Close's name: where it goes ("Close task"). */
    closeLabel: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  const desk = new MediaQuery("(min-width: 900px)");
  const side = $derived(desk.current ? "end" : "bottom");
  // The side it leaves by, written down while it stands: an outro cannot
  // read a derived (derived_inert).
  let leaving: "end" | "bottom" = "end";
  $effect(() => {
    leaving = side;
  });
</script>

{#if !desk.current}
  <button
    type="button"
    class="absolute inset-0 z-(--layer-float) bg-scrim"
    aria-label={closeLabel}
    tabindex="-1"
    onclick={onclose}
    in:scrimFade
    out:scrimFade={{ leaving: true }}
  ></button>
{/if}
<section
  class="absolute z-(--layer-float) flex flex-col overflow-hidden bg-surface-raised shadow-drawer desk:inset-y-0 desk:end-0 desk:w-1/3 desk:min-w-c-panel-w desk:border-s desk:border-border-hairline max-desk:inset-x-0 max-desk:bottom-0 max-desk:max-h-c-sheet-max-h max-desk:rounded-t-lg"
  aria-label={title}
  in:sheetIn={{ side }}
  out:sheetOut={{ side: leaving }}
>
  <div
    class="mx-auto mt-space-2 h-c-grabber-h w-c-grabber-w flex-none rounded-pill bg-surface-fill-strong desk:hidden"
    aria-hidden="true"
  ></div>
  <SheetHead {title} {closeLabel} {onclose} />
  <div class="min-h-0 flex-1 overflow-y-auto px-space-5 pb-space-6">
    {@render children()}
  </div>
</section>
