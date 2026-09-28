<script lang="ts">
  import { page } from "$app/state";
  import RuleEditor from "$lib/whiffle/config/editors/RuleEditor.svelte";
  import Missing from "$lib/whiffle/config/Missing.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
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

{#if rules === null}
  <SectionFrame
    problem={store.rules.error}
    purpose={section.purpose}
    ready={false}
    title={section.label}
  >
    {''}
  </SectionFrame>
{:else if id !== 'new' && !rule}
  <Missing {section} what="rule" />
{:else}
  {#key id}
    <RuleEditor {rule} {taken} />
  {/key}
{/if}
