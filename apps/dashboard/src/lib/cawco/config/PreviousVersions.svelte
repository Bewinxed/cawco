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
  import RowFault from "#lib/cawco/RowFault.svelte";
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
    /** The version whose last restore failed, and why: said under it. */
    restoreFailed: { id: number; reason: string } | null;
    onrestore: (version: ListedVersion) => void;
    /** Where a kept version came from, in words. */
    sourceLabel: (source: string) => string;
  } = $props();

  let allVersions = $state(false);
  const visibleVersions = $derived(
    allVersions ? versions : versions.slice(0, LATEST)
  );
</script>

<!-- literal: 72ch, 8px, 10px -->
<p
  data-slot="note"
  class="max-w-(--measure) type-meta text-ink-muted"
  style:--measure="72ch"
>
  Every save keeps what it replaced. Restoring writes an old version back as
  this one.
</p>
<!-- Rows that come and go (Show all, a restore's new version) go through
     reflow, what follows sliding. -->
<div class="flex flex-col gap-(--hist-gap)" style:--hist-gap="8px" {@attach reflow()}>
  {#if failed}
    <p class="type-meta text-status-attn-ink" role="alert">{failed}</p>
  {:else if versions.length === 0}
    <p
      data-slot="note"
      class="max-w-(--measure) type-meta text-ink-muted"
      style:--measure="72ch"
    >Nothing has been saved over yet.</p>
  {:else}
    <ul class="flex flex-col gap-space-row m-0 p-0 list-none" style:--v-py="8px" style:--v-px="10px">
      {#each visibleVersions as version (version.id)}
        <li class="flex flex-wrap items-center justify-between gap-(--hist-gap) py-(--v-py) px-(--v-px) rounded-sm bg-surface-recess" data-flip>
          <span class="flex flex-col gap-space-row">
            <span class="type-label text-ink-strong">{version.name}</span>
            <span data-slot="note" class="max-w-(--measure) type-meta text-ink-muted" style:--measure="72ch">
              {new Date(version.createdAt).toLocaleString()}
              · from {sourceLabel(version.source)}
              · <span class="font-mono">{version.hash.slice(0, 7)}</span>
            </span>
          </span>
          <Button
            disabled={restoring !== null && restoring !== version.id}
            failed={restoreFailed?.id === version.id}
            label="Restore"
            onclick={() => onrestore(version)}
            pending={restoring === version.id}
            pendingLabel="Restoring…"
            size="sm"
            variant="outline"
          />
          <RowFault
            class="basis-full"
            reason={restoreFailed?.id === version.id
              ? restoreFailed.reason
              : null}
          />
        </li>
      {/each}
    </ul>
    {#if versions.length > LATEST}
      <div data-slot="more" class="self-start" data-flip>
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

