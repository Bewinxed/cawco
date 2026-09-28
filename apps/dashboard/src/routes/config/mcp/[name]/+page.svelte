<script lang="ts">
  import { page } from "$app/state";
  import EditorRoute from "$lib/whiffle/config/EditorRoute.svelte";
  import McpEditor from "$lib/whiffle/config/editors/McpEditor.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";

  const store = configStore();
  const section = sectionOf("mcp");
  const name = $derived(page.params.name);
  const fleet = $derived(store.fleet.value);
  const server = $derived(
    fleet?.config.mcp.find((row) => row.name === name) ?? null
  );
  const taken = $derived(
    (fleet?.config.mcp ?? [])
      .filter((row) => row.name !== name)
      .map((row) => row.name)
  );
</script>

<EditorRoute
  found={name === 'new' || server !== null}
  loaded={fleet !== null}
  problem={store.fleet.error}
  saveLabel={name === 'new' ? 'Add server' : 'Save changes'}
  {section}
  what="MCP server"
>
  <McpEditor {server} {taken} />
</EditorRoute>
