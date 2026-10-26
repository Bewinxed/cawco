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
  import { untrack } from "svelte";
  import { sheetIn, sheetOut } from "../motion";
  import { rowLine } from "../words";
  import AddressRow from "./AddressRow.svelte";
  import BudgetRow from "./BudgetRow.svelte";
  import JumpControl from "./JumpControl.svelte";
  import SettingsRow from "./SettingsRow.svelte";
  import SheetOver from "./SheetOver.svelte";
  import { storyTray, type TrayStory } from "./story-tray";
  import TrayView from "./TrayView.svelte";

  let { direction, network }: TrayStory = $props();

  // The sheet already up at the story's first step.
  const tray = storyTray(() => network);
  /** The sheet stood up as the story began: its first draw is still, no rise. */
  let entered = false;

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
              domain={tray.facts.domain}
              done={tray.step === "live"}
              line={rowLine(tray)}
              name={tray.name}
              onopen={openTray}
            />
          {/if}
          <BudgetRow
            key="address-tray-story-phone"
            project="address-tray-story"
          />
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
      <SheetOver
        bind:scrim={scrimEl}
        bind:sheet={sheetEl}
        dismiss={() => tray.parkNow()}
        onpark={() => tray.park()}
        room={SHEET_ROOM}
      >
        <TrayView {direction} form="phone" {tray} />
      </SheetOver>
    {/if}
  </div>
  <!-- The story's control stands under the screen, folded until pressed. -->
  <JumpControl {tray} />
</div>
