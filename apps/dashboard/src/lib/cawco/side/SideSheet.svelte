<script lang="ts">
  /**
   * The side surface on a phone (SideSplit): a sheet over the transcript,
   * standing on the composer, at a usable middle snap or the full height. It
   * holds whatever the conversation shows beside it — its plan, its preview
   * — and each of those closes it from its own header.
   */
  import { Portal } from "bits-ui";
  import type { Snippet } from "svelte";
  import { tick, untrack } from "svelte";
  import { Drawer as Vaul } from "vaul-svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { cawco } from "../client.svelte";
  import { land, waiting } from "../motion/share.svelte";
  import { lightbox } from "../transcript/lightbox-state.svelte";

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
  const share = untrack(() => `preview:${instanceId}`);
  const fromButton = untrack(() => waiting(share));
  let snap = $state<number | string | null>(null);
  let bottom = $state(0);
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
  $effect(() => {
    const dimensions = bottom + viewportHeight + availableHeight;
    const nextMiddle = middle;
    if (dimensions) {
      tick().then(async () => {
        if (snap === previousMiddle) {
          snap = nextMiddle;
        }
        previousMiddle = nextMiddle;
        // The middle snap is viewport-relative; the composer shortens the host.
        snapPoints = [nextMiddle, 1];
        await tick();
        if (drawer && host && snap !== null) {
          const { height } = host.getBoundingClientRect();
          const visibleHeight =
            typeof snap === "number" ? height * snap : Number.parseFloat(snap);
          // Vaul snapshots its initial pixel offsets; geometry changes refresh
          // the current position without changing the user's chosen snap.
          drawer.style.transform = `translate3d(0, ${height - visibleHeight}px, 0)`;
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
    const column = node
      .closest(".leaf")
      ?.querySelector<HTMLElement>(":scope > .dock .lift");
    const measure = () => {
      const box = node.getBoundingClientRect();
      const offset = Number.parseFloat(
        getComputedStyle(node).getPropertyValue("--space-4")
      );
      // The composer's top is whatever stands highest on it: the tray row,
      // the suggestions on it, the plan's ring, Caw perched on the pill.
      const composerTop = column
        ? Math.min(
            column.getBoundingClientRect().top,
            ...[
              ...(column.parentElement?.querySelectorAll(
                ".suggest, .progress-slot, .perch"
              ) ?? []),
            ].map((part) => part.getBoundingClientRect().top)
          )
        : box.bottom - offset;
      bottom = innerHeight - composerTop;
      viewportHeight = window.visualViewport?.height ?? innerHeight;
      const safeTop = frame
        ? Number.parseFloat(getComputedStyle(frame).top)
        : 0;
      availableHeight = composerTop - safeTop;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    // The column moves with the composer's parts beside it (a draft
    // growing the box under it, a tray row arriving in it).
    for (const part of column?.parentElement?.children ?? []) {
      observer.observe(part);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  });
</script>

<Portal
  ><div
    class="preview-sheet-host"
    data-active-snap={typeof snap === "string" ? 0.6 : snap}
    style={`bottom:${bottom}px`}
    bind:this={host}
  ></div></Portal
>
{#if host && availableHeight}
  <!-- The kit's drawer (vaul): its content follows the finger 1:1 from the
       handle and settles on the nearest snap on vaul's own curve. The
       lowest snap is the middle one, so the page always stands at a usable
       height; the header's Close is how the preview is put away, and
       nothing behind it scales. -->
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
      class="preview-sheet"
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
      style="inset:0;width:100%;height:100%;{initial
        ? `--initial-transform:${initial}`
        : ""}"
      trapFocus={false}
      bind:ref={drawer}
    >
      <Drawer.Title class="sr-only">Beside the conversation</Drawer.Title>
      <div
        class="sheet"
        style:--sheet-hidden="{hidden}px"
        {@attach land(() => share, { mode: "clip" })}
      >
        <Vaul.Handle
          class="preview-grab"
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
  .preview-sheet-host {
    position: fixed;
    top: env(safe-area-inset-top, 0px);
    left: 0;
    right: 0;
    z-index: 40;
    overflow: hidden;
    pointer-events: none;
  }
  /* The sheet fills its host (the space above the composer) edge to edge,
     so the kit content's inset card, its top margin, its height cap, its
     padding and its drawn grab bar give way to `.sheet`, which draws the
     surface and holds the vaul handle: the one box that comes out of the
     Preview button. */
  :global(.preview-sheet) {
    position: absolute;
    z-index: 40;
    display: flex;
    flex-direction: column;
    max-height: none;
    margin: 0;
    padding: 0;
    outline: none;
  }
  /* Whole selectors inside :global(): nested under it, the `div` is scoped
     to this component and never matches the kit's own bar. */
  :global(.preview-sheet::before),
  :global(.preview-sheet > div:first-child) {
    display: none;
  }
  .sheet {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding-top: var(--space-3);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--surface-raised);
    box-shadow: var(--shadow-drawer);
  }
  :global(.preview-sheet .preview-grab[data-vaul-handle]) {
    touch-action: none;
    position: absolute;
    top: var(--space-1);
    left: calc(50% - 50px);
    width: 100px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--border-control);
    margin: 0;
    opacity: 1;
  }
  :global(.preview-sheet [data-vaul-handle-hitarea]) {
    height: 44px;
  }
  /* The card is as tall as what the snap shows (`--sheet-hidden` stands
     below the composer), so its well keeps its foot and radius above it. */
  :global(.preview-sheet .sheet > .side-card) {
    flex: 1;
    height: auto;
    max-block-size: calc(100% - var(--sheet-hidden, 0px));
    box-shadow: none;
  }
</style>
