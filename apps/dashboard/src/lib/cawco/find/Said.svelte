<script lang="ts">
  /**
   * A row's words as Find draws them (find-rows.ts `Run`): matched runs
   * strong, and each secret the hub named (find-secrets.ts) as dots of one
   * fixed length, never its own, until the person shows that one. The dots
   * sit inside the row's own control: its click (FindRow, FindPeek) reads
   * `data-secret` under the pointer and shows that secret instead of
   * opening, and ↵ on the row shows the first still hidden (Finder). Named
   * for a screen reader as a hidden secret; the row's own words say so too.
   */
  import { findSecretWords as words } from "@cawco/core";
  import { piecesOf, type Run } from "./find-rows";

  let {
    runs,
    shown,
  }: {
    runs: readonly Run[];
    /** The secrets the person showed, by key. */
    shown: ReadonlySet<string>;
  } = $props();

  const pieces = $derived(piecesOf(runs));
</script>

{#snippet said(
  list: readonly Run[]
)}{#each list as run, i (i)}{#if run.matched}<mark
        class="bg-transparent text-ink-strong font-medium">{run.text}</mark
      >{:else}{run.text}{/if}{/each}{/snippet}

{#each pieces as piece, i (piece.secret ?? `said:${i}`)}{#if piece.secret && !shown.has(piece.secret)}<span
      data-slot="secret"
      data-secret={piece.secret}
      class="relative inline-block px-space-1 rounded-xs bg-surface-fill text-ink-muted tracking-caps select-none whitespace-nowrap align-baseline hover:text-ink-strong before:absolute before:inset-x-0 before:-inset-y-space-3"
      aria-label={words.hidden}
      role="img"
      title={words.hidden}>{words.dots}</span
    >{:else if piece.secret}<span
      data-slot="secret"
      data-secret={piece.secret}
      data-shown=""
      class="text-ink-strong">{@render said(piece.runs)}</span
    >{:else}{@render said(piece.runs)}{/if}{/each}
