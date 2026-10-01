<script lang="ts">
  /**
   * Any route that fails, or any path nothing answers, lands here inside the
   * shell: the rail stays, and one action goes back to the sessions.
   */
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import { EmptyState } from "$lib/components/ui/empty";
  import { IconMapPoint, IconWarningTriangle } from "$lib/icons";

  const missing = $derived(page.status === 404);
</script>

<svelte:head
  ><title>
    {missing ? 'Page not found' : 'Something went wrong'}
    · CawCo
  </title></svelte:head
>

<div class="page">
  <EmptyState
    icon={missing ? IconMapPoint : IconWarningTriangle}
    line={missing
      ? `Nothing is at ${page.url.pathname}.`
      : `${page.error?.message}`}
    title={missing ? 'Page not found' : 'Something went wrong'}
  >
    {#snippet action()}
      <Button href="/session" label="Go to sessions" />
    {/snippet}
  </EmptyState>
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    padding: var(--space-6);
  }
</style>
