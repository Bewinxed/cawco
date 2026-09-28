<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";
  import type { Trail } from "$lib/components/ui/markdown/trail";
  import {
    canResend,
    commandRecord,
    restoreDraft,
    retrySend,
  } from "../client.svelte";
  /** Dispatches one stand-alone transcript message to its renderer by type. */
  import type { Message } from "../types";
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
    carry = null,
  }: {
    message: Message;
    agentName: string;
    /** A thinking message that is the live reasoning, settled: it folds shut. */
    folding?: boolean;
    /** An answer that is the live stream, settled: the chunk fades it carries on. */
    carry?: Trail | null;
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
   *  tACK    the command leaves `submitted` (well under a second, on a live hub)
   *  +0ms    presence 0.7 → 1.0 over --dur-menu; Who's note slot swaps to
   *          the real clock — same slot Queued.svelte already uses, so
   *          settling moves nothing. No translation, no scale: arrival is
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

  /**
   * The command this turn went out as, read straight off the ledger — the
   * same pattern Prompt.svelte uses for its own card's answer. No record (a
   * historical message, a swept one, or one from before this tab existed)
   * renders solid: absence of evidence is a solid message, never a ghost.
   */
  const record = $derived(
    kind === "user" && message.metadata?.sentAs
      ? commandRecord(message.metadata.sentAs)
      : null
  );
  const ghost = $derived(record?.stage === "submitted");
  /**
   * `sendFailed` outlives the record's own five-minute sweep (see its doc in
   * types.ts), so a message that failed does not quietly fade back to solid
   * once the ledger has forgotten it — the stamp is read even after `record`
   * itself goes back to `null`.
   */
  const failed = $derived(
    record?.stage === "failed" || !!message.metadata?.sendFailed
  );
  const reason = $derived(message.metadata?.sendFailed ?? record?.reason);

  /**
   * Whether the payload behind this row is still in hand.
   *
   * `sendFailed` is stamped permanently — deliberately, so a message that never
   * sent never fades back to looking sent — but the OUTBOX that Try again and
   * Edit actually read from is bounded to the ledger's own five minutes. Those
   * two lifetimes disagreed, and the disagreement rendered as two buttons that
   * looked exactly as they had a moment before and now did nothing whatsoever:
   * an operator action that fails in silence, which is the one thing this whole
   * surface exists to make impossible. So the affordance is gated on the thing
   * it needs rather than on the thing that is always true. The reason line
   * stays either way — the failure is still the truth, it is only the offer to
   * undo it that has expired.
   */
  const recoverable = $derived(
    !!message.metadata?.sentAs && canResend(message.metadata.sentAs)
  );

  /**
   * Whether re-sending is provably safe. A refused or throwing dispatch never
   * left this tab; a failure by ack-timeout or dropped socket may already be in
   * the daemon's hands and acting on the world, so the second one is offered
   * with a word that does not promise the first one's certainty. Absence of a
   * record (swept) reads as ambiguous, which is the cautious side to be on.
   */
  const undelivered = $derived(record?.undelivered === true);
  const whoNote = $derived.by(() => {
    if (ghost) {
      return "sending…";
    }
    if (failed) {
      return "not sent";
    }
  });

  /** What the reason line says about this failure. */
  const reasonLine = $derived(
    `Couldn't send that message.${reason ? ` ${reason}` : ""}${
      recoverable && !undelivered
        ? " It may still have reached the agent — sending it again could repeat it."
        : ""
    }`
  );
  /**
   * A retry goes out on this row (`retrySend`): the row turns back to a ghost
   * where it stands, and the failure stays open under it with its Retry
   * pending in place until the hub answers — then the row settles sent and
   * the failure folds away, or the reason line takes the new reason.
   */
  let retried = $state(false);
  /** The reason line as it read when the retry went out, held while it is out. */
  let heldLine = $state("");
  const retrying = $derived(retried && ghost);
  function retry(): void {
    if (message.metadata?.sentAs) {
      heldLine = reasonLine;
      retried = true;
      retrySend(message.metadata.sentAs);
    }
  }
  function edit(): void {
    if (message.metadata?.sentAs) {
      restoreDraft(message.metadata.sentAs);
    }
  }
</script>

{#if hidden}
<!-- A successful result has no line; an empty assistant frame carried only a tool call. -->
{:else if kind === 'user'}
  <!-- The reader's own turn is the one thing worth finding on a fast scroll, so
       it is the one thing that carries a surface: a sunken well. User messages
       are sparse, so filling them makes the operator's own instructions the
       landmarks. The agent's turns stay bare on the field. -->
  <section class="turn you" class:ghost>
    <Who
      name="You"
      note={whoNote}
      timestamp={ghost || failed ? undefined : message.timestamp}
      you
    />
    <MessageBody source={message.content} />
    {#if message.metadata?.attachments?.length || message.metadata?.images?.length}
      <div class="chips">
        {#each message.metadata.attachments ?? [] as att (att.name)}
          <Badge class={chipClass} variant="secondary"
            >{att.name}
            · {att.chars} chars</Badge
          >
        {/each}
        {#each message.metadata.images ?? [] as img, i (img.src ?? `${img.mediaType}-${i}`)}
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
         answer.") — a failed send is a sibling of a failed answer, not a new
         dialect of failure. The grid-rows wrapper is what animates a height
         that content, not JS, decides. -->
    <div class="failure" class:open={failed || retrying}>
      <div class="failure-inner">
        {#if failed || retrying}
          <p class="reason">{retrying ? heldLine : reasonLine}</p>
          {#if recoverable}
            <div class="actions">
              <button
                aria-busy={retrying || undefined}
                aria-disabled={retrying || undefined}
                class="pressable action"
                onclick={whileIdle(() => retrying, retry)}
                type="button"
              >
                <PendingContent
                  failed={failed}
                  label={undelivered ? 'Try again' : 'Send anyway'}
                  pending={retrying}
                  pendingLabel="Sending…"
                />
              </button>
              <button
                class="pressable action"
                disabled={retrying}
                onclick={edit}
                type="button"
              >
                Edit
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </section>
{:else if kind === 'assistant'}
  <section class="turn">
    <Who name={agentName} timestamp={message.timestamp} />
    <MessageBody {carry} source={message.content} />
  </section>
{:else if kind === 'thinking'}
  {#if message.content.trim()}
    <Thinking {folding} text={message.content} />
  {/if}
{:else if kind === 'user.peer' || kind === 'user.rule' || kind === 'user.delegate_ask'}
  <Peer {message} />
{:else}
  <SystemLine disclosed={disclosure(message)} {message} />
{/if}

<style>
  .turn {
    margin-block-start: var(--space-4);
  }
  /* The well bleeds back out by exactly its own padding, so the reader's words
     sit on the same ledger column as the agent's and only the wash widens.
     --space-4 (14px) fits inside the transcript's gutters (25 start / 21 end)
     with room to spare; the narrow breakpoint clamps it below. */
  .turn.you {
    margin-inline: calc(var(--space-4) * -1);
    padding-block: var(--space-3);
    padding-inline: var(--space-4);
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
    /* The only property a ghost or a failure ever animates on the well
       itself — nothing translates or scales, so the row never reflows
       against its neighbours while it settles. */
    opacity: 1;

    /* Third tense of Queued.svelte's grammar: same well, same 0.7, a note
       chip instead of a clock. Not color alone — the note text and the
       missing clock carry the state too, so it survives grayscale and
       reduced motion. */
    /* Queued.svelte's own presence — shared on purpose: same tense. */
    &.ghost {
      opacity: 0.7;
    }
    /* At the narrow breakpoint the transcript's gutters drop to --space-5
       (18px), where a --space-4 bleed would leave 4px of air. Padding and
       bleed step down together so they stay equal — the columns stay flush
       and the gutter keeps 7px. */
    @media (width <= 900px) {
      margin-inline: calc(var(--space-3) * -1);
      padding-inline: var(--space-3);
    }
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
    .turn.you {
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
     a sibling of the well it sits in, not a dialog bolted onto it. */
  .action {
    display: inline-flex;
    align-items: center;
    gap: var(--btn-gap);
    --btn-gap: var(--space-1);
    --btn-icon: 12px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border-hairline);
    background: transparent;
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
