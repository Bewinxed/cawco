<script lang="ts">
  /**
   * An update the person has not seen, left on Home until they dismiss it:
   * the title, the release notes as their sections and lists, and Dismiss, with Reload
   * beside it when this tab is older than the dashboard the update brought.
   * Nothing installs from here. The card recipe is NeedsCard's.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import type { Notice } from "../updates/model";
  import ReleaseNotes from "../updates/ReleaseNotes.svelte";

  let {
    notice,
    ondismiss,
    onreload,
    reloading = false,
  }: {
    notice: Notice;
    ondismiss: () => void;
    /** Given while this tab is older than the dashboard serving it. */
    onreload?: () => void;
    /** Reload was chosen: the card stands as it is until the tab goes. */
    reloading?: boolean;
  } = $props();
</script>

<article aria-label={notice.title} class="card" data-flip>
  <h2 class="title">{notice.title}</h2>
  {#if notice.notes}
    <div class="notes"><ReleaseNotes source={notice.notes.full} /></div>
  {/if}
  <div class="actions">
    <Button onclick={ondismiss} size="sm" variant="secondary">Dismiss</Button>
    {#if onreload}
      <Button label="Reload" onclick={onreload} pending={reloading} size="sm" />
    {/if}
  </div>
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .title {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .notes {
    font: var(--type-body);
    color: var(--ink-row);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
</style>
