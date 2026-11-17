/** The frames inside a turn and its end: asks, pulses, naming, retries, the end, and what observes it. */

import {
  CLAUDE_PROVIDER,
  LIMITED_PROVIDERS,
  modelNotEnabled,
  outOfCredit,
} from "@cawco/core/accounts";
import { FULL_SEND_ANSWER } from "@cawco/core/asks";
import { detach } from "@cawco/core/detach";
import type { ArrivingAsk } from "@cawco/core/frames";
import { asLastErrorKind } from "@cawco/core/relaunch";
import {
  type NeutralAssistantMessage,
  type NeutralMessage,
  PROVIDER_RETRY,
} from "@cawco/core/session-messages";
import { unreadAskWords } from "@cawco/core/words/ask-lines";
import {
  noteAnswered,
  noteNotEnabled,
  noteOutOfCredit,
} from "../account-marks";
import { briefingsObserve } from "../briefings";
import type { HubContext } from "../hub-context";
import { outlivesSession, unreadFields } from "../pending";
import { type FrameAnswer, type FrameRun, onSessionFrame } from "./frame-run";
import { runTurnEnded } from "./turn-ended";
import { type TurnEndedContext, turnEndedStepsOf } from "./turn-ended-steps";

export type TurnFlowContext = TurnEndedContext &
  Pick<
    HubContext,
    | "afterPausingCall"
    | "allowGranted"
    | "answeredSinceCompaction"
    | "artifactSessions"
    | "askInOrder"
    | "askRefusal"
    | "atLimit"
    | "caw"
    | "credentialTurns"
    | "db"
    | "delegateAskParent"
    | "delegateWaits"
    | "hubAsks"
    | "keepPrompt"
    | "keepTasks"
    | "lastRequestContext"
    | "launchSettled"
    | "limitAnswerFailed"
    | "limitRefused"
    | "machineName"
    | "moveOwedAtRefusal"
    | "nameFromLiveTurn"
    | "noteActivity"
    | "noteLimitStop"
    | "observeCompaction"
    | "observeTurn"
    | "pending"
    | "processFailed"
    | "processGeneration"
    | "providerRetries"
    | "publishUsage"
    | "pulses"
    | "push"
    | "resolvedModel"
    | "ruleEngine"
    | "settleRefusal"
    | "startModelMoves"
    | "takeCredentialTurn"
    | "turnInFlight"
    | "turnUnderWay"
    | "turnWaiters"
    | "usageCounter"
    | "watch"
    | "withdrawUnshown"
    | "workItems"
  >;

export const turnFlowStagesOf = (ctx: TurnFlowContext) => {
  const turnEndedSteps = turnEndedStepsOf(ctx);

  /** A refusal's words: its result's errors, or the text Claude Code answered in the model's place. */
  const refusalWords = (neutral: NeutralMessage): string => {
    if (neutral.type === "result") {
      return neutral.errors?.join(" ") || neutral.subtype;
    }
    if (neutral.type === "assistant") {
      return (
        neutral.message.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join(" ")
          .trim() ||
        (neutral.error ?? "")
      );
    }
    return "";
  };

  /**
   * Claude Code's error frame written in place of an API answer that
   * refused the account the use of its model: a 403 whose body's error
   * type is a permission one (core `modelNotEnabled`, read off the frame's
   * `api_error_status` and `api_error_type`), and not a mod's fetch hook,
   * which Claude Code answers with that type itself (`hook_denied`). The
   * session's own, not a subagent's, whose model may be another.
   */
  const claudeModelRefused = (neutral: NeutralAssistantMessage): boolean =>
    !neutral.parent_tool_use_id &&
    neutral.api_error !== "hook_denied" &&
    modelNotEnabled({
      ...(typeof neutral.api_error_status === "number"
        ? { status: neutral.api_error_status }
        : {}),
      ...(neutral.api_error_type ? { errorType: neutral.api_error_type } : {}),
    });

  /**
   * How a session's frame says its provider refused its account, as its
   * harness typed the refusal: for want of credit (a pi or OpenCode result's
   * `outOfCredit`, Claude Code's `billing_error` in the model's place), or
   * the use of its model (a pi or OpenCode result's `modelRefused`, Claude
   * Code's 403 `permission_error`); none for any other frame.
   */
  const refusalOf = (
    neutral: NeutralMessage
  ): "credit" | "access" | undefined => {
    if (neutral.type === "result" && neutral.is_error) {
      if (neutral.outOfCredit === true) {
        return "credit";
      }
      return neutral.modelRefused === true ? "access" : undefined;
    }
    if (neutral.type !== "assistant" || neutral.error === undefined) {
      return;
    }
    if (outOfCredit({ type: neutral.error })) {
      return "credit";
    }
    return claudeModelRefused(neutral) ? "access" : undefined;
  };

  /**
   * What a session's frame says of its account (account-marks.ts): a turn
   * its provider refused for want of credit marks the account out of
   * credit for the session's model's provider; one refused the use of its
   * model marks that model not enabled for the account; a turn that ends
   * answered ends both marks for its provider and model. Whether its
   * provider refused it.
   */
  const noteMarks = (instanceId: string, neutral: NeutralMessage): boolean => {
    const refused = refusalOf(neutral);
    const answered = neutral.type === "result" && !neutral.is_error;
    if (!(refused || answered)) {
      return false;
    }
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row) {
      return false;
    }
    // The model as its harness runs it: what an access mark is keyed by,
    // and a start's candidates are read as (spawns.ts `modelFor`).
    const ran = {
      accountId: row.accountId,
      harness: row.harness,
      model: ctx.resolvedModel(row.machineId, row.harness, row.model),
    };
    let moved = false;
    if (refused === "credit") {
      moved = noteOutOfCredit(ctx.db, ran, refusalWords(neutral));
    } else if (refused === "access") {
      moved = noteNotEnabled(ctx.db, ran, refusalWords(neutral));
    } else {
      moved = noteAnswered(ctx.db, ran);
    }
    if (moved) {
      ctx.publishUsage(row.machineId);
    }
    return refused !== undefined;
  };

  const turnFrames = onSessionFrame(
    ({ message, agentFrame, internal }, frame, instanceId) => {
      // A turn's first frame opens it before anything reads it:
      // a refusal below reads this turn's state, not the last's.
      if (
        frame.message.type === "assistant" ||
        frame.message.type === "user" ||
        frame.message.type === "stream_event"
      ) {
        ctx.turnUnderWay(instanceId);
      }
      // Claude Code's error in the model's place: what it says of
      // the account's credential settles its sign-in there, and
      // decides who answers the turn's end.
      if (
        frame.message.type === "assistant" &&
        !frame.message.parent_tool_use_id &&
        frame.message.error
      ) {
        const word = ctx.settleRefusal(
          message.machineId,
          instanceId,
          agentFrame.processGeneration,
          frame.message.error,
          frame.message.message.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("\n")
        );
        if (word) {
          ctx.takeCredentialTurn(instanceId);
        }
      }
      // What its provider said of its account is marked, and a refusal of
      // a first turn on a model the hub chose decides where that turn
      // goes, before anything fails what it read (start-model-moves.ts).
      if (!internal) {
        ctx.startModelMoves.frame(
          instanceId,
          frame.message,
          noteMarks(instanceId, frame.message)
        );
      }
      ctx.observeTurn(instanceId, frame);
      ctx.afterPausingCall(instanceId, frame.message);
      return "continue";
    }
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stage of the agent socket: its branches are this frame kind's handling in its fixed sequence.
  const permissionAsked = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const body = message.payload;
    if (message.requestId && body.kind === "permission_request") {
      const ask: ArrivingAsk = { ...message, payload: body };
      // An ask the hub cannot read is told back to its session before
      // anything is stamped, parked, pushed or broadcast: the process
      // that sent it would otherwise wait on a prompt no screen shows.
      const unread = unreadFields(ask);
      if (unread) {
        console.warn(
          `[hub] ask unreadable session=${message.instanceId ?? "none"} request=${message.requestId} fields=${unread.join(",")}`
        );
        detach(
          ctx.withdrawUnshown(ask, unreadAskWords(unread)),
          "ask withdrawal"
        );
        return "stop";
      }
      const [owner] = ctx.db.getInstancesByIds([message.instanceId ?? ""]);
      // An ask from a process this hub holds no live row for, or from
      // an earlier launch of the row, is cancelled at admission
      // through the same settlement path. A process sessiond kept
      // alive across an agent restart is `starting` until its attach
      // lands (`settleInstances`, `restore`), so its replayed asks
      // are admitted. A refusal is said, and the asking process is
      // told at once: nothing may wait on an ask nobody can see.
      const refusal = ctx.askRefusal(owner, ask);
      if (refusal) {
        console.warn(
          `[hub] ask refused session=${message.instanceId ?? "none"} request=${message.requestId} tool=${agentFrame.toolName ?? "unknown"}: ${refusal}`
        );
        // A prompt kept as a permit stays the person's: only the
        // late process is told.
        const kept = ctx.pending.get(message.requestId);
        if (!(kept && outlivesSession(kept))) {
          ctx.pending.remember(message.requestId, ask);
          ctx.pending.resolve(message.requestId, "cancelled", {
            why: refusal,
          });
        }
        // Admission does not wait on the machine.
        detach(ctx.withdrawUnshown(ask, refusal), "ask withdrawal");
        return "stop";
      }
      // The call a permit of its session granted runs once without
      // asking: its last process asked it, the person approved it
      // after that process went (asks.ts `granted`).
      if (
        owner &&
        !ctx.pending.get(message.requestId) &&
        ctx.hubAsks.granted(owner, ask)
      ) {
        detach(ctx.allowGranted(ask), "granted call");
        return "stop";
      }
      // A replayed ask (the daemon re-announces unresolved asks after
      // every register) refreshes the parked copy without a second
      // push or a second routing decision: it keeps the routing its
      // first copy has now.
      const parkedBefore = ctx.pending.get(message.requestId);
      const alreadyParked = parkedBefore !== undefined;
      const { requestId } = message;
      // A delegate's ask routes to its parent; the user is only the
      // fallback. The parent must be live, or asleep with a
      // conversation to wake from: a parent waiting on its
      // delegates is put to sleep after half an hour at rest, and
      // the ask wakes it as its delegate's report does
      // (`deliverSend`). Otherwise the ask is the user's exactly as
      // it was before this feature.
      const sender =
        !alreadyParked && message.instanceId
          ? ctx.db.listedInstancesByIds([message.instanceId])[0]
          : undefined;
      const parent = sender ? ctx.delegateAskParent(sender) : undefined;
      const routed = alreadyParked
        ? parkedBefore.payload.routedTo === "parent"
        : parent !== undefined;
      // Routed before it is kept, so the copy kept across a hub
      // restart, and the permit kept when its process goes (asks.ts
      // `keep`), stay the parent's.
      if (routed) {
        body.routedTo = "parent";
      }
      // Its publish is the fan-out below, which every frame no
      // transcript folds goes out by, after its routing here.
      if (
        !ctx.askInOrder(
          requestId,
          () => ctx.pending.remember(requestId, ask, true),
          () => undefined
        )
      ) {
        return "stop";
      }
      if (alreadyParked) {
        return "stop";
      }
      if (sender && parent) {
        ctx.delegateWaits.asked(ask);
      } else if (!run.internal) {
        ctx.push.onAsk(ask);
      }
    }
    return "continue";
  };

  const permissionSettled = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const body = message.payload;
    // The daemon's live reading of one session. Kept in memory only, so
    // a dashboard that connects mid-turn is handed the rail's now-state
    // in its first frame instead of a blank row. Relayed unchanged below
    // — this is a copy, not an interception.
    // The harness settled an ask itself (answered in its own UI, or
    // withdrawn by an interrupt). Settling it here is what tells every
    // screen, through `pending.onSettled`; the daemon's frame itself
    // goes no further.
    if (body.kind === "permission_settled") {
      // Most of these echo an answer the hub relayed and has already
      // settled; only one still parked is news here.
      const parked = message.requestId
        ? ctx.pending.get(message.requestId)
        : undefined;
      if (
        message.requestId &&
        parked?.instanceId === message.instanceId &&
        parked?.machineId === message.machineId &&
        parked.payload.processGeneration === agentFrame.processGeneration &&
        // A prompt its ended process took with it stays for the
        // session's next process ({@link keepPrompt}).
        !(body.processEnded === true && ctx.keepPrompt(parked))
      ) {
        // Answered with no answer of the hub's in flight: by Full
        // Send as its session entered it, when the harness says
        // so (its frame's `answer`), else taken in the harness's
        // own interface, which says not how. One in flight is that
        // answer's, and says itself (`answeringPermissions`).
        const { answer } = body;
        ctx.pending.resolve(
          message.requestId,
          agentFrame.outcome === "cancelled" ? "cancelled" : "answered",
          {
            answer:
              answer?.via === FULL_SEND_ANSWER.via
                ? FULL_SEND_ANSWER
                : { via: "harness" },
          }
        );
      }
      return "stop";
    }
    return "continue";
  };

  const pulseHeard = (run: FrameRun): FrameAnswer => {
    const { message } = run;
    const body = message.payload;
    if (body.kind === "pulse" && message.instanceId) {
      const { pulse } = body;
      if (pulse) {
        ctx.pulses.set(message.instanceId, pulse);
        ctx.artifactSessions.refresh(message.instanceId);
        ctx.workItems.turnState(message.instanceId, pulse.busy);
        ctx.caw.pulse(message.instanceId, pulse.busy);
        // A summariser is the hub's own worker: nothing watches it.
        if (!run.internal) {
          ctx.watch?.pulse(message.instanceId, pulse.busy);
        }
        // A pulse is only ever emitted by a session doing something,
        // so it is the fleet's cheapest honest signal for the column
        // the rails age rows from.
        ctx.noteActivity(message.instanceId);
      }
    }
    return "continue";
  };

  const namedFromTurn = (run: FrameRun): FrameAnswer => {
    const { message } = run;
    const body = message.payload;
    // A session named by what it was first asked, whether the ask came
    // through this hub or the harness echoed one it was spawned with.
    if (body.kind === "frame" && message.instanceId) {
      ctx.nameFromLiveTurn(message.machineId, message.instanceId, body.message);
    }
    return "continue";
  };

  const summariserAnswered = (run: FrameRun): FrameAnswer => {
    const { message } = run;
    const body = message.payload;
    // A continuation's summariser: its turn's end settles the
    // continuation's wait, and what it answered is read from its
    // transcript. Nothing else answers or hears an internal session.
    if (body.kind === "frame" && message.instanceId && run.internal) {
      const neutral = body.message;
      const waiter = ctx.turnWaiters.get(message.instanceId);
      if (neutral.type === "result" && waiter) {
        const { errors } = neutral;
        if (neutral.is_error) {
          waiter.reject(
            new Error(
              errors?.length
                ? errors.join("\n")
                : (neutral.result ?? `Harness error (${neutral.subtype}).`)
            )
          );
        } else {
          waiter.resolve();
        }
      }
    }
    return "continue";
  };

  const providerRetrying = onSessionFrame((_run, frame, instanceId) => {
    // A provider refused a session's turn and waits to try again.
    const neutral = frame.message;
    // A summariser whose provider refuses it at its usage limit
    // is refused: its harness would retry until the limit resets
    // (OpenCode answers Go's monthly limit with a `retry` status,
    // never an error). Its wait ends on the provider's words and
    // the run stops its scratch session, so the continuation's
    // caller decides what is next.
    if (
      neutral.type === "system" &&
      neutral.subtype === PROVIDER_RETRY &&
      neutral.retry?.atLimit
    ) {
      ctx.turnWaiters.get(instanceId)?.reject(new Error(neutral.retry.message));
    }
    // A work item's session waits on its provider no longer than
    // its deadline for that; anything its model says, or its
    // turn's end, is the wait over (provider-retries.ts). One at
    // its account's limit on an account of CawCo's is the
    // at-limit controller's: its harness ends the turn on it.
    if (
      neutral.type === "system" &&
      neutral.subtype === PROVIDER_RETRY &&
      neutral.retry &&
      !(
        neutral.retry.atLimit &&
        ctx.db.getInstancesByIds([instanceId])[0]?.accountId
      )
    ) {
      ctx.providerRetries.retry(instanceId, neutral.retry);
    } else if (neutral.type === "assistant" || neutral.type === "result") {
      ctx.providerRetries.progress(instanceId);
    }
    return "continue";
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stage of the agent socket: its branches are this frame kind's handling in its fixed sequence.
  const turnEnded = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const body = message.payload;
    // A turn's end, in this order: the standing instructions answer
    // it first, then the delegate hand-back delivers the turn's final
    // message to the parent as a queued peer report — once, on the
    // turn that ends the work (aborted turns carry no answer and are
    // skipped).
    if (body.kind === "frame" && message.instanceId && !run.internal) {
      const neutral = body.message;
      // A pi or OpenCode turn its account's limit refused, as its
      // harness typed the refusal it ended on.
      if (
        neutral.type === "result" &&
        neutral.is_error &&
        neutral.atLimit === true
      ) {
        const [limited] = ctx.db.getInstancesByIds([message.instanceId]);
        const provider = limited?.accountId
          ? ctx.db.accounts.get(limited.accountId)?.provider
          : undefined;
        // Only a provider whose limits CawCo reads: its reset is
        // known, so the session waits for it or moves.
        if (
          provider &&
          provider !== CLAUDE_PROVIDER &&
          LIMITED_PROVIDERS.includes(provider)
        ) {
          ctx.limitRefused.add(message.instanceId);
        }
      }
      // Every tool call the session's model makes, at the top of
      // its turn or inside one (a Code Mode program's, a
      // subagent's): work of its own ends a declared wait at rest.
      if (neutral.type === "assistant") {
        const called = neutral.message.content.flatMap((block) =>
          block.type === "tool_use" ? [block.name] : []
        );
        if (called.length > 0) {
          ctx.workItems.worked(message.instanceId, called);
        }
      }
      if (neutral.type === "result") {
        ctx.noteLimitStop(message.instanceId, neutral);
      }
      if (neutral.type === "assistant" && !neutral.parent_tool_use_id) {
        // An answer of its own, after any compaction: its next
        // turn's end may file again (OpenCode writes its summary
        // in the assistant's role, which is the compaction's).
        if (!neutral.compactSummary) {
          ctx.answeredSinceCompaction(message.instanceId);
        }
        // Claude Code ending the turn on its account's limit.
        if (neutral.error === "rate_limit") {
          ctx.limitRefused.add(message.instanceId);
        } else {
          // The context this request sent: the session's own, as
          // the turn's result (a sum over its requests) can't say.
          const { usage } = neutral.message;
          if (typeof usage?.input_tokens === "number") {
            ctx.lastRequestContext.set(
              message.instanceId,
              usage.input_tokens +
                (usage.cache_read_input_tokens ?? 0) +
                (usage.cache_creation_input_tokens ?? 0)
            );
          }
        }
        ctx.turnInFlight.frame(message.instanceId, neutral.message.content);
      } else if (
        neutral.type === "result" &&
        ctx.credentialTurns.has(message.instanceId)
      ) {
        // A turn its credential ended that the hub answers:
        // nothing ended, as at a limit. The session moves and
        // carries on.
        const ended = message.instanceId;
        ctx.credentialTurns.delete(ended);
        ctx.limitRefused.delete(ended);
        ctx.turnInFlight.over(ended);
        ctx.atLimit.signedOut(ended).catch((error: unknown) => {
          ctx.limitAnswerFailed(ended, "its refused sign-in", error);
        });
      } else if (
        neutral.type === "result" &&
        ctx.limitRefused.delete(message.instanceId) &&
        ctx.atLimit.manages(message.instanceId)
      ) {
        // A turn its account's limit refused: nothing ended. The
        // session is held, moved or continued; no report goes up,
        // no rule answers it, and what a refused request says of
        // the context is not the session's context.
        ctx.turnInFlight.over(message.instanceId);
        const refused = message.instanceId;
        // A move it owes to an account with room is its turn's
        // end, as any turn's end is.
        if (!ctx.moveOwedAtRefusal(refused)) {
          ctx.atLimit.turnRefused(refused).catch((error: unknown) => {
            ctx.limitAnswerFailed(refused, "its account's limit", error);
          });
        }
      } else if (
        neutral.type === "result" &&
        ctx.startModelMoves.movesAtEnd(message.instanceId)
      ) {
        // A first turn its provider refused on a model the hub chose:
        // nothing ended. The session moves to the hub's next pick and
        // answers there (start-model-moves.ts).
        ctx.turnInFlight.over(message.instanceId);
      } else if (neutral.type === "result") {
        runTurnEnded(turnEndedSteps, {
          instanceId: message.instanceId,
          machineId: message.machineId,
          neutral,
          harness: agentFrame.harness,
          message,
          cacheRow: undefined,
          text: "",
          onNoReply: false,
          silent: false,
          row: undefined,
          parentId: undefined,
          cut: false,
          turnId: "",
          endedAt: new Date(),
          artifactLeft: undefined,
        });
      }
    }
    return "continue";
  };

  const observers = (run: FrameRun): FrameAnswer => {
    const { message } = run;
    const body = message.payload;
    // Standing instructions read the frames inside a turn as the
    // dashboards do; a turn's end is answered above.
    if (body.kind === "frame" && message.instanceId && !run.internal) {
      ctx.ruleEngine.observe(message.instanceId, body.message);
      ctx.keepTasks(message.instanceId, body.message);
      ctx.observeCompaction(message.instanceId, body.message);
      ctx.usageCounter.observe(message.instanceId, body.message);
      ctx.watch?.observe(message.instanceId, body.message);
      briefingsObserve(ctx.db, message.instanceId, body.message);
    }
    return "continue";
  };

  const spawnFailed = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind } = message.payload;
    // An agent only frames an error about a session that failed to start
    // or died on its own, so the row records it for whoever looks later.
    if (
      kind === "error" &&
      message.instanceId &&
      agentFrame.errorVerb === "spawn"
    ) {
      const [process] = ctx.db.getInstancesByIds([message.instanceId]);
      if (
        !process ||
        agentFrame.processGeneration !== ctx.processGeneration(process)
      ) {
        return "stop";
      }
      ctx.launchSettled(
        message.instanceId,
        "it failed",
        ctx.processGeneration(process)
      );
      ctx.processFailed(
        message.machineId,
        message.instanceId,
        agentFrame.errorMessage?.trim() ||
          `The session's process on ${ctx.machineName(message.machineId)} failed, and its agent sent no words for why.`,
        asLastErrorKind(agentFrame.lastErrorKind)
      );
    }
    return "continue";
  };

  return {
    turnFrames,
    permissionAsked,
    permissionSettled,
    pulseHeard,
    namedFromTurn,
    summariserAnswered,
    providerRetrying,
    turnEnded,
    observers,
    spawnFailed,
  };
};
