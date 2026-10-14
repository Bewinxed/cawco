<script lang="ts">
  /**
   * A task's review, in four fixed bands, so everything it has is named on
   * one screen and nothing waits below a scroll to be found:
   * 1. The result: the words its attempt handed in (`task_result`), at most
   *    three lines with `more`, the `Check:` line, and the attempt it came
   *    from. A result in words alone keeps only this band's label row: its
   *    words are the stage.
   * 2. A chip strip naming every artifact, in the order handed in (the
   *    `primary` one chosen as it opens), then the attempt's Transcript. The
   *    chips wrap, never scroll: a clipped strip hides things as a stack does.
   * 3. The stage: the chosen chip drawn whole (TaskOutput for a file or a
   *    post, a card for a link or a page artifact, the words, or the
   *    attempt's transcript, read when its chip is first chosen). The only
   *    region that scrolls.
   * 4. The decision, pinned: Approve → the next stage the moves allow you,
   *    and Send back, whose note takes the bar's place with the stage still
   *    in view: your comment, then the stage where the work is done.
   *
   * `compact` (a Caw thread's card): the result band, the strip and the
   * decision; a chip opens the task beside the conversation.
   */
  import {
    artifactName,
    deliverableKind,
    type ResultArtifact,
  } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconArrowUpRight,
    IconArtifactPage,
    IconAudio,
    IconDocument,
    IconFileMarkdown,
    IconImage,
    IconLink,
    IconNeedsYou,
    IconPost,
    IconResult,
    IconTranscript,
    IconVideo,
  } from "#lib/icons.js";
  import {
    cawco,
    readTranscript,
    unwatchDelegate,
    watchDelegate,
  } from "../client.svelte";
  import { failureWords as message } from "../hub-read";
  import { rowHref } from "../links";
  import MessageBody from "../MessageBody.svelte";
  import {
    approveTarget,
    attemptWord,
    commentTask,
    reviewOf,
    type StagesView,
    sendBackTarget,
    stageLabel,
    type TaskAttempt,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import InlineTranscript from "../transcript/InlineTranscript.svelte";
  import TaskOutput from "./TaskOutput.svelte";

  let {
    projectId,
    task,
    stages,
    version,
    compact = false,
    onmove,
    onchanged,
    onopen,
  }: {
    projectId: string;
    task: TaskView;
    stages: StagesView;
    /** Changes when the task was written: its files are read again. */
    version: number;
    /** A thread's card: no stage; a chip opens the task. */
    compact?: boolean;
    /** Moves the task; throws the hub's refusal. */
    onmove: (stage: string) => Promise<TaskView>;
    /** The hub wrote the task. */
    onchanged: (task: TaskView) => void;
    /** Opens the task in full (`compact`). */
    onopen?: (id: string) => void;
  } = $props();

  const review = $derived(reviewOf(task));
  const result = $derived(review?.result ?? null);
  const artifacts = $derived(result?.artifacts ?? []);
  /** Its words are all it handed in: they are the stage. */
  const wordsOnly = $derived(
    artifacts.length === 0 && (result?.summary.length ?? 0) > 0
  );
  const deciding = $derived(task.kind === "you");
  const artifactCount = $derived.by(() => {
    if (artifacts.length === 0) {
      return "no artifacts";
    }
    return artifacts.length === 1
      ? "1 artifact"
      : `${artifacts.length} artifacts`;
  });

  // --- the attempt it came from ---------------------------------------------------

  const numberOf = (attempt: TaskAttempt): number =>
    task.attempts.length - task.attempts.indexOf(attempt);
  /** How long it ran, or that it still runs. */
  const ranFor = (attempt: TaskAttempt): string => {
    if (attempt.endedAt === null) {
      return "still running";
    }
    const minutes = Math.max(
      1,
      Math.round((attempt.endedAt - attempt.startedAt) / 60_000)
    );
    return minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  };
  const attemptLine = (attempt: TaskAttempt): string =>
    `Attempt ${numberOf(attempt)} · ${attemptWord(attempt.state)} · ${ranFor(attempt)}`;

  // --- the chips -----------------------------------------------------------------

  interface Chip {
    artifact?: ResultArtifact;
    key: string;
    label: string;
    what: "artifact" | "words" | "transcript";
  }
  const chips = $derived<Chip[]>([
    ...artifacts.map((artifact, index) => ({
      key: `a${index}`,
      label: artifactName(artifact),
      what: "artifact" as const,
      artifact,
    })),
    ...(wordsOnly
      ? [{ key: "words", label: "Result", what: "words" as const }]
      : []),
    ...(task.attempts.length > 0
      ? [
          {
            key: "transcript",
            label: "Transcript",
            what: "transcript" as const,
          },
        ]
      : []),
  ]);
  /** The chip it opens on: the primary artifact, else the first. */
  const opening = $derived.by(() => {
    const primary = artifacts.findIndex((artifact) => artifact.primary);
    return primary >= 0 ? `a${primary}` : (chips[0]?.key ?? null);
  });
  let chosenKey = $state<string | null>(null);
  // Another task, or another result, opens on its own opening chip.
  let openedFor = "";
  $effect(() => {
    const stamp = `${task.id}:${result?.at ?? "none"}:${chips.length}`;
    if (stamp !== openedFor) {
      openedFor = stamp;
      chosenKey = opening;
    }
  });
  const chosen = $derived(
    chips.find((chip) => chip.key === chosenKey) ?? chips[0] ?? null
  );

  const iconOf = (chip: Chip) => {
    if (chip.what === "transcript") {
      return IconTranscript;
    }
    if (chip.what === "words" || !chip.artifact) {
      return IconResult;
    }
    const { artifact } = chip;
    switch (artifact.kind) {
      case "post":
        return IconPost;
      case "link":
        return IconLink;
      case "artifact":
        return IconArtifactPage;
      default:
        return (
          {
            markdown: IconFileMarkdown,
            image: IconImage,
            video: IconVideo,
            audio: IconAudio,
            post: IconPost,
            file: IconDocument,
          } as const
        )[deliverableKind(artifact.path)];
    }
  };

  function choose(chip: Chip) {
    if (compact) {
      onopen?.(task.id);
      return;
    }
    chosenKey = chip.key;
  }
  /** What a chip's tooltip says: a file's path, else its label. */
  const titleOf = (chip: Chip): string =>
    chip.artifact && "path" in chip.artifact ? chip.artifact.path : chip.label;
  const STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
  /** ← and → move between the chips, as a tab list's arrows do. */
  function onChipKey(event: KeyboardEvent, index: number) {
    const step = STEPS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const next = chips[(index + step + chips.length) % chips.length];
    if (next) {
      chosenKey = next.key;
      const list = (event.currentTarget as HTMLElement).parentElement;
      (
        list?.querySelector(`[data-chip="${next.key}"]`) as HTMLElement
      )?.focus();
    }
  }

  // --- band 1: three lines at most, the Check line always one of them ----------

  let more = $state(false);
  let wordsBox = $state<HTMLElement | null>(null);
  let clipped = $state(false);
  $effect(() => {
    const node = wordsBox;
    if (!node) {
      return;
    }
    // Clipped: the summary past its two lines, or the check past its one.
    const measure = () => {
      clipped = [...node.querySelectorAll(".summary, .check")].some(
        (line) => line.scrollHeight > line.clientHeight + 1
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  });

  // --- the transcript: read when its chip is first chosen -----------------------

  let pickedAttempt = $state<string | null>(null);
  const transcriptAttempt = $derived(
    task.attempts.find((attempt) => attempt.workItemId === pickedAttempt) ??
      review?.attempt ??
      task.attempts[0] ??
      null
  );
  const showingTranscript = $derived(
    !compact && chosen?.what === "transcript" && transcriptAttempt !== null
  );
  $effect(() => {
    const id = showingTranscript ? transcriptAttempt?.instanceId : undefined;
    if (!id) {
      return;
    }
    watchDelegate(id);
    // biome-ignore lint/complexity/noVoid: the backfill lands in the store the well reads
    void readTranscript(id);
    return () => unwatchDelegate(id);
  });
  const agentOf = (instanceId: string) =>
    cawco.instanceIndex.byId.get(instanceId)?.harness ?? "agent";

  // --- band 4: the decision ------------------------------------------------------

  const approveTo = $derived(approveTarget(stages, task.stage));
  const backTo = $derived(sendBackTarget(stages, task.stage));
  let approving = $state(false);
  let sending = $state(false);
  let problem = $state<string | null>(null);
  /** Send back's note while it is open; null when closed. */
  let note = $state<string | null>(null);
  let noteField = $state<HTMLTextAreaElement | null>(null);

  async function approve() {
    if (!approveTo) {
      return;
    }
    approving = true;
    problem = null;
    try {
      await onmove(approveTo.name);
    } catch (error) {
      problem = message(error);
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
    problem = null;
    try {
      onchanged(await commentTask(projectId, task.id, text));
      await onmove(backTo.name);
      note = null;
    } catch (error) {
      problem = message(error);
    } finally {
      sending = false;
    }
  }

  const host = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
</script>

{#snippet face(
  chip: Chip
)}
  {@const Icon = iconOf(chip)}
  <Icon class="chip-glyph" />
  <span class="chip-label">{chip.label}</span>
{/snippet}

{#snippet apart(
  chip: Chip,
  index: number
)}
  {#if chip.what === "transcript" && index > 0}
    <!-- The transcript stands apart from what was handed in. -->
    <span aria-hidden="true" class="apart"></span>
  {/if}
{/snippet}

<section aria-label="Review {task.id}" class="review" class:compact={compact}>
  <!-- Band 1: the result -->
  <div class="band result" data-band="result">
    <div class="result-head">
      {#if deciding}
        <IconNeedsYou class="glyph attn" />
      {:else}
        <IconResult class="glyph" />
      {/if}
      <span class="result-label">
        Result
        <span class="muted">· {artifactCount}</span>
      </span>
      {#if review?.attempt}
        <span class="from">{attemptLine(review.attempt)}</span>
      {/if}
    </div>
    {#if result?.summary && !wordsOnly}
      <div class="words" bind:this={wordsBox} class:open={more}>
        <p class="summary">{result.summary}</p>
        <!-- The last line: what to check, and More at its end. -->
        <div class="tail">
          {#if result.check.length > 0}
            <p class="check">
              <span class="check-label">Check:</span>
              {result.check.join(" · ")}
            </p>
          {/if}
          {#if clipped || more}
            <button
              aria-expanded={more}
              class="more press-tint focus-inset"
              onclick={() => {
                more = !more;
              }}
              type="button"
            >
              {more ? "Less" : "More"}
            </button>
          {/if}
        </div>
      </div>
    {:else if !result}
      <p class="none">
        No attempt has handed in a result. Its transcript says what it did.
      </p>
    {/if}
  </div>

  <!-- Band 2: every artifact, named, then the transcript -->
  {#if chips.length > 0 && compact}
    <!-- A thread's card: each chip opens the task beside the conversation. -->
    <div class="band chips" data-band="chips">
      {#each chips as chip, index (chip.key)}
        {@render apart(chip, index)}
        <button
          aria-label="Open {task.id}: {chip.label}"
          class="chip focus-inset"
          data-chip={chip.key}
          onclick={() => choose(chip)}
          title={titleOf(chip)}
          type="button"
        >
          {@render face(chip)}
        </button>
      {/each}
    </div>
  {:else if chips.length > 0}
    <div
      aria-label="What it handed in"
      class="band chips"
      data-band="chips"
      role="tablist"
    >
      {#each chips as chip, index (chip.key)}
        {@render apart(chip, index)}
        <button
          aria-controls="stage-{task.id}"
          aria-selected={chosen?.key === chip.key}
          class="chip focus-inset"
          data-chip={chip.key}
          onclick={() => choose(chip)}
          onkeydown={(event) => onChipKey(event, index)}
          role="tab"
          tabindex={chosen?.key === chip.key ? 0 : -1}
          title={titleOf(chip)}
          type="button"
          class:chosen={chosen?.key === chip.key}
        >
          {@render face(chip)}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Band 3: the stage, the only part that scrolls -->
  {#if !compact && chosen}
    <div
      aria-label={chosen.label}
      class="band stage"
      data-band="stage"
      id="stage-{task.id}"
      role="tabpanel"
      tabindex="-1"
    >
      {#if chosen.what === "words" && result}
        <div class="stage-words">
          <MessageBody source={result.summary} />
          {#if result.check.length > 0}
            <h4 class="check-head">Check</h4>
            <ul class="check-list">
              {#each result.check as line, index (index)}
                <li>{line}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else if chosen.what === "transcript" && transcriptAttempt}
        <div class="transcript">
          <div class="transcript-head">
            {#if task.attempts.length > 1}
              <Select.Root
                onValueChange={(value) => {
                  pickedAttempt = value;
                }}
                type="single"
                value={transcriptAttempt.workItemId}
              >
                <Select.Trigger aria-label="Attempt" press="tint" size="sm">
                  {attemptLine(transcriptAttempt)}
                </Select.Trigger>
                <Select.Content>
                  {#each task.attempts as attempt (attempt.workItemId)}
                    <Select.Item
                      label={attemptLine(attempt)}
                      value={attempt.workItemId}
                    >
                      {attemptLine(attempt)}
                    </Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            {:else}
              <span class="transcript-attempt"
                >{attemptLine(transcriptAttempt)}</span
              >
            {/if}
            <a
              class="open press-tint focus-inset"
              href={rowHref(transcriptAttempt.instanceId)}
            >
              Open session
              <IconArrowUpRight class="open-glyph" />
            </a>
          </div>
          <InlineTranscript
            agentName={agentOf(transcriptAttempt.instanceId)}
            id={transcriptAttempt.instanceId}
            open
          />
        </div>
      {:else if chosen.artifact}
        {@const artifact = chosen.artifact}
        {#if artifact.kind === "link"}
          <a
            class="card press-tint focus-inset"
            href={artifact.url}
            rel="noopener"
            target="_blank"
          >
            <IconLink class="card-glyph" />
            <span class="card-words">
              <span class="card-name">{chosen.label}</span>
              <span class="card-where">{host(artifact.url)}</span>
            </span>
            <span class="card-open"
              >Open <IconArrowUpRight class="open-glyph" /></span
            >
          </a>
        {:else if artifact.kind === "artifact"}
          <a
            class="card press-tint focus-inset"
            href="/artifact/{encodeURIComponent(artifact.artifactId)}"
          >
            <IconArtifactPage class="card-glyph" />
            <span class="card-words">
              <span class="card-name">{chosen.label}</span>
              <span class="card-where">A page artifact</span>
            </span>
            <span class="card-open"
              >Open <IconArrowUpRight class="open-glyph" /></span
            >
          </a>
        {:else}
          <TaskOutput path={artifact.path} {projectId} {version} />
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Band 4: the decision, pinned -->
  {#if deciding && (approveTo || backTo)}
    <div class="band decide" data-band="decide">
      <RowFault reason={problem} />
      {#if note === null}
        <div class="acts">
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
            >Note for the agent: it goes on the task as your comment, and the
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
            placeholder="What should change…"
            rows={2}
            bind:ref={noteField}
            bind:value={note}
          />
          <div class="acts">
            <Button
              disabled={!note.trim()}
              label="Send back with note"
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
    </div>
  {/if}
</section>

<style>
  /* Four bands in one fixed frame: only the stage scrolls. */
  .review {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    border-block-start: 1px solid var(--border-hairline);
  }
  .review.compact {
    flex: none;
    border: 1px solid
      color-mix(in oklab, var(--status-attn-glyph) 40%, transparent);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    overflow: hidden;
  }
  /* The bands share the pane's inline padding (TaskPane `--pane-inline`). */
  .band {
    flex: none;
    padding-inline: var(--pane-inline);
  }
  .compact .band {
    padding-inline: var(--space-4);
  }

  /* Band 1 */
  .result {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-block: var(--space-3) var(--space-2);
  }
  .result-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .result-head :global(.glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .result-head :global(.glyph.attn) {
    color: var(--status-attn-glyph);
  }
  .result-label {
    font: var(--type-label);
    color: var(--ink-strong);
    white-space: nowrap;
  }
  .muted {
    color: var(--ink-muted);
  }
  .from {
    margin-inline-start: auto;
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Three lines at most until More: two of the summary, then one of what to
     check, so the check is never the line clipped away. */
  .words {
    display: flex;
    flex-direction: column;
  }
  .summary,
  .check {
    margin: 0;
    overflow: hidden;
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
    display: -webkit-box;
    -webkit-box-orient: vertical;
  }
  .summary {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .check {
    flex: 1 1 auto;
    min-inline-size: 0;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    color: var(--ink-muted);
  }
  .words.open .summary,
  .words.open .check {
    display: block;
  }
  .tail {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .check-label {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  /* More stands at the end of the last line. */
  .more {
    flex: none;
    margin-inline-start: auto;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .none {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-muted);
  }

  /* Band 2: chips wrap, never scroll. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-block: var(--space-2) var(--space-3);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2) var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    font: var(--type-label);
    color: var(--ink-muted);
    transition:
      border-color var(--dur-control) var(--ease-out),
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
  /* The transcript stands apart from the artifacts, past a hairline. */
  .apart {
    align-self: center;
    inline-size: 1px;
    block-size: var(--c-btn-h-xs);
    margin-inline: var(--space-1);
    background: var(--border-control);
  }
  .chip :global(.chip-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .chip-label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Chosen: the coral edge on a recessed fill, as a picked option is. */
  .chip.chosen {
    border-color: var(--brand-solid);
    background: var(--surface-recess);
    color: var(--ink-strong);
  }
  @media (hover: hover) and (pointer: fine) {
    .chip:not(.chosen):hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  @media (pointer: coarse) {
    .chip {
      block-size: 44px;
    }
  }

  /* Band 3: the stage */
  .stage {
    flex: 1 1 auto;
    min-block-size: 0;
    padding-block: var(--space-3);
    border-block: 1px solid var(--border-hairline);
    overflow-y: auto;
    overscroll-behavior: contain;
    outline: none;
  }
  .stage-words {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .check-head {
    margin: var(--space-2) 0 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .check-list {
    margin: 0;
    padding-inline-start: var(--space-5);
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .transcript {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .transcript-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .transcript-attempt {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .open {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: auto;
    block-size: var(--c-btn-h-xs);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .open :global(.open-glyph),
  .card :global(.open-glyph) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .card :global(.card-glyph) {
    flex: none;
    inline-size: var(--icon-lg);
    block-size: var(--icon-lg);
    color: var(--ink-muted);
  }
  .card-words {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-inline-size: 0;
  }
  .card-name {
    font: var(--type-label);
  }
  .card-where {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .card-open {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-label);
  }

  /* Band 4: the decision, pinned at the foot */
  .decide {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-3);
    padding-block-end: max(var(--space-3), env(safe-area-inset-bottom));
  }
  .compact .decide {
    border-block-start: 1px solid var(--border-hairline);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
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
  @media (hover: hover) and (pointer: fine) {
    .more:hover,
    .open:hover {
      background: var(--surface-hover);
    }
  }
</style>
