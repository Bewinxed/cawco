<script lang="ts" module>
  import { MediaQuery } from "svelte/reactivity";
  import { buttonVariants } from "#lib/components/ui/button/index.js";

  /** No pointer hovers: the handle stands on the speaker line instead of the strip. One for every row. */
  const coarse = new MediaQuery("(pointer: coarse)");
  /** A strip button's box before the strip is built (`stripBuilt`): the kit's ghost `icon-sm`, as the Button draws it. */
  const STRIP_BUTTON = buttonVariants({ size: "icon-sm", variant: "ghost" });
</script>

<script lang="ts">
  import { detach } from "@cawco/core/detach";
  import type { HarnessKind, PermissionMode } from "@cawco/core/harness";
  import { commonWords } from "@cawco/core/words/common";
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { tick, untrack } from "svelte";
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
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import { IconCopy, IconFork, IconPenLine } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { hueVar, nameOf } from "../accounts/model.svelte";
  import { moveTo, movingTo } from "../accounts/switch.svelte";
  import {
    answeredOr,
    canWithdraw,
    cawco,
    commandRecord,
    discardUnreached,
    editAndResend,
    editFailed,
    failedSendPayload,
    forkPointOf,
    ModeUnchosen,
    relaunchSession,
    removeSend,
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
  import MessageSheet from "./MessageSheet.svelte";
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
   * offers Edit in place only where a composer is writing to its
   * conversation.
   */
  const offered = $derived.by(() => {
    const actions = userTurnActions(message);
    return actions.edit === "queued" && !liftsInto(message.instanceId)
      ? { ...actions, edit: null }
      : actions;
  });
  /**
   * Edit on the strip: the reader's own sent message, opened in place and
   * sent with the rewind, while the agent is not running (client
   * `userTurnActions`: a session at work offers none). A queued message's
   * edit and a failed send's are its recovery row's, at rest in the well.
   */
  const canEdit = $derived(offered.edit === "resend");
  const canFork = $derived(offered.fork);
  /** Words to copy: a message of pictures alone has none. */
  const canCopy = $derived(!!message.content.trim());
  let editing = $state(false);
  let editContent = $state("");
  let editPending = $state(false);
  let forkPending = $state(false);
  let copying = $state(false);
  let copyFailed = $state(false);
  let editError = $state("");
  let editor = $state<HTMLTextAreaElement | null>(null);
  /** The keyboard's focus is on one of the strip's buttons. */
  let stripFocused = $state(false);
  let sheetOpen = $state(false);

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

  async function startEditing(): Promise<void> {
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

  /** Fork from here; the New Session form hangs from `trigger` when the fork has no mode to run in. */
  async function branch(trigger: HTMLElement | null): Promise<void> {
    if (!canFork || forkPending) {
      return;
    }
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
      detach(submitEdit(), "submitEdit");
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
  /** The note while the message is on its way, beside the live dot. */
  const SENDING = "sending…";
  const whoNote = $derived.by(() => {
    if (ghost) {
      return commandRecord(message.id)?.waiting ? "waiting for hub" : SENDING;
    }
    if (failed) {
      return retrying ? SENDING : "not sent";
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
   * A queued message's way back, at rest in its well while its words are
   * there: Edit in place lifts them into the composer, Remove from queue
   * withdraws it (Claude Code recalls a queued send; client `canWithdraw`).
   */
  const removable = $derived(canWithdraw(message));
  const queueRow = $derived(waiting && !lifted && (queued || removable));
  /**
   * A recovery row stands at rest in the well (failed, queued): the message
   * shows no hover strip and no handle while it does. Copy, Edit and Fork
   * from here are a sent message's.
   */
  const recovering = $derived(open || queueRow);
  const strip = $derived(
    (canCopy || canEdit || canFork) && !recovering && !editing && !wordsAway
  );
  /**
   * The message is chosen while its strip holds the keyboard's focus, while
   * it is being edited, or while its sheet is open: the transcript's
   * selection pill stands under its well, in its contour (Transcript's
   * `highlight`, Well).
   */
  const selected = $derived(
    (stripFocused && strip) || editing || (sheetOpen && strip)
  );
  /**
   * THE STRIP IS BUILT THE FIRST TIME THE TURN IS REACHED FOR.
   *
   * Its three buttons, each in its tooltip, were most of what a reader's
   * turn cost to mount: 3.3ms of a row's 4.5 as a wheel brought rows into
   * the list (transcript-holds' steady wheel, profiled). At rest the strip
   * is unseen and takes its room, so until the pointer comes onto the turn
   * or the keyboard's focus comes into it (`stripBuilt`) it holds plain
   * buttons of the same box, named as the real ones are. The strip itself
   * stays the same element, so its fade in plays as before; a plain button
   * that takes the focus hands it to the real one it stands for, in the
   * same task.
   */
  let stripBuilt = $state(false);
  function buildStrip(): void {
    stripBuilt = true;
  }
  /** A plain strip button took the focus or a press: the strip is built, and the real button takes it. */
  function reachStrip(event: Event): void {
    const plain = event.currentTarget as HTMLElement;
    const label = plain.getAttribute("aria-label") ?? "";
    const held = plain.parentElement;
    const pressed = event.type === "click";
    stripBuilt = true;
    detach(
      tick().then(() => {
        const real = held?.querySelector<HTMLElement>(
          `[aria-label="${CSS.escape(label)}"]`
        );
        real?.focus();
        if (pressed) {
          real?.click();
        }
      }),
      "tick"
    );
  }
  function stripFocus(event: FocusEvent): void {
    stripFocused =
      event.target instanceof Element && event.target.matches(":focus-visible");
  }
  function stripBlur(event: FocusEvent): void {
    const held = event.currentTarget as HTMLElement;
    if (!(
      event.relatedTarget instanceof Node && held.contains(event.relatedTarget)
    )) {
      stripFocused = false;
    }
  }
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
      detach(
        retryFailed(message).then(() => {
          const out = retryOf(id)?.commandId;
          if (out && words) {
            departBox(`sent:${out}`, words, false);
          }
        }),
        "retryFailed"
      );
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
    detach(moveTo(target, accountId), "moveTo");
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
  /**
   * A failed send's Edit: its words, texts, files and pictures back in the
   * composer, and the row gone, the composer holds it now. One that never
   * reached the hub comes back from this tab's outbox; one the hub failed,
   * from its record, its pictures read from the hub first.
   */
  async function edit(): Promise<void> {
    if (!message.id) {
      return;
    }
    if (unreached) {
      restoreDraft(message.id);
      return;
    }
    editError = "";
    try {
      removeId = await editFailed(message);
    } catch {
      editError =
        "Couldn't put it back in the composer: a picture it carries couldn't be read from the hub. Press Edit again once the hub answers.";
    }
  }

  /**
   * Remove: a queued message out of the queue, a failed send out of the
   * conversation, nothing in its place. One that never reached the hub is
   * this tab's alone to let go. The hub's withdraw folds the row away on
   * every screen; one the session read first stays, and says so.
   */
  let removeId = $state<string | null>(null);
  function remove(): void {
    if (!message.id) {
      return;
    }
    editError = "";
    if (unreached) {
      discardUnreached(message.id);
      return;
    }
    removeId = removeSend(message);
  }
  const removal = $derived(removeId ? commandRecord(removeId) : null);
  const removePending = $derived(
    !!removeId &&
      !(
        removal?.stage === "failed" ||
        (removal?.stage === "applied" && removal.outcome !== "withdrawn")
      )
  );
  $effect(() => {
    if (removal?.stage === "failed") {
      editError = `It was not taken back: ${removal.reason ?? "the hub refused it"}.`;
    } else if (
      removal?.stage === "applied" &&
      removal.outcome !== "withdrawn"
    ) {
      editError = "The session read it first, so it stays in the conversation.";
    }
  });

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

<!-- The reader's message's actions on its speaker line, before the clock:
     Copy message, Edit message, Fork from here, each the kit's ghost
     `icon-sm` with its 16px glyph and its tooltip. Shown under the pointer and
     for keyboard focus, held while one of them runs; they take their room
     at rest, so showing them changes paint only, and they stand on the
     line, never over the words, the note or the clock. -->
{#snippet actions()}
  <span
    data-message-actions
    data-slot="strip"
    data-pending={forkPending || copying || undefined}
    class="flex items-center gap-space-1 -my-space-1 opacity-0 pointer-events-none motion-safe:transition-[opacity] motion-safe:duration-(--dur-control) motion-safe:ease-out group-hover/turn:opacity-100 group-hover/turn:pointer-events-auto can-hover:group-focus-within/turn:opacity-100 can-hover:group-focus-within/turn:pointer-events-auto has-focus-visible:opacity-100 has-focus-visible:pointer-events-auto data-pending:opacity-100 data-pending:pointer-events-auto"
    onfocusin={stripFocus}
    onfocusout={stripBlur}
  >
    {#if !stripBuilt}
      {#if canCopy}
        {@render plain(transcriptWords.copyMessage)}
      {/if}
      {#if canEdit}
        {@render plain(transcriptWords.editMessage)}
      {/if}
      {#if canFork}
        {@render plain(transcriptWords.forkFromHere)}
      {/if}
    {:else}
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
      {#if canEdit}
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
              onclick={whileIdle<MouseEvent>(
                () => forkPending,
                (event) =>
                  branch(
                    event.currentTarget instanceof HTMLElement
                      ? event.currentTarget
                      : null
                  )
              )}
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
    {/if}
  </span>
{/snippet}

<!-- A strip button before the strip is built: its box and its name (`stripBuilt`). -->
{#snippet plain(label: string)}
  <button
    aria-label={label}
    class={STRIP_BUTTON}
    data-slot="button"
    data-variant="ghost"
    onclick={reachStrip}
    onfocus={reachStrip}
    type="button"
  ></button>
{/snippet}

<!-- Where nothing hovers: one handle on the speaker line, at rest, to the
     same actions in the kit's bottom sheet. -->
{#snippet handle()}
  <MessageSheet
    copy={canCopy ? copyWords : undefined}
    edit={canEdit ? startEditing : undefined}
    fork={canFork ? branch : undefined}
    bind:open={sheetOpen}
  />
{/snippet}

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
    onfocusin={buildStrip}
    onpointerenter={buildStrip}
    {runsOn}
    you
    {@attach land(() => (grouped ? undefined : sent), {
      ms: dur("--dur-pop"),
      uniform: true,
    })}
  >
    {#if !grouped}
      <Who
        actions={strip && !coarse.current ? actions : undefined}
        end={strip && coarse.current ? handle : undefined}
        name="You"
        note={whoNote}
        noteLive={whoNote === SENDING}
        timestamp={ghost || failed || waiting ? undefined : message.timestamp}
        you
      />
    {/if}
    <Well
      data-selected={selected || undefined}
      {grouped}
      headed={grouped}
      {lifted}
      {runsOn}
      {@attach openWell}
    >
      <!-- Sending and queued: the words and their line at reduced presence,
           a note instead of a clock. The well stays at full strength, so the
           run reads as one surface. -->
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
          <!-- A later part's own line, on the hairline from the part above:
               its strip and its clock, so a run carries every message's
               time and each part its own actions. -->
          <div data-slot="part-line" class="flex justify-end mb-space-2">
            <Who
              actions={strip && !coarse.current ? actions : undefined}
              end={strip && coarse.current ? handle : undefined}
              grouped
              name="You"
              note={whoNote}
              noteLive={whoNote === SENDING}
              timestamp={ghost || failed || waiting
                ? undefined
                : message.timestamp}
              you
            />
          </div>
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
        {#if queueRow}
          <!-- A queued message's way back, at rest under its words (never a
               hover's): Edit in place lifts its words into the composer,
               Remove from queue takes it back before the session reads it. -->
          <div
            data-slot="recovery"
            class="flex flex-wrap gap-space-1 mt-space-2 min-w-0"
          >
            {#if queued}
              <Button
                data-slot="action"
                disabled={removePending}
                onclick={() => askLift(message)}
                size="xs"
                variant="ghost"
              >
                {transcriptWords.editInPlace}
              </Button>
            {/if}
            {#if removable}
              <Button
                data-slot="action"
                label={transcriptWords.removeFromQueue}
                onclick={remove}
                pending={removePending}
                pendingLabel="Removing…"
                size="xs"
                variant="ghost"
              />
            {/if}
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
                class="mark-line flex items-start gap-space-2 text-size-meta font-normal text-status-fail-ink data-going:text-ink-muted"
              >
                {#if line === SENDING_AGAIN}
                  <span class="mark-cell"><LiveDot /></span>
                {/if}<span class="min-w-0">{line}</span>
              </p>
              <!-- The way back, right under why, at rest, as text buttons:
                   recovery is read and acted on, never a hover's. While what
                   refused it holds (send-recovery.svelte.ts), what fixes it;
                   otherwise Retry and Edit; and Remove, which takes it out
                   of the conversation. Its actions wrap under the reason
                   rather than run past the well. -->
              <div
                data-slot="actions"
                class="flex flex-wrap gap-space-1 mt-space-2 min-w-0"
              >
                {#if shownRecovery?.holds}
                  {#each shownRecovery.actions as action, i (i)}
                    {#if action.kind === "link"}
                      <Button
                        data-slot="action"
                        class="max-w-full"
                        href={action.href}
                        size="xs"
                        variant="ghost"
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
                        variant="ghost"
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
                        variant="ghost"
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
                        variant="ghost"
                      />
                    {/if}
                  {/each}
                {:else}
                  {#if recoverable || retried}
                    <Button
                      data-slot="action"
                      disabled={removePending}
                      {failed}
                      label={transcriptWords.retrySend}
                      onclick={tryAgain}
                      pending={retrying || (retried && !failed)}
                      pendingLabel="Sending again…"
                      size="xs"
                      variant="ghost"
                    />
                  {/if}
                  {#if editable || message.state === "failed" || (retried && heldEdit)}
                    <Button
                      data-slot="action"
                      disabled={retrying || removePending}
                      onclick={edit}
                      size="xs"
                      variant="ghost"
                    >
                      {transcriptWords.editFailed}
                    </Button>
                  {/if}
                {/if}
                {#if failed && !retrying}
                  <Button
                    data-slot="action"
                    label={transcriptWords.removeFailed}
                    onclick={remove}
                    pending={removePending}
                    pendingLabel="Removing…"
                    size="xs"
                    variant="ghost"
                  />
                {/if}
              </div>
            {/if}
          </div>
        </div>
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
