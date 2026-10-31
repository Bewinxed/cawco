<script lang="ts">
  /**
   * A member's Record in its settings (build spec §3.4): what it decided and
   * when it last did, how many of its answers he took back, what waits on
   * it now and what it spent this month, one line, each figure a link to
   * where it lives (the project's Decisions, Usage). "Nothing decided yet"
   * before its first. Caw on a project's page adds his own line: what his
   * conversations spent this month, how many he has had (a link to the
   * project's sessions), and his newest turn. While it reads, a line's
   * placeholder; a read that failed, the hub's words and Try again.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import type { RecordRead } from "./decides.svelte";

  let {
    read,
    projectId,
    now,
    onretry,
  }: {
    read: RecordRead;
    /** The page's project, whose Decisions and sessions the figures open; null on the fleet's page. */
    projectId: string | null;
    /** The moment ages count to, ms epoch. */
    now: number;
    onretry: () => Promise<void>;
  } = $props();

  interface Figure {
    href: string | null;
    text: string;
  }

  const words = decidesWords.record;
  /** Dollars in the reader's own format. */
  const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  });
  const usd = (amount: number) => money.format(amount);
  const project = $derived(
    projectId === null ? null : `/project/${encodeURIComponent(projectId)}`
  );
  const decisions = $derived(project && `${project}?view=decisions`);
  const age = (iso: string) => formatAgeShort(Date.parse(iso), now);

  /** The decisions it made, and what waits on it. */
  const figures = $derived.by((): Figure[] => {
    if (read.state !== "read") {
      return [];
    }
    const { record } = read;
    const shown: Figure[] = [
      record.decided === 0
        ? { text: words.nothingYet, href: null }
        : { text: words.decided(record.decided), href: decisions },
    ];
    if (record.lastAt) {
      shown.push({ text: words.last(age(record.lastAt)), href: null });
    }
    if (record.takenBack > 0) {
      shown.push({ text: words.takenBack(record.takenBack), href: decisions });
    }
    if (record.waiting > 0) {
      shown.push({ text: words.waiting(record.waiting), href: decisions });
    }
    // Caw's spend is his conversations', on his own line.
    if (record.caw === null && record.spendUsd > 0) {
      shown.push({ text: words.spend(usd(record.spendUsd)), href: "/usage" });
    }
    return shown;
  });

  /** Caw's own line on a project's page. */
  const caw = $derived.by((): Figure[] => {
    if (read.state !== "read" || read.record.caw === null) {
      return [];
    }
    const { caw: his } = read.record;
    return [
      { text: words.spend(usd(his.spendUsd)), href: "/usage" },
      { text: words.threads(his.threads), href: project },
      ...(his.lastTurnAt
        ? [{ text: words.lastTurn(age(his.lastTurnAt)), href: null }]
        : []),
    ];
  });
</script>

{#snippet line(shown: Figure[])}
  <p
    class="m-0 flex min-w-0 flex-wrap items-baseline gap-x-space-1 gap-y-space-1 type-label text-ink-strong"
  >
    {#each shown as figure, at (figure.text)}
      {#if at > 0}
        <span aria-hidden="true" class="text-ink-muted">·</span>
      {/if}
      {#if figure.href}
        <a
          class="text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
          href={figure.href}>{figure.text}</a
        >
      {:else}
        <span>{figure.text}</span>
      {/if}
    {/each}
  </p>
{/snippet}

{#if read.state === "reading"}
  <Skeleton line="label" radius="text" width="title" />
{:else if read.state === "failed"}
  <RowFault again={onretry} reason={read.reason} />
{:else}
  {@render line(figures)}
  {#if caw.length > 0}
    {@render line(caw)}
  {/if}
{/if}
