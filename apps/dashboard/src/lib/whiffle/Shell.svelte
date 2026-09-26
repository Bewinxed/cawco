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
  import { TextMorph } from "torph/svelte";
  import { browser } from "$app/environment";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Sheet from "$lib/components/ui/sheet";
  import { setSidebar } from "$lib/components/ui/sidebar/context.svelte";
  import { IsMobile, IsTouchPortrait } from "$lib/hooks/is-mobile.svelte";
  import {
    IconChevronLeft,
    IconSearch,
    IconShield,
    IconSidebar,
  } from "$lib/icons";
  import { isTyping } from "$lib/utils/typing";
  import AssistantOrb from "./assistant/AssistantOrb.svelte";
  import AssistantPanel from "./assistant/AssistantPanel.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { hubSocketUrl, reconnectNow, whiffle } from "./client.svelte";
  import JumpPalette from "./JumpPalette.svelte";
  import Sidebar from "./Sidebar.svelte";
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

  const RAIL_KEY = "whiffle-rail-width";
  const RAIL_MIN = 216;
  const RAIL_MAX = 520;
  const RAIL_DEFAULT = 340;

  const clamp = (px: number) =>
    Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(px || RAIL_DEFAULT)));

  let {
    children,
    /** Read from the `whiffle-rail-width` cookie server-side (see
     *  +layout.server.ts) so the first paint is already the resolved width —
     *  the rail no longer renders the default and jumps on hydration. */
    railWidth: initialRailWidth = RAIL_DEFAULT,
  }: { children: import("svelte").Snippet; railWidth?: number } = $props();

  // Seeded once from the server's reading; dragging owns it after that.
  let railWidth = $state(untrack(() => clamp(initialRailWidth)));
  let jumpOpen = $state(false);
  let railOpen = $state(false);
  let assistantOpen = $state(false);

  /**
   * The rail's width is settled before the first paint, in two places at once.
   *
   * SSR draws it from the `whiffle-rail-width` cookie, and the inline script in
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

  function resizeKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 32 : 8;
    switch (event.key) {
      case "ArrowLeft":
        setRail(railWidth - step);
        break;
      case "ArrowRight":
        setRail(railWidth + step);
        break;
      case "Home":
        setRail(RAIL_MIN);
        break;
      case "End":
        setRail(RAIL_MAX);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // The sheet is a place you go through, not one you stay in.
  afterNavigate(() => {
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
    if (key === "k") {
      event.preventDefault();
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
  const mobile = new IsMobile(900);
  const touchPortrait = new IsTouchPortrait();
  const narrow = $derived(
    browser
      ? mobile.current || touchPortrait.current
      : (page.data.narrow as boolean)
  );
  const hostedLeaf = $derived(
    onSession && !narrow && workspace.root.t === "l" ? workspace.root : null
  );

  /** Which section the bar names, for the readers who arrived by URL. */
  const crumb = $derived.by(() => {
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
    if (whiffle.status === "connected") {
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
    const s = whiffle.status;
    if (s === "connected") {
      return false;
    }
    // A socket that errored or was declared disconnected is a known fault —
    // show the banner once the grace has elapsed or the attempt has failed,
    // without requiring a prior successful connection.
    if (s === "disconnected" || s === "error") {
      return whiffle.connectFailed || graceOver;
    }
    // `connecting` is the transient every cold load passes through. Show the
    // banner only when a prior connection has been lost and the grace elapsed.
    return everConnected && graceOver;
  });

  // The countdown is a clock, not a frame: 250ms is fast enough that the number
  // never looks stuck and slow enough to cost nothing.
  let now = $state(Date.now());
  $effect(() => {
    if (whiffle.status === "connected") {
      return;
    }
    const timer = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(timer);
  });
  const retryIn = $derived(
    whiffle.retryAt ? Math.max(0, Math.ceil((whiffle.retryAt - now) / 1000)) : 0
  );
</script>

<svelte:window onkeydown={shortcut} />

<a class="skip" href="#main-content">Skip to content</a>

<!-- `--rail-w` is set before the body parses (app.html) from the same key this
     component writes; the server's cookie width is the fallback under it. SSR
     therefore emits no committed width of its own, and there is nothing to
     snap away from on hydration. -->
<div class="shell" style="--sidebar-width: var(--rail-w, {railWidth}px)">
  <aside class="rail hidden min-[900px]:flex">
    <Sidebar
      {assistantOpen}
      onassistant={() => {
        assistantOpen = !assistantOpen;
      }}
      onjump={() => {
        jumpOpen = true;
      }}
    />
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

  <Sheet.Root bind:open={railOpen}>
    <Sheet.Content class="w-[284px] p-0 min-[900px]:hidden" side="left">
      <Sheet.Header class="sr-only">
        <Sheet.Title>Navigation</Sheet.Title>
      </Sheet.Header>
      <Sidebar
        {assistantOpen}
        onassistant={() => {
          railOpen = false;
          assistantOpen = true;
        }}
        onjump={() => {
          railOpen = false;
          jumpOpen = true;
        }}
      />
    </Sheet.Content>
  </Sheet.Root>

  <div class="main">
    <header class="top" class:hosting={hostedLeaf !== null}>
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
      {#if hostedLeaf}
        <PaneTabs hosted leaf={hostedLeaf} />
      {:else if narrow && page.url.pathname.startsWith('/config/')}
        <!-- Inside a section on a phone the rail is its own page, so the bar
             leads back to it. -->
        <a class="crumb back" href="/config"><IconChevronLeft />Configure</a>
      {:else}
        <TextMorph as="span" class="crumb" duration={150} text={crumb} />
      {/if}

      <div class="right">
        <!-- Jump is a single entry: the one command surface the top bar opens.
             The old phone thumb bar duplicated it; that bar is gone. -->
        <Button
          class="jump min-[900px]:hidden"
          onclick={() => {
            jumpOpen = true;
          }}
          size="sm"
          title="Jump to session (⌘K)"
          variant="outline"
        >
          <IconSearch />
          <span class="hidden sm:inline">Jump</span>
        </Button>
        {#if whiffle.blockedCount > 0}
          <a
            class="icobtn touch-hit"
            href="/session"
            title="{whiffle.blockedCount} waiting on you"
          >
            <IconShield />
            <span class="badge">{whiffle.blockedCount}</span>
          </a>
        {/if}
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
    {#if browser && showBanner}
      <div class="banner {everConnected ? 'warn' : 'bad'}" role="status">
        {#if everConnected}
          <span>Hub connection lost — retrying in {retryIn}s</span>
          <Button onclick={reconnectNow} size="sm" variant="outline"
            >Reconnect</Button
          >
        {:else}
          <span>Can't reach the hub at <code>{hubSocketUrl()}</code></span>
          <Button onclick={reconnectNow} size="sm" variant="outline"
            >Retry</Button
          >
        {/if}
      </div>
    {/if}

    <!-- The old thumb bar is gone, so this region reclaims its height. On a
         session route the composer owns its own bottom inset; everywhere else
         the scroll region pads the home-indicator safe area itself so the last
         row is never tucked under it. -->
    <main class="content" id="main-content" class:safe={!onSession}>
      {@render children()}
    </main>
  </div>
</div>

<JumpPalette bind:open={jumpOpen} />
<!-- One dialog for every destructive confirm in the app (see confirm.svelte.ts). -->
<ConfirmDialog />

<AssistantPanel bind:open={assistantOpen} />

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
    /* Exclude from view transitions so the sidebar stays rock-still
       while the content area cross-fades on spoke navigation. */
    view-transition-name: sidebar;
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
  .grip:focus-visible {
    background: var(--border-control);
    outline: 2px solid var(--focus-ring);
    outline-offset: 0;
  }

  .main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .top {
    /* The tabs' own height plus a breath above them: 32px folder tabs on
       a 4px track pad, 8px of air. `--c-top-bar-h` carries it, so what
       floats under the bar lands under it. */
    height: var(--c-top-bar-h);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    /* The right inset equals the 8px above and below a 28px control in
       the 44px bar, so the cluster sits in an even frame. */
    padding: 0 calc((44px - 28px) / 2) 0 var(--space-7);
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border-hairline);
    view-transition-name: topbar;
  }
  /* Hosting the tabs, the bar is the shelf they stand on: one step darker
     than the transcript, so the chosen tab — a sheet in the transcript's
     own surface — reads as the page it opens. The hairline sits in the
     bar's bottom pixel, where the sheet ends and covers it. */
  /* Hosting the tabs on a wide screen, the bar gives the first tab no
     extra inset: the track's own flare room is the margin. Narrower, the
     menu button leads and keeps its inset. */
  .top.hosting {
    padding-inline-start: var(--space-4);

    @media (width >= 900px) {
      padding-inline-start: 0;
    }
    border-bottom: 0;
    background:
      linear-gradient(var(--border-hairline), var(--border-hairline)) bottom /
      100% 1px no-repeat,
      var(--surface-recess);
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
    width: 19px;
    height: 19px;
  }
  /* The cluster's controls sit a --space-2 gap apart and their touch areas
     meet in it; on a coarse pointer the gap opens to 16px, so a 28px control's
     area reaches 44px. */
  .right {
    --hit-gap-x: var(--space-2);
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
  /* One family: every control in the cluster is the same 28px box — the
     hairline, the raised surface, the control radius, the same type — so
     spend, Jump, the assistant and the theme toggle read as one row. */
  .right > :global(:is(.jump, [data-slot="button"])) {
    height: 28px;
    min-width: 28px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    font-size: var(--text-label);
  }
  .right > :global(:is(.jump, [data-slot="button"])) {
    background: var(--surface-raised);
    box-shadow: none;
  }
  .right > :global([data-slot="button"]:not(.jump)) {
    width: 28px;
  }
  .right :global(.jump) {
    gap: var(--space-2);
    padding: 0 var(--space-3);
  }
  .right :global(.jump svg) {
    width: 15px;
    height: 15px;
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
    width: 17px;
    height: 17px;
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
    transition: background var(--motion-fast) var(--ease-in-out);
  }
  .icobtn:active,
  .burger:active {
    transform: scale(0.96);
  }
  @media (prefers-reduced-motion: reduce) {
    .icobtn:active,
    .burger:active {
      transform: none;
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
    font-weight: var(--weight-strong);
    display: grid;
    place-items: center;
  }

  .banner {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-6) var(--space-2) var(--space-7);
    font-size: var(--text-label);
    border-bottom: 1px solid var(--border-hairline);
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
    overflow: auto;
    /* Only the content slot transitions — everything above it (sidebar,
       top bar, session tabs) stays still because they have their own
       view-transition-name or are outside this element. */
    view-transition-name: content;
  }
  /* Own the home-indicator inset where no composer is present to own it. */
  @media (pointer: coarse) {
    .content.safe {
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
