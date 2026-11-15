<script lang="ts">
  /**
   * What a forgotten project's restore held back, said on the project's
   * page where the restore lands (ProjectPage, restore-held.svelte.ts) until
   * the person dismisses it: how many rows, each by its table, its title or
   * id, and why, and that they wait in Forgotten projects to be tried again,
   * the page's name its link.
   */
  import type { RestoreHeldRow } from "@cawco/core/forgotten-project";
  import { projectTrashWords } from "@cawco/core/words/project-trash";
  import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";

  let {
    rows,
    ondismiss,
    class: className,
  }: {
    /** Every row the restore held back, named. */
    rows: RestoreHeldRow[];
    ondismiss: () => void;
    class?: string;
  } = $props();
</script>

<Alert data-id-page-notice class={className} variant="warning">
  <AlertTitle>{projectTrashWords.heldTitle(rows.length)}</AlertTitle>
  <AlertDescription>
    <p>
      {projectTrashWords.heldWhere.before}<a
        class="text-link-ink hover:text-link-hover"
        href="/project/forgotten">{projectTrashWords.heldWhere.place}</a
      >{projectTrashWords.heldWhere.after}
    </p>
    <ul class="max-h-48 list-disc overflow-y-auto ps-space-5 break-words">
      {#each rows as row, at (at)}
        <li>{projectTrashWords.heldRow(row)}</li>
      {/each}
    </ul>
  </AlertDescription>
  <AlertAction>
    <Button
      label={projectTrashWords.heldDismiss}
      onclick={ondismiss}
      size="sm"
      variant="outline"
    />
  </AlertAction>
</Alert>
