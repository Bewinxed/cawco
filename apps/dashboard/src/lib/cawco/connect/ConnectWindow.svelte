<script lang="ts">
  /**
   * Add machine's window: one non-modal surface for adding a machine, from
   * choosing how it is reached to its outcome (DESIGN.md, The Work Outlives
   * Its Surface Rule, The Open Page Rule). Mounted once (Shell).
   *
   * - **Where it hangs.** On the desk a popover 480 wide (`c-connect-w`),
   *   raised with a hairline, hung under what opened it (an Add machine, or
   *   the top bar's machines item for a row, a notification or a reload) and
   *   shifted to fit between the bar's hairline and the viewport's foot. It
   *   opens from that side (origin-aware, 260ms) and leaves over 160ms. On a
   *   phone it is the drawer recipe, flush at the foot, as tall as it holds
   *   and never over 85vh. No scrim either way: the page stays live.
   * - **Dismiss parks it.** ×, Esc, a press outside and a drag down close
   *   it; the work goes on, and an outcome stays in its row with its Retry
   *   until Remove install takes it away. On an install it flies into its row in
   *   the machines list over 280ms on the drawer curve when that row is on
   *   screen, else into the bar's machines item, the row hidden while the
   *   copy flies; a press on the row brings it back out of it. On a phone the
   *   drawer leaves and the row echoes once.
   * - **Nothing inside scrolls.** Each step is laid out to fit; the body
   *   tweens between steps' heights on the drawer curve (motion/morph), and
   *   the steps swap inside it: Route and Reach as pages side by side, the
   *   rest cross-fading.
   */
  import { tick, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconClose } from "#lib/icons.js";
  import { page } from "$app/state";
  import {
    CURVE,
    dur,
    easeDrawer,
    easeOut,
    lifting,
    motionOk,
    numberOf,
    pinned,
  } from "../motion/curves.svelte";
  import { morph } from "../motion/morph.svelte";
  import { popIn } from "../motion/pop.svelte";
  import { closeInto, land } from "../motion/share.svelte";
  import { connect, INSTALL_PARAM, parkedAt, phone } from "./installs.svelte";
  import OutcomeStep from "./OutcomeStep.svelte";
  import OutputSheet from "./OutputSheet.svelte";
  import ReachStep from "./ReachStep.svelte";
  import RouteStep from "./RouteStep.svelte";
  import RunningStep from "./RunningStep.svelte";
  import { titleOf } from "./words";

  /** The window stands on the page: from its opening until its leaving has played. */
  let shown = $state(false);
  let surface = $state<HTMLElement | null>(null);
  /** Where it stands on the desk, and the point it grows from. */
  let place = $state({ top: 0, left: 0, originX: 0, originY: 0 });
  /** Its leaving: a flight into the row or the bar, or the plain close. */
  let leaving = $state(false);
  /**
   * It flies into where its work is parked: it holds its open state
   * meanwhile, so its own close (a fade, a rise, a shrink on `data-state`)
   * never runs under the flight's transform.
   */
  let flying = $state(false);

  const step = $derived(connect.step);
  const install = $derived(connect.install);
  const title = $derived(titleOf(install));
  /**
   * The page the body shows: its step, and on an outcome which one, so an
   * outcome that turns into another on its own (Lost, then Joined once the
   * fleet lists the machine online) cross-fades inside the body's resize.
   */
  const shownPage = $derived(
    step === "outcome" ? `outcome:${install?.state ?? ""}` : step
  );

  /**
   * How one step hands its place to the next: Route and Reach as pages side
   * by side (forward to the end, back to the start), every other change a
   * cross-fade inside the body's resize. Read as the swap starts.
   */
  let pageDirection = 0;
  let lastStep: string | null = null;
  $effect.pre(() => {
    const now = step;
    if (lastStep === "route" && now === "reach") {
      pageDirection = 1;
    } else if (lastStep === "reach" && now === "route") {
      pageDirection = -1;
    } else {
      pageDirection = 0;
    }
    lastStep = now;
  });

  /** The page arriving: from beside the one it replaces, or fading in where it lays out. */
  function pageIn(_node: Element) {
    const travel = motionOk.current && pageDirection !== 0;
    return {
      duration: dur(travel ? "--dur-panel" : "--dur-fade"),
      easing: travel ? easeDrawer : easeOut,
      css: (t: number) =>
        travel
          ? `opacity: ${t}; transform: translateX(${(1 - t) * 24 * pageDirection}%)`
          : `opacity: ${t}`,
    };
  }
  /** The page leaving, pinned where it stood so the body is only ever the size of what arrives. */
  function pageOut(node: HTMLElement) {
    const travel = motionOk.current && pageDirection !== 0;
    return lifting(node, pinned(node), {
      duration: dur(travel ? "--dur-panel" : "--dur-exit"),
      easing: travel ? easeDrawer : easeOut,
      css: (t: number) =>
        travel
          ? `opacity: ${t}; transform: translateX(${(t - 1) * 24 * pageDirection}%)`
          : `opacity: ${t}`,
    });
  }

  /**
   * What it hangs from now: the Add machine that opened it; for a row, a
   * notification or a reload, the bar's machines item.
   */
  function anchorOf(): HTMLElement | null {
    const own = connect.anchor;
    if (connect.from === "add" && own?.isConnected && own.checkVisibility()) {
      return own;
    }
    return document.querySelector<HTMLElement>("[data-machines]");
  }

  /**
   * Where focus goes back to as it closes: what opened it, while it is on
   * the page, else where its install is parked (`parkedAt`).
   */
  function returnOf(): HTMLElement | null {
    const own = connect.anchor;
    return own?.isConnected && own.checkVisibility()
      ? own
      : parkedAt(connect.id);
  }

  /**
   * On a phone the drawer stands on the visual viewport's foot, so a
   * keyboard coming up lifts it rather than covering it, and it is never
   * taller than the room the keyboard leaves.
   */
  let keyboard = $state(0);
  let room = $state(0);
  $effect(() => {
    const view = window.visualViewport;
    if (!(shown && phone.current && view)) {
      return;
    }
    const follow = () => {
      keyboard = Math.max(0, innerHeight - (view.height + view.offsetTop));
      room = view.height;
    };
    follow();
    view.addEventListener("resize", follow);
    view.addEventListener("scroll", follow);
    return () => {
      view.removeEventListener("resize", follow);
      view.removeEventListener("scroll", follow);
    };
  });

  /** Placed under its anchor, inside the room between the bar's hairline and the foot. */
  function placeIt(): void {
    if (!surface || phone.current) {
      return;
    }
    const margin = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-screen-margin"
      )
    );
    const barFoot = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-top-bar-h"
      )
    );
    const width = surface.offsetWidth;
    const height = surface.offsetHeight;
    const anchor = anchorOf()?.getBoundingClientRect();
    const gap = margin / 2;
    let top = anchor ? anchor.bottom + gap : barFoot + margin;
    let left = anchor ? anchor.right - width : innerWidth - margin - width;
    if (anchor && anchor.left + anchor.width / 2 < innerWidth / 2) {
      ({ left } = anchor);
    }
    top = Math.max(barFoot + gap, Math.min(top, innerHeight - margin - height));
    left = Math.max(margin, Math.min(left, innerWidth - margin - width));
    const originX = anchor ? anchor.left + anchor.width / 2 - left : width;
    const originY = anchor ? anchor.top + anchor.height / 2 - top : 0;
    place = { top, left, originX, originY };
  }

  $effect(() => {
    if (connect.open) {
      leaving = false;
      shown = true;
    } else if (shown && !leaving) {
      // biome-ignore lint/complexity/noVoid: the leaving plays on its own clock; nothing waits on it here
      void leave();
    }
  });

  /** The hub's installs, once. */
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the band and the window draw what lands
    void connect.load();
  });

  /** A reload or a closed tab takes nothing typed with it: a draft save still waiting goes as the page does. */
  $effect(() => {
    const flush = () => connect.flushDraft();
    addEventListener("pagehide", flush);
    return () => removeEventListener("pagehide", flush);
  });

  /** The URL's window: after a reload, or a link that names an install. */
  $effect(() => {
    const named = page.url.searchParams.get(INSTALL_PARAM);
    if (connect.known) {
      untrack(() => connect.follow(named));
    }
  });

  /**
   * Reach needs the hub's addresses and key, which change on the hub's
   * machine: read once each time the window opens, as Reach first shows (a
   * window on an install never needs them). Reach reads them again only
   * while the hub has no key or the read failed.
   */
  let joinRead = false;
  $effect(() => {
    if (!connect.open) {
      joinRead = false;
      return;
    }
    if (step === "reach" && !joinRead) {
      joinRead = true;
      // biome-ignore lint/complexity/noVoid: fire-and-forget; Reach draws the addresses and key when they land
      void connect.loadJoin();
    }
  });

  /** The row this install is parked in, when it is on screen. */
  function rowOf(id: string | null): HTMLElement | null {
    if (!id) {
      return null;
    }
    // The band is drawn in more than one place (the bar's machines card,
    // the rail's list): the row is the one drawn on screen now.
    const rows = document.querySelectorAll<HTMLElement>(
      `[data-install-row="${CSS.escape(id)}"]`
    );
    for (const row of rows) {
      const box = row.getBoundingClientRect();
      if (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.top < innerHeight &&
        getComputedStyle(row).visibility !== "hidden"
      ) {
        return row;
      }
    }
    return null;
  }

  /**
   * The window's going: on the desk an install's window flies into its row,
   * or into the bar's machines item, hidden row and all; otherwise it plays
   * the plain close. Focus goes back where it came from.
   */
  async function leave(): Promise<void> {
    const node = surface;
    const back = returnOf();
    const parked = connect.id;
    const row = parked ? rowOf(parked) : null;
    const target =
      row ?? document.querySelector<HTMLElement>("[data-machines]");
    if (node && !phone.current && parked && motionOk.current && target) {
      flying = true;
      leaving = true;
      if (row) {
        row.style.visibility = "hidden";
      }
      const flight = closeInto(node, target, dur("--dur-panel"), CURVE.drawer);
      await flight?.finished.catch(() => undefined);
      if (row) {
        row.style.visibility = "";
      }
      flying = false;
    } else {
      leaving = true;
      await new Promise((done) => setTimeout(done, dur("--dur-exit")));
      if (phone.current && row) {
        echo(row);
      }
    }
    if (!connect.open) {
      shown = false;
      leaving = false;
      // Parked for the output's sheet, which holds focus: it is not taken back.
      if (!connect.output) {
        back?.focus({ preventScroll: true });
      }
    }
  }

  /**
   * The phone's park: its drawer leaves and the row the install stands in
   * echoes once, the house echo (DESIGN.md, Working indicator): a copy of
   * its tile grows from it to the echo's scale and fades from 45% over one
   * loop on ease-out, outside the tile, transform and opacity only.
   */
  function echo(row: HTMLElement): void {
    const tile = row.querySelector<HTMLElement>("[data-slot=tile]");
    if (!(tile && motionOk.current)) {
      return;
    }
    const box = tile.getBoundingClientRect();
    const copy = tile.cloneNode(true) as HTMLElement;
    copy.setAttribute("aria-hidden", "true");
    Object.assign(copy.style, {
      position: "fixed",
      top: `${box.top}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      margin: "0",
      pointerEvents: "none",
      zIndex: "var(--layer-flight)",
    });
    document.body.append(copy);
    copy
      .animate(
        [
          { transform: "scale(1)", opacity: 0.45 },
          {
            transform: `scale(${numberOf("--echo-scale") || 1.45})`,
            opacity: 0,
          },
        ],
        { duration: dur("--dur-loop"), easing: CURVE.out }
      )
      .finished.catch(() => undefined)
      .then(() => copy.remove());
  }

  /**
   * The phone's drawer follows a finger down its grabber and head 1:1 and
   * rubber-bands past rest (35% of the travel, at most a quarter of its
   * height); let go past 30% of its height, or flicked down faster than
   * 0.3px/ms, it is dismissed as × dismisses it, else it goes back on its
   * own transition. A mouse never drags: it has Close and Esc.
   */
  function dragToDismiss(node: HTMLElement) {
    let start = 0;
    let at = 0;
    let stamp = 0;
    let speed = 0;
    let held = false;
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (
        !(phone.current && surface) ||
        event.pointerType === "mouse" ||
        target?.closest("button")
      ) {
        return;
      }
      held = true;
      start = event.clientY;
      at = 0;
      speed = 0;
      stamp = event.timeStamp;
      // A pointer the page made (no device behind it) has no capture to take.
      if (event.isTrusted) {
        node.setPointerCapture(event.pointerId);
      }
      surface.style.transition = "none";
    };
    const move = (event: PointerEvent) => {
      if (!(held && surface)) {
        return;
      }
      const travel = event.clientY - start;
      const tall = surface.offsetHeight;
      const drawn =
        travel >= 0 ? travel : -Math.min(tall * 0.25, -travel * 0.35);
      const elapsed = event.timeStamp - stamp;
      if (elapsed > 0) {
        speed = (travel - at) / elapsed;
      }
      at = travel;
      stamp = event.timeStamp;
      surface.style.translate = `0 ${drawn}px`;
    };
    const up = () => {
      if (!(held && surface)) {
        return;
      }
      held = false;
      const away = at > surface.offsetHeight * 0.3 || speed > 0.3;
      surface.style.transition = "";
      surface.style.translate = "";
      if (away) {
        connect.close();
      }
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    };
  }

  /**
   * How it comes onto the page: on a desk as every floating surface does
   * (`popIn`, from above the place it hangs under), on a phone as its
   * drawer rises from the screen's foot over --dur-panel; with reduced
   * motion a fade. Never by `@starting-style`, which WebKit sometimes skips
   * for an element just added (motion/pop). Reopened from its row it comes
   * out of the row's box instead (`arrive`), and this stands aside; added
   * closed, it has nothing to show.
   */
  function enter(node: HTMLElement): TransitionConfig {
    const row = rowOf(connect.id);
    if (
      node.dataset.state !== "open" ||
      (row && connect.anchor === row && !phone.current)
    ) {
      return { duration: 0 };
    }
    if (!phone.current) {
      return popIn(node, { side: "bottom" });
    }
    if (!motionOk.current) {
      return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
    }
    return {
      duration: dur("--dur-panel"),
      easing: easeDrawer,
      css: (_t, u) => `translate: 0 ${(u * 100).toFixed(2)}%`,
    };
  }

  /** Reopened from a row: it comes back out of the row's box, the reverse of its flight. */
  async function arrive(node: HTMLElement): Promise<void> {
    await tick();
    placeIt();
    const row = rowOf(connect.id);
    if (row && connect.anchor === row && motionOk.current && !phone.current) {
      const to = node.getBoundingClientRect();
      const from = row.getBoundingClientRect();
      row.style.visibility = "hidden";
      const flight = node.animate(
        [
          {
            transformOrigin: "0 0",
            transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
            opacity: 0,
          },
          { transformOrigin: "0 0", transform: "none", opacity: 1 },
        ],
        { duration: dur("--dur-panel"), easing: CURVE.drawer }
      );
      flight.finished
        .catch(() => undefined)
        .then(() => {
          row.style.visibility = "";
        });
    }
    // Back from the output's sheet: its Open output, where the person left.
    const first = node.querySelector<HTMLElement>(
      connect.backFromOutput
        ? "[data-output-opener]"
        : "[data-autofocus], input:not([type=hidden]), button[data-route], [data-slot=body] button"
    );
    connect.backFromOutput = false;
    first?.focus({ preventScroll: true });
  }

  /** The window keeps its place as its height changes, and as the page moves. */
  $effect(() => {
    const node = surface;
    if (!node) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: its flight plays on its own clock
    void arrive(node);
    // biome-ignore lint/style/noRestrictedGlobals: reads only: the window's height as it tweens, to keep it inside the room under the bar
    const sizes = new ResizeObserver(() => placeIt());
    sizes.observe(node);
    addEventListener("resize", placeIt);
    return () => {
      sizes.disconnect();
      removeEventListener("resize", placeIt);
    };
  });

  /**
   * A press outside closes it; the page under it takes the press too. The
   * bar's machines item it hangs from, and the band its install is parked
   * in, are its own: a press there shows the machines and leaves it open.
   */
  $effect(() => {
    if (!(shown && connect.open)) {
      return;
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (
        !target ||
        surface?.contains(target) ||
        connect.anchor?.contains(target) ||
        target.closest(
          "[data-connect-output], [data-install-row], [data-machines], [data-slot^='dropdown-menu'], [role='menu'], [data-connect-keep]"
        )
      ) {
        return;
      }
      connect.close();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      connect.close();
    }
  }
</script>

{#if shown}
  <div
    bind:this={surface}
    data-connect-window
    tabindex="-1"
    data-step={step}
    data-state={(connect.open && !leaving) || flying ? "open" : "closed"}
    data-phone={phone.current || undefined}
    aria-labelledby="connect-title"
    role="dialog"
    aria-modal="false"
    data-safe-bottom={phone.current || undefined}
    in:enter
    class={[
      "fixed z-(--layer-float) flex flex-col bg-surface-raised text-ink-strong",
      phone.current
        ? "inset-x-0 bottom-0 max-h-c-sheet-max-h overflow-y-auto overscroll-contain rounded-t-lg border-t border-t-border-hairline pb-(--safe-bottom) shadow-drawer transition-[opacity,translate] duration-(--dur-panel) ease-drawer data-[state=closed]:translate-y-full data-[state=closed]:duration-(--dur-exit) data-[state=closed]:ease-out motion-reduce:transition-opacity motion-reduce:data-[state=closed]:translate-y-0 motion-reduce:data-[state=closed]:opacity-0"
        : "max-h-c-connect-max-h w-c-connect-w overflow-y-auto overscroll-contain rounded-lg border border-border-control shadow-overlay transition-opacity duration-(--dur-pop) ease-drawer data-[state=closed]:opacity-0 data-[state=closed]:duration-(--dur-exit) motion-safe:transition-[opacity,translate,scale] motion-safe:data-[state=closed]:scale-(--pop-scale) motion-safe:data-[state=closed]:-translate-y-(--pop-rise)",
    ]}
    style:bottom={phone.current ? `${keyboard}px` : undefined}
    style:max-height={phone.current && room > 0
      ? `min(var(--c-sheet-max-h), ${room}px)`
      : undefined}
    style:top={phone.current ? undefined : `${place.top}px`}
    style:left={phone.current ? undefined : `${place.left}px`}
    style:transform-origin={phone.current
      ? undefined
      : `${place.originX}px ${place.originY}px`}
    {onkeydown}
  >
    {#if phone.current}
      <div
        data-slot="grabber"
        aria-hidden="true"
        class="mx-auto mt-space-2 h-c-grabber-h w-c-grabber-w flex-none touch-none rounded-pill bg-surface-fill"
        {@attach dragToDismiss}
      ></div>
    {/if}
    <header
      data-slot="head"
      class={[
        "mark-line flex flex-none items-center gap-space-2 ps-space-5 pe-space-3 pt-space-4",
        phone.current && "touch-none",
      ]}
      {@attach dragToDismiss}
    >
      <h2
        id="connect-title"
        data-box
        class="m-0 min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-title tracking-title text-ink-strong"
      >
        <!-- Starting an install, the address typed in Reach flies into the
             title (its departure, ReachStep); from then on the title morphs. -->
        {#key step === "route" || step === "reach"}
          <span
            class="block min-w-0 overflow-clip text-ellipsis"
            {@attach land(() => "connect-title", { uniform: true })}
            ><MorphText text={title} /></span
          >
        {/key}
      </h2>
      <button
        type="button"
        data-slot="close"
        aria-label="Close"
        title="Close"
        class="pressable touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong"
        onclick={() => connect.close()}
      >
        <IconClose aria-hidden="true" class="size-icon-md" />
      </button>
    </header>
    <div
      data-slot="body"
      class="relative grid overflow-clip px-space-5 pt-space-3 pb-space-5"
      {@attach morph()}
    >
      {#key shownPage}
        <div
          data-slot="page"
          data-page={step}
          class="col-start-1 row-start-1 min-w-0"
          in:pageIn
          out:pageOut
        >
          {#if step === "route"}
            <RouteStep />
          {:else if step === "reach"}
            <ReachStep />
          {:else if step === "running" && install}
            <RunningStep {install} />
          {:else if install}
            <OutcomeStep {install} />
          {/if}
        </div>
      {/key}
    </div>
  </div>
{/if}

{#if connect.output && connect.install}
  <OutputSheet install={connect.install} />
{/if}
