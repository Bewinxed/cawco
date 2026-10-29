/**
 * Admin writes ask the person (Projects spec §5.3: "admin tools split
 * read/write and writes ask you"). Whatever door an `admin_*_write` call
 * comes in by — MCP from any harness, the REST door, `cawco tool` — and
 * `project_settings`, opening a relay or installing a build when they ask,
 * the hub records it as the calling session's `approve` ask (core asks.ts,
 * its `asks` row), naming the exact tool and arguments, and the call answers
 * at once ({@link askRecordedWords}): nothing on the session's side waits,
 * so no agent, gateway or hub restart cuts it. The ask reaches every screen
 * and push as a `permission_request` (pending.ts `askEnvelope`).
 *
 * The person's answer is taken once, in one write with the start of what it
 * carries; a second is refused. Approved, the hub runs the call once, as
 * the session that asked, with the arguments that were shown
 * ({@link carryOut}); denied, nothing runs. Either way the session is told
 * under {@link ASK_ORIGIN}, which reaches it as the person's own words do,
 * waking it when it is at rest. A hub that went while running one tells the
 * session so as it comes back, and never runs it again.
 *
 * The ask is the session's for as long as the session may act: it stays
 * through its process ending, its agent or the hub restarting, and is
 * withdrawn when the session is stopped, its workspace archived, or no one
 * can give it a turn again ({@link withdrawEnded}).
 *
 * Only the person answers it: a parent's `answer_delegate` is refused
 * (server.ts). A session in Full Send is never asked (the owner, 2026-10-22:
 * "FULL SEND LITERALLY MEANS FULL SEND"): its write still needs its
 * `reason`, then runs at once, approved by Full Send, with the same record
 * an approved ask leaves in the hub's log, saying Full Send approved it.
 * Nothing is recorded, so no screen holds it. Every other mode asks.
 */
import type {
  Envelope,
  InstanceRow,
  PermissionMode,
  PermissionResult,
  SourceFacts,
} from "@cawco/core";
import {
  ASK_ORIGIN,
  type AskRecord,
  askAnsweredText,
  askClosedWords,
  askRecordedWords,
  HUB_RESTARTED,
  isAdminWrite,
  newAskId,
} from "@cawco/core/asks";
import { detach } from "@cawco/core/detach";
import { sessionLink } from "@cawco/core/references";
import type { DbShape } from "./db";
import type { AnswerFrom } from "./pending";
import { askEnvelope } from "./pending";

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

export interface AdminAsksDeps {
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
  /** Puts an ask on every screen and push (server.ts `parkForPerson`). */
  readonly park: (envelope: Envelope) => void;
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
  /** Says something to a session, as the hub, under `origin`. */
  readonly tell: (instanceId: string, text: string, origin: string) => void;
  /** The thread a project's Caw asks in (caw.ts `askThread`); undefined for any other session. */
  readonly threadOf: (actor: InstanceRow) => string | undefined;
}

/** Why a session's ask goes unanswered when it ends. */
const ENDED_WHY = "its session ended before you answered";

export const createAdminAsks = (deps: AdminAsksDeps) => {
  /** The answer's message, to the session that asked now (a fold moves its row). */
  const tellAnswered = (ask: AskRecord): void =>
    deps.tell(ask.instanceId, askAnsweredText(ask), ASK_ORIGIN);

  /** An answer, carried out: run once when approved, and the caller told either way. */
  const carryOut = async (ask: AskRecord): Promise<void> => {
    const { tool, input } = ask.asked;
    const asker = deps.instance(ask.instanceId);
    if (ask.answer?.result.behavior !== "allow") {
      if (asker) {
        deps.declined(tool, input, asker);
      }
      tellAnswered(ask);
      return;
    }
    console.log(
      `[admin-asks] ${tool} (${ask.id}) approved; the hub runs it for ${ask.instanceId}`
    );
    const stale = asker ? await deps.stale(ask) : undefined;
    if (asker && stale !== undefined) {
      const ended = deps.asks.carried(ask.id, {
        at: Date.now(),
        failed: stale,
      });
      tellAnswered(ended ?? ask);
      await askAgain(ask, asker);
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
   * Records `name(input)` from `actor` as the person's ask, with its
   * source's facts, and answers the words its session reads.
   */
  const record = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>,
    toolUseId?: string
  ): Promise<string> => {
    const source = await deps.sourceFacts(name, input);
    const threadId = deps.threadOf(actor);
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
      ...(threadId ? { threadId } : {}),
      ...(toolUseId ? { toolUseId } : {}),
    };
    deps.asks.add(ask);
    deps.park(askEnvelope(ask, actor));
    console.log(
      `[admin-asks] ${actor.id} asks the person to approve ${name} (${ask.id})`
    );
    return askRecordedWords({
      id: ask.id,
      link: sessionLink(threadId ?? actor.id, `approval of ${name}`),
    });
  };

  /**
   * A stale ask ({@link AdminAsksDeps.stale}) put to the person again, with
   * what its source holds now, and its session told; or told why it can't be.
   */
  const askAgain = async (ask: AskRecord, asker: InstanceRow) => {
    const { tool, input } = ask.asked;
    let said: string;
    try {
      const recorded = await record(
        asker,
        tool,
        await deps.bind(asker, tool, input)
      );
      said = `CawCo has asked the person again for what it holds now, so don't call ${tool} again for it. ${recorded}`;
    } catch (error) {
      said = `It can't be asked again: ${error instanceof Error ? error.message : String(error)}`;
    }
    deps.tell(ask.instanceId, said, ASK_ORIGIN);
  };

  /** An open ask withdrawn by the hub, and taken off every screen; the session is not told. */
  const withdraw = (ask: AskRecord, why: string): void => {
    if (deps.asks.withdraw(ask.id, Date.now(), why)) {
      console.log(
        `[admin-asks] ${ask.asked.tool} (${ask.id}) withdrawn: ${why}`
      );
      deps.settle(ask.id, { cut: why });
    }
  };

  return {
    /**
     * Records `name(input)` from `actor` as the person's ask and answers what
     * the call says at once: recorded, and how the answer reaches it. A
     * project's Caw asks in his thread: the ask carries it, and the tool call
     * it gates (`toolUseId`, Claude Code's `_meta`), so it is drawn and
     * answered there. An admin write without a reason is refused before
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
      if (actor.permissionMode === FULL_SEND) {
        const why =
          typeof input.reason === "string" ? `: ${input.reason.trim()}` : "";
        console.log(
          `[admin-asks] ${actor.id} runs ${name}, approved by Full Send${why}`
        );
        return;
      }
      return await record(actor, name, input, toolUseId);
    },

    /**
     * The person's answer, when `id` is an ask the hub owns: taken once, off
     * every screen, then carried out. Throws when it was answered or
     * withdrawn already; false for every other ask.
     */
    answer(id: string, result: PermissionResult, from: AnswerFrom): boolean {
      const at = Date.now();
      const taken = deps.asks.answer(id, {
        at,
        by: { ...from, behavior: result.behavior },
        result:
          result.behavior === "allow"
            ? { behavior: "allow" }
            : { behavior: "deny", message: result.message },
      });
      if (!taken) {
        return false;
      }
      if (taken.kind === "closed") {
        throw new Error(askClosedWords(taken.ask));
      }
      deps.settle(id, { answer: { ...from, behavior: result.behavior } });
      detach(carryOut(taken.ask), `admin ask ${id}`);
      return true;
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
          `[admin-asks] ${ask.asked.tool} (${ask.id}) was running when the hub went; not run again`
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
  };
};
