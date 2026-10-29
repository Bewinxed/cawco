<script lang="ts">
  import { mcpWords as words } from "@cawco/core/words/mcp";
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import McpEditor from "#lib/cawco/config/editors/McpEditor.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import { page } from "$app/state";

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
  found={name === "new" || server !== null}
  loaded={fleet !== null}
  problem={store.fleet.error}
  saveLabel={name === "new" ? words.add : words.save}
  {section}
  what={words.what}
>
  <McpEditor {server} {taken} />
</EditorRoute>
