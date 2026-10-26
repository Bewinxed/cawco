<script lang="ts">
  /**
   * A direction's tray on a desk, live: the transcript-width page with
   * Needs you (the address's onboarding row over a real budget row,
   * NeedsCard's own NeedsRow), or Settings' Word address row, and the story's control
   * folded under it. The row becomes the tray in place, its box growing
   * to the tray's while the row under it slides down (The One Object Rule);
   * Settings' Set up opens into the tray floating over it. ×, Esc and a
   * press outside put it back where it came from; its work goes on, and the
   * row says where it stands.
   */
  import { untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { closeTo, openFrom, type Source } from "../motion";
  import { rowLine } from "../words";
  import AddressRow from "./AddressRow.svelte";
  import BudgetRow from "./BudgetRow.svelte";
  import DevicesList from "./DevicesList.svelte";
  import JumpControl from "./JumpControl.svelte";
  import SettingsRow from "./SettingsRow.svelte";
  import { storyTray, type TrayStory } from "./story-tray";
  import TrayView from "./TrayView.svelte";

  let { direction, network }: TrayStory = $props();

  // The row already grown into the tray at the story's first step.
  const tray = storyTray(() => network);
  /** The tray stood open as the story began: its first draw is still, no entrance. */
  let entered = false;

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
        if (entered) {
          openFrom(el, opening);
        }
        entered = true;
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
                <AddressRow
                  bind:ref={rowEl}
                  domain={tray.facts.domain}
                  done={tray.step === "live"}
                  line={rowLine(tray)}
                  name={tray.name}
                  onopen={openTray}
                />
              {/if}
            </div>
          {/if}
          <BudgetRow key="address-tray-story" project="address-tray-story" />
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
        <DevicesList>
          <div class="relative">
            <SettingsRow
              bind:button={buttonEl}
              hidden={tray.open && tray.source === "settings"}
              line={started
                ? rowLine(tray)
                : {
                    text: `Type ${tray.phoneTyped} on any of your devices to open CawCo.`,
                    live: false,
                  }}
              onopen={openTray}
              {started}
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
        </DevicesList>
      </section>
    {/if}
  </main>
  <!-- The story's control stands under the design, folded until pressed. -->
  <div bind:this={controlEl} class="mx-auto w-full max-w-c-measure">
    <JumpControl {tray} />
  </div>
</div>
