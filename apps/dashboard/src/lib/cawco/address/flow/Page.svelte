<script lang="ts">
  /**
   * The design preview's one page: the word address's tray at its real
   * size, three times over, all driven by one flow: Needs you at Caw's
   * panel width (380), Configure › Devices with the tray floating over its
   * button, and a 390 phone with the tray as its bottom sheet. Above them,
   * the two real forks (the network, and certificates already on when
   * cawco joins) and every moment and failure to jump to, held still. The
   * trays' own buttons move the flow on as the person would; a waiting
   * state moves on by itself, as the hub would. Where it stands is kept
   * across a reload.
   *
   * `window.preview` is the probe's handle (scripts/probe-kit/specs/
   * address-preview.ts): jump to a moment, hold the hub still and move it
   * one sighting at a time.
   */
  import { onDestroy, onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
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

  const flow = new AddressFlow();
  flow.restore();
  if (!flow.started && flow.step === "start" && !flow.stopped) {
    flow.jump("start");
  }
  onDestroy(() => flow.dispose());

  let needs = $state<{ park: () => void } | null>(null);
  let settings = $state<{ park: () => void } | null>(null);
  let phone = $state<{ park: () => void } | null>(null);

  const NETWORK_NAMES: Record<Network, string> = {
    tailscale: "Tailscale",
    headscale: "Headscale",
    netbird: "NetBird",
  };

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
  class="grid min-h-dvh content-start gap-space-6 bg-surface-page p-space-6"
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
    <div class="flex flex-wrap items-end gap-x-space-6 gap-y-space-3">
      <div class="grid gap-space-1">
        <span class="type-meta text-ink-muted" id="flow-network">Network</span>
        <Tabs
          onValueChange={(next) =>
            flow.switchNetwork(next as Network, flow.moment)}
          size="compact"
          value={flow.network}
        >
          <TabsList aria-labelledby="flow-network">
            {#each Object.entries(NETWORK_NAMES) as [id, name] (id)}
              <TabItem data-network={id} label={name} value={id} />
            {/each}
          </TabsList>
        </Tabs>
      </div>
      {#if flow.network === "tailscale"}
        <div class="grid gap-space-1">
          <span class="type-meta text-ink-muted" id="flow-certs"
            >Certificates when cawco joins</span
          >
          <Tabs
            onValueChange={(next) => {
              flow.certsAtJoin = next === "on";
              flow.jump(flow.moment);
            }}
            size="compact"
            value={flow.certsAtJoin ? "on" : "off"}
          >
            <TabsList aria-labelledby="flow-certs">
              <TabItem data-certs="off" label="Off" value="off" />
              <TabItem data-certs="on" label="Already on" value="on" />
            </TabsList>
          </Tabs>
        </div>
      {/if}
    </div>
    <div class="grid gap-space-2">
      <div class="flex flex-wrap items-center gap-space-1" data-slot="moments">
        <span class="me-space-2 type-meta text-ink-muted">Steps</span>
        {#each MOMENTS as moment (moment.id)}
          <Button
            aria-pressed={flow.moment === moment.id}
            data-moment-button={moment.id}
            label={moment.label}
            onclick={() => flow.jump(moment.id)}
            size="xs"
            variant={flow.moment === moment.id ? "secondary" : "ghost"}
          />
        {/each}
      </div>
      <div class="flex flex-wrap items-center gap-space-1" data-slot="failures">
        <span class="me-space-2 type-meta text-ink-muted">Failures</span>
        {#each CAUSES as cause (cause.id)}
          <Button
            aria-pressed={flow.moment === `failed:${cause.id}`}
            data-moment-button="failed:{cause.id}"
            label={cause.label}
            onclick={() => flow.jump(`failed:${cause.id}`)}
            size="xs"
            variant={flow.moment === `failed:${cause.id}`
              ? "secondary"
              : "ghost"}
          />
        {/each}
      </div>
    </div>
  </header>

  <main
    class="flex flex-wrap items-start gap-x-space-8 gap-y-space-6"
    data-slot="frames"
  >
    <figure class="m-0 grid content-start gap-space-3">
      <figcaption class="type-meta text-ink-muted">
        Desk · Needs you, onboarding
      </figcaption>
      <DeskNeeds bind:this={needs} {flow} />
    </figure>
    <figure class="m-0 grid min-w-c-connect-w flex-1 content-start gap-space-3">
      <figcaption class="type-meta text-ink-muted">
        Desk · Configure › Devices
      </figcaption>
      <DeskSettings bind:this={settings} {flow} />
    </figure>
    <figure class="m-0 grid content-start gap-space-3">
      <figcaption class="type-meta text-ink-muted">Phone · 390</figcaption>
      <PhoneSheet bind:this={phone} {flow} />
    </figure>
  </main>
</div>
