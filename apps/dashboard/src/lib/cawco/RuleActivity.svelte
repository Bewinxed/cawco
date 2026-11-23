<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { failureWords as message } from "#lib/platform/hub-read.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import { loadRuleActivity, type RuleActivity, since, times } from "./rules";

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

<p data-slot="note" class="max-w-measure type-meta text-tx-2">
  Sessions see the reply but never this rule's history, so this is the only
  place it is visible.
</p>

<!-- Rows that arrive, leave or move (a catch coming in, Show all) go
     through reflow: uncovered and faded in, closed and faded out, what
     follows sliding (motion/rows.svelte.ts). -->
<div data-slot="activity" class="flex flex-col gap-space-2" {@attach reflow()}>
  {#if loading}
    <p
      data-slot="note"
      class="mark-line flex max-w-measure items-center gap-space-2 type-meta text-tx-2"
      role="status"
    >
      <LiveDot /><span>Loading…</span>
    </p>
  {:else if failed}
    <p class="type-meta text-orange" role="alert">{failed}</p>
  {:else if rows.length === 0}
    <p data-slot="note" class="max-w-measure type-meta text-tx-2">
      It has not caught anything yet. Nothing to see is the good outcome.
    </p>
  {:else}
    {#if waiting > 0}
      <p data-slot="num" class="num type-meta text-orange" data-flip>
        {waiting}
        {waiting === 1 ? "session is" : "sessions are"}
        still pending — it clears when their next turn ends without matching.
      </p>
    {/if}
    <ul data-slot="list" class="m-0 flex list-none flex-col p-0">
      {#each visible as row (row.instanceId)}
        <li
          data-slot="entry"
          class="flex flex-col gap-space-1 py-space-2 not-first:border-t not-first:border-t-ui"
          data-flip
        >
          <div
            data-slot="top"
            class="flex flex-wrap items-baseline justify-between gap-space-2"
          >
            <span
              data-slot="where"
              class="flex min-w-0 items-baseline gap-space-2"
            >
              <span
                data-slot="path"
                class="font-(family-name:--font-mono) text-sm wrap-anywhere text-tx"
                >{row.where}</span
              >
              {#if row.harness}
                <span class="max-w-measure type-meta text-tx-2"
                  >{row.harness}</span
                >
              {/if}
            </span>
            <span class="max-w-measure type-meta text-tx-2">
              {times(row.totalFires)}, last {since(row.lastFiredAt)}
            </span>
          </div>

          {#if row.status === "pending"}
            <p class="type-meta text-orange">
              Fired {times(row.fireCount)} in a row.
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if rows.length > LATEST}
      <div data-slot="more" class="self-start" data-flip>
        <Button
          onclick={() => {
            all = !all;
          }}
          size="sm"
          variant="ghost"
        >
          {all ? "Show the latest 5" : `Show all ${rows.length}`}
        </Button>
      </div>
    {/if}
  {/if}
</div>
