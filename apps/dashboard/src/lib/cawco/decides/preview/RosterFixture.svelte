<script lang="ts">
  /**
   * The roster on a page's ground, its table held here: a hand-over moves
   * the tile and a put-back brings it home, and nothing is written to the
   * hub. A project's own kinds are the ones whose member differs from the
   * fleet's. It follows its props while mounted (house/follows-props): the
   * design graph sets a state's args on the one live instance, so the
   * table and the open column are writable `$derived`s of their props,
   * overridden by a hand-over until the next state's args arrive.
   */
  import type { Kind, Member } from "@cawco/core/decides";
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

  let routes = $derived({ ...first });
  let handing = $derived(openFirst);
  const own = $derived(
    project === null
      ? []
      : kinds
          .filter((kind) => routes[kind.id] !== fleetRoutes[kind.id])
          .map((kind) => kind.id)
  );
</script>

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
      routes = { ...routes, [kind]: member };
      return Promise.resolve(true);
    }}
    onputback={(kind) => {
      const home = fleetRoutes[kind];
      if (home !== undefined) {
        routes = { ...routes, [kind]: home };
      }
      return Promise.resolve(true);
    }}
    {own}
    {project}
    {routes}
  />
</div>
