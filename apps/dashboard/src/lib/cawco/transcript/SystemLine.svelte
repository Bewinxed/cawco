<script lang="ts">
  import {
    ARTIFACT_RESPONSES,
    type ArtifactKind,
    MOVED_HERE,
  } from "@cawco/core";
  import type { Component } from "svelte";
  import { showArtifact } from "#lib/cawco/artifact-api.js";
  import { revealPreview } from "#lib/cawco/client.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconChevronRight,
    IconClock,
    IconError,
    IconInfo,
    IconStop,
    IconSuccess,
    IconTerminal,
    IconWindow,
  } from "#lib/icons.js";
  import MessageBody from "../MessageBody.svelte";
  import { CAW_EVENT, useVoice } from "../turn/voice";
  /**
   * The quiet ledger's non-turn lines: a command's output in a recessed well, a
   * system note folded on the rail, and a failure or refusal as a named card
   * with its handoff. Everything the transcript carries that is neither a turn
   * nor a tool call lands here.
   */
  import type { Message } from "../types";
  import DesignOfferActions from "./DesignOfferActions.svelte";
  import RoutineMadeActions from "./RoutineMadeActions.svelte";
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

  /**
   * Something that woke a project's Caw (a routine, an attempt landing, a
   * task waiting on you): its line is code, so it stands in the dashed box,
   * and when it happened is said in the reader's own time.
   */
  const wokeCaw = $derived(message?.metadata?.noteKind === CAW_EVENT);
  /** Your words in a thread that did not wake Caw: a row of its own, not a code line. */
  const unread = $derived(wokeCaw && message?.metadata?.notWoken === true);
  /** A session made a routine: Keep, Turn off and Open under its line. */
  const routineMade = $derived(
    wokeCaw ? message?.metadata?.routineMade : undefined
  );
  /** Caw asking whether to build a design system: Build and Not now under its line. */
  const designOffer = $derived(
    wokeCaw ? message?.metadata?.designOffer : undefined
  );
  /** The pane's word under a not-woken note's title: the reason and Try again. */
  const voice = useVoice();
  const under = $derived(
    unread && message && voice?.event
      ? { snippet: voice.event, id: message.id }
      : null
  );
  /**
   * The line a session moved to its machine opens on (core `MOVED_HERE`):
   * what moved, with the done glyph, and what stayed under it, open. It is
   * where the project came from, kept in history, so nothing is folded.
   */
  const moved = $derived(message?.metadata?.subtype === MOVED_HERE);
  /**
   * The person sent responses on one of the session's artifacts (core
   * `ARTIFACT_RESPONSES`): one quiet line, its name opening the artifact,
   * and whether the agent has read them yet. The sentence the agent reads
   * is never drawn.
   */
  const responses = $derived(
    message?.metadata?.subtype === ARTIFACT_RESPONSES &&
      message.metadata.artifactId
      ? {
          id: message.metadata.artifactId,
          name: message.metadata.artifactName ?? "",
          kind: message.metadata.artifactKind ?? "page",
          said:
            message.metadata.artifactSaid === "comments"
              ? "Comments"
              : "Responses",
        }
      : null
  );
  const RESPONSE_GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    sheet: IconArtifactSheet,
  };
  const ResponseGlyph = $derived(RESPONSE_GLYPHS[responses?.kind ?? "page"]);
  const responsesState = $derived.by(() => {
    if (message?.state === "failed") {
      return "not sent";
    }
    return message?.state === "pending" ? "waiting for the agent" : "read";
  });
  let opening = $state(false);
  let openFailed = $state<string | null>(null);
  /** Brings the artifact to the front of the session's panel, as its tool row's card does. */
  async function openResponses() {
    if (!(message && responses) || opening) {
      return;
    }
    opening = true;
    openFailed = null;
    try {
      await showArtifact(message.instanceId, responses.id);
      revealPreview(message.instanceId);
    } catch (error) {
      openFailed = error instanceof Error ? error.message : String(error);
    } finally {
      opening = false;
    }
  }
  const eventAt = $derived(
    wokeCaw && message?.timestamp ? new Date(message.timestamp) : null
  );
  const eventClock = $derived(
    eventAt
      ? eventAt.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : ""
  );
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
          <span class={["hchev", { open }]} data-box><IconChevronRight /></span>
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
{:else if responses}
  <div
    class="note responses rail-row"
    data-artifact-responses={responses.id}
    class:waiting={message?.state === "pending"}
  >
    <span class="hline rail-line">
      <span class="rail-cell"><ResponseGlyph /></span>
      <span class="ftitle"
        >{responses.said} on
        <button
          aria-busy={opening}
          class="aname"
          onclick={openResponses}
          title="Open {responses.name}"
          type="button"
        >
          {responses.name}
        </button></span
      >
      <span class="hstatus" class:bad={message?.state === "failed"}
        >{responsesState}</span
      >
    </span>
    {#if message?.state === "failed" && message.metadata?.sendFailed}
      <p class="reason rail-hang">{message.metadata.sendFailed}</p>
    {:else if openFailed}
      <p class="reason rail-hang">{openFailed}</p>
    {/if}
  </div>
{:else if moved}
  <div class="note moved rail-row">
    <span class="hline rail-line">
      <span class="rail-cell"><IconSuccess /></span>
      <span class="ftitle">{title}</span>
    </span>
    {#if message?.content}
      <p class="stayed rail-hang">{message.content}</p>
    {/if}
  </div>
{:else if unread}
  <!-- Your words he has not read: one row on the rail, drawn as a failure's
       is but in no fail hue, since nothing failed and the words are kept.
       The clock in the glyph cell, the title on the line with its time, and
       under it, at the text column, why and the way on (the pane's
       `event`: the reason and Try again). -->
  <div class="note unread rail-row" data-unread-note={message?.id}>
    <span class="hline rail-line">
      <span class="rail-cell"><IconClock /></span>
      <span class="ftitle">Caw hasn't read this</span>
      {#if eventAt}
        <time class="eat num" datetime={eventAt.toISOString()}
          >{eventClock}</time
        >
      {/if}
    </span>
    {#if under}
      <div class="why rail-hang">{@render under.snippet(under.id)}</div>
    {/if}
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
  <div class="note rail-row" data-code={wokeCaw || undefined}>
    <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
      <Collapsible.Trigger class="ftrig rail-line">
        <span class="rail-cell"><IconInfo /></span>
        <span class="ftitle">{foldTitle}</span>
        {#if eventAt}
          <time class="eat num" datetime={eventAt.toISOString()}
            >{eventClock}</time
          >
        {/if}
        <span class={["hchev", { open }]} data-box><IconChevronRight /></span>
      </Collapsible.Trigger>
      <Collapsible.Content reveal>
        {#if foldCommand}
          <pre class="well">{foldCommand}</pre>
        {:else if foldBody}
          <div class="hbody rail-hang"><MessageBody source={foldBody} /></div>
        {/if}
      </Collapsible.Content>
    </Collapsible.Root>
    {#if routineMade}
      <RoutineMadeActions routine={routineMade} />
    {/if}
    {#if designOffer}
      <DesignOfferActions offer={designOffer} />
    {/if}
  </div>
{:else}
  <!-- Nothing to open, so nothing that looks openable — the same dead-disclosure
       refusal the harness line and the tool rows already make. -->
  <div class="note rail-row" data-code={wokeCaw || undefined}>
    <span class="hline rail-line">
      <span class="rail-cell"><IconInfo /></span>
      <span class="ftitle">{foldTitle}</span>
      {#if eventAt}
        <time class="eat num" datetime={eventAt.toISOString()}
          >{eventClock}</time
        >
      {/if}
    </span>
    {#if routineMade}
      <RoutineMadeActions routine={routineMade} />
    {/if}
    {#if designOffer}
      <DesignOfferActions offer={designOffer} />
    {/if}
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
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
  }
  .eat {
    flex: none;
    margin-inline-start: var(--space-2);
    font-weight: var(--weight-body);
    color: var(--ink-subtle);
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
  /* An event that woke a project's Caw is code: its line stands in a 1px
     dashed box in the control edge (design §1, SystemLine), and the box is
     its one marker — no rail beside it, the box on the row's own edge. */
  .note[data-code] {
    padding-inline-start: 0;
    background: none;
  }
  .note[data-code] .hline,
  .note[data-code] :global(.ftrig) {
    padding: 0 var(--space-2);
    border: 1px dashed var(--border-control);
    border-radius: var(--radius-xs);
  }
  .hstatus {
    flex: 0 0 auto;
    color: var(--ink-muted);

    /* The one word on this line that is allowed to carry colour. */
    &.bad {
      color: var(--data-bad);
    }
  }
  /* Where the project came from: the done glyph in its status ink, what
     moved on the line, and what stayed under it in the meta voice. */
  .note.moved .rail-cell {
    color: var(--status-live-glyph);
  }
  .note.moved .ftitle {
    overflow: visible;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .stayed {
    margin-block: var(--space-1) 0;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-muted);
  }
  /* An artifact's responses: the line names it, and the name is the way to
     it — Peer's sender link, as a button, since it opens the panel rather
     than going anywhere. The state word follows it. */
  .note.responses .hline {
    gap: var(--space-2);
    align-items: baseline;
  }
  .aname {
    padding: var(--space-1) 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--ink-strong);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklab, currentColor 35%, transparent);
    text-underline-offset: 0.2em;

    &:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
      border-radius: var(--radius-xs);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .aname:hover {
      color: var(--brand-ink);
    }
  }
  @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
    .aname {
      transition: color var(--dur-control) var(--ease-out);
    }
  }
  .note.responses .hstatus {
    font-weight: var(--weight-body);
  }
  /* Waiting for the agent: MessageRow's queued presence, as Peer has it. */
  .note.responses.waiting {
    opacity: var(--ghost-presence);
  }
  .reason {
    margin-block: var(--space-1) 0;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--status-fail-ink);
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
    overflow: clip;
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
  /* Your words he has not read: the rows' height (`space-2` above and
     below), the clock at the 16px glyph size with both its tones standing
     clear of the row, the title in the strong ink, and what hangs under it
     at the text column free to shrink and wrap. */
  .note.unread {
    padding-block: var(--space-2);

    & .hline {
      color: var(--ink-strong);
    }
    & .ftitle {
      overflow-wrap: anywhere;
      text-wrap: pretty;
    }
    & .rail-cell :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    & .why {
      min-inline-size: 0;
    }
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
