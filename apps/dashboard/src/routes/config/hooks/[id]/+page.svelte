<script lang="ts">
  import { page } from "$app/state";
  import HookEditor from "$lib/whiffle/config/editors/HookEditor.svelte";
  import Missing from "$lib/whiffle/config/Missing.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";

  const store = configStore();
  const section = sectionOf("hooks");
  const id = $derived(page.params.id);
  const hooks = $derived(store.hooks.value);
  const hook = $derived(hooks?.find((row) => row.id === id) ?? null);
  const taken = $derived(
    (hooks ?? []).filter((row) => row.id !== id).map((row) => row.name)
  );
</script>

{#if hooks === null}
  <SectionFrame
    problem={store.hooks.error}
    purpose={section.purpose}
    ready={false}
    title={section.label}
  >
    {''}
  </SectionFrame>
{:else if id !== 'new' && !hook}
  <Missing {section} what="hook" />
{:else}
  {#key id}
    <HookEditor {hook} {taken} />
  {/key}
{/if}
