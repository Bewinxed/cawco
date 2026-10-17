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
   * - its newest session failed or was stopped: which, when, and Try again,
   *   a new session (`ended`; the task's own pane carries it in its review);
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
    ended = true,
  }: {
    projectId: string;
    task: TaskView;
    /** Its newest session that failed or was stopped, with Try again; false where its review beside says it (TaskPane). */
    ended?: boolean;
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
  const failed = $derived(
    ended &&
      (task.lastAttemptFailed || task.lastAttemptStopped) &&
      !task.liveAttempt
  );
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
  <div data-slot="task-needs-needs-stack" class="flex flex-col gap-space-3">
    {#each asks as blocked (blocked.request.requestId)}
      <section
        data-slot="needs"
        aria-label="Its session asks"
        class="flex flex-col gap-space-3 pt-space-3 px-space-4 pb-space-4 border border-status-attn-glyph/40 rounded-md bg-needs-ground"
      >
        <h3
          data-slot="head"
          class="flex items-center gap-space-2 m-0 type-label text-status-attn-ink mark-line"
        >
          <IconNeedsYou
            data-task-needs-glyph
            class="flex-none size-icon-md text-status-attn-glyph"
          />
          <span>Its session asks you</span>
          <span
            data-slot="when"
            class="ms-auto type-meta text-ink-muted whitespace-nowrap"
            >{blocked.request.raisedAt
              ? ago(blocked.request.raisedAt)
              : ""}</span
          >
        </h3>
        <p class="m-0 type-body text-ink-strong">
          {blocked.request.presentation.summary}
        </p>
        <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
          <Button href={rowHref(blocked.instanceId)} label="Answer" size="sm" />
        </div>
      </section>
    {/each}

    {#each actions as action (action.id)}
      {@const proposed = action.state === "proposed"}
      <section
        data-slot="needs"
        aria-label="An approved action"
        class="flex flex-col gap-space-3 pt-space-3 px-space-4 pb-space-4 border border-status-attn-glyph/40 rounded-md bg-needs-ground"
      >
        <h3
          data-slot="head"
          class="flex items-center gap-space-2 m-0 type-label text-status-attn-ink mark-line"
        >
          {#if proposed}
            <IconNeedsYou
              data-task-needs-glyph
              class="flex-none size-icon-md text-status-attn-glyph"
            />
            <span>Approve {action.tool} on {action.connection}</span>
          {:else}
            <IconError
              data-task-needs-glyph
              class="flex-none size-icon-md text-status-fail-glyph"
            />
            <span
              >{action.state === "unknown"
                ? `${action.tool} may or may not have happened`
                : `${action.tool} failed`}</span
            >
          {/if}
          <span
            data-slot="when"
            class="ms-auto type-meta text-ink-muted whitespace-nowrap"
            >{ago(action.endedAt ?? action.createdAt)}</span
          >
        </h3>
        <p class="m-0 type-body text-ink-strong">
          {#if action.state === "unknown"}
            Check {action.service}.
          {:else if action.state === "failed"}
            {action.error ?? `${action.service} did not take it.`}
          {:else}
            {action.reason}
          {/if}
        </p>
        {#if proposed}
          <!-- literal: 12rem -->
          <pre
            data-slot="args"
            class="max-h-(--args-max) m-0 py-space-2 px-space-3 overflow-auto border border-border-well rounded-sm bg-surface-well type-meta font-mono liga-none whitespace-pre-wrap wrap-anywhere"
            style:--args-max="12rem">{action.args}</pre>
        {/if}
        <RowFault reason={actionProblem[action.id] ?? null} />
        <div
          data-slot="peers"
          data-acts
          class="flex flex-wrap items-center gap-space-2 coarse:gap-space-4"
        >
          {#if proposed}
            <Button
              data-deny
              aria-label="Deny {action.tool} on {action.connection}"
              answer="deny"
              disabled={deciding !== null}
              onclick={() => decide(action, "deny")}
              size="sm"
              variant="secondary"
            >
              <IconClose />
              <span>Deny</span>
            </Button>
            <Button
              data-approve
              aria-label="Approve {action.tool} on {action.connection}"
              answer="approve"
              disabled={deciding !== null}
              onclick={() => decide(action, "approve")}
              size="sm"
              variant="secondary"
            >
              <IconTick />
              <span>Approve</span>
            </Button>
          {:else}
            <Button
              disabled={deciding !== null}
              onclick={() => decide(action, "checked")}
              size="sm"
              variant="secondary"
            >
              <IconCheck />
              <span>Remove</span>
            </Button>
          {/if}
        </div>
      </section>
    {/each}

    {#if failed && lastAttempt}
      <section
        data-slot="needs"
        aria-label="Its session"
        class="flex flex-col gap-space-3 pt-space-3 px-space-4 pb-space-4 border border-status-attn-glyph/40 rounded-md bg-needs-ground"
        data-reason="failed"
      >
        <h3
          data-slot="head"
          class="flex items-center gap-space-2 m-0 type-label text-status-attn-ink mark-line"
        >
          <IconError
            data-task-needs-glyph
            class="flex-none size-icon-md text-status-fail-glyph"
          />
          <span
            >{lastAttempt.state === "cancelled"
              ? "Its session was stopped"
              : "Its session failed"}</span
          >
          <span
            data-slot="when"
            class="ms-auto type-meta text-ink-muted whitespace-nowrap"
            >{ago(lastAttempt.endedAt ?? lastAttempt.startedAt)}</span
          >
        </h3>
        {#if lastAttempt.endedHow}
          <p class="m-0 type-body text-ink-strong">{lastAttempt.endedHow}</p>
        {/if}
        <RowFault reason={retryProblem} />
        <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
          <Button
            label="Try again"
            onclick={retry}
            pending={retrying}
            pendingLabel="Starting…"
            size="sm"
          />
          <Button
            href={rowHref(lastAttempt.instanceId)}
            label="Open its session"
            size="sm"
            variant="ghost"
          />
        </div>
      </section>
    {/if}

    {#if blockers.length > 0}
      <section
        data-slot="needs"
        aria-label="Waits on"
        class="flex flex-col gap-space-3 pt-space-3 px-space-4 pb-space-4 border border-border-hairline rounded-md bg-surface-recess"
      >
        <h3
          data-slot="head"
          class="flex items-center gap-space-2 m-0 type-label text-ink-strong mark-line"
        >
          <IconLock
            data-task-needs-glyph
            class="flex-none size-icon-md text-ink-muted"
          />
          <span
            >Waits on {blockers.length === 1
              ? "a task that has not landed"
              : `${blockers.length} tasks that have not landed`}</span
          >
        </h3>
        <ul class="flex flex-col gap-space-1 m-0 p-0 list-none">
          {#each blockers as id (id)}
            <li class="flex items-center gap-space-2 min-w-0">
              <span
                class="flex-none type-meta font-mono liga-none text-ink-muted"
                >{id}</span
              >
              <span
                class="flex-auto min-w-0 type-label text-ink-strong truncate"
                >{titleOf(id) ?? ""}</span
              >
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
