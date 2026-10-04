<script lang="ts">
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import {
    IconChevronRight,
    IconError,
    IconInfo,
    IconStop,
    IconTerminal,
  } from "#lib/icons.js";
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
    disclosed,
  }: {
    message?: Message;
    harness?: HarnessNote;
    /** Whether the reader has this line open, kept per session by its row. */
    disclosed: { get: () => boolean; set: (open: boolean) => void };
  } = $props();

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
   * What the folded line SAYS. A note that carries a real title (a failed
   * hook, a local command's name) shows that title — its content is the
   * payload, which is exactly what must never be flattened into the trigger
   * line. Only a note with no title at all falls back to its content.
   */
  const named = $derived(
    !!(message?.metadata?.noteTitle || message?.metadata?.errorTitle)
  );
  const foldTitle = $derived(named ? title : message?.content || title);
  /**
   * What opens under it. A command echo keeps its mono well; a titled note's
   * content (a hook's output, the reminder text) reads as prose through
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

  const open = $derived(disclosed.get());
</script>

<!-- Every line here is a rail row (app.css `.rail-row`): its mark in the
     glyph cell, its words at the text column, a disclosure chevron after the
     words, and whatever opens under it hung at the text column. -->
{#if harness}
  <!-- Harness plumbing, folded onto the rail: the summary and how it went on
       one quiet line, the report itself behind it. -->
  <div class="note rail-row">
    {#if harness.body}
      <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
        <Collapsible.Trigger class="ftrig hn rail-line">
          <span class="rail-cell"><IconInfo /></span>
          <span class="ftitle">{harness.title}</span>
          {#if harness.status}
            <span class="hstatus" class:bad={harness.status === "failed"}
              >{harness.status}</span
            >
          {/if}
          <span class="hchev" class:open={open}><IconChevronRight /></span>
        </Collapsible.Trigger>
        <Collapsible.Content reveal>
          <div class="hbody rail-hang">
            <MessageBody source={harness.body} />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    {:else}
      <!-- Nothing to open, so nothing that looks openable: a chevron over an
           empty body is the dead disclosure the tool rows already refuse. -->
      <span class="hline rail-line">
        <span class="rail-cell"><IconInfo /></span>
        <span class="ftitle">{harness.title}</span>
        {#if harness.status}
          <span class="hstatus" class:bad={harness.status === "failed"}
            >{harness.status}</span
          >
        {/if}
      </span>
    {/if}
  </div>
{:else if type === "system.task"}
  <!-- A plain task's completion: the verb AND the task it reports. A bare
       "task done" with no reference to which task is a line that says nothing. -->
  <div class="note rail-row">
    <span class="hline rail-line">
      <span class="rail-cell"><IconInfo /></span>
      <span class="tverb" class:bad={message?.content === "task failed"}
        >{message?.content}</span
      >
      {#if message?.metadata?.result}
        <span class="tsum">{message.metadata.result}</span>
      {/if}
    </span>
  </div>
{:else if isOutput}
  <!-- A command's output: the command it answers on the line, the output in
       its recessed well under it. -->
  <div class="note rail-row">
    <span class="hline rail-line">
      <span class="rail-cell"><IconTerminal /></span>
      <span class="ftitle">{foldCommand ?? "Output"}</span>
    </span>
    <pre class="well">{message?.content}</pre>
  </div>
{:else if isInterrupted}
  <!-- One quiet word for a deliberate act. The colour budget is for things
       that happened TO the operator, not things they did. -->
  <div class="note rail-row">
    <span class="hline rail-line">
      <span class="rail-cell"><IconStop /></span>
      <span class="ftitle">Interrupted</span>
    </span>
  </div>
{:else if isFail}
  <!-- A failure takes the rail like every other line, in the fail colours:
       what failed on the line, why under it. -->
  <div class="note fail rail-row">
    <span class="hline rail-line">
      <span class="rail-cell"><IconError /></span>
      <b class="ftitle">{failTitle}</b>
    </span>
    <p class="handoff rail-hang">{message?.content}</p>
  </div>
{:else if foldCommand || foldBody}
  <div class="note rail-row">
    <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
      <Collapsible.Trigger class="ftrig rail-line">
        <span class="rail-cell"><IconInfo /></span>
        <span class="ftitle">{foldTitle}</span>
        <span class="hchev" class:open={open}><IconChevronRight /></span>
      </Collapsible.Trigger>
      <Collapsible.Content reveal>
        {#if foldCommand}
          <pre class="well">{foldCommand}</pre>
        {:else if foldBody}
          <div class="hbody rail-hang"><MessageBody source={foldBody} /></div>
        {/if}
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
{:else}
  <!-- Nothing to open, so nothing that looks openable — the same dead-disclosure
       refusal the harness line and the tool rows already make. -->
  <div class="note rail-row">
    <span class="hline rail-line">
      <span class="rail-cell"><IconInfo /></span>
      <span class="ftitle">{foldTitle}</span>
    </span>
  </div>
{/if}

<style>
  /* A recessed well under the line: its text at the text column, the well
     reaching out past it by its own padding. */
  .well {
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    margin-block-start: var(--space-2);
    margin-inline-start: calc(var(--x-hang) - var(--space-3));
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    white-space: pre-wrap;
  }
  .note {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
      flex: 0 0 auto;
    }
    & :global(.ftrig) {
      display: inline-flex;
      background: none;
      border: 0;
      padding: 0;
      color: var(--ink-muted);
      font-size: var(--text-label);
      font-weight: var(--weight-strong);
      cursor: pointer;
      text-align: start;
    }
    /* ── The harness fold ────────────────────────────────────────────────
       A notification the operator never wrote, on the same rail as every
       other note: the summary, how it went, and the report one click behind
       them. */
    & :global(.ftrig.hn) {
      max-inline-size: 100%;
    }
  }
  .ftitle {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The non-expandable twin: same line, no button, because there is nothing
     under it to open. */
  .hline {
    display: inline-flex;
    max-inline-size: 100%;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .hstatus {
    flex: 0 0 auto;
    color: var(--ink-muted);

    /* The one word on this line that is allowed to carry colour. */
    &.bad {
      color: var(--data-bad);
    }
  }
  /* The task line's verb holds body ink; only failure carries colour. */
  .tverb {
    flex: 0 0 auto;
    color: var(--ink-strong);

    &.bad {
      color: var(--data-bad);
    }
  }
  /* WHICH task, in the same muted register as every note — ellipsized, never
     wrapped, so the line stays a line. */
  .tsum {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-muted);
  }
  .hchev {
    display: inline-flex;
    flex: 0 0 auto;

    &.open {
      transform: rotate(90deg);
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  /* The report hangs at the text column under the line that opens it, and
     keeps MessageBody's own 74ch measure — a subagent's write-up is prose,
     not a dump. */
  .hbody {
    margin-block-start: var(--space-3);
  }
  /* A failure: the rail, the mark, the title and the reason, all in the
     fail ink — last, so it wins over the note's muted ink on the same
     elements. */
  .note.fail {
    --rail-head: linear-gradient(
      var(--status-fail-ink),
      var(--status-fail-ink)
    );
    color: var(--status-fail-ink);

    & .hline {
      color: inherit;
    }
    & .handoff {
      margin-block: var(--space-1) 0;
      font-size: var(--text-label);
      font-weight: var(--weight-strong);
      line-height: var(--leading-body);
      white-space: pre-wrap;
    }
  }
</style>
