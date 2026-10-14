<script lang="ts">
  /** What an editor URL shows when the row it names is not in the list. */
  import { configureWords as words } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import SectionFrame from "./SectionFrame.svelte";
  import type { ConfigSection } from "./sections";

  let { section, what }: { section: ConfigSection; what: string } = $props();
</script>

<SectionFrame purpose={null} title={section.label}>
  <EmptyState
    icon={section.icon}
    line={words.goneLine}
    title={words.gone(what)}
  >
    {#snippet action()}
      <Button href="/config/{section.slug}" variant="outline"
        >{words.backTo(section.label)}</Button
      >
    {/snippet}
  </EmptyState>
</SectionFrame>
