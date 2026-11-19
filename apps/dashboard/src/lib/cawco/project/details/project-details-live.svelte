<script lang="ts">
  import { provideHub } from "#lib/cawco/hub-seam.js";
  /**
   * The project details card to use, as the project page holds it: the
   * project's head as it ships (ProjectHead), whose place mark hangs the
   * card (ProjectDetailsCard), or raises it as the bottom sheet on a phone;
   * the card reads and writes the hub as it does in the product, through
   * this frame's hub seam, which a stand-in for the hub answers
   * (details-stand-in.ts): one product-shaped project, its frames written
   * through each store's own writer, every change answered after a hub's
   * wait with a yes or a refusal (`answer`).
   *
   * `situation` is what the hub says of the project as the card opens,
   * `again` starts it over at the person's press: the stand-in is made anew
   * from them, so the args set where it starts and the presses carry it on.
   */
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { accountsState } from "#lib/cawco/stores/accounts.svelte.js";
  import { holdMachines } from "#lib/cawco/stores/board.svelte.js";
  import { heardMove } from "#lib/cawco/stores/moves.svelte.js";
  import {
    keepProjects,
    projectsLeave,
    projectsState,
  } from "#lib/cawco/stores/projects.svelte.js";
  import { provideHangLayer } from "#lib/components/ui/hang-card/hang-layer.js";
  import { hubThrough } from "#lib/platform/hub.js";
  import { detailsOpen } from "./details-open.svelte";
  import {
    type Answer,
    DetailsStandIn,
    type HubFrames,
    type LiveSituation,
  } from "./details-stand-in";
  import { MACHINES, PROJECT } from "./records";

  let {
    situation = "all-well",
    answer = "yes",
    open = true,
    again = 0,
  }: {
    situation?: LiveSituation;
    answer?: Answer;
    /** The card stands open as the story opens. */
    open?: boolean;
    /** Starts it over: counts the person's presses of Start again. */
    again?: number;
  } = $props();

  /** The hub's frames, written through each store's own writer. */
  const FRAMES: HubFrames = {
    holdMachines: (machines) => {
      holdMachines(machines);
    },
    holdAccounts: (view) => {
      accountsState.accounts = view;
    },
    holdProject: (row) => keepProjects([row], projectsLeave()),
    heardMove,
  };

  /** No hub yet: every call goes unanswered. */
  const AWAY = hubThrough(
    new Proxy(fetch, {
      apply: () => Promise.reject(new TypeError("Failed to fetch")),
    })
  );

  /** The stand-in hub, made anew whenever the args name another start. */
  let hub = $state.raw<DetailsStandIn | null>(null);
  $effect.pre(() => {
    const made = new DetailsStandIn(situation, () => answer, FRAMES, again);
    hub = made;
    if (open) {
      detailsOpen.open(PROJECT.id);
    } else {
      detailsOpen.close(PROJECT.id);
    }
    return () => made.dispose();
  });
  // What the card under this frame reads of the hub: the stand-in as it
  // stands now.
  provideHub({
    get state() {
      return hub?.state ?? "connected";
    },
    get client() {
      return hub?.seam.client ?? AWAY;
    },
  });

  const project = $derived(
    projectsState.projects.find((row) => row.id === PROJECT.id) ?? PROJECT
  );
  const lead = new CawLead({
    id: () => PROJECT.id,
    machinesOnline: () => true,
    project: () => project,
    reading: () => false,
    tasks: () => [],
  });
  /** The layer the card hangs in: this frame's own box, as the Shell gives the app's. */
  const layerId = $props.id();
  const layer = provideHangLayer(layerId);
</script>

<div
  class="@container/shell relative flex min-h-dvh w-full flex-col bg-surface-recess contain-layout"
  data-details-live
  data-hang-layer={layer.id}
>
  {#if hub}
    <ProjectHead
      {lead}
      machine={MACHINES[0] ?? null}
      onask={null}
      onfilter={() => undefined}
      onnewtask={null}
      {project}
      seated={false}
      setup={null}
    />
  {/if}
</div>
