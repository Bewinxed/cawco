<script lang="ts">
  /**
   * A direction's tray on a desk, live: the transcript-width page with
   * Needs you (the address's onboarding row over a real budget row, in
   * NeedsCard), or Settings' Word address row, and the story's control at
   * the frame's top edge. The row becomes the tray in place, its box growing
   * to the tray's while the row under it slides down (The One Object Rule);
   * Settings' Set up opens into the tray floating over it. ×, Esc and a
   * press outside put it back where it came from; its work goes on, and the
   * row says where it stands.
   */
  import { onDestroy, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import type { NeedsItem } from "#lib/cawco/home/home-state.svelte.js";
  import NeedsCardSheet from "#lib/cawco/home/NeedsCardSheet.svelte";
  import { closeTo, openFrom, type Source } from "../motion";
  import { AddressTray, type Network } from "../tray.svelte";
  import AddressRow from "./AddressRow.svelte";
  import JumpControl from "./JumpControl.svelte";
  import SettingsRow from "./SettingsRow.svelte";
  import TrayView, { type Direction } from "./TrayView.svelte";

  let {
    direction,
    network = "tailscale",
  }: { direction: Direction; network?: Network } = $props();

  // svelte-ignore state_referenced_locally — the story's starting network, once
  const tray = new AddressTray({ network });
  onDestroy(() => tray.dispose());

  /** A project past its budget, as Needs you lists it today, under the address's row. */
  const budget = {
    kind: "cap",
    key: "cap:address-tray-story",
    cap: {
      inherited: false,
      onCap: "quiet",
      period: "day",
      reached: true,
      resetsAt: Date.now() + 6 * 3_600_000,
      spentUsd: 12.4,
      startsAt: Date.now() - 18 * 3_600_000,
      usd: 10,
    },
    title: "cockpit",
    place: "Budget reached",
    href: "/usage?project=address-tray-story",
    raisedAt: undefined,
  } as NeedsItem;

  let trayEl = $state<HTMLElement | null>(null);
  let rowEl = $state<HTMLElement | null>(null);
  let buttonEl = $state<HTMLElement | null>(null);
  let controlEl = $state<HTMLElement | null>(null);
  /** The row's height as last drawn: the box the tray closes back into. */
  let rowHeight = 0;
  /** Where the next opening comes from, taken once it has played. */
  let opening: Source | null = null;
  /** Where the open tray came from, for its close. */
  let came: Source | null = null;
  /** The floating tray's height, laid out: the room the page keeps under it. */
  let floatHeight = $state(0);
  /** The set-up was begun once (Settings says Open after). */
  let started = $state(false);

  $effect(() => {
    if (rowEl) {
      rowHeight = rowEl.offsetHeight;
    }
  });

  function sourceRect(): Source | null {
    if (tray.source === "needs" && rowEl) {
      rowHeight = rowEl.offsetHeight;
      return { kind: "row", rect: rowEl.getBoundingClientRect() };
    }
    if (tray.source === "settings" && buttonEl) {
      return { kind: "float", rect: buttonEl.getBoundingClientRect() };
    }
    return null;
  }

  function openTray(): void {
    opening = sourceRect();
    started = true;
    tray.show();
  }

  // The tray has mounted: its source's box opens into it.
  $effect(() => {
    if (tray.open && trayEl) {
      const el = trayEl;
      untrack(() => {
        came = opening ?? came;
        openFrom(el, opening);
        opening = null;
      });
    }
  });

  tray.closer = (done) => {
    const el = trayEl;
    if (!el) {
      done();
      return;
    }
    let back: Source | null = null;
    if (tray.source === "needs") {
      const box = el.getBoundingClientRect();
      back = {
        kind: "row",
        rect: new DOMRect(box.x, box.y, box.width, rowHeight || box.height),
      };
    } else if (buttonEl) {
      back = { kind: "float", rect: buttonEl.getBoundingClientRect() };
    }
    closeTo(el, back ?? came, done);
  };

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && tray.open) {
      tray.park();
    }
  }

  /** A press anywhere on the page but the tray (or the story's control) puts it back. */
  function onpointerdown(event: PointerEvent): void {
    const target = event.target as Node;
    if (
      tray.open &&
      trayEl &&
      !trayEl.contains(target) &&
      !controlEl?.contains(target)
    ) {
      tray.park();
    }
  }
</script>

<svelte:window {onkeydown} />
<svelte:document {onpointerdown} />

<div
  class="grid min-h-c-address-phone-h content-start gap-space-5 bg-surface-page p-space-5"
  data-address-desk={direction}
>
  <div bind:this={controlEl} class="mx-auto w-full max-w-c-measure">
    <JumpControl {tray} />
  </div>
  <!-- The floating tray stands over the page, not in its flow: the page
       keeps room under it for as tall as it is, so its foot never falls
       past the page's. -->
  <main
    class="mx-auto grid w-full max-w-c-measure content-start gap-space-5 pb-(--float-room)"
    style:--float-room={tray.open && tray.source === "settings"
      ? `${floatHeight}px`
      : "0px"}
  >
    {#if tray.source === "needs"}
      <section aria-labelledby="address-needs-head" class="grid gap-space-2">
        <h2
          id="address-needs-head"
          class="m-0 px-space-3 type-label text-ink-muted"
        >
          Needs you
        </h2>
        <div class="grid gap-space-1">
          {#if !tray.stopped}
            <!-- Open, the tray stands one group step (the list's gap and
                 this margin, --space-3 in all) off the row under it, the
                 same in every state; closed, the row is a row among rows. -->
            <div
              class="data-open:mb-space-2"
              data-open={tray.open || undefined}
              data-slot="address-slot"
            >
              {#if tray.open}
                <TrayView bind:ref={trayEl} {direction} form="desk" {tray} />
              {:else}
                <AddressRow bind:ref={rowEl} onopen={openTray} {tray} />
              {/if}
            </div>
          {/if}
          <NeedsCardSheet
            item={budget}
            onchoose={() => undefined}
            stale={false}
          />
        </div>
      </section>
    {:else}
      <section aria-labelledby="address-settings-head" class="grid gap-space-2">
        <h2
          id="address-settings-head"
          class="m-0 type-title tracking-title text-ink-strong"
        >
          Devices
        </h2>
        <div class="grid divide-y divide-border-hairline">
          <div
            class="flex flex-wrap items-center justify-between gap-space-3 py-space-3"
          >
            <span class="grid gap-space-row">
              <span class="type-label text-ink-strong">Paired devices</span>
              <span class="type-meta text-ink-muted"
                >3 devices can open this dashboard</span
              >
            </span>
          </div>
          <div class="relative">
            <SettingsRow
              bind:button={buttonEl}
              onopen={openTray}
              {started}
              {tray}
            />
            {#if tray.open}
              <div
                {@attach frameSize<HTMLElement>((node) => {
                  floatHeight = node.offsetHeight;
                })}
                class="absolute end-0 top-0 z-1 w-c-address-tray-w max-w-full"
                data-slot="address-float"
              >
                <TrayView bind:ref={trayEl} {direction} form="desk" {tray} />
              </div>
            {/if}
          </div>
          <div
            class="flex flex-wrap items-center justify-between gap-space-3 py-space-3"
          >
            <span class="grid gap-space-row">
              <span class="type-label text-ink-strong"
                >Require paired devices</span
              >
              <span class="type-meta text-ink-muted"
                >Off: anyone on your network can open this dashboard</span
              >
            </span>
          </div>
        </div>
      </section>
    {/if}
  </main>
</div>
