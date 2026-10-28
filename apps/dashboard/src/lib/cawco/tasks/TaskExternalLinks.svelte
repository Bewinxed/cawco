<script lang="ts">
  /**
   * The external items a task links (core external-items.ts), under its
   * title in the task's pane: one row each, its record (the tracker sync's
   * issue) first, after GitHub's Development sidebar. A row is the source's
   * mark, the ref, the state in a word, the title, and the row is a link
   * out to the item. When a read or sync of one stopped short, the source's
   * words stand under its row; the record's with Sync now.
   */
  import { type ExternalRef, externalItemWords } from "@cawco/core";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { IconArrowUpRight } from "#lib/icons.js";
  import RowFault from "../RowFault.svelte";

  let {
    links,
    onsync,
  }: {
    /** Its links, the record first. */
    links: ExternalRef[];
    /** Syncs the project's tracker now and reads the task again: the record's fault offers it. */
    onsync: () => Promise<void>;
  } = $props();

  /** A link's state in a word: the source's own, else ours, else that it is not read yet. */
  const stateWord = (item: ExternalRef): string =>
    item.stateName ||
    (item.state
      ? externalItemWords.state[item.state]
      : externalItemWords.unread);
</script>

<ul
  data-slot="links"
  class="m-0 flex min-w-0 list-none flex-col gap-space-1 p-0"
>
  {#each links as link (link.url)}
    {@const source = externalItemWords.source[link.source]}
    <li
      data-slot="link"
      class="flex min-w-0 flex-col gap-space-1"
      data-failed={link.problem ? "" : undefined}
      data-mode={link.mode}
      data-source={link.source}
    >
      <!-- mark-line: the mark heads words that may wrap: it stands in a mark cell, one line tall, on the first line -->
      <a
        class="mark-line group/link -mx-space-1 flex min-w-0 items-start gap-space-2 rounded-sm px-space-1 type-meta text-ink-muted no-underline hover:bg-surface-hover press-tint focus-inset"
        href={link.url}
        rel="noreferrer"
        target="_blank"
        title={externalItemWords.openOn(source)}
      >
        <span class="mark-cell"
          ><ProviderLogo provider={link.source} size="meta" /></span
        >
        <span
          data-box
          data-slot="link-words"
          class="flex min-w-0 flex-auto flex-wrap items-baseline gap-x-space-2"
        >
          <span
            data-slot="ref"
            class="font-(family-name:--font-mono) liga-none text-link-ink"
            >{link.ref}</span
          >
          <span data-slot="state">{stateWord(link)}</span>
          {#if link.title}
            <span
              data-slot="link-title"
              class="min-w-0 text-ink-strong wrap-anywhere">{link.title}</span
            >
          {/if}
        </span>
        <span class="mark-cell"
          ><IconArrowUpRight
            aria-hidden="true"
            class="size-icon-sm text-ink-subtle"
          /></span
        >
        <span class="sr-only">{externalItemWords.openOn(source)}</span>
      </a>
      {#if link.mode === "record"}
        <RowFault
          again={onsync}
          againLabel="Sync now"
          againPending="Syncing…"
          data-link-fault
          reason={link.problem}
        />
      {:else}
        <RowFault data-link-fault reason={link.problem} />
      {/if}
    </li>
  {/each}
</ul>
