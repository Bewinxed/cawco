<script lang="ts">
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
  import { TextMorph } from "torph/svelte";
  import {
    crossOut,
    dur,
    ease,
    easeOut,
    morphMs,
    motionOk,
    popScale,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { pageIn, pageOut, route } from "#lib/cawco/motion/route.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { gridView } from "#lib/cawco/workspace/grid-view.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { setSidebar } from "#lib/components/ui/sidebar/context.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { DRAWER_QUERY, NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconChevronLeft,
    IconSearch,
    IconShield,
    IconSidebar,
  } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import { browser } from "$app/env";
  import { goto, onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import AddMachineDialog from "./AddMachineDialog.svelte";
  import AssistantOrb from "./assistant/AssistantOrb.svelte";
  import AssistantPanel from "./assistant/AssistantPanel.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { cawco, hubSocketUrl, reconnectNow } from "./client.svelte";
  import { continuing } from "./continue.svelte";
  import JumpPalette, { type JumpOpener } from "./JumpPalette.svelte";
  import MachinesButton from "./MachinesButton.svelte";
  import SessionSurface from "./SessionSurface.svelte";
  import Sidebar from "./Sidebar.svelte";
  import NewSessionDialog from "./spawn/NewSessionDialog.svelte";
  import { newSession, spawning } from "./spawn/new-session.svelte";
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
  /** The plan's measured sidebar ("sidebar | 228"); a reader's own width overrides it. */
  const RAIL_DEFAULT = 228;

  const clamp = (px: number) =>
    Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(px || RAIL_DEFAULT)));

  let {
    children,
    /** Read from the `cawco-rail-width` cookie server-side (see
     *  +layout.server.ts) so the first paint is already the resolved width —
     *  the rail no longer renders the default and jumps on hydration. */
    railWidth: initialRailWidth = RAIL_DEFAULT,
  }: { children: import("svelte").Snippet; railWidth?: number } = $props();

  // Seeded once from the server's reading; dragging owns it after that.
  let railWidth = $state(untrack(() => clamp(initialRailWidth)));
  let jumpOpen = $state(false);
  /** What opened the palette, which decides how it arrives (JumpPalette). */
  let jumpOpener = $state<JumpOpener>("key");
  let railOpen = $state(false);
  let assistantOpen = $state(false);

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
    const stored = Number(localStorage.getItem(RAIL_KEY));
    setRail(Number.isFinite(stored) && stored > 0 ? stored : railWidth);
  });

  /**
   * Show a width. Runs on every frame of a drag, so it does no more than that.
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
   * Remember the width the reader settled on. Runs once, when they let go.
   *
   * Separated from showing it because these two writes are not cheap where it
   * matters: both localStorage and `document.cookie` are synchronous, and in
   * WebKit both are a round trip to another process. Doing them per
   * `pointermove` — 120 a second on an iPad — is what made dragging this
   * handle unusable on one, while staying fast enough on a desktop to hide.
   * The width is a preference; it is worth storing when it stops changing,
   * not while it is changing.
   */
  function rememberRail() {
    try {
      localStorage.setItem(RAIL_KEY, String(railWidth));
      // biome-ignore lint/suspicious/noDocumentCookie: +layout.server.ts reads this same cookie for the SSR-resolved rail width; the Cookie Store API is unavailable in every browser this app supports
      document.cookie = `${RAIL_KEY}=${railWidth};path=/;max-age=31536000;samesite=lax`;
    } catch {
      // A browser that will not store just starts at the default next time.
    }
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
    let latest = railWidth;
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
        next = railWidth - step;
        break;
      case "ArrowRight":
        next = railWidth + step;
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
    if (motionOk.current && from !== railWidth) {
      railStep = rail.animate(
        [
          { width: `${from}px`, flexBasis: `${from}px` },
          { width: `${railWidth}px`, flexBasis: `${railWidth}px` },
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

  function shortcut(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }
    if (isTyping()) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "n" && event.shiftKey) {
      event.preventDefault();
      newSession();
      return;
    }
    if (key === "k") {
      event.preventDefault();
      jumpOpener = "key";
      jumpOpen = !jumpOpen;
      return;
    }
    if (key === "j") {
      event.preventDefault();
      assistantOpen = !assistantOpen;
      return;
    }
    // Split the focused group, putting the conversation in front into the new
    // half. `mod+\` is the binding VS Code uses for exactly this, and this is
    // a straight copy of that model — borrowing the gesture's name too costs
    // nothing and saves the reader learning a second one.
    if (key === "\\" && onSession) {
      const here = workspace.activeSessionId;
      if (!here || workspace.openIds.length < 2) {
        return;
      }
      event.preventDefault();
      workspace.split(
        workspace.focusedLeafId,
        event.shiftKey ? "bottom" : "right",
        here
      );
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
        node.classList.remove("parked");
        const { end, ms } = travelOf(showing);
        const away: Keyframe = {
          transform: `translate(${end.x}%, ${end.y}%)`,
          opacity: end.opacity,
        };
        const home: Keyframe = { transform: "none", opacity: 1 };
        const animation = node.animate(showing ? [away, home] : [from, away], {
          duration: ms,
          easing: ease("--ease-drawer"),
          fill: "forwards",
        });
        travelling = animation;
        animation.finished.then(
          () => {
            if (travelling !== animation) {
              return;
            }
            node.classList.toggle("parked", !showing);
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
  if (!browser) {
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
    // The Cookie Store API is async and unsupported in Safari; this write must
    // land synchronously before the next SSR request reads it back. Written
    // here, on every route, so the server's answer is the one the page last
    // used, orientation included — `/config` decides list-or-section by it.
    // biome-ignore lint/suspicious/noDocumentCookie: needs the synchronous write; Cookie Store API is async and Safari lacks it
    document.cookie = `cawco-narrow=${narrow ? 1 : 0};path=/;max-age=31536000;samesite=lax`;
  });
  /** The groups whose tabs the bar carries, once the session has shown, on any route: those along the workspace's top edge. */
  const barLeaves = $derived(surfaceMounted && !narrow ? gridView.tops : []);
  /** Whether the bar shows them: on a session page. */
  const hosting = $derived(onSession && barLeaves.length > 0);

  /* ── The bar's slot ──────────────────────────────────────────────────
     The hosted tabs, the crumb and Configure's back link take turns in one
     slot. The one leaving is lifted out of the row where it stands and
     fades over --dur-control; the one arriving rises 4px as it fades in
     over the same length, and the hosted strip comes down 6px from the
     bar's edge instead. With less motion, only the fades run.
     The strip is the session surface's, so like the surface it is kept
     once it has been drawn: under another spoke it is lifted out of the
     row and hidden, not unmounted, and comes back as it was left. */
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
  const followPanes: Attachment<HTMLElement> = (slot) => {
    const written = new WeakMap<HTMLElement, string>();
    const place = () => {
      const area = slot.getBoundingClientRect();
      for (const col of slot.querySelectorAll<HTMLElement>(":scope > .col")) {
        const group = document.querySelector(
          `[data-leaf="${col.dataset.col}"]`
        );
        if (!group) {
          continue;
        }
        const box = group.getBoundingClientRect();
        const x = `${box.left - area.left}px`;
        const w = `${Math.max(0, Math.min(box.width, area.right - box.left))}px`;
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
      node.classList.toggle("away", !seen);
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
            node.classList.remove("lifted", "away");
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
          node.classList.add("lifted");
          const out = node.animate([{ opacity: 1 }, { opacity: 0 }], {
            ...timing,
            fill: "forwards",
          });
          fading = out;
          out.finished.then(
            () => {
              if (fading === out) {
                node.classList.add("away");
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

  /* The attention control grows out of the bar's top edge from the pop
     scale as it fades in, over --dur-menu, and shrinks back into it over
     --dur-exit. */
  const badge = (enter: boolean) => (_node: Element) => {
    const pop = popScale();
    return {
      duration: dur(enter ? "--dur-menu" : "--dur-exit"),
      easing: easeOut,
      css: (t: number, u: number) =>
        motionOk.current
          ? `opacity: ${t}; transform-origin: top center; transform: scale(${1 - (1 - pop) * u})`
          : `opacity: ${t}`,
    };
  };
  const badgeIn = badge(true);
  const badgeOut = badge(false);

  /** Which section the bar names, for the readers who arrived by URL. */
  const crumb = $derived.by(() => {
    // A path nothing answers is not a section: the bar says what happened.
    if (page.error) {
      return page.status === 404 ? "Not found" : "Error";
    }
    const [section] = page.url.pathname.split("/").filter(Boolean);
    switch (section) {
      case undefined:
      case "session":
        return "Fleet";
      case "project":
        return "Project";
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
    if (s === "connected") {
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

<svelte:window onkeydown={shortcut}></svelte:window>

<a class="skip" href="#main-content">Skip to content</a>

<!-- `--rail-w` is set before the body parses (app.html) from the same key this
     component writes; the server's cookie width is the fallback under it. SSR
     therefore emits no committed width of its own, and there is nothing to
     snap away from on hydration. -->
<!-- One provider: every tooltip in the app shares its delay and its skip. -->
<Tooltip.Provider>
  <div class="shell" style="--sidebar-width: var(--rail-w, {railWidth}px)">
    <aside class="rail hidden min-[900px]:flex">
      {#if railed}
        <Sidebar
          {assistantOpen}
          {narrow}
          onassistant={() => {
            assistantOpen = !assistantOpen;
          }}
          scroller={keepScroll}
        />
      {/if}
      <div
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemax={RAIL_MAX}
        aria-valuemin={RAIL_MIN}
        aria-valuenow={railWidth}
        class="grip"
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
      <Sheet.Content
        class="rail-sheet w-[284px] p-0 min-[900px]:hidden"
        side="left"
      >
        <Sheet.Header class="sr-only">
          <Sheet.Title>Navigation</Sheet.Title>
        </Sheet.Header>
        {#if !railed}
          <Sidebar
            {assistantOpen}
            {narrow}
            onassistant={() => {
              railOpen = false;
              assistantOpen = true;
            }}
          />
        {/if}
      </Sheet.Content>
    </Sheet.Root>

    <div class="main">
      <header class="top" class:hosting={hosting}>
        <button
          aria-label="Open navigation"
          class="burger min-[900px]:hidden"
          onclick={() => {
            railOpen = true;
          }}
          type="button"
        >
          <IconSidebar />
        </button>
        <!-- The one "where am I" label, now visible at every width — the brand
           lives in the rail, and the crumb is what the top bar owes a reader
           who arrived by URL. -->
        <div class="slot">
          {#if barLeaves.length > 0}
            <div
              class="slot-tabs"
              {@attach barTabs(() => hosting)}
              {@attach followPanes}
            >
              {#each barLeaves as leaf, i (leaf.id)}
                <!-- Each group's tabs, standing over the group they belong
                   to: its box follows the group's (followPanes). -->
                <div
                  class="col"
                  data-col={leaf.id}
                  data-focused={workspace.focusedLeafId === leaf.id ||
                    undefined}
                  class:seam={i > 0}
                >
                  <span aria-hidden="true" class="col-rail"></span>
                  <PaneTabs hosted {leaf} />
                </div>
              {/each}
            </div>
          {/if}
          {#if hosting}
            <!-- The strips above have the slot. -->
          {:else if narrow && page.url.pathname.startsWith("/config/")}
            <!-- Inside a section on a phone the rail is its own page, so the bar
               leads back to it. -->
            <a
              class="crumb back pressable"
              href="/config"
              in:riseIn
              out:crossOut
              ><IconChevronLeft />Configure</a
            >
          {:else}
            <span class="crumb" in:riseIn out:crossOut>
              <MorphText text={crumb} />
            </span>
          {/if}
        </div>

        <div class="right">
          <!-- First, so the order read is the order drawn: below 900px it stands
             left of the cluster rather than in it (the style below). It
             grows out of the bar's edge and back into it; its count morphs
             digit by digit. -->
          {#if cawco.blockedCount > 0}
            <a
              class="icobtn touch-hit"
              href="/session"
              title="{cawco.blockedCount} waiting on you"
              in:badgeIn
              out:badgeOut
            >
              <IconShield />
              <span class="badge"
                ><TextMorph
                  as="span"
                  duration={morphMs()}
                  text={String(cawco.blockedCount)}
                /></span
              >
            </a>
          {/if}
          <!-- Jump, once, at every width: the far end of the tab row, beside
             the conversations it jumps between. A phone shows its glyph. -->
          <!-- The machines, one click away beside Jump. -->
          <MachinesButton />
          <Tip keys="⌘K" label="Jump to session">
            {#snippet children(
              tip
            )}
              <Button
                {...tip}
                aria-label="Jump to session"
                class="jump"
                data-share="jump"
                onclick={(event: MouseEvent) => {
                  jumpOpener = event.currentTarget as HTMLElement;
                  jumpOpen = true;
                }}
                size="sm"
                variant="outline"
              >
                <IconSearch />
                <span class="hidden sm:inline">Jump</span>
                <kbd
                  class="hidden font-sans text-meta text-muted-foreground min-[900px]:inline"
                  >⌘K</kbd
                >
              </Button>
            {/snippet}
          </Tip>
          <!-- The phone's summon; on a desktop the rail carries it as a row. -->
          <span class="min-[900px]:hidden">
            <AssistantOrb
              onclick={() => {
                assistantOpen = !assistantOpen;
              }}
              open={assistantOpen}
            />
          </span>
          <!-- No always-on hub dot: a green light that is green 99% of the time
             says nothing. Connection health folds into the banner below, which
             is shown only when the hub is NOT connected. The theme toggle
             lives in the rail's footer with the account row. -->
        </div>
      </header>

      <!-- Server-side there is no socket to have lost, so the banner would render
         into every first paint and flash away on hydration. -->
      <!-- The banner is uncovered from under the bar and closes back into it
         (motion/rows); its slot floats over the page, so it moves nothing. -->
      <div class="banner-slot" {@attach reflow()}>
        {#if browser && showBanner}
          <div
            class="banner {everConnected ? "warn" : "bad"}"
            data-flip
            role="status"
          >
            {#if everConnected}
              <span
                >Hub connection lost — retrying in
                <TextMorph
                  as="span"
                  duration={morphMs()}
                  text="{retryIn}s"
                /></span
              >
            {:else}
              <span>Can't reach the hub at <code>{hubSocketUrl()}</code></span>
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
      <main class="content" id="main-content" class:safe={!onSession}>
        <!-- The page is keyed on its route, so a navigation swaps one page for
           the next through their own transitions (motion/route.svelte.ts):
           both stand in this one grid cell while they overlap. Every
           conversation is one key, and so is Configure, which keys its own
           pane so its rail holds still. -->
        <div class="swap">
          {#key pageKey}
            <div class="page" in:pageIn out:pageOut>{@render children()}</div>
          {/key}
          <!-- After the keyed page, so it is drawn over the empty one a
             `/session` route renders. -->
          {#if surfaceMounted}
            <div class="page" in:pageIn {@attach park(() => onSession)}>
              <SessionSurface shown={onSession} />
            </div>
          {/if}
        </div>
      </main>
    </div>
  </div>

  <JumpPalette opener={jumpOpener} bind:open={jumpOpen} />
  <!-- One dialog for every destructive confirm in the app (see confirm.svelte.ts). -->
  <ConfirmDialog />
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

  <AssistantPanel bind:open={assistantOpen} />
</Tooltip.Provider>

<style>
  .skip {
    position: absolute;
    left: -9999px;
    z-index: 100;
    padding: var(--space-2) var(--space-4);
    background: var(--surface-raised);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-tile);
  }
  .skip:focus {
    left: var(--space-4);
    top: var(--space-4);
  }

  .shell {
    display: flex;
    height: 100dvh;
    width: 100%;
    background: var(--surface-recess);
    overflow: hidden;
  }

  .rail {
    position: relative;
    width: var(--sidebar-width);
    flex: 0 0 var(--sidebar-width);
    min-width: 0;
    border-right: 1px solid var(--border-hairline);
  }
  /* In the sheet the close button sits in the brand row's corner (16px in,
     30px wide, and 7px of touch area around it): the brand row stops short of
     it, so neither one's area lies under the other. */
  :global(.rail-sheet [aria-label="Workspace"]) {
    width: auto;
    margin-inline-end: 46px;
  }
  .grip {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -3px;
    width: 6px;
    cursor: col-resize;
    touch-action: none;
    z-index: 5;
  }
  .grip:hover {
    background: var(--border-control);
  }

  .main {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .top {
    /* The comp's bar height (app.css `--c-top-bar-h`); hosted folder tabs
       stand on its floor. `--c-top-bar-h` carries it, so what floats under
       the bar lands under it. */
    height: var(--c-top-bar-h);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    /* The right inset is the content's right pad, so the cluster's edge
       stands over the page's (the reference comp's 21px). The left inset is
       the crumb's own (below), so the slot starts at the bar's edge whether
       it holds the crumb or the tabs, and nothing in it moves as they swap. */
    padding: 0 var(--space-6) 0 0;
    background: var(--surface-raised);
    border-bottom: 1px solid var(--seam);
  }
  /* Hosting the tabs, the bar is the shelf they stand on: two steps below
     the transcript and one below an unchosen tab, so the chosen tab — a
     sheet in the transcript's own surface — reads as the page it opens.
     The hairline sits in the bar's bottom pixel, where the sheet ends and
     covers it. */
  /* Hosting the tabs, the bar gives the first tab no extra inset: the
     track's own flare room is the margin. */
  .top.hosting {
    border-bottom: 0;
    background:
      linear-gradient(var(--border-hairline), var(--border-hairline)) bottom /
      100% 1px no-repeat,
      var(--surface-shelf);
  }
  /* One slot for the bar's left-hand content, positioned so the one leaving
     can be lifted out of the row where it stands (crossOut). It takes the
     room the hosted strip fills; a crumb just sits at its start. */
  .slot {
    position: relative;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    align-self: stretch;
    min-width: 0;
  }
  .slot-tabs {
    /* Nothing inside reaches the strip's own size or what is around it: the
       columns are placed by script from the groups' boxes, so they must not
       be able to feed back into the boxes that script observes. */
    contain: layout size;
    position: relative;
    flex: 1 1 0;
    align-self: stretch;
    min-width: 0;
  }
  /* A group's tabs, over the group: left and width are the group's, written
     by followPanes. The divider between two groups goes on up through the
     bar as the line between their columns, where the grid's own stands (the
     1px between the groups): the column's shadow, outside its box. */
  .col {
    position: absolute;
    inset-block: 0;
    inset-inline-start: var(--col-x, 0px);
    inline-size: var(--col-w, 100%);
    display: flex;
    min-width: 0;
    overflow: hidden;
  }
  .col.seam {
    box-shadow: -1px 0 0 var(--border-hairline);
  }
  /* The group the keyboard belongs to, as the group says it: a hairline rail
     down the leading edge. */
  .col-rail {
    position: absolute;
    inset: 0 auto 0 0;
    inline-size: 2px;
    background: var(--ink-muted);
    opacity: 0;
    z-index: 2;
    pointer-events: none;
  }
  .col[data-focused] .col-rail {
    opacity: 0.5;
  }
  @media (prefers-reduced-motion: no-preference) {
    .col-rail {
      transition: opacity var(--dur-control) var(--ease-out);
    }
  }
  /* Leaving, the strip keeps its box but gives up the row; gone, it is
     not drawn. */
  .slot-tabs:global(.lifted) {
    position: absolute;
    inset: 0;
  }
  .slot-tabs:global(.away) {
    visibility: hidden;
  }
  /* Padding, not margin: the crumb leaving is pinned where its border box
     stands (crossOut), and a margin would carry it along. */
  span.crumb {
    padding-inline-start: var(--space-7);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    padding-inline: 4px 8px;
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .back :global(svg) {
    width: 16px;
    height: 16px;
  }
  .burger {
    width: 44px;
    height: 44px;
    margin-left: calc(-1 * var(--space-2));
    display: grid;
    place-items: center;
    border: 0;
    background: none;
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    cursor: pointer;
  }
  /* At the mock's 900px breakpoint the rail returns and the burger retires.
     Scoped so it beats the display:grid above, which a utility class cannot. */
  @media (min-width: 900px) {
    .burger {
      display: none;
    }
  }
  .burger :global(svg) {
    width: 20px;
    height: 20px;
  }
  /* The cluster's controls sit a --space-2 gap apart and their touch areas
     meet in it; on a coarse pointer the gap opens to 16px, so a 28px control's
     area reaches 44px. */
  .right {
    --hit-gap-x: var(--space-2);
    position: relative;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);

    @media (pointer: coarse) {
      --hit-gap-x: 16px;
      gap: 16px;
    }
    min-width: 0;
  }
  .top.hosting .right {
    flex: 0 0 auto;
    padding-left: var(--space-3);
  }
  /* The client hosts the tabs only where NARROW_QUERY (hooks/is-mobile)
     says wide. The server has only a guess on a first visit, before the
     width cookie: a browser whose user agent reads as a desktop is drawn
     hosting at any width, and where the query says narrow the client swaps
     the tabs for the crumb as it hydrates. The same query here makes that
     first paint the narrow bar already, its inset and ground, the hosted
     tabs not drawn, so nothing in the bar moves in the swap. */
  @media (max-width: 899px), (pointer: coarse) and (orientation: portrait) {
    .top {
      padding-inline-start: var(--space-7);
    }
    span.crumb {
      padding-inline-start: 0;
    }
    .top.hosting {
      border-bottom: 1px solid var(--seam);
      background: var(--surface-raised);
    }
    .top.hosting .right {
      flex: 0 1 auto;
      padding-left: 0;
    }
    .top.hosting .slot-tabs {
      display: none;
    }
  }
  /* One family: every control in the cluster is the same 28px box — the
     hairline, the raised surface, the control radius, the same type — so
     spend, Jump, the assistant and the theme toggle read as one row. */
  .right > :global(:is(.jump, [data-slot="button"])) {
    height: 28px;
    min-width: 28px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  .right > :global(:is(.jump, [data-slot="button"])) {
    background: var(--surface-raised);
    box-shadow: none;
  }
  /* This rule is unlayered and outranks the kit button's own hover (a
     layered utility), so the cluster states its hover itself. */
  @media (hover: hover) and (pointer: fine) {
    .right > :global(:is(.jump, [data-slot="button"]):hover:not(:disabled)) {
      background: var(--surface-hover);
    }
  }
  .right > :global([data-slot="button"]:not(.jump)) {
    width: 28px;
  }
  .right :global(.jump) {
    gap: var(--space-2);
    padding: 0 var(--space-3);
  }
  .right :global(.jump svg) {
    width: 16px;
    height: 16px;
  }
  /* The cluster mutes a glyph only where its control carries no tone of its
     own: a toned control (MachinesButton's `data-tone`) inks its glyph itself,
     and this scoped rule would outrank it. */
  .right :global(.jump:not([data-tone]) svg) {
    color: var(--ink-muted);
  }

  .icobtn {
    position: relative;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-hairline);
    background: var(--surface-raised);
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    cursor: pointer;
  }
  .icobtn :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .icobtn:hover,
    .burger:hover {
      background: var(--surface-hover);
    }
  }
  /* Tactile press — the affordance dips under the finger, only the transform
     transitions, and it is suppressed for reduced-motion. */
  .icobtn,
  .burger {
    transition: background var(--dur-control) var(--ease-in-out);
  }
  @media (prefers-reduced-motion: no-preference) {
    .icobtn:active,
    .burger:active {
      transform: scale(var(--press-scale));
    }
  }
  .badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: var(--radius-pill);
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    display: grid;
    place-items: center;
    font-variant-numeric: tabular-nums;
  }
  /* The attention control comes and goes with the queue. Below 900px, where
     the cluster also holds Jump and the assistant, it stands the cluster's
     gap to the left of them and out of the row's flow: arriving, it widens
     nothing, so nothing already drawn moves (it pushed the cluster aside
     before, 0.0008 CLS at 390). Wider, it is the cluster's only control. */
  @media (max-width: 899px) {
    .right > .icobtn {
      position: absolute;
      top: 50%;
      right: calc(100% + var(--hit-gap-x));
      translate: 0 -50%;
    }
  }

  /* The banner floats over the page's top edge, under the bar, rather than
     taking a row of its own: it comes and goes with the socket, often for a
     second while the hub restarts, and a row pushed the whole page down and
     back each time (0.52 CLS on the board for one restart). */
  .banner-slot {
    position: absolute;
    inset-inline: 0;
    top: var(--c-top-bar-h);
    z-index: 10;
  }
  .banner {
    box-shadow: var(--shadow-tile);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-variant-numeric: tabular-nums;
    padding: var(--space-2) var(--space-6) var(--space-2) var(--space-7);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    border-bottom: 1px solid var(--border-hairline);
  }
  /* The sentence takes the room, so the countdown ticking in it never moves
     the button at the end. */
  .banner > span {
    flex: 1 1 auto;
    min-width: 0;
  }
  .banner.warn {
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .banner.bad {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  .banner code {
    font-family: var(--font-mono);
    font-size: var(--text-label);
  }

  .content {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* A page sliding in sideways must not open a horizontal scrollbar for
       the length of its travel; wide content scrolls in its own box. */
    overflow-x: hidden;
    overflow-y: auto;
  }
  /* One grid cell, a page's height: an outgoing and an incoming page stand
     in it together while they overlap, and a page taller than the screen
     overflows it into the content's scroll exactly as it did as a flex
     child of the content. */
  .swap {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    flex: 1 1 auto;
    min-height: 0;
  }
  .page {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  /* The session surface under another spoke: laid out, so its virtualisers
     keep their measurements and its scroll offsets stand, but not drawn. */
  .page:global(.parked) {
    visibility: hidden;
  }
  /* Own the home-indicator inset where no composer is present to own it. */
  @media (pointer: coarse) {
    .content.safe {
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
