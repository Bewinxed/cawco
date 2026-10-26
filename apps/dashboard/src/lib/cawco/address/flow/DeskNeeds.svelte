<script lang="ts">
  /**
   * Caw's Needs you at its panel's width (--c-panel-w, 380): the address's
   * onboarding row over a project's budget row (NeedsCard's own NeedsRow).
   * The row grows into the tray in place, its box taking the tray's height
   * in the flow while the row under it slides down (The One Object Rule,
   * motion.ts `openFrom`); ×, Esc and a press beside it in this column put
   * it back into the row (`closeTo`), where its want line says where the
   * work stands. An unsupported network raises no row: Settings is its way
   * in.
   */
  import type { Source } from "../motion";
  import AddressRow from "../preview/AddressRow.svelte";
  import BudgetRow from "../preview/BudgetRow.svelte";
  import { DeskTray } from "./desk-tray.svelte";
  import FlowTray from "./FlowTray.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { rowLine } from "./flow-words";

  let { flow }: { flow: AddressFlow } = $props();

  let rowEl = $state<HTMLElement | null>(null);
  /** The row's height as last drawn: the box the tray closes back into. */
  let rowHeight = 0;
  const desk = new DeskTray(
    () => flow,
    "needs",
    (box): Source => ({
      kind: "row",
      rect: new DOMRect(box.x, box.y, box.width, rowHeight || box.height),
    })
  );

  /** Stopped, the work has no row; every other state, an unsupported network's too, stands here. */
  const shown = $derived(!flow.stopped);

  function openTray(): void {
    if (rowEl) {
      rowHeight = rowEl.offsetHeight;
    }
    desk.show(
      rowEl ? { kind: "row", rect: rowEl.getBoundingClientRect() } : null
    );
  }

  export function park(): void {
    desk.park();
  }
</script>

<svelte:document onpointerdown={desk.onpointerdown} />

<section
  bind:this={desk.frame}
  aria-labelledby="flow-needs-head"
  class="grid w-c-panel-w max-w-full content-start gap-space-2"
  data-frame="needs"
>
  <h2 id="flow-needs-head" class="m-0 px-space-3 type-label text-ink-muted">
    Needs you
  </h2>
  <div class="grid gap-space-1">
    {#if shown}
      <div
        class="data-open:mb-space-2"
        data-open={flow.open.needs || undefined}
        data-slot="address-slot"
      >
        {#if flow.open.needs}
          <FlowTray bind:ref={desk.tray} form="desk" onpark={park} {flow} />
        {:else}
          <AddressRow
            bind:ref={rowEl}
            domain={flow.facts.domain}
            done={flow.step === "done"}
            line={rowLine(flow)}
            name={flow.name}
            onopen={openTray}
          />
        {/if}
      </div>
    {/if}
    <BudgetRow key="address-flow-preview" project="address-flow-preview" />
  </div>
</section>
