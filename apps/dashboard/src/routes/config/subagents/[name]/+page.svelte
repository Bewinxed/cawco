<script lang="ts">
  import { page } from "$app/state";
  import SubagentEditor from "$lib/whiffle/config/editors/SubagentEditor.svelte";
  import Missing from "$lib/whiffle/config/Missing.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";

  const store = configStore();
  const section = sectionOf("subagents");
  const name = $derived(page.params.name);
  const fleet = $derived(store.fleet.value);
  const agent = $derived(
    fleet?.agents.find((row) => row.name === name) ?? null
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
{:else if name !== 'new' && !agent}
  <Missing {section} what="subagent" />
{:else}
  {#key name}
    <SubagentEditor {agent} />
  {/key}
{/if}
