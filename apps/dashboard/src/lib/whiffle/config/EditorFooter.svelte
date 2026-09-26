<script lang="ts">
  /**
   * The editor's commit row. It sits outside the scrolling body, on the
   * recess, so no field ever scrolls under it; under 640px it pins to the
   * bottom edge and Delete moves to the header's ⋯ menu.
   */
  import { Button } from "$lib/components/ui/button";
  import { IconTrash } from "$lib/icons";

  let {
    saving,
    saveLabel,
    canSave = true,
    down,
    deleteLabel,
    deleting = false,
    ondelete,
    oncancel,
  }: {
    saving: boolean;
    saveLabel: string;
    canSave?: boolean;
    /** Why writes are blocked, or null. */
    down: string | null;
    deleteLabel?: string;
    deleting?: boolean;
    ondelete?: () => void;
    oncancel: () => void;
  } = $props();
</script>

<footer class="footer">
  <div class="inner">
    {#if ondelete && deleteLabel}
      <Button
        class="delete"
        disabled={down !== null || deleting || saving}
        onclick={ondelete}
        type="button"
        variant="ghost"
      >
        <IconTrash />
        {deleting ? 'Deleting…' : deleteLabel}
      </Button>
    {/if}
    {#if down}
      <span class="down">{down}</span>
    {/if}
    <span class="spacer"></span>
    <Button
      class="footer-btn"
      disabled={saving}
      onclick={oncancel}
      type="button"
      variant="outline"
    >
      Cancel
    </Button>
    <Button
      class="footer-btn save"
      disabled={down !== null || saving || deleting || !canSave}
      type="submit"
    >
      {saving ? 'Saving…' : saveLabel}
    </Button>
  </div>
</footer>

<style>
  .footer {
    flex: none;
    padding: 10px 21px 12px;
    background: var(--surface-recess);
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 980px;
  }
  .spacer {
    flex: 1 1 auto;
  }
  .down {
    min-width: 0;
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
  .inner :global(.save) {
    min-width: 96px;
  }
  .inner :global(.delete) {
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    .footer {
      padding-inline: 7px;
    }
  }
  @media (max-width: 640px) {
    .footer {
      position: sticky;
      bottom: 0;
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
    }
    .inner {
      flex-wrap: wrap;
    }
    .inner :global(.delete),
    .spacer {
      display: none;
    }
    .down {
      flex-basis: 100%;
    }
    .inner :global(.footer-btn) {
      flex: 1;
    }
  }
</style>
