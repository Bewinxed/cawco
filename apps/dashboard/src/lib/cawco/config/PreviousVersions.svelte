<script lang="ts" module>
  /** One superseded version as a history listing reads it, without its material. */
  export interface ListedVersion {
    createdAt: string;
    hash: string;
    id: number;
    name: string;
    /** `fleet` for the hub's own row; `machine:<machineId>` for a copy an overwrite took off it. */
    source: string;
  }
</script>

<script lang="ts">
  /**
   * What a fleet row used to be, newest first, each one a click from being
   * the current one again. One list for every row that keeps a history and
   * has no compare of its own — a hook in its editor, a skill under its row —
   * so the two read and restore the same way.
   */
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";

  const LATEST = 5;

  let {
    versions,
    failed,
    restoring,
    restoreFailed,
    onrestore,
    sourceLabel,
  }: {
    versions: ListedVersion[];
    /** Why the list could not be read, when it could not. */
    failed?: string;
    /** The version whose restore is out. */
    restoring: number | null;
    /** The version whose last restore failed. */
    restoreFailed: number | null;
    onrestore: (version: ListedVersion) => void;
    /** Where a kept version came from, in words. */
    sourceLabel: (source: string) => string;
  } = $props();

  let allVersions = $state(false);
  const visibleVersions = $derived(
    allVersions ? versions : versions.slice(0, LATEST)
  );
</script>

<p class="note">
  Every save keeps what it replaced. Restoring writes an old version back as
  this one.
</p>
<!-- Rows that come and go (Show all, a restore's new version) go through
     reflow, what follows sliding. -->
<div class="history" {@attach reflow()}>
  {#if failed}
    <p class="caution" role="alert">{failed}</p>
  {:else if versions.length === 0}
    <p class="note">Nothing has been saved over yet.</p>
  {:else}
    <ul class="versions">
      {#each visibleVersions as version (version.id)}
        <li class="version" data-flip>
          <span class="vtext">
            <span class="vname">{version.name}</span>
            <span class="note">
              {new Date(version.createdAt).toLocaleString()}
              · from {sourceLabel(version.source)}
              · <span class="font-mono">{version.hash.slice(0, 7)}</span>
            </span>
          </span>
          <Button
            disabled={restoring !== null && restoring !== version.id}
            failed={restoreFailed === version.id}
            label="Restore"
            onclick={() => onrestore(version)}
            pending={restoring === version.id}
            pendingLabel="Restoring…"
            size="sm"
            variant="outline"
          />
        </li>
      {/each}
    </ul>
    {#if versions.length > LATEST}
      <div class="more" data-flip>
        <Button
          onclick={() => {
            allVersions = !allVersions;
          }}
          size="sm"
          variant="ghost"
        >
          {allVersions ? "Show the latest 5" : `Show all ${versions.length}`}
        </Button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .caution {
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .more {
    align-self: flex-start;
  }
  .versions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .version {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .vtext {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .vname {
    font: var(--type-label);
    color: var(--ink-strong);
  }
</style>
