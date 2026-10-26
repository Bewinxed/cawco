<script lang="ts">
  /**
   * The dashboard on a phone at 390 (the probe kit's 390×844 phone, the
   * bench's frame tokens): the same row in Needs you, and the tray as the
   * kit's bottom sheet (DESIGN.md, Drawer: full-bleed, flush on the foot,
   * the hairline, the grabber, up to 85% of the screen, its content
   * scrolling inside). It rises over --dur-panel on the drawer curve and
   * leaves over --dur-exit (motion.ts `sheetIn`, `sheetOut`); a drag down
   * is its × (dragToDismiss), as a press on the scrim is.
   */
  import { untrack } from "svelte";
  import { sheetIn, sheetOut } from "../motion";
  import AddressRow from "../preview/AddressRow.svelte";
  import BudgetRow from "../preview/BudgetRow.svelte";
  import SheetOver from "../preview/SheetOver.svelte";
  import FlowTray from "./FlowTray.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { rowLine } from "./flow-words";

  let { flow }: { flow: AddressFlow } = $props();

  /** The sheet stands at most 85% of the screen. */
  const SHEET_ROOM = "calc(var(--c-bench-phone-h) * 0.85)";

  let sheetEl = $state<HTMLElement | null>(null);
  let scrimEl = $state<HTMLElement | null>(null);
  let rising = false;

  /** Stopped, the work has no row; every other state, an unsupported network's too, stands here. */
  const shown = $derived(!flow.stopped);

  function openTray(): void {
    rising = true;
    flow.show("phone");
  }

  $effect(() => {
    if (flow.open.phone && sheetEl) {
      const sheet = sheetEl;
      untrack(() => {
        if (rising) {
          sheetIn(sheet, scrimEl);
        }
        rising = false;
      });
    }
  });

  export function park(): void {
    if (!(sheetEl && flow.open.phone)) {
      return;
    }
    sheetOut(sheetEl, scrimEl, () => flow.park("phone"));
  }
</script>

<div
  class="relative h-c-bench-phone-h w-c-bench-phone-w max-w-full flex-none overflow-clip rounded-panel border border-border-hairline bg-surface-page"
  data-frame="phone"
>
  <div class="grid content-start gap-space-3 px-space-1 pt-space-4">
    <h2 class="m-0 px-space-3 type-title tracking-title text-ink-strong">
      Needs you
    </h2>
    <div class="grid gap-space-1">
      {#if shown}
        <AddressRow
          domain={flow.facts.domain}
          done={flow.step === "done"}
          line={rowLine(flow)}
          name={flow.name}
          onopen={openTray}
        />
      {/if}
      <BudgetRow
        key="address-flow-preview-phone"
        project="address-flow-preview"
      />
    </div>
  </div>
  {#if flow.open.phone && shown}
    <SheetOver
      bind:scrim={scrimEl}
      bind:sheet={sheetEl}
      dismiss={() => flow.park("phone")}
      onpark={park}
      room={SHEET_ROOM}
    >
      <FlowTray form="phone" onpark={park} {flow} />
    </SheetOver>
  {/if}
</div>
