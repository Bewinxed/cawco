<script lang="ts">
  /**
   * A task's decision, right under what it decides on (the task pane's
   * foot, a thread card's last band), drawn only while there is one (the
   * owner's pin: "only yes/no? what if the agent needs more actions?"):
   *
   * - It waits on you: what its session asks you to decide first, when it
   *   handed in a decision page still being picked (its title and how many
   *   questions, with Decide, which opens it on the Decisions tab); then
   *   Approve, its arrow a glyph on the label's centre line (the owner's
   *   pin: "why is the -> not lined up?") and the stage it goes to, and Send
   *   back, whose note takes the row's place; then More, every other move
   *   the project's stages allow from where it is, and its session beside.
   * - Its newest session failed or was stopped, or the hub could not start
   *   one: Try again, a new session on the task, and More.
   *
   * Every move is the hub's to make, so each waits for its answer; a
   * refusal is said over the row in the hub's words.
   */
  import { commonWords, type ResultArtifact } from "@cawco/core";
  import type { DecisionPageSummary } from "@cawco/core/decisions";
  import { listDecisions } from "#lib/cawco/decisions/decisions-api.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconArrowRight,
    IconArrowUpRight,
    IconDecisions,
    IconMore,
  } from "#lib/icons.js";
  import { failureWords as message } from "../hub-read";
  import { idForWords, type SentWords } from "../id";
  import {
    addComment,
    approveTarget,
    movesFrom,
    readTask,
    retryTask,
    type StagesView,
    sendBackTarget,
    stageLabel,
    startTask,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import { openBeside } from "./beside.svelte";

  let {
    projectId,
    task,
    stages,
    onmove,
    onchanged,
  }: {
    projectId: string;
    task: TaskView;
    stages: StagesView;
    /** Moves the task; throws the hub's refusal. */
    onmove: (stage: string) => Promise<TaskView>;
    /** The hub wrote the task. */
    onchanged: (task: TaskView) => void;
  } = $props();

  const newest = $derived(task.attempts[0] ?? null);
  const deciding = $derived(task.kind === "you");
  /** Its newest session failed or was stopped, and none runs since. */
  const ended = $derived(
    !!newest &&
      !task.liveAttempt &&
      (newest.state === "failed" || newest.state === "cancelled")
  );
  /** The hub could not start a session on it, and none runs. */
  const refused = $derived(!!task.startProblem && !task.liveAttempt);
  const approveTo = $derived(approveTarget(stages, task.stage));
  const backTo = $derived(sendBackTarget(stages, task.stage));
  /** The other moves the stages allow from where it is: More holds them. */
  const otherMoves = $derived.by(() => {
    const allowed = movesFrom(stages, task.stage);
    return stages.stages.filter(
      (stage) =>
        allowed.has(stage.name) &&
        stage.name !== task.stage &&
        (!deciding ||
          (stage.name !== approveTo?.name && stage.name !== backTo?.name))
    );
  });
  /** Drawn only while there is a decision to make. */
  const shows = $derived(
    (deciding && (approveTo !== null || backTo !== null)) || ended || refused
  );

  // --- what its session asks you to decide ---------------------------------------

  /** The decision page its session handed in, while it is still being picked. */
  let asked = $state<DecisionPageSummary | null>(null);
  const handedIn = $derived(
    (newest?.result?.artifacts ?? [])
      .filter(
        (one): one is Extract<ResultArtifact, { kind: "artifact" }> =>
          one.kind === "artifact"
      )
      .map((one) => one.artifactId)
  );
  $effect(() => {
    const ids = handedIn;
    asked = null;
    if (!deciding || ids.length === 0) {
      return;
    }
    let live = true;
    listDecisions(projectId)
      .then((list) => {
        if (live) {
          asked =
            list.pages.find(
              (page) =>
                page.artifactId !== null &&
                ids.includes(page.artifactId) &&
                page.state === "picking"
            ) ?? null;
        }
      })
      .catch(() => {
        // No list: the decision row says nothing it can't stand behind.
      });
    return () => {
      live = false;
    };
  });
  const askedHref = $derived(
    asked
      ? `/project/${encodeURIComponent(projectId)}?view=decisions&page=${encodeURIComponent(asked.name)}`
      : ""
  );

  // --- the moves -----------------------------------------------------------------

  let pending = $state<"approve" | "send" | "retry" | "move" | null>(null);
  let problem = $state<string | null>(null);
  /** Send back's note while it is open; null when closed. */
  let note = $state<string | null>(null);
  let noteField = $state<HTMLTextAreaElement | null>(null);

  async function move(stage: string, kind: "approve" | "move") {
    pending = kind;
    problem = null;
    try {
      await onmove(stage);
    } catch (error) {
      problem = message(error);
    } finally {
      pending = null;
    }
  }

  /**
   * A new session on the task: as the board's Retry starts one (the hub's
   * `retry`) after one before it, or its first (`attempts`).
   */
  async function tryAgain() {
    pending = "retry";
    problem = null;
    try {
      await (newest
        ? retryTask(projectId, task.id)
        : startTask(projectId, task.id));
      onchanged(await readTask(projectId, task.id));
    } catch (error) {
      problem = message(error);
    } finally {
      pending = null;
    }
  }

  /** The note a Send back that did not go through carried, and its comment's id. */
  let noteSent: SentWords | null = null;

  /** Your note goes on the task as your comment, then the task goes back. */
  async function sendBack() {
    const text = note?.trim();
    if (!(backTo && text)) {
      return;
    }
    pending = "send";
    problem = null;
    // The same note again, after a Send back that did not go through, is the same comment.
    noteSent = idForWords(noteSent, text);
    try {
      onchanged(await addComment(projectId, task.id, text, noteSent.id));
      await onmove(backTo.name);
      noteSent = null;
      note = null;
    } catch (error) {
      problem = message(error);
    } finally {
      pending = null;
    }
  }
</script>

{#snippet more()}
  {#if otherMoves.length > 0 || newest}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label={commonWords.moreFor(task.id)}
            data-decide-more
            disabled={pending !== null}
            size="icon-sm"
            variant="ghost"
          >
            <IconMore />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" width="regular">
        {#each otherMoves as stage (stage.name)}
          <DropdownMenu.Item onSelect={() => move(stage.name, "move")}>
            <IconArrowRight />
            <span>Move to {stageLabel(stage.name)}</span>
          </DropdownMenu.Item>
        {/each}
        {#if newest}
          {#if otherMoves.length > 0}
            <DropdownMenu.Separator />
          {/if}
          <DropdownMenu.Item
            onSelect={() => openBeside(newest.instanceId, projectId, task.id)}
          >
            <IconArrowUpRight />
            <span>Open its session</span>
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
{/snippet}

{#if shows}
  <fieldset
    data-slot="decide"
    aria-label="Decide {task.id}"
    class="m-0 flex min-w-0 flex-col gap-space-2 border-0 p-0"
    data-band="decide"
  >
    <RowFault reason={problem} />
    {#if deciding && asked}
      <!-- What its session asks you to decide, over CawCo's own moves. -->
      <div
        data-slot="asked"
        class="mark-line flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
        data-asked={asked.name}
      >
        <IconDecisions
          aria-hidden="true"
          class="size-icon-md flex-none text-status-attn-glyph"
        />
        <span
          class="min-w-0 flex-auto type-label text-pretty wrap-anywhere text-ink-strong"
          >It asks you to decide {asked.title}</span
        >
        <Button data-box href={askedHref} size="sm" variant="outline"
          >Decide</Button
        >
      </div>
    {/if}
    {#if note === null}
      <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
        {#if deciding && approveTo}
          <Button
            data-approve
            disabled={pending !== null && pending !== "approve"}
            onclick={() => move(approveTo.name, "approve")}
            pending={pending === "approve"}
            size="sm"
          >
            <MorphText
              text={pending === "approve" ? "Approving…" : "Approve"}
            />
            <IconArrowRight aria-hidden="true" data-arrow-mark />
            <span>{stageLabel(approveTo.name)}</span>
          </Button>
        {:else if ended || refused}
          <Button
            data-try-again
            label={commonWords.tryAgain}
            onclick={tryAgain}
            pending={pending === "retry"}
            pendingLabel="Starting…"
            size="sm"
          />
        {/if}
        {#if deciding && backTo}
          <Button
            data-send-back
            disabled={pending !== null}
            label="Send back"
            onclick={() => {
              note = "";
              requestAnimationFrame(() => noteField?.focus());
            }}
            size="sm"
            variant="outline"
          />
        {/if}
        {@render more()}
      </div>
    {:else if backTo}
      <form
        class="flex flex-col gap-space-2"
        onsubmit={(event) => {
          event.preventDefault();
          sendBack();
        }}
      >
        <Textarea
          aria-describedby="send-back-{task.id}-goes"
          aria-label="What should change"
          autocomplete="off"
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
          placeholder="What should change"
          rows={2}
          bind:ref={noteField}
          bind:value={note}
        />
        <p class="m-0 type-meta text-ink-muted" id="send-back-{task.id}-goes">
          Goes on the task as your comment.
        </p>
        <div class="flex flex-wrap items-center gap-space-2">
          <Button
            aria-label="Send back → {stageLabel(backTo.name)}"
            disabled={!note.trim()}
            pending={pending === "send"}
            size="sm"
            type="submit"
          >
            <MorphText
              text={pending === "send" ? "Sending back…" : "Send back"}
            />
            <IconArrowRight aria-hidden="true" data-arrow-mark />
            <span>{stageLabel(backTo.name)}</span>
          </Button>
          <Button
            disabled={pending === "send"}
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
  </fieldset>
{/if}
