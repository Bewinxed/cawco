<script lang="ts">
  import type { HarnessKind, PermissionMode } from "@cawco/core";
  import { commonWords, transcriptWords } from "@cawco/core";
  import { tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { folds } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import {
    departBox,
    waiting as departed,
    land,
  } from "#lib/cawco/motion/share.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import { IconCopy, IconFork, IconPenLine } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { hueVar, nameOf } from "../accounts/model.svelte";
  import { moveTo, movingTo } from "../accounts/switch.svelte";
  import {
    answeredOr,
    cawco,
    commandRecord,
    editAndResend,
    failedSendPayload,
    forkPointOf,
    ModeUnchosen,
    relaunchSession,
    restoreDraft,
    retryFailed,
    retryOf,
    retrySend,
    userTurnActions,
  } from "../client.svelte";
  import { conversationHref } from "../links";
  import MessageBody from "../MessageBody.svelte";
  import { newSession, startFork } from "../spawn/new-session.svelte";
  import Turn from "../turn/Turn.svelte";
  import { useVoice } from "../turn/voice";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  /** Dispatches one stand-alone transcript message to its renderer by type. */
  import type { Message } from "../types";
  import { liftedIds } from "./composer-draft.svelte";
  import DocThumb from "./DocThumb.svelte";
  import { disclosure } from "./disclosure.svelte";
  import { askLift, landing, liftsInto, replacing } from "./lift.svelte";
  import ModePick from "./ModePick.svelte";
  import Peer from "./Peer.svelte";
  import Shot from "./Shot.svelte";
  import SystemLine from "./SystemLine.svelte";
  import {
    modeAskRecovery,
    type RecoveryAction,
    recoveryOf,
    type SendRecovery,
  } from "./send-recovery.svelte";
  import Thinking from "./Thinking.svelte";

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
  /** Who answers here, when a pane says: what it draws under a turn. */
  const voice = useVoice();
  /**
   * What the row offers. A queued message is edited in the composer, so it
   * offers Edit only where a composer is writing to its conversation.
   */
  const offered = $derived.by(() => {
    const actions = userTurnActions(message);
    return actions.edit === "queued" && !liftsInto(message.instanceId)
      ? { ...actions, edit: null }
      : actions;
  });
  const canEdit = $derived(offered.edit === "resend");
  const canFork = $derived(offered.fork);
  /**
   * The row's one Edit: a queued message's words lift into the composer, a
   * sent one's are edited in place and sent with the rewind. A failed send's
   * restore is recovery, offered in its failure block.
   */
  const editsHere = $derived(canEdit || offered.edit === "queued");
  /** Words to copy: a message of pictures alone has none. */
  const canCopy = $derived(!!message.content.trim());
  /**
   * The action row under the words: Copy, Edit, Fork from here. It stands,
   * its room taken, whenever it holds one of them, so showing it on hover,
   * focus or a tap changes paint only.
   */
  const hasActions = $derived(canCopy || editsHere || canFork);
  let editing = $state(false);
  let editContent = $state("");
  let editPending = $state(false);
  let forkPending = $state(false);
  let copying = $state(false);
  let copyFailed = $state(false);
  let editError = $state("");
  let editor = $state<HTMLTextAreaElement | null>(null);
  let actionsShown = $state(false);
  const coarse = new MediaQuery("(pointer: coarse)");

  /*
   * A queued message can be edited until the session reads it: its words
   * lift out of this bubble into the composer (lift.svelte.ts), which folds
   * to its tag while they are away, and opens to take them back.
   */
  const queued = $derived(offered.edit === "queued");
  const lifted = $derived(liftedIds.has(message.id));
  /** Away in the composer, or on their way back: the bubble's words are not drawn. */
  const wordsAway = $derived(lifted || landing.has(message.id));
  /** What the bubble says: its words, or those a replace has just sent for it. */
  const shownContent = $derived(replacing.get(message.id) ?? message.content);

  function touchActions(node: HTMLElement): () => void {
    function reveal(event: MouseEvent): void {
      if (
        !(coarse.current && hasActions) ||
        editing ||
        !(event.target instanceof Element) ||
        event.target.closest("button, a, input, textarea") ||
        !window.getSelection()?.isCollapsed
      ) {
        return;
      }
      // Every message's tap shows its row, a queued one's too: Copy and Edit
      // are both its, so neither is the tap.
      actionsShown = true;
    }
    node.addEventListener("click", reveal);
    return () => node.removeEventListener("click", reveal);
  }

  /**
   * Copy puts the message's words on the clipboard: the glyph turns to the
   * drawn check for --dur-hold (PendingContent). A browser that refuses the
   * clipboard (plain http on a LAN address, a denied permission) says so
   * under the words, with the way out.
   */
  const clipboard = new UseClipboard();
  async function copyWords(): Promise<void> {
    copying = true;
    copyFailed = false;
    editError = "";
    // The slot reads the work as begun before it ends, so the check follows.
    await tick();
    if ((await clipboard.copy(message.content)) !== "success") {
      copyFailed = true;
      editError =
        "Couldn't copy the message: this browser didn't allow the clipboard here. Select its words and copy them instead.";
    }
    copying = false;
  }

  $effect(() => {
    if (!(actionsShown && words)) {
      return;
    }
    const turn = words.closest('[data-slot="turn"]');
    function dismiss(event: Event): void {
      if (
        event.type === "scroll" ||
        (event.target instanceof Node && !turn?.contains(event.target))
      ) {
        actionsShown = false;
      }
    }
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("scroll", dismiss, true);
    };
  });

  async function startEditing(): Promise<void> {
    actionsShown = false;
    if (queued) {
      askLift(message);
      return;
    }
    editContent = message.content;
    editError = "";
    editing = true;
    await tick();
    editor?.focus();
  }

  function cancelEditing(): void {
    if (editPending) {
      return;
    }
    editing = false;
    editError = "";
  }

  async function submitEdit(): Promise<void> {
    if (!canEdit || editPending || !editContent.trim()) {
      return;
    }
    editPending = true;
    editError = "";
    try {
      const machineId =
        cawco.instanceIndex.byId.get(message.instanceId)?.machineId ?? "";
      answeredOr(
        machineId,
        await editAndResend(message.instanceId, message.id, editContent.trim()),
        "whether the session went back to that turn is not known"
      );
      editing = false;
    } catch (error) {
      // No mode is named for the restart a rewind is: the session's picker
      // asks for one at Send edited message, and the rewind goes on it.
      if (error instanceof ModeUnchosen) {
        askMode("rewind", editSend, error.ask);
        return;
      }
      editError = failureWords(error);
    } finally {
      editPending = false;
    }
  }

  /*
   * No permission mode named for a restart this row asked for (a send that
   * wakes the session, a rewind): the session's own picker (ModePick) asks
   * where the person acted, the session starts again on the pick
   * (relaunchSession), and what they asked for goes. The hub's refusal is
   * never shown.
   */
  let modeAsk = $state<{
    for: "send" | "rewind";
    anchor: HTMLElement | null;
    machineId: string;
    harness: HarnessKind;
  } | null>(null);
  let modeOpen = $state(false);
  let modePending = $state(false);
  /** Send edited message: a rewind's picker hangs from it. */
  let editSend = $state<HTMLElement | null>(null);
  /** The row's Choose a mode: a send's picker hangs from it. */
  let modeButton = $state<HTMLElement | null>(null);
  function askMode(
    what: "send" | "rewind",
    anchor: HTMLElement | null,
    at: { machineId: string; harness: HarnessKind }
  ): void {
    modeAsk = {
      for: what,
      anchor,
      machineId: at.machineId,
      harness: at.harness,
    };
    modeOpen = true;
  }
  async function pickMode(mode: PermissionMode): Promise<void> {
    const asked = modeAsk;
    if (!asked || modePending) {
      return;
    }
    modeOpen = false;
    modePending = true;
    editError = "";
    try {
      answeredOr(
        asked.machineId,
        await relaunchSession(message.instanceId, asked.machineId, mode),
        "whether the session runs on that mode is not known"
      );
      modeAsk = null;
      if (asked.for === "rewind") {
        await submitEdit();
      } else {
        tryAgain();
      }
    } catch (error) {
      editError = failureWords(error);
    } finally {
      modePending = false;
    }
  }

  async function branch(event: MouseEvent): Promise<void> {
    if (!canFork || forkPending) {
      return;
    }
    // The form hangs from Fork from here when the fork has no mode to run in.
    const trigger =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    actionsShown = false;
    forkPending = true;
    editError = "";
    try {
      const machineId =
        cawco.instanceIndex.byId.get(message.instanceId)?.machineId ?? "";
      const branched = await startFork(
        await forkPointOf(message.instanceId, message.id),
        trigger
      );
      // No mode to run in: the New Session form took it.
      if (!branched) {
        return;
      }
      const forked = answeredOr(
        machineId,
        branched,
        "whether the branch started is not known"
      );
      await goto(conversationHref(forked, cawco.instanceIndex));
    } catch (error) {
      editError = failureWords(error);
    } finally {
      forkPending = false;
    }
  }

  function editKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      // biome-ignore lint/complexity/noVoid: the row owns pending and failure state
      void submitEdit();
    }
  }
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
   * Whether Send again has anything to send. A failed send's words are its
   * record's, so it always does. One that never reached the hub has only this
   * tab's outbox, which is bounded to the ledger's own five minutes — so the
   * offer is gated on the payload being in hand rather than left standing as
   * a button that does nothing. The reason line stays either way.
   */
  const recoverable = $derived(offered.retry);
  /** Edit hands the whole payload back to the composer, which only the outbox holds. */
  const editable = $derived(offered.edit === "restore");
  const whoNote = $derived.by(() => {
    if (ghost) {
      return commandRecord(message.id)?.waiting
        ? "waiting for hub"
        : "sending…";
    }
    if (failed) {
      return retrying ? "sending…" : "not sent";
    }
    if (waiting) {
      const here = cawco.session(message.instanceId);
      if (here?.harness !== "claude") {
        return "sent";
      }
      if (lifted) {
        return "queued · editing it below";
      }
      return "queued";
    }
  });

  /** The session this row was sent to. */
  const target = $derived(cawco.instanceIndex.byId.get(message.instanceId));
  /**
   * The way back from a send the hub refused, read against the fleet as it
   * is now (send-recovery.svelte.ts): its own words, and what recovers it.
   * A retry that did not go either says its own reason instead.
   */
  const recovery = $derived.by(() => {
    const meta = message.metadata;
    if (!(message.state === "failed" && retry?.stage !== "failed" && target)) {
      return null;
    }
    if (meta?.sendModeAsk) {
      return modeAskRecovery(meta.sendModeAsk, target);
    }
    return meta?.sendRefusal ? recoveryOf(meta.sendRefusal, target) : null;
  });
  /** What the reason line says about this failure. */
  const reasonLine = $derived.by(() => {
    if (recovery?.asks) {
      return recovery.line;
    }
    const said = recovery?.line ?? reason;
    return `${transcriptWords.notSent}${said ? ` ${said}` : ""}`;
  });
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
   * Sent from this tab and refused while the row stood here, for no mode
   * named: the session's picker opens at once at Choose a mode (the person
   * just acted). A row drawn already refused (a reload) waits for the press.
   */
  const sentHere = untrack(
    () => message.state === "sending" || message.state === "pending"
  );
  let modeAsked = false;
  $effect(() => {
    const action = recovery?.actions.find((one) => one.kind === "mode");
    if (!(action && sentHere && modeButton) || modeAsked) {
      return;
    }
    modeAsked = true;
    untrack(() => askMode("send", modeButton, action));
  });
  /** What the line says while a send again is out, and folds shut on once it has gone. */
  const SENDING_AGAIN = "Sending that message again…";
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
  const open = $derived(failed || retrying);
  /**
   * What the reason line reads: the failure as it stands, or, once a send
   * again has gone out, that it is being sent again — kept while the fold
   * closes, so the block folds shut on its words instead of losing them (and
   * its height) in one frame. A send again that does not go either says why.
   */
  const line = $derived(failed && !retrying ? reasonLine : SENDING_AGAIN);
  /**
   * The recovery the row offered when Send again went out, held as resolved:
   * its Send again stays where it was, pending while the retry is out, and
   * back with why when the retry does not go either.
   */
  let heldRecovery = $state<SendRecovery | null>(null);
  const shownRecovery = $derived(retried ? heldRecovery : recovery);
  function tryAgain(): void {
    const { id } = message;
    if (!id) {
      return;
    }
    heldEdit = editable;
    heldRecovery = recovery ? { ...recovery, holds: false, actions: [] } : null;
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
  /**
   * Move to an account signed in on the machine, from the failed send
   * itself: the session moves as its menu moves it (switch.svelte.ts), and
   * once its row names that account the message goes again by itself — the
   * reader asked for both in one press. A move the hub refuses says why in
   * its toast, and the row offers the move again.
   */
  let sendAfterMove = $state<string | null>(null);
  function moveAndSend(accountId: string): void {
    if (!target) {
      return;
    }
    sendAfterMove = accountId;
    // biome-ignore lint/complexity/noVoid: the move's own state (movingTo) and its toast are the outcome
    void moveTo(target, accountId);
  }
  $effect(() => {
    const asked = sendAfterMove;
    if (!(asked && target)) {
      return;
    }
    if (target.accountId === asked) {
      sendAfterMove = null;
      untrack(tryAgain);
    } else if (movingTo(target) !== asked) {
      sendAfterMove = null;
    }
  });
  /**
   * Start a new session with this message: the New session dialog opens
   * where the work was, with its words and attachments as the first prompt.
   * Its pictures are read from the hub first; one that can't be read says
   * why under the row, and the dialog does not open without it.
   */
  let starting = $state(false);
  async function startWith(
    action: Extract<RecoveryAction, { kind: "new-session" }>
  ): Promise<void> {
    starting = true;
    editError = "";
    try {
      newSession({
        machineId: action.machineId,
        ...(action.projectId ? { projectId: action.projectId } : {}),
        prompt: await failedSendPayload(message),
      });
    } catch {
      editError =
        "Couldn't open a new session with it: a picture it carries couldn't be read from the hub. Press Start a new session again once the hub answers.";
    } finally {
      starting = false;
    }
  }
  function edit(): void {
    actionsShown = false;
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
  /** The words, which fly on to the row a Send again draws. */
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
  <Turn
    data-ghost={ghost || waiting || undefined}
    class="group/turn"
    data-message={message.id}
    {grouped}
    {runsOn}
    you
    {@attach touchActions}
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
    <Well {grouped} {lifted} {runsOn} {@attach openWell}>
      <!-- Holds the grouped row's clock, floated into the first line.
           Sending and queued: the words and their header at reduced
           presence, a note instead of a clock. The well stays at full
           strength, so the run reads as one surface. -->
      <div
        data-slot="words"
        class="flow-root group-data-ghost/turn:opacity-(--ghost-presence) motion-safe:transition-[opacity] motion-safe:duration-(--dur-menu) motion-safe:ease-out"
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
        <!-- Folds to the tag above while its words are in the composer, and
             opens to take them back; the words hide while they fly. -->
        <div
          {@attach folds(() => !lifted, {
            ms: dur("--dur-panel"),
            easing: CURVE.drawer,
          })}
        >
          <!-- The words of a queued message while they are in the composer,
               and on their way back: the flight is them, so the bubble
               draws none. -->
          <div
            data-message-row-away={wordsAway || undefined}
            data-lift-words
            data-away={wordsAway || undefined}
            class="data-away:invisible"
            {@attach morph()}
          >
            {#if editing}
              <Textarea
                aria-describedby={`${message.id}-edit-cost`}
                aria-label={transcriptWords.editMessage}
                disabled={editPending}
                onkeydown={editKeydown}
                bind:ref={editor}
                bind:value={editContent}
              />
              <!-- What sending costs, said before the press (DESIGN.md, the
                   Stay In Context Rule): the rewind replaces what follows. -->
              <p
                id={`${message.id}-edit-cost`}
                data-slot="edit-cost"
                class="mt-space-2 text-size-meta font-normal text-ink-muted text-pretty"
              >
                Sending goes back to this message and replaces everything after
                it in the conversation.
              </p>
              <div
                data-slot="actions"
                class="flex flex-wrap gap-space-2 mt-space-2"
              >
                <Button
                  data-slot="action"
                  disabled={editPending}
                  onclick={cancelEditing}
                  size="xs"
                  variant="outline"
                >
                  {transcriptWords.cancelEdit}
                </Button>
                <Button
                  aria-describedby={`${message.id}-edit-cost`}
                  data-slot="action"
                  disabled={!(canEdit && editContent.trim())}
                  failed={!!editError}
                  label={transcriptWords.sendEdited}
                  onclick={submitEdit}
                  pending={editPending || modePending}
                  pendingLabel="Sending…"
                  size="xs"
                  variant="outline"
                  bind:ref={editSend}
                />
              </div>
            {:else}
              <MessageBody said source={shownContent} />
            {/if}
            {#if editError}
              <p
                data-slot="reason"
                class="mt-space-2 text-size-meta font-normal text-status-fail-ink text-pretty"
                role="alert"
              >
                {editError}
              </p>
            {/if}
          </div>
        </div>
        {#if message.metadata?.attachments?.length || message.metadata?.images?.length}
          <div
            data-slot="chips"
            class="flex flex-wrap items-center gap-space-2 mt-space-2"
            data-gallery
          >
            {#each message.metadata.attachments ?? [] as att, i (`${att.name}-${i}`)}
              {#if att.kind === "file"}
                <DocThumb href={att.ref} name={att.name} size={att.size} />
              {:else}
                <DocThumb content={att.content} name={att.name} />
              {/if}
            {/each}
            <!-- Keyed by position: the same picture sent twice is two pictures. -->
            {#each message.metadata.images ?? [] as img, i (`${i}:${img.src ?? img.mediaType}`)}
              {#if img.src}
                <Shot
                  alt="Attachment {i + 1} sent with this message"
                  size="thumb"
                  src={img.src}
                />
              {:else}
                <!-- A stored transcript can name an image it no longer carries. -->
                <Badge kind="meta" variant="secondary"
                  ><span>Image {i + 1} · {img.mediaType}</span></Badge
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
        <!-- The reason + actions unfold on a `grid-template-rows` track
             rather than `height`, so the animated size is intrinsic content
             height with no measurement pass. -->
        {#if modeAsk}
          <ModePick
            anchor={modeAsk.anchor}
            harness={modeAsk.harness}
            id={`${message.id}-mode`}
            machineId={modeAsk.machineId}
            onchange={(value) => {
              modeOpen = value;
            }}
            onpick={pickMode}
            open={modeOpen}
          />
        {/if}
        <div
          data-slot="failure"
          data-opens
          inert={!open}
          data-open={open || undefined}
          style:--fail-delay="calc(var(--dur-control) / 3)"
          class="grid grid-rows-shut opacity-0 data-open:grid-rows-open data-open:opacity-100 data-open:mt-space-2 motion-safe:transition-[grid-template-rows,opacity,margin-block-start] motion-safe:duration-(--dur-pop) motion-safe:ease-out motion-safe:delay-(--fail-delay)"
        >
          <div class="fold-item">
            {#if failed || retried}
              <!-- Being sent again is not a failure: it says so in the meta
                   ink. -->
              <p
                data-slot="reason"
                data-going={line === SENDING_AGAIN || undefined}
                class="text-size-meta font-normal text-status-fail-ink data-going:text-ink-muted"
              >
                {line}
              </p>
              <!-- The way back, right under why, and only here: recovery is
                   read and acted on, never a hover's. While what refused it
                   holds (send-recovery.svelte.ts), what fixes it; otherwise
                   Send again, and Edit message where this tab still holds the
                   payload to put back in the composer. Its actions wrap under
                   the reason rather than run past the well; a link among them
                   is drawn as its siblings are. -->
              {#if shownRecovery?.holds ? shownRecovery.actions.length > 0 : recoverable || retried || editable}
                <div
                  data-slot="actions"
                  class="flex flex-wrap gap-space-2 mt-space-2 min-w-0"
                >
                  {#if shownRecovery?.holds}
                    {#each shownRecovery.actions as action, i (i)}
                      {#if action.kind === "link"}
                        <Button
                          data-slot="action"
                          class="max-w-full"
                          href={action.href}
                          size="xs"
                          variant="outline"
                          width="shrink"
                          ><span
                            data-slot="message-row-label"
                            class="overflow-clip text-ellipsis whitespace-nowrap"
                            >{action.label}</span
                          ></Button
                        >
                      {:else if action.kind === "move"}
                        {@const going =
                          !!target && movingTo(target) === action.account.id}
                        <Button
                          data-slot="action"
                          onclick={() => moveAndSend(action.account.id)}
                          pending={going}
                          size="xs"
                          variant="outline"
                        >
                          <!-- An account's own dot, as its menu draws it
                               (AccountSubmenu). -->
                          <i
                            data-slot="dot"
                            aria-hidden="true"
                            class="flex-none size-space-2 rounded-pill bg-(--c)"
                            data-box
                            style:--c={hueVar(action.account.hue)}
                          ></i>
                          <PendingContent
                            label={`Move to ${nameOf(action.account)}`}
                            pending={going}
                            pendingLabel={`Moving to ${nameOf(action.account)}…`}
                          />
                        </Button>
                      {:else if action.kind === "mode"}
                        <Button
                          data-slot="action"
                          aria-expanded={modeOpen}
                          aria-haspopup="dialog"
                          label="Choose a mode"
                          onclick={() => askMode("send", modeButton, action)}
                          pending={modePending}
                          pendingLabel="Starting it…"
                          size="xs"
                          variant="outline"
                          bind:ref={modeButton}
                        />
                      {:else}
                        <Button
                          data-slot="action"
                          label="Start a new session"
                          onclick={() => startWith(action)}
                          pending={starting}
                          pendingLabel="Opening…"
                          size="xs"
                          variant="outline"
                        />
                      {/if}
                    {/each}
                  {:else}
                    {#if recoverable || retried}
                      <Button
                        data-slot="action"
                        {failed}
                        label={commonWords.sendAgain}
                        onclick={tryAgain}
                        pending={retrying || (retried && !failed)}
                        pendingLabel="Sending again…"
                        size="xs"
                        variant="outline"
                      />
                    {/if}
                    {#if editable || (retried && heldEdit)}
                      <Button
                        data-slot="action"
                        disabled={retrying}
                        onclick={edit}
                        size="xs"
                        variant="outline"
                      >
                        {transcriptWords.editMessage}
                      </Button>
                    {/if}
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        </div>
        {#if hasActions && !editing && !wordsAway}
          <!-- The message's actions, under it at its end (as Claude.ai and
               ChatGPT stand a person's): Copy, Edit, Fork from here, one
               ghost icon style. The row always takes its room, so showing it
               moves nothing and covers nothing, the header's clock and note
               included. Shown under the pointer and for keyboard focus,
               under a finger once the message is tapped, and held while one
               of its actions runs. -->
          <div
            data-message-actions
            data-slot="actions"
            data-pending={forkPending || copying || undefined}
            data-shown={actionsShown || undefined}
            style:--btn-icon="var(--icon-md)"
            class="flex flex-wrap justify-end gap-space-1 mt-space-1 -me-space-2 opacity-0 pointer-events-none motion-safe:transition-[opacity] motion-safe:duration-(--dur-control) motion-safe:ease-out group-hover/turn:opacity-100 group-hover/turn:pointer-events-auto can-hover:group-focus-within/turn:opacity-100 can-hover:group-focus-within/turn:pointer-events-auto has-focus-visible:opacity-100 has-focus-visible:pointer-events-auto data-pending:opacity-100 data-pending:pointer-events-auto coarse:data-shown:opacity-100 coarse:data-shown:pointer-events-auto"
          >
            {#if canCopy}
              <Tip label={transcriptWords.copyMessage}>
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-busy={copying || undefined}
                    aria-label={transcriptWords.copyMessage}
                    onclick={whileIdle<MouseEvent>(() => copying, copyWords)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PendingContent
                      failed={copyFailed}
                      icon={IconCopy}
                      pending={copying}
                    />
                  </Button>
                {/snippet}
              </Tip>
            {/if}
            {#if editsHere}
              <Tip label={transcriptWords.editMessage}>
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-label={transcriptWords.editMessage}
                    onclick={startEditing}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <IconPenLine aria-hidden="true" />
                  </Button>
                {/snippet}
              </Tip>
            {/if}
            {#if canFork}
              <Tip label={transcriptWords.forkFromHere}>
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-busy={forkPending || undefined}
                    aria-disabled={forkPending || undefined}
                    aria-label={transcriptWords.forkFromHere}
                    onclick={whileIdle<MouseEvent>(() => forkPending, branch)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PendingContent
                      failed={!!editError}
                      icon={IconFork}
                      pending={forkPending}
                    />
                  </Button>
                {/snippet}
              </Tip>
            {/if}
          </div>
        {/if}
      </div>
    </Well>
  </Turn>
{:else if kind === "assistant"}
  <Turn {grouped}>
    <Who {grouped} name={agentName} timestamp={message.timestamp} />
    <MessageBody source={message.content} />
    {#if voice?.tasks && message.metadata?.tasks?.length}
      <!-- The tasks the turn is about, under it (a project's Caw). -->
      {@render voice.tasks(message.metadata.tasks, message.id)}
    {/if}
    {#if voice?.files && message.metadata?.files?.length}
      <!-- The files of the project's folder the turn wrote (a project's Caw). -->
      {@render voice.files(message.metadata.files, message.id)}
    {/if}
  </Turn>
{:else if kind === "thinking"}
  {#if message.content.trim()}
    <Thinking {folding} text={message.content} />
  {/if}
{:else if kind === "user.peer" || kind === "user.rule" || kind === "user.delegate_ask"}
  <Peer {message} />
{:else}
  <SystemLine disclosed={disclosure(message)} {message} />
{/if}
