<script lang="ts">
  /**
   * A task's activity: what was said about it (its `## Comments`) and what
   * happened to it (its file's history, task-history.ts), in one stream,
   * oldest first. A run of more than three history lines folds to "N
   * changes"; All · Comments narrows it to what was said. A comment's own
   * commit is the comment, so it is not said twice.
   *
   * The composer comes last. Your comment goes where the hub sends it
   * (jev-tasks.ts `commented`): a live attempt reads it at once; an ended
   * one's session continues with it, or a fresh attempt starts, unless the
   * task is done or dropped or was never attempted. The hint says which.
   */
  import Choice from "#lib/cawco/config/Choice.svelte";
  import { failureWords, unreachable } from "#lib/cawco/hub-read.js";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import {
    stageLabel,
    type TaskComment,
    type TaskHistoryEvent,
  } from "#lib/cawco/project-tasks.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconChevronRight, IconHistory } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import RowFault from "../RowFault.svelte";
  import Composer from "../transcript/Composer.svelte";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";

  let {
    comments,
    history,
    historyProblem,
    rereadHistory,
    reaches,
    oncomment,
  }: {
    comments: TaskComment[];
    /** Its file's commits, oldest first; null while they are read. */
    history: TaskHistoryEvent[] | null;
    /** Why the history did not read, in the hub's words; the comments still stand. */
    historyProblem: string | null;
    /** Reads the history again. */
    rereadHistory: () => unknown;
    /**
     * Where your comment goes past the file: `live`, the working session
     * (by its name) reads it; `resumes`, its last session continues or a
     * new one starts; null, it waits in the file for the next brief.
     */
    reaches: { kind: "live"; session: string } | { kind: "resumes" } | null;
    /** Writes the comment; throws the hub's refusal. */
    oncomment: (text: string) => Promise<void>;
  } = $props();

  let only = $state<"all" | "comments">("all");

  /** Your comment, in the session Composer at the stream's foot. */
  const commentDraft = new ComposerDraft();
  let commenting = $state(false);
  let commentRefused = $state("");
  /** The comment never reached the hub: its line offers Send again. */
  let commentAgain = $state(false);
  /** What the Composer stands over its foot: its box holds that much room. */
  let commentFoot = $state(0);
  /** The comment goes; a refusal puts the words back with the hub's reason over them. */
  async function sendComment(text: string) {
    commenting = true;
    commentRefused = "";
    commentAgain = false;
    try {
      await oncomment(text);
    } catch (error) {
      commentDraft.restore(text);
      commentAgain = unreachable(error);
      commentRefused = commentAgain
        ? "Comment not sent: the dashboard couldn't reach the hub. Your words are back in the field. Send again once the hub answers."
        : failureWords(error);
    } finally {
      commenting = false;
    }
  }

  type Line =
    | { kind: "comment"; at: number; who: string; text: string }
    | { kind: "change"; at: number; who: string; text: string };
  type Piece =
    { kind: "one"; line: Line } | { kind: "fold"; key: string; lines: Line[] };

  const who = (name: string) => (name === "you" ? "You" : name);

  /** The hub's commit verbs (tasks.ts: `update priority, labels`, `tick td-2`), said as done. */
  const DONE: Record<string, string> = {
    update: "changed",
    tick: "ticked",
    untick: "unticked",
    add: "added",
    reword: "reworded",
  };
  const VERB = /^(update|tick|untick|add|reword)\b/;
  const done = (what: string) =>
    what.replace(VERB, (verb) => DONE[verb] ?? verb);

  /** A commit, said as what it did. */
  function changeOf(event: TaskHistoryEvent): string {
    const why = event.reason ? `: ${event.reason}` : "";
    switch (event.kind) {
      case "created":
        return event.stage
          ? `made the task in ${stageLabel(event.stage.to)}`
          : "made the task";
      case "moved":
        return event.stage?.from
          ? `moved it from ${stageLabel(event.stage.from)} to ${stageLabel(event.stage.to)}${why}`
          : `moved it to ${stageLabel(event.stage?.to ?? "")}${why}`;
      case "archived":
        return "archived it";
      case "unarchived":
        return "took it out of the archive";
      case "renamed":
        return "renamed its file";
      case "deleted":
        return "deleted its file";
      case "edited":
        return `edited the file by hand${why}`;
      default:
        return `${done(event.what)}${why}`;
    }
  }

  /** History runs longer than three fold; comments always stand. */
  function piecesOf(lines: Line[]): Piece[] {
    const pieces: Piece[] = [];
    let run: Line[] = [];
    const flush = () => {
      if (run.length > 3) {
        pieces.push({ kind: "fold", key: `fold-${run[0].at}`, lines: run });
      } else {
        for (const line of run) {
          pieces.push({ kind: "one", line });
        }
      }
      run = [];
    };
    for (const line of lines) {
      if (line.kind === "change") {
        run.push(line);
      } else {
        flush();
        pieces.push({ kind: "one", line });
      }
    }
    flush();
    return pieces;
  }

  const said = $derived<Line[]>(
    comments.map((comment) => ({
      kind: "comment",
      at: comment.at,
      who: who(comment.author.name),
      text: comment.text,
    }))
  );
  /**
   * The stream in the history's own order. The hub writes each comment as
   * its own commit (`commented`), oldest first as the comments are, so each
   * comment stands where its commit does: a commit's time is whole seconds
   * and a comment's is not, so their times alone would mis-order a comment
   * and a change made in the same second. Comments past the last commented
   * commit (written after the history was read) follow it.
   */
  const stream = $derived.by<Line[]>(() => {
    const waiting = [...said];
    const lines: Line[] = [];
    for (const event of history ?? []) {
      if (event.kind === "commented") {
        const next = waiting.shift();
        if (next) {
          lines.push(next);
        }
      } else {
        lines.push({
          kind: "change",
          at: event.at,
          who: who(event.actor.name),
          text: changeOf(event),
        });
      }
    }
    return [...lines, ...waiting];
  });
  const pieces = $derived(
    only === "comments"
      ? said.map((line) => ({ kind: "one", line }) as Piece)
      : piecesOf(stream)
  );
  const ago = (at: number) => formatDistanceToNow(new Date(at));
</script>

{#snippet line(each: Line)}
  {#if each.kind === "comment"}
    <li data-slot="comment" class="comment">
      <span class="by"
        ><span data-slot="who" class="who">{each.who}</span>
        <time
          class="at"
          datetime={new Date(each.at).toISOString()}
          title={new Date(each.at).toLocaleString()}>{ago(each.at)}</time
        ></span
      >
      <div class="said"><MessageBody source={each.text} /></div>
    </li>
  {:else}
    <!-- mark-line: the glyph heads words that may wrap: it stands in a mark cell, one line tall, on the first line -->
    <li data-slot="change" class="change">
      <span class="mark-cell"><IconHistory aria-hidden="true" /></span>
      <span data-slot="what" class="what"
        ><span data-slot="who" class="who">{each.who}</span> {each.text}</span
      >
      <time
        class="at"
        datetime={new Date(each.at).toISOString()}
        title={new Date(each.at).toLocaleString()}>{ago(each.at)}</time
      >
    </li>
  {/if}
{/snippet}

<section data-slot="activity" class="part activity">
  <div class="part-head">
    <h3 class="kit-section-head">Activity</h3>
    <Choice
      label="Show"
      onchange={(next) => {
        only = next as "all" | "comments";
      }}
      options={[
        { value: "all", label: "All" },
        { value: "comments", label: "Comments" },
      ]}
      value={only}
    />
  </div>
  {#if only === "all"}
    <RowFault again={rereadHistory} reason={historyProblem} />
  {/if}
  {#if history === null && historyProblem === null && only === "all"}
    <div aria-hidden="true" class="reading">
      <Skeleton class="h-3.5 w-2/3" />
      <Skeleton class="h-3.5 w-1/2" />
    </div>
  {:else if pieces.length === 0}
    <p class="hint">
      {only === "comments" ? "No comments yet." : "Nothing has happened yet."}
    </p>
  {:else}
    <ol class="stream">
      {#each pieces as piece (piece.kind === "one" ? `${piece.line.kind}-${piece.line.at}-${piece.line.text}` : piece.key)}
        {#if piece.kind === "one"}
          {@render line(piece.line)}
        {:else}
          <li data-slot="fold" class="fold">
            <Collapsible.Root>
              <Collapsible.Trigger class="fold-head press-tint mark-line">
                <IconChevronRight data-chev aria-hidden="true" class="chev" />
                <span>{piece.lines.length} changes</span>
                <span class="at"
                  >{ago(piece.lines[0].at)} – {ago(
                    piece.lines.at(-1)?.at ?? piece.lines[0].at
                  )}</span
                >
              </Collapsible.Trigger>
              <Collapsible.Content fade reveal>
                <ol data-slot="inner" class="stream inner">
                  {#each piece.lines as each (`${each.at}-${each.text}`)}
                    {@render line(each)}
                  {/each}
                </ol>
              </Collapsible.Content>
            </Collapsible.Root>
          </li>
        {/if}
      {/each}
    </ol>
  {/if}
  <div data-slot="composer" class="composer">
    <!-- The session Composer, words only; it stands on this box's foot
         (Composer .dock), the box as tall as what it stands. The dock
         rises by the screen's bottom inset, so the box holds it too
         (--safe-bottom is set only where data-safe-bottom is). -->
    <div
      data-slot="task-activity-field"
      class="field"
      data-safe-bottom
      style:block-size="calc({commentFoot}px + var(--space-4) +
      var(--safe-bottom))"
    >
      <Composer
        agentName={reaches?.kind === "live" ? reaches.session : "The task"}
        attach={false}
        draft={commentDraft}
        onfoot={(foot) => {
          commentFoot = foot.stack;
        }}
        onstop={() => undefined}
        onsubmit={(text) => {
          // biome-ignore lint/complexity/noVoid: the comment's own state is the composer's sending and its refusal
          void sendComment(text);
        }}
        placeholder="Add a comment…"
        sendAgain={commentAgain}
        sendError={commentRefused}
        sending={commenting}
      />
    </div>
    {#if reaches?.kind === "live"}
      <p class="hint">
        {reaches.session} is working on this task and reads your comment now.
      </p>
    {:else if reaches?.kind === "resumes"}
      <p class="hint">
        Your comment picks the work up again: its last session continues, or a
        new session starts on it.
      </p>
    {/if}
  </div>
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
  .part-head {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .part-head :global(.kit-section-head) {
    flex: 1 1 auto;
  }
  .reading {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .stream {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stream.inner {
    padding: var(--space-2) 0 0 var(--space-5);
  }
  .change {
    display: grid;
    grid-template-columns: var(--icon-sm) minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .change :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--ink-subtle);
  }
  .what {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .who {
    font: var(--type-label);
    font-size: inherit;
    color: var(--ink-strong);
  }
  .at {
    font: var(--type-meta);
    color: var(--ink-subtle);
    white-space: nowrap;
  }
  .comment {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
  }
  .by {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font: var(--type-meta);
  }
  .said {
    min-inline-size: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .part :global(.fold-head) {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    inline-size: 100%;
    padding: var(--space-1) 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font: var(--type-label);
    color: var(--ink-muted);
    text-align: start;
    cursor: pointer;
  }
  .part :global(.fold-head .at) {
    margin-inline-start: auto;
  }
  .part :global(.chev) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    transition: transform var(--dur-control) var(--ease-out);
  }
  .part :global(.fold-head[data-state="open"] .chev) {
    transform: rotate(90deg);
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .field {
    position: relative;
    inline-size: 100%;
  }
  .hint {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
