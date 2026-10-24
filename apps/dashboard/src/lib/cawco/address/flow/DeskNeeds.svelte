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
  import { untrack } from "svelte";
  import NeedsMeta from "#lib/cawco/home/NeedsMeta.svelte";
  import NeedsRow from "#lib/cawco/home/NeedsRow.svelte";
  import { capLine } from "#lib/cawco/usage.js";
  import { IconDollar } from "#lib/icons.js";
  import { closeTo, openFrom, type Source } from "../motion";
  import AddressRow from "../preview/AddressRow.svelte";
  import FlowTray from "./FlowTray.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { rowLine } from "./flow-words";

  let { flow }: { flow: AddressFlow } = $props();

  /** A project past its budget, as Needs you lists it today, under the address's row. */
  const budget = {
    key: "cap:address-flow-preview",
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
    href: "/usage?project=address-flow-preview",
  } as const;

  let frameEl = $state<HTMLElement | null>(null);
  let trayEl = $state<HTMLElement | null>(null);
  let rowEl = $state<HTMLElement | null>(null);
  /** The row's height as last drawn: the box the tray closes back into. */
  let rowHeight = 0;
  let opening: Source | null = null;

  /** Stopped, the work has no row; every other state, an unsupported network's too, stands here. */
  const shown = $derived(!flow.stopped);

  function openTray(): void {
    if (rowEl) {
      rowHeight = rowEl.offsetHeight;
      opening = { kind: "row", rect: rowEl.getBoundingClientRect() };
    }
    flow.show("needs");
  }

  $effect(() => {
    if (flow.open.needs && trayEl) {
      const el = trayEl;
      untrack(() => {
        if (opening) {
          openFrom(el, opening);
        }
        opening = null;
      });
    }
  });

  export function park(): void {
    const el = trayEl;
    if (!(el && flow.open.needs)) {
      return;
    }
    const box = el.getBoundingClientRect();
    closeTo(
      el,
      {
        kind: "row",
        rect: new DOMRect(box.x, box.y, box.width, rowHeight || box.height),
      },
      () => flow.park("needs")
    );
  }

  function onpointerdown(event: PointerEvent): void {
    const target = event.target as Node;
    if (
      flow.open.needs &&
      trayEl &&
      frameEl?.contains(target) &&
      !trayEl.contains(target)
    ) {
      park();
    }
  }
</script>

<svelte:document {onpointerdown} />

<section
  bind:this={frameEl}
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
          <FlowTray bind:ref={trayEl} form="desk" onpark={park} {flow} />
        {:else}
          <AddressRow
            bind:ref={rowEl}
            done={flow.step === "done"}
            line={rowLine(flow)}
            meta="Onboarding · {flow.facts.domain}"
            onopen={openTray}
            title={flow.step === "done"
              ? `${flow.name} is live`
              : "Open CawCo by one word"}
          />
        {/if}
      </div>
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
</section>
