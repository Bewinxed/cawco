<script lang="ts">
  /**
   * The top of the project on a phone as it stands: its head, and the bar of
   * views (ViewBar) docked under it with the view pill and Ask Caw, the
   * screen's one coral control. The head's `⋯` stands open over it, so New
   * session shows where a phone keeps it. bits-ui opens a menu trigger on
   * Enter, as a keyboard press would.
   *
   * BitsConfig mounts the menu's portal in this room's own layer instead of
   * the page's body, so the open menu is part of the story's frame, drawn
   * and read with it. bits-ui sets the menu's max height to the window's
   * room under `⋯`; an embed's window is only as tall as this room, and a
   * canvas that draws the frame zoomed scales that height down once more,
   * so here the menu stands whole (max height none), every item drawn. The
   * room reserves down to the menu's foot, then the bar under it.
   */
  import { BitsConfig } from "bits-ui";
  import type { Snippet } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import ViewBar from "../ViewBar.svelte";

  /** The kit menu's gap under its trigger: dropdown-menu-content.svelte's `sideOffset` default. */
  const MENU_GAP = 4;
  /** The project page's views as a phone's bar lists them (its `barViews`), Board on screen. */
  const VIEWS = [
    { value: "board", label: "Board", draft: false, count: 0 },
    { value: "table", label: "Table", draft: false, count: 0 },
    { value: "pipeline", label: "Pipeline", draft: false, count: 0 },
    { value: "routines", label: "Routines", draft: false, count: 0 },
    { value: "decisions", label: "Decisions", draft: false, count: 1 },
  ];

  let { children }: { children: Snippet } = $props();
  let room = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();
  /** The room's height down to the open menu's foot, in the room's own px. */
  let reach = $state(0);
  /** The bar's own height, in the room's own px. */
  let bar = $state(0);

  $effect(() => {
    const element = room;
    if (!element) {
      return;
    }
    const open = () => {
      const trigger = element.querySelector<HTMLElement>(
        '[aria-label^="More for"]'
      );
      if (!trigger) {
        return false;
      }
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      return true;
    };
    if (open()) {
      return;
    }
    const watch = new MutationObserver(() => {
      if (open()) {
        watch.disconnect();
      }
    });
    watch.observe(element, { childList: true, subtree: true });
    return () => watch.disconnect();
  });

  // Where the open menu's foot falls when it opens below `⋯`: the trigger's
  // foot, the kit's gap (dropdown-menu-content.svelte's `sideOffset`, which
  // the head leaves at its default) and the menu's whole height (its
  // scrollHeight: its items whole, its layout height not caught half-grown
  // by its open's scale). A canvas may draw the frame zoomed: the trigger's
  // distance is divided by the room's drawn-to-own ratio, so the reach is in
  // the room's own px. Read again whenever the menu or the trigger changes
  // size or moves.
  $effect(() => {
    const element = room;
    const over = layer;
    if (!(element && over)) {
      return;
    }
    const menuOf = () =>
      over.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]');
    const triggerOf = () =>
      element.querySelector<HTMLElement>('[aria-label^="More for"]');
    const measure = () => {
      const menu = menuOf();
      const trigger = triggerOf();
      if (!(menu && trigger)) {
        reach = 0;
        return;
      }
      const own = element.getBoundingClientRect();
      const scale = element.offsetHeight
        ? own.height / element.offsetHeight
        : 1;
      reach = Math.ceil(
        (trigger.getBoundingClientRect().bottom - own.top) / scale +
          MENU_GAP +
          menu.scrollHeight
      );
    };
    const sized = frameObserver(measure);
    const added = new MutationObserver(() => {
      for (const one of [menuOf(), triggerOf()]) {
        if (one) {
          sized.observe(one);
        }
      }
      measure();
    });
    added.observe(over, {
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    });
    measure();
    return () => {
      added.disconnect();
      sized.disconnect();
    };
  });

  // An open menu is modal: bits-ui takes the pointer from the page's body
  // (its style's pointer-events) until it closes. A still frame has nothing
  // behind the menu to guard, and it is read by hit-testing, so while this
  // room stands the body keeps the pointer.
  $effect(() => {
    const { body } = document;
    const free = () => {
      if (body.style.pointerEvents === "none") {
        body.style.pointerEvents = "";
      }
    };
    free();
    const watch = new MutationObserver(free);
    watch.observe(body, { attributeFilter: ["style"] });
    return () => watch.disconnect();
  });

  // The bar docks at the room's foot (ViewBar's dock, absolute, around its
  // `view-bar`): its height is read so the room holds it under the menu.
  $effect(() => {
    const dock = room?.querySelector<HTMLElement>(
      '[data-slot="view-bar"]'
    )?.parentElement;
    if (!dock) {
      return;
    }
    const sized = frameObserver(() => {
      bar = dock.offsetHeight;
    });
    sized.observe(dock);
    return () => sized.disconnect();
  });
</script>

<!-- The head, the menu's reach under it, then the bar with the room the
     bar's dock keeps under it (ViewBar: --space-4 over the foot). The menu
     stands whole: the room reserves its height, so no window clamps it. -->
<div
  bind:this={room}
  class="relative flex w-full flex-col [&_[data-slot=dropdown-menu-content]]:max-h-none"
  data-phone-top
  style:min-block-size="calc({reach}px + var(--space-4) + {bar}px +
  var(--space-4))"
>
  <BitsConfig defaultPortalTo={layer}>{@render children()}</BitsConfig>
  <ViewBar
    current="board"
    needs={0}
    needsOn={false}
    onchoose={() => undefined}
    onnewsession={() => undefined}
    ontoggleneeds={() => undefined}
    views={VIEWS}
  />
  <div bind:this={layer}></div>
</div>
