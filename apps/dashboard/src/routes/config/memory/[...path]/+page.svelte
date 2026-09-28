<script lang="ts">
  import EditorRoute from "$lib/whiffle/config/EditorRoute.svelte";
  import MemoryEditor from "$lib/whiffle/config/editors/MemoryEditor.svelte";
  import { MAIN } from "$lib/whiffle/config/memory";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";
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
