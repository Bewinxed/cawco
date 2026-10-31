<script lang="ts">
  /**
   * The roster on a page's inset, its table held here: a hand-over moves the
   * tile and a put-back brings it home, and nothing is written to the hub.
   */
  import type { ComponentProps } from "svelte";
  import { untrack } from "svelte";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Roster from "../Roster.svelte";

  let {
    routes: first,
    ...rest
  }: Omit<ComponentProps<typeof Roster>, "onhand" | "onputback"> = $props();

  let routes = $state(untrack(() => ({ ...first })));
</script>

<Tooltip.Provider>
  <div class="bg-surface-page p-space-5 max-desk:p-space-4">
    <Roster
      {...rest}
      onhand={(kind, member) => {
        routes[kind] = member;
      }}
      onputback={(kind) => {
        routes[kind] = rest.fleetRoutes[kind];
      }}
      {routes}
    />
  </div>
</Tooltip.Provider>
