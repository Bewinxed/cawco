import { ASK_USER_QUESTION } from "@cawco/core/ask-tools";
import type { ArrivingAsk, ParkedAsk } from "@cawco/core/frames";
import { DELEGATE_WAIT_ORIGIN } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { DelegateWaitAbout } from "@cawco/core/injected";
import {
  delegateAskText,
  delegateWaitNotice,
  reportMarker,
} from "@cawco/core/injected";
import { isRecord } from "@cawco/core/is-record";
import type { InstanceRow } from "@cawco/core/protocol";
import { sessionLink } from "@cawco/core/references";

import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { configurePage } from "@cawco/core/words/configure";
import { ElysiaStatus } from "elysia";
import { claudeCredentialRefused, signOutRefused } from "./accounts";
import { AskCard } from "./ask-presentation";
import { eventContext, isProjectConversation } from "./caw";
import type { ClosureContext } from "./closure-context";
import type { DbShape } from "./db";
import type { SentMessageRow } from "./db/sends";
import type { StoredSendRefusal } from "./db/stored-types";
import type { ReportingSession, ReportTold } from "./hub-shapes";
import { boardTitle, sessionLabel } from "./labels";
import { outlivesSession } from "./pending";
import type { createSends } from "./sends";
import { sessionWord } from "./session-word";

/** `text` with `line` after its marker (core `markerTag`, its first line), when there is a line. */
const withContext = (text: string, line: string | undefined): string => {
  if (!line) {
    return text;
  }
  const at = text.indexOf("]\n") + 2;
  return `${text.slice(0, at)}${line}\n\n${text.slice(at)}`;
};

/**
 * Renders a parked ask readably for the parent session that has to answer it:
 * a question's text and option labels verbatim, or a tool's name and its input
 * summary. The parent reads this off a peer message and answers with the
 * `answer_delegate` tool, so the phrasing has to carry every choice it needs.
 */
const renderDelegateAsk = ({
  input,
  requestKind,
  toolName,
}: ArrivingAsk["payload"]): string => {
  const { questions } = input;
  if (
    (requestKind === "question" || toolName === ASK_USER_QUESTION) &&
    Array.isArray(questions) &&
    questions.length > 0
  ) {
    return questions
      .map((question: unknown, index) => {
        const q = isRecord(question) ? question : {};
        const options = Array.isArray(q.options)
          ? q.options
              .map((option: unknown) =>
                isRecord(option) ? option.label : undefined
              )
              .filter((label): label is string => typeof label === "string")
              .map((label) => `- ${label}`)
              .join("\n")
          : "";
        const text = typeof q.question === "string" ? q.question : "";
        return `Q${index + 1}: ${text}${options ? `\n${options}` : ""}`;
      })
      .join("\n");
  }
  const summary = JSON.stringify(input);
  return `${toolName}${summary ? ` — ${summary}` : ""}`;
};

export type AskRoutingContext = Pick<
  ClosureContext,
  | "accountWords"
  | "artifacts"
  | "awaitingFirstTurn"
  | "connectAsks"
  | "db"
  | "delegateWaits"
  | "endOwedNotices"
  | "homeLoginMoveOf"
  | "hubAsks"
  | "inCustody"
  | "keepPrompt"
  | "lead"
  | "machineName"
  | "movedFrom"
  | "pending"
  | "publishDelegateEvent"
  | "publishUsage"
  | "pulses"
  | "push"
  | "registry"
  | "sessionName"
  | "settlePending"
  | "startsTurnIn"
  | "touched"
  | "transcripts"
  | "triggers"
  | "usageCounter"
  | "watch"
  | "workItems"
> &
  Pick<ReturnType<typeof createSends>, "deliverSend">;

export const createAskRouting = (ctx: AskRoutingContext) => {
  /**
   * What `instanceId`'s process was halted on, kept as the hub's own asks
   * (server.ts `keepPrompt`): its permission prompts and its questions,
   * which stay on every screen while it may run again.
   */
  const keepParked = (instanceId: string): void => {
    for (const ask of ctx.pending.list()) {
      if (ask.instanceId === instanceId && !outlivesSession(ask)) {
        ctx.keepPrompt(ask);
      }
    }
  };
  /**
   * Drops a dead process's parked questions, telling whoever carried them
   * elsewhere that they are over — a push whose buttons still work after the
   * session behind them is gone is a notification that lies.
   */
  const forgetPending = (
    instanceId: string,
    why: string,
    outlived = false,
    /**
     * `all`: the session runs again, so nothing it was sent fails here — what
     * its process never read is owed to the next one, as its machine hands it
     * back ({@link takeBack}) or {@link losePending} decides. `none`: it never
     * runs again (stopped, deleted, archived, nothing to resume), and what it
     * never read fails for `why`.
     */
    keep: "none" | "all" = "none",
    /** What its failed sends offer back, beside `why` (a wake's refusal, `wakeOf`). */
    refusal?: StoredSendRefusal
  ): void => {
    // A process gone mid-turn ends that turn: what it read of a grant
    // lapses with it (asks.ts `turnEnded`). Its asks the hub owns stay
    // unless it ended for good.
    ctx.hubAsks.turnEnded(instanceId);
    ctx.hubAsks.withdrawEnded(instanceId);
    if (!outlived) {
      // If it runs again, a permission prompt or a question it was halted
      // on stays as the hub's own ask, and the person's answer wakes it.
      if (keep === "all") {
        keepParked(instanceId);
      }
      // Its connect asks' calls end with it, signed in or not.
      ctx.connectAsks.ended(instanceId);
      ctx.pending.forget(instanceId);
    }
    // Nor is it doing anything any more: a pulse outliving its process is the
    // same stale-liveness lie in memory instead of in a column.
    ctx.pulses.delete(instanceId);
    // A turn that called finish_item ends with its process: what waited out
    // that turn is the next process's to read.
    if (!outlived) {
      // And its transcript's tail says so: a process killed or crashed
      // mid-turn sent no `result`, and the tail went on saying busy over a
      // session doing nothing (a page read then drew Stop). One that outlived
      // its agent may still be in its turn, which its adoption says.
      ctx.transcripts.processGone(instanceId);
      ctx.workItems.turnOver(instanceId);
    }
    // A conversation's turn ends with its process.
    ctx.lead?.sessionEnded(instanceId);
    ctx.touched.delete(instanceId);
    // A session that died before it ever said anything is never going to name
    // itself; nothing should still be waiting to hear its first words.
    ctx.awaitingFirstTurn.delete(instanceId);
    // Nor is anything it was sent and never read going to run — unless its
    // harness wrote it down as it went. A process that outlived its agent
    // may hold it still: custody decides that (`decideCustody`).
    if (!outlived) {
      ctx.inCustody.delete(instanceId);
      // What is kept for the session at rest ({@link startsTurnIn}) never
      // reached a process: no process's end fails it. It waits for a person
      // or its parent.
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      const keptAtRest = ({ owedHeld, body }: SentMessageRow): boolean =>
        !!(owedHeld && row && body.origin) &&
        !ctx.startsTurnIn(
          { ...row, status: "stopped" },
          { origin: body.origin, shouldQuery: body.shouldQuery }
        );
      if (keep === "none") {
        ctx.settlePending(
          instanceId,
          why,
          "fail",
          (send) => !keptAtRest(send),
          undefined,
          refusal
        );
        // Unless it never runs again: then the notices kept for it end,
        // as nothing will wake it for them (owed-ends.ts).
        ctx.endOwedNotices({ instanceId });
      }
    }
    // A session that never runs again: what fleet watch read of it is over,
    // and a triage run that was it frees its slot. One that runs again
    // (a launch, a restart) is the same session to fleet watch.
    if (keep === "none") {
      ctx.watch?.forget(instanceId);
    }
    ctx.usageCounter.forget(instanceId);
  };

  // The hub's persisted spawn identity changes on every relaunch, but not on
  // a socket reconnect or a turn's init. A request belongs to that launch.
  const processGeneration = (
    row: ReturnType<DbShape["getInstancesByIds"]>[number]
  ): string => JSON.stringify([row.id, row.spawnedAt]);
  /**
   * A Claude session's error in place of an answer, read for what it says of
   * its account ({@link claudeCredentialRefused}). Refused for good: the
   * account is signed out where the refusal reaches ({@link signOutRefused}),
   * the session's machine or every machine it is signed in on, with the
   * refusal's words, so no new session is placed on it there and Configure →
   * Accounts offers to sign it in again. The sessions resting on it there
   * are not touched: each moves as it next launches, its leave read from
   * the sign-in (limit-moves.ts `signedOutLeave`). Any other error changes
   * nothing.
   * Only the row's live launch speaks for its account, and only one
   * reading the account's own credential: not one on the machine's own login
   * while it moves into CawCo, nor one still running from a credential that
   * has moved out of its store, whose refusal is that old credential's.
   * Answers what the live launch said, which the turn's end then answers
   * ({@link credentialTurns}): a refusal also when another session's had
   * already signed the account out there.
   */
  const settleRefusal = (
    machineId: string,
    instanceId: string,
    generation: string | undefined,
    error: string | undefined,
    text: string
  ): ReturnType<typeof claudeCredentialRefused> => {
    const word = claudeCredentialRefused(error, text);
    const [row] = word ? ctx.db.getInstancesByIds([instanceId]) : [];
    const accountId = row?.accountId;
    if (
      !(word && row && accountId && traitsOf(row.harness).accountDir) ||
      generation !== processGeneration(row) ||
      ctx.homeLoginMoveOf(machineId, row) ||
      ctx.movedFrom().has(row.id)
    ) {
      return;
    }
    const out = signOutRefused(ctx.db, machineId, accountId, word);
    if (out.length === 0) {
      return word;
    }
    const named = ctx.accountWords(accountId);
    console.warn(
      word.reach === "account"
        ? `[accounts] ${named} is signed out on ${out.map(ctx.machineName).join(", ")}: ${ctx.sessionName(row)}'s Claude Code on ${ctx.machineName(machineId)} was refused the account itself, whatever credential asks (${word.reason}). Nothing new is placed on ${named} until it is signed in again in ${configurePage("accounts")}; the session it stopped moves to another account, and every session resting on it moves as it next starts.`
        : `[accounts] ${named} on ${ctx.machineName(machineId)} is signed out: ${ctx.sessionName(row)}'s Claude Code refused its credential (${word.reason}). Nothing new is placed on ${named} there until it is signed in again on ${ctx.machineName(machineId)} in ${configurePage("accounts")}; the session it stopped moves to another account, and every session resting on it there moves as it next starts.`
    );
    for (const one of out) {
      ctx.publishUsage(one);
    }
    return word;
  };
  /** Why an ask arriving from a machine is not this row's live process's; none when it is. */
  const askRefusal = (
    owner: ReturnType<DbShape["getInstancesByIds"]>[number] | undefined,
    ask: ArrivingAsk
  ): string | undefined => {
    if (!owner) {
      return "no such session";
    }
    if (owner.machineId !== ask.machineId) {
      return `it belongs to ${ctx.machineName(owner.machineId)}`;
    }
    if (!["running", "starting", "unknown"].includes(owner.status)) {
      return `the session is ${owner.status}`;
    }
    if (ask.payload.processGeneration !== processGeneration(owner)) {
      return "an earlier launch asked it";
    }
    return undefined;
  };
  const ownsPermission = (parked: ArrivingAsk): boolean => {
    const [row] = ctx.db.getInstancesByIds([parked.instanceId ?? ""]);
    return askRefusal(row, parked) === undefined;
  };

  /**
   * The session a parked ask was routed to: its parent (work-items.ts
   * `reportees`), as the ask's record names it
   * ({@link deliverDelegateAsk}). Undefined for an ask not routed.
   */
  const routedRecipient = (parked: ArrivingAsk): string | undefined =>
    parked.payload.routedTo === "parent" && parked.requestId
      ? ctx.db.delegateAsk(parked.requestId)?.parentInstanceId
      : undefined;

  /**
   * A session just died — a parent, or a project's conversation — while an ask routed
   * to it was still parked. The user is the fallback: re-broadcast the ask
   * untagged so it returns to the attention queue, and let push hear it like
   * any other. A routed ask must never sit unanswerable and
   * invisible.
   */
  const escalateRoutedAsks = (recipientId: string): void => {
    for (const parked of ctx.pending.list()) {
      if (routedRecipient(parked) !== recipientId) {
        continue;
      }
      console.log(
        `[hub] ask ${parked.requestId} of ${parked.instanceId} was routed to ${recipientId}, which ended: it is the person's now`
      );
      makePersons(parked);
    }
  };

  /**
   * The parked ask routed to a delegate's parent made the person's: its
   * routing taken off, on every screen and push, and the sessions above
   * told it is the person's now. Its parent's forward ({@link forward}) and
   * its parent's end ({@link escalateRoutedAsks}) both come here.
   */
  const makePersons = (parked: ParkedAsk): void => {
    ctx.pending.unroute(parked.requestId ?? "");
    ctx.registry.broadcast(AskCard.of(parked));
    ctx.push.onAsk(parked);
    // Its parent, if it can still be woken, hears it is the person's now.
    ctx.delegateWaits.asked(parked, true);
  };

  /**
   * `parent` forwards the ask `requestId` its delegate's ask routed to it to
   * the person ({@link makePersons}): `answer_delegate` with `forward`.
   * Answers what the tool says; throws a sentence when it can't.
   */
  const forward = (parent: InstanceRow, requestId: string): string => {
    const parked = ctx.pending.get(requestId);
    if (!parked) {
      throw new Error(
        `${requestId} waits on no one now: it was answered or closed.`
      );
    }
    if (parked.payload.routedTo !== "parent") {
      throw new Error(`${requestId} is the person's already.`);
    }
    if (routedRecipient(parked) !== parent.id) {
      throw new Error(
        `${requestId} was routed to another session; that session forwards it.`
      );
    }
    console.log(
      `[hub] ask ${requestId} of ${parked.instanceId} forwarded to the person by ${parent.id}`
    );
    makePersons(parked);
    return `Forwarded ${requestId} to the person: their answer reaches your delegate, and you hear how it ended.`;
  };

  const delegateAskParent = (
    sender: InstanceRow,
    { unknown = false }: { unknown?: boolean } = {}
  ): InstanceRow | undefined => {
    const parentId = sender.parentInstanceId;
    if (!parentId || parentId === sender.id) {
      return undefined;
    }
    return ctx.workItems.reportees(sender).find(
      (row) =>
        (row.status === "running" ||
          row.status === "starting" ||
          (unknown && row.status === "unknown") ||
          (row.status === "sleeping" && row.sessionId !== null)) &&
        !ctx.workItems.refusal(row, {
          kind: "peer",
          from: sender.id,
          fromSession: sender.id,
        })
    );
  };

  /**
   * Delivers a delegate's ask to its parent as a queued peer message, in the
   * same shape the auto-report block uses: the parent reads it when its current
   * turn ends and answers with the `answer_delegate` tool. The final line is
   * machine-readable so the parent's model can copy the ids verbatim.
   */
  /**
   * The context line a send for a delegate's report or question opens with
   * when `parent` is its project's conversation (caw.ts `eventContext`):
   * where it runs, what `trigger` happened, the skill. Undefined for any
   * other session.
   */
  const conversationContext = (
    parent: { id: string },
    trigger: string
  ): string | undefined => {
    const [row] = ctx.db.getInstancesByIds([parent.id]);
    const project = row?.projectId ? ctx.db.project(row.projectId) : undefined;
    return row && project && isProjectConversation(row, ctx.db.project)
      ? eventContext(project, row.cwd, "delegate-report", trigger)
      : undefined;
  };

  /** Hands `parent` its delegate's parked ask as its own to answer, as the ask's card (`AskCard`). */
  const deliverDelegateAsk = (
    delegate: InstanceRow,
    parent: { id: string; machineId: string },
    card: AskCard
  ): void => {
    const { ask } = card;
    const { name, tag: label } = sessionLabel(delegate);
    const body = renderDelegateAsk(ask.payload);
    const question =
      ask.payload.requestKind === "question" ||
      ask.payload.toolName === ASK_USER_QUESTION;
    const instruction = question
      ? "Answer it from what you know with answer_delegate(target, requestId, answers): answers keyed by the exact question text, each the chosen option's label. When only the person can answer it, forward it as it stands: answer_delegate(target, requestId, forward=true)."
      : "Answer it with answer_delegate(target, requestId): allowed as asked, or deny=true to refuse it. When only the person can decide it, forward it: answer_delegate(target, requestId, forward=true).";
    const sent = ctx.deliverSend(
      sessionWord(
        parent,
        withContext(
          delegateAskText({
            label,
            body,
            instance: delegate.id,
            request: String(ask.requestId),
            instruction,
          }),
          conversationContext(
            parent,
            `${sessionLink(delegate.id, boardTitle(delegate))} asked a question`
          )
        ),
        {
          kind: "peer",
          from: delegate.id,
          name,
          fromSession: delegate.id,
        },
        { shouldQuery: false }
      )
    );
    if (sent instanceof ElysiaStatus) {
      console.warn(
        `[asks] a delegate's question was not handed to its parent: ${sent.response.detail}`
      );
    }
    const { toolName } = ask.payload;
    ctx.publishDelegateEvent(
      delegate.machineId,
      ctx.db.recordDelegateEvent({
        instanceId: delegate.id,
        parentInstanceId: parent.id,
        kind: "ask",
        requestId: ask.requestId,
        toolName,
        requestKind:
          ask.payload.requestKind === "question" ||
          toolName === ASK_USER_QUESTION
            ? "question"
            : "tool",
        payload: { input: ask.payload.input },
        status: "pending",
      })
    );
  };

  /**
   * The hub's word to `parent` while its delegate waits on the person, or of
   * how its ask ended (delegate-waits.ts): the hub's, under its own origin
   * (core `DELEGATE_WAIT_ORIGIN`), never the delegate's message, so a send
   * of it that fails tells no session it failed; a quiet note the parent's
   * next turn reads, never a turn of its own (hub-words.ts). Drawn in the parent's transcript as a note titled `line`; its
   * tag names the ask, its delegate and what it asks (`about`). Under a
   * `uuid` already sent it goes nowhere: each is told once.
   */
  const tellParentOfWait = (
    parent: InstanceRow,
    uuid: string,
    line: string,
    body: string,
    about: DelegateWaitAbout
  ): void => {
    const sent = ctx.deliverSend({
      verb: "send",
      machineId: parent.machineId,
      instanceId: parent.id,
      payload: {
        instanceId: parent.id,
        message: {
          type: "user",
          uuid,
          message: {
            role: "user",
            content: withContext(
              delegateWaitNotice(line, body, about),
              conversationContext(parent, line)
            ),
          },
          parent_tool_use_id: null,
          origin: { kind: "system", name: DELEGATE_WAIT_ORIGIN, line },
        },
      },
    });
    if (sent instanceof ElysiaStatus) {
      console.warn(
        `[asks] a delegate's wait was not told to its parent: ${sent.response.detail}`
      );
    }
  };

  /**
   * A delegate's report to its parent, as a queued peer message: what its
   * turn said (or why it never started), under the marker the parent's
   * transcript renders as a report. The parent, the session that started its
   * work, is the one that hears it (work-items.ts `reportees`).
   * `headline` is the delegate's one-or-two-sentence outcome from
   * `finish_item`, carried on the marker.
   *
   * A project's Caw conversation hears the reports of the delegates it
   * started as they are, whatever its size (the owner's card "Where
   * triggers go": "It goes in as it is"). Every other report in a project
   * is a trigger on the delegate's thing (triggers.ts), whose owner is the
   * parent while it still hears input; a parent that has ended passes it to
   * the session on the thing, else a fresh one, never to an old chat.
   */
  const reportToParent = (
    delegate: ReportingSession,
    body: string,
    failed: boolean,
    told: ReportTold = {}
  ): void => {
    for (const parent of ctx.workItems.reportees(delegate)) {
      const [row] = ctx.db.getInstancesByIds([delegate.id]);
      const projectId = row?.projectId;
      if (
        !(ctx.triggers && projectId) ||
        isProjectConversation(parent, ctx.db.project)
      ) {
        reportTo(parent, delegate, body, failed, told);
        continue;
      }
      const item = row.workItemId ? ctx.db.workItem(row.workItemId) : undefined;
      const link = sessionLink(delegate.id, boardTitle(delegate));
      ctx.triggers.routeQuietly(projectId, {
        kind: "delegate-report",
        from: delegate.id,
        thing: item?.taskId
          ? {
              kind: "task",
              id: item.taskId,
              name: `${item.taskId} (${item.title})`,
            }
          : { kind: "session", id: delegate.id, name: link },
        what: `${link} ${failed ? "failed" : "reported"}.`,
        delta: body,
        who: link,
        deliver: (owner) => {
          reportTo(owner, delegate, body, failed, told);
          return Promise.resolve(true);
        },
      });
    }
  };

  /** One report, to one of the sessions that hears a delegate's reports. */
  const reportTo = (
    parent: InstanceRow,
    delegate: ReportingSession,
    body: string,
    failed: boolean,
    { completion, notice = false, headline, outputs }: ReportTold
  ): void => {
    const { name, tag: label } = sessionLabel(delegate);
    // What it handed this parent that is still unopened: its move, this turn.
    const handed = artifactToolWords.handedInReport(
      ctx.artifacts.handedUnopened(parent.id, delegate.id)
    );
    const sent = ctx.deliverSend(
      sessionWord(
        parent,
        `${reportMarker(label, failed, notice, headline)}${conversationContext(parent, `${sessionLink(delegate.id, boardTitle(delegate))} ${failed ? "failed" : "reported"}`) ?? `From ${sessionLink(delegate.id, boardTitle(delegate))}.`}\n\n${body}${handed}`,
        {
          kind: "peer",
          from: delegate.id,
          name,
          fromSession: delegate.id,
        },
        { shouldQuery: false }
      )
    );
    if (sent instanceof ElysiaStatus) {
      console.warn(
        `[asks] a delegate's report was not handed to its parent: ${sent.response.detail}`
      );
    }
    ctx.publishDelegateEvent(
      delegate.machineId,
      ctx.db.recordDelegateEvent({
        instanceId: delegate.id,
        parentInstanceId: parent.id,
        kind: "report",
        payload: {
          body,
          failed,
          ...(headline ? { headline } : {}),
          ...(outputs?.length ? { outputs } : {}),
          ...(notice ? { notice: true } : {}),
          ...completion,
        },
      })
    );
  };

  return {
    forgetPending,
    processGeneration,
    settleRefusal,
    askRefusal,
    ownsPermission,
    escalateRoutedAsks,
    forward,
    delegateAskParent,
    deliverDelegateAsk,
    tellParentOfWait,
    reportToParent,
  };
};
