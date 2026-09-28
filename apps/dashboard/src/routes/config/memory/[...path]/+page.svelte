<script lang="ts">
  import MemoryEditor from "$lib/whiffle/config/editors/MemoryEditor.svelte";
  import Missing from "$lib/whiffle/config/Missing.svelte";
  import { MAIN } from "$lib/whiffle/config/memory";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
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

{#if fleet === null}
  <SectionFrame
    problem={store.fleet.error}
    purpose={section.purpose}
    ready={false}
    title={section.label}
  >
    {''}
  </SectionFrame>
{:else if !known}
  <Missing {section} what="memory file" />
{:else}
  {#key path}
    <MemoryEditor {path} />
  {/key}
{/if}
