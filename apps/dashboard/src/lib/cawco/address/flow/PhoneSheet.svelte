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
  import { HOUR_MS } from "@cawco/core/time";
  import { untrack } from "svelte";
  import NeedsMeta from "#lib/cawco/home/NeedsMeta.svelte";
  import NeedsRow from "#lib/cawco/home/NeedsRow.svelte";
  import { dragToDismiss } from "#lib/cawco/motion/drag.svelte.js";
  import { capLine } from "#lib/cawco/usage.js";
  import { IconDollar } from "#lib/icons.js";
  import { sheetIn, sheetOut } from "../motion";
  import AddressRow from "../preview/AddressRow.svelte";
  import FlowTray from "./FlowTray.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { rowLine } from "./flow-words";

  let { flow }: { flow: AddressFlow } = $props();

  const budget = {
    key: "cap:address-flow-preview-phone",
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
    href: "/usage?project=address-flow-preview",
  } as const;

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
          done={flow.step === "done"}
          line={rowLine(flow)}
          meta="Onboarding · {flow.facts.domain}"
          onopen={openTray}
          title={flow.step === "done"
            ? `${flow.name} is live`
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
  </div>
  {#if flow.open.phone && shown}
    <button
      bind:this={scrimEl}
      aria-label="Close"
      class="absolute inset-0 bg-scrim"
      data-slot="scrim"
      onclick={park}
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
        dismiss: () => flow.park("phone"),
        fade: () => scrimEl,
      })}
    >
      <FlowTray form="phone" onpark={park} {flow} />
    </div>
  {/if}
</div>
