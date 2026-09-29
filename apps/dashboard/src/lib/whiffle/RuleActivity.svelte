<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { reflow } from "$lib/whiffle/motion/rows.svelte";
  import {
    loadRuleActivity,
    message,
    type RuleActivity,
    since,
    times,
  } from "./rules";

  /**
   * What the rule has caught, per session. A session reads the reply but never
   * sees the rule's fire count, so this is the only surface where it is visible.
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
  Sessions see the reply but never this rule's history, so this is the only
  place it is visible.
</p>

<!-- Rows that arrive, leave or move (a catch coming in, Show all) go
     through reflow: uncovered and faded in, closed and faded out, what
     follows sliding (motion/rows.svelte.ts). -->
<div class="activity" {@attach reflow()}>
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
      <p class="caution num" data-flip>
        {waiting}
        {waiting === 1 ? 'session is' : 'sessions are'}
        still pending — it clears when their next turn ends without matching.
      </p>
    {/if}
    <ul class="list">
      {#each visible as row (row.instanceId)}
        <li class="entry" data-flip>
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
            <p class="caution">Fired {times(row.fireCount)} in a row.</p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if rows.length > LATEST}
      <div class="more" data-flip>
        <Button
          onclick={() => {
          all = !all;
        }}
          size="sm"
          variant="ghost"
        >
          {all ? 'Show the latest 5' : `Show all ${rows.length}`}
        </Button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .activity {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .more {
    align-self: flex-start;
  }
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
</style>
