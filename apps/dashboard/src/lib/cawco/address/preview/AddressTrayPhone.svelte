<script lang="ts">
  /**
   * A direction's tray on a phone, live, at 390: the phone's screen with
   * Needs you (or Settings) behind, and the tray as the kit's bottom sheet
   * (DESIGN.md, Drawer: full-bleed, flush on the foot, 12px top corners,
   * the hairline, the grabber, up to 85% of the screen, its content
   * scrolling inside). It rises over --dur-panel on the drawer curve and
   * goes over --dur-exit; a finger drags it down to put it away
   * (dragToDismiss), as × and a press on the scrim do. The story's control
   * stands folded under the screen.
   */
  import { HOUR_MS } from "@cawco/core/time";
  import { onDestroy, untrack } from "svelte";
  import NeedsMeta from "#lib/cawco/home/NeedsMeta.svelte";
  import NeedsRow from "#lib/cawco/home/NeedsRow.svelte";
  import { dragToDismiss } from "#lib/cawco/motion/drag.svelte.js";
  import { capLine } from "#lib/cawco/usage.js";
  import { IconDollar } from "#lib/icons.js";
  import { sheetIn, sheetOut } from "../motion";
  import { AddressTray, type Network } from "../tray.svelte";
  import { rowLine } from "../words";
  import AddressRow from "./AddressRow.svelte";
  import JumpControl from "./JumpControl.svelte";
  import SettingsRow from "./SettingsRow.svelte";
  import TrayView, { type Direction } from "./TrayView.svelte";

  let {
    direction,
    network = "tailscale",
  }: { direction: Direction; network?: Network } = $props();

  // The story's starting network, once.
  const tray = new AddressTray({ network: untrack(() => network) });
  onDestroy(() => tray.dispose());
  // The picture opens on the sheet up at the first step the person acts on
  // (Found it: Join), held still by the story's own jump. The probe before
  // it is the control's S0a, or Start again and the row's press.
  tray.jump("found");
  /** The sheet stood up as the story began: its first draw is still, no rise. */
  let entered = false;

  /** A project past its budget, drawn by NeedsCard's own row (NeedsRow) as it draws a budget. */
  const budget = {
    key: "cap:address-tray-story-phone",
    cap: {
      inherited: false,
      onCap: "quiet",
      period: "day",
      reached: true,
      resetsAt: Date.now() + 6 * HOUR_MS,
      spentUsd: 12.4,
      startsAt: Date.now() - 18 * HOUR_MS,
      usd: 10,
    },
    title: "cockpit",
    href: "/usage?project=address-tray-story",
  } as const;

  /** The sheet stands at most 85% of the screen, Caw's room over its edge included. */
  const SHEET_ROOM = "calc(var(--c-address-phone-h) * 0.85 - var(--space-8))";

  let sheetEl = $state<HTMLElement | null>(null);
  let scrimEl = $state<HTMLElement | null>(null);
  let started = $state(false);

  function openTray(): void {
    started = true;
    tray.show();
  }

  $effect(() => {
    if (tray.open && sheetEl) {
      const sheet = sheetEl;
      untrack(() => {
        if (entered) {
          sheetIn(sheet, scrimEl);
        }
        entered = true;
      });
    }
  });

  tray.closer = (done) => {
    if (!sheetEl) {
      done();
      return;
    }
    sheetOut(sheetEl, scrimEl, done);
  };

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && tray.open) {
      tray.park();
    }
  }
</script>

<svelte:window {onkeydown} />

<div
  class="grid content-start gap-space-3 bg-surface-page"
  data-address-phone={direction}
>
  <div
    class="relative h-c-address-phone-h overflow-clip rounded-panel border border-border-hairline bg-surface-page"
    data-phone-screen
  >
    <div class="grid content-start gap-space-3 px-space-1 pt-space-4">
      {#if tray.source === "needs"}
        <h2 class="m-0 px-space-3 type-title tracking-title text-ink-strong">
          Needs you
        </h2>
        <div class="grid gap-space-1">
          {#if !tray.stopped}
            <AddressRow
              done={tray.step === "live"}
              line={rowLine(tray)}
              meta="Onboarding · {tray.facts.domain}"
              onopen={openTray}
              title={tray.step === "live"
                ? `${tray.name} is live`
                : "Open CawCo by one word"}
            />
          {/if}
          <NeedsRow
            href={budget.href}
            kind="cap"
            onchoose={() => undefined}
            share="pane:{budget.key}"
            title={budget.title}
            want={capLine(budget.cap)}
          >
            {#snippet lead()}
              <IconDollar aria-hidden="true" class="size-icon-md" />
            {/snippet}
            {#snippet below()}
              <NeedsMeta text="Budget" />
            {/snippet}
          </NeedsRow>
        </div>
      {:else}
        <h2 class="m-0 px-space-3 type-title tracking-title text-ink-strong">
          Devices
        </h2>
        <div class="grid px-space-3">
          <SettingsRow
            line={started
              ? rowLine(tray)
              : {
                  text: `Type ${tray.phoneTyped} on any of your devices to open CawCo.`,
                  live: false,
                }}
            onopen={openTray}
            {started}
          />
        </div>
      {/if}
    </div>
    {#if tray.open}
      <button
        bind:this={scrimEl}
        aria-label="Close"
        class="absolute inset-0 bg-scrim"
        data-slot="scrim"
        onclick={() => tray.park()}
        tabindex="-1"
        type="button"
      ></button>
      <div
        bind:this={sheetEl}
        class="absolute inset-x-0 bottom-0"
        data-slot="sheet"
        style:--sheet-room={SHEET_ROOM}
        {@attach dragToDismiss({
          edge: "bottom",
          dismiss: () => tray.parkNow(),
          fade: () => scrimEl,
        })}
      >
        <TrayView {direction} form="phone" {tray} />
      </div>
    {/if}
  </div>
  <!-- The story's control stands under the screen, folded until pressed. -->
  <JumpControl {tray} />
</div>
