<script lang="ts">
  import { page } from "$app/state";
  import McpEditor from "$lib/whiffle/config/editors/McpEditor.svelte";
  import Missing from "$lib/whiffle/config/Missing.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";

  const store = configStore();
  const section = sectionOf("mcp");
  const name = $derived(page.params.name);
  const fleet = $derived(store.fleet.value);
  const server = $derived(
    fleet?.config.mcp.find((row) => row.name === name) ?? null
  );
  const taken = $derived(
    (fleet?.config.mcp ?? [])
      .filter((row) => row.name !== name)
      .map((row) => row.name)
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
{:else if name !== 'new' && !server}
  <Missing {section} what="MCP server" />
{:else}
  {#key name}
    <McpEditor {server} {taken} />
  {/key}
{/if}
