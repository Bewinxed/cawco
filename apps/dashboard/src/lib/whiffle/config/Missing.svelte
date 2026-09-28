<script lang="ts">
  /** What an editor URL shows when the row it names is not in the list. */
  import { Button } from "$lib/components/ui/button";
  import { EmptyState } from "$lib/components/ui/empty";
  import SectionFrame from "./SectionFrame.svelte";
  import type { ConfigSection } from "./sections";

  let { section, what }: { section: ConfigSection; what: string } = $props();
</script>

<SectionFrame purpose="" title={section.label}>
  <EmptyState
    icon={section.icon}
    line="It was deleted, or the link is from another hub."
    title="That {what} is gone"
  >
    {#snippet action()}
      <Button href="/config/{section.slug}" variant="outline"
        >Back to {section.label}</Button
      >
    {/snippet}
  </EmptyState>
</SectionFrame>
