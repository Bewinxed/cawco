<script lang="ts">
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import MemoryEditor from "#lib/cawco/config/editors/MemoryEditor.svelte";
  import { MAIN } from "#lib/cawco/config/memory.js";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import type { PageProps } from "./$types";

  let { params }: PageProps = $props();

  const store = configStore();
  const section = sectionOf("memory");
  const path = $derived(params.path);
  const fleet = $derived(store.fleet.value);
  const known = $derived(
    path === MAIN ||
      (fleet?.memoryDocs.some((doc) => doc.path === path) ?? false)
  );
</script>

<EditorRoute
  found={known}
  loaded={fleet !== null}
  problem={store.fleet.error}
  saveLabel="Save"
  {section}
  what="memory file"
>
  <MemoryEditor {path} />
</EditorRoute>
