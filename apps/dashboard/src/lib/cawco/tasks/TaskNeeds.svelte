<script lang="ts">
  /**
   * What a task needs from you, first, each reason with the way to act on it
   * here (DESIGN.md, The Stay In Context Rule):
   * - its session asks you something (a permission or a question its
   *   parent does not answer): the ask in its own words, and Answer, which
   *   opens the session where the ask stands;
   * - an approved action filed for it waits on your decision: the call and
   *   why, with Deny and Approve as peers (The Peer Rule); one that failed
   *   or whose outcome is unknown says so, and Remove puts it away;
   * - its last attempt failed or was stopped (the hub's needsYou): which,
   *   when, and Retry, a fresh attempt;
   * - it waits on tasks that have not landed: not yours to do, so it reads
   *   quiet, each blocker with Open, which shows it here in its place.
   * Nothing holds the page; a refusal stays under what it refused.
   *
   * A stage of kind `you` is a review, drawn by TaskReview: the task's view
   * opens on it, and a Caw thread's card carries it compact.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconCheck,
    IconClose,
    IconError,
    IconLock,
    IconNeedsYou,
    IconTick,
  } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { decideAction } from "../client.svelte";
  import { failureWords as message } from "../hub-read";
  import { rowHref } from "../links";
  import {
    readTask,
    retryTask,
    type TaskSummary,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import { actionsOf, asksOf } from "./needs.svelte";

  let {
    projectId,
    task,
    tasks,
    onchanged,
    onopen,
  }: {
    projectId: string;
    task: TaskView;
    /** Every task, for naming its blockers. */
    tasks: TaskSummary[];
    /** The hub wrote the task. */
    onchanged: (task: TaskView) => void;
    /** Shows another task in this one's place. */
    onopen: (id: string) => void;
  } = $props();

  const ago = (at: number) => formatDistanceToNow(new Date(at));

  // --- the reasons ---------------------------------------------------------------

  // The reasons past the hub's, as every place reads them (needs.svelte.ts).
  const asks = $derived(asksOf(task));
  const actions = $derived(actionsOf(projectId, task.id));
  const failed = $derived(task.lastAttemptFailed && !task.liveAttempt);
  const lastAttempt = $derived(task.attempts[0]);
  const blockers = $derived(task.blockedBy);

  // --- a failed attempt --------------------------------------------------------

  let retrying = $state(false);
  let retryProblem = $state<string | null>(null);

  async function retry() {
    const { id } = task;
    retrying = true;
    retryProblem = null;
    try {
      await retryTask(projectId, id);
      onchanged(await readTask(projectId, id));
    } catch (error) {
      retryProblem = message(error);
    } finally {
      retrying = false;
    }
  }

  // --- an approved action ------------------------------------------------------

  let deciding = $state<string | null>(null);
  let actionProblem = $state<Record<string, string>>({});

  async function decide(
    action: (typeof actions)[number],
    decision: "approve" | "deny" | "checked"
  ) {
    deciding = `${action.id}:${decision}`;
    const { [action.id]: _, ...rest } = actionProblem;
    actionProblem = rest;
    try {
      await decideAction(action, decision);
    } catch (error) {
      actionProblem = { ...actionProblem, [action.id]: message(error) };
    } finally {
      deciding = null;
    }
  }

  const titleOf = (id: string) => tasks.find((each) => each.id === id)?.title;
</script>

{#if asks.length > 0 || actions.length > 0 || failed || blockers.length > 0}
  <div class="needs-stack">
    {#each asks as blocked (blocked.request.requestId)}
      <section aria-label="Its session asks" class="needs">
        <h3 class="head">
          <IconNeedsYou class="glyph" />
          Its session asks you
          <span class="when"
            >{blocked.request.raisedAt
              ? ago(blocked.request.raisedAt)
              : ""}</span
          >
        </h3>
        <p class="line">{blocked.request.presentation.summary}</p>
        <div class="acts">
          <Button href={rowHref(blocked.instanceId)} label="Answer" size="sm" />
        </div>
      </section>
    {/each}

    {#each actions as action (action.id)}
      {@const proposed = action.state === "proposed"}
      <section aria-label="An approved action" class="needs">
        <h3 class="head">
          {#if proposed}
            <IconNeedsYou class="glyph" />
            Approve {action.tool} on {action.connection}
          {:else}
            <IconError class="glyph fail" />
            {action.state === "unknown"
              ? `${action.tool} may or may not have happened`
              : `${action.tool} failed`}
          {/if}
          <span class="when">{ago(action.endedAt ?? action.createdAt)}</span>
        </h3>
        <p class="line">
          {#if action.state === "unknown"}
            Check {action.service}.
          {:else if action.state === "failed"}
            {action.error ?? `${action.service} did not take it.`}
          {:else}
            {action.reason}
          {/if}
        </p>
        {#if proposed}
          <pre class="args">{action.args}</pre>
        {/if}
        <RowFault reason={actionProblem[action.id] ?? null} />
        <div class="acts peers">
          {#if proposed}
            <Button
              aria-label="Deny {action.tool} on {action.connection}"
              class="peer deny"
              disabled={deciding !== null}
              onclick={() => decide(action, "deny")}
              size="sm"
              variant="secondary"
            >
              <IconClose />
              Deny
            </Button>
            <Button
              aria-label="Approve {action.tool} on {action.connection}"
              class="peer approve"
              disabled={deciding !== null}
              onclick={() => decide(action, "approve")}
              size="sm"
              variant="secondary"
            >
              <IconTick />
              Approve
            </Button>
          {:else}
            <Button
              disabled={deciding !== null}
              onclick={() => decide(action, "checked")}
              size="sm"
              variant="secondary"
            >
              <IconCheck />
              Remove
            </Button>
          {/if}
        </div>
      </section>
    {/each}

    {#if failed && lastAttempt}
      <section aria-label="Last attempt" class="needs" data-reason="failed">
        <h3 class="head">
          <IconError class="glyph fail" />
          {lastAttempt.state === "cancelled"
            ? "The last attempt was stopped"
            : "The last attempt failed"}
          <span class="when"
            >{ago(lastAttempt.endedAt ?? lastAttempt.startedAt)}</span
          >
        </h3>
        <p class="line">
          Read what it did in
          <a class="link" href={rowHref(lastAttempt.instanceId)}
            >attempt {task.attempts.length}</a
          >, then try again: a fresh attempt starts in its workspace.
        </p>
        <RowFault reason={retryProblem} />
        <div class="acts">
          <Button
            label="Retry"
            onclick={retry}
            pending={retrying}
            pendingLabel="Retrying…"
            size="sm"
          />
        </div>
      </section>
    {/if}

    {#if blockers.length > 0}
      <section aria-label="Waits on" class="needs quiet">
        <h3 class="head">
          <IconLock class="glyph" />
          Waits on
          {blockers.length === 1
            ? "a task that has not landed"
            : `${blockers.length} tasks that have not landed`}
        </h3>
        <ul class="blockers">
          {#each blockers as id (id)}
            <li class="blocker">
              <span class="ref-id">{id}</span>
              <span class="ref-title">{titleOf(id) ?? ""}</span>
              <Button
                label="Open"
                onclick={() => onopen(id)}
                size="xs"
                variant="ghost"
              />
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}

<style>
  .needs-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  /* What needs you, marked in the needs-you tint: spark, never coral (The
     Coral Is Where You Act Rule); its one action is the coral. A wash of
     the tint, not its fill. */
  .needs {
    --needs-ground: color-mix(
      in oklab,
      var(--status-attn-bg) 45%,
      var(--surface-raised)
    );
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-4);
    border: 1px solid
      color-mix(in oklab, var(--status-attn-glyph) 40%, transparent);
    border-radius: var(--radius-md);
    background: var(--needs-ground);
  }
  .needs.quiet {
    border-color: var(--border-hairline);
    background: var(--surface-recess);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--status-attn-ink);
  }
  .quiet .head {
    color: var(--ink-strong);
  }
  .head :global(.glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--status-attn-glyph);
  }
  .head :global(.glyph.fail) {
    color: var(--status-fail-glyph);
  }
  .quiet .head :global(.glyph) {
    color: var(--ink-muted);
  }
  .when {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .line {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .link {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .args {
    max-block-size: 12rem;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    overflow: auto;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
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
  @media (pointer: coarse) {
    .peers {
      gap: var(--space-4);
    }
  }
  .blockers {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .blocker {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .ref-id {
    flex: none;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-muted);
  }
  .ref-title {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
