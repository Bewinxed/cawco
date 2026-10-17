<script lang="ts">
  import {
    type ShellShortcut,
    shellShortcutOf,
  } from "@cawco/core/shell-shortcuts";
  /**
   * The app chrome: the management rail on the left, a slim bar across the top,
   * and everything else underneath. Ported from mocks/v2-fleet.html (`aside` +
   * `main .top`) and mocks/v5-workspace.html (the tab strip).
   *
   * On a phone the rail is a sheet the bar's burger opens; on a desktop it is a
   * resizable column whose width is this browser's, not the fleet's.
   */
  import { onMount, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery } from "svelte/reactivity";
  import { navSheet } from "#lib/cawco/motion/clock.svelte.js";
  import {
    crossOut,
    dur,
    ease,
    easeOut,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { pageIn, pageOut, route } from "#lib/cawco/motion/route.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { keepPrefs } from "#lib/cawco/prefs.js";
  import { gridView } from "#lib/cawco/workspace/grid-view.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { setSidebar } from "#lib/components/ui/sidebar/context.svelte.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { DRAWER_QUERY, NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { IconChevronLeft, IconSearch, IconSidebar } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { fieldKeeps } from "#lib/utils/typing.js";
  import { browser } from "$app/env";
  import { goto, onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import AddMachineDialog from "./AddMachineDialog.svelte";
  import { barGlass, type GlassCard as GlassFace } from "./bar-glass.svelte";
  import { barStrip } from "./bar-strip.svelte";
  import { cawco, hubSocketUrl, reconnectNow } from "./client.svelte";
  import { continuing } from "./continue.svelte";
  import GlassCard from "./GlassCard.svelte";
  import { deviceRatio } from "./home/device-ratio.svelte";
  import { sessionName } from "./home/home-state.svelte";
  import { guardDrops } from "./internal-drag";
  import MachinesButton from "./MachinesButton.svelte";
  import { hangShadow } from "./motion/hung-shadow";
  import NeedsCaw from "./NeedsCaw.svelte";
  import Overlays from "./Overlays.svelte";
  import RegionBoundary from "./RegionBoundary.svelte";
  import SessionSurface from "./SessionSurface.svelte";
  import Sidebar from "./Sidebar.svelte";
  import { runShellShortcut, shellShortcutsAre } from "./shell-shortcut";
  import NewSessionDialog from "./spawn/NewSessionDialog.svelte";
  import { newSession, spawning } from "./spawn/new-session.svelte";
  import { store, stored } from "./storage";
  import { floor } from "./visible-viewport.svelte";
  import PaneTabs from "./workspace/PaneTabs.svelte";
  import { type WorkspaceV1, workspace } from "./workspace/workspace.svelte";

  // The sidebar primitives (SidebarMenuButton etc.) call `useSidebar()` which
  // needs a context. The Shell manages its own layout (resize, mobile sheet),
  // so we provide a context that wires into the Shell's existing state.
  let sidebarOpen = $state(true);
  setSidebar({
    open: () => sidebarOpen,
    setOpen: (v: boolean) => {
      sidebarOpen = v;
    },
  });

  const RAIL_KEY = "cawco-rail-width";
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
  }: { children: import("svelte").Snippet; railWidth?: number | null } =
    $props();

  // Seeded once from the server's reading; dragging owns it after that.
  let railWidth = $state<number | null>(
    untrack(() => (initialRailWidth === null ? null : clamp(initialRailWidth)))
  );
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

  /**
   * Show a width. Called on every frame of a drag, so it does no more than that.
   *
   * `--sidebar-width` resolves through `--rail-w` (see the shell's inline
   * style), so the value the inline script established is replaced rather than
   * fought with.
   */
  function showRail(px: number) {
    railWidth = clamp(px);
    document.documentElement.style.setProperty("--rail-w", `${railWidth}px`);
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
   * change, so during a drag they are set directly and the cascade is left
   * out of it. On release the settled width goes back through `--rail-w` and
   * the inline overrides are dropped in the same task — one style flush, so
   * the stylesheet takes the rail back without a frame of the old width.
   *
   * `railWidth` is deliberately NOT written while dragging: it is read by the
   * shell's inline `style`, so assigning it would put `--sidebar-width` back
   * on the shell every frame and buy back the cost this avoids. It catches up
   * on release, which is also when `aria-valuenow` settles.
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
      rail.style.width = "";
      rail.style.flexBasis = "";
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
      // ⌘K opens and closes Jump (DESIGN.md, "The glass's cards").
      case "jump":
        barGlass.toggle("jump");
        return true;
      // Split the focused group, putting the conversation in front into the
      // new half. `mod+\` is the binding VS Code uses for exactly this, and
      // this is a straight copy of that model — borrowing the gesture's name
      // too costs nothing and saves the reader learning a second one.
      case "split-right":
      case "split-down": {
        const here = workspace.activeSessionId;
        if (!(onSession && here && workspace.openIds.length >= 2)) {
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
   * A shell combo (each one a ⌘ or Ctrl chord) is the shell's from anywhere,
   * a text field included, as an artifact's page leaves it (preview-overlay
   * page.ts): the field gets first claim, and one it handled
   * (`defaultPrevented`) stays its own. On Apple's systems ⌃ in a field is
   * the field's text key (`fieldKeeps`).
   */
  function shortcut(event: KeyboardEvent) {
    const name = shellShortcutOf(event);
    if (!name || event.defaultPrevented || fieldKeeps(event)) {
      return;
    }
    if (runShellShortcut(name)) {
      event.preventDefault();
    }
  }

  const onSession = $derived(page.url.pathname.startsWith("/session"));
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
      // biome-ignore lint/complexity/noVoid: the dialog is already open; the URL cleanup is a courtesy
      void goto(url, { replace: true });
    });
  });
  /**
   * The session surface (board, groups, panes) is mounted the first time a
   * `/session` page shows and never again after that: under another spoke it
   * is parked, still laid out but hidden and inert, so coming back finds
   * every transcript scrolled and every disclosure open as it was left.
   */
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
  if (browser) {
    // The URL is the address, and it wins before anything is drawn: the
    // store restores what was open from localStorage at module load, and the
    // bar's strip below reads it ahead of the session surface. Placed later,
    // the tab the server drew (it placed the URL's conversation in the
    // cookie's tree) came back a frame after hydration as a new tab, and a
    // menu opened on it in that moment went with it.
    workspace.followUrl(location.href);
  } else {
    workspace.serve(
      (page.data as { workspace?: WorkspaceV1 | null }).workspace ?? null
    );
  }
  const narrowQuery = new MediaQuery(NARROW_QUERY);
  const narrow = $derived(
    browser ? narrowQuery.current : (page.data.narrow as boolean)
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
     brings it back as it was left. */
  const drawerQuery = new MediaQuery(DRAWER_QUERY);
  const railed = $derived(browser ? !drawerQuery.current : true);

  /**
   * The shadow of every card hanging from the glass (HangCard `glass`),
   * drawn ahead of any press (motion/hung-shadow): a picture of
   * `--shadow-overlay-hung` round its corners, the glass's trailing flank
   * square and, on a phone, its foot at the screen's edge square (app.css
   * `.glass-card`), drawn again for a new scheme, device ratio or width.
   */
  $effect(() => {
    const look = [theme.resolved, deviceRatio.current, !railed] as const;
    const corner = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--radius-lg")
    );
    hangShadow(".kit-pop.glass-card", "--shadow-overlay-hung", [
      corner,
      0,
      look[2] ? 0 : corner,
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
    // decides list-or-section by it.
    keepPrefs({ "cawco-narrow": narrow ? "1" : "0" });
  });
  /** The groups whose tabs the bar carries, once the session has shown, on any route: those along the workspace's top edge. */
  const barLeaves = $derived(surfaceMounted && !narrow ? gridView.tops : []);
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
  /**
   * Whether the bar shows a page's own strip (bar-strip): a project's
   * views, where the crumb would only repeat the name its head says. On a
   * wide screen, the line the session's tabs are hosted by; the page's
   * data says so, so the server draws the bar without the crumb.
   */
  const stripHosted = $derived(
    !(narrow || routeError) &&
      (page.data as { barStrip?: boolean }).barStrip === true
  );
  /**
   * A page's strip leaving stands as it was while its place fades: an
   * outro pauses what it holds, so the page's state, already reading the
   * next route's data, is never drawn again; it goes when the fade has.
   */
  const stands = (_node: Element) => ({ duration: dur("--dur-control") });
  /** The strip's place in the slot, kept from the first paint in the browser so its first arrival moves as every later one does. */
  let stripMounted = $state(untrack(() => stripHosted));
  onMount(() => {
    stripMounted = true;
  });
  // A row or card dragged inside the page never types into a field, and a
  // file let go off a composer never opens in the tab (internal-drag.ts).
  onMount(guardDrops);

  /* ── The bar's slot ──────────────────────────────────────────────────
     The hosted tabs, a page's strip, the crumb and Configure's back link
     take turns in one slot. The one leaving is lifted out of the row where
     it stands and fades over --dur-control; the one arriving rises 4px as
     it fades in over the same length, and a hosted strip comes down 6px
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
        ? `opacity: ${t}; transform: translateY(${4 * u}px)`
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
    const place = () => {
      const areaLeft = layoutLeft(slot);
      const areaRight = areaLeft + slot.offsetWidth;
      for (const col of slot.querySelectorAll<HTMLElement>(
        ':scope > [data-slot="col"]'
      )) {
        const group = document.querySelector<HTMLElement>(
          `[data-leaf="${col.dataset.col}"]`
        );
        if (!group) {
          continue;
        }
        const left = layoutLeft(group);
        const x = `${left - areaLeft}px`;
        const w = `${Math.max(0, Math.min(group.offsetWidth, areaRight - left))}px`;
        if (written.get(col) === `${x} ${w}`) {
          continue;
        }
        written.set(col, `${x} ${w}`);
        col.style.setProperty("--col-x", x);
        col.style.setProperty("--col-w", w);
      }
    };
    const sizes = new ResizeObserver(place);
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
                    { opacity: 0, transform: "translateY(-6px)" },
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
    !railed && onSession && workspace.activeSessionId !== null
  );

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
   * A finger from the screen's left edge pulls the sidebar out, as the
   * toggle does: a press in the edge's strip that travels right, more than
   * it travels down, opens it.
   */
  function edgeSwipe(event: PointerEvent) {
    if (event.pointerType === "mouse") {
      return;
    }
    const zone = event.currentTarget as HTMLElement;
    const x0 = event.clientX;
    const y0 = event.clientY;
    zone.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const dx = e.clientX - x0;
      if (dx > 24 && dx > Math.abs(e.clientY - y0)) {
        railOpen = true;
        stop();
      }
    };
    const stop = () => {
      zone.removeEventListener("pointermove", move);
      zone.removeEventListener("pointerup", stop);
      zone.removeEventListener("pointercancel", stop);
    };
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", stop);
    zone.addEventListener("pointercancel", stop);
  }

  /**
   * What the bar names: the page's own name where it has one (a
   * conversation's title, a project's name), else its section.
   */
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
      case "config":
        return "Configure";
      default:
        return section[0].toUpperCase() + section.slice(1);
    }
  });

  /**
   * Whether this tab has ever had the hub. A socket that dropped is retrying
   * and will say so; one that never landed is a wrong address, and the two want
   * different words.
   */
  let everConnected = $state(false);
  $effect(() => {
    if (cawco.status === "connected") {
      everConnected = true;
    }
  });

  /**
   * The first connection is not a fault, and it used to be drawn as one.
   *
   * `status` starts at `disconnected` — a socket that has not been made yet
   * reads exactly like one that failed — so every cold load hydrated with the
   * red "can't reach the hub" banner up, then tore it down a frame later when
   * the socket opened. That is a 47px band inserted and removed between the top
   * bar and the tab strip: two layout shifts, ±47px, on a load where nothing
   * was ever wrong.
   *
   * So the banner waits for evidence, but only for the `connecting` phase —
   * the grace period before the first attempt completes. Once the status is
   * `disconnected` or `error`, the hub is known-unreachable and the banner
   * fires without requiring a prior successful connection: an operator whose
   * browser loads while the hub is already down sees the full-width banner
   * immediately (after the grace), not caption-sized text buried in an empty
   * state.
   */
  const CONNECT_GRACE = 4000;
  let graceOver = $state(false);
  onMount(() => {
    const timer = setTimeout(() => {
      graceOver = true;
    }, CONNECT_GRACE);
    return () => clearTimeout(timer);
  });
  const showBanner = $derived.by(() => {
    const s = cawco.status;
    // A bench (/motion/…) stages its own data and runs with no hub by design.
    if (s === "connected" || page.url.pathname.startsWith("/motion/")) {
      return false;
    }
    // A socket that errored or was declared disconnected is a known fault —
    // show the banner once the grace has elapsed or the attempt has failed,
    // without requiring a prior successful connection.
    if (s === "disconnected" || s === "error") {
      return cawco.connectFailed || graceOver;
    }
    // `connecting` is the transient every cold load passes through. Show the
    // banner only when a prior connection has been lost and the grace elapsed.
    return everConnected && graceOver;
  });

  // The countdown is a clock, not a frame: 250ms is fast enough that the number
  // never looks stuck and slow enough to cost nothing.
  let now = $state(Date.now());
  $effect(() => {
    if (cawco.status === "connected") {
      return;
    }
    const timer = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(timer);
  });
  const retryIn = $derived(
    cawco.retryAt ? Math.max(0, Math.ceil((cawco.retryAt - now) / 1000)) : 0
  );
</script>

<svelte:window onkeydown={shortcut} />

<!-- literal: -9999px -->
<a
  data-slot="skip"
  class="absolute left-(--skip-off) z-100 py-space-2 px-space-4 bg-surface-raised rounded-sm shadow-tile focus:left-space-4 focus:top-space-4"
  href="#main-content"
  style:--skip-off="-9999px">Skip to content</a
>

<!-- `--rail-w` is set before the body parses (app.html) from the same key this
     component writes; the server's cookie width is the fallback under it, and
     the `c-sidebar-w` token under that when the reader has none. SSR
     therefore emits no committed width of its own, and there is nothing to
     snap away from on hydration. -->
<!-- The tooltip provider and the lightbox, shared with an artifact's own tab. -->
<Overlays>
  <!-- As tall as the visible area reaches, so the composer and a page's
       footer stand on a keyboard (cawco/visible-viewport `floor`). -->
  <div
    data-slot="shell"
    class="flex h-(--shell-h,100dvh) w-full bg-surface-recess overflow-hidden"
    style="--sidebar-width: var(--rail-w, {railWidth === null
      ? 'var(--c-sidebar-w)'
      : `${railWidth}px`})"
    style:--shell-h={floor.bottom > 0 ? `${floor.bottom}px` : null}
  >
    <!-- The rail holds the screen's leading edge, so it keeps a landscape
         notch's inset clear inside its own width, in the sidebar's ground:
         its outer edge stays where a drag puts it (`startDrag`). -->
    <aside
      data-slot="rail"
      class="hidden min-[900px]:flex relative w-(--sidebar-width) grow-0 shrink-0 basis-(--sidebar-width) min-w-0 ps-(--rail-inset) bg-(--sidebar) border-r border-r-border-hairline"
      style:--rail-inset="env(safe-area-inset-left, 0px)"
    >
      {#if railed}
        <RegionBoundary region="sidebar">
          <Sidebar {narrow} scroller={keepScroll} />
        </RegionBoundary>
      {/if}
      <!-- literal: 6px, -3px (the grip, 6px over the rail's edge) -->
      <div
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemax={RAIL_MAX}
        aria-valuemin={RAIL_MIN}
        aria-valuenow={railWidth}
        class="absolute top-0 bottom-0 right-(--grip-right) w-(--grip-w) cursor-col-resize touch-none z-5 hover:bg-border-control"
        onkeydown={resizeKey}
        onpointerdown={startDrag}
        role="slider"
        style:--grip-w="6px"
        style:--grip-right="-3px"
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
           it opened, which hangs from the bar's glass. In the sheet the
           close button sits in the brand row's corner (16px in, 30px wide,
           and 7px of touch area around it): the brand row stops short of it
           (--rail-sheet-close-room). -->
      <!-- literal: 284px, 46px -->
      <Sheet.Content
        data-rail-sheet
        class="w-(--rail-sheet-w) p-0 min-[900px]:hidden"
        style="--rail-sheet-w: 284px; --rail-sheet-close-room: 46px"
        onCloseAutoFocus={(event) => {
          if (barGlass.open === "jump") {
            event.preventDefault();
          }
        }}
        side="left"
      >
        <Sheet.Header class="sr-only">
          <Sheet.Title>Navigation</Sheet.Title>
        </Sheet.Header>
        {#if !railed}
          <RegionBoundary region="sidebar">
            <Sidebar {narrow} onsearch={() => fromSheet("jump")} sheet />
          </RegionBoundary>
        {/if}
      </Sheet.Content>
    </Sheet.Root>

    <div
      data-slot="shell-main"
      class="relative flex-auto min-w-0 flex flex-col overflow-hidden"
    >
      <!-- The bar: the comp's height (`--c-top-bar-h`, so what floats under
           it lands under it); hosted folder tabs stand on its floor. The
           right inset is the content's right pad, so the cluster's edge
           stands over the page's; the left inset is the crumb's own, so the
           slot starts at the bar's edge whether it holds the crumb or the
           tabs. Under the narrow query (NARROW_QUERY) its first paint is the
           narrow bar already, its inset and ground. On the phone's one row
           (44px, the compact bar's) the toggle and Caw's glass start from
           the screen's edges, each inside a landscape notch's inset, so the
           row has no pad of its own; with a conversation in front the bar
           floats over the group's own tab row and takes only its two
           controls' touches. -->
      <header
        data-slot="top"
        data-floating={floating || undefined}
        data-hosting={hosting || undefined}
        class="group/top h-c-top-bar-h shrink-0 flex items-center gap-space-2 py-0 pl-0 pr-(--top-end) bg-surface-raised border-b border-b-seam coarse:portrait:desk:pl-space-7 max-desk:pl-(--top-inset-start) max-desk:pr-(--top-inset-end) max-desk:data-floating:absolute max-desk:data-floating:inset-x-0 max-desk:data-floating:top-0 max-desk:data-floating:bottom-auto max-desk:data-floating:z-20 max-desk:data-floating:pointer-events-none"
        style:--top-end="calc(var(--space-6) + env(safe-area-inset-right, 0px))"
        style:--top-inset-start="env(safe-area-inset-left, 0px)"
        style:--top-inset-end="env(safe-area-inset-right, 0px)"
      >
        <!-- The sidebar toggle; at the 900px line the rail returns and it
             retires (`min-[900px]:hidden`). On the phone's row it is a bare
             glyph (owner, variant B): its leading edge c-bar-phone-edge from
             the screen's, its centre on the tabs' centre line, which stand
             on the bar's floor, in a 44px touch area that reaches into the
             screen's edge. Tactile press: it dips under the finger, with
             less motion not at all. -->
        <!-- literal: 44px, 22px (half the touch area) -->
        <button
          data-slot="burger"
          aria-label="Open navigation"
          class="min-[900px]:hidden size-(--burger) -ml-space-2 grid place-items-center border-none border-current bg-transparent rounded-sm text-ink-strong cursor-pointer transition-[background] dur-control ease-in-out hover:bg-surface-hover motion-safe:active:transform-(--burger-press) max-desk:self-start max-desk:ms-(--burger-start) max-desk:mt-(--burger-top) max-desk:text-ink-muted max-desk:group-data-floating/top:pointer-events-auto"
          onclick={() => {
            railOpen = true;
          }}
          style:--burger="44px"
          style:--burger-press="scale(var(--press-scale))"
          style:--glyph="var(--c-bar-toggle-glyph)"
          style:--burger-start="calc(var(--c-bar-phone-edge) + var(--glyph) / 2 - 22px)"
          style:--burger-top="calc(var(--c-top-bar-h) - var(--c-tab-row-h) / 2 - 22px)"
          type="button"
          bind:this={burger}
        >
          <IconSidebar class="size-icon-lg max-desk:size-(--glyph)" />
        </button>
        <!-- The one "where am I" label, now visible at every width — the brand
           lives in the rail, and the crumb is what the top bar owes a reader
           who arrived by URL. One slot for the bar's left-hand content,
           positioned so the one leaving can be lifted out of the row where
           it stands (crossOut). It takes the room the hosted strip fills; a
           crumb just sits at its start. A long name ends in an ellipsis,
           and on the narrow bar stands at least 16px clear of the first
           control: the bar's gap and the slot's own end inset (7 + 11). -->
        <div
          data-slot="slot"
          class="relative flex grow shrink basis-0 items-center self-stretch min-w-0 max-desk:pe-space-3 coarse:portrait:pe-space-3 max-desk:group-data-floating/top:invisible"
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
                   to: its box follows the group's (followPanes: left and
                   width, --col-x and --col-w). The divider between two
                   groups goes on up through the bar as the line between
                   their columns, where the grid's own stands (the 1px
                   between the groups): the column's shadow, outside its
                   box. -->
                <div
                  data-slot="col"
                  class="group/col absolute inset-y-0 start-(--col-start) w-(--col-size) flex min-w-0 overflow-hidden data-seam:shadow-(--seam-line)"
                  data-col={leaf.id}
                  data-focused={workspace.focusedLeafId === leaf.id ||
                    undefined}
                  data-seam={i > 0 || undefined}
                  style:--col-start="var(--col-x, 0px)"
                  style:--col-size="var(--col-w, 100%)"
                  style:--seam-line="-1px 0 0 var(--border-hairline)"
                >
                  <!-- The group the keyboard belongs to, as the group says
                       it: a hairline rail down the leading edge. -->
                  <span
                    aria-hidden="true"
                    class="absolute top-0 right-auto bottom-0 left-0 w-space-row bg-ink-muted opacity-0 z-2 pointer-events-none group-data-focused/col:opacity-50 motion-safe:transition-[opacity] motion-safe:dur-control motion-safe:ease-out"
                  ></span>
                  <RegionBoundary region="tabs">
                    <PaneTabs hosted {leaf} />
                  </RegionBoundary>
                </div>
              {/each}
            </div>
          {/if}
          {#if stripMounted && !narrow}
            <!-- The page's own strip (bar-strip), standing where the crumb
               would: the room the crumb had, its own insets the page's. What
               holds it while it leaves lays nothing out itself: the page's
               strip is the slot's row. -->
            <div
              data-slot="slot-strip"
              class="relative flex grow shrink basis-0 items-center self-stretch min-w-0 data-shell-lifted:absolute data-shell-lifted:inset-0 data-shell-away:invisible max-desk:hidden coarse:portrait:hidden"
              {@attach barTabs(() => stripHosted)}
            >
              {#if stripHosted}
                <div class="contents" out:stands>
                  {@render barStrip.strip?.()}
                </div>
              {/if}
            </div>
          {/if}
          {#if hosting || stripHosted || (!railed && onSession)}
            <!-- The strips above have the slot; on a phone the session's tabs
               are its own row, and the board needs no name over it. -->
          {:else if narrow && page.url.pathname.startsWith("/config/")}
            <!-- Inside a section on a phone the rail is its own page, so the bar
               leads back to it. -->
            <!-- literal: 44px, 8px -->
            <a
              data-slot="crumb"
              class="mark-line pressable inline-flex items-center gap-space-row min-h-(--back-h) ps-space-1 pe-(--back-end) rounded-sm type-label text-ink-strong no-underline"
              href="/config"
              style:--back-h="44px"
              style:--back-end="8px"
              in:riseIn
              out:crossOut
              ><IconChevronLeft class="size-icon-md" /><span>Configure</span></a
            >
          {:else}
            <!-- Padding, not margin: the crumb leaving is pinned where its
                 border box stands (crossOut), and a margin would carry it
                 along. A long name (a thread's, a project's) ends in an
                 ellipsis and keeps clear of the cluster beside it: the bar's
                 own gap plus --space-3 of margin, outside the box its text
                 is clipped to, past the 16px a name needs from a control. -->
            <span
              data-slot="crumb"
              class="min-w-0 truncate ps-space-7 me-space-3 max-desk:ps-0 coarse:portrait:ps-0"
              in:riseIn
              out:crossOut
            >
              <MorphText text={crumb} />
            </span>
          {/if}
        </div>

        <!-- The trailing edge, one glass group (Apple HIG, Toolbars): Jump,
             the machines, then Caw's head last, at the edge. A phone keeps
             Jump and the machines in its sidebar, so its group holds Caw
             alone. Hosting the tabs, it keeps its own room. -->
        <div
          class="relative ml-auto flex items-center min-w-0 group-data-hosting/top:flex-none group-data-hosting/top:pl-space-3 max-desk:group-data-hosting/top:flex-initial max-desk:group-data-hosting/top:pl-0 coarse:portrait:group-data-hosting/top:flex-initial coarse:portrait:group-data-hosting/top:pl-0 max-desk:self-stretch max-desk:group-data-floating/top:pointer-events-auto"
        >
          <!-- The one group: one container of the panel's glass, a capsule on
               the bar's control height (`--c-btn-h`) whose items sit
               concentric inside it, as Liquid Glass draws grouped toolbar
               items. How far the glass's leading foot flares out into the
               card hanging from it (`--flare`, the join, HangCard reads it):
               the card's own corner radius. On the phone's row Caw's glass
               (`c-bar-caw-glass-phone`) is a tab tucked into the screen's
               trailing edge: square on that side, which meets the edge, and
               round on the other (owner: "it's top right doesn't need to be
               rounded"). It tops with the tabs (the bar's height less a tab
               row's) and stands clear of the floor by the neck (--caw-neck),
               the transcript's top edge. His rim's arcs follow its outline
               (NeedsCaw). -->
          <!-- literal: 16px (the gap under a finger) -->
          <div
            data-slot="tools"
            class="group/tools relative flex items-center gap-c-bar-group-pad h-c-btn-h p-c-bar-group-pad rounded-pill coarse:gap-(--tools-coarse-gap) max-desk:self-start max-desk:h-c-bar-caw-glass-phone max-desk:mt-(--tools-top) max-desk:p-0 max-desk:rounded-l-(--tools-round) max-desk:rounded-r-none"
            data-bar-group
            data-instant={barGlass.instant ? "" : undefined}
            data-joined={barGlass.joined ? "" : undefined}
            style:--flare="var(--radius-lg)"
            style:--tools-coarse-gap="16px"
            style:--tools-top="calc(var(--c-top-bar-h) - var(--c-tab-row-h))"
            style:--tools-round="calc(var(--c-bar-caw-glass-phone) / 2)"
          >
            <!-- The glass as one shape with the card hanging from it while
                 one does (bar-glass: Caw's panel, the machines, Jump), as a
                 session tab is with its card: its top corners keep the
                 glass's round, its trailing flank runs straight down into
                 the panel's side, its leading one flares out at its foot
                 into the panel's top edge (`--f`), and its foot is no edge
                 at all. It takes the panel's material: `surface-raised`,
                 which the glass already is at 72% (`material-panel`), and
                 the panel's `border-control` edge. Drawn as a layer over the
                 glass and under the items, one flare wider than the glass on
                 its leading side and reaching 1px under its foot into the
                 panel's top edge, as the tab's `.neck` does: the layer is
                 the edge's ink in the outline, and its ::before is the
                 surface 1px inside it. It fades in as the card grows and out
                 as it folds, on the card's clock (`data-joined`: from the
                 growth's first frame to the fold's). On the phone's row it
                 reaches on down through the neck to the row's floor, where
                 it flares out into the card's top edge. -->
            <span
              data-slot="join"
              aria-hidden="true"
              class="absolute top-0 -bottom-px -start-(--f) end-0 pointer-events-none opacity-0 bg-border-control transition-[opacity] dur-exit ease-out group-data-joined/tools:opacity-100 group-data-joined/tools:dur-pop max-desk:bottom-(--join-foot)"
              style:--f="var(--flare)"
              style:--h="calc(100% - 1px)"
              style:--join-foot="calc(-1 * var(--caw-neck))"
            ></span>
            {#if railed}
              <Tip keys="⌘K" label="Jump to session">
                {#snippet children(tip)}
                  <button
                    data-bar-item
                    {...tip}
                    aria-expanded={barGlass.open === "jump"}
                    aria-haspopup="dialog"
                    aria-label="Jump to session"
                    class="touch-hit press-tint"
                    data-share="jump"
                    onclick={() => {
                      barGlass.toggle("jump");
                    }}
                    type="button"
                  >
                    <IconSearch aria-hidden="true" />
                  </button>
                {/snippet}
              </Tip>
              <MachinesButton />
            {/if}
            <!-- Caw's head: what needs you, and its drawer. -->
            <NeedsCaw />
          </div>
          <!-- No always-on hub dot: a green light that is green 99% of the time
             says nothing. Connection health folds into the banner below, which
             is shown only when the hub is NOT connected. The theme toggle
             lives in the rail's footer with the account row. -->
        </div>
      </header>
      {#if !railed}
        <!-- The screen's left edge, under the row, where a finger pulls the
             sidebar out; a press there is not the page's. -->
        <div
          aria-hidden="true"
          class="absolute top-c-top-bar-h right-auto bottom-0 left-0 z-15 w-c-edge-pull touch-none"
          onpointerdown={edgeSwipe}
        ></div>
      {/if}

      <!-- Server-side there is no socket to have lost, so the banner would render
         into every first paint and flash away on hydration. -->
      <!-- The banner is uncovered from under the bar and closes back into it
         (motion/rows); its slot floats over the page, under the bar, rather
         than taking a row of its own: it comes and goes with the socket,
         often for a second while the hub restarts, and a row pushed the
         whole page down and back each time (0.52 CLS on the board for one
         restart). The sentence takes the room, so the countdown ticking in
         it never moves the button at the end. -->
      <div
        class="absolute inset-x-0 top-c-top-bar-h z-10"
        {@attach reflow()}
      >
        {#if browser && cawco.reloadHold}
          <!-- A page on an older wire than the hub's reads nothing more from
             it. It reloads by itself, and while that waits the band says what
             it waits on instead of leaving a board that quietly stopped. -->
          <div
            data-slot="shell-banner"
            class="shadow-tile flex items-center gap-space-3 num py-space-2 pr-space-6 pl-space-7 text-size-body font-normal border-b border-b-border-hairline bg-status-attn-bg text-status-attn-ink"
            data-flip
            role="status"
          >
            <span class="flex-auto min-w-0">
              {#if cawco.reloadHold === "busy"}
                CawCo updated — this page has stopped updating. It reloads once
                you're not using it.
              {:else if cawco.reloadHold === "unkept"}
                CawCo updated — this page has stopped updating. Reload it to
                catch up.
              {:else}
                CawCo updated — this page has stopped updating. It reloads when
                the dashboard serves the new build.
              {/if}
            </span>
          </div>
        {:else if browser && showBanner}
          <div
            data-slot="shell-banner"
            class="shadow-tile flex items-center gap-space-3 num py-space-2 pr-space-6 pl-space-7 text-size-body font-normal border-b border-b-border-hairline tone-attn:bg-status-attn-bg tone-attn:text-status-attn-ink tone-fail:bg-status-fail-bg tone-fail:text-status-fail-ink"
            data-flip
            data-tone={everConnected ? "attn" : "fail"}
            role="status"
          >
            {#if everConnected}
              <!-- The countdown is a timer (live off): the band is read when
                   it comes, not again on every second it counts. -->
              <span class="flex-auto min-w-0"
                >Hub connection lost — retrying in <span role="timer"
                  >{retryIn}s</span
                ></span
              >
            {:else}
              <span class="flex-auto min-w-0"
                >Can't reach the hub at <code class="font-mono text-size-label"
                  >{hubSocketUrl()}</code
                ></span
              >
            {/if}
            <!-- Pending in place while an attempt is out, whoever started it. -->
            <Button
              failed={cawco.status !== "connecting"}
              label={everConnected ? "Reconnect" : "Retry"}
              onclick={reconnectNow}
              pending={cawco.status === "connecting"}
              pendingLabel="Connecting…"
              size="sm"
              variant="outline"
            />
          </div>
        {/if}
      </div>

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
           (`data-safe`), read off this box itself (data-safe-bottom). -->
      <main
        data-slot="shell-content"
        data-floating={floating || undefined}
        class="flex-auto min-h-0 flex flex-col overflow-x-hidden overflow-y-auto pe-(--content-end) max-desk:ps-(--content-start) coarse:data-safe:pb-(--safe-bottom)"
        data-safe={!onSession || undefined}
        data-safe-bottom
        id="main-content"
        style:--content-end="env(safe-area-inset-right, 0px)"
        style:--content-start="env(safe-area-inset-left, 0px)"
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
          class="grid grid-rows-(--swap-track) grid-cols-(--swap-track) flex-auto min-h-0"
          style:--swap-track="minmax(0, 1fr)"
        >
          {#key pageKey}
            <div
              class="row-start-1 col-start-1 flex flex-col min-w-0 min-h-0 data-parked:invisible"
              in:pageIn
              out:pageOut
            >
              <RegionBoundary region="page">{@render children()}</RegionBoundary
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
              <RegionBoundary region="workspace">
                <SessionSurface shown={onSession} />
              </RegionBoundary>
            </div>
          {/if}
        </div>
      </main>
    </div>
  </div>

  <!-- The glass's one card: Caw's panel, the machines or Jump (bar-glass). -->
  <GlassCard />
  <!-- One Connect a machine dialog for every entry that adds one (join/join.svelte.ts). -->
  <AddMachineDialog />
  <!-- One New Session dialog for every opener (the rail's rows, the phone's
       Start session, a `?spawn=` link) and every session menu's Continue
       (spawn/new-session, continue.svelte.ts). -->
  <NewSessionDialog
    continueFrom={continuing.source ?? undefined}
    onclose={() => {
      spawning.open = false;
      continuing.source = null;
      continuing.restore = null;
    }}
    onexitcontinue={() => {
      spawning.open = true;
      continuing.source = null;
      continuing.restore = null;
    }}
    open={spawning.open || continuing.source !== null}
    prefill={continuing.source ? undefined : spawning.prefill}
    restore={continuing.restore ?? undefined}
  />
</Overlays>

<style>
  /* residual: pseudo — the glass, and the join's surface. The glass is
     drawn by a layer under the items, never by the group itself: a backdrop
     filter on the group would make it the box Caw's fixed drawer is laid
     out in. Either setting (more contrast, less transparency): the solid
     raised surface and an edge that holds 3:1 against the bar and the
     surface (`border-contrast`), as the Apple apps' GlassCapsule draws it.
     The join's ::before is the surface 1px inside its edge. On the phone's
     row the side that meets the screen's edge draws no edge of its own. */
  [data-slot="tools"]::before {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--border-hairline);
    border-radius: inherit;
    background: var(--material-panel);
    box-shadow: var(--shadow-tile);
    backdrop-filter: blur(calc(var(--material-blur) * 1.4))
      saturate(var(--material-saturate));
    pointer-events: none;

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      background: var(--surface-raised);
      backdrop-filter: none;
      border-color: var(--border-contrast);
    }
  }
  [data-slot="join"]::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--surface-raised);
    clip-path: shape(
      from 0 100%,
      arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of
        calc(var(--f) + 1px) ccw,
      line to calc(var(--f) + 1px) var(--r),
      arc to calc(var(--f) + var(--r)) 1px of calc(var(--r) - 1px) cw,
      line to calc(100% - var(--r)) 1px,
      arc to calc(100% - 1px) var(--r) of calc(var(--r) - 1px) cw,
      line to calc(100% - 1px) 100%,
      close
    );
  }
  @media (max-width: 899px) {
    [data-slot="tools"]::before {
      border-inline-end-width: 0;
    }
    [data-slot="join"]::before {
      clip-path: shape(
        from 0 100%,
        arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of
          calc(var(--f) + 1px) ccw,
        line to calc(var(--f) + 1px) var(--r),
        arc to calc(var(--f) + var(--r)) 1px of calc(var(--r) - 1px) cw,
        line to 100% 1px,
        line to 100% 100%,
        close
      );
    }
  }

  /* residual: unmapped — the bar's ground while it hosts the tabs or
     floats (a layered background, or a shorthand reset, with no utility);
     the shapes the join is cut to (clip-path shape()); and the numbers that
     switch with the pointer or the layout, which only a rule can set per
     case. Hosting the tabs, the bar is the shelf they stand on: two steps
     below the transcript and one below an unchosen tab, so the chosen tab
     (a sheet in the transcript's own surface) reads as the page it opens.
     The hairline sits in the bar's bottom pixel, where the sheet ends and
     covers it. The narrow bar (NARROW_QUERY) draws itself raised even
     while hosting. Floating over the phone's tab row it draws nothing. */
  [data-slot="top"][data-hosting] {
    border-bottom: 0;
    background:
      linear-gradient(var(--border-hairline), var(--border-hairline)) bottom /
        100% 1px no-repeat,
      var(--surface-shelf);
  }
  @media (max-width: 899px), (pointer: coarse) and (orientation: portrait) {
    [data-slot="top"][data-hosting] {
      border-bottom: 1px solid var(--seam);
      background: var(--surface-raised);
    }
  }
  /* How far each of the group's items reaches sideways under a finger (the
     kit's .touch-hit reads it): the group's padding, a finger's gap. */
  [data-slot="tools"] {
    --hit-gap-x: var(--c-bar-group-pad);

    @media (pointer: coarse) {
      --hit-gap-x: var(--tools-coarse-gap);
    }
  }
  /* The join's outline: the glass's top corners (its pill's end, --r), its
     trailing flank straight down, its leading foot flared (--f). */
  [data-slot="join"] {
    --r: calc(var(--c-btn-h) / 2);
    clip-path: shape(
      from 0 var(--h),
      arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw,
      line to var(--f) var(--r),
      arc to calc(var(--f) + var(--r)) 0 of var(--r) cw,
      line to calc(100% - var(--r)) 0,
      arc to 100% var(--r) of var(--r) cw,
      line to 100% 100%,
      line to 0 100%,
      close
    );
  }
  /* A card the keyboard opened stands open and leaves at once (bar-glass
     `instant`), and its join with it. */
  [data-slot="tools"][data-instant] [data-slot="join"] {
    transition: none;
  }
  @media (max-width: 899px) {
    /* The neck Caw's phone panel hangs through (registered: NeedsCaw reads
       it in px), what the row is taller than his glass. */
    [data-slot="tools"] {
      --caw-neck: calc(var(--c-tab-row-h) - var(--c-bar-caw-glass-phone));
    }
    /* Joined, its trailing side is the screen's edge, square and with no
       edge drawn, as the card's is below it. */
    [data-slot="join"] {
      --r: calc(var(--c-bar-caw-glass-phone) / 2);
      clip-path: shape(
        from 0 var(--h),
        arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw,
        line to var(--f) var(--r),
        arc to calc(var(--f) + var(--r)) 0 of var(--r) cw,
        line to 100% 0,
        line to 100% 100%,
        line to 0 100%,
        close
      );
    }
    [data-slot="top"][data-floating] {
      border-bottom: 0;
      background: none;
    }
    /* Under the floating bar the session's tab row is the screen's top
       row: the insets beside it are its shelf, the rest the shell's ground
       the transcript stands on. */
    [data-slot="shell-content"][data-floating] {
      background: linear-gradient(var(--surface-shelf), var(--surface-shelf))
        top / 100% var(--c-top-bar-h) no-repeat;
    }
  }

  /* residual: foreign-dom — the group's items (MachinesButton's, NeedsCaw's
     and this file's Jump, each `[data-bar-item]`, its symbol `.bar-symbol`):
     borderless (Apple HIG, Toolbars: "Borders… aren't necessary because the
     section provides a visible container"), on the glass itself, every one
     the same height with the same symbol size, in the bar's one ink. Hover
     lifts it by the hover step; a press is each item's `press-tint`
     (DESIGN.md, The Press Rule: grouped controls tint), by day the step
     past this hover. An item's symbol is named so: an item may draw more
     than its symbol (Caw's rim is an SVG too). On the phone's row Caw, the
     group's one item, is the glass's whole box. */
  [data-slot="tools"] :global([data-bar-item]) {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--c-bar-item);
    block-size: var(--c-bar-item);
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--ink-strong);
    cursor: pointer;
    transition: var(--transition-control);
  }
  [data-slot="tools"] :global(.bar-symbol) {
    inline-size: var(--c-bar-symbol);
    block-size: var(--c-bar-symbol);
    color: var(--ink-muted);
  }
  @media (hover: hover) and (pointer: fine) {
    [data-slot="tools"] :global([data-bar-item]:hover) {
      background: var(--surface-hover);
    }
  }
  @media (max-width: 899px) {
    [data-slot="tools"] :global([data-bar-item]) {
      inline-size: var(--c-bar-caw-glass-phone);
      min-inline-size: var(--c-bar-caw-glass-phone);
      block-size: var(--c-bar-caw-glass-phone);
    }
  }
  /* css-scope: the Sidebar's brand row inside this file's sheet (data-rail-sheet) stops short of the sheet's close button, so no area lies under it */
  :global([data-rail-sheet] [data-slot="sidebar-brand-row"]) {
    margin-inline-end: var(--rail-sheet-close-room);
  }
</style>
