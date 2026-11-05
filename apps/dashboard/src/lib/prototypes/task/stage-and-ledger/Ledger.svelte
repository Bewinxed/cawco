<script lang="ts">
  /**
   * The ledger strip: everything the stage is not, in one order. The two
   * moves lead it (on a phone they stand on the drawer's handle instead, the
   * note staying here), then Now, the session's ask, who did it, its waits
   * and what it unblocks, its attempts, the field to say something, its
   * history folded, and File as the strip's second page. A section with
   * nothing to say for this task is not drawn.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { appear, crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Alert } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconArrowUpRight,
    IconChevronDown,
    IconChevronRight,
    IconDocument,
    IconTranscript,
  } from "#lib/icons.js";
  import AskInPage from "./AskInPage.svelte";
  import { attemptMark, nowOf, sayLineOf, sessionMark } from "./derive";
  import { ago, clock, day, took } from "./format";
  import { LIVENESS, WAIT_GLYPH } from "./marks";
  import type { Liveness, MoveState, SessionAsk, TaskRead } from "./records";
  import StatusMark from "./StatusMark.svelte";

  let {
    task,
    liveness,
    now,
    movesOn = "strip",
    move = "idle",
    refusal = null,
    ask = null,
    stale = null,
    note = $bindable(""),
    asking = $bindable(false),
    historyOpen = $bindable(false),
    onpasson,
    onsendback,
    onanswer,
    onopenwait,
    onsession,
    onfile,
    onretry,
  }: {
    task: TaskRead;
    /** Its liveness now, the move in flight and the session's ask taken in. */
    liveness: Liveness;
    now: number;
    /** Where the two moves stand: at the strip's top, or on the phone drawer's handle. */
    movesOn?: "strip" | "handle";
    move?: MoveState;
    /** The hub's refusal of the last move, in its words. */
    refusal?: string | null;
    ask?: SessionAsk | null;
    /** When the hub last answered, while it is not live; null while it is. */
    stale?: number | null;
    note?: string;
    /** Send back pressed: its question stands under it. */
    asking?: boolean;
    historyOpen?: boolean;
    onpasson?: () => void;
    onsendback?: () => void;
    onanswer?: (word: "approve" | "deny") => void;
    onopenwait?: (target: string) => void;
    onsession?: () => void;
    onfile?: () => void;
    onretry?: () => void;
  } = $props();

  const uid = $props.id();

  const yours = $derived(task.kind === "you" && move !== "landed");
  const nowSentence = $derived(nowOf(task, move, now));
  const sayLine = $derived(sayLineOf(task));

  const openMoves = $derived(
    [task.passOnTo, task.sendBack?.stage, "dropped"].filter(Boolean).join(", ")
  );
  const lastAttempt = $derived(task.attempts[0] ?? null);
  const blockedMoves = $derived(stale !== null || move === "landing");
</script>

{#snippet sectionHead(text: string, count?: number)}
  <h2 class="flex items-baseline gap-space-2 type-meta text-ink-muted">
    <span>{text}</span>
    {#if count !== undefined && count > 0}
      <span class="num tabular-nums">{count}</span>
    {/if}
  </h2>
{/snippet}

<div class="flex flex-col divide-y divide-border-hairline" data-slot="ledger">
  {#if stale !== null}
    <div class="pb-space-4">
      <Alert>
        <p class="type-body text-pretty">
          {words.stale(clock(stale))}
        </p>
      </Alert>
    </div>
  {/if}

  {#if yours}
    <section
      aria-labelledby="{uid}-moves"
      class="flex flex-col gap-space-3 pb-space-5"
    >
      <h2 class="sr-only" id="{uid}-moves">{words.passOn}</h2>
      <label class="flex flex-col gap-space-2">
        <span class="type-meta text-ink-muted">{words.note}</span>
        <Textarea
          bind:value={note}
          disabled={blockedMoves}
          placeholder={words.notePlaceholder}
          rows={2}
        />
      </label>
      {#if movesOn === "strip"}
        <div class="grid grid-cols-2 gap-space-8" data-slot="moves">
          <Button
            disabled={blockedMoves || move === "passing"}
            label={words.sendBack}
            onclick={() => {
              asking = true;
            }}
            pending={move === "sending"}
            pendingLabel={words.sendingBack}
            size="lg"
            variant="outline"
          />
          <Button
            disabled={blockedMoves || move === "sending"}
            label={words.passOn}
            onclick={onpasson}
            pending={move === "passing"}
            pendingLabel={words.passingOn}
            size="lg"
            variant="outline"
          />
        </div>
      {/if}
      {#if asking && task.sendBack}
        <AskInPage
          consequence={words.sendBackAskWhy}
          oncancel={() => {
            asking = false;
          }}
          onconfirm={onsendback}
          pending={move === "sending"}
          pendingVerb={words.sendingBack}
          title={words.sendBackAsk(task.sendBack.stage)}
          verb={words.sendBack}
        />
      {/if}
      <ul class="flex flex-col gap-space-1">
        {#if task.sendBack}
          <li class="type-meta text-pretty text-ink-muted">
            {words.sendBackTo(task.sendBack.stage, task.sendBack.by)}
          </li>
        {/if}
        {#if task.passOnTo}
          <li class="type-meta text-pretty text-ink-muted">
            {task.filer.hears
              ? words.passOnTo(task.passOnTo, task.filer.name)
              : words.passOnToNobody(task.passOnTo)}
          </li>
        {/if}
      </ul>
      {#if move === "refused" && refusal}
        <div
          class="flex flex-col gap-space-1 rounded-md bg-status-fail-bg px-space-3 py-space-2 text-status-fail-ink"
          role="alert"
          transition:appear
        >
          <p class="type-label">{words.refusedHead}</p>
          <p class="type-body text-pretty">{refusal}</p>
          <p class="type-meta">{words.stillOpen(openMoves)}</p>
        </div>
      {/if}
    </section>
  {/if}

  <section class="flex flex-col gap-space-2 py-space-4">
    {@render sectionHead(words.now)}
    <!-- mark-line: the mark stands on a row of its own, the words under it -->
    <div class="flex flex-col gap-space-1">
      <StatusMark mark={LIVENESS[liveness]} />
      <p class="type-body text-pretty text-ink-strong">
        <MorphText text={nowSentence} wrap />
      </p>
    </div>
  </section>

  {#if ask}
    <!-- mark-line: the mark stands on a row of its own, the words under it -->
    <section class="flex flex-col gap-space-3 py-space-4" transition:unfold>
      {@render sectionHead(words.asks)}
      <p class="type-meta text-ink-muted">
        {words.askFrom(ask.session, ago(ask.at, now))}
      </p>
      <p class="type-label text-ink-strong">{ask.words}</p>
      <pre
        class="overflow-x-auto rounded-sm bg-code-bg px-space-3 py-space-2 font-mono text-size-code whitespace-pre-wrap break-word text-ink-strong">{ask.detail}</pre>
      {#if ask.answered}
        <div data-box in:crossIn>
          <StatusMark
            mark={{
              ...LIVENESS.done,
              word: words.answered(ask.answered.word, clock(ask.answered.at)),
            }}
          />
        </div>
      {:else}
        <div data-box class="grid grid-cols-2 gap-space-8" data-slot="answer">
          <Button
            hit="always"
            label={words.deny}
            onclick={() => onanswer?.("deny")}
            size="lg"
            variant="outline"
          />
          <Button
            hit="always"
            label={words.approve}
            onclick={() => onanswer?.("approve")}
            size="lg"
            variant="outline"
          />
        </div>
      {/if}
    </section>
  {/if}

  {#if task.who}
    <section class="flex flex-col gap-space-2 py-space-4">
      {@render sectionHead(words.who)}
      <div
        class="mark-line grid grid-cols-(--who-cols) items-center gap-x-space-3"
        style:--who-cols={"var(--c-row-lead) minmax(0, 1fr) auto"}
      >
        <span data-box class="flex justify-center">
          <StatusMark mark={sessionMark(task.who.state)} wordShown={false} />
        </span>
        <span
          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
          >{task.who.session}</span
        >
        <Button
          aria-label={words.openSession}
          icon={IconTranscript}
          onclick={onsession}
          size="icon-sm"
          title={words.openSession}
          variant="ghost"
        />
      </div>
      {#if task.who.headline}
        <p class="type-body text-pretty text-ink-strong">{task.who.headline}</p>
      {/if}
    </section>
  {/if}

  {#if task.waits.length > 0 || task.unblocks.length > 0}
    <section class="flex flex-col gap-space-2 py-space-4">
      {@render sectionHead(words.waits, task.waits.length)}
      <ul class="flex flex-col">
        {#each task.waits as wait (wait.target)}
          {@const Glyph = WAIT_GLYPH[wait.kind]}
          <li
            class="grid min-h-c-row-h grid-cols-(--wait-cols) items-center gap-x-space-3"
            style:--wait-cols={"var(--c-row-lead) minmax(0, 1fr) auto auto"}
          >
            <span class="flex justify-center">
              <Glyph
                aria-label={words.waitKinds[wait.kind]}
                class="size-icon-md text-ink-muted"
                role="img"
              />
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="truncate type-label text-ink-row">{wait.label}</span>
              <span class="truncate type-meta text-ink-muted"
                >{wait.via ? words.inherited(wait.via) : words.own}</span
              >
            </span>
            <Badge variant={wait.settled ? "done" : "default"}
              ><span>{wait.state}</span></Badge
            >
            <Button
              aria-label={words.openWait(wait.label)}
              icon={IconArrowUpRight}
              onclick={() => onopenwait?.(wait.target)}
              size="icon-sm"
              title={words.openWait(wait.label)}
              variant="ghost"
            />
          </li>
        {/each}
      </ul>
      {#if task.unblocks.length > 0}
        <p class="type-meta text-ink-muted">
          {words.unblocks}: {words.unblocksCount(task.unblocks.length)}
        </p>
      {/if}
    </section>
  {/if}

  <section class="flex flex-col gap-space-2 py-space-4">
    {@render sectionHead(words.attempts, task.attempts.length)}
    {#if task.attempts.length === 0}
      <p class="type-body text-ink-muted">{words.attemptsNone}</p>
    {:else}
      <ul class="flex flex-col">
        {#each task.attempts as attempt (attempt.id)}
          <li
            class="mark-line grid min-h-c-row-h grid-cols-(--attempt-cols) items-center gap-x-space-3"
            style:--attempt-cols={"var(--c-row-lead) var(--c-ledger-when-w) minmax(0, 1fr) auto"}
          >
            <span data-box class="flex justify-center">
              <StatusMark mark={attemptMark(attempt.state)} wordShown={false} />
            </span>
            <span class="num type-meta text-ink-muted tabular-nums"
              >{day(attempt.startedAt)} {clock(attempt.startedAt)}</span
            >
            <span
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-strong"
            >
              {attempt.endedAt
                ? `${took(attempt.startedAt, attempt.endedAt)} · ${attempt.how ?? words.attemptDone}`
                : words.attemptLive}
            </span>
            {#if attempt === lastAttempt && (attempt.state === "cancelled" || attempt.state === "failed")}
              <Button
                data-box
                label={words.retry}
                onclick={onretry}
                size="sm"
                variant="outline"
              />
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="flex flex-col gap-space-2 py-space-4">
    <label class="flex flex-col gap-space-2">
      <span class="type-meta text-ink-muted">{words.say}</span>
      <Textarea placeholder={words.sayPlaceholder} rows={2} />
    </label>
    <div class="flex items-start justify-between gap-space-3">
      <p class="type-meta text-pretty text-ink-muted">{sayLine}</p>
      <Button label={words.send} size="sm" variant="outline" />
    </div>
  </section>

  <section class="py-space-3">
    <Collapsible.Root bind:open={historyOpen}>
      <Collapsible.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="mark-line flex min-h-c-row-h w-full items-center gap-space-2 rounded-sm text-start text-ink-muted transition-control hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:-outline-offset-2"
            type="button"
          >
            <IconChevronDown
              aria-hidden="true"
              class={[
                "size-icon-md flex-none transition-transform duration-(--dur-control) ease-out",
                !historyOpen && "-rotate-90",
              ]}
            />
            <span class="type-label">{words.history}</span>
            <span class="num type-meta tabular-nums"
              >{words.historyCount(task.history.length)}</span
            >
          </button>
        {/snippet}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ol class="flex flex-col pt-space-2">
          {#each task.history.toReversed() as change (change.commit)}
            <li
              class="grid grid-cols-(--history-cols) gap-x-space-3 py-space-2"
              style:--history-cols={"var(--c-ledger-when-w) minmax(0, 1fr)"}
            >
              <span class="num type-meta text-ink-muted tabular-nums"
                >{day(change.at)} {clock(change.at)}</span
              >
              <span class="flex min-w-0 flex-col gap-px">
                <span class="type-meta text-pretty text-ink-strong"
                  ><span class="font-medium">{change.actor.name}</span>
                  · {change.what}</span
                >
                {#if change.reason}
                  <span class="type-meta text-pretty text-ink-muted"
                    >{change.reason}</span
                  >
                {/if}
              </span>
            </li>
          {/each}
        </ol>
      </Collapsible.Content>
    </Collapsible.Root>
  </section>

  <section class="pt-space-3">
    <button
      class="grid min-h-c-row-h-two w-full grid-cols-(--file-cols) items-center gap-x-space-3 rounded-md px-space-2 text-start transition-control press-tint hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:-outline-offset-2"
      onclick={onfile}
      style:--file-cols={"var(--c-row-lead) minmax(0, 1fr) auto"}
      type="button"
    >
      <span class="flex justify-center">
        <IconDocument aria-hidden="true" class="size-icon-md text-ink-muted" />
      </span>
      <span class="flex min-w-0 flex-col">
        <span class="type-label text-ink-row">{words.file}</span>
        <span class="truncate type-meta text-ink-muted">{words.fileHint}</span>
      </span>
      <IconChevronRight
        aria-hidden="true"
        class="size-icon-md text-ink-muted"
      />
    </button>
  </section>
</div>
