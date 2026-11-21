<script lang="ts">
  /**
   * What reaches this project from outside, closed to one line: how many
   * services, and a mark while one is failing, the one fact that shows
   * unopened. Opened: each service, what is read from it, how often and
   * when it was last read, or why it fails; and Ask Caw to connect one.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronRight, IconError } from "#lib/icons.js";
  import type { OutsideSource } from "./harbor";

  let {
    sources,
    open = $bindable(false),
  }: { sources: OutsideSource[]; open?: boolean } = $props();

  const failing = $derived(sources.filter((one) => one.failing).length);
</script>

<Collapsible.Root bind:open>
  <section aria-labelledby="routines-sources" class="flex flex-col gap-space-1">
    <Collapsible.Trigger class="group w-full" look="fold">
      <IconChevronRight
        aria-hidden="true"
        class="size-icon-sm flex-none group-state-open:rotate-90"
      />
      <span id="routines-sources">What reaches this project</span>
      <Badge data-box size="tally" variant="secondary"
        ><span>{sources.length}</span></Badge
      >
      {#if failing > 0}
        <IconError class="size-icon-sm flex-none text-status-fail-glyph" />
        <span class="text-status-fail-ink">{failing} failing</span>
      {/if}
    </Collapsible.Trigger>
    <Collapsible.Content reveal>
      <ul class="flex flex-col m-0 p-0 list-none">
        {#each sources as source (source.id)}
          <li
            class="flex flex-col gap-space-1 py-space-3 ps-space-2 pe-space-1"
          >
            <span class="type-label text-ink-strong"
              >{source.service} · {source.what}</span
            >
            {#if source.failing}
              <span class="type-body text-status-fail-ink wrap-anywhere"
                >{source.failing}</span
              >
            {:else}
              <span class="type-meta num text-ink-muted">{source.read}</span>
            {/if}
          </li>
        {/each}
      </ul>
      <span class="block ps-space-2"
        ><Button
          label="Ask Caw to connect one"
          size="xs"
          variant="ghost"
        /></span
      >
    </Collapsible.Content>
  </section>
</Collapsible.Root>
