<script lang="ts">
  /**
   * The roster on a page's ground, its table held here: a hand-over moves
   * the tile and a put-back brings it home, and nothing is written to the
   * hub. A project's own kinds are the ones whose member differs from the
   * fleet's.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { untrack } from "svelte";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import type { Facts, Fault } from "../decides.svelte";
  import Roster from "../Roster.svelte";

  let {
    members,
    kinds,
    fleetRoutes,
    routes: first,
    facts,
    project,
    handing: openFirst = null,
    asking = null,
    fault = null,
  }: {
    asking?: { kinds: string[]; said: string } | null;
    facts: Record<string, Facts>;
    fault?: Fault | null;
    fleetRoutes: Record<string, string>;
    handing?: string | null;
    kinds: Kind[];
    members: Member[];
    project: string | null;
    routes: Record<string, string>;
  } = $props();

  let routes = $state(untrack(() => ({ ...first })));
  let handing = $state(untrack(() => openFirst));
  const own = $derived(
    project === null
      ? []
      : kinds
          .filter((kind) => routes[kind.id] !== fleetRoutes[kind.id])
          .map((kind) => kind.id)
  );
</script>

<Tooltip.Provider>
  <div class="bg-surface-page p-space-5 max-desk:p-space-4">
    <Roster
      {asking}
      facts={(member) => facts[member.id] ?? null}
      {fault}
      {fleetRoutes}
      bind:handing
      {kinds}
      {members}
      onhand={(kind, member) => {
        routes[kind] = member;
        return Promise.resolve(true);
      }}
      onputback={(kind) => {
        routes[kind] = fleetRoutes[kind];
        return Promise.resolve(true);
      }}
      {own}
      {project}
      {routes}
    />
  </div>
</Tooltip.Provider>
