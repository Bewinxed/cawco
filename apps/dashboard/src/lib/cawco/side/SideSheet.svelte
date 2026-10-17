<script lang="ts">
  /**
   * The preview on a phone (SideSplit): a sheet over the transcript,
   * standing on the composer so the reader can write about the page while it
   * is up (a selection lands as a chip there), at a usable middle snap or the
   * full height. The preview closes it from its own header.
   */
  import { Portal } from "bits-ui";
  import type { Snippet } from "svelte";
  import { tick, untrack } from "svelte";
  import { Drawer as Vaul } from "vaul-svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { cawco } from "../client.svelte";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import { land, waiting } from "../motion/share.svelte";
  import { visible as visibleArea } from "../visible-viewport.svelte";

  let {
    instanceId,
    open,
    content,
    onkeyescape,
    children,
  }: {
    instanceId: string;
    open: boolean;
    content?: HTMLDivElement;
    /** Escape inside the sheet, past the lightbox: what it holds handles it. */
    onkeyescape?: (event: KeyboardEvent) => void;
    children: Snippet;
  } = $props();
  /**
   * How the sheet arrives, decided once as it mounts. It always settles on
   * the middle snap, the page at a usable height. Opened by its card's
   * Preview button in the transcript, it comes out of the card
   * (motion/share.svelte.ts, clipped open from the card's box over
   * --dur-panel on --ease-drawer) standing still at that snap: vaul's own
   * rise is skipped for that one open, so the two never move the sheet at
   * once. Opened any other way (an agent showing a preview, or a preview
   * already open when the page loads), it rises from the bottom edge on
   * vaul's own curve.
   */
  /**
   * The composer's top as drawn: the highest of what it shows. The pill,
   * an ask's card grown out of it, the chips in the tray row, the
   * suggestions while the row holds any, the plan's ring, Caw perched on
   * the pill. Its rows are kept laid out whether they show anything or not
   * (the tray row, the suggestion row: app.css `--c-tray-row`,
   * `--c-suggest-room`), and a part steps aside for an ask by `visibility`;
   * counted by their boxes, an empty suggestion row stood the sheet 59px
   * over the delegate chips on a phone. Drawn is what has a box and paints:
   * neither `visibility: hidden` nor faded to nothing.
   */
  const COMPOSER_PARTS =
    ":scope > .composer, .ask, .lift .kit-tray-chip, .suggest:has(.track), .progress-slot > *, .perch";
  /**
   * The sheet folded to its tab: as tall as its grabber's touch area
   * (`[data-vaul-handle-hitarea]`, below), the one part of it a finger
   * needs. An ask raised on the composer (a question, a permission) is the
   * reader's to answer, and the sheet standing over it hid it: while it is
   * up the sheet folds to its tab on its floor, the ask card's top, and
   * opens again to the height it had once the ask is gone. Opened from the
   * tab meanwhile, it stands above the card.
   */
  const TAB = "44px";
  const DRAWN = { opacityProperty: true, visibilityProperty: true };
  function drawnTop(composer: HTMLElement): number {
    let top = Number.POSITIVE_INFINITY;
    for (const part of composer.querySelectorAll<HTMLElement>(COMPOSER_PARTS)) {
      const box = part.getBoundingClientRect();
      if (box.height > 0 && part.checkVisibility(DRAWN)) {
        top = Math.min(top, box.top);
      }
    }
    return top;
  }
  const share = untrack(() => `preview:${instanceId}`);
  const fromButton = untrack(() => waiting(share));
  let snap = $state<number | string | null>(null);
  let viewportHeight = $state(0);
  let availableHeight = $state(0);
  const middle = $derived(
    `${Math.min(viewportHeight * 0.6, availableHeight)}px`
  );
  let previousMiddle: string;
  let host = $state<HTMLDivElement>();
  let drawer = $state<HTMLElement | null>(null);
  let handleStartY = 0;
  let handleDragged = false;
  async function cycleSnap() {
    if (handleDragged) {
      return;
    }
    // Vaul finishes its pointer-release transaction before accepting a new snap.
    await tick();
    snap = snap === middle ? 1 : middle;
  }
  let snapPoints = $state<(number | string)[]>([0.6, 1]);
  /**
   * How much of the sheet stands below the composer at its snap, clipped by
   * the host: the card is that much shorter (`--sheet-hidden`), so its foot
   * and its well's edge stand above the composer at the middle snap.
   */
  const hidden = $derived.by(() => {
    if (snap === null || snap === 1) {
      return 0;
    }
    const visible =
      typeof snap === "number"
        ? availableHeight * snap
        : Number.parseFloat(snap);
    return Math.max(0, availableHeight - visible);
  });
  /** An ask stands on the composer (its `.dock.asking`): the sheet is folded to its tab. */
  let asking = $state(false);
  /** Where the sheet stood as the ask came up: the middle snap, the full height, or the tab. */
  let beforeAsk: "middle" | number | string | null = null;
  /** A snap the ask's coming or going moves the sheet to, once the snaps hold it. */
  let moveTo: "middle" | number | string | null = null;
  $effect(() => {
    const up = asking;
    untrack(() => {
      if (!placed) {
        return;
      }
      if (up) {
        // By its snap, not its pixels: the middle is a height in pixels,
        // and the ask's card has already moved it by the time this runs.
        beforeAsk = snap === 1 || snap === TAB ? snap : "middle";
        moveTo = TAB;
      } else if (beforeAsk !== null) {
        moveTo = beforeAsk;
        beforeAsk = null;
      }
    });
  });
  /**
   * The ask came or went: vaul moves the sheet there on its own curve, from
   * the snaps as they now stand (it moves only to a snap it holds). Says
   * whether it did.
   */
  function movedForAsk(nextMiddle: string): boolean {
    if (moveTo === null) {
      return false;
    }
    const to = moveTo === "middle" ? nextMiddle : moveTo;
    moveTo = null;
    if (!snapPoints.includes(to)) {
      return false;
    }
    snap = to;
    return true;
  }
  $effect(() => {
    const dimensions = viewportHeight + availableHeight;
    const nextMiddle = middle;
    const tabbed = asking;
    if (dimensions) {
      tick().then(async () => {
        if (snap === previousMiddle) {
          snap = nextMiddle;
        }
        previousMiddle = nextMiddle;
        // The middle snap is viewport-relative; the composer shortens the host.
        // The tab is a snap only while an ask is up.
        snapPoints = tabbed ? [TAB, nextMiddle, 1] : [nextMiddle, 1];
        await tick();
        if (movedForAsk(nextMiddle)) {
          return;
        }
        if (drawer && host && snap !== null) {
          const { height } = host.getBoundingClientRect();
          const visibleHeight =
            typeof snap === "number" ? height * snap : Number.parseFloat(snap);
          // Vaul snapshots its initial pixel offsets; geometry changes refresh
          // the current position without changing the user's chosen snap.
          // The sheet steps with the composer it stands on, as a kit sheet
          // steps with the keyboard (app.css): the composer takes its
          // keyboard-up place at the tap, and vaul's half-second ease, run
          // through the stall WebKit's keyboard puts on the page, painted
          // its first frame 40 to 80px along.
          const ease = drawer.style.transition;
          drawer.style.transition = "none";
          drawer.style.transform = `translate3d(0, ${height - visibleHeight}px, 0)`;
          drawer.getBoundingClientRect();
          drawer.style.transition = ease;
        }
      });
    }
  });
  // The sheet mounts at the middle snap, which is known once the space above
  // the composer has been measured.
  let placed = false;
  $effect.pre(() => {
    if (!placed && availableHeight) {
      placed = true;
      snap = middle;
      previousMiddle = middle;
    }
  });
  /** Where vaul starts the sheet: at its snap when it comes out of the button. */
  const initial = $derived(
    fromButton ? `${availableHeight - Number.parseFloat(middle)}px` : undefined
  );
  $effect(() => {
    const request = cawco.previewRequests[instanceId];
    if (request !== undefined && placed) {
      untrack(() => {
        snap = middle;
      });
    }
  });
  $effect(() => {
    const node = content;
    const frame = host;
    if (!node) {
      return;
    }
    // The sheet's floor is the top of the composer standing over this
    // conversation — the tray row and the suggestion row on it — which is
    // its group's composer, drawn outside the pane. A conversation that
    // cannot be written to has none, and the floor is the pane's own foot,
    // less the step the composer would have stood on.
    const composer = node
      .closest(".leaf")
      ?.querySelector<HTMLElement>(":scope > .dock .lift")?.parentElement;
    const measure = () => {
      const box = node.getBoundingClientRect();
      const offset = Number.parseFloat(
        getComputedStyle(node).getPropertyValue("--space-4")
      );
      const composerTop = composer ? drawnTop(composer) : box.bottom - offset;
      asking = composer?.classList.contains("asking") ?? false;
      const viewport = window.visualViewport;
      // A keyboard that resizes the web view (Brave) reports the new visible
      // area a frame before the page is laid out in it, with the composer
      // still below it, and WebKit can pan the page for a few frames with the
      // composer above its top. A sheet sized from either frame dropped by
      // hundreds of pixels and came back; it keeps its size until the
      // composer stands in the visible area again, the next resize or scroll.
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : innerHeight;
      if (composerTop <= 0 || composerTop > visibleBottom) {
        return;
      }
      // The visible area as published, a foreseen keyboard's included, so
      // the middle snap is the same at the tap and once the keyboard is up.
      viewportHeight = untrack(() => visibleArea.height);
      const safeTop = frame
        ? Number.parseFloat(getComputedStyle(frame).top)
        : 0;
      availableHeight = composerTop - safeTop;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    // The composer's top moves with its parts (a draft growing the pill)
    // and with what it shows on rows it keeps laid out whether or not they
    // show anything: a chip arriving in the tray row, the suggestions
    // filling theirs, another conversation's tray shown, a part stepping
    // aside for an ask (its `visibility` going at the end of its fade). None
    // of those changes a box's size; each is read in the frame after it.
    for (const part of composer?.children ?? []) {
      observer.observe(part);
    }
    let pending = 0;
    const remeasure = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(measure);
    };
    const shows = new MutationObserver(remeasure);
    if (composer) {
      shows.observe(composer, {
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
      composer.addEventListener("transitionend", remeasure);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      shows.disconnect();
      cancelAnimationFrame(pending);
      composer?.removeEventListener("transitionend", remeasure);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  });
</script>

<!-- Held by its top, as tall as the room above the composer. A height
     between a top and a bottom is the fixed layer's container's, which
     WebKit walks through stale sizes for frames while a keyboard resizes the
     web view (Brave): a host held that way grew to 1106px and shrank by the
     keyboard twice in one opening, throwing the sheet down and back.
     What stands below the composer is clipped, and the host is no scroll
     container: with `overflow: hidden` a page in the sheet that scrolled
     something into view (an anchor, a focused field) scrolled the host too,
     236px on a phone, throwing the sheet over the whole screen while vaul
     still held it at the middle snap, so its grabber and its taps no longer
     matched what was drawn. -->
<Portal
  ><div
    data-slot="preview-sheet-host"
    class="fixed top-(--host-top) inset-x-0 z-40 overflow-clip pointer-events-none h-(--host-h)"
    data-active-snap={typeof snap === "string" ? 0.6 : snap}
    style:--host-top="env(safe-area-inset-top, 0px)"
    style:--host-h="{availableHeight}px"
    bind:this={host}
  ></div></Portal
>
{#if host && availableHeight}
  <!-- The kit's drawer (vaul): its content follows the finger 1:1 from the
       handle and settles on the nearest snap on vaul's own curve. The
       lowest snap is the middle one, so the page always stands at a usable
       height; the header's Close is how the preview is put away, and
       nothing behind it scales. It fills its host (inset 0), so it is
       `hosted`: the kit does not place it on the visible area. -->
  <Drawer.Root
    container={host}
    dismissible={false}
    handleOnly
    modal={false}
    noBodyStyles
    {open}
    shouldScaleBackground={false}
    {snapPoints}
    bind:activeSnapPoint={snap}
  >
    <Drawer.Content
      data-preview-sheet
      class="preview-sheet"
      hosted
      modal={false}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onEscapeKeydown={(event) => {
        if (lightbox.current) {
          lightbox.close();
        } else {
          onkeyescape?.(event);
        }
        event.preventDefault();
      }}
      onOpenAutoFocus={(event) => event.preventDefault()}
      style={initial ? `--initial-transform:${initial}` : undefined}
      trapFocus={false}
      bind:ref={drawer}
    >
      <Drawer.Title class="sr-only">Beside the conversation</Drawer.Title>
      <!-- literal: 100px, 6px, 44px -->
      <div
        data-slot="sheet"
        class="relative flex flex-1 flex-col min-h-0 pt-space-3 rounded-t-lg bg-surface-raised shadow-drawer"
        style:--sheet-hidden="{hidden}px"
        style:--grab-left="calc(50% - 50px)"
        style:--grab-w="100px"
        style:--grab-h="6px"
        style:--grab-hit="44px"
        {@attach land(() => share, { mode: "clip" })}
      >
        <Vaul.Handle
          data-preview-grab
          onclick={cycleSnap}
          onpointerdown={(event) => {
            handleStartY = event.clientY;
            handleDragged = false;
          }}
          onpointermove={(event) => {
            if (Math.abs(event.clientY - handleStartY) > 8) {
              handleDragged = true;
            }
          }}
          preventCycle
        />
        {@render children()}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}

<style>
  /* residual: foreign-dom */
  /* css-scope .preview-sheet: the canvas stage finds this sheet by it */
  /* The sheet fills its host (the space above the composer) edge to edge,
     so the kit content's inset card, its top margin, its height cap, its
     padding and its drawn grab bar give way to the sheet div, which draws
     the surface and holds the vaul handle: the one box that comes out of the
     Preview button. The kit's own classes are utilities in a layer; these
     stand over them. */
  :global([data-preview-sheet][data-slot="drawer-content"]) {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    max-height: none;
    margin: 0;
    padding: 0;
    outline: none;
  }
  :global([data-preview-sheet][data-slot="drawer-content"]::before),
  :global([data-preview-sheet][data-slot="drawer-content"] > div:first-child) {
    display: none;
  }
  /* The vaul handle (its own unlayered styles stand under these). */
  :global([data-preview-sheet] [data-preview-grab][data-vaul-handle]) {
    touch-action: none;
    position: absolute;
    top: var(--space-1);
    left: var(--grab-left);
    width: var(--grab-w);
    height: var(--grab-h);
    border-radius: var(--radius-pill);
    background: var(--border-control);
    margin: 0;
    opacity: 1;
  }
  :global([data-preview-sheet] [data-vaul-handle-hitarea]) {
    height: var(--grab-hit);
  }
  /* The card is as tall as what the snap shows (`--sheet-hidden` stands
     below the composer), so its well keeps its foot and radius above it. */
  :global(
      [data-preview-sheet] [data-slot="sheet"] > [data-slot="side-card"]
    ) {
    flex: 1;
    height: auto;
    max-block-size: calc(100% - var(--sheet-hidden, 0px));
    box-shadow: none;
  }
</style>
