<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    loadRuleActivity,
    message,
    type RuleActivity,
    since,
    times,
  } from "./rules";

  /**
   * What the rule has caught, and what each session said it did about it.
   *
   * This panel is load-bearing rather than decorative. A session reads the
   * reply and is asked to acknowledge it, but never sees the rule's name, id or
   * fire count, so this is the only surface where the mechanism is visible. It is also
   * what makes the tool a session calls honest: that tool says the note reaches
   * the user, and this is the place it reaches.
   */
  let { ruleId }: { ruleId: string } = $props();

  let rows = $state<RuleActivity[]>([]);
  let failed = $state<string | undefined>(undefined);
  let loading = $state(true);

  $effect(() => {
    const id = ruleId;
    loading = true;
    failed = undefined;
    loadRuleActivity(id)
      .then((payload) => {
        if (id !== ruleId) {
          return;
        }
        rows = payload.activity;
      })
      .catch((error: unknown) => {
        if (id !== ruleId) {
          return;
        }
        failed = message(error);
      })
      .finally(() => {
        if (id === ruleId) {
          loading = false;
        }
      });
  });

  /** The latest few first; the rest behind one click. */
  const LATEST = 5;
  let all = $state(false);
  const visible = $derived(all ? rows : rows.slice(0, LATEST));

  const waiting = $derived(
    rows.filter((row) => row.status === "pending").length
  );
</script>

<p class="note">
  Sessions see the reply but never this rule's name or history, so this is the
  only place it is visible. Anything a session wrote back appears here.
</p>

{#if loading}
  <p class="note">Loading…</p>
{:else if failed}
  <p class="caution" role="alert">{failed}</p>
{:else if rows.length === 0}
  <p class="note">
    It has not caught anything yet. Nothing to see is the good outcome.
  </p>
{:else}
  {#if waiting > 0}
    <p class="caution">
      {waiting}
      {waiting === 1 ? 'session is' : 'sessions are'}
      still being reminded — nothing written back yet.
    </p>
  {/if}
  <ul class="list">
    {#each visible as row (row.instanceId)}
      <li class="entry">
        <div class="top">
          <span class="where">
            <span class="path">{row.where}</span>
            {#if row.harness}
              <span class="muted">{row.harness}</span>
            {/if}
          </span>
          <span class="muted">
            {times(row.totalFires)}, last {since(row.lastFiredAt)}
          </span>
        </div>

        {#if row.status === 'pending'}
          <p class="caution">
            Reminded {times(row.fireCount)} since it last wrote back.
          </p>
        {/if}

        {#if row.ackNote}
          <!-- The session's own words, quoted rather than paraphrased. -->
          <blockquote class="quote">{row.ackNote}</blockquote>
          <span class="muted">Written back {since(row.ackedAt)}.</span>
        {:else if row.status !== 'pending'}
          <p class="muted">Settled without a note.</p>
        {/if}
      </li>
    {/each}
  </ul>
  {#if rows.length > LATEST}
    <Button
      class="self-start"
      onclick={() => {
        all = !all;
      }}
      size="sm"
      variant="ghost"
    >
      {all ? 'Show the latest 5' : `Show all ${rows.length}`}
    </Button>
  {/if}
{/if}

<style>
  .note,
  .muted {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .caution {
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .entry {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .where {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .path {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .quote {
    padding-left: 10px;
    border-left: 1px solid var(--border-control);
    font: var(--type-body);
    color: var(--ink-strong);
  }
</style>
