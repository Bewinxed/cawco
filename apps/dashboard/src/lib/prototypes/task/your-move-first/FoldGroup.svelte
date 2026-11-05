<script lang="ts">
  /**
   * A group of the task's page that stands folded: its heading is the
   * fold's toggle, its chevron turning as it opens, and what it holds
   * unfolds where it stands (Brief & how it runs, History). The same card,
   * inset and heading role as every other group.
   */
  import type { Snippet } from "svelte";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronDown } from "#lib/icons.js";

  let {
    heading,
    id,
    open = $bindable(false),
    children,
  }: {
    heading: string;
    /** The heading's id: the group's accessible name and a jump target. */
    id: string;
    open?: boolean;
    children: Snippet;
  } = $props();
</script>

<section
  aria-labelledby={id}
  class="flex min-w-0 flex-col rounded-lg bg-surface-raised px-space-5 py-space-4 shadow-tile max-phone:px-space-4"
  data-slot="group"
>
  <Collapsible.Root bind:open>
    <h2 class="m-0" {id}>
      <Collapsible.Trigger look="fold"
        ><span>{heading}</span><IconChevronDown
          aria-hidden="true"
          class={[
            "size-icon-md transition-transform duration-(--dur-control) ease-out",
            open && "rotate-180",
          ]}
        /></Collapsible.Trigger
      >
    </h2>
    <Collapsible.Content fade reveal>
      <div class="pbs-space-4">
        {@render children()}
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</section>
