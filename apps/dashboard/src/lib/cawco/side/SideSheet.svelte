<script lang="ts">
  /**
   * The preview on a phone (SideSplit): a sheet over the transcript and
   * the composer, down to the screen's foot, so the page has the composer's
   * room too. When the reader takes the composer it steps down onto it, so
   * what they write stands in view; dragged up, it covers it again. The
   * preview closes it from its own header.
   */
  import { Portal } from "bits-ui";
  import type { Snippet } from "svelte";
  import { tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { Drawer as Vaul } from "vaul-svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
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
   * How the sheet arrives, decided once as it mounts. It settles on its
   * open stop (on the composer, the lower one, if the reader is writing
   * there). Opened by its card's
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
  const COMPOSER_PARTS = [
    ':scope > [data-slot="composer"]',
    '[data-slot="ask"]',
    '[data-slot="lift"] [data-tray-chip]',
    '[data-slot="suggest"]:has([data-slot="track"])',
    '[data-slot="progress-slot"] > *',
    '[data-slot="perch"]',
  ].join(", ");
  /**
   * The sheet folded to its tab: as tall as its grabber's touch area
   * (`[data-vaul-handle-hitarea]`, below), the one part of it a finger
   * needs. An ask raised on the composer (a question, a permission) is the
   * reader's to answer, and the sheet standing over it hid it: while it is
   * up the sheet folds to its tab on the ask card's top, and
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
  /**
   * The sheet's stops, vaul's snap points, lowest first. The host reaches
   * the screen's foot (less the home indicator's room), and each stop is a
   * height shown over that foot.
   *
   * - `open`, where it opens: its floor the screen's foot, over the
   *   composer, its chips, its suggestions and the plan's ring, its top the
   *   composer's room above where `lower` stands.
   * - `lower`, when the reader needs the composer (it takes the focus): its
   *   floor the composer's drawn top, 60% of the visible height or all the
   *   room above the composer. The composer's room under it is clipped off
   *   the host, so the sheet steps down onto the composer and never floats
   *   over its empty rows.
   * - `full`: the whole host, its floor the screen's foot.
   * - `tab`, while an ask is up (TAB, below).
   *
   * While an ask is up every stop stands on the ask's card, clipped as
   * `lower` is.
   */
  type Stop = "tab" | "lower" | "open" | "full";
  /**
   * The sheet covers the composer on a phone only (DESIGN.md's phone
   * breakpoint, 640px): in a desk's pane under 900px a mouse writes in the
   * composer at any moment, and every stop stands on it there, opening on
   * `lower`.
   */
  const covers = new MediaQuery("(width < 640px)");
  let snap = $state<number | string | null>(null);
  let viewportHeight = $state(0);
  /** The host's height: from the safe area's top to the screen's foot. */
  let hostHeight = $state(0);
  /** The room above the composer's drawn top, from the safe area's top. */
  let aboveComposer = $state(0);
  /** The composer's room: from its drawn top to the screen's foot. */
  let composerRoom = $state(0);
  /** vaul reads a px snap point with parseInt: every one is whole. */
  const px = (height: number) => `${Math.round(height)}px`;
  /** Each stop's snap point, as vaul takes it. */
  const values = $derived.by((): Record<Stop, number | string> => {
    const middle = Math.min(viewportHeight * 0.6, aboveComposer);
    const onIt = composerRoom + middle;
    const over = onIt + composerRoom;
    return {
      tab: px(composerRoom + Number.parseFloat(TAB)),
      lower: px(onIt),
      open: Math.round(over) < Math.round(hostHeight) ? px(over) : 1,
      full: 1,
    };
  });
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
    const rest = restStop();
    snap = stop === rest ? values.full : values[rest];
  }
  /** The stop the sheet rests at: over the composer on a phone, else on it. */
  const restStop = (): Stop =>
    covers.current && !asking && snapStops.includes("open") ? "open" : "lower";
  let snapPoints = $state<(number | string)[]>([0.6, 1]);
  /** The stop each of `snapPoints` is, in order. */
  let snapStops = $state<Stop[]>([]);
  /** The stop the sheet stands at, as vaul last settled it. */
  const stop = $derived<Stop | null>(
    snap === null ? null : (snapStops[snapPoints.indexOf(snap)] ?? null)
  );
  /** An ask stands on the composer (its `.dock.asking`): the sheet is folded to its tab. */
  let asking = $state(false);
  /** The floor stands on the composer: the composer's room is clipped off the host. */
  const onComposer = $derived(
    asking || !covers.current || stop === "lower" || stop === "tab"
  );
  /**
   * How much of the sheet stands below its floor at its snap, clipped by the
   * host: the card is that much shorter (`--sheet-hidden`), so its foot and
   * its well's edge stand above the floor.
   */
  const hidden = $derived.by(() => {
    if (snap === null) {
      return 0;
    }
    const visible =
      typeof snap === "number" ? hostHeight * snap : Number.parseFloat(snap);
    return Math.max(0, hostHeight - visible) + (onComposer ? composerRoom : 0);
  });
  /** The host's clip at `room`: the composer's room off its foot, or none. */
  const insetOf = (room: number) => `inset(0px 0px ${room}px 0px)`;
  /** The clip's own run, while the sheet moves between a floor and the other. */
  let clipRun: Animation | null = null;
  /** Whether the floor stood on the composer the last time it was drawn. */
  let wasOnComposer: boolean | null = null;
  /**
   * The floor moves with the sheet: stepping down onto the composer, the
   * clip rises from the screen's foot to the composer's top as vaul slides
   * the sheet; climbing back, it falls again. vaul moves the sheet by a CSS
   * transition on its transform, so the clip is run on that transition's
   * own clock: its duration, its easing and its start, read from it. A
   * sheet that does not move (an ask folding it, a re-place under a new
   * geometry, which sets no transition) changes its clip at once, and one
   * whose move is cut short (the keyboard's re-place) takes its clip's end.
   */
  $effect(() => {
    const now = onComposer;
    const node = host;
    if (!node) {
      return;
    }
    const before = wasOnComposer;
    wasOnComposer = now;
    if (before === null || before === now) {
      return;
    }
    const room = untrack(() => composerRoom);
    // A clip caught mid-run turns back from where it stands.
    const from = clipRun
      ? getComputedStyle(node).clipPath
      : insetOf(before ? room : 0);
    clipRun?.cancel();
    clipRun = null;
    tick().then(() => {
      const sheet = drawer;
      const moving = sheet
        ?.getAnimations()
        .find(
          (each): each is CSSTransition =>
            each instanceof CSSTransition &&
            each.transitionProperty === "transform" &&
            each.playState === "running"
        );
      if (!(moving && node.isConnected && wasOnComposer === now)) {
        return;
      }
      const timing = moving.effect?.getTiming();
      const [first] =
        (moving.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      const run = node.animate(
        [
          { clipPath: from, easing: first?.easing ?? "linear" },
          { clipPath: insetOf(now ? room : 0) },
        ],
        {
          duration: timing?.duration,
          delay: timing?.delay,
          easing: timing?.easing,
        }
      );
      // One clock: the clip starts when the sheet's move does, once that
      // start is known (a transition still pending has none yet).
      if (moving.startTime === null) {
        // A move cut short before it starts rejects `ready` (its cancel
        // finishes the clip below).
        moving.ready.then(
          () => {
            run.startTime = moving.startTime;
          },
          () => undefined
        );
      } else {
        run.startTime = moving.startTime;
      }
      moving.addEventListener("cancel", () => run.finish(), { once: true });
      run.addEventListener("finish", () => {
        if (clipRun === run) {
          clipRun = null;
        }
      });
      clipRun = run;
    });
  });
  /** Where the sheet stood as the ask came up. */
  let beforeAsk: Stop | null = null;
  /** A stop the ask's coming or going moves the sheet to, once the snaps hold it. */
  let moveTo: Stop | null = null;
  $effect(() => {
    const up = asking;
    untrack(() => {
      if (!placed) {
        return;
      }
      if (up) {
        // By its stop, not its pixels: the stops are heights in pixels,
        // and the ask's card has already moved them by the time this runs.
        beforeAsk = stop ?? "open";
        moveTo = "tab";
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
  function movedForAsk(): boolean {
    if (moveTo === null) {
      return false;
    }
    const to = moveTo;
    moveTo = null;
    const at = snapStops.indexOf(to);
    if (at === -1) {
      return false;
    }
    snap = snapPoints[at] ?? null;
    return true;
  }
  /**
   * The stops are heights in pixels: the one the sheet stands at keeps its
   * place under the new geometry (`open` gone, the one it became: the whole
   * host, or the composer off a phone, `onlyLower`).
   */
  function keep(
    standing: Stop | null,
    onlyLower: boolean,
    next: Record<Stop, number | string>
  ) {
    if (!standing) {
      return;
    }
    const kept = standing === "open" && onlyLower ? next.lower : next[standing];
    if (snapPoints.includes(kept)) {
      snap = kept;
    }
  }
  /** The stops the sheet has now, lowest first, each with its snap point. */
  function stopsNow(
    tabbed: boolean,
    phone: boolean,
    next: Record<Stop, number | string>
  ) {
    let names: Stop[] = ["lower", "full"];
    if (tabbed) {
      names = ["tab", "lower", "full"];
    } else if (phone) {
      names = ["lower", "open", "full"];
    }
    // `open` is the whole host where the room allows no more.
    return names.filter(
      (name, at) => at === 0 || next[name] !== next[names[at - 1] as Stop]
    );
  }
  $effect(() => {
    const dimensions = viewportHeight + hostHeight + composerRoom;
    const next = values;
    const tabbed = asking;
    const phone = covers.current;
    if (dimensions) {
      tick().then(async () => {
        const standing = stop;
        const names = stopsNow(tabbed, phone, next);
        snapPoints = names.map((name) => next[name]);
        snapStops = names;
        keep(standing, !(phone || tabbed), next);
        await tick();
        if (movedForAsk()) {
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
  /** The composer standing over this conversation, once found. */
  let composerNode: HTMLElement | undefined;
  /** The reader is writing: the composer holds the focus. */
  const writing = () =>
    !!composerNode?.contains(document.activeElement) &&
    document.activeElement !== document.body;
  // The sheet mounts at its open stop, which is known once the composer and
  // the screen's foot have been measured; on the composer if the reader is
  // writing in it.
  let placed = false;
  /** The stop the sheet mounted at. */
  let firstStop: Stop = "open";
  $effect.pre(() => {
    if (!placed && hostHeight) {
      placed = true;
      firstStop = covers.current && !untrack(writing) ? "open" : "lower";
      snap = untrack(() => values[firstStop]);
    }
  });
  /** Where vaul starts the sheet: at its snap when it comes out of the button. */
  const initial = $derived.by(() => {
    if (!fromButton) {
      return;
    }
    const at = values[firstStop];
    const shown =
      typeof at === "number" ? hostHeight * at : Number.parseFloat(at);
    return `${hostHeight - shown}px`;
  });
  $effect(() => {
    const request = cawco.previewRequests[instanceId];
    if (request !== undefined && placed) {
      untrack(() => {
        snap = values[writing() ? "lower" : restStop()];
      });
    }
  });
  $effect(() => {
    const node = content;
    const frame = host;
    if (!node) {
      return;
    }
    // The lower stop's floor is the top of the composer standing over this
    // conversation — the tray row and the suggestion row on it — which is
    // its group's composer, drawn outside the pane; the open stop's is the
    // screen's foot it stands on, less the home indicator's room. A
    // conversation that cannot be written to has none, and both floors are
    // the pane's own foot, less the step the composer would have stood on.
    const composer = node
      .closest('[data-slot="leaf"]')
      ?.querySelector<HTMLElement>(
        ':scope > [data-slot="dock"] [data-slot="lift"]'
      )?.parentElement;
    composerNode = composer ?? undefined;
    const measure = () => {
      const box = node.getBoundingClientRect();
      const offset = Number.parseFloat(
        getComputedStyle(node).getPropertyValue("--space-4")
      );
      const composerTop = composer ? drawnTop(composer) : box.bottom - offset;
      asking = composer?.hasAttribute("data-asking") ?? false;
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
      // the lower stop is the same at the tap and once the keyboard is up.
      viewportHeight = untrack(() => visibleArea.height);
      const safeTop = frame
        ? Number.parseFloat(getComputedStyle(frame).top)
        : 0;
      // The composer stands at the foot of its pane's dock, clear of the
      // home indicator by `--safe-bottom` (0 while a keyboard covers it).
      const foot = composer?.offsetParent?.getBoundingClientRect().bottom;
      const screenFloor =
        composer && foot !== undefined
          ? foot -
            (Number.parseFloat(
              getComputedStyle(composer).getPropertyValue("--safe-bottom")
            ) || 0)
          : composerTop;
      const floor = Math.max(screenFloor, composerTop);
      hostHeight = floor - safeTop;
      aboveComposer = composerTop - safeTop;
      composerRoom = floor - composerTop;
    };
    measure();
    /**
     * The reader takes the composer (its field focused): the sheet steps
     * down to its lower stop on vaul's own curve, the composer in view to
     * write in. It climbs back only when dragged.
     */
    const toComposer = () => {
      if (placed && !onComposer && snapPoints.includes(values.lower)) {
        snap = values.lower;
      }
    };
    // A resize is read in the frame after it too (frameObserver): measured
    // in the observer's callback, the sheet's new height (its host's)
    // resized the pane in it inside that delivery, at a depth the delivery
    // had passed, and the browser reported a ResizeObserver loop. What else
    // moves the composer asks for the same frame (`remeasure`).
    const observer = frameObserver(measure);
    const remeasure = () => observer.request();
    observer.observe(node);
    // The composer's top moves with its parts (a draft growing the pill)
    // and with what it shows on rows it keeps laid out whether or not they
    // show anything: a chip arriving in the tray row, the suggestions
    // filling theirs, another conversation's tray shown, a part stepping
    // aside for an ask (its `visibility` going at the end of its fade), a
    // part rising in or going (its Svelte transition, the pill's `rise`). None
    // of those changes a box's size; each is read in the frame after it. A
    // Svelte transition runs on the Web Animations API, which fires no
    // `transitionend`: its `introend` and `outroend` are the element's own,
    // never bubbling, so they are heard on their way down (`capture`). A sheet
    // that stood while the pill rose in found no part of it drawn, and stood
    // at no height for good.
    for (const part of composer?.children ?? []) {
      observer.observe(part);
    }
    const shows = new MutationObserver(remeasure);
    if (composer) {
      shows.observe(composer, {
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
      composer.addEventListener("transitionend", remeasure);
      composer.addEventListener("introend", remeasure, { capture: true });
      composer.addEventListener("outroend", remeasure, { capture: true });
      composer.addEventListener("focusin", toComposer);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      shows.disconnect();
      composer?.removeEventListener("transitionend", remeasure);
      composer?.removeEventListener("introend", remeasure, { capture: true });
      composer?.removeEventListener("outroend", remeasure, { capture: true });
      composer?.removeEventListener("focusin", toComposer);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  });
</script>

<!-- Held by its top, as tall as the room down to the screen's foot (its
     height; on the composer, its clip takes the composer's room off its
     foot). A height between a top and a bottom is the fixed layer's container's, which
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
    class="fixed top-(--host-top) inset-x-0 z-(--layer-sheet) overflow-clip pointer-events-none clip-path-(--host-clip)"
    data-active-snap={stop}
    style:--host-top="env(safe-area-inset-top, 0px)"
    style:--host-clip={onComposer && composerRoom > 0
      ? `inset(0 0 ${composerRoom}px 0)`
      : "none"}
    style:height="{hostHeight}px"
    bind:this={host}
  ></div></Portal
>
{#if host && hostHeight}
  <!-- The kit's drawer (vaul): its content follows the finger 1:1 from the
       handle and settles on the nearest stop on vaul's own curve. The
       lowest is the one on the composer, so the page always stands at a
       usable height; the header's Close is how the preview is put away, and
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
    <!-- Kept mounted while closed (bits-ui's `forceMount`), so the page in
         it stays loaded while its conversation's tab is off screen. -->
    <Drawer.Content
      data-preview-sheet
      forceMount
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
      title="Beside the conversation"
      trapFocus={false}
      bind:ref={drawer}
    >
      <div
        data-slot="sheet"
        class="relative flex flex-1 flex-col min-h-0 pt-space-3 rounded-t-lg bg-surface-raised shadow-drawer"
        style:--sheet-hidden="{hidden}px"
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
