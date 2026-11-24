<script lang="ts">
  /**
   * Caw's settings for the project page's Caw, on the hub (CawSettingsHub):
   * read as it opens and again as the hub comes back, his own view with
   * it; every change goes to the hub's routes and shows at once. Its
   * pickers list the harnesses, models and accounts of the machine the
   * project's checkout is on, else the first one online.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import { untrack } from "svelte";
  import type { CawLead } from "../project/caw-lead.svelte";
  import type { ProjectRow } from "../projects";
  import { boardStore, type Machine } from "../stores/board.svelte";
  import CawSettings from "./CawSettings.svelte";
  import { CawSettingsHub, installedOn } from "./caw-settings-hub.svelte";

  let {
    lead,
    project,
    machine,
    sheet = false,
  }: {
    lead: CawLead;
    project: ProjectRow;
    /** The machine its checkout is on; null while it has none. */
    machine: Machine | null;
    sheet?: boolean;
  } = $props();

  const settings = new CawSettingsHub(
    () => project,
    untrack(() => lead)
  );
  const on = $derived(machine ?? boardStore.onlineMachines[0] ?? null);

  // Read as it opens, and again once the hub is back.
  $effect(() => {
    if (!settings.hubAway) {
      untrack(() => {
        settings.load();
        lead.read();
      });
    }
  });
</script>

<CawSettings
  changesSettings={settings.changesSettings}
  chat={settings.chat}
  hubAway={settings.hubAway}
  installed={installedOn(on)}
  {lead}
  machine={{
    id: on?.machineId ?? "",
    name: on ? machineLabel(on.hostname) : "",
  }}
  onchanges={(next) => settings.setChanges(next)}
  onchat={(patch) => settings.setChat(patch)}
  onkind={(kind, patch) => settings.setKind(kind, patch)}
  projectId={project.id}
  projectName={project.name}
  refusedChanges={settings.refusedChanges}
  refusedChat={settings.refusedChat}
  refusedKind={settings.refusedKind}
  {sheet}
  triggers={settings.triggers}
  unread={settings.unread}
/>
