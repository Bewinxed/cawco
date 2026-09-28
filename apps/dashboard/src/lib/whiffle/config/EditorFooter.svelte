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
    failed = false,
    ondelete,
    oncancel,
  }: {
    saving: boolean;
    saveLabel: string;
    canSave?: boolean;
    /** Why writes are blocked, or null: Save and Delete are disabled on it and
        say it as their title. */
    down: string | null;
    deleteLabel?: string;
    deleting?: boolean;
    /** The save or delete that just ended failed (the editor says why). */
    failed?: boolean;
    ondelete?: () => void;
    oncancel: () => void;
  } = $props();
</script>

<footer class="footer">
  <div class="inner">
    {#if ondelete && deleteLabel}
      <Button
        class="delete"
        disabled={down !== null || saving}
        {failed}
        icon={IconTrash}
        label={deleteLabel}
        onclick={ondelete}
        pending={deleting}
        pendingLabel="Deleting…"
        title={down ?? undefined}
        type="button"
        variant="ghost"
      />
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
      disabled={down !== null || deleting || !canSave}
      {failed}
      label={saveLabel}
      pending={saving}
      pendingLabel="Saving…"
      title={down ?? undefined}
      type="submit"
    />
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
      justify-content: flex-end;
    }
    .inner :global(.delete),
    .spacer {
      display: none;
    }
  }
</style>
