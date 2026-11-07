<script lang="ts">
  /**
   * Find's places as the composer's layer, narrow (a phone, Caw's panel, a
   * desk pane under the drawer line): the kit's floating surface rising out
   * of the composer over the transcript's foot, across the composer's
   * width, as the plan does (PlanPane). It is opened and folded from the
   * find field's place, and a place picked folds it so the place reads
   * whole above the composer. Nothing it does moves the transcript (the
   * composer's brief, The Composer Layer Rule).
   *
   * It holds its pane's composer layer while it stands: the plan or the
   * tray's shelf opening takes it, and it folds.
   */
  import { findInWords } from "@cawco/core/words/find-in";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { popOut } from "../motion/pop.svelte";
  import { composerLayerOf } from "../transcript/composer-layer.svelte";
  import type { ConversationFind } from "./conversation-find.svelte";
  import FindPlaces from "./FindPlaces.svelte";

  let { find }: { find: ConversationFind } = $props();

  /**
   * How tall it may stand: at most the room over the composer to the dock's
   * top, and no more than a little over half of it, so the place stepped to
   * stays readable above it. Our own call, from the shaping frames.
   */
  const room: Attachment<HTMLElement> = (node) => {
    const column = node.offsetParent;
    const dock = node.closest('[data-slot="dock"]');
    if (column && dock) {
      const over =
        column.getBoundingClientRect().top - dock.getBoundingClientRect().top;
      const most = Math.max(0, over - 16);
      node.style.setProperty(
        "--find-room",
        `${Math.min(most, Math.max(200, over * 0.55))}px`
      );
    }
  };

  const owner = Symbol("find");
  const layer = $derived(composerLayerOf(find.viewId));
  $effect.pre(() => {
    const held = layer;
    untrack(() => held.take(owner));
    return () => held.drop(owner);
  });
  $effect(() => {
    if (!layer.holds(owner)) {
      untrack(() => {
        find.listOpen = false;
      });
    }
  });
</script>

<!-- It comes in by the kit's `@starting-style` (opacity, rise and scale on
     one transition, from the composer's top) and leaves by `popOut` back
     down into it. -->
<section
  data-slot="find-layer"
  aria-label={findInWords.places}
  class={floatingSurface({
    class:
      "absolute start-0 end-0 bottom-(--find-foot) z-3 flex flex-col max-h-(--find-room) p-0 overflow-clip origin-bottom pointer-events-auto",
  })}
  data-side="top"
  data-state="open"
  style:--find-foot="calc(100% + var(--space-2))"
  {@attach room}
  out:popOut|global={{ side: "top" }}
>
  <FindPlaces {find} narrow />
</section>
