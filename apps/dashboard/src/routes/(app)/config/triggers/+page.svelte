<script lang="ts">
  /**
   * Configure › Caw's triggers: the fleet's default for each kind of
   * trigger, on the hub (FleetTriggersHub), read as the page opens and
   * again once the hub is back. Its pickers list the harnesses, models and
   * accounts of the first machine online.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  import { untrack } from "svelte";
  import { FleetTriggersHub } from "#lib/cawco/caw-settings/caw-settings-hub.svelte.js";
  import FleetTriggers from "#lib/cawco/caw-settings/FleetTriggers.svelte";
  import { installedOn } from "#lib/cawco/harness-offer.svelte.js";
  import { connectionStore } from "#lib/cawco/hub/socket.svelte.js";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";

  const fleet = new FleetTriggersHub();
  const on = $derived(boardStore.onlineMachines[0] ?? null);

  $effect(() => {
    if (connectionStore.hub !== "unreachable") {
      untrack(() => fleet.load());
    }
  });
</script>

<FleetTriggers
  installed={installedOn(on)}
  kinds={fleet.kinds}
  machine={{
    id: on?.machineId ?? "",
    name: on ? machineLabel(on.hostname) : "",
  }}
  onkind={(kind, patch) => fleet.setKind(kind, patch)}
  problem={fleet.read === null && fleet.unread
    ? words.unread(fleet.unread)
    : null}
  refusedKind={fleet.refusedKind}
/>
