<script lang="ts">
  /**
   * What sessions on a named account do at its limit (core
   * `ProjectAtLimit`): wait for the reset, or move to an account with room,
   * and the line under it saying what the pick means. While the hub answers
   * a pick the thumb breathes (`pending`).
   */
  import { PROJECT_AT_LIMIT, type ProjectAtLimit } from "@cawco/core/accounts";
  import { projectAccountWords } from "@cawco/core/words/project-account";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";

  let {
    value,
    pending = false,
    labelledby,
    onpick,
  }: {
    value: ProjectAtLimit;
    pending?: boolean;
    /** The id of the label naming it. */
    labelledby: string;
    onpick: (atLimit: ProjectAtLimit) => void;
  } = $props();
</script>

<ToggleGroup.Root
  aria-labelledby={labelledby}
  class="max-w-full self-start"
  data-pending={pending ? "" : undefined}
  type="single"
  bind:value={
    () => value,
    (next) => {
      if (next && next !== value) {
        onpick(next as ProjectAtLimit);
      }
    }
  }
>
  {#each PROJECT_AT_LIMIT as way (way)}
    <ToggleGroup.Item value={way}
      >{projectAccountWords.atLimit[way]}</ToggleGroup.Item
    >
  {/each}
</ToggleGroup.Root>
<p data-slot="note" class="type-meta text-pretty text-ink-muted">
  {projectAccountWords.atLimit.says[value]}
</p>
