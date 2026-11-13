/**
 * The asks the hub owns (core asks.ts, its `asks` row): the one path by
 * which a session asks the person something and carries on. Two kinds:
 *
 * - **question**: the session's own `ask` call ({@link tools}), questions in
 *   the house shape and whether its work waits on them. Nothing on the
 *   session's side waits either way: the call answers at once
 *   (`askQuestionWords`), and the answer arrives as a message.
 * - **approve**: whatever door an `admin_*_write` call comes in by (MCP from
 *   any harness, the REST door, `cawco tool`), and `project_settings`,
 *   opening a relay or installing a build when they ask: the hub records it
 *   naming the exact tool and arguments, and the call answers at once
 *   ({@link askRecordedWords}).
 *
 * - **permit**: a harness's own permission prompt (an edit, a command) whose
 *   process went before the person answered ({@link keep}). The session
 *   stays halted on the same card; Approve grants that exact call once
 *   ({@link granted}) and tells the session to make it again, Deny tells it
 *   no. Nothing runs on the hub. The grant holds only for the turn that
 *   reads its answer ({@link turnEnded}): ended unspent, it lapses, and
 *   the same call asks again (the owner's pick on calls-1031-evening,
 *   "Until the turn your answer starts ends").
 *
 * Each reaches every screen and push as a `permission_request` (pending.ts
 * `askEnvelope`), so no agent, gateway or hub restart cuts it.
 *
 * The answer is taken once, in one write with the start of what it
 * carries; a second is refused. An approved call runs once, as the session
 * that asked, with the arguments that were shown ({@link carryOut});
 * denied, nothing runs. A question runs nothing. Either way the session is
 * told under {@link ASK_ORIGIN}, which reaches it as the person's own words
 * do, waking it when it is at rest. A hub that went while running a call
 * tells the session so as it comes back, and never runs it again.
 *
 * The ask is the session's for as long as the session may act: it stays
 * through its process ending, its agent or the hub restarting, and is
 * withdrawn when the session is stopped, its workspace archived, or no one
 * can give it a turn again ({@link withdrawEnded}). Nothing else expires it.
 *
 * A delegate's question is told to its parent too, which may answer it with
 * `answer_delegate` (server.ts); an approve ask is the person's alone, and
 * its parent is told the person holds it (delegate-waits.ts). A
 * question is never answered by Full Send. A session in Full Send is never
 * asked to approve (the owner, 2026-10-22: "FULL SEND LITERALLY MEANS FULL
 * SEND"): its write still needs its `reason`, then runs at once, approved by
 * Full Send, with the same record an approved ask leaves in the hub's log,
 * saying Full Send approved it. Nothing is recorded, so no screen holds it.
 * The mode is read from the session's row as the call is decided, never
 * from a row its caller read earlier, and an approval the session had open
 * as it entered Full Send is approved by Full Send then ({@link
 * fullSendFiled}), so nothing of a session in Full Send waits on the
 * person, however recently the mode was set.
 */
import type {
  Envelope,
  InstanceRow,
  PermissionMode,
  PermissionResult,
  SourceFacts,
  UserAnswers,
} from "@cawco/core";
import { ASK_USER_QUESTION } from "@cawco/core/ask-tools";
import {
  ASK_ORIGIN,
  type AskedPermit,
  type AskedQuestion,
  type AskRecord,
  type AskResult,
  askAnsweredText,
  askClosedWords,
  askLink,
  askOutcome,
  askQuestionWords,
  askRecordedWords,
  FULL_SEND_ANSWER,
  HUB_RESTARTED,
  isAdminWrite,
  newAskId,
  sameCall,
  UserQuestionShape,
} from "@cawco/core/asks";
import { canonicalJson } from "@cawco/core/canonical-json";
import { detach } from "@cawco/core/detach";
import { settledQuestionResult } from "@cawco/core/question";
import { noticeWords } from "@cawco/core/words/notices";
import { z } from "zod";
import type { DbShape } from "./db";
import { tool as mcpTool, sentence } from "./mcp-tool";
import { uuidOf } from "./named-uuid";
import type { AnswerFrom } from "./pending";
import { askEnvelope } from "./pending";

/** The session tools asks give, by name: what a call is routed by (delegation-mcp.ts). */
export const ASK_TOOLS: ReadonlySet<string> = new Set(["ask"]);

/** The words the model reads for `ask`. */
const ASK_DESCRIPTION =
  "Ask the person something and carry on. It answers at once and the hub keeps the question; their answer arrives as a message naming it, and wakes you if your turn ended. " +
  "A delegate's question reaches its parent too, which may answer it. " +
  "Set blocks when going the wrong way would waste work; otherwise say what you'll go ahead with.";

/** The most questions one ask carries, answered one at a time in a row. */
const QUESTIONS_MAX = 4;

/** The longest `waiting` or `meanwhile` line the card shows. */
const STANCE_MAX = 200;

/** An approve ask's own: the CawCo call it runs on yes. */
type Approve = Extract<AskRecord["asked"], { kind: "approve" }>;

/** What an ask names in the hub's log: the tool it approves, or that it is a question. */
const named = (ask: AskRecord): string =>
  ask.asked.kind === "question" ? "a question" : ask.asked.tool;

/**
 * A question's answer as its row keeps it: the answers folded in the shape
 * its questions read (core question.ts `settledQuestionResult`, which makes a
 * remote answerer's single label a list for a multi-select), or the
 * dismissal in words.
 */
const questionResult = (
  asked: AskedQuestion,
  result: PermissionResult
): AskResult => {
  const settled = settledQuestionResult(
    { input: { questions: asked.questions }, questions: asked.questions },
    result
  );
  if (settled.behavior === "deny") {
    return { behavior: "deny", message: settled.message };
  }
  const answers = settled.updatedInput?.answers as UserAnswers | undefined;
  return { behavior: "allow", ...(answers ? { answers } : {}) };
};

/** The mode that approves every ask for its session (core `PermissionMode`). */
const FULL_SEND: PermissionMode = "fullSend";

/**
 * Why a write is refused before anyone is asked: an `admin_*_write` with no
 * `reason`, which the person reads first on the approval. Undefined when it
 * may ask.
 */
const askRefusal = (
  name: string,
  input: Record<string, unknown>
): string | undefined => {
  if (!isAdminWrite(name)) {
    return;
  }
  return typeof input.reason === "string" && input.reason.trim()
    ? undefined
    : `${name} needs a \`reason\`: one sentence on why, for which task. The person reads it on the approval; nothing was asked.`;
};

export interface AsksDeps {
  /** Whether the session has read the send `uuid` (its record `read`). */
  readonly answerRead: (uuid: string) => boolean;
  readonly asks: DbShape["asks"];
  /**
   * A call's input with the caller's place bound in, as it is asked
   * (delegation-mcp.ts `bindAdminInput`): asking again after what was shown
   * changed binds the input afresh. Throws, in a sentence, when it can't.
   */
  readonly bind: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  /** A declined ask's own note, where its tool keeps one (project-settings.ts `runDeclined`). */
  readonly declined: (
    name: string,
    input: Record<string, unknown>,
    asker: InstanceRow
  ) => void;
  /** Whether a session may never act again: stopped, its workspace archived, stranded, or gone. */
  readonly ended: (instanceId: string) => boolean;
  /** The session that asked, as the hub holds it now. */
  readonly instance: (instanceId: string) => InstanceRow | undefined;
  /**
   * Puts an ask on every screen and push, and tells a delegate's parent
   * (server.ts `parkForPerson`, delegate-waits.ts): a question it may
   * answer with `answer_delegate`, an approval as the person's alone.
   */
  readonly park: (envelope: Envelope) => void;
  /**
   * Writes again the line the person's transcript says of the send `uuid`
   * (its origin's `line`, core harness.ts); what the agent read stays.
   */
  readonly reline: (uuid: string, line: string) => void;
  /** Runs an approved call as the hub for the session that asked; answers what the tool said. */
  readonly run: (
    name: string,
    input: Record<string, unknown>,
    asker: InstanceRow
  ) => Promise<string>;
  /**
   * Takes an ask off every screen (pending.ts `resolve`): answered, with who
   * answered, or withdrawn, with why.
   */
  readonly settle: (
    id: string,
    outcome:
      { answer: AnswerFrom & { behavior: "allow" | "deny" } } | { cut: string }
  ) => void;
  /**
   * What an install's or a link's source is (source-facts.ts), read before
   * the ask is recorded so the card shows it; undefined for any other call.
   */
  readonly sourceFacts: (
    name: string,
    input: Record<string, unknown>
  ) => Promise<SourceFacts> | undefined;
  /**
   * Why what an approved ask showed the person no longer holds (a skill
   * folder whose files changed since the card read them), read just before
   * it runs; undefined when it still holds. A stale ask is not run: it fails
   * with this sentence and is asked again.
   */
  readonly stale: (ask: AskRecord) => Promise<string | undefined>;
  /** Says something to a session, as the hub, under `origin`; `uuid` names the send when it must be found again. */
  readonly tell: (
    instanceId: string,
    text: string,
    origin: string,
    uuid?: string
  ) => void;
}

/** Why a session's ask goes unanswered when it ends. */
const ENDED_WHY = "its session ended before anyone answered";

/** Why a permit goes when its session's next process asks the same call itself. */
const ASKED_AGAIN_WHY = "its session asked the same call again";

/**
 * The send a permit's answer goes as: named by its ask, so the turn that
 * reads it is found by its record ({@link AsksDeps.answerRead}).
 */
const answerSend = (askId: string): string => uuidOf(`${askId}\u0000answer`);

/** A parked prompt's tool call, as its frame carries it. */
const callOf = (envelope: Envelope): AskedPermit => {
  const { toolName, input } = envelope.payload as {
    toolName: string;
    input: Record<string, unknown>;
  };
  return { kind: "permit", tool: toolName, input };
};

export const createAsks = (deps: AsksDeps) => {
  /** The answer's message, to the session that asked now (a fold moves its row). */
  const tellAnswered = (ask: AskRecord): void =>
    deps.tell(
      ask.instanceId,
      askAnsweredText(ask),
      ASK_ORIGIN,
      ask.asked.kind === "permit" ? answerSend(ask.id) : undefined
    );

  /** An approve ask's answer, carried out: run once when approved, and the caller told either way. */
  const carryOut = async (ask: AskRecord, asked: Approve): Promise<void> => {
    const { tool, input } = asked;
    const asker = deps.instance(ask.instanceId);
    if (ask.answer?.result.behavior !== "allow") {
      if (asker) {
        deps.declined(tool, input, asker);
      }
      tellAnswered(ask);
      return;
    }
    console.log(
      `[asks] ${tool} (${ask.id}) approved; the hub runs it for ${ask.instanceId}`
    );
    const stale = asker ? await deps.stale(ask) : undefined;
    if (asker && stale !== undefined) {
      const ended = deps.asks.carried(ask.id, {
        at: Date.now(),
        failed: stale,
      });
      tellAnswered(ended ?? ask);
      await askAgain(ask, asked, asker);
      return;
    }
    let end: { said: string } | { failed: string };
    try {
      if (!asker) {
        throw new Error("The session that asked is gone; nothing changed.");
      }
      end = { said: await deps.run(tool, input, asker) };
    } catch (error) {
      end = { failed: error instanceof Error ? error.message : String(error) };
    }
    const ended = deps.asks.carried(ask.id, { at: Date.now(), ...end });
    tellAnswered(ended ?? ask);
  };

  /**
   * Whether `instanceId` is in Full Send now, as its row reads at this
   * moment: never a row a caller read before an await, which a mode filed
   * meanwhile (a mode control's receipt, a relaunch in it) has moved past.
   */
  const inFullSend = (instanceId: string): boolean =>
    deps.instance(instanceId)?.permissionMode === FULL_SEND;

  /**
   * Records `name(input)` from `actor` as the person's ask, with its
   * source's facts, and answers the words its session reads.
   */
  const record = (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>,
    source: SourceFacts | undefined,
    toolUseId?: string
  ): string => {
    const ask: AskRecord = {
      id: newAskId(),
      instanceId: actor.id,
      state: "open",
      raisedAt: Date.now(),
      asked: {
        kind: "approve",
        tool: name,
        input,
        carry: { by: "hub", tool: name },
        ...(source ? { source } : {}),
      },
      ...(toolUseId ? { toolUseId } : {}),
    };
    deps.asks.add(ask);
    deps.park(askEnvelope(ask, actor));
    console.log(
      `[asks] ${actor.id} asks the person to approve ${name} (${ask.id})`
    );
    return askRecordedWords({ id: ask.id, link: askLink(ask) });
  };

  /**
   * `name(input)` from `actor`, decided on its session's mode with no await
   * between that read and the record: undefined when the session is in
   * Full Send now (approved: the caller runs it), else recorded as the
   * person's ask, answering the words its session reads. A mode filed
   * before this step is the one read here; one filed after it finds the
   * ask open and approves it ({@link fullSendFiled}). So an admin write of
   * a session in Full Send never waits on the person, however recently the
   * mode was set and whichever door the call came in by.
   */
  const put = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>,
    toolUseId?: string
  ): Promise<string | undefined> => {
    const source = inFullSend(actor.id)
      ? undefined
      : await deps.sourceFacts(name, input);
    if (inFullSend(actor.id)) {
      const why =
        typeof input.reason === "string" ? `: ${input.reason.trim()}` : "";
      console.log(
        `[asks] ${actor.id} runs ${name}, approved by Full Send${why}`
      );
      return;
    }
    return record(actor, name, input, source, toolUseId);
  };

  /**
   * Records `actor`'s question for the person, parks it on every screen and
   * push (which tells a delegate's parent), and answers the words its
   * session reads. Refuses one identical to a question of the session's still open.
   */
  const question = (
    actor: InstanceRow,
    asked: AskedQuestion,
    toolUseId?: string
  ): string => {
    const same = canonicalJson(asked.questions);
    const open = deps.asks
      .openOf(actor.id)
      .find(
        (one) =>
          one.asked.kind === "question" &&
          canonicalJson(one.asked.questions) === same
      );
    if (open) {
      throw new Error(
        `You already asked this as ${askLink(open)}; its answer comes as a message.`
      );
    }
    const ask: AskRecord = {
      id: newAskId(),
      instanceId: actor.id,
      state: "open",
      raisedAt: Date.now(),
      asked,
      ...(toolUseId ? { toolUseId } : {}),
    };
    deps.asks.add(ask);
    deps.park(askEnvelope(ask, actor));
    console.log(
      `[asks] ${actor.id} asks the person a question (${ask.id}, ${asked.blocks ? "blocks work" : "work goes on"})`
    );
    return askQuestionWords(askLink(ask), asked);
  };

  /**
   * A stale ask ({@link AsksDeps.stale}) put to the person again, with
   * what its source holds now, and its session told; or told why it can't be.
   */
  const askAgain = async (
    ask: AskRecord,
    asked: Approve,
    asker: InstanceRow
  ) => {
    const { tool, input } = asked;
    let said: string;
    try {
      const bound = await deps.bind(asker, tool, input);
      const recorded = await put(asker, tool, bound);
      said =
        recorded === undefined
          ? `Full Send approved it again for what it holds now and the hub ran it, so don't call ${tool} again for it. It said:\n\n${await deps.run(tool, bound, asker)}`
          : `CawCo has asked the person again for what it holds now, so don't call ${tool} again for it. ${recorded}`;
    } catch (error) {
      said = `It can't be asked again: ${error instanceof Error ? error.message : String(error)}`;
    }
    deps.tell(ask.instanceId, said, ASK_ORIGIN);
  };

  /**
   * An answer to the hub's own ask `id`: taken once, off every screen, then
   * carried out. Throws when it was answered or withdrawn already; false
   * when `id` is no ask the hub owns.
   */
  const take = (
    id: string,
    result: PermissionResult,
    from: AnswerFrom
  ): boolean => {
    const asked = deps.asks.get(id)?.asked;
    if (!asked) {
      return false;
    }
    let kept: AskResult;
    if (asked.kind === "question") {
      kept = questionResult(asked, result);
    } else if (result.behavior === "allow") {
      kept = { behavior: "allow" };
    } else {
      kept = { behavior: "deny", message: result.message };
    }
    const taken = deps.asks.answer(id, {
      at: Date.now(),
      by: { ...from, behavior: result.behavior },
      result: kept,
    });
    if (!taken) {
      return false;
    }
    if (taken.kind === "closed") {
      throw new Error(askClosedWords(taken.ask));
    }
    deps.settle(id, { answer: { ...from, behavior: result.behavior } });
    // A question runs nothing, nor does a permit, whose session makes the
    // call itself: either is told the answer.
    if (taken.ask.asked.kind === "approve") {
      detach(carryOut(taken.ask, taken.ask.asked), `ask ${id}`);
    } else {
      tellAnswered(taken.ask);
    }
    return true;
  };

  /** An open ask withdrawn by the hub, and taken off every screen; the session is not told. */
  const withdraw = (ask: AskRecord, why: string): void => {
    if (deps.asks.withdraw(ask.id, Date.now(), why)) {
      console.log(`[asks] ${named(ask)} (${ask.id}) withdrawn: ${why}`);
      deps.settle(ask.id, { cut: why });
    }
  };

  return {
    /**
     * Records `name(input)` from `actor` as the person's ask and answers what
     * the call says at once: recorded, and how the answer reaches it. The
     * ask carries the tool call it gates (`toolUseId`, Claude Code's
     * `_meta`), so it is drawn and answered in its session. An admin write without a reason is refused before
     * anything is recorded ({@link askRefusal}); one with a reason is
     * recorded with its source's facts. Undefined for a session in Full
     * Send: approved at once, it runs now.
     */
    async ask(
      actor: InstanceRow,
      name: string,
      input: Record<string, unknown>,
      toolUseId?: string
    ): Promise<string | undefined> {
      const refusal = askRefusal(name, input);
      if (refusal) {
        throw new Error(refusal);
      }
      return await put(actor, name, input, toolUseId);
    },

    /**
     * The person's answer, when `id` is an ask the hub owns: taken once, off
     * every screen, then carried out. Throws when it was answered or
     * withdrawn already; false for every other ask.
     */
    answer(id: string, result: PermissionResult, from: AnswerFrom): boolean {
      return take(id, result, from);
    },

    /**
     * `instanceId`'s permission mode was filed (a mode control's receipt,
     * its harness's own word, a start or relaunch in it): when its row reads
     * Full Send, every approval it has open is approved by Full Send and
     * carried out, as one it asks from now on runs at once ({@link put}). A
     * question stays the person's, and so does a permit for one.
     */
    fullSendFiled(instanceId: string): void {
      if (!inFullSend(instanceId)) {
        return;
      }
      for (const ask of deps.asks.openOf(instanceId)) {
        const { asked } = ask;
        if (
          asked.kind === "question" ||
          (asked.kind === "permit" && asked.tool === ASK_USER_QUESTION)
        ) {
          continue;
        }
        console.log(
          `[asks] ${instanceId} is in Full Send: its open ${asked.tool} (${ask.id}) is approved by Full Send`
        );
        try {
          take(ask.id, { behavior: "allow" }, FULL_SEND_ANSWER);
        } catch (error) {
          // Answered by the person in the same moment: theirs stands.
          console.log(
            `[asks] ${ask.id} was not approved by Full Send: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    },

    /**
     * A harness's permission prompt whose process went before the person
     * answered, kept as the hub's own ask under the same request id, so the
     * same card stays on every screen and push, and its session parks on it.
     * The prompt's own frame is replaced, not settled; a prompt routed to
     * its session's parent stays routed there.
     */
    keep(prompt: Envelope, asker: InstanceRow): void {
      const { raisedAt, routedTo, toolUseId } = prompt.payload as {
        raisedAt?: number;
        routedTo?: string;
        toolUseId?: string;
      };
      const asked = callOf(prompt);
      const ask: AskRecord = {
        id: prompt.requestId ?? newAskId(),
        instanceId: asker.id,
        state: "open",
        raisedAt: raisedAt ?? Date.now(),
        asked,
        ...(routedTo === "parent" ? { routedTo } : {}),
        ...(toolUseId ? { toolUseId } : {}),
      };
      deps.asks.add(ask);
      deps.park(askEnvelope(ask, asker));
      console.log(
        `[asks] ${asker.id}'s process went while its ${asked.tool} prompt waited on the person (${ask.id}): kept`
      );
    },

    /**
     * Whether a prompt from `asker`'s harness is a call the person already
     * approved as a permit: its grant spent, the call is allowed once. A
     * prompt for the same call with no grant takes the open permit's place,
     * which is withdrawn: the live prompt is the one to answer.
     */
    granted(asker: InstanceRow, prompt: Envelope): boolean {
      const call = callOf(prompt);
      const permitted = (ask: AskRecord): boolean =>
        ask.asked.kind === "permit" && sameCall(ask.asked, call);
      const grant = deps.asks.grant(asker.id, permitted, Date.now());
      if (grant) {
        console.log(
          `[asks] ${asker.id} makes ${call.tool} again: allowed once by ${grant.id}`
        );
        return true;
      }
      for (const ask of deps.asks.openOf(asker.id)) {
        if (permitted(ask)) {
          withdraw(ask, ASKED_AGAIN_WHY);
        }
      }
      return false;
    },

    /**
     * As the hub comes back: an approved call it was running when it went
     * is told to its session as cut short and never run again, and the open
     * asks of sessions that ended meanwhile are withdrawn.
     */
    boot(): void {
      for (const ask of deps.asks.cutShort()) {
        const ended = deps.asks.carried(ask.id, {
          at: Date.now(),
          failed: HUB_RESTARTED,
        });
        console.log(
          `[asks] ${named(ask)} (${ask.id}) was running when the hub went; not run again`
        );
        tellAnswered(ended ?? ask);
      }
      for (const ask of deps.asks.open()) {
        if (deps.ended(ask.instanceId)) {
          withdraw(ask, ENDED_WHY);
        }
      }
    },

    /**
     * A turn of `instanceId` ended, by its result or by its process going
     * mid-turn: every approved permit whose answer that turn read lapses
     * unspent. The turn that reads an answer is the one running when its
     * send is read: the turn the answer started in a session at rest, or
     * the running turn it reached at its next step. A grant whose answer is
     * still unread (owed to a process not yet up, or to the turn after)
     * stays. Its message's line in the person's transcript says it lapsed;
     * the session is not told, and the call asks the person again.
     */
    turnEnded(instanceId: string): void {
      const lapsed = deps.asks.lapse(
        instanceId,
        (ask) => deps.answerRead(answerSend(ask.id)),
        Date.now()
      );
      for (const ask of lapsed) {
        console.log(
          `[asks] ${named(ask)} (${ask.id}) lapsed unspent as ${instanceId}'s turn ended`
        );
        deps.reline(
          answerSend(ask.id),
          noticeWords.askAnswered[askOutcome(ask)]
        );
      }
    },

    /**
     * `instanceId`'s open asks withdrawn when it ended for good (stopped,
     * its workspace archived, stranded, or gone); kept through anything
     * else: its process ending, a restart, a finished turn.
     */
    withdrawEnded(instanceId: string): void {
      const open = deps.asks.openOf(instanceId);
      if (open.length === 0 || !deps.ended(instanceId)) {
        return;
      }
      for (const ask of open) {
        withdraw(ask, ENDED_WHY);
      }
    },

    /** `ask`, bound to the calling session (none for a listing). */
    tools(actor: InstanceRow | undefined, toolUseId?: string) {
      return [
        mcpTool(
          "ask",
          ASK_DESCRIPTION,
          {
            questions: z
              .array(UserQuestionShape)
              .min(1)
              .max(QUESTIONS_MAX)
              .describe(
                "Related questions asked as one, answered one at a time in a row: each a question, a short header, and its options (label, description); multiSelect when several may be picked."
              ),
            blocks: z
              .boolean()
              .describe(
                "true when work waits on the answer; false when you go ahead meanwhile."
              ),
            waiting: z
              .string()
              .trim()
              .min(1)
              .max(STANCE_MAX)
              .optional()
              .describe(
                'With blocks: what is paused until they answer, e.g. "Deleting the /v1 routes and the API docs".'
              ),
            meanwhile: z
              .string()
              .trim()
              .min(1)
              .max(STANCE_MAX)
              .optional()
              .describe(
                'Without blocks: what you go ahead with meanwhile, your assumption, e.g. "Going ahead with 90 days, then 410".'
              ),
          },
          ({ questions, blocks, waiting, meanwhile }) => {
            if (!actor) {
              throw new Error("Discovery cannot execute tools");
            }
            if (blocks && !waiting) {
              throw new Error(
                "A question that blocks work names what is paused in `waiting`; nothing was asked."
              );
            }
            if (!(blocks || meanwhile)) {
              throw new Error(
                "A question work goes on past says what you go ahead with in `meanwhile`; nothing was asked."
              );
            }
            return Promise.resolve(
              question(
                actor,
                {
                  kind: "question",
                  questions,
                  blocks,
                  ...(blocks ? { waiting } : { meanwhile }),
                },
                toolUseId
              )
            );
          },
          sentence
        ),
      ];
    },
  };
};

export type Asks = ReturnType<typeof createAsks>;
