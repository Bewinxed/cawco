<script lang="ts">
  /**
   * Configure › Devices with the Word address row beside Require paired
   * devices (SettingsRow): Set up before it starts, Open after. Its button
   * opens into the same tray, floating over it at the panel's width
   * (--c-panel-w), no scrim, the page live (Open Page Rule), by a clip from
   * the button's box (motion.ts `openFrom`); the page keeps room under it.
   * The only way in on a network that can't carry the word.
   */
  import { untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { closeTo, openFrom, type Source } from "../motion";
  import SettingsRow from "../preview/SettingsRow.svelte";
  import FlowTray from "./FlowTray.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { rowLine } from "./flow-words";

  let { flow }: { flow: AddressFlow } = $props();

  let frameEl = $state<HTMLElement | null>(null);
  let trayEl = $state<HTMLElement | null>(null);
  let buttonEl = $state<HTMLElement | null>(null);
  let floatHeight = $state(0);
  let opening: Source | null = null;

  const line = $derived.by(() => {
    if (flow.step === "failed" && flow.cause === "unsupported") {
      return { text: "No word address on this network", live: false };
    }
    return flow.started
      ? rowLine(flow)
      : {
          text: `Type ${flow.typed} on any of your devices to open CawCo.`,
          live: false,
        };
  });

  function openTray(): void {
    if (buttonEl) {
      opening = { kind: "float", rect: buttonEl.getBoundingClientRect() };
    }
    flow.show("settings");
  }

  $effect(() => {
    if (flow.open.settings && trayEl) {
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
    if (!(el && flow.open.settings)) {
      return;
    }
    closeTo(
      el,
      buttonEl
        ? { kind: "float", rect: buttonEl.getBoundingClientRect() }
        : null,
      () => flow.park("settings")
    );
  }

  function onpointerdown(event: PointerEvent): void {
    const target = event.target as Node;
    if (
      flow.open.settings &&
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
  aria-labelledby="flow-settings-head"
  class="grid w-full max-w-c-measure min-w-0 content-start gap-space-2 pb-(--float-room)"
  data-frame="settings"
  style:--float-room={flow.open.settings ? `${floatHeight}px` : "0px"}
>
  <h2
    id="flow-settings-head"
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
        hidden={flow.open.settings}
        {line}
        onopen={openTray}
        started={flow.started}
      />
      {#if flow.open.settings}
        <div
          {@attach frameSize<HTMLElement>((node) => {
            floatHeight = node.offsetHeight;
          })}
          class="absolute end-0 top-0 z-1 w-c-panel-w max-w-full"
          data-slot="address-float"
        >
          <FlowTray bind:ref={trayEl} form="desk" onpark={park} {flow} />
        </div>
      {/if}
    </div>
    <div
      class="flex flex-wrap items-center justify-between gap-space-3 py-space-3"
    >
      <span class="grid gap-space-row">
        <span class="type-label text-ink-strong">Require paired devices</span>
        <span class="type-meta text-ink-muted"
          >Off: anyone on your network can open this dashboard</span
        >
      </span>
    </div>
  </div>
</section>
