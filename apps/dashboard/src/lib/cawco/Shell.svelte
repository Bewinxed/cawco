<script lang="ts">
  import { detach } from "@cawco/core/detach";
  import {
    type ShellShortcut,
    shellShortcutOf,
  } from "@cawco/core/shell-shortcuts";
  import { configureWords } from "@cawco/core/words/configure";
  import { shellWords } from "@cawco/core/words/shell";
  import { sidebarWords } from "@cawco/core/words/sidebar";
  /**
   * The app chrome: the management rail on the left, a slim bar across the top,
   * and everything else underneath. Ported from mocks/v2-fleet.html (`aside` +
   * `main .top`) and mocks/v5-workspace.html (the tab strip).
   *
   * On a phone the rail is a sheet the bar's burger opens; on a desktop it is a
   * resizable column whose width is this browser's, not the fleet's.
   */
  import { flushSync, onMount, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery } from "svelte/reactivity";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { sendKept } from "#lib/cawco/kept.svelte.js";
  import { navSheet } from "#lib/cawco/motion/clock.svelte.js";
  import {
    crossOut,
    dur,
    ease,
    easeOut,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { pageIn, pageOut, route } from "#lib/cawco/motion/route.svelte.js";
  import { reflow, reflowOn } from "#lib/cawco/motion/rows.svelte.js";
  import { keepPrefs } from "#lib/cawco/prefs.js";
  import { gridView } from "#lib/cawco/workspace/grid-view.svelte.js";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { provideHangLayer } from "#lib/components/ui/hang-card/hang-layer.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { setSidebar } from "#lib/components/ui/sidebar/context.svelte.js";
  import { DRAWER_QUERY, NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconChevronLeft,
    IconSearch,
    IconSidebar,
    IconSidebarToggleLinear,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { fieldKeeps } from "#lib/utils/typing.js";
  import { browser, dev } from "$app/env";
  import { goto, onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { barGlass, type GlassCard as GlassFace } from "./bar-glass.svelte";
  import { cawco } from "./client.svelte";
  import { SECTIONS } from "./config/sections";
  import ConnectWindow from "./connect/ConnectWindow.svelte";
  import { connect } from "./connect/installs.svelte";
  import { continuing } from "./continue.svelte";
  import EdgePull from "./EdgePull.svelte";
  import FilesItem from "./files/FilesItem.svelte";
  import FilesSheet from "./files/FilesSheet.svelte";
  import { files, filesCount, followFiles } from "./files/files.svelte";
  import { findIn } from "./find/conversation-find.svelte";
  import { firstRender } from "./first-render.svelte";
  import GlassCard from "./GlassCard.svelte";
  import HubBand from "./HubBand.svelte";
  import { deviceRatio } from "./home/device-ratio.svelte";
  import { sessionName } from "./home/home-state.svelte";
  import { peekBeside } from "./home/peek.svelte";
  import { guardDrops } from "./internal-drag";
  import MachinesButton from "./MachinesButton.svelte";
  import { hangShadow } from "./motion/hung-shadow";
  import { landKey } from "./motion/keyed.svelte";
  import NeedsCaw from "./NeedsCaw.svelte";
  import Overlays from "./Overlays.svelte";
  import { hold } from "./page-marks";
  import RegionBoundary from "./RegionBoundary.svelte";
  import SessionSurface from "./SessionSurface.svelte";
  import Sidebar from "./Sidebar.svelte";
  import { runShellShortcut, shellShortcutsAre } from "./shell-shortcut";
  import NewSessionPopover from "./spawn/NewSessionPopover.svelte";
  import { newSession, spawning } from "./spawn/new-session.svelte";
  import { store, stored } from "./storage";
  import { floor } from "./visible-viewport.svelte";
  import { composerBindings } from "./workspace/composer-dock.svelte";
  import { fullSize } from "./workspace/full-size.svelte";
  import PaneTabs from "./workspace/PaneTabs.svelte";
  import { projectOfTab, tabOfPath } from "./workspace/tabs";
  import { type WorkspaceV1, workspace } from "./workspace/workspace.svelte";

  // The sidebar primitives (SidebarMenuButton etc.) call `useSidebar()` which
  // needs a context. The Shell manages its own layout (resize, mobile sheet),
  // so we provide a context that wires into the Shell's existing state.
  let sidebarOpen = $state(true);
  /**
   * The layer the hanging cards stand in: the glass's card and the session
   * card (hang-layer). One Shell to a page, so its name is its own, and the
   * ids the page's components take ($props.id) stay as they were.
   */
  const hangLayerOf = provideHangLayer("shell");
  setSidebar({
    open: () => sidebarOpen,
    setOpen: (v: boolean) => {
      sidebarOpen = v;
    },
  });

  const RAIL_KEY = "cawco-rail-width";
  /** Whether the sidebar is put away on a desk, as this browser keeps it. */
  const RAIL_HIDDEN_KEY = "cawco-rail-hidden";
  const RAIL_MIN = 216;
  const RAIL_MAX = 520;
  const clamp = (px: number) =>
    Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(px)));

  /**
   * The default width is the `c-sidebar-w` token (DESIGN.md: "228px by
   * default, the reader's own width wins"); the stylesheet draws it, and this
   * reads it back for the handle's arithmetic.
   */
  const tokenWidth = () =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-sidebar-w"
      )
    );

  let {
    children,
    /** Read from the `cawco-rail-width` cookie server-side (see
     *  +layout.server.ts) so the first paint is already the resolved width —
     *  the rail no longer renders the default and jumps on hydration. Null
     *  when the reader has no width of their own: the token's stands. */
    railWidth: initialRailWidth = null,
    /** Read from the `cawco-rail-hidden` cookie server-side, as the width is: the sidebar put away on a desk is away from the first paint. */
    railHidden: initialRailHidden = false,
  }: {
    children: import("svelte").Snippet;
    railWidth?: number | null;
    railHidden?: boolean;
  } = $props();

  // Seeded once from the server's reading; dragging owns it after that.
  let railWidth = $state<number | null>(
    untrack(() => (initialRailWidth === null ? null : clamp(initialRailWidth)))
  );
  /**
   * The width the first paint draws, the server's: the rail's
   * `--sidebar-width` falls back to it under the stored `--rail-w`. Never
   * written again: a width after it is the rail's own (`showRail`), and
   * rewritten here it would rewrite the rail's style attribute over it.
   */
  const firstWidth = untrack(() => railWidth);
  /** The width the rail is drawn at, as a number. */
  const drawnWidth = () => railWidth ?? tokenWidth();
  let railOpen = $state(false);
  /** The sidebar toggle: what invokes the phone's sheet. */
  let burger = $state<HTMLButtonElement | null>(null);
  /**
   * A glass card opened from inside the phone's sheet: the sheet closes as
   * the card opens, taking the field that invoked it, so the card is handed
   * what invoked the sheet, the burger, to give the focus back to (bar-glass
   * `invoker`, WAI-ARIA APG's dialog pattern).
   */
  function fromSheet(card: GlassFace) {
    barGlass.invoker = burger;
    railOpen = false;
    barGlass.open = card;
  }

  /**
   * The rail's width is settled before the first paint, in two places at once.
   *
   * SSR draws it from the `cawco-rail-width` cookie, and the inline script in
   * `app.html` overwrites `--rail-w` from localStorage — which is where the
   * width is actually authored, and which the server cannot read. A browser with
   * a stored width and no cookie (a fresh profile, or the pre-cookie migration)
   * used to paint the default and snap once this component mounted; now the
   * property is already right when the first pixel goes down and this only
   * adopts it.
   *
   * From here on the property is this component's: `setRail` writes it, so the
   * drag handle and the cookie and localStorage never disagree.
   */
  onMount(() => {
    const kept = Number(stored("local", RAIL_KEY));
    const own = Number.isFinite(kept) && kept > 0 ? kept : railWidth;
    if (own === null) {
      // No width of the reader's: the token's stands, and is not stored as theirs.
      railWidth = tokenWidth();
      return;
    }
    setRail(own);
  });

  /** The rail: its own width and flex-basis are what a width changes. */
  let railBox = $state<HTMLElement | null>(null);

  /**
   * Show a width: written on the rail itself, as its own width and
   * flex-basis, which nothing inherits. `--rail-w` on the root is the first
   * paint's alone (app.html sets it before the body parses, and the rail's
   * `--sidebar-width` resolves through it until this writes over it): a
   * custom property on the root is inherited by the whole document, so
   * writing it again restyled every element on the page (a rail drag's
   * release on conversation-frames: 1,794 elements, 105ms at 4x).
   */
  function showRail(px: number) {
    railWidth = clamp(px);
    if (railBox) {
      railBox.style.width = `${railWidth}px`;
      railBox.style.flexBasis = `${railWidth}px`;
    }
  }

  /**
   * Remember the width the reader settled on. Called once, when they let go.
   *
   * Separated from showing it because these writes are not cheap where it
   * matters: localStorage is synchronous, in WebKit a round trip to another
   * process, and the server's copy is a request. Doing them per
   * `pointermove` — 120 a second on an iPad — is what made dragging this
   * handle unusable on one, while staying fast enough on a desktop to hide.
   * The width is a preference; it is worth storing when it stops changing,
   * not while it is changing.
   */
  function rememberRail() {
    store("local", RAIL_KEY, String(railWidth));
    // +layout.server.ts renders the first paint at this width (prefs.ts).
    keepPrefs({ "cawco-rail-width": String(railWidth) });
  }

  /** Both, for the callers that change the width one step at a time. */
  function setRail(px: number) {
    showRail(px);
    rememberRail();
  }

  /**
   * Dragging the handle writes the width onto the rail itself, not through
   * `--rail-w`.
   *
   * `--rail-w` lives on the root so that the inline script in `app.html` can
   * set it before the body parses, and that is the right home for a value
   * settled once. It is the wrong one for a value changing every frame: a
   * custom property on the root is inherited by the whole document, so each
   * write invalidates every element's style, and the transcript's and the
   * panes' ResizeObservers all fire behind it. Measured on this page in
   * WebKit, per frame of a drag:
   *
   *   root `--rail-w`              682 ms   1050 ResizeObserver entries
   *   shell `--sidebar-width`      557 ms    960
   *   rail's own width              74 ms    733
   *
   * against 17 ms for a frame that forces layout and changes nothing. The
   * rail's width and flex-basis are the two things that actually have to
   * change, so they are set directly and the cascade is left out of it, on
   * every frame of the drag and on release (`showRail`).
   *
   * `railWidth` is NOT written while dragging: it is what `aria-valuenow`
   * says, and a state write a frame would render the slider for nothing. It
   * catches up on release.
   */
  function startDrag(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    // The grip is a child of the rail it resizes.
    const rail = handle.parentElement as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    // Coalesced to a frame: a 120 Hz pointer emitting two moves in one frame
    // would otherwise pay for the layout twice and show one of them.
    let frame = 0;
    let latest = drawnWidth();
    const paint = () => {
      frame = 0;
      latest = clamp(latest);
      rail.style.width = `${latest}px`;
      rail.style.flexBasis = `${latest}px`;
    };
    const move = (e: PointerEvent) => {
      latest = e.clientX;
      frame ||= requestAnimationFrame(paint);
    };
    const stop = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      setRail(latest);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  /**
   * A key steps the width, and the step is a tween: the rail goes from the
   * width it is drawn at (a step still in flight included) to the new one
   * over --dur-control, so held arrows glide instead of stuttering. The
   * pointer drag above stays 1:1: it writes the width directly and nothing
   * tweens it.
   */
  let railStep: Animation | undefined;
  function resizeKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 32 : 8;
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = drawnWidth() - step;
        break;
      case "ArrowRight":
        next = drawnWidth() + step;
        break;
      case "Home":
        next = RAIL_MIN;
        break;
      case "End":
        next = RAIL_MAX;
        break;
      default:
        return;
    }
    event.preventDefault();
    const rail = (event.currentTarget as HTMLElement)
      .parentElement as HTMLElement;
    const from = rail.getBoundingClientRect().width;
    railStep?.cancel();
    setRail(next);
    const to = drawnWidth();
    if (motionOk.current && from !== to) {
      railStep = rail.animate(
        [
          { width: `${from}px`, flexBasis: `${from}px` },
          { width: `${to}px`, flexBasis: `${to}px` },
        ],
        { duration: dur("--dur-control"), easing: ease("--ease-out") }
      );
    }
  }

  /**
   * The sidebar put away on a desk, kept per browser and for the server's
   * first paint. Its one toggle (`rail-toggle`) stands in the shell's top
   * leading corner whether the sidebar stands or is away.
   */
  let railHidden = $state(untrack(() => initialRailHidden));
  /** The rail on its way out: drawn over the page, out of its layout, as it slides. */
  let railLeaving = $state(false);
  /** The page beside the rail: it slides as the rail does. */
  let mainBox = $state<HTMLElement | null>(null);
  /** The top bar, a reflow container: it makes the toggle's room (`reflowOn`). */
  let topBar = $state<HTMLElement | null>(null);
  /** The sidebar toggle's corner: its glyph and its glass turn on the slide's clock. */
  let railCorner = $state<HTMLElement | null>(null);
  let railMoves: Animation[] = [];

  /**
   * Hides or shows the sidebar. The page is laid out at its new width once,
   * and then only transforms move: the rail slides between
   * `translateX(-100%)` and its place (mirrored right to left) and the page
   * slides from where it was drawn to its own place, on one curve both
   * ways, `--ease-drawer`: showing is an entrance, over `--dur-panel`;
   * hiding is the rail's exit, over the shorter `--dur-panel-exit`
   * (DESIGN.md, The Fast Exit Rule). A press
   * mid-slide turns both back from where they are drawn, never from the
   * slide's start (The Interruptible Rule). The rail's width and the page's
   * place are never animated: each frame of that laid out the transcript
   * and the panes. With less motion the rail fades instead.
   *
   * The toggle never moves (macOS's sidebar toggle): the rail and the page
   * slide out from under it, its glass forms round it or fades away, and
   * its glyph's chevron turns to point out of the panel or back into it,
   * the two its own transitions, all on the slide's clock from the frame of
   * the press
   * (`railTurn`). The top bar makes room for it, or closes it, as a reflow
   * (`data-flip`). What is drawn is read before the press changes
   * anything, on the last frame's layout.
   */
  function toggleRail(): void {
    const rail = railBox;
    const main = mainBox;
    const hide = !railHidden;
    // The one start everything this press moves runs from: the frame the
    // press came in, so the first frame drawn after it already shows them
    // under way together, whatever that frame costs.
    const start = Number(document.timeline.currentTime);
    const rtl = main ? getComputedStyle(main).direction === "rtl" : false;
    // Where the rail and the page are drawn now, mid-slide or at rest; a
    // rail put away is not drawn at all.
    const railWas = drawnLeft(rail);
    const mainWas = drawnLeft(main);
    for (const move of railMoves) {
      move.cancel();
    }
    railMoves = [];
    railHidden = hide;
    railLeaving = hide && motionOk.current && rail !== null && main !== null;
    // The page takes its new width in this one layout, before anything moves.
    flushSync();
    store("local", RAIL_HIDDEN_KEY, hide ? "1" : "0");
    keepPrefs({ "cawco-rail-hidden": hide ? "1" : null });
    // Each slides from where it was drawn to where it now rests.
    const starts = {
      rail: offFrom(rail, railWas),
      main: offFrom(main, mainWas) ?? 0,
    };
    railTurn(hide, start);
    // The top bar makes or closes the toggle's room on the slide's clock.
    if (topBar && motionOk.current) {
      reflowOn(topBar, { start, ...railClock(hide) });
    }
    if (!(rail && main)) {
      return;
    }
    if (!motionOk.current) {
      if (!hide) {
        railMoves = [
          rail.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: dur("--dur-fade"),
            easing: ease("--ease-out"),
          }),
        ];
      }
      return;
    }
    railMoves = slideRail(rail, main, hide, rtl, starts);
    // Out of the page's way once its own slide away has ended: a slide a
    // later press cancelled leaves that press's state as it set it.
    const [slide] = railMoves;
    const gone = () => {
      if (hide && railMoves[0] === slide) {
        railLeaving = false;
      }
    };
    slide?.finished.then(gone, gone);
    fromStart(railMoves, start);
  }

  /** Every run started at `start` on the document timeline: one clock. */
  const fromStart = (runs: Animation[], start: number) => {
    for (const run of runs) {
      run.startTime = start;
    }
  };

  /** Where an element's leading box edge is drawn, its slide included; null when it is not drawn. */
  const drawnLeft = (node: HTMLElement | null): number | null => {
    const rect = node?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect.left : null;
  };

  /** How far from its place an element was drawn at `was` (`drawnLeft`), read where it now rests. */
  const offFrom = (node: HTMLElement | null, was: number | null) =>
    node && was !== null ? was - node.getBoundingClientRect().left : null;

  /**
   * The sidebar's slide, which the toggle's glyph and glass share: hiding
   * is its exit, showing its entrance (DESIGN.md, The Fast Exit Rule).
   */
  const railClock = (hide: boolean) =>
    hide
      ? { duration: dur("--dur-panel-exit"), easing: ease("--ease-drawer") }
      : { duration: dur("--dur-panel"), easing: ease("--ease-drawer") };

  /**
   * The toggle's chevron turning and its glass fading (the corner's own CSS
   * transitions, started by the press's new state) put on the slide's
   * clock: its start, its length and its curve. A turn turned back mid-way
   * would otherwise run back only as far as CSS shortens a reversed
   * transition.
   */
  function railTurn(hide: boolean, start: number): void {
    const runs = (railCorner?.getAnimations({ subtree: true }) ?? []).filter(
      (run) =>
        run instanceof CSSTransition &&
        (run.transitionProperty === "opacity" ||
          run.transitionProperty === "rotate")
    );
    const clock = railClock(hide);
    for (const run of runs) {
      run.effect?.updateTiming(clock);
    }
    fromStart(runs, start);
  }

  /**
   * The rail and the page slide from `starts` (px off their places, as
   * drawn when pressed; a rail that was not drawn starts put away) to their
   * places, the rail to its place or away.
   */
  function slideRail(
    rail: HTMLElement,
    main: HTMLElement,
    hide: boolean,
    rtl: boolean,
    starts: { main: number; rail: number | null }
  ): Animation[] {
    const timing = railClock(hide);
    const away = `translateX(${rtl ? 100 : -100}%)`;
    const railFrom =
      starts.rail === null ? away : `translateX(${starts.rail}px)`;
    return [
      rail.animate(
        [{ transform: railFrom }, { transform: hide ? away : "none" }],
        timing
      ),
      main.animate(
        [{ transform: `translateX(${starts.main}px)` }, { transform: "none" }],
        timing
      ),
    ];
  }

  // The sheet is a place you go through, not one you stay in. It leaves as
  // the navigation it started swaps the page, in the same frame, rather than
  // after the new page has arrived.
  onNavigate(({ shallow }) => {
    if (shallow) {
      return;
    }

    railOpen = false;
  });

  /**
   * The shell's shortcuts (core `SHELL_SHORTCUTS`), from the dashboard's own
   * keys or forwarded from an artifact's page (shell-shortcut.ts): whether
   * it acted.
   */
  function act(name: ShellShortcut): boolean {
    switch (name) {
      case "new-session":
        newSession();
        return true;
      // ⌘K opens and closes Jump (GlassCard's surface brief, on the glass's cards).
      case "jump":
        barGlass.toggle("jump");
        return true;
      // Split the focused group, putting the conversation in front into the
      // new half. `mod+\` is the binding VS Code uses for exactly this, and
      // this is a straight copy of that model — borrowing the gesture's name
      // too costs nothing and saves the reader learning a second one.
      case "split-right":
      case "split-down": {
        const here = workspace.activeTab;
        if (!(onSession && here && workspace.openTabs.length >= 2)) {
          return false;
        }
        workspace.split(
          workspace.focusedLeafId,
          name === "split-down" ? "bottom" : "right",
          here
        );
        return true;
      }
      default:
        return false;
    }
  }
  $effect(() => shellShortcutsAre(act));

  /**
   * The conversation Command-F finds in: the one the keyboard is in (its
   * pane or its composer, `data-find-view`), else the workspace's tab in
   * front, else the one conversation on screen (Caw's panel over a project's
   * page); none, and the browser's own find takes the key.
   */
  function findView(): string | null {
    const at =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.closest<HTMLElement>("[data-find-view]")
            ?.dataset.findView
        : undefined;
    if (at) {
      return at;
    }
    const front = workspace.activeTab;
    if (onSession && front && composerBindings.has(front)) {
      return front;
    }
    const shown = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="pane"][data-find-view]'
      ),
    ].filter((pane) => pane.checkVisibility());
    return shown.length === 1 ? (shown[0]?.dataset.findView ?? null) : null;
  }

  /**
   * Command-F finds in a conversation (`findView`); pressed again, it closes
   * find. A key: what it opens lands at once (motion/keyed). Never forwarded
   * from an artifact's page, whose own find it is.
   */
  function findKey(event: KeyboardEvent): boolean {
    if (
      !(event.metaKey || event.ctrlKey) ||
      event.shiftKey ||
      event.altKey ||
      event.key.toLowerCase() !== "f" ||
      event.defaultPrevented
    ) {
      return false;
    }
    const viewId = findView();
    if (!viewId) {
      return false;
    }
    event.preventDefault();
    landKey();
    findIn(viewId).toggle();
    return true;
  }

  /**
   * A shell combo (each one a ⌘ or Ctrl chord) is the shell's from anywhere,
   * a text field included, as an artifact's page leaves it (preview-overlay
   * page.ts): the field gets first claim, and one it handled
   * (`defaultPrevented`) stays its own. On Apple's systems ⌃ in a field is
   * the field's text key (`fieldKeeps`).
   */
  function shortcut(event: KeyboardEvent) {
    // Escape takes Full size back, where nothing nearer took the key (an
    // open menu or card, a field's own Escape).
    if (
      event.key === "Escape" &&
      full &&
      !event.defaultPrevented &&
      !fieldKeeps(event)
    ) {
      event.preventDefault();
      fullSize.exit();
      return;
    }
    if (findKey(event)) {
      return;
    }
    const name = shellShortcutOf(event);
    if (!name || event.defaultPrevented || fieldKeeps(event)) {
      return;
    }
    if (runShellShortcut(name)) {
      event.preventDefault();
    }
  }

  /**
   * Whether the workspace is in front: the board, a conversation's tab or a
   * project's (workspace/tabs.ts `tabOfPath`), read off the URL shown, as
   * the workspace moves between them shallowly. A route's own failure (a
   * project the hub would not read) is its error page, not the workspace.
   */
  const onSession = $derived(
    !(page.error && !page.error.region) &&
      tabOfPath((page.shallow?.url ?? page.url).pathname) !== undefined
  );
  // "Spawn here" from anywhere in the app arrives as `?spawn=<machine>`;
  // consumed once and cleared, so a reload is not a second spawn.
  $effect(() => {
    const machineId = page.url.searchParams.get("spawn");
    if (!machineId) {
      return;
    }
    untrack(() => {
      newSession({
        machineId,
        cwd: page.url.searchParams.get("cwd") ?? undefined,
      });
      const url = new URL(page.url.href);
      url.searchParams.delete("spawn");
      url.searchParams.delete("cwd");
      // The dialog has the focus by now: a navigation hands it to <body>
      // unless told to leave it alone (SvelteKit 3's `reset: false`, which
      // leaves the scroll where it is too).
      detach(goto(url, { replace: true, reset: false }), "goto");
    });
  });
  /**
   * The session surface (board, groups, panes) is mounted the first time a
   * `/session` page shows and never again after that: under another spoke it
   * is parked, still laid out but hidden and inert, so coming back finds
   * every transcript scrolled and every disclosure open as it was left.
   */
  /**
   * Full size (workspace/full-size.svelte.ts): the project in front fills
   * the window, the rail and the bar put away. It ends by itself once no
   * project is in front.
   */
  const full = $derived(
    fullSize.on && onSession && projectOfTab(workspace.activeTab) !== null
  );
  $effect(() => {
    if (fullSize.on && !full) {
      untrack(() => fullSize.exit());
    }
  });
  /**
   * The page the rail and the bar leave room for glides to where it stands
   * now, from where it stood: its box is read before the change is drawn
   * and after, and the page travels the difference on the drawer curve
   * over --dur-panel (motion/route's page travel). It is one object on both
   * sides (DESIGN.md, The One Object Rule); the rail and the bar fade as
   * they go and come. With less motion, the page only fades.
   */
  let content = $state<HTMLElement | null>(null);
  let fullFrom: DOMRect | null = null;
  $effect.pre(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency
    void full;
    fullFrom = untrack(() => content?.getBoundingClientRect() ?? null);
  });
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency
    void full;
    const from = fullFrom;
    const node = untrack(() => content);
    if (!(from && node)) {
      return;
    }
    const to = node.getBoundingClientRect();
    const timing = {
      duration: dur("--dur-panel"),
      easing: ease("--ease-drawer"),
    };
    if (!motionOk.current) {
      node.animate([{ opacity: 0.6 }, { opacity: 1 }], timing);
      return;
    }
    if (from.left !== to.left || from.top !== to.top) {
      node.animate(
        [
          {
            transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`,
          },
          { transform: "none" },
        ],
        timing
      );
    }
  });
  let surfaceMounted = $state(untrack(() => onSession));
  $effect(() => {
    if (onSession) {
      surfaceMounted = true;
    }
  });

  /**
   * Parking the surface moves it the way the route moves (motion/route): out
   * with the page it leaves with, back in with the page it arrives with, on
   * the plan `onNavigate` wrote. Input leaves it at once; it is hidden only
   * once it has travelled out, and shown before it travels back. With less
   * motion it only fades, over --dur-control.
   */
  function travelOf(showing: boolean) {
    if (!motionOk.current) {
      return { end: { x: 0, y: 0, opacity: 0 }, ms: dur("--dur-control") };
    }
    const { enter, leave, over } = route.travel;
    return { end: showing ? enter : leave, ms: dur(over) };
  }

  function park(shown: () => boolean) {
    return (node: HTMLElement) => {
      let seen = untrack(shown);
      let travelling: Animation | undefined;

      const move = (showing: boolean) => {
        const drawn = getComputedStyle(node);
        const from: Keyframe = {
          transform: drawn.transform,
          opacity: drawn.opacity,
        };
        travelling?.cancel();
        node.inert = !showing;
        node.removeAttribute("data-parked");
        const { end, ms } = travelOf(showing);
        const away: Keyframe = {
          transform: `translate(${end.x}%, ${end.y}%)`,
          opacity: end.opacity,
        };
        const settled: Keyframe = { transform: "none", opacity: 1 };
        const animation = node.animate(
          showing ? [away, settled] : [from, away],
          {
            duration: ms,
            easing: ease("--ease-drawer"),
            fill: "forwards",
          }
        );
        travelling = animation;
        animation.finished.then(
          () => {
            if (travelling !== animation) {
              return;
            }
            node.toggleAttribute("data-parked", !showing);
            animation.cancel();
            travelling = undefined;
          },
          () => {
            /* the reader turned back mid-travel; the next one starts from here */
          }
        );
      };

      $effect(() => {
        const next = shown();
        untrack(() => {
          if (next !== seen) {
            seen = next;
            move(next);
          }
        });
      });
    };
  }
  /** What a page swap is keyed on: every conversation and all of Configure are one page each here. */
  const pageKey = $derived.by(() => {
    const path = page.url.pathname;
    if (onSession) {
      return "session";
    }
    return path.startsWith("/config") ? "config" : path;
  });

  /* ── The tabs, in the bar ──────────────────────────────────────────
     A workspace that is one group has one strip, and the bar is where it
     goes: the crumb it replaces said "Fleet" on every conversation, which
     told the reader nothing the rail did not. A split keeps a strip per
     group, on the group; a phone keeps its own row too, since the bar there
     is the burger's. The same width line the session layout draws — and, on
     the server, the same cookie — so the bar and the groups agree on who
     draws the tabs before anything is painted. */
  // The first render on both sides draws the tree the server drew
  // (workspace.svelte.ts, Persistence): hydration keeps every tab it drew,
  // the URL's conversation among them (the server placed it in the
  // cookie's tree), so a menu opened on that tab before hydration stays
  // with it. The URL is the address, and the browser follows it before
  // anything is drawn, as the server did; unless the server landed the
  // board's address on what a desk puts in front, whose address the
  // workspace writes in its place.
  const landed = workspace.serve(
    (page.data as { workspace?: WorkspaceV1 | null }).workspace ?? null,
    (page.data as { resolved?: string[] }).resolved ?? [],
    (page.data as { landed?: string[] }).landed ?? []
  );
  if (browser && !landed) {
    workspace.followUrl(location.href);
  }
  // Once the first paint is up, the page's own answers: the tree
  // localStorage keeps and the media queries (first-render.svelte.ts). In
  // a task after the frame, so the strip has had its first frame and moves
  // to the tree as it does for any change; at once in a hidden page, which
  // draws no frame.
  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      firstRender.release();
      workspace.restore();
      sendKept();
    };
    if (document.hidden) {
      release();
      return;
    }
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(release);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  });
  const narrowQuery = new MediaQuery(NARROW_QUERY);
  const narrow = $derived(
    firstRender.held ? Boolean(page.data.narrow) : narrowQuery.current
  );

  /* ── One rail ────────────────────────────────────────────────────────
     The server cannot know the width, so it always draws the rail and the
     styles hide it under the drawer's line: a wide screen's first paint is
     the rail, a phone's is without it, and neither waits for a script. In
     the browser only the rail that is shown is mounted: the wide screen's
     at the drawer's line and over, the drawer's under it, and neither is
     hydrated, measured or animated while it is not drawn. A rail that was
     left mounted and hidden opened every tree the drawer opened, with no
     layout to open it in. What a rail shows is kept outside it (which trees
     are open, the row in front, the dialog it starts a session in), and the
     wide screen's scroll is kept here, so crossing the line either way
     brings it back as it was left.

     The one part the first client render draws other than the server did,
     on purpose: under the drawer's line the server's rail (hidden there by
     its `hidden desk:flex`) is dropped as the page hydrates, through
     Svelte's block repair, rather than hydrated for a frame. It is stored
     nowhere, so nothing the reader kept is lost, and it is never seen. The
     probe kit holds it to that (tabs-region-errors (g)). */
  const drawerQuery = new MediaQuery(DRAWER_QUERY);
  const railed = $derived(browser ? !drawerQuery.current : true);

  /**
   * The shadow of every card hanging from the glass (HangCard `glass`),
   * drawn ahead of any press (motion/hung-shadow): a picture of
   * `--shadow-overlay-hung` round its corners, the glass's trailing flank
   * square (HangCard's `glass` recipe), drawn again for a new scheme or
   * device ratio.
   */
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependencies
    void [theme.resolved, deviceRatio.current];
    const corner = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--radius-lg")
    );
    hangShadow("[data-glass-card]", "--shadow-overlay-hung", [
      corner,
      0,
      corner,
      corner,
    ]).catch((error: unknown) => {
      console.error("The glass's card shadow did not draw", error);
    });
  });

  /**
   * The sheet's own open state, published for the clocks under it: an elapsed
   * label nobody can see does not tick or morph (motion/clock). It is the state
   * the `Sheet.Root` below already binds, read by the clocks rather than kept
   * twice.
   */
  $effect(() => {
    navSheet.open = railOpen && !railed;
  });

  /** Where each of the rail's scroll boxes stood, by name ("" its own). */
  const railScroll = new Map<string, number>();
  const nameOf = (box: HTMLElement) => box.dataset.keepScroll ?? "";
  /** Puts the wide screen's rail back where it was scrolled to, and keeps up with it. */
  const keepScroll: Attachment<HTMLElement> = (node) => {
    for (const box of [
      node,
      ...node.querySelectorAll<HTMLElement>("[data-keep-scroll]"),
    ]) {
      box.scrollTop = railScroll.get(nameOf(box)) ?? 0;
    }
    // Scrolls do not bubble; they are heard on their way down.
    const heard = ({ target }: Event) => {
      const box = target as HTMLElement;
      if (box === node || box.dataset.keepScroll !== undefined) {
        railScroll.set(nameOf(box), box.scrollTop);
      }
    };
    const options = { capture: true, passive: true } as const;
    node.addEventListener("scroll", heard, options);
    return () => node.removeEventListener("scroll", heard, options);
  };

  $effect(() => {
    // Kept for the server's next render (prefs.ts), on every route, so its
    // answer is the one the page last used, orientation included — `/config`
    // decides list-or-section by it. Not the server's own, sent back while
    // the first paint holds it.
    if (firstRender.held) {
      return;
    }
    keepPrefs({ "cawco-narrow": narrow ? "1" : "0" });
  });
  /** The groups whose tabs the bar carries, once the session has shown, on any route: those along the workspace's top edge. */
  const barLeaves = $derived(surfaceMounted && !narrow ? gridView.tops : []);
  /** Groups to tell apart: the focus rail marks one of two or more. */
  const groupsApart = $derived(barLeaves.length >= 2);
  /** Whether the bar shows them: on a session page. */
  const hosting = $derived(onSession && barLeaves.length > 0);
  /**
   * The route's own failure, the one its +error page shows. `page.error`
   * also carries an error one part of the page held in its boundary
   * (SvelteKit 3 sets it from every boundary's catch), and that one changes
   * nothing outside its part (region-held.ts).
   */
  const routeError = $derived(
    page.error && !page.error.region ? page.error : null
  );
  // A row or card dragged inside the page never types into a field, and a
  // file let go off a composer never opens in the tab (internal-drag.ts).
  onMount(guardDrops);

  /* ── The bar's slot ──────────────────────────────────────────────────
     The hosted tabs, a page's strip, the crumb and Configure's back link
     take turns in one slot. The one leaving is lifted out of the row where
     it stands and fades over --dur-control; the one arriving rises --pop-rise as
     it fades in over the same length, and a hosted strip comes down --pop-rise
     from the bar's edge instead. With less motion, only the fades run.
     The session's strip is the session surface's, so like the surface it
     is kept once it has been drawn: under another spoke it is lifted out
     of the row and hidden, not unmounted, and comes back as it was left.
     A page's strip has a place kept the same way, which holds whatever
     the page in front hands it. */
  const riseIn = (_node: Element) => ({
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t: number, u: number) =>
      motionOk.current
        ? `opacity: ${t}; transform: translateY(calc(var(--pop-rise) * ${u}))`
        : `opacity: ${t}`,
  });

  /**
   * Each column of the bar stands exactly over its group: its left edge and
   * width are the group's (the width held to what the bar's own controls
   * leave). They are read off the groups themselves, in the frame a size
   * observer reports a change, so whatever moves a group (a split opening, a
   * divider dragged, the window) moves its column with it, and nothing here
   * knows a size.
   *
   * It cannot loop. What it observes is the strip's box and the groups'
   * boxes; what it writes is the columns' custom properties, and a column is
   * not observed and cannot change the box of either: the strip is
   * layout-contained (`.slot-tabs`), so nothing in it reaches its own size
   * or its surroundings, and the groups are not inside the bar. A column
   * whose reading has not changed is not written at all.
   */
  /**
   * An element's left edge in the page's layout: its offsets summed up its
   * offset parents, each parent's border included. Transforms are not in it,
   * so a surface sliding in (a route's page-in) is placed where it lands, not
   * where the slide has it in the frame the column happens to be measured.
   */
  const layoutLeft = (node: HTMLElement): number => {
    let left = 0;
    for (
      let at: HTMLElement | null = node;
      at;
      at = at.offsetParent as HTMLElement | null
    ) {
      left += at.offsetLeft + (at === node ? 0 : at.clientLeft);
    }
    return left;
  };

  const followPanes: Attachment<HTMLElement> = (slot) => {
    const written = new WeakMap<HTMLElement, string>();
    /** Where each column goes, read off the groups as they are laid out. */
    const measure = (): [HTMLElement, string, string][] => {
      const areaLeft = layoutLeft(slot);
      const areaRight = areaLeft + slot.offsetWidth;
      const places: [HTMLElement, string, string][] = [];
      for (const col of slot.querySelectorAll<HTMLElement>(
        ':scope > [data-slot="col"]'
      )) {
        const group = document.querySelector<HTMLElement>(
          `[data-leaf="${col.dataset.col}"]`
        );
        if (!group) {
          continue;
        }
        // Its group's box, cut to the slot at both ends: the first
        // column starts past what leads the bar (Show sidebar).
        const left = Math.max(layoutLeft(group), areaLeft);
        const right = Math.min(
          layoutLeft(group) + group.offsetWidth,
          areaRight
        );
        places.push([
          col,
          `${left - areaLeft}px`,
          `${Math.max(0, right - left)}px`,
        ]);
      }
      return places;
    };
    const write = (places: [HTMLElement, string, string][]) => {
      for (const [col, x, w] of places) {
        if (written.get(col) === `${x} ${w}`) {
          continue;
        }
        written.set(col, `${x} ${w}`);
        // The box's own start and width, not custom properties: one of
        // those, inherited by every tab in the column, restyled them all
        // when it changed (a rail drag on nightly 7148, 151 elements a
        // frame, laid out again under the swipe's read).
        col.style.insetInlineStart = x;
        col.style.width = w;
      }
    };
    const place = () => write(measure());
    // Placed by the effect below as the groups stand; a change is measured
    // inside the delivery, on the layout the frame has just done, and
    // written in the next frame (frameObserver `read`). Measured in the next
    // frame's callbacks instead, it laid the page out there on every frame
    // of a rail drag, under the other callbacks' writes.
    let measured: [HTMLElement, string, string][] = [];
    const sizes = frameObserver(() => write(measured), {
      read: () => {
        measured = measure();
      },
    });
    sizes.observe(slot);
    // A column that comes or goes is a group that does: watch the groups the
    // columns stand over.
    $effect(() => {
      const groups = barLeaves.flatMap((leaf) => {
        const group = document.querySelector(`[data-leaf="${leaf.id}"]`);
        return group ? [group] : [];
      });
      for (const group of groups) {
        sizes.observe(group);
      }
      place();
      return () => {
        for (const group of groups) {
          sizes.unobserve(group);
        }
      };
    });
    return () => sizes.disconnect();
  };

  function barTabs(shown: () => boolean) {
    return (node: HTMLElement) => {
      let seen = untrack(shown);
      let fading: Animation | undefined;
      // One mounted hidden stands out of the row, as one that has left does.
      // Gone, it is not drawn: `data-shell-away`, which the probe kit reads
      // too (data-away is a selector's already).
      node.toggleAttribute("data-shell-lifted", !seen);
      node.toggleAttribute("data-shell-away", !seen);
      node.inert = !seen;
      $effect(() => {
        const next = shown();
        untrack(() => {
          if (next === seen) {
            return;
          }
          seen = next;
          fading?.cancel();
          node.inert = !next;
          const timing = {
            duration: dur("--dur-control"),
            easing: ease("--ease-out"),
          };
          if (next) {
            node.removeAttribute("data-shell-lifted");
            node.removeAttribute("data-shell-away");
            fading = node.animate(
              motionOk.current
                ? [
                    {
                      opacity: 0,
                      transform: "translateY(calc(-1 * var(--pop-rise)))",
                    },
                    { opacity: 1, transform: "none" },
                  ]
                : [{ opacity: 0 }, { opacity: 1 }],
              timing
            );
            return;
          }
          node.toggleAttribute("data-shell-lifted", true);
          const out = node.animate([{ opacity: 1 }, { opacity: 0 }], {
            ...timing,
            fill: "forwards",
          });
          fading = out;
          out.finished.then(
            () => {
              if (fading === out) {
                node.toggleAttribute("data-shell-away", true);
                out.cancel();
              }
            },
            () => {
              /* shown again before it had gone */
            }
          );
        });
      });
    };
  }

  /* ── The phone's one row ─────────────────────────────────────────────
     Under the drawer's line the bar is one row: the sidebar toggle, then
     the tabs, then Caw's head (NeedsCaw). Search and Machines are in the
     sidebar, and there is no title: the tabs say where you are. With a
     conversation in front the group's own tab strip is that row, and the
     bar floats over its two ends (the strip leaves them room); anywhere
     else the bar is the row, with the page's name where tabs would be. */
  const floating = $derived(
    !railed && onSession && workspace.activeTab !== null
  );
  /**
   * The bar floats over the page (DESIGN.md, The Title Bars Follow Liquid
   * Glass Rule: "content runs to the top edge and the scroll edge effect
   * blurs it under the controls"): wherever it hosts no conversation's
   * tabs and floats over none of theirs, the page runs to the content's top
   * beneath it, its scroller padding its top by the bar's height. Hosting
   * the tabs on a desk it is their shelf, the chosen tab a sheet of the
   * conversation under it (DESIGN.md, Shapes, Folder tabs).
   */
  const under = $derived(!(full || floating || hosting));
  /* What the bar is, floating or hosting the tabs, said on the root for the
     screen's top edge (ScreenEdges, page-marks). */
  $effect(() => {
    const releases = [
      floating && hold("root", "data-bar", "floating"),
      hosting && hold("root", "data-bar", "hosting"),
    ];
    return () => {
      for (const release of releases) {
        if (release) {
          release();
        }
      }
    };
  });

  /* The home's Check machines opens the machines where a phone keeps them:
     the sidebar. */
  $effect(() => {
    if (!railed && barGlass.open === "machines") {
      untrack(() => {
        barGlass.open = null;
        railOpen = true;
      });
    }
  });

  /**
   * Files follows the conversation on screen:
   * the bar's item and the phone's sidebar row count it, and its card and
   * its drawer hold it. None closes the drawer.
   */
  const filesSession = $derived(
    onSession && workspace.activeSessionId ? workspace.activeSessionId : null
  );
  $effect(() => {
    const id = filesSession;
    untrack(() => {
      if (files.session !== id) {
        files.sheet = files.sheet && id !== null;
      }
      files.session = id;
    });
  });
  $effect(() => {
    followFiles(files.session);
  });
  // Files is a card of the wide bar's glass, and a drawer on a phone: one
  // asked for across the drawer's line goes where that width keeps it.
  $effect(() => {
    if (!railed && barGlass.open === "files") {
      untrack(() => {
        barGlass.open = null;
        files.sheet = true;
      });
    }
  });
  // Read off the conversation on screen, not the store the effect above
  // writes: the server draws the bar's Files item with the conversation.
  const filesCounted = $derived(filesSession ? filesCount(filesSession) : null);
  /**
   * Add machine's window, opened from the machines in the phone's sheet (a
   * way in, an install's row): the sheet goes as its drawer rises, and the
   * window gives the focus back to what invoked the sheet, the burger.
   */
  $effect(() => {
    if (!connect.open) {
      return;
    }
    untrack(() => {
      if (railOpen && !railed) {
        if (connect.anchor?.closest("[data-rail-sheet]")) {
          connect.anchor = burger;
        }
        railOpen = false;
      }
    });
  });

  /**
   * The New Session form, opened from the phone's sheet (its header's Start
   * session, the Working list's empty state, a project's +): the sheet goes
   * as the form's sheet rises, as it does for Add machine, so one modal
   * stands at a time, and the form gives the focus back to the burger.
   */
  $effect(() => {
    if (!(spawning.open || continuing.source !== null)) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: read-only dependency, a reopen while open
    void spawning.opening;
    untrack(() => {
      if (railOpen && !railed) {
        if (!spawning.anchor || spawning.anchor.closest("[data-rail-sheet]")) {
          spawning.anchor = burger;
        }
        railOpen = false;
      }
    });
  });

  /** Files' drawer, from the sidebar's row: the sidebar goes as it rises. */
  function openFilesSheet() {
    files.returnTo = burger;
    railOpen = false;
    files.sheet = true;
  }

  /**
   * What the bar names: the page's own name where it has one (a
   * conversation's title, a project's name), else its section.
   */
  /** The Configure section the page is in, named in a phone's bar beside Back. */
  const configSection = $derived(
    SECTIONS.find((one) => one.slug === page.url.pathname.split("/")[2])
      ?.label ?? null
  );
  const crumb = $derived.by(() => {
    // A path nothing answers is not a section: the bar says what happened.
    if (routeError) {
      return page.status === 404 ? "Not found" : "Error";
    }
    // The URL shown: a shallow move between conversations (workspace
    // `project`) leaves `page.url` where the route was entered.
    const [section, id] = (page.shallow?.url ?? page.url).pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    switch (section) {
      case undefined:
        return "Fleet";
      case "session":
        return sessionName(id);
      case "project":
        if (id === "new") {
          return "New project";
        }
        return (id ? cawco.project(id)?.name : undefined) ?? "Project";
      // Configure's rail names Configure and the section chosen in it: the
      // bar repeats neither (DESIGN.md, The Title Bars Follow Liquid Glass
      // Rule); on a phone, where the rail is a page of its own, the bar
      // leads Back to it with the section's name (configSection).
      case "config":
        return "";
      case "usage":
        return "Usage";
      // The MCP server sign-in's return (its page: "Finishing sign-in").
      case "oauth":
        return "MCP sign-in";
      // The motion benches (`vite dev` and the probe kit's bench build), and
      // the dev benches in the shell.
      case "motion":
      case "dev":
        return "Bench";
      default:
        // Every route under the app's layout has its name above, and a path
        // nothing answers is the route's error ("Not found"). A route added
        // without one says so at once in dev, never a capitalised slug
        // ("Oauth"); a shipped bar names nothing rather than guess.
        if (dev) {
          throw new Error(
            `The bar has no name for /${section}: add it to Shell's crumb`
          );
        }
        return "";
    }
  });
</script>

<svelte:window onkeydown={shortcut} />

<a
  data-slot="skip"
  class="sr-only z-(--layer-skip) rounded-sm bg-surface-raised px-space-4 py-space-2 shadow-tile focus:not-sr-only focus:absolute focus:start-space-4 focus:top-space-4"
  href="#main-content">Skip to content</a
>

<!-- `--rail-w` is set before the body parses (app.html) from the same key this
     component writes; the server's cookie width is the fallback under it, and
     the `c-sidebar-w` token under that when the reader has none. SSR
     therefore emits no committed width of its own, and there is nothing to
     snap away from on hydration. -->
<!-- The tooltip provider and the lightbox, shared with an artifact's own tab. -->
<Overlays>
  <!-- As tall as the visible area reaches, so the composer and a page's
       footer stand on a keyboard (cawco/visible-viewport `floor`). As wide
       as the window, it is the `shell` container the bar's glass takes its
       form from (BarGlass `@max-desk/shell`): the bar beside a docked rail
       is narrower than the window, so it could not be. `data-first-paint`
       while it still draws the server's answers (first-render.svelte.ts),
       until the release a frame after mount; `data-first-render` from that
       release on, the page drawing its own answers (what the probe kit's
       page-ready waits for). -->
  <div
    data-slot="shell"
    data-first-paint={firstRender.held || undefined}
    data-first-render={!firstRender.held || undefined}
    class="@container/shell relative flex h-dvh w-full bg-surface-recess overflow-hidden"
    style:height={floor.bottom > 0 ? `${floor.bottom}px` : null}
  >
    <!-- The rail holds the screen's leading edge, so it keeps a landscape
         notch's inset clear inside its own width, in the sidebar's ground:
         its outer edge stays where a drag puts it (`startDrag`). -->
    <aside
      data-slot="rail"
      data-full={full || undefined}
      data-away={(railHidden && !railLeaving) || undefined}
      data-leaving={railLeaving || undefined}
      class="hidden desk:flex data-full:hidden data-away:hidden relative data-leaving:absolute data-leaving:inset-y-0 data-leaving:start-0 data-leaving:z-10 w-(--sidebar-width) grow-0 shrink-0 basis-(--sidebar-width) min-w-0 ps-(--rail-inset) bg-(--sidebar) border-e border-e-border-hairline"
      style="--sidebar-width: var(--rail-w, {firstWidth === null
        ? 'var(--c-sidebar-w)'
        : `${firstWidth}px`})"
      style:--rail-inset="env(safe-area-inset-left, 0px)"
      bind:this={railBox}
    >
      {#if railed}
        <RegionBoundary face="line" part="sidebar">
          <Sidebar {narrow} scroller={keepScroll} toggleRoom />
        </RegionBoundary>
      {/if}
      <!-- Drawn a grip's width on the rail's edge; under a fine pointer it
           takes presses up to its midpoint stops (DESIGN.md, The 24 Pointer
           Rule): 2px past either side, short of the rail rows' edge 8px in
           and of a stroke begun 6px into the page beside it (ink 8), which
           draws and does not resize. -->
      <div
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemax={RAIL_MAX}
        aria-valuemin={RAIL_MIN}
        aria-valuenow={railWidth}
        class="pointer-hit hit-gap-x-space-1 absolute inset-y-0 end-0 w-c-side-grip-w translate-x-1/2 cursor-col-resize touch-none select-none z-5 hover:bg-border-control"
        onkeydown={resizeKey}
        onpointerdown={startDrag}
        role="slider"
        tabindex="0"
      ></div>
    </aside>

    <!-- Open only under the drawer's line: widened past it while open, the
         sheet's scrim stood over the whole wide screen with nothing in it.
         Narrowed again, it is open as it was left. -->
    <Sheet.Root
      bind:open={
        () => railOpen && !railed,
        (open) => {
          railOpen = open;
        }
      }
    >
      <!-- Closed by its search field, the focus stays in the Jump palette
           it opened, which hangs from the bar's glass. Its brand row names
           it on screen, so no header row stands and the row draws the kit's
           Close as its last control, after Start session (Sidebar). -->
      <Sheet.Content
        data-rail-sheet
        class="w-c-rail-sheet-w"
        narrow
        pad="none"
        onCloseAutoFocus={(event) => {
          if (barGlass.open === "jump") {
            event.preventDefault();
          }
        }}
        side="left"
        title="Navigation"
        titleHidden
      >
        {#if !railed}
          <RegionBoundary face="line" part="sidebar">
            <Sidebar
              {narrow}
              onfiles={openFilesSheet}
              onsearch={() => fromSheet("jump")}
              sheet
            />
          </RegionBoundary>
        {/if}
      </Sheet.Content>
    </Sheet.Root>

    <!-- While the peek stands open beside the page (a fine pointer's sheet
         from the right, peek.svelte.ts `peekBeside`) the page, its bar
         included, ends where the sheet begins: what it holds (the glass
         group, a docked card) stays whole and usable beside the sheet
         (the peek's surface brief, Peek), never cut under it. -->
    <div
      data-slot="shell-main"
      class="relative flex-auto min-w-0 flex flex-col overflow-hidden data-peek-beside:pe-c-peek-sheet-w data-under:timeline-scope-transcript-head"
      data-peek-beside={peekBeside() || undefined}
      data-under={under || undefined}
      bind:this={mainBox}
    >
      <!-- The bar: the comp's height (`--c-top-bar-h`, so what floats under
           it lands under it); hosted folder tabs stand on its floor. The
           right inset is the content's right pad, so the cluster's edge
           stands over the page's; the left inset is the crumb's own, so the
           slot starts at the bar's edge whether it holds the crumb or the
           tabs. Under the narrow query (NARROW_QUERY) its first paint is the
           narrow bar already, its inset and ground. On the phone's one row
           (44px, the compact bar's) the toggle's glyph and Caw's glass each
           stand c-bar-phone-edge in from the screen's edge, inside a
           landscape notch's inset: the toggle's touch area starts at the
           screen's edge and pads its glyph in, so the row's leading pad is
           only the notch's; its trailing pad is the margin and the notch,
           and Caw's touch area reaches back across it to the screen's edge
           (each draws its focus ring inside its box, so neither ring runs
           past the screen); with a conversation in front the bar
           floats over the group's own tab row and takes only its two
           controls' touches. Hosting the tabs, the bar is the shelf they
           stand on: two steps below the transcript and one below an
           unchosen tab, so the chosen tab (a sheet in the transcript's own
           surface) reads as the page it opens. The hairline sits in the
           bar's bottom pixel, where the sheet ends and covers it. The shelf
           is the wide bar's alone (`desk:` with `not-coarse:` or
           `not-portrait:`); anywhere else the bar draws no ground of its
           own, no fill and no hairline (DESIGN.md, No bar ground): the
           field it stands on is its ground. Hosting them on a desk, its
           trailing glass stands in from the edge of the screen as far as
           the body of the first tab stands in from its pane: the flare of
           a tab (`--strip-flare` on the strip, `--radius-sm` at a desk;
           fluid-tabs Tabs.svelte), its foot running out to the edge as the
           join of the glass does, so the shelf holds one inset at both
           ends. -->
      <header
        data-slot="top"
        data-full={full || undefined}
        data-floating={floating || undefined}
        data-hosting={hosting || undefined}
        data-under={under || undefined}
        class="group/top peer/top h-c-top-bar-h shrink-0 flex data-full:hidden data-under:relative data-under:-mbe-c-top-bar-h data-under:z-(--layer-bar) data-under:pointer-events-none items-center gap-space-2 py-0 ps-0 pe-(--top-end) desk:not-coarse:data-hosting:pe-(--shelf-end) desk:not-portrait:data-hosting:pe-(--shelf-end) coarse:portrait:desk:ps-space-7 max-desk:ps-(--top-inset-start) max-desk:pe-(--top-inset-end) max-desk:data-floating:relative max-desk:data-floating:-mbe-c-top-bar-h max-desk:data-floating:z-(--layer-bar) max-desk:data-floating:pointer-events-none desk:not-coarse:data-hosting:shelf-hairline desk:not-portrait:data-hosting:shelf-hairline"
        style:--top-end="calc(var(--space-6) + env(safe-area-inset-right, 0px))"
        style:--shelf-end={"calc(var(--radius-sm) + env(safe-area-inset-right, 0px))"}
        style:--top-inset-start="env(safe-area-inset-left, 0px)"
        style:--top-inset-end={"calc(var(--c-bar-phone-edge) + env(safe-area-inset-right, 0px))"}
        {@attach reflow()}
        bind:this={topBar}
      >
        <!-- The sidebar toggle; at the 900px line the rail returns and it
             retires (`desk:hidden`). On the phone's row it is a bare
             glyph (owner, variant B): its leading edge c-bar-phone-edge from
             the screen's, its centre on the tabs' centre line, which stand
             on the bar's floor, in a 44px touch area that starts at the
             screen's edge (its glyph padded in, so the box and its focus
             ring never run past the screen) and fills the 44px bar top to
             floor: the glyph is padded down to the tabs' centre line (twice
             its drop from the box's own centre), never the box moved, so the
             box stays inside its bar. Tactile press: it dips under the finger, with
             less motion not at all. -->
        <button
          data-slot="burger"
          aria-label={sidebarWords.openNavigation}
          class="select-none desk:hidden size-c-btn-h-lg -ms-space-2 grid place-items-center border-none border-current bg-transparent rounded-sm text-ink-strong transition-[background] duration-(--dur-control) ease-in-out hover:bg-surface-hover motion-safe:active:scale-(--press-scale) max-desk:self-start max-desk:ms-0 max-desk:ps-c-bar-phone-edge max-desk:justify-items-start max-desk:focus-inset max-desk:pt-(--burger-drop) max-desk:text-ink-muted max-desk:group-data-floating/top:pointer-events-auto group-data-under/top:pointer-events-auto"
          onclick={() => {
            railOpen = true;
          }}
          style:--burger-drop={"calc(2 * (var(--c-top-bar-h) - var(--c-tab-row-h) / 2 - var(--c-btn-h-lg) / 2))"}
          type="button"
          bind:this={burger}
        >
          <IconSidebar class="size-icon-lg max-desk:size-c-bar-toggle-glyph" />
        </button>
        {#if railed && railHidden}
          <!-- The sidebar is put away on a desk: the bar keeps the room
               its toggle stands over at the page's leading edge, in the
               shell's corner (`rail-toggle`), as wide as the toggle's glass
               (one bar item in its pad), past the bar's own leading pad
               wherever the bar has one. Hosted tabs start past it
               (followPanes). -->
          <div
            data-slot="rail-show"
            aria-hidden="true"
            class="box-content flex-none w-c-btn-h h-c-btn-h ps-space-2 coarse:portrait:desk:-ms-space-7"
          ></div>
        {/if}
        <!-- The one "where am I" label, now visible at every width — the brand
           lives in the rail, and the crumb is what the top bar owes a reader
           who arrived by URL. One slot for the bar's left-hand content,
           positioned so the one leaving can be lifted out of the row where
           it stands (crossOut). It takes the room the hosted strip fills; a
           crumb just sits at its start. It slides aside as the sidebar's
           toggle arrives before it and back as the toggle leaves (the bar's
           `reflow`), so its tabs and crumb never jump. A long name ends in an ellipsis,
           and on the narrow bar stands at least 16px clear of the first
           control: the bar's gap and the slot's own end inset (7 + 11). -->
        <div
          data-slot="slot"
          data-flip
          class="relative flex grow shrink basis-0 items-center self-stretch min-w-0 max-desk:pe-space-3 coarse:portrait:pe-space-3 max-desk:group-data-floating/top:invisible group-data-under/top:*:pointer-events-auto"
        >
          {#if barLeaves.length > 0}
            <!-- Nothing inside reaches the strip's own size or what is
                 around it: the columns are placed by script from the
                 groups' boxes, so they must not be able to feed back into
                 the boxes that script observes. Leaving, it keeps its box
                 but gives up the row; gone, it is not drawn. -->
            <div
              data-slot="slot-tabs"
              class="contain-layout contain-size relative grow shrink basis-0 self-stretch min-w-0 data-shell-lifted:absolute data-shell-lifted:inset-0 data-shell-away:invisible max-desk:group-data-hosting/top:hidden coarse:portrait:group-data-hosting/top:hidden"
              {@attach barTabs(() => hosting)}
              {@attach followPanes}
            >
              {#each barLeaves as leaf, i (leaf.id)}
                <!-- Each group's tabs, standing over the group they belong
                   to: its box follows the group's (followPanes writes its
                   inline start and width, which nothing under it inherits:
                   custom properties there restyled every tab in it on each
                   frame of a rail drag). The divider between two
                   groups goes on up through the bar as the line between
                   their columns, where the grid's own stands (the 1px
                   between the groups): the column's shadow, outside its
                   box. -->
                <div
                  data-slot="col"
                  class="group/col absolute inset-y-0 start-0 w-full flex min-w-0 overflow-hidden data-seam:shadow-(--seam-line)"
                  data-col={leaf.id}
                  data-focused={(groupsApart &&
                    workspace.focusedLeafId === leaf.id) ||
                    undefined}
                  data-seam={i > 0 || undefined}
                  style:--seam-line="-1px 0 0 var(--border-hairline)"
                >
                  <!-- The group the keyboard belongs to, as the group says
                       it: a hairline rail down the leading edge, where
                       there are groups to tell apart (one alone drew a
                       stray line at the start of the shelf). -->
                  <span
                    aria-hidden="true"
                    class="absolute inset-y-0 start-0 w-space-row bg-ink-muted opacity-0 z-2 pointer-events-none group-data-focused/col:opacity-50 motion-safe:transition-[opacity] motion-safe:duration-(--dur-control) motion-safe:ease-out"
                  ></span>
                  <RegionBoundary face="strip" part="tabs">
                    <PaneTabs hosted {leaf} />
                  </RegionBoundary>
                </div>
              {/each}
            </div>
          {/if}
          {#if hosting || (!railed && onSession)}
            <!-- The tabs above have the slot; on a phone the workspace's tabs
               are its own row, and the board needs no name over it. -->
          {:else if narrow && page.url.pathname.startsWith("/config/")}
            <!-- Inside a section on a phone the rail is its own page, so the bar
               leads back to it: Back, the chevron alone in its glass group,
               named by where it goes (DESIGN.md, The Title Bars Follow
               Liquid Glass Rule: "Back and Close are symbols"). -->
            <div data-slot="crumb" class="flex min-w-0" in:riseIn out:crossOut>
              <BarGlass form="group">
                <BarItem
                  href="/config"
                  icon={IconChevronLeft}
                  label={configureWords.backTo(configureWords.title)}
                />
              </BarGlass>
              {#if configSection}
                <span
                  data-slot="title"
                  class="ms-space-2 min-w-0 self-center truncate type-label text-ink-strong"
                  >{configSection}</span
                >
              {/if}
            </div>
          {:else}
            <!-- Padding, not margin: the crumb leaving is pinned where its
                 border box stands (crossOut), and a margin would carry it
                 along. A long name (a session's, a project's) ends in an
                 ellipsis and keeps clear of the cluster beside it: the bar's
                 own gap plus --space-3 of margin, outside the box its text
                 is clipped to, past the 16px a name needs from a control. -->
            <span
              data-slot="crumb"
              data-led={(railed && railHidden) || undefined}
              class="min-w-0 truncate ps-space-7 data-led:ps-space-1 me-space-3 max-desk:ps-0 coarse:portrait:ps-0"
              in:riseIn
              out:crossOut
            >
              <MorphText text={crumb} />
            </span>
          {/if}
        </div>

        <!-- The trailing edge, one glass group (Apple HIG, Toolbars): on a
             conversation Files first, then Jump, the machines, then Caw's
             head last, at the edge. A phone keeps Files, Jump and the
             machines in its sidebar, so its group holds Caw alone; over a
             conversation's tab row the floating bar passes touches through,
             and the glass takes its own back, as the toggle does. -->
        <div
          data-slot="right"
          class="relative ms-auto flex min-w-0 items-center group-data-hosting/top:flex-none group-data-hosting/top:ps-space-3 max-desk:self-stretch max-desk:group-data-hosting/top:flex-initial max-desk:group-data-hosting/top:ps-0 coarse:portrait:group-data-hosting/top:flex-initial coarse:portrait:group-data-hosting/top:ps-0 max-desk:group-data-floating/top:*:pointer-events-auto group-data-under/top:*:pointer-events-auto"
        >
          <!-- The glass (kit BarGlass), as one shape with the card hanging
               from it while one does (bar-glass: Caw's panel, the machines,
               Jump, Files). -->
          <BarGlass joined={barGlass.joined}>
            {#snippet head()}
              <!-- Caw's head: what needs you, and its drawer. -->
              <NeedsCaw />
            {/snippet}
            {#if railed && filesSession}
              <!-- Files: the conversation on screen's artifacts and
                   attachments. -->
              <FilesItem count={filesCounted} />
            {/if}
            <!-- Drawn on every screen and hidden on the phone's glass by its
                 layout (`desk`: the shell container's desk line,
                 `@max-desk/shell`), as Machines is, so the first client
                 render keeps the bar the server drew. -->
            <BarItem
              aria-haspopup="dialog"
              data-glass-opens="jump"
              data-share="jump"
              expanded={barGlass.open === "jump"}
              keys="⌘K"
              label={shellWords.jumpToSession}
              layout="desk"
              onclick={() => {
                barGlass.toggle("jump");
              }}
            >
              <IconSearch
                aria-hidden="true"
                class="size-icon-md text-ink-muted"
              />
            </BarItem>
            <MachinesButton />
          </BarGlass>
          <!-- No always-on hub dot: a green light that is green 99% of the time
             says nothing. Connection health is the band below (HubBand), which
             is shown only when the hub is NOT connected. The theme toggle
             lives in the rail's footer with the account row. -->
        </div>
      </header>
      {#if !railed}
        <!-- The screen's left edge, where a finger pulls the sidebar out,
             and its right edge, where one pulls Files out of a
             conversation, the same gesture mirrored. -->
        <EdgePull
          onpull={() => {
            railOpen = true;
          }}
          side="left"
        />
        {#if files.session}
          <EdgePull
            onpull={() => {
              files.sheet = true;
            }}
            side="right"
          />
        {/if}
      {/if}

      <!-- The one place the hub connection is spoken of (HubBand): a row
           under the bar (over it under the drawer's line) that moves the
           page down, never over it. -->
      {#if under}
        <!-- The scroll edge effect under the bar floating over the page:
             what scrolls beneath it blurs and fades into the shell's ground,
             from the first scroll (HeadFade, as BarFloat draws it). -->
        <HeadFade band="var(--c-top-bar-h)" tint="bg-surface-recess" />
      {/if}
      <HubBand />

      <!-- The old thumb bar is gone, so this region reclaims its height. On a
         session route the composer owns its own bottom inset; everywhere else
         the scroll region pads the home-indicator safe area itself so the last
         row is never tucked under it. -->
      <!-- A page sliding in sideways must not open a horizontal scrollbar
           for the length of its travel; wide content scrolls in its own box.
           Clear of a landscape notch's inset on the trailing side (and on a
           phone the leading one too); the rail holds the leading one where
           it stands. Page grounds are the shell's own (surface-recess), so
           the inset beside them is the same ground. Under a finger it owns
           the home-indicator inset where no composer is present to own it
           (`data-safe`), read off this box itself (data-safe-bottom). Under
           the floating bar the session's tab row is the screen's top row:
           the insets beside it are its shelf, the rest the shell's ground
           the transcript stands on. -->
      <main
        data-slot="shell-content"
        data-floating={floating || undefined}
        data-under={under || undefined}
        class="flex-auto min-h-0 flex flex-col overflow-x-hidden overflow-y-auto data-under:pt-c-top-bar-h data-under:scroll-timeline-transcript-head pe-(--content-end) max-desk:ps-(--content-start) coarse:data-safe:pb-(--safe-bottom) max-desk:data-floating:bg-linear-to-b max-desk:data-floating:from-surface-shelf max-desk:data-floating:to-surface-shelf max-desk:data-floating:bg-top max-desk:data-floating:bg-size-(--shelf-band-size) max-desk:data-floating:bg-no-repeat"
        data-safe={!onSession || undefined}
        data-safe-bottom
        id="main-content"
        bind:this={content}
        style:--content-end="env(safe-area-inset-right, 0px)"
        style:--content-start="env(safe-area-inset-left, 0px)"
        style:--shelf-band-size="100% var(--c-top-bar-h)"
      >
        <!-- The page is keyed on its route, so a navigation swaps one page for
           the next through their own transitions (motion/route.svelte.ts):
           both stand in this one grid cell while they overlap. Every
           conversation is one key, and so is Configure, which keys its own
           pane so its rail holds still. A page taller than the screen
           overflows the cell into the content's scroll exactly as it did as
           a flex child of the content. -->
        <div
          data-slot="swap"
          class="grid grid-rows-1 grid-cols-1 flex-auto min-h-0"
        >
          {#key pageKey}
            <div
              class="row-start-1 col-start-1 flex flex-col min-w-0 min-h-0 data-parked:invisible"
              in:pageIn
              out:pageOut
            >
              <RegionBoundary face="page" part="page"
                >{@render children()}</RegionBoundary
              >
            </div>
          {/key}
          <!-- After the keyed page, so it is drawn over the empty one a
             `/session` route renders. Under another spoke it is parked
             (`data-parked`): laid out, so its virtualisers keep their
             measurements and its scroll offsets stand, but not drawn. -->
          {#if surfaceMounted}
            <div
              class="row-start-1 col-start-1 flex flex-col min-w-0 min-h-0 data-parked:invisible"
              in:pageIn
              {@attach park(() => onSession)}
            >
              <RegionBoundary face="page" part="workspace">
                <SessionSurface shown={onSession} />
              </RegionBoundary>
            </div>
          {/if}
        </div>
      </main>
    </div>
    <!-- The desk's one sidebar toggle (`rail-toggle`): one bar item that never
         moves, in the shell's top leading corner over the rail and the
         page, which both clip what they hold and slide out from under it.
         Its centre stands on the top bar's centre line, where the bar's
         leading item stands (the bar's leading pad, the glass's pad, half
         an item), the sidebar's brand row centred on that line beside it
         (Sidebar `toggleRoom`) and the bar keeping its room while the
         sidebar is away (`rail-show`). While the sidebar is away its glass
         (a group's capsule) stands round it, faded in as the sidebar hides
         and out as it shows; its glyph's chevron turns half a turn to point
         out of the panel, or back into it, its frame still (SidebarToggle);
         both on the slide's clock (`railTurn`). Its glyph mirrors right to
         left, as the sidebar's side does. -->
    {#if railed && !full}
      <div
        data-slot="rail-toggle"
        data-away={railHidden || undefined}
        class="absolute top-0 start-0 z-(--layer-bar) flex items-center h-c-top-bar-h ps-space-2 pointer-events-none *:pointer-events-auto *:data-[slot=tools]:before:transition-[opacity] *:data-[slot=tools]:before:duration-(--turn-dur) *:data-[slot=tools]:before:ease-drawer not-data-away:*:data-[slot=tools]:before:opacity-0"
        style:--turn-dur={railHidden
          ? "var(--dur-panel-exit)"
          : "var(--dur-panel)"}
        bind:this={railCorner}
      >
        <BarGlass form="group">
          <BarItem
            label={railHidden
              ? sidebarWords.showSidebar
              : sidebarWords.hideSidebar}
            onclick={toggleRail}
          >
            <IconSidebarToggleLinear
              away={railHidden}
              class="rtl:-scale-x-100"
              data-slot="bar-symbol"
            />
          </BarItem>
        </BarGlass>
      </div>
    {/if}
  </div>

  <!-- The hanging cards' layer (hang-layer): the glass's one card (Caw's
       panel, the machines, Jump or Files; bar-glass), drawn in it, and the
       session card, portaled into it from its tab (PaneTabs). They take
       their form from a `shell` container as the glass does (HangCard
       `@max-desk/shell`, `@max-phone/shell`, `100cqi`): this layer, as wide
       as the shell above, its height the window's (`--shell-h`). Not inside
       the shell itself: a container is a stacking context, so a held toast
       or a sheet on the page's own layers would stand over a card there;
       here they stand on the floating layer as portaled cards did, at the
       window's origin, so their place is the window's. -->
  <div
    class="@container/shell hang-layer-screen fixed inset-x-0 top-0 z-(--layer-float)"
    data-hang-layer={hangLayerOf.id}
  >
    <GlassCard />
  </div>
  {#if !railed}
    <!-- Files on a phone: the house bottom drawer. -->
    <FilesSheet />
  {/if}
  <!-- One Add machine window for every entry that adds one, and every
       install's row that opens it again (connect/installs.svelte.ts). -->
  <ConnectWindow />
  <!-- One New Session form for every opener (the rail's rows, the phone's
       Start session, a `?spawn=` link, the session strip's "+", a project's
       Spin off) and every session menu's Continue (spawn/new-session,
       continue.svelte.ts): a popover hanging from the trigger pressed on a
       desk, the bottom sheet on a phone. -->
  <NewSessionPopover
    anchor={spawning.anchor}
    continueFrom={continuing.source ?? undefined}
    onclose={() => {
      spawning.open = false;
      spawning.anchor = null;
      spawning.shown = null;
      continuing.source = null;
    }}
    onexitcontinue={() => {
      spawning.open = true;
      continuing.source = null;
    }}
    open={spawning.open || continuing.source !== null}
    prefill={continuing.source ? undefined : spawning.prefill}
  />
</Overlays>
