<script lang="ts">
  /**
   * A memory proposal landed on the row it concerns (report 2 §5): its kind
   * as the title ("Sort", "Fold", "Archive", "Reshape"), then one sentence
   * of why (Jev's verdict in words for a sort, the hub's or the curator's
   * reason otherwise), then its change per file, then Deny and Approve as
   * peers in the panel form (DESIGN.md, The Peer Rule): a filled tinted
   * pair together at the trailing edge, `--space-2` apart, `--space-4` on a
   * coarse pointer. Answering is the same `permission.answer` every card
   * sends; the pressed peer pends until the hub takes it, then the card
   * goes with the proposal. A refusal stays in the card in the hub's words.
   *
   * It arrives uncovered top to bottom while the rows under it make room
   * (The Nothing Jumps Rule, its block's `reflow`), and closes while fading
   * when the hub answers.
   */
  import {
    type MemoryProposalRow,
    memoryViewWords as words,
  } from "@cawco/core";
  import ErrorText from "#lib/cawco/ErrorText.svelte";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconTick } from "#lib/icons.js";

  const MD = /\.md$/;

  import type { MemorySource } from "./memory-source.svelte";

  let {
    source,
    proposal,
    names,
  }: {
    source: MemorySource;
    proposal: MemoryProposalRow;
    /** Each fact file's name by its path, for the why line. */
    names: Map<string, string>;
  } = $props();

  const ask = $derived(source.ask(proposal.id));
  const state = $derived(source.answerOf(proposal.id));
  const nameOf = (path: string) =>
    names.get(path) ?? path.split("/").at(-1)?.replace(MD, "") ?? path;

  /** The why line: a sort in words, else the reason the hub keeps with it. */
  const why = $derived.by(() => {
    const [sort] = proposal.sorts;
    if (proposal.kind === "sort" && sort) {
      const kinds = new Set(proposal.sorts.map((each) => each.kind));
      return words.sortWhy(
        proposal.notes.length,
        kinds.size === 1 ? words.sorts[sort.kind] : words.sortsMixed,
        nameOf(sort.file)
      );
    }
    return proposal.why;
  });
  const changes = $derived(ask?.presentation.changes ?? []);
</script>

<section
  data-slot="memory-proposal"
  aria-label="{words.kind[proposal.kind]}: {why}"
  class="proposal"
  data-kind={proposal.kind}
  data-proposal={proposal.id}
>
  <header class="head">
    <h3 data-slot="kind" class="kind">{words.kind[proposal.kind]}</h3>
    <p data-slot="why" class="why">{why}</p>
  </header>
  {#each changes as change (change.path)}
    <div data-slot="change" class="change">
      <DiffView
        cap="calc(var(--c-row-h) * 6)"
        filePath={change.path}
        newContent={change.after}
        oldContent={change.before}
      />
    </div>
  {/each}
  {#if ask}
    <div data-slot="peers" class="peers">
      {#if state.refused}
        <ErrorText
          class="refusal"
          message={state.refused}
          title={words.answerRefused}
        />
      {/if}
      <Button
        data-deny
        class="peer deny"
        disabled={state.pending !== null && state.pending !== "deny"}
        icon={IconClose}
        label={words.deny}
        onclick={() => source.answer(proposal.id, "deny")}
        pending={state.pending === "deny"}
        pendingLabel={words.denying}
        size="sm"
        variant="secondary"
      />
      <Button
        data-approve
        class="peer approve"
        disabled={state.pending !== null && state.pending !== "allow"}
        icon={IconTick}
        label={words.approve}
        onclick={() => source.answer(proposal.id, "allow")}
        pending={state.pending === "allow"}
        pendingLabel={words.approving}
        size="sm"
        variant="secondary"
      />
    </div>
  {/if}
</section>

<style>
  /* The panel form of the permission card: a raised tile in the block's
     row flow, hairline edge, the asking tile's radius and padding. */
  .proposal {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    padding: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-raised);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;
  }
  .kind {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .why {
    flex: 1 1 var(--c-memory-why-min);
    min-inline-size: 0;
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .change {
    min-inline-size: 0;
    overflow: clip;
    border-radius: var(--radius-sm);
  }
  .peers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);

    @media (pointer: coarse) {
      gap: var(--space-4);
    }
  }
  .peers > :global(.refusal) {
    flex: 1 1 100%;
  }
  .peers > :global(.peer) {
    border-color: transparent;
  }
  .peers > :global(.deny),
  .peers > :global(.deny:hover) {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  .peers > :global(.approve),
  .peers > :global(.approve:hover) {
    background: var(--status-done-bg);
    color: var(--status-done-ink);
  }
</style>
