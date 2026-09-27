<script lang="ts">
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { IconChevronRight, IconInfo, IconStop } from "$lib/icons";
  import Reveal from "$lib/whiffle/motion/Reveal.svelte";
  import Stream from "$lib/whiffle/motion/Stream.svelte";
  /**
   * The quiet ledger's non-turn lines: a command's output in a recessed well, a
   * system note folded on the rail, and a failure or refusal as a named card
   * with its handoff. Everything the transcript carries that is neither a turn
   * nor a tool call lands here.
   */
  import type { Message } from "../types";
  import MessageBody from "./MessageBody.svelte";
  import type { HarnessNote } from "./rows";

  let {
    message,
    /**
     * A parsed harness notification, rendered instead of a message. Same rail,
     * same fold — but its body is a subagent's markdown report, so it opens
     * through MessageBody rather than a `pre`.
     */
    harness,
  }: { message?: Message; harness?: HarnessNote } = $props();

  const type = $derived(message?.type);
  const isOutput = $derived(type === "ui.command_output");
  const isFail = $derived(
    type === "ui.error" ||
      type === "ui.session_error" ||
      type === "result.error"
  );
  /** The operator's own stop, acknowledged — never a failure card. */
  const isInterrupted = $derived(type === "ui.interrupted");
  const title = $derived(
    message?.metadata?.errorTitle ?? message?.metadata?.noteTitle ?? "Note"
  );
  /** A failure card's heading is never the meaningless "Note". */
  const failTitle = $derived(message?.metadata?.errorTitle ?? "Turn failed");
  /**
   * What the folded line SAYS. A note that carries a real title (a compaction
   * summary, a local command's name) shows that title — its content is the
   * payload, which is exactly what must never be flattened into the trigger
   * line. Only a note with no title at all falls back to its content.
   */
  const named = $derived(
    !!(message?.metadata?.noteTitle || message?.metadata?.errorTitle)
  );
  const foldTitle = $derived(named ? title : message?.content || title);
  /**
   * What opens under it. A command echo keeps its mono well; a titled note's
   * content (the compacted summary, the reminder text) reads as prose through
   * MessageBody. A note whose content IS its shown line has nothing to open.
   */
  const foldCommand = $derived(message?.metadata?.command);
  const foldBody = $derived(
    !foldCommand &&
      named &&
      message?.content &&
      message.content.trim() !== foldTitle
      ? message.content
      : undefined
  );

  let open = $state(false);
</script>

{#if harness}
  <!-- Harness plumbing, folded onto the rail: the summary and how it went on
       one quiet line, the report itself behind it. -->
  <div class="note fold">
    {#if harness.body}
      <Collapsible.Root bind:open>
        <Collapsible.Trigger class="ftrig hn">
          <Reveal><IconInfo /></Reveal>
          <span class="ftitle"><Stream text={harness.title} /></span>
          {#if harness.status}
            <span class="hstatus" class:bad={harness.status === 'failed'}
              >{harness.status}</span
            >
          {/if}
          <span class="hchev" class:open><IconChevronRight /></span>
        </Collapsible.Trigger>
        <Collapsible.Content reveal>
          <div class="hbody"><MessageBody source={harness.body} /></div>
        </Collapsible.Content>
      </Collapsible.Root>
    {:else}
      <!-- Nothing to open, so nothing that looks openable: a chevron over an
           empty body is the dead disclosure the tool rows already refuse. -->
      <span class="hline">
        <Reveal><IconInfo /></Reveal>
        <span class="ftitle"><Stream text={harness.title} /></span>
        {#if harness.status}
          <span class="hstatus" class:bad={harness.status === 'failed'}
            >{harness.status}</span
          >
        {/if}
      </span>
    {/if}
  </div>
{:else if type === 'system.task'}
  <!-- A plain task's completion: the verb AND the task it reports. A bare
       "task done" with no reference to which task is a line that says nothing. -->
  <div class="note fold">
    <span class="hline">
      <Reveal><IconInfo /></Reveal>
      <span class="tverb" class:bad={message?.content === 'task failed'}
        >{message?.content}</span
      >
      {#if message?.metadata?.result}
        <span class="tsum">{message.metadata.result}</span>
      {/if}
    </span>
  </div>
{:else if isOutput}
  <pre class="well">{message?.content}</pre>
{:else if isInterrupted}
  <!-- One quiet word for a deliberate act. The colour budget is for things
       that happened TO the operator, not things they did. -->
  <div class="note fold">
    <span class="hline">
      <Reveal><IconStop /></Reveal>
      <span class="ftitle"><Stream text="Interrupted" /></span>
    </span>
  </div>
{:else if isFail}
  <div class="failcard">
    <b>{failTitle}</b>
    <span class="handoff">{message?.content}</span>
  </div>
{:else if foldCommand || foldBody}
  <div class="note fold">
    <Collapsible.Root bind:open>
      <Collapsible.Trigger class="ftrig">
        <span class="hchev" class:open><IconChevronRight /></span>
        <span class="ftitle">{foldTitle}</span>
      </Collapsible.Trigger>
      <Collapsible.Content reveal>
        {#if foldCommand}
          <pre class="well">{foldCommand}</pre>
        {:else if foldBody}
          <div class="hbody"><MessageBody source={foldBody} /></div>
        {/if}
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
{:else}
  <!-- Nothing to open, so nothing that looks openable — the same dead-disclosure
       refusal the harness line and the tool rows already make. -->
  <div class="note fold">
    <span class="hline">
      <Reveal><IconInfo /></Reveal>
      <span class="ftitle"><Stream text={foldTitle} /></span>
    </span>
  </div>
{/if}

<style>
  .well {
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    margin: var(--rail-gap, var(--space-4)) 0 0 var(--space-2);
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    white-space: pre-wrap;
  }
  .failcard {
    border-left: 3px solid var(--status-fail-ink);
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    margin: var(--space-4) 0 0;
  }
  .failcard b {
    display: block;
    font-weight: var(--weight-strong);
    margin-bottom: 2px;
  }
  .failcard .handoff {
    font-size: var(--text-label);
    opacity: 0.92;
    white-space: pre-wrap;
  }
  .note {
    margin: var(--rail-gap, var(--space-4)) 0 0 var(--space-2);
    padding-left: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;
    font-size: var(--text-label);
    color: var(--ink-muted);
  }
  .note :global(svg) {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
  }
  :global(.note .ftrig) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink-muted);
    font-size: var(--text-label);
    cursor: pointer;
    text-align: left;
  }
  .ftitle {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── The harness fold ──────────────────────────────────────────────────
     A notification the operator never wrote, on the same rail as every other
     note: the summary, how it went, and the report one click behind them. */
  :global(.note .ftrig.hn) {
    max-width: 100%;
  }
  /* The non-expandable twin: same line, no button, because there is nothing
     under it to open. */
  .hline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    font-size: var(--text-label);
    color: var(--ink-muted);
  }
  .hstatus {
    flex: 0 0 auto;
    color: var(--ink-muted);
  }
  /* The task line's verb holds body ink; only failure carries colour. */
  .tverb {
    flex: 0 0 auto;
    color: var(--ink-strong);
  }
  .tverb.bad {
    color: var(--data-bad);
  }
  /* WHICH task, in the same muted register as every note — ellipsized, never
     wrapped, so the line stays a line. */
  .tsum {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-muted);
  }
  /* The one word on this line that is allowed to carry colour. */
  .hstatus.bad {
    color: var(--data-bad);
  }
  .hchev {
    display: inline-flex;
    flex: 0 0 auto;
    transition: transform var(--dur-control) var(--ease-out);
  }
  .hchev.open {
    transform: rotate(90deg);
  }
  /* The report sits on the rail the fold already draws, and keeps MessageBody's
     own 74ch measure — a subagent's write-up is prose, not a dump, so it reads
     at the same width as every turn above it rather than running the full pane. */
  .hbody {
    margin-top: var(--space-3);
  }
  @media (prefers-reduced-motion: reduce) {
    .hchev {
      transition: none;
    }
  }

  /* The ledger's rail column is narrower on a phone, and every other rail
     block already knows it — ToolGroup, Thinking, Subagent, Delegate all drop
     this inset at the same breakpoint. These two did not, so on a narrow
     screen a note sat 7px to the right of the line above it and the run read
     as a broken column. */
  @media (max-width: 900px) {
    .note,
    .well {
      margin-left: 0;
    }
  }
</style>
