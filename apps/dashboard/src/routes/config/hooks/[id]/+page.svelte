<script lang="ts">
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import HookEditor from "#lib/cawco/config/editors/HookEditor.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import { page } from "$app/state";

  const store = configStore();
  const section = sectionOf("hooks");
  const id = $derived(page.params.id);
  const hooks = $derived(store.hooks.value);
  const hook = $derived(hooks?.find((row) => row.id === id) ?? null);
  const taken = $derived(
    (hooks ?? []).filter((row) => row.id !== id).map((row) => row.name)
  );
</script>

<EditorRoute
  found={id === 'new' || hook !== null}
  loaded={hooks !== null}
  problem={store.hooks.error}
  saveLabel={id === 'new' ? 'Create hook' : 'Save changes'}
  {section}
  what="hook"
>
  <HookEditor {hook} {taken} />
</EditorRoute>
