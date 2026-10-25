<script lang="ts">
  /**
   * The design preview's one page: the word address's tray at its real
   * size, three times over, all driven by one flow: Needs you at Caw's
   * panel width (380), Configure › Devices with the tray floating over its
   * button, and a 390 phone with the tray as its bottom sheet. Beside
   * them, in the shared state switcher, the two real forks (the network,
   * and certificates already on when cawco joins), day or night, and every
   * moment and failure to jump to, held still. The trays' own buttons move
   * the flow on as the person would; a waiting state moves on by itself,
   * as the hub would, and the switcher's address follows it. Where it
   * stands is kept across a reload.
   *
   * `window.preview` is the probe's handle (scripts/probe-kit/specs/
   * address-preview.ts): jump to a moment, hold the hub still and move it
   * one sighting at a time.
   */
  import { onDestroy, onMount } from "svelte";
  import { theme } from "#lib/theme.svelte.js";
  import {
    type Axes,
    mountStateSwitcher,
  } from "../../../../../../../design-previews/state-switcher.js";
  import type { Network } from "../tray.svelte";
  import DeskNeeds from "./DeskNeeds.svelte";
  import DeskSettings from "./DeskSettings.svelte";
  import {
    AddressFlow,
    CAUSES,
    type Cause,
    MOMENTS,
    type MomentId,
    type Surface,
  } from "./flow.svelte";
  import { rowLine } from "./flow-words";
  import PhoneSheet from "./PhoneSheet.svelte";

  /** Caw's stills, by file: the probe reads them as drawn at 64px. */
  const STILLS = import.meta.glob<string>("./caw/*.png", {
    eager: true,
    query: "?url",
    import: "default",
  });
  const flow = new AddressFlow();
  flow.restore();
  if (!flow.started && flow.step === "start" && !flow.stopped) {
    flow.jump("start");
  }
  onDestroy(() => flow.dispose());

  const NETWORK_NAMES: Record<Network, string> = {
    tailscale: "Tailscale",
    headscale: "Headscale",
    netbird: "NetBird",
  };

  /** Where the flow stands, as the switcher's axes name it. */
  const axesOf = (): Axes => ({
    network: flow.network,
    theme: theme.resolved === "dark" ? "night" : "day",
    certs: flow.certsAtJoin ? "on" : "off",
    moment: flow.moment,
  });

  /**
   * The shared state switcher (design-previews/state-switcher.js): the two
   * real forks, day or night, and every step and failure to jump to, one
   * axis. The page's own stage is #preview, which it moves into its stage.
   */
  const switcher = mountStateSwitcher({
    // Needs you (380), Configure › Devices and the phone (390) side by
    // side, as a 1440 window draws them.
    width: 1392,
    axes: true,
    label: "Word address states",
    stage: [document.getElementById("preview") as HTMLElement],
    groups: (state) => [
      {
        key: "network",
        label: "Network",
        states: Object.entries(NETWORK_NAMES).map(([value, label]) => ({
          value,
          label,
        })),
      },
      {
        key: "theme",
        label: "Day or night",
        states: [
          { value: "day", label: "Day" },
          { value: "night", label: "Night" },
        ],
      },
      ...(state.network === "tailscale"
        ? [
            {
              key: "certs",
              label: "Certificates when cawco joins",
              states: [
                { value: "off", label: "Off" },
                { value: "on", label: "Already on" },
              ],
            },
          ]
        : []),
      {
        key: "steps",
        axis: "moment",
        label: "Steps",
        states: MOMENTS.map((moment) => ({
          value: moment.id,
          label: moment.label,
        })),
      },
      {
        key: "failures",
        axis: "moment",
        label: "Failures",
        states: CAUSES.map((cause) => ({
          value: `failed:${cause.id}`,
          label: cause.label,
        })),
      },
    ],
    onchange: (next, previous) => {
      if (next.theme !== previous.theme) {
        theme.set(next.theme === "night" ? "dark" : "light");
      }
      if (next.network !== previous.network) {
        flow.switchNetwork(next.network as Network, flow.moment);
        return;
      }
      if (next.certs !== previous.certs && next.certs !== undefined) {
        flow.certsAtJoin = next.certs === "on";
        flow.jump(flow.moment);
        return;
      }
      // A moment picked, or picked again: the flow stands in it afresh.
      if (next.moment !== previous.moment || next.theme === previous.theme) {
        flow.jump(next.moment as MomentId);
      }
    },
  });
  // An address that names a state opens on it; else (or where the kept
  // flow already stands there) the page stands where it was kept.
  const named = switcher.state;
  const kept = axesOf();
  if (
    switcher.named &&
    (named.network !== kept.network ||
      named.moment !== kept.moment ||
      (named.certs !== undefined && named.certs !== kept.certs))
  ) {
    if (named.certs !== undefined) {
      flow.certsAtJoin = named.certs === "on";
    }
    flow.network = named.network as Network;
    flow.jump(named.moment as MomentId);
  }
  if (switcher.named && named.theme !== kept.theme) {
    theme.set(named.theme === "night" ? "dark" : "light");
  }
  // The flow moves on by itself, as the hub would: the switcher follows it.
  $effect(() => {
    switcher.set(axesOf());
  });

  let needs = $state<{ park: () => void } | null>(null);
  let settings = $state<{ park: () => void } | null>(null);
  let phone = $state<{ park: () => void } | null>(null);

  $effect(() => {
    flow.keep();
  });

  /** Esc puts back the tray that holds the focus, or every open one. */
  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") {
      return;
    }
    const at = document.activeElement?.closest<HTMLElement>("[data-frame]")
      ?.dataset.frame as Surface | undefined;
    const parks: Record<Surface, (() => void) | undefined> = {
      needs: needs?.park,
      settings: settings?.park,
      phone: phone?.park,
    };
    if (at && flow.open[at]) {
      parks[at]?.();
      return;
    }
    for (const surface of ["needs", "settings", "phone"] as const) {
      if (flow.open[surface]) {
        parks[surface]?.();
      }
    }
  }

  onMount(() => {
    (window as unknown as { preview: unknown }).preview = {
      flow,
      jump: (moment: MomentId) => flow.jump(moment),
      manual: (on: boolean) => flow.holdHub(on),
      hubSees: () => flow.hubSees(),
      fail: (cause: Cause) => flow.fail(cause),
      rowLine: () => rowLine(flow).text,
      theme: (scheme: "light" | "dark") => theme.set(scheme),
      stills: () => STILLS,
      network: (network: Network) => flow.switchNetwork(network, flow.moment),
      certsAtJoin: (on: boolean) => {
        flow.certsAtJoin = on;
      },
      solo: (surface: Surface) => {
        flow.open = {
          needs: surface === "needs",
          settings: surface === "settings",
          phone: surface === "phone",
        };
      },
      park: (surface: Surface) => ({ needs, settings, phone })[surface]?.park(),
    };
    document.documentElement.dataset.ready = "";
  });
</script>

<svelte:window {onkeydown} />

<div
  class="grid min-h-dvh grid-cols-1 content-start gap-space-6 bg-surface-page p-space-6"
  data-preview="address"
>
  <header class="grid max-w-c-measure gap-space-4" data-slot="bar">
    <div class="grid gap-space-1">
      <h1 class="m-0 type-title tracking-title text-ink-strong">
        Open CawCo by one word
      </h1>
      <p class="m-0 type-body text-pretty text-ink-muted">
        One tray, at its real size: in Needs you, over Configure › Devices, and
        as a phone's sheet. Its own buttons move it on; a waiting state moves on
        by itself, as the hub would, and where it stands is kept across a
        reload.
      </p>
    </div>
  </header>

  <main
    class="flex flex-wrap items-start gap-x-space-8 gap-y-space-6"
    data-slot="frames"
  >
    <figure class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3">
      <figcaption class="type-meta text-ink-muted">
        Desk · Needs you, onboarding
      </figcaption>
      <DeskNeeds bind:this={needs} {flow} />
    </figure>
    <figure
      class="m-0 grid min-w-0 grow basis-c-connect-w grid-cols-1 content-start gap-space-3"
    >
      <figcaption class="type-meta text-ink-muted">
        Desk · Configure › Devices
      </figcaption>
      <DeskSettings bind:this={settings} {flow} />
    </figure>
    <figure class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3">
      <figcaption class="type-meta text-ink-muted">Phone · 390</figcaption>
      <PhoneSheet bind:this={phone} {flow} />
    </figure>
  </main>
</div>
