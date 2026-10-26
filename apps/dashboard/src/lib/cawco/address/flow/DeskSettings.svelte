<script lang="ts">
  /**
   * Configure › Devices with the Word address row beside Require paired
   * devices (SettingsRow): Set up before it starts, Open after. Its button
   * opens into the same tray, floating over it at the panel's width
   * (--c-panel-w), no scrim, the page live (Open Page Rule), by a clip from
   * the button's box (motion.ts `openFrom`); the page keeps room under it.
   * The only way in on a network that can't carry the word.
   */
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import type { Source } from "../motion";
  import DevicesList from "../preview/DevicesList.svelte";
  import SettingsRow from "../preview/SettingsRow.svelte";
  import { DeskTray } from "./desk-tray.svelte";
  import FlowTray from "./FlowTray.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { rowLine } from "./flow-words";

  let { flow }: { flow: AddressFlow } = $props();

  let buttonEl = $state<HTMLElement | null>(null);
  let floatHeight = $state(0);
  /** Where the tray floats from and goes back into: the button's box. */
  const fromButton = (): Source | null =>
    buttonEl ? { kind: "float", rect: buttonEl.getBoundingClientRect() } : null;
  const desk = new DeskTray(() => flow, "settings", fromButton);

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
    desk.show(fromButton());
  }

  export function park(): void {
    desk.park();
  }
</script>

<svelte:document onpointerdown={desk.onpointerdown} />

<section
  bind:this={desk.frame}
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
  <DevicesList>
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
          <FlowTray bind:ref={desk.tray} form="desk" onpark={park} {flow} />
        </div>
      {/if}
    </div>
  </DevicesList>
</section>
