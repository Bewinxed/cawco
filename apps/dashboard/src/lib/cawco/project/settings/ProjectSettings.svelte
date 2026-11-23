<script lang="ts" module>
  import { hubSeam } from "#lib/cawco/hub-live.js";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { accountsStore } from "#lib/cawco/stores/accounts.svelte.js";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
  import { movesStore } from "#lib/cawco/stores/moves.svelte.js";
  import { SettingsHub } from "./settings-hub.svelte";

  /**
   * The Settings view's tie to the hub for one project page (ProjectPage),
   * made as the page mounts: the page counts what needs fixing on the
   * view's tab while another view is open, and the view's asks live as
   * long as the page. Read from the stores and the hub this tree's seam
   * names.
   */
  export const settingsHubFor = (project: () => ProjectRow | null) =>
    new SettingsHub({
      project,
      machines: () => boardStore.machines,
      accounts: () => accountsStore.accounts,
      moves: () => movesStore.moves,
      seam: hubSeam(),
    });
</script>

<script lang="ts">
  /**
   * The project page's Settings view as the page mounts it: the view
   * (SettingsView) fed and answered through the page's tie to the hub
   * (SettingsHub, {@link settingsHubFor}).
   */
  import SettingsView from "./SettingsView.svelte";

  let { hub }: { hub: SettingsHub } = $props();

  // The hub's state, kept as when it was last reached.
  $effect(() => hub.heard());
</script>

<SettingsView
  flow={hub.flow}
  hrefOf={(page) =>
    page === "fleetDecides" ? "/config/decides" : `/config/${page}`}
  keys={hub.keys}
  loading={hub.loading}
  movingPlaceId={hub.movingPlaceId}
  onaddkey={hub.addKey}
  onaddplace={hub.addPlace}
  onchange={hub.send}
  onflow={hub.onflow}
  onplace={hub.place}
  onreread={(stage) => hub.reread(stage)}
  onretry={hub.retry}
  onsync={hub.sync}
  pending={hub.pending}
  readFailed={hub.readFailed}
  record={hub.record}
  refused={hub.refused}
  setup={hub.tieSetup}
  syncing={hub.syncing}
/>
