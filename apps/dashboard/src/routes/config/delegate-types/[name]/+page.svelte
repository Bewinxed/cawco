<script lang="ts">
  import { page } from "$app/state";
  import EditorRoute from "$lib/whiffle/config/EditorRoute.svelte";
  import DelegateTypeEditor from "$lib/whiffle/config/editors/DelegateTypeEditor.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";

  const store = configStore();
  const section = sectionOf("delegate-types");
  const name = $derived(page.params.name);
  const types = $derived(store.types.value);
  const type = $derived(types?.find((row) => row.name === name) ?? null);
  const taken = $derived(
    (types ?? []).filter((row) => row.name !== name).map((row) => row.name)
  );
</script>

<EditorRoute
  found={name === 'new' || type !== null}
  loaded={types !== null}
  problem={store.types.error}
  saveLabel={name === 'new' ? 'Create delegate type' : 'Save changes'}
  {section}
  what="delegate type"
>
  <DelegateTypeEditor {taken} {type} />
</EditorRoute>
