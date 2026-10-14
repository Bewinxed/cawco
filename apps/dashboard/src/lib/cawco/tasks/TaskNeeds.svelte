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
   * - its stage is of kind `you` (the hub's needsYou): "Review the draft",
   *   the deliverable drawn inline (each output, TaskOutput) and the latest
   *   note from whoever did the work, quoted as theirs; Approve moves it to
   *   the stage after this one the project's moves allow you, named on the
   *   button, and Send back takes a note in place, adds it as your comment
   *   and moves it back to the stage where the work is done;
   * - its last attempt failed or was stopped (the hub's needsYou): which,
   *   when, and Retry, a fresh attempt;
   * - it waits on tasks that have not landed: not yours to do, so it reads
   *   quiet, each blocker with Open, which shows it here in its place.
   * Nothing holds the page; a refusal stays under what it refused.
   *
   * The one block for every place a task that needs you is drawn: the task's
   * own view, and its card in a Caw thread, where it stands `collapsed` to
   * the deliverable's first lines with Show all.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
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
  import MessageBody from "../MessageBody.svelte";
  import {
    approveTarget,
    commentTask,
    readTask,
    retryTask,
    type StagesView,
    sendBackTarget,
    stageLabel,
    type TaskSummary,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import { actionsOf, asksOf } from "./needs.svelte";
  import TaskOutput from "./TaskOutput.svelte";

  let {
    projectId,
    task,
    stages,
    tasks,
    version,
    collapsed = false,
    onmove,
    onchanged,
    onopen,
  }: {
    /** The deliverable stands at its first lines, with Show all (a thread's card). */
    collapsed?: boolean;
    projectId: string;
    task: TaskView;
    stages: StagesView;
    /** Every task, for naming its blockers. */
    tasks: TaskSummary[];
    /** Changes when the task was written: its outputs are read again. */
    version: number;
    /** Moves the task; throws the hub's refusal. */
    onmove: (stage: string) => Promise<TaskView>;
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
  const reviewing = $derived(task.kind === "you");
  const failed = $derived(task.lastAttemptFailed && !task.liveAttempt);
  const lastAttempt = $derived(task.attempts[0]);
  const blockers = $derived(task.blockedBy);

  // --- review ------------------------------------------------------------------

  const approveTo = $derived(approveTarget(stages, task.stage));
  const backTo = $derived(sendBackTarget(stages, task.stage));
  /** The latest note from whoever did the work: anyone but you. */
  const workNote = $derived(
    task.comments.findLast((comment) => comment.author.mover !== "you") ?? null
  );
  let approving = $state(false);
  let reviewProblem = $state<string | null>(null);
  /** Collapsed, the reader asked for the whole deliverable. */
  let showAll = $state(false);
  let deliverable = $state<HTMLElement | null>(null);
  let deliverableHeight = $state(0);
  let deliverableScroll = $state(0);
  /** Collapsed, the deliverable runs past its first lines: Show all is offered. */
  const clipped = $derived(
    collapsed && !showAll && deliverableScroll > deliverableHeight + 1
  );
  $effect(() => {
    const node = deliverable;
    if (!node) {
      return;
    }
    const measure = () => {
      deliverableHeight = node.clientHeight;
      deliverableScroll = node.scrollHeight;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of node.children) {
      observer.observe(child);
    }
    measure();
    return () => observer.disconnect();
  });
  /** Send back's note, while it is open; null when closed. */
  let note = $state<string | null>(null);
  let sending = $state(false);
  let noteField = $state<HTMLTextAreaElement | null>(null);

  async function approve() {
    if (!approveTo) {
      return;
    }
    approving = true;
    reviewProblem = null;
    try {
      await onmove(approveTo.name);
    } catch (error) {
      reviewProblem = message(error);
    } finally {
      approving = false;
    }
  }

  /** Your note goes on the task as your comment, then the task goes back. */
  async function sendBack() {
    const text = note?.trim();
    if (!(backTo && text)) {
      return;
    }
    sending = true;
    reviewProblem = null;
    try {
      onchanged(await commentTask(projectId, task.id, text));
      await onmove(backTo.name);
      note = null;
    } catch (error) {
      reviewProblem = message(error);
    } finally {
      sending = false;
    }
  }

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

{#if asks.length > 0 ||
  actions.length > 0 ||
  reviewing ||
  failed ||
  blockers.length > 0}
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

    {#if reviewing}
      <section aria-label="Review" class="needs" data-reason="review">
        <h3 class="head">
          <IconNeedsYou class="glyph" />
          {task.outputs.length > 0
            ? "Review the draft"
            : `${stageLabel(task.stage)} waits on you`}
        </h3>
        {#if task.outputs.length > 0 || workNote}
          <div
            class="deliverable"
            bind:this={deliverable}
            class:clipped={clipped}
            class:collapsed={collapsed && !showAll}
          >
            {#if task.outputs.length > 0}
              <div class="outputs">
                {#each task.outputs as path (path)}
                  <TaskOutput {path} {projectId} {version} />
                {/each}
              </div>
            {/if}
            {#if workNote}
              <figure class="note">
                <figcaption class="note-by">
                  {workNote.author.name}'s note
                  <span class="when">{ago(workNote.at)}</span>
                </figcaption>
                <blockquote class="note-body">
                  <MessageBody source={workNote.text} />
                </blockquote>
              </figure>
            {/if}
          </div>
          {#if clipped || (collapsed && showAll)}
            <button
              aria-expanded={showAll}
              class="show-all press-tint focus-inset"
              onclick={() => {
                showAll = !showAll;
              }}
              type="button"
            >
              {showAll ? "Show less" : "Show all"}
            </button>
          {/if}
        {/if}
        <RowFault reason={reviewProblem} />
        {#if note === null}
          <!-- In a thread the block is short and the composer stands at the
               scroller's foot: the decision stays in the block's flow. -->
          <div class="acts" class:decide={!collapsed}>
            {#if approveTo}
              <Button
                label="Approve → {stageLabel(approveTo.name)}"
                onclick={approve}
                pending={approving}
                pendingLabel="Approving…"
                size="sm"
              />
            {/if}
            {#if backTo}
              <Button
                disabled={approving}
                label="Send back"
                onclick={() => {
                  note = "";
                  requestAnimationFrame(() => noteField?.focus());
                }}
                size="sm"
                variant="outline"
              />
            {/if}
          </div>
        {:else if backTo}
          <form
            class="send-back"
            onsubmit={(event) => {
              event.preventDefault();
              sendBack();
            }}
          >
            <label class="send-label" for="send-back-{task.id}"
              >What should change? It goes on the task as your comment, and the
              task goes back to {stageLabel(backTo.name)}.</label
            >
            <Textarea
              autocomplete="off"
              id="send-back-{task.id}"
              onkeydown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  note = null;
                } else if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  sendBack();
                }
              }}
              placeholder="Shorter, and lead with the launch date…"
              rows={3}
              bind:ref={noteField}
              bind:value={note}
            />
            <div class="acts">
              <Button
                disabled={!note.trim()}
                label="Send back → {stageLabel(backTo.name)}"
                pending={sending}
                pendingLabel="Sending back…"
                size="sm"
                type="submit"
              />
              <Button
                disabled={sending}
                label="Cancel"
                onclick={() => {
                  note = null;
                }}
                size="sm"
                variant="ghost"
              />
            </div>
          </form>
        {/if}
      </section>
    {/if}

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
     the tint, not its fill: the block can be a page of draft tall, and the
     status marks it without flooding what is read in it. */
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
  /* The decision stays in reach while the draft is read: it stands at the
     scroller's foot while the review is in view, on the block's ground. */
  .acts.decide {
    position: sticky;
    /* Past the task scroller's own foot padding (TaskPane `.task-body`),
       so nothing of the draft shows under it. */
    inset-block-end: calc(var(--space-6) * -1);
    z-index: 1;
    margin-inline: calc(var(--space-4) * -1);
    margin-block-end: calc(var(--space-4) * -1);
    padding: var(--space-3) var(--space-4) var(--space-4);
    border-block-start: 1px solid
      color-mix(in oklab, var(--status-attn-glyph) 25%, transparent);
    border-end-start-radius: var(--radius-md);
    border-end-end-radius: var(--radius-md);
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
  .deliverable {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  /* A thread's card: the deliverable's first lines, fading out at its foot
     while more is past it. */
  .deliverable.collapsed {
    max-block-size: var(--c-needs-peek-h);
    overflow: hidden;
  }
  .deliverable.clipped {
    mask-image: linear-gradient(
      to bottom,
      black calc(100% - var(--space-8)),
      transparent
    );
  }
  .show-all {
    align-self: flex-start;
    margin-block-start: calc(var(--space-2) * -1);
    padding: var(--space-1) var(--space-2);
    margin-inline-start: calc(var(--space-2) * -1);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--status-attn-ink);
  }
  @media (hover: hover) and (pointer: fine) {
    .show-all:hover {
      background: var(--surface-hover);
    }
  }
  .outputs {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .note {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
  }
  .note-by {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .note-body {
    margin: 0;
    padding-inline-start: var(--space-3);
    border-inline-start: 2px solid
      color-mix(in oklab, var(--status-attn-glyph) 50%, transparent);
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
  .send-back {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .send-label {
    font: var(--type-meta);
    color: var(--ink-muted);
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
