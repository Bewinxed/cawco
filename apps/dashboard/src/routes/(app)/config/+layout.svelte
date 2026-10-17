<script lang="ts">
  /**
   * Configure: every fleet-wide setting behind one rail. The rail and the
   * section share one store, read once when the area opens, so the counts
   * beside each entry are the rows the section shows.
   */
  import { onMount } from "svelte";
  import { cawco, onFleetFetch } from "#lib/cawco/client.svelte.js";
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
  import {
    LAST_KEY,
    SECTIONS,
    type SectionSlug,
  } from "#lib/cawco/config/sections.js";
  import {
    ConfigStore,
    provideConfig,
  } from "#lib/cawco/config/store.svelte.js";
  import { pageIn, pageOut } from "#lib/cawco/motion/route.svelte.js";
  import { store as storeLocally } from "#lib/cawco/storage.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { page } from "$app/state";

  let { children } = $props();

  const store = provideConfig(new ConfigStore());
  $effect(() => {
    const servers = cawco.fleetMcp;
    if (servers && store.fleet.value) {
      store.fleet.value.config.mcp = servers;
    }
  });
  onMount(() => {
    // biome-ignore lint/complexity/noVoid: each slot reports its own outcome
    void store.loadAll();
    // A skill or plugin fetch runs at the hub after its request answered;
    // its frames keep the rows, and the rail's counts, as the hub has them.
    return onFleetFetch({
      heard: (frame) => store.heardFetch(frame),
      dropped: () => {
        dropped = true;
      },
    });
  });
  // A fetch that landed while the socket was down was never heard: the rows
  // are read again once it is back.
  let dropped = false;
  $effect(() => {
    if (cawco.status === "connected" && dropped) {
      dropped = false;
      // biome-ignore lint/complexity/noVoid: the slot reports its own outcome
      void store.fleet.load();
    }
  });

  const slug = $derived(
    SECTIONS.find((section) => section.slug === page.url.pathname.split("/")[2])
      ?.slug as SectionSlug | undefined
  );

  $effect(() => {
    if (slug) {
      storeLocally("local", LAST_KEY, slug);
    }
  });
</script>

<Tooltip.Provider>
  <div class="flex min-h-0 min-w-0 flex-auto bg-surface-recess">
    {#if slug}
      <div class="flex min-h-0 py-space-2 pl-space-5 max-desk:hidden">
        <ConfigRail current={slug} />
      </div>
    {/if}
    <!-- Keyed on the path, so a section change or a drill into an editor
         swaps only this pane (motion/route.svelte.ts) while the rail beside
         it holds still and its pill glides to the new section. -->
    <div
      data-slot="pane"
      class="grid min-h-0 min-w-0 flex-auto overflow-hidden"
    >
      {#key page.url.pathname}
        <div
          class="flex min-h-0 min-w-0 flex-col bg-surface-recess"
          in:pageIn
          out:pageOut
        >{@render children()}</div>
      {/key}
    </div>
  </div>
</Tooltip.Provider>

<style>
  /* residual: unmapped */
  /* The two pages of a swap stand in one cell; a phone's push slides the
     new one in from off the pane's edge, so the pane clips it. */
  [data-slot="pane"] {
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  }
  /* residual: unmapped */
  [data-slot="pane"] > div {
    grid-area: 1 / 1;
  }
</style>
