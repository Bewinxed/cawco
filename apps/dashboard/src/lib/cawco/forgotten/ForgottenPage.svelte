<script lang="ts">
  import { projectEndWords } from "@cawco/core/words/project-ends";
  /**
   * The Forgotten projects page as it stands under the bar: its title and
   * one line, then the list (ForgottenProjects) on a raised card capped at
   * the house's section width, so its columns stay beside their names on a
   * wide desk. The route (`/project/forgotten`) hands it the hub's list and
   * acts; its preview hands it the hub's records as they were read.
   */
  import type { ComponentProps } from "svelte";
  import ForgottenProjects from "./ForgottenProjects.svelte";

  let props: ComponentProps<typeof ForgottenProjects> = $props();
</script>

<!-- The pages' one gutter (as Usage stands on it). -->
<div
  class="min-w-0 flex-auto overflow-y-auto pt-space-6 pr-space-6 pb-space-6 pl-space-7 max-desk:px-space-5 max-phone:px-space-5 max-phone:py-space-4"
>
  <div class="flex max-w-c-config-max-w flex-col gap-space-group">
    <header class="flex min-w-0 flex-col gap-space-1">
      <h1 class="m-0 type-title text-balance text-ink-strong">
        {projectEndWords.forgottenTitle}
      </h1>
      <p class="m-0 type-body text-pretty text-ink-muted">
        {projectEndWords.forgottenLine}
      </p>
    </header>
    <div class="rounded-lg bg-surface-raised px-space-4 py-space-2 shadow-tile">
      <ForgottenProjects {...props} />
    </div>
  </div>
</div>
