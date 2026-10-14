<script lang="ts">
  /**
   * What happened on a task, at the end of it: what its work produced (each
   * output drawn as what it is, TaskOutput, unless the review above already
   * shows them), its comments (who, when, the words drawn as a turn's are)
   * with a field to add yours in place, and its history as a quiet list (each
   * commit to its file: a stage move, a change, a comment, who and when).
   * Comments and the history are the hub's: a comment is one commit, written
   * back with the task, and the history is read again whenever the task is.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import MessageBody from "../MessageBody.svelte";
  import {
    commentTask,
    readTaskHistory,
    stageLabel,
    type TaskHistoryEvent,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import TaskOutput from "./TaskOutput.svelte";

  let {
    projectId,
    task,
    version,
    outputs,
    onchanged,
  }: {
    projectId: string;
    task: TaskView;
    /** Changes when the task was written: its outputs and history are read again. */
    version: number;
    /** Its outputs are drawn here: the review above does not show them. */
    outputs: boolean;
    onchanged: (task: TaskView) => void;
  } = $props();

  const ago = (at: number) => formatDistanceToNow(new Date(at));
  const when = (at: number) => new Date(at).toLocaleString();

  // --- comments ----------------------------------------------------------------

  let draft = $state("");
  let saving = $state(false);
  let commentProblem = $state<string | null>(null);

  async function comment() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    saving = true;
    commentProblem = null;
    try {
      onchanged(await commentTask(projectId, task.id, text));
      draft = "";
    } catch (error) {
      commentProblem = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
  }

  // --- history -----------------------------------------------------------------

  let events = $state<TaskHistoryEvent[] | null>(null);
  let historyProblem = $state<string | null>(null);
  $effect(() => {
    const { id } = task;
    // biome-ignore lint/complexity/noVoid: read again whenever the task is written
    void version;
    let gone = false;
    readTaskHistory(projectId, id)
      .then(({ events: read }) => {
        if (!gone) {
          events = read;
          historyProblem = null;
        }
      })
      .catch((error: unknown) => {
        if (!gone) {
          historyProblem =
            error instanceof Error ? error.message : String(error);
        }
      });
    return () => {
      gone = true;
    };
  });
  /** What one commit did, in a few words. */
  const said = (event: TaskHistoryEvent): string => {
    switch (event.kind) {
      case "created":
        return event.stage ? `Filed in ${stageLabel(event.stage.to)}` : "Filed";
      case "moved":
        return event.stage
          ? `${stageLabel(event.stage.from ?? "")} → ${stageLabel(event.stage.to)}`
          : "Moved";
      case "commented":
        return "Commented";
      case "archived":
        return "Archived";
      case "unarchived":
        return "Back out of the archive";
      case "renamed":
        return "Renamed";
      case "deleted":
        return "Deleted";
      case "edited":
        return `Edited: ${event.what}`;
      default:
        return event.what.charAt(0).toUpperCase() + event.what.slice(1);
    }
  };
  /** Newest first, as a feed reads. */
  const newest = $derived([...(events ?? [])].reverse());
</script>

{#if outputs && task.outputs.length > 0}
  <section aria-labelledby="outputs-{task.id}" class="part">
    <h3 class="kit-section-head" id="outputs-{task.id}">
      Outputs
      <span class="count num">{task.outputs.length}</span>
    </h3>
    <div class="outputs">
      {#each task.outputs as path (path)}
        <TaskOutput {path} {projectId} {version} />
      {/each}
    </div>
  </section>
{/if}

<section aria-labelledby="comments-{task.id}" class="part">
  <h3 class="kit-section-head" id="comments-{task.id}">
    Comments
    {#if task.comments.length > 0}
      <span class="count num">{task.comments.length}</span>
    {/if}
  </h3>
  {#if task.comments.length > 0}
    <ol class="comments">
      {#each task.comments as entry, index (index)}
        <li class="comment">
          <div class="by">
            <span class="name">{entry.author.name}</span>
            <time
              class="when"
              datetime={new Date(entry.at).toISOString()}
              title={when(entry.at)}
              >{ago(entry.at)}</time
            >
          </div>
          <MessageBody source={entry.text} />
        </li>
      {/each}
    </ol>
  {/if}
  <form
    class="add"
    onsubmit={(event) => {
      event.preventDefault();
      comment();
    }}
  >
    <Textarea
      aria-label="Add a comment"
      onkeydown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          comment();
        }
      }}
      placeholder="Add a comment…"
      rows={2}
      bind:value={draft}
    />
    <RowFault again={comment} reason={commentProblem} />
    {#if draft.trim()}
      <div class="add-acts">
        <Button
          label="Comment"
          pending={saving}
          pendingLabel="Commenting…"
          size="sm"
          type="submit"
        />
      </div>
    {/if}
  </form>
</section>

<section aria-labelledby="history-{task.id}" class="part">
  <h3 class="kit-section-head" id="history-{task.id}">History</h3>
  {#if historyProblem}
    <p class="quiet">{historyProblem}</p>
  {:else if events === null}
    <p class="quiet">Reading its history…</p>
  {:else if events.length === 0}
    <p class="quiet">No commit has its file yet.</p>
  {:else}
    <ol class="history">
      {#each newest as change (change.commit)}
        <li class="event">
          <span class="what">{said(change)}</span>
          <span class="who">{change.actor.name}</span>
          <time
            class="when"
            datetime={new Date(change.at).toISOString()}
            title={when(change.at)}
            >{ago(change.at)}</time
          >
          {#if change.reason}
            <span class="why">{change.reason}</span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part :global(.kit-section-head) {
    min-block-size: var(--c-btn-h-xs);
    margin: 0;
    padding-inline: 0;
  }
  .outputs {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .comments {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .comment {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .by {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .when {
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .add-acts {
    display: flex;
    justify-content: flex-end;
  }
  .quiet {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* The history is the quietest thing on the task: one meta line a commit. */
  .history {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .event {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .what {
    color: var(--ink-strong);
  }
  .event .when {
    margin-inline-start: auto;
  }
  .why {
    flex-basis: 100%;
    color: var(--ink-subtle);
  }
</style>
