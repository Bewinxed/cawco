<script lang="ts">
  import { page } from "$app/state";
  import EditorRoute from "$lib/whiffle/config/EditorRoute.svelte";
  import RuleEditor from "$lib/whiffle/config/editors/RuleEditor.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";

  const store = configStore();
  const section = sectionOf("rules");
  const id = $derived(page.params.id);
  const rules = $derived(store.rules.value);
  const rule = $derived(rules?.find((row) => row.id === id) ?? null);
  const taken = $derived(
    (rules ?? []).filter((row) => row.id !== id).map((row) => row.name)
  );
</script>

<EditorRoute
  found={id === 'new' || rule !== null}
  loaded={rules !== null}
  problem={store.rules.error}
  saveLabel={id === 'new' ? 'Create rule' : 'Save changes'}
  {section}
  what="rule"
>
  <RuleEditor {rule} {taken} />
</EditorRoute>
