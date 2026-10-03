<script lang="ts">
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import SubagentEditor from "#lib/cawco/config/editors/SubagentEditor.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import { page } from "$app/state";

  const store = configStore();
  const section = sectionOf("subagents");
  const name = $derived(page.params.name);
  const fleet = $derived(store.fleet.value);
  const agent = $derived(
    fleet?.agents.find((row) => row.name === name) ?? null
  );
</script>

<EditorRoute
  found={name === 'new' || agent !== null}
  loaded={fleet !== null}
  problem={store.fleet.error}
  saveLabel={name === 'new' ? 'Create subagent' : 'Save changes'}
  {section}
  what="subagent"
>
  <SubagentEditor {agent} />
</EditorRoute>
