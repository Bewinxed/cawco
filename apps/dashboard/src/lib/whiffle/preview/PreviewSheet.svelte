<script lang="ts">
  import { Portal } from "bits-ui";
  import { tick, untrack } from "svelte";
  import { Drawer as Vaul } from "vaul-svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "$lib/components/ui/drawer";
  import { hidePreview, whiffle } from "../client.svelte";
  import { land, waiting } from "../motion/share.svelte";
  import { lightbox } from "../transcript/lightbox-state.svelte";
  import PreviewPane from "./PreviewPane.svelte";
  import type { CapturedSelection } from "./selection";

  let {
    instanceId,
    open,
    content,
    onselect,
    onescape,
  }: {
    instanceId: string;
    open: boolean;
    content?: HTMLDivElement;
    onselect: (
      selection: CapturedSelection
    ) => "added" | "duplicate" | "full" | undefined;
    onescape: () => boolean;
  } = $props();
  const peek = "106px";
  /**
   * How the sheet arrives, decided once as it mounts. Opened by its card's
   * Preview button in the transcript, it comes out of the card
   * (motion/share.svelte.ts, clipped open from the card's box over
   * --dur-panel on --ease-drawer) straight to the middle snap the reader
   * asked for, standing still while it does: vaul's own rise is skipped for
   * that one open, so the two never move the sheet at once. Opened any other
   * way (an agent showing a preview), it peeks up from the bottom edge on
   * vaul's own curve and waits there.
   */
  const share = untrack(() => `preview:${instanceId}`);
  const fromButton = untrack(() => waiting(share));
  let snap = $state<number | string | null>(peek);
  let bottom = $state(0);
  let viewportHeight = $state(0);
  let availableHeight = $state(0);
  const middle = $derived(
    `${Math.min(viewportHeight * 0.6, availableHeight)}px`
  );
  let previousMiddle: string;
  let host = $state<HTMLDivElement>();
  let drawer = $state<HTMLElement | null>(null);
  let previewPane = $state<ReturnType<typeof PreviewPane>>();
  let handleStartY = 0;
  let handleDragged = false;
  function reportSnap() {
    whiffle.previewVisible[instanceId] = snap !== peek;
  }
  async function cycleSnap() {
    if (handleDragged) {
      return;
    }
    // Vaul finishes its pointer-release transaction before accepting a new snap.
    await tick();
    if (snap === peek) {
      snap = middle;
    } else if (snap === middle) {
      snap = 1;
    } else {
      snap = peek;
    }
    reportSnap();
  }
  let snapPoints = $state<(number | string)[]>([peek, 0.6, 1]);
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
        snapPoints = [peek, nextMiddle, 1];
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
  $effect(() => {
    if (!fromButton) {
      untrack(() => hidePreview(instanceId));
    }
  });
  // Opened from the button: the sheet mounts at the middle snap, which is
  // known once the space above the composer has been measured.
  let placed = false;
  $effect.pre(() => {
    if (fromButton && !placed && availableHeight) {
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
    const request = whiffle.previewRequests[instanceId];
    if (request !== undefined) {
      untrack(() => {
        snap = whiffle.previewVisible[instanceId] ? middle : peek;
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
      const composerTop = column
        ? Math.min(
            column.getBoundingClientRect().top,
            column.querySelector(".suggest")?.getBoundingClientRect().top ??
              Number.POSITIVE_INFINITY
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
    data-active-snap={typeof snap === 'string' && snap !== peek ? 0.6 : snap}
    style={`bottom:${bottom}px`}
    bind:this={host}
  ></div></Portal
>
{#if host && availableHeight}
  <!-- The kit's drawer (vaul): its content follows the finger 1:1 from the
       handle and settles on the nearest snap on vaul's own curve. The
       lowest snap is the peek, which is how the preview is put away; it is
       never dismissed past that, and nothing behind it scales. -->
  <Drawer.Root
    container={host}
    dismissible={false}
    handleOnly
    modal={false}
    noBodyStyles
    onRelease={reportSnap}
    {open}
    repositionInputs={false}
    shouldScaleBackground={false}
    {snapPoints}
    bind:activeSnapPoint={snap}
  >
    <Drawer.Content
      class="preview-sheet"
      onCloseAutoFocus={(event) => event.preventDefault()}
      onEscapeKeydown={(event) => { if (lightbox.current) { lightbox.close(); } else { previewPane?.parentEscape(event); } event.preventDefault(); }}
      onOpenAutoFocus={(event) => event.preventDefault()}
      style="inset:0;width:100%;height:100%;{initial ? `--initial-transform:${initial}` : ''}"
      trapFocus={false}
      bind:ref={drawer}
    >
      <Drawer.Title class="sr-only">Preview</Drawer.Title>
      <div class="sheet" {@attach land(() => share, { mode: 'clip' })}>
        <Vaul.Handle
          class="preview-grab"
          onclick={cycleSnap}
          onpointerdown={(event) => { handleStartY = event.clientY; handleDragged = false; }}
          onpointermove={(event) => { if (Math.abs(event.clientY - handleStartY) > 8) { handleDragged = true; } }}
          preventCycle
        />
        <PreviewPane
          {instanceId}
          {onescape}
          {onselect}
          bind:this={previewPane}
        />
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

    &::before,
    & > div:first-child {
      display: none;
    }
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
  :global(.preview-sheet .sheet > .preview-pane) {
    flex: 1;
    height: auto;
    box-shadow: none;
  }
</style>
