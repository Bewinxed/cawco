<script lang="ts">
  /**
   * A line, opened (Option 1, structure decision 6): what hangs from the
   * line he pointed at, five short groups in the order of the TOM's
   * ranking, fitting without a scroll. The line's sentence and answer with
   * Close (the sheet draws its own head under the phone line, so there the
   * answer stands alone); the ask block, only while something about this
   * line waits on him; Why, the sentence the newest answer came with,
   * attributed to what gave it, or why nothing answered lately; What checks
   * it, or Caw's suggested routine where nothing does; Work on this, up to
   * two rows of the work that names the line and is running, waiting or
   * failed.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconClose, IconMaximize, IconSparkles } from "#lib/icons.js";
  import AskBlock, { type AnswerState } from "./AskBlock.svelte";
  import LineAnswer from "./LineAnswer.svelte";
  import type { Ask, Line } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    line,
    ask = null,
    answer = { kind: "idle" },
    choice = null,
    sheet = false,
    live = true,
    onclose,
    onchoose,
    onsend,
    onopen,
  }: {
    line: Line;
    /** What about this line waits on him, if anything, until it is answered. */
    ask?: Ask | null;
    answer?: AnswerState;
    choice?: string | null;
    /** In the phone's sheet, whose head says the sentence and holds Close. */
    sheet?: boolean;
    live?: boolean;
    onclose: () => void;
    onchoose: (choice: string | null) => void;
    onsend: () => void;
    /** A way further in: the run, the routine, a task, the outcome's plan. */
    onopen: (what: string) => void;
  } = $props();

  const work = $derived(line.work.slice(0, 2));
</script>

<div
  data-slot="line-card"
  data-line={line.id}
  class="flex flex-col gap-space-5"
>
  {#if sheet}
    <LineAnswer answer={line.answer} found={line.found} />
  {:else}
    <header class="flex items-start gap-space-3">
      <div class="flex min-w-0 flex-1 flex-col gap-space-1">
        <h2 class="m-0 type-row font-medium text-pretty text-ink-strong">
          {line.sentence}
        </h2>
        <LineAnswer answer={line.answer} found={line.found} />
      </div>
      <Button
        aria-label={outcomesWords.close}
        icon={IconClose}
        onclick={onclose}
        size="icon-xs"
        title={outcomesWords.close}
        tone="quiet"
        variant="ghost"
      />
    </header>
  {/if}

  {#if ask}
    <section aria-label={ask.from} class="flex flex-col gap-space-2">
      <AskBlock
        about={line.sentence}
        {ask}
        {choice}
        {live}
        {onchoose}
        onreadrun={() => onopen("run")}
        {onsend}
        state={answer}
      />
    </section>
  {/if}

  <section aria-labelledby="why-{line.id}" class="flex flex-col gap-space-2">
    <h3 id="why-{line.id}" class="m-0 type-meta text-ink-muted">
      {outcomesWords.whyHead}
    </h3>
    {#if line.why.kind === "said"}
      <p class="m-0 type-body text-pretty text-ink-strong">
        <span class="text-ink-muted">{outcomesWords.saidBy(line.why.by)}</span>
        {line.why.said}
      </p>
      <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1">
        <span class="type-meta text-ink-muted">{line.why.at}</span>
        <Button
          label={outcomesWords.readRun}
          onclick={() => onopen("run")}
          pad="none"
          size="xs"
          variant="link"
        />
      </div>
    {:else}
      <p class="m-0 type-body text-pretty text-ink-strong">{line.why.reason}</p>
    {/if}
  </section>

  <section aria-labelledby="checks-{line.id}" class="flex flex-col gap-space-2">
    <h3 id="checks-{line.id}" class="m-0 type-meta text-ink-muted">
      {outcomesWords.checks}
    </h3>
    {#if line.checker}
      {@const checker = line.checker}
      <div class="flex items-start gap-space-2">
        <div class="flex min-w-0 flex-1 flex-col gap-space-1">
          <p class="m-0 flex flex-wrap items-center gap-x-space-2 type-label">
            <span class="font-medium text-ink-strong">{checker.name}</span>
            {#if checker.running}
              <span
                class="mark-line inline-flex items-center gap-space-1 text-status-live-ink"
                ><LiveDot /><span>A run is going</span></span
              >
            {:else if checker.state}
              <span class="text-ink-muted">{checker.state}</span>
            {/if}
          </p>
          <p class="m-0 type-body text-pretty text-ink-muted">{checker.does}</p>
          <p class="m-0 type-body text-pretty text-ink-strong">
            {checker.when}
          </p>
        </div>
        <Button
          aria-label={outcomesWords.openRoutine(checker.name)}
          icon={IconMaximize}
          onclick={() => onopen("routine")}
          size="icon-xs"
          title={outcomesWords.openRoutine(checker.name)}
          tone="quiet"
          variant="ghost"
        />
      </div>
      <div class="flex flex-wrap items-center gap-space-3">
        <Button
          disabled={!live || checker.cannotStart !== undefined}
          label={outcomesWords.startRun}
          onclick={() => onopen("start")}
          size="sm"
          variant="outline"
        />
        {#if checker.cannotStart}
          <span class="type-meta text-ink-muted">{checker.cannotStart}</span>
        {:else if !live}
          <span class="type-meta text-ink-muted"
            >{outcomesWords.notLiveReason}</span
          >
        {/if}
      </div>
    {:else}
      <p class="m-0 type-body text-ink-strong">{outcomesWords.nothingChecks}</p>
      {#if line.suggested}
        <div class="flex flex-col items-start gap-space-2">
          <Badge variant="raised"
            ><IconSparkles aria-hidden="true" /><span
              >{outcomesWords.cawSuggests}</span
            ></Badge
          >
          <p class="m-0 type-body text-pretty text-ink-strong">
            {line.suggested.when}, {line.suggested.does
              .charAt(0)
              .toLowerCase()}{line.suggested.does.slice(1)}
          </p>
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              disabled={!live}
              label={outcomesWords.turnOn}
              onclick={() => onopen("turn-on")}
              size="sm"
              variant="outline"
            />
            <Button
              label={outcomesWords.dontSuggest}
              onclick={() => onopen("dismiss")}
              size="sm"
              variant="ghost"
            />
          </div>
        </div>
      {/if}
    {/if}
  </section>

  {#if work.length > 0}
    <section aria-labelledby="work-{line.id}" class="flex flex-col gap-space-2">
      <h3 id="work-{line.id}" class="m-0 type-meta text-ink-muted">
        {outcomesWords.work}
      </h3>
      <ul class="m-0 flex list-none flex-col p-0">
        {#each work as one (one.ref)}
          <li class="flex items-start gap-space-2 py-space-1">
            <span
              class="num flex-none type-meta font-mono leading-(--text-body--line-height) text-ink-subtle"
              >{one.ref}</span
            >
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate type-body text-ink-strong">{one.name}</span>
              <span
                class="mark-line inline-flex items-center gap-space-1 type-meta text-ink-muted"
              >
                {#if one.live}<LiveDot />{/if}<span>{one.state}</span>
              </span>
            </span>
            <Button
              aria-label={outcomesWords.open(`${one.ref} ${one.name}`)}
              icon={IconMaximize}
              onclick={() => onopen(one.ref)}
              size="icon-xs"
              title={outcomesWords.open(`${one.ref} ${one.name}`)}
              tone="quiet"
              variant="ghost"
            />
          </li>
        {/each}
      </ul>
      <Button
        class="self-start"
        label={outcomesWords.allPlanned}
        onclick={() => onopen("plan")}
        pad="none"
        size="xs"
        variant="link"
      />
    </section>
  {/if}
</div>
