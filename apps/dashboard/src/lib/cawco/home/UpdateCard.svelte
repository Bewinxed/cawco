<script lang="ts">
  /**
   * An update the person has not seen, left on Home until they dismiss it:
   * the title, every release-note line as a list, and Dismiss, with Reload
   * beside it when this tab is older than the dashboard the update brought.
   * Nothing installs from here. The card recipe is NeedsCard's.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import type { Notice } from "../updates/model";

  let {
    notice,
    ondismiss,
    onreload,
  }: {
    notice: Notice;
    ondismiss: () => void;
    /** Given while this tab is older than the dashboard serving it. */
    onreload?: () => void;
  } = $props();
</script>

<article aria-label={notice.title} class="card" data-flip>
  <h2 class="title">{notice.title}</h2>
  {#if notice.notes && notice.notes.length > 0}
    <ul class="notes">
      {#each notice.notes as line, i (i)}
        <li>{line}</li>
      {/each}
    </ul>
  {/if}
  <div class="actions">
    <Button onclick={ondismiss} size="sm" variant="secondary">Dismiss</Button>
    {#if onreload}
      <Button onclick={onreload} size="sm">Reload</Button>
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
    margin: 0;
    padding-inline-start: var(--space-4);
    list-style: disc;
    font: var(--type-body);
    color: var(--ink-row);
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
</style>
