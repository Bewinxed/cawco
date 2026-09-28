<script lang="ts">
  import { page } from "$app/state";
  import DelegateTypeEditor from "$lib/whiffle/config/editors/DelegateTypeEditor.svelte";
  import Missing from "$lib/whiffle/config/Missing.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
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

{#if types === null}
  <SectionFrame
    problem={store.types.error}
    purpose={section.purpose}
    ready={false}
    title={section.label}
  >
    {''}
  </SectionFrame>
{:else if name !== 'new' && !type}
  <Missing {section} what="delegate type" />
{:else}
  {#key name}
    <DelegateTypeEditor {taken} {type} />
  {/key}
{/if}
