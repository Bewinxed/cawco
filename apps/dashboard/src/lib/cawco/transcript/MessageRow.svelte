<script lang="ts">
  import { untrack } from "svelte";
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import {
    departBox,
    waiting as departed,
    land,
  } from "#lib/cawco/motion/share.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import {
    canResend,
    canWithdraw,
    latestCommandFor,
    restoreDraft,
    retryFailed,
    retryOf,
    retrySend,
    withdrawQueued,
  } from "../client.svelte";
  /** Dispatches one stand-alone transcript message to its renderer by type. */
  import type { Message } from "../types";
  import DocThumb from "./DocThumb.svelte";
  import { disclosure } from "./disclosure.svelte";
  import MessageBody from "./MessageBody.svelte";
  import Peer from "./Peer.svelte";
  import Shot from "./Shot.svelte";
  import SystemLine from "./SystemLine.svelte";
  import Thinking from "./Thinking.svelte";
  import Who from "./Who.svelte";

  /** A token-dressed micro count badge — shadcn Badge, off the stock 4/8/12
   *  ladder and onto the DESIGN.md scale so it never reads as stock shadcn. */
  const chipClass =
    "h-auto rounded-[var(--radius-xs)] border-transparent bg-[var(--surface-recess)] " +
    "px-[var(--space-2)] py-px text-[length:var(--text-meta)] font-[var(--weight-body)] " +
    "!text-[color:var(--ink-muted)]";

  let {
    message,
    agentName,
    folding = false,
    grouped = false,
    runsOn = false,
  }: {
    message: Message;
    agentName: string;
    /** The same speaker's turn is right above: no speaker line of its own. */
    grouped?: boolean;
    /**
     * The reader's next message is right below, in the same run: this row's
     * part of the well ends on a hairline to it instead of the well's edge.
     */
    runsOn?: boolean;
    /** A thinking message that is the live reasoning, settled: it folds shut. */
    folding?: boolean;
  } = $props();

  const kind = $derived(message.type);
  const hidden = $derived(
    kind === "result.success" ||
      (kind === "assistant" && !message.content.trim())
  );

  /*
   * ───────────────────────────────────────────────────────────────────────
   * GHOST STORYBOARD — the reader's own turn, while its command is still
   * being answered. Fires on EVERY message the reader sends, so it must stay
   * sub-attention until there is something worth noticing.
   *
   *    0ms   ghost is on screen: presence 0.7, Who reads "sending…", no clock
   *  tACK    the hub's record of it arrives (well under a second, on a live
   *          hub): "queued" at 0.7, after the live tail, until the session
   *          reads it
   *  tREAD   presence 0.7 → 1.0 over --dur-menu; Who's note slot swaps to
   *          the real clock (the hub's), and the row slides into the place
   *          it was read at (Transcript's FLIP). No scale: arrival is
   *          subtraction.
   *
   * fail (from the same ghost, instead of settling):
   *    0ms   presence 0.7 → 1.0 — the words matter MORE on failure, not less
   *    0ms   Who's note becomes "not sent"
   *  +⅓ --dur-control   the reason line and its actions unfold (grid-rows
   *          0fr → 1fr) over --dur-pop: the chip flips first, the reason
   *          follows — cause, then effect. The unfold is the one layout
   *          change, and it is the information: something new must be read.
   * ───────────────────────────────────────────────────────────────────────
   */

  /** Drawn by this tab, not yet taken by the hub. */
  const ghost = $derived(message.state === "sending");
  /**
   * Taken by the hub and not read yet (its record `pending`): the reader's
   * own turn at reduced presence, with no clock — it has not been said in the
   * conversation yet, and a time here would be a promise about the wrong
   * moment.
   */
  const waiting = $derived(message.state === "pending");
  /** Never reached the hub: this tab's to send again, from its outbox. */
  const unreached = $derived(message.state === "unreached");
  /** Did not go: the hub's word (`failed`), or this tab's (`unreached`). */
  const failed = $derived(message.state === "failed" || unreached);
  /**
   * The retry out for this failed send, once there is one: the command whose
   * stage says whether it is still on its way, or did not go either.
   */
  const retry = $derived(
    message.state === "failed" && message.id ? retryOf(message.id) : null
  );
  const reason = $derived(
    retry?.stage === "failed" ? retry.reason : message.metadata?.sendFailed
  );

  /**
   * Whether Try again has anything to send. A failed send's words are its
   * record's, so it always does. One that never reached the hub has only this
   * tab's outbox, which is bounded to the ledger's own five minutes — so the
   * offer is gated on the payload being in hand rather than left standing as
   * a button that does nothing. The reason line stays either way.
   */
  const recoverable = $derived(
    kind === "user" &&
      !!message.id &&
      (message.state === "failed" || canResend(message.id))
  );
  /** Edit hands the whole payload back to the composer, which only the outbox holds. */
  const editable = $derived(
    (unreached && !!message.id && canResend(message.id)) || canWithdraw(message)
  );
  let withdrawing = $state(false);
  const withdrawal = $derived(
    latestCommandFor(message.instanceId, "send.withdraw")
  );
  const withdrawalPending = $derived(
    withdrawal?.stage === "submitted" || withdrawal?.stage === "accepted"
  );
  const whoNote = $derived.by(() => {
    if (ghost) {
      return "sending…";
    }
    if (failed) {
      return "not sent";
    }
    if (waiting) {
      return "queued";
    }
    if (message.metadata?.urgent) {
      return "urgent";
    }
  });

  /** What the reason line says about this failure. */
  const reasonLine = $derived(
    `Couldn't send that message.${reason ? ` ${reason}` : ""}`
  );
  /**
   * A retry goes out from this row and says so on its button, pending in
   * place, until the hub answers. One that never reached the hub goes again
   * under its own id: the row itself turns back to a ghost where it stands.
   * A failed send is sent anew: the hub retires this row, which folds away as
   * its retry arrives — or, if the retry does not go either, the button comes
   * back with why.
   */
  let retried = $state(false);
  /**
   * The reason line as it read when the retry went out: held while it is out,
   * and while the line folds away once it has gone.
   */
  let heldLine = $state("");
  /** Whether Edit was offered when the retry went out, held the same way. */
  let heldEdit = $state(false);
  /**
   * A retry is out until the hub answers it. A failed send's retry is its own
   * command, out until that command is taken or fails. One that never reached
   * the hub goes again as this row, out while the row is a ghost: taken, the
   * row is queued and the reason folds away; not taken, it is unreached again.
   */
  const retrying = $derived(
    retried && (message.state === "failed" ? retry?.stage !== "failed" : ghost)
  );
  /** Something to say under the words: the failure, or the retry for it. */
  const open = $derived(failed || retrying || editable);
  /**
   * What the reason line reads: the failure as it stands, or the line the
   * retry went out under — kept while the retry is out and while the fold
   * closes, so the block folds shut on the words it opened with instead of
   * losing them (and its height) in one frame.
   */
  const line = $derived(failed && !retrying ? reasonLine : heldLine);
  function tryAgain(): void {
    const { id } = message;
    if (!id) {
      return;
    }
    heldLine = reasonLine;
    heldEdit = editable;
    retried = true;
    if (unreached) {
      retrySend(id);
    } else {
      // The send again is a new row, drawn once the hub takes it, as this
      // one folds away: these words fly into it, under the id it goes out
      // under, known once it has gone.
      // biome-ignore lint/complexity/noVoid: fire-and-forget — the retry's own record and this row's leaving are the outcome
      void retryFailed(message).then(() => {
        const out = retryOf(id)?.commandId;
        if (out && words) {
          departBox(`sent:${out}`, words, false);
        }
      });
    }
  }
  async function edit(): Promise<void> {
    if (waiting) {
      withdrawing = true;
      try {
        await withdrawQueued(message);
      } finally {
        withdrawing = false;
      }
      return;
    }
    if (message.id) {
      restoreDraft(message.id);
    }
  }

  /**
   * Where the words this row says land from: the composer's text sent under
   * the message's id, or a failed send's words sent again under it. Whether
   * a departure waits there is the one test — Transcript's `motionOf` asks
   * it too, to hold back the row's own entrance — never the row's state,
   * which the hub's record can have moved on before the row is first drawn.
   */
  const sent = $derived(`sent:${message.id}`);
  /**
   * A send that joins a run already on screen: read once, as the row mounts
   * and before the text's landing takes the departure. The run's well opens
   * down to hold it while the text flies in; a send that starts a run flies
   * in whole, header and well together.
   */
  const joins = untrack(() => grouped && departed(sent));
  /** The words, which fly on to the row a Try again draws. */
  let words = $state<HTMLElement>();
  function openWell(node: HTMLElement): void {
    if (!(joins && motionOk.current)) {
      return;
    }
    requestAnimationFrame(() => {
      const timing = { duration: dur("--dur-pop"), easing: CURVE.drawer };
      node.animate(
        [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0)" }],
        { ...timing, pseudoElement: "::before" }
      );
      // The hairline above it comes in with it.
      node.animate([{ opacity: 0 }, { opacity: 1 }], {
        ...timing,
        pseudoElement: "::after",
      });
    });
  }
</script>

{#if hidden}
  <!-- A successful result has no line; an empty assistant frame carried only a tool call. -->
{:else if kind === "user"}
  <!-- The reader's own turns are the one thing worth finding on a fast scroll,
       so they are the one thing that carries a surface: ONE well holding the
       whole run of them, a step below the pane, with a hairline between its
       messages. The agent's turns stay bare on the field. The list is
       virtual, so the well is drawn a row at a time: each row is its part of
       it — the top edge on the run's first row (under the header, which sits
       on the pane), the bottom edge on its last, a hairline where the next
       message follows. Every part has the same box whatever its place, so a
       run growing or shrinking changes paint only: edges and corners follow
       without moving a line. -->
  <!-- Sent from this tab, the turn is the composer's text landing (motion/share,
       departed by Composer's submit under the message's own id): the whole
       turn when it starts a run, its words when it joins one. -->
  <section
    class="turn you"
    data-message={message.id}
    class:ghost={ghost || waiting}
    class:grouped
    class:runs-on={runsOn}
    {@attach land(() => (grouped ? undefined : sent), {
      ms: dur("--dur-pop"),
      uniform: true,
    })}
  >
    {#if !grouped}
      <Who
        name="You"
        note={whoNote}
        timestamp={ghost || failed || waiting ? undefined : message.timestamp}
        you
      />
    {/if}
    <div class="well" {@attach openWell}>
      <div
        class="words"
        bind:this={words}
        {@attach land(() => (grouped ? sent : undefined), {
          ms: dur("--dur-pop"),
          uniform: true,
        })}
      >
        {#if grouped}
          <Who
            grouped
            name="You"
            note={whoNote}
            timestamp={ghost || failed || waiting
              ? undefined
              : message.timestamp}
            you
          />
        {/if}
        <MessageBody source={message.content} />
        {#if message.metadata?.attachments?.length ||
          message.metadata?.images?.length}
          <div class="chips" data-gallery>
            {#each message.metadata.attachments ??
              [] as att, i (`${att.name}-${i}`)}
              <DocThumb content={att.content} name={att.name} />
            {/each}
            <!-- Keyed by position: the same picture sent twice is two pictures. -->
            {#each message.metadata.images ??
              [] as img, i (`${i}:${img.src ?? img.mediaType}`)}
              {#if img.src}
                <Shot
                  alt="Attachment {i + 1} sent with this message"
                  size="thumb"
                  src={img.src}
                />
              {:else}
                <!-- A stored transcript can name an image it no longer carries. -->
                <Badge class={chipClass} variant="secondary"
                  >Image {i + 1} · {img.mediaType}</Badge
                >
              {/if}
            {/each}
          </div>
        {/if}
        <!-- Mirrors Prompt.svelte's own refusal line ("Couldn't send that
             answer.") — a failed send is a sibling of a failed answer, not a
             new dialect of failure. The grid-rows wrapper is what animates a
             height that content, not JS, decides; `data-opens` tells the
             transcript it grows, so its tail is held while it does. Once a
             retry has gone out its contents stay, inert, for the fold to
             close over; a row that never failed renders none of it. -->
        <div class="failure" data-opens inert={!open} class:open>
          <div class="failure-inner">
            {#if failed || retried || editable}
              {#if failed || retried}
                <p class="reason">{line}</p>
              {/if}
              {#if recoverable || retried || editable}
                <div class="actions">
                  {#if failed || retried}
                    <button
                      aria-busy={retrying || undefined}
                      aria-disabled={retrying || undefined}
                      class="pressable action"
                      onclick={whileIdle(() => retrying, tryAgain)}
                      type="button"
                    >
                      <!-- A retry that went through keeps its word as it folds away. -->
                      <PendingContent
                        {failed}
                        label="Try again"
                        pending={retrying || (retried && !failed)}
                        pendingLabel="Sending…"
                      />
                    </button>
                  {/if}
                  {#if editable || (retried && heldEdit)}
                    <button
                      class="pressable action"
                      disabled={retrying || withdrawing || withdrawalPending}
                      onclick={edit}
                      type="button"
                    >
                      Edit
                    </button>
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      </div>
    </div>
  </section>
{:else if kind === "assistant"}
  <section class="turn" class:grouped>
    <Who {grouped} name={agentName} timestamp={message.timestamp} />
    <MessageBody source={message.content} />
  </section>
{:else if kind === "thinking"}
  {#if message.content.trim()}
    <Thinking {folding} text={message.content} />
  {/if}
{:else if kind === "user.peer" ||
  kind === "user.rule" ||
  kind === "user.delegate_ask"}
  <Peer {message} />
{:else}
  <SystemLine disclosed={disclosure(message)} {message} />
{/if}

<style>
  .turn {
    margin-block-start: var(--space-4);

    /* A later turn in the same speaker's group sits closer to the one above,
       and holds its floated clock inside its own box. */
    &.grouped {
      display: flow-root;
      margin-block-start: var(--space-2);
    }
  }
  /* The well's start edge is the reader's mark's edge (--well-x), with no
     bleed into the gutter; the words sit inside at its padding: --space-3,
     or --space-2 at the narrow breakpoint. */
  .turn.you {
    /* The seam's inset (app.css .kit-seam): one value for both. */
    --pad: var(--seam-inset);

    /* The run's later messages: the row above ends on its own padding and
       the hairline, so there is no gap of the turn's own. */
    &.grouped {
      margin-block-start: 0;
    }
  }
  /* One row's part of the well. The surface and its edge are painted by
     ::before, under the words, so a part can open without clipping the words
     landing in it; ::after is the hairline from the message above. The box is
     the same for every part — padding above (--space-2, plus the edge on a
     run's first part) and --space-2 plus the edge's 1px below — so a part
     becoming the last, or no longer the last, repaints and never reflows. */
  .well {
    position: relative;
    isolation: isolate;
    margin-inline-start: var(--well-x);
    padding-block: calc(var(--space-2) + 1px);
    padding-inline: var(--pad);

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border: 1px solid var(--well-edge);
      border-radius: var(--well-r);
      background: var(--surface-recess-deep);

      /* A run growing or shrinking: the edge and corners follow. */
      @media (prefers-reduced-motion: no-preference) {
        transition:
          border-color var(--dur-pop) var(--ease-out),
          border-radius var(--dur-pop) var(--ease-out);
      }
    }
    /* Drawn by the LOWER message, across the text column only, on the pixel
       row the part above leaves for its edge. The list places rows at
       fractional offsets, so a later row's surface can cover the last pixel
       of the row above: a hairline painted by the row above went missing.
       Painted by the row below, it is painted last. */
    &::after {
      content: "";
      position: absolute;
      inset-inline: var(--pad);
      inset-block-start: -1px;
      block-size: 1px;
      background: var(--seam);
      opacity: 0;

      @media (prefers-reduced-motion: no-preference) {
        transition: opacity var(--dur-pop) var(--ease-out);
      }
    }

    /* The words run to the well's edge, not the prose measure. */
    & :global(.msg) {
      max-inline-size: none;
    }
    /* The well is the deepest step, so a code span lifts to the raised
       surface instead of vanishing into it. */
    & :global(.msg code) {
      background: var(--surface-raised);
    }
  }
  /* A later message: open at the top, the hairline over the part above's
     bottom edge. */
  .grouped .well {
    padding-block-start: var(--space-2);

    /* Its surface starts on the pixel row the part above leaves for its
       edge, as the hairline does. The two parts are snapped to the pixel
       grid each on its own, and at some offsets the part above stopped a
       row short of this one: the row between was painted by neither, the
       page showed through it at the well's two insets, and the hairline
       stood on the page instead of on the well. */
    &::before {
      inset-block-start: -1px;
      border-block-start-width: 0;
      border-start-start-radius: 0;
      border-start-end-radius: 0;
    }
    &::after {
      opacity: 1;
    }
  }
  /* Another message follows: no bottom edge or corners. */
  .runs-on .well::before {
    border-block-end-color: transparent;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  /* A theme switch is one cross-fade of the whole page (theme.svelte.ts):
     the well's edge does not fade on its own under it. The page's rule
     (app.css `theme-flip`) leaves pseudo-elements out for what a universal
     pseudo-element selector costs, so the well's two are named here. */
  :global(:root.theme-flip) .well::before,
  :global(:root.theme-flip) .well::after {
    transition: none !important;
  }
  /* Holds the grouped row's clock, floated into the first line. */
  .words {
    display: flow-root;
  }
  /* Sending and queued: the words and their header at reduced presence, a
     note instead of a clock. The well stays at full strength, so the run
     reads as one surface. Not colour alone — the note text and the missing
     clock carry the state too, so it survives grayscale and reduced motion. */
  .ghost > :global(.who),
  .ghost .words {
    opacity: var(--ghost-presence);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }

  /* The reason + actions unfold on a `grid-template-rows` track rather than
     `height`, so the animated size is intrinsic content height with no
     measurement pass. Collapsed to nothing when there is nothing to say —
     which is every non-failed turn, so this costs nothing on the common path. */
  .failure {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;

    &.open {
      grid-template-rows: 1fr;
      opacity: 1;
      margin-block-start: var(--space-2);
    }
  }
  /* Motion is opt-in. Without it every state above still lands — the note,
     the reason line — it simply lands at once. */
  @media (prefers-reduced-motion: no-preference) {
    .turn.you > :global(.who),
    .words {
      transition: opacity var(--dur-menu) var(--ease-out);
    }
    .failure {
      --fail-delay: calc(var(--dur-control) / 3);
      transition:
        grid-template-rows var(--dur-pop) var(--ease-out) var(--fail-delay),
        opacity var(--dur-pop) var(--ease-out) var(--fail-delay),
        margin-block-start var(--dur-pop) var(--ease-out) var(--fail-delay);
    }
  }
  .failure-inner {
    overflow: hidden;
    min-block-size: 0;
  }
  .reason {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--status-fail-ink);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }
  /* Text actions in the chip vocabulary MessageRow already speaks (radius-mark,
     text-meta, space-2) rather than a new button style — a failed send reads as
     a sibling of the well it sits in, not a dialog bolted onto it. Raised out
     of the well like its code spans, edged in the well's own edge. */
  .action {
    display: inline-flex;
    align-items: center;
    gap: var(--btn-gap);
    --btn-gap: var(--space-1);
    --btn-icon: 12px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--well-edge);
    background: var(--surface-raised);
    padding-block: var(--space-1);
    padding-inline: var(--space-2);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);

    &:hover:not(:disabled) {
      background: var(--surface-hover);
    }
    /* The other action, while a retry is out. */
    &:disabled {
      opacity: 0.5;
    }
  }
</style>
