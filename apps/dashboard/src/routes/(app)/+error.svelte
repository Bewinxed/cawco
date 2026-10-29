<script lang="ts">
  import { shellWords } from "@cawco/core/words/shell";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconMapPoint, IconWarningTriangle } from "#lib/icons.js";
  /**
   * Any route that fails, or any path nothing answers, lands here inside the
   * shell: the rail stays, and one action goes back to the sessions.
   */
  import { page } from "$app/state";

  const missing = $derived(page.status === 404);
</script>

<svelte:head
  ><title>
    {missing ? shellWords.pageNotFound : shellWords.somethingWentWrong}
    · CawCo
  </title></svelte:head
>

<div class="min-w-0 flex-auto overflow-y-auto p-space-6">
  <EmptyState
    icon={missing ? IconMapPoint : IconWarningTriangle}
    line={missing
      ? `Nothing is at ${page.url.pathname}.`
      : `${page.error?.message}`}
    title={missing ? shellWords.pageNotFound : shellWords.somethingWentWrong}
  >
    {#snippet action()}
      <Button href="/session" label="Go to sessions" />
    {/snippet}
  </EmptyState>
</div>
