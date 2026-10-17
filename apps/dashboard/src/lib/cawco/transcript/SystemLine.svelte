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
  <div
    data-system-line-rail-row
    data-slot="note"
    class="text-size-label font-medium text-ink-muted rail-row"
  >
    {#if harness.body}
      <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
        <!-- The harness fold: a notification the operator never wrote, on
             the same rail as every other note: the summary, how it went,
             and the report one click behind them. -->
        <Collapsible.Trigger
          class="inline-flex bg-transparent border-none border-current p-0 text-ink-muted text-size-label font-medium cursor-pointer text-start max-w-full rail-line"
        >
          <span data-slot="rail-cell" class="rail-cell"><IconInfo /></span>
          <span data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
            >{harness.title}</span
          >
          {#if harness.status}
            <!-- The one word on this line that is allowed to carry colour. -->
            <span
              data-slot="hstatus"
              class="flex-none text-ink-muted data-bad:text-data-bad"
              data-bad={harness.status === "failed" || undefined}
              >{harness.status}</span
            >
          {/if}
          <!-- literal: rotate(90deg) -->
          <span
            data-open={open || undefined}
            style:--chev-turn="rotate(90deg)"
            class="inline-flex flex-none data-open:transform-(--chev-turn) motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-out"
            data-box><IconChevronRight /></span
          >
        </Collapsible.Trigger>
        <Collapsible.Content reveal>
          <!-- The report hangs at the text column under the line that opens
               it, and keeps MessageBody's own 74ch measure. -->
          <div class="mt-space-3 rail-hang">
            <MessageBody source={harness.body} />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    {:else}
      <!-- Nothing to open, so nothing that looks openable: a chevron over an
           empty body is the dead disclosure the tool rows already refuse. -->
      <span
        class="inline-flex max-w-full text-size-label font-medium text-ink-muted rail-line"
      >
        <span data-slot="rail-cell" class="rail-cell"><IconInfo /></span>
        <span data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
          >{harness.title}</span
        >
        {#if harness.status}
          <span
            data-slot="hstatus"
            class="flex-none text-ink-muted data-bad:text-data-bad"
            data-bad={harness.status === "failed" || undefined}
            >{harness.status}</span
          >
        {/if}
      </span>
    {/if}
  </div>
{:else if type === "system.task"}
  <!-- A plain task's completion: the verb AND the task it reports. A bare
       "task done" with no reference to which task is a line that says nothing.
       The verb holds body ink; only failure carries colour. WHICH task, in
       the same muted register as every note: ellipsized, never wrapped. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    class="text-size-label font-medium text-ink-muted rail-row"
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-ink-muted rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell"><IconInfo /></span>
      <span
        class="flex-none text-ink-strong data-bad:text-data-bad"
        data-bad={message?.content === "task failed" || undefined}
        >{message?.content}</span
      >
      {#if message?.metadata?.result}
        <span
          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-muted"
          >{message.metadata.result}</span
        >
      {/if}
    </span>
  </div>
{:else if isOutput}
  <!-- A command's output: the command it answers on the line, the output in
       its recessed well under it: its text at the text column, the well
       reaching out past it by its own padding. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    class="text-size-label font-medium text-ink-muted rail-row"
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-ink-muted rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell"><IconTerminal /></span>
      <span data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
        >{foldCommand ?? "Output"}</span
      >
    </span>
    <pre
      data-slot="well"
      style:--well-x="calc(var(--x-hang) - var(--space-3))"
      class="bg-surface-recess rounded-sm p-space-3 mt-space-2 ms-(--well-x) overflow-x-auto font-mono text-size-label leading-body text-ink-strong whitespace-pre-wrap">{message?.content}</pre>
  </div>
{:else if isInterrupted}
  <!-- One quiet word for a deliberate act. The colour budget is for things
       that happened TO the operator, not things they did. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    class="text-size-label font-medium text-ink-muted rail-row"
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-ink-muted rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell"><IconStop /></span>
      <span data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
        >Interrupted</span
      >
    </span>
  </div>
{:else if responses}
  <!-- An artifact's responses: the line names it, and the name is the way to
       it — Peer's sender link, as a button, since it opens the panel rather
       than going anywhere. The state word follows it. Waiting for the agent:
       MessageRow's queued presence, as Peer has it. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    class="text-size-label font-medium text-ink-muted data-waiting:opacity-(--ghost-presence) rail-row"
    data-artifact-responses={responses.id}
    data-waiting={message?.state === "pending" || undefined}
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-ink-muted gap-space-2 items-baseline rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell"><ResponseGlyph /></span>
      <!-- literal (the name's underline offset): 0.2em -->
      <span data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
        >{responses.said} on
        <button
          aria-busy={opening}
          data-slot="aname"
          style:--name-offset="0.2em"
          class="py-space-1 px-0 border-none border-current bg-transparent text-ink-strong cursor-pointer underline decoration-current/35 underline-offset-(--name-offset) focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset) focus-visible:rounded-xs hover:text-brand-ink can-hover:motion-safe:transition-[color] can-hover:motion-safe:dur-control can-hover:motion-safe:ease-out"
          onclick={openResponses}
          title="Open {responses.name}"
          type="button"
        >
          {responses.name}
        </button></span
      >
      <span
        data-slot="hstatus"
        class="flex-none text-ink-muted font-normal data-bad:text-data-bad"
        data-bad={message?.state === "failed" || undefined}
        >{responsesState}</span
      >
    </span>
    {#if message?.state === "failed" && message.metadata?.sendFailed}
      <p
        data-slot="reason"
        class="mt-space-1 mb-0 text-size-meta font-normal text-status-fail-ink rail-hang"
      >
        {message.metadata.sendFailed}
      </p>
    {:else if openFailed}
      <p
        data-slot="reason"
        class="mt-space-1 mb-0 text-size-meta font-normal text-status-fail-ink rail-hang"
      >
        {openFailed}
      </p>
    {/if}
  </div>
{:else if moved}
  <!-- Where the project came from: the done glyph in its status ink, what
       moved on the line, and what stayed under it in the meta voice. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    data-moved
    class="text-size-label font-medium text-ink-muted rail-row"
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-ink-muted rail-line"
    >
      <span data-slot="rail-cell" class="text-status-live-glyph rail-cell"
        ><IconSuccess /></span
      >
      <span
        data-slot="ftitle"
        class="min-w-0 overflow-visible text-ellipsis whitespace-normal wrap-anywhere"
        >{title}</span
      >
    </span>
    {#if message?.content}
      <p
        class="mt-space-1 mb-0 text-size-meta font-normal leading-body text-ink-muted rail-hang"
      >
        {message.content}
      </p>
    {/if}
  </div>
{:else if unread}
  <!-- Your words he has not read: one row on the rail, drawn as a failure's
       is but in no fail hue, since nothing failed and the words are kept.
       The clock in the glyph cell, the title on the line with its time, and
       under it, at the text column, why and the way on (the pane's
       `event`: the reason and Try again). -->
  <!-- The rows' height (`space-2` above and below), the clock at the 16px
       glyph size with both its tones standing clear of the row, the title
       in the strong ink, and what hangs under it at the text column free to
       shrink and wrap. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    class="unread py-space-2 text-size-label font-medium text-ink-muted rail-row"
    data-unread-note={message?.id}
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-ink-strong rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell"><IconClock /></span>
      <span
        data-slot="ftitle"
        class="min-w-0 overflow-clip text-ellipsis wrap-anywhere text-pretty"
        >Caw hasn't read this</span
      >
      {#if eventAt}
        <time
          data-slot="num"
          data-eat
          class="flex-none ms-space-2 font-normal text-ink-subtle num"
          datetime={eventAt.toISOString()}>{eventClock}</time
        >
      {/if}
    </span>
    {#if under}
      <div data-slot="why" class="min-w-0 rail-hang">
        {@render under.snippet(under.id)}
      </div>
    {/if}
  </div>
{:else if isFail}
  <!-- A failure takes the rail like every other line, in the fail colours:
       what failed on the line, why under it. The rail, the mark, the title
       and the reason, all in the fail ink. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    style:--rail-head={"linear-gradient(var(--status-fail-ink), var(--status-fail-ink))"}
    class="text-size-label font-medium text-status-fail-ink rail-row"
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-inherit rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell"><IconError /></span>
      <b data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
        >{failTitle}</b
      >
    </span>
    <p
      class="mt-space-1 mb-0 text-size-label font-medium leading-body whitespace-pre-wrap rail-hang"
    >
      {message?.content}
    </p>
  </div>
{:else if foldCommand || foldBody}
  <!-- An event that woke a project's Caw is code: its line stands in a 1px
       dashed box in the control edge (design §1, SystemLine), and the box is
       its one marker — no rail beside it, the box on the row's own edge. -->
  <div
    data-system-line-rail-row
    data-slot="note"
    class="group/note text-size-label font-medium text-ink-muted data-code:ps-0 rail-row"
    data-code={wokeCaw || undefined}
  >
    <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
      <Collapsible.Trigger
        class="inline-flex bg-transparent border-none border-current p-0 text-ink-muted text-size-label font-medium cursor-pointer text-start group-data-code/note:px-space-2 group-data-code/note:border group-data-code/note:border-dashed group-data-code/note:border-border-control group-data-code/note:rounded-xs rail-line"
      >
        <span data-slot="rail-cell" class="rail-cell"><IconInfo /></span>
        <span data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
          >{foldTitle}</span
        >
        {#if eventAt}
          <time
            data-slot="num"
            data-eat
            class="flex-none ms-space-2 font-normal text-ink-subtle num"
            datetime={eventAt.toISOString()}>{eventClock}</time
          >
        {/if}
        <!-- literal: rotate(90deg) -->
        <span
          data-open={open || undefined}
          style:--chev-turn="rotate(90deg)"
          class="inline-flex flex-none data-open:transform-(--chev-turn) motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-out"
          data-box><IconChevronRight /></span
        >
      </Collapsible.Trigger>
      <Collapsible.Content reveal>
        {#if foldCommand}
          <pre
            data-slot="well"
            style:--well-x="calc(var(--x-hang) - var(--space-3))"
            class="bg-surface-recess rounded-sm p-space-3 mt-space-2 ms-(--well-x) overflow-x-auto font-mono text-size-label leading-body text-ink-strong whitespace-pre-wrap">{foldCommand}</pre>
        {:else if foldBody}
          <div class="mt-space-3 rail-hang">
            <MessageBody source={foldBody} />
          </div>
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
  <div
    data-system-line-rail-row
    data-slot="note"
    class="group/note text-size-label font-medium text-ink-muted data-code:ps-0 rail-row"
    data-code={wokeCaw || undefined}
  >
    <span
      class="inline-flex max-w-full text-size-label font-medium text-ink-muted group-data-code/note:px-space-2 group-data-code/note:border group-data-code/note:border-dashed group-data-code/note:border-border-control group-data-code/note:rounded-xs rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell"><IconInfo /></span>
      <span data-slot="ftitle" class="min-w-0 overflow-clip text-ellipsis"
        >{foldTitle}</span
      >
      {#if eventAt}
        <time
          data-slot="num"
          data-eat
          class="flex-none ms-space-2 font-normal text-ink-subtle num"
          datetime={eventAt.toISOString()}>{eventClock}</time
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
  /* residual: foreign-dom: every svg on the row at the glyph size, the
     row's own marks and those MessageBody and the action rows draw inside
     it; the unread row's clock at the 16px glyph size, with both its tones
     standing clear of the row (unlayered, so it outranks the rule above). */
  [data-slot="note"] :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    flex: 0 0 auto;
  }
  .unread .rail-cell :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  /* residual: unmapped: code drops the rail's whole background shorthand
     (image, position, size, repeat), which no single utility resets; the
     responses name takes its line's font whole. */
  [data-slot="note"][data-code] {
    background: none;
  }
  [data-slot="aname"] {
    font: inherit;
  }
</style>
