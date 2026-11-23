<script lang="ts">
  /**
   * HELPERS & STEP LISTS BENCH (dev only): the fleet's two switches (core
   * own-tools.ts) where a person meets them, in the app's shell with no hub.
   * `?place=onboarding` (the default) is the fleet board's first-run row on
   * a fresh fleet, both switches asked in place; `?place=settings` is
   * Configure › Helpers & step lists beside its rail, chosen as the first
   * run left them. A press saves against a stand-in hub that answers after
   * a moment, so the save line runs as it does live; `?fail=1` refuses
   * every save, to show Not saved and the hub's words.
   */
  import type {
    Helpers,
    OwnToolsChosen,
    StepLists,
  } from "@cawco/core/own-tools";
  import { onMount } from "svelte";
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
  import OwnToolsSection from "#lib/cawco/config/own-tools/OwnToolsSection.svelte";
  import {
    ConfigStore,
    provideConfig,
  } from "#lib/cawco/config/store.svelte.js";
  import FirstRun from "#lib/cawco/home/FirstRun.svelte";
  import type {
    OwnToolPick,
    SavePhase,
  } from "#lib/cawco/stores/own-tools.svelte.js";
  import { page } from "$app/state";

  provideConfig(new ConfigStore());

  // No hub: the bench stands in, so the shell reads as connected.
  const debug = window.__cawcoDebug;
  debug.standHub(() => undefined);
  onMount(() => () => debug.leaveHub());

  const place = $derived(
    page.url.searchParams.get("place") === "settings"
      ? "settings"
      : "onboarding"
  );
  const fail = $derived(page.url.searchParams.get("fail") === "1");

  /** Sessions running across the fleet in the bench. */
  const RUNNING = 7;
  const SAVE_MS = 700;
  const REFUSED =
    "The hub didn't answer (timed out after 10 s). The earlier setting stays.";

  let chosen = $state<OwnToolsChosen>(
    page.url.searchParams.get("place") === "settings"
      ? { helpers: "subagents", stepLists: "cawco" }
      : { helpers: null, stepLists: null }
  );
  let phases = $state<{ helpers: SavePhase; stepLists: SavePhase }>({
    helpers: "idle",
    stepLists: "idle",
  });
  let faults = $state<{ helpers: string | null; stepLists: string | null }>({
    helpers: null,
    stepLists: null,
  });

  const held: { helpers: Helpers | null; stepLists: StepLists | null } = {
    helpers: null,
    stepLists: null,
  };

  /** The stand-in hub's answer: the pick holds, or (with `?fail=1`) the one before it comes back. */
  function choose(pick: OwnToolPick) {
    held.helpers = chosen.helpers;
    held.stepLists = chosen.stepLists;
    if (pick.key === "helpers") {
      chosen.helpers = pick.value;
    } else {
      chosen.stepLists = pick.value;
    }
    phases[pick.key] = "saving";
    faults[pick.key] = null;
    setTimeout(() => {
      if (fail) {
        if (pick.key === "helpers") {
          chosen.helpers = held.helpers;
        } else {
          chosen.stepLists = held.stepLists;
        }
        faults[pick.key] = REFUSED;
        phases[pick.key] = "failed";
        return;
      }
      phases[pick.key] = "saved";
    }, SAVE_MS);
  }

  const none = () => undefined;
</script>

{#if place === "onboarding"}
  <div
    class="h-full overflow-y-auto bg-surface-recess px-space-6 pt-space-8 pb-space-8 max-phone:px-space-4"
  >
    <FirstRun
      onaddmachine={none}
      onchoose={choose}
      onlater={none}
      onfeedback={none}
      onnewproject={none}
      onrelay={none}
      onsignin={none}
      steps={{
        machine: { state: "done", name: "obelisk" },
        harness: { state: "done", harness: "Claude Code" },
        ownTools: chosen,
        ownToolsFaults: faults,
        feedback: { consent: null, signedIn: true, fault: null },
        relay: "todo",
        project: false,
      }}
    />
  </div>
{:else}
  <div class="flex min-h-0 min-w-0 flex-auto bg-surface-recess">
    <div class="flex min-h-0 py-space-2 pl-space-4 max-desk:hidden">
      <ConfigRail current="helpers" />
    </div>
    <div class="flex min-h-0 min-w-0 flex-auto flex-col bg-surface-recess">
      <OwnToolsSection
        {chosen}
        {faults}
        onchoose={choose}
        {phases}
        running={RUNNING}
      />
    </div>
  </div>
{/if}
