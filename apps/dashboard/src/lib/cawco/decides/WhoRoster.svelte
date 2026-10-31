<script lang="ts">
  /**
   * The roster on Who decides' state: its members, kinds and routes as the
   * state holds them, a hand-over and a put-back written through it.
   * `settings` opens a member's settings and Add a member from the cards.
   */
  import type { Member } from "@cawco/core/decides";
  import type { Facts, WhoDecides } from "./decides.svelte";
  import Roster from "./Roster.svelte";

  let {
    who,
    project,
    facts,
    settings = false,
  }: {
    who: WhoDecides;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    facts: (member: Member) => Facts | null;
    settings?: boolean;
  } = $props();
</script>

<Roster
  asking={who.asking}
  {facts}
  fault={who.fault}
  fleetRoutes={who.fleetRoutes}
  bind:handing={who.handing}
  kinds={who.kinds}
  members={who.members}
  onhand={who.handTo}
  onputback={(kind) => who.useFleet([kind])}
  own={who.own}
  {project}
  routes={who.routes}
  who={settings ? who : null}
/>
