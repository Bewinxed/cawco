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
    <li
      data-slot="comment"
      class="flex flex-col gap-space-1 rounded-md bg-surface-recess px-space-3 py-space-2"
    >
      <span class="flex items-baseline gap-space-2 type-meta"
        ><span
          data-slot="who"
          class="font-body leading-label font-medium text-ink-strong"
          >{each.who}</span
        >
        <time
          class="type-meta whitespace-nowrap text-ink-subtle"
          datetime={new Date(each.at).toISOString()}
          title={new Date(each.at).toLocaleString()}>{ago(each.at)}</time
        ></span
      >
      <div class="min-w-0 type-body wrap-anywhere text-ink-strong">
        <MessageBody source={each.text} />
      </div>
    </li>
  {:else}
    <!-- mark-line: the glyph heads words that may wrap: it stands in a mark cell, one line tall, on the first line -->
    <li
      data-slot="change"
      class="grid grid-cols-(--cols) items-start gap-space-2 type-meta text-ink-muted"
      style:--cols="var(--icon-sm) minmax(0, 1fr) auto"
    >
      <span class="mark-cell"
        ><IconHistory
          aria-hidden="true"
          class="size-icon-sm text-ink-subtle"
        /></span
      >
      <span data-slot="what" class="min-w-0 wrap-anywhere"
        ><span
          data-slot="who"
          class="font-body leading-label font-medium text-ink-strong"
          >{each.who}</span
        > {each.text}</span
      >
      <time
        class="type-meta whitespace-nowrap text-ink-subtle"
        datetime={new Date(each.at).toISOString()}
        title={new Date(each.at).toLocaleString()}>{ago(each.at)}</time
      >
    </li>
  {/if}
{/snippet}

<section data-slot="activity" class="flex flex-col gap-space-2">
  <div class="flex items-end gap-space-2">
    <h3 class="kit-section-head m-0 min-h-c-btn-h-xs flex-auto px-0">
      Activity
    </h3>
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
    <div aria-hidden="true" class="flex flex-col gap-space-2">
      <Skeleton class="h-space-4 w-2/3" />
      <Skeleton class="h-space-4 w-1/2" />
    </div>
  {:else if pieces.length === 0}
    <p class="type-meta text-ink-muted">
      {only === "comments" ? "No comments yet." : "Nothing has happened yet."}
    </p>
  {:else}
    <ol class="m-0 flex list-none flex-col gap-space-2 p-0">
      {#each pieces as piece (piece.kind === "one" ? `${piece.line.kind}-${piece.line.at}-${piece.line.text}` : piece.key)}
        {#if piece.kind === "one"}
          {@render line(piece.line)}
        {:else}
          <li data-slot="fold">
            <Collapsible.Root>
              <Collapsible.Trigger
                class="group press-tint mark-line flex w-full cursor-pointer items-center gap-space-1 rounded-sm border-0 bg-transparent px-0 py-space-1 type-label text-start text-ink-muted"
              >
                <IconChevronRight
                  data-chev
                  aria-hidden="true"
                  class="size-icon-sm flex-none transition-[rotate] dur-control ease-out group-state-open:rotate-90"
                />
                <span>{piece.lines.length} changes</span>
                <span
                  class="ms-auto type-meta whitespace-nowrap text-ink-subtle"
                  >{ago(piece.lines[0].at)} – {ago(
                    piece.lines.at(-1)?.at ?? piece.lines[0].at
                  )}</span
                >
              </Collapsible.Trigger>
              <Collapsible.Content fade reveal>
                <ol
                  data-slot="inner"
                  class="m-0 flex list-none flex-col gap-space-2 pt-space-2 pr-0 pb-0 pl-space-5"
                >
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
  <div data-slot="composer" class="flex flex-col gap-space-1">
    <!-- The session Composer, words only; it stands on this box's foot
         (Composer .dock), the box as tall as what it stands. -->
    <div
      data-slot="task-activity-field"
      class="relative h-(--foot) w-full"
      style:--foot="calc({commentFoot}px + var(--space-4) + var(--safe-bottom))"
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
      <p class="type-meta text-ink-muted">
        {reaches.session} is working on this task and reads your comment now.
      </p>
    {:else if reaches?.kind === "resumes"}
      <p class="type-meta text-ink-muted">
        Your comment picks the work up again: its last session continues, or a
        new session starts on it.
      </p>
    {/if}
  </div>
</section>
