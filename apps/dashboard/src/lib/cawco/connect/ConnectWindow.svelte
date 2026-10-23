<script lang="ts">
  /**
   * Add machine: a modal, the kit's dialog (DESIGN.md, Dialog, sheet and
   * drawer), from the machine's details to its outcome (The Work Outlives
   * Its Surface Rule). Mounted once (Shell).
   *
   * - **Where it stands.** Centred over the scrim, the page behind it held
   *   and the focus kept inside it; under the phone line the kit's bottom
   *   sheet, lifted over the keyboard. A press on the scrim leaves it open
   *   (the owner: "IT'S A MODAL"); × and Esc close it, and on a phone a
   *   finger dragging the sheet down is its ×.
   * - **Closing minimizes the work.** On an install it flies into the
   *   install's row in the machines list over 280ms on the drawer curve
   *   when that row is on screen, else into the bar's machines item, the
   *   row hidden while the copy flies; the row and the bar's count go on
   *   with its step, and a press on the row opens it again out of the row,
   *   exactly where it was. On a phone the sheet leaves and the row echoes
   *   once. On the draft nothing has started, so it just closes.
   * - **Nothing inside scrolls.** Each step is laid out to fit; the dialog
   *   tweens to each step's height (its `morph()`), the steps cross-fading
   *   inside it.
   */
  import { tick, untrack } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { page } from "$app/state";
  import {
    CURVE,
    dur,
    easeOut,
    lifting,
    motionOk,
    numberOf,
    pinned,
  } from "../motion/curves.svelte";
  import { closeInto, land } from "../motion/share.svelte";
  import { connect, INSTALL_PARAM, parkedAt, phone } from "./installs.svelte";
  import OutcomeStep from "./OutcomeStep.svelte";
  import OutputSheet from "./OutputSheet.svelte";
  import ReachStep from "./ReachStep.svelte";
  import RunningStep from "./RunningStep.svelte";
  import { titleOf } from "./words";

  let surface = $state<HTMLElement | null>(null);

  const step = $derived(connect.step);
  const install = $derived(connect.install);
  const title = $derived(titleOf(install));
  /**
   * The page the body shows: its step, and on an outcome which one, so an
   * outcome that turns into another on its own (Lost, then Joined once the
   * fleet lists the machine online) cross-fades inside the dialog's resize.
   */
  const shownPage = $derived(
    step === "outcome" ? `outcome:${install?.state ?? ""}` : step
  );

  /** The page arriving: it fades in where it lays out. */
  function pageIn(_node: Element) {
    return {
      duration: dur("--dur-fade"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  /** The page leaving, pinned where it stood so the dialog is only ever the size of what arrives. */
  function pageOut(node: HTMLElement) {
    return lifting(node, pinned(node), {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    });
  }

  /**
   * Where focus goes back to as it closes: what opened it, while it is on
   * the page, else where its install is minimized (`parkedAt`).
   */
  function returnOf(): HTMLElement | null {
    const own = connect.anchor;
    return own?.isConnected && own.checkVisibility()
      ? own
      : parkedAt(connect.id);
  }

  /**
   * On a phone the sheet stands on the visual viewport's foot, so a
   * keyboard coming up lifts it rather than covering it, and it is never
   * taller than the room the keyboard leaves.
   */
  let keyboard = $state(0);
  let room = $state(0);
  $effect(() => {
    const view = window.visualViewport;
    if (!(connect.open && phone.current && view)) {
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
  /**
   * As tall as it holds, up to the room under the screen's top (its safe
   * area, or `space-7`), as the new-session sheet is: a running install's
   * Stop question is taller than the kit sheet's 85vh.
   */
  const lifted = $derived(
    phone.current
      ? `bottom: ${keyboard}px; max-height: calc(${room > 0 ? `${room}px` : "100dvh"} - max(env(safe-area-inset-top), var(--space-7)));`
      : undefined
  );

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

  /** The row this install is minimized into, when it is on screen. */
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
   * Closed on an install, the window minimizes: on a desk it flies into the
   * install's row, or into the bar's machines item, the row hidden until it
   * lands; the dialog stays on the page until the flight has played (bits-ui
   * waits for the content's animations). On a phone the sheet leaves on its
   * own and the row echoes once it has.
   */
  let wasOpen = false;
  $effect(() => {
    const { open } = connect;
    const node = untrack(() => surface);
    if (open || !wasOpen) {
      wasOpen = open;
      return;
    }
    wasOpen = false;
    const parked = untrack(() => connect.id);
    if (!(node && parked)) {
      return;
    }
    const row = rowOf(parked);
    if (phone.current) {
      if (row) {
        setTimeout(() => echo(row), dur("--dur-exit"));
      }
      return;
    }
    const target =
      row ?? document.querySelector<HTMLElement>("[data-machines]");
    if (!target) {
      return;
    }
    const flight = closeInto(node, target, dur("--dur-panel"), CURVE.drawer);
    if (row && flight) {
      row.style.visibility = "hidden";
      const landed = () => {
        row.style.visibility = "";
      };
      flight.finished.then(landed, landed);
    }
  });

  /**
   * The phone's minimize: its sheet leaves and the row the install stands in
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
   * As it opens: reopened from its row on a desk it comes out of the row's
   * box, the reverse of its flight; then the focus goes to its first field
   * (or, back from the output's sheet, its Open output), unless the person
   * has already put it somewhere inside.
   */
  async function arrive(node: HTMLElement): Promise<void> {
    await tick();
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
    const first = node.querySelector<HTMLElement>(
      connect.backFromOutput
        ? "[data-output-opener]"
        : "[data-autofocus], input:not([type=hidden]), [data-slot=pages] button"
    );
    connect.backFromOutput = false;
    if (!node.contains(document.activeElement)) {
      first?.focus({ preventScroll: true });
    }
  }
  $effect(() => {
    const node = surface;
    if (node) {
      // biome-ignore lint/complexity/noVoid: its flight plays on its own clock
      void arrive(node);
    }
  });
</script>

<Dialog.Root
  onOpenChange={(value) => {
    if (!value) {
      connect.close();
    }
  }}
  open={connect.open}
>
  <Dialog.Content
    data-connect-window
    data-phone={phone.current || undefined}
    data-step={step}
    interactOutsideBehavior="ignore"
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      // Minimized for the output's sheet, which holds the focus: not taken back.
      if (!connect.output) {
        returnOf()?.focus({ preventScroll: true });
      }
    }}
    onOpenAutoFocus={(event) => {
      // `arrive` places it, once the window is laid out.
      event.preventDefault();
    }}
    style={lifted}
    width="connect"
    bind:ref={surface}
  >
    <Dialog.Header>
      <Dialog.Title id="connect-title">
        <!-- Starting an install, the address typed in Reach flies into the
             title (its departure, ReachStep); from then on the title morphs. -->
        {#key step === "reach"}
          <span
            class="block min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            {@attach land(() => "connect-title", { uniform: true })}
            ><MorphText text={title} /></span
          >
        {/key}
      </Dialog.Title>
    </Dialog.Header>
    <div data-slot="pages" class="relative grid min-w-0">
      {#key shownPage}
        <div
          data-slot="page"
          data-page={step}
          class="col-start-1 row-start-1 min-w-0"
          in:pageIn
          out:pageOut
        >
          {#if step === "reach"}
            <ReachStep />
          {:else if step === "running" && install}
            <RunningStep {install} />
          {:else if install}
            <OutcomeStep {install} />
          {/if}
        </div>
      {/key}
    </div>
  </Dialog.Content>
</Dialog.Root>

{#if connect.output && connect.install}
  <OutputSheet install={connect.install} />
{/if}
