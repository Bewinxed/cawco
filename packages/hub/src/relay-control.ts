import { RESOLVE_PERMISSION, WITHDRAW_PERMISSION } from "@cawco/core/ask-tools";
import type { AskAnswer } from "@cawco/core/asks";
import { detach } from "@cawco/core/detach";
import type { PermissionRequestFrame } from "@cawco/core/frames";
import { isEffortLevel } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type {
  ControlPayload,
  Envelope,
  InstanceRow,
  SendPayload,
} from "@cawco/core/protocol";
import { questionsOf } from "@cawco/core/question";
import {
  CONTROL_INTERRUPT,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
} from "@cawco/core/session/controls";
import type { PermissionResult } from "@cawco/core/session-messages";
import {
  STAGE_COMPONENTS,
  STAGE_ENSURE,
  STAGE_RENDER,
  STAGE_WARM,
  STAGE_WRITE,
} from "@cawco/core/stage";
import { unshownAskMessage } from "@cawco/core/words/ask-lines";
import { turnCutWords } from "@cawco/core/words/cuts";
import { turnWords } from "@cawco/core/words/turns";
import {
  CONTROL_HOST_OUTPUTS,
  CONTROL_HOST_SCRATCH_REMOVE,
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_COPY,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_WRITE,
  CONTROL_WORKSPACE_APPLY,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CHANGES,
  CONTROL_WORKSPACE_CLONES,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_OUTPUTS,
  CONTROL_WORKSPACE_SAVE,
  CONTROL_WORKSPACE_WORK_END,
} from "@cawco/core/workspace/controls";
import { ElysiaStatus } from "elysia";
import { answeredWithOriginal } from "./ask-presentation";
import { peek } from "./cut-turns";
import type { HubContext } from "./hub-context";
import type { ControlResult } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import type { AnswerFrom } from "./pending";
import { answerPermission } from "./pending";
import type { AnyProblem } from "./refusal";
import { unreachable } from "./unreachable";
import type { HubSocket } from "./wire-socket";

/** Workspace controls only the hub sends: a dashboard's control naming one is refused at the relay. */
const HUB_WORKSPACE_CONTROLS: ReadonlySet<string> = new Set([
  CONTROL_WORKSPACE_SAVE,
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_COPY,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_WRITE,
  CONTROL_WORKSPACE_APPLY,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CHANGES,
  CONTROL_WORKSPACE_CLONES,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_OUTPUTS,
  CONTROL_WORKSPACE_WORK_END,
  CONTROL_HOST_OUTPUTS,
  CONTROL_HOST_SCRATCH_REMOVE,
]);
/**
 * Stage controls only the hub sends (`onStage`), with the workspace or place
 * it resolved for the session or sheet: one a dashboard sent would start the
 * project's own toolchain, or write files, at whatever path it named.
 */
const HUB_STAGE_CONTROLS: ReadonlySet<string> = new Set([
  STAGE_COMPONENTS,
  STAGE_ENSURE,
  STAGE_RENDER,
  STAGE_WARM,
  STAGE_WRITE,
]);
/** Why a dashboard's control naming `method` is the hub's alone, or nothing when it may go to the machine. */
const hubOwnedControl = (method: string): string | undefined => {
  if (method === CONTROL_RELOAD_SKILLS) {
    return "Skills reload when synced fleet content changes.";
  }
  if (HUB_WORKSPACE_CONTROLS.has(method)) {
    return `${method} is the hub's to send. A workspace retires on its own once its work lands; a held one is discarded with POST /api/workspaces/:id/archive and discard: true.`;
  }
  if (HUB_STAGE_CONTROLS.has(method)) {
    return `${method} is the hub's to send. A stage runs where the hub places it, for a session's component canvas or design_map.`;
  }
};

/** The first argument of a `control` of `method`, when it is a string. */
const peekControlArg = (
  payload: unknown,
  method: string
): string | undefined => {
  if (peek(payload, "method") !== method) {
    return undefined;
  }
  const { args } = payload as { args?: unknown };
  const id = Array.isArray(args) ? args[0] : undefined;
  return typeof id === "string" ? id : undefined;
};

/** A `control` answering a permission, and the ask it answers with what it says. */
export const peekAnswer = (
  payload: unknown
): { requestId: string; result: unknown } | undefined => {
  if (peek(payload, "method") !== RESOLVE_PERMISSION) {
    return undefined;
  }
  const { args } = payload as { args?: unknown };
  if (!Array.isArray(args) || typeof args[0] !== "string") {
    return undefined;
  }
  return { requestId: args[0], result: args[1] };
};

export type RelayControlContext = Pick<
  HubContext,
  | "accountProviderFor"
  | "answeredFrom"
  | "answeringPermissions"
  | "browserAsks"
  | "byIdNow"
  | "callAgent"
  | "claimAccount"
  | "connectAsks"
  | "cutTurn"
  | "db"
  | "deliverSend"
  | "designSystem"
  | "endSession"
  | "forward"
  | "hubAsks"
  | "installArgs"
  | "installAsk"
  | "machineFault"
  | "moves"
  | "noteInterrupt"
  | "notifications"
  | "owedMoves"
  | "ownsPermission"
  | "pending"
  | "pendingInstalls"
  | "projectMemory"
  | "publishInstances"
  | "recordDelegateAnswer"
  | "registry"
  | "relaunchOnAccount"
  | "sendFrame"
  | "sessionIdle"
  | "silentWords"
  | "streams"
>;

export const createRelayControl = (ctx: RelayControlContext) => {
  /**
   * A dashboard's `send` command, taken: the one send path, and a log line.
   * Its record — pending, or failed with why — is the answer every tab hears.
   */
  const relaySend = (message: Envelope<SendPayload>): void => {
    // Provenance (NEW.md, cross-session delivery incident): which tab it
    // believed it was sending from. It is the one thing that makes "a send
    // landed on the wrong session" provable after the fact instead of merely
    // suspected.
    // `presenceId` is the tab's presence, cut as the `[presence]` lines cut
    // it: the send reads against what that tab said it had in front.
    const { provenance } = message.payload;
    // The person's own words are their input, on the device they came
    // from, before the send is handed on: its presence line, and the recap
    // of a return, read them.
    if (message.payload.message.origin.kind === "human") {
      ctx.notifications.spoke(
        provenance?.presenceId,
        message.payload.instanceId
      );
    }
    const record = ctx.deliverSend(message);
    const taken =
      record instanceof ElysiaStatus
        ? `not taken: ${record.response.detail}`
        : (record?.state ?? "not taken");
    console.log(
      `[hub] send -> ${message.payload.instanceId} (${taken})${
        provenance
          ? ` client ${provenance.clientId ?? "?"} presence ${provenance.presenceId?.slice(0, 8) ?? "?"}`
          : ""
      }`
    );
  };

  /**
   * A dashboard's `control`, whole: relay it, route its reply back, settle
   * whatever the call answers (a parked permission, a delegate's ask, a tool
   * cell, a fleet sync). Extracted for the same reason as {@link relaySend}.
   *
   * `replyAsFrame`: a dashboard's `control` verb is answered with a
   * `control_result` frame on its socket; a command envelope (stream.ts, the
   * five control kinds a command carries) is answered by settling that
   * command, and a frame too would report the same outcome twice.
   */
  /**
   * One answer transaction for dashboards, the app and parent tools. The
   * machine's receipt and the ledger's settlement must both precede success.
   * `from` is where it was given, said to every screen with the ask's end.
   */
  const answerPendingPermission = async (
    instanceId: string,
    requestId: string,
    answer: PermissionResult,
    from: AnswerFrom
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction validates ownership, hub-raised answers, delivery receipts and concurrent process death before reporting success.
  ): Promise<AnyProblem | undefined> => {
    // An ask the hub owns (asks.ts), named by its id alone: taken once
    // from its row, which runs what it asked as it was shown; a second
    // answer is refused there, saying who gave the first and when. One told
    // to the asker's parent (a question, a routed permit) is filed as its
    // answer there too, as a live prompt's is below.
    if (ctx.hubAsks.answer(requestId, answer, from)) {
      const [asker] = ctx.db.getInstancesByIds([
        ctx.db.asks.get(requestId)?.instanceId ?? "",
      ]);
      if (asker) {
        ctx.recordDelegateAnswer(asker.machineId, asker.id, requestId, answer);
      }
      return;
    }
    const parked = ctx.pending.get(requestId);
    if (!parked || parked.instanceId !== instanceId) {
      throw new Error("That request is no longer pending.");
    }
    // Clients held the ask with its secrets hidden; the call runs as asked.
    const result = answeredWithOriginal(parked, answer);
    if (ctx.answeringPermissions.has(requestId)) {
      throw new Error("That request is already being answered.");
    }
    const receipt: { answer: AskAnswer; outcome?: "answered" | "cancelled" } = {
      answer: { ...from, behavior: result.behavior },
    };
    ctx.answeringPermissions.set(requestId, receipt);
    try {
      // A memory proposal (memory.ts): applied or rejected here, its ask
      // settled once that is done; one that no longer applies stays parked.
      // It reads the person's own answer: the files they edited in the
      // card's diff (`updatedInput.edits`) are theirs, the proposal itself
      // the hub's kept file, never the client's copy.
      if (ctx.projectMemory.owns(requestId)) {
        const refused = await ctx.projectMemory.answer(requestId, answer);
        if (refused) {
          return refused;
        }
        if (receipt.outcome !== "answered") {
          throw new Error("That request is no longer pending.");
        }
        return;
      }
      // A design proposal (design-system.ts): written and committed, or
      // declined, its session told either way.
      if (ctx.designSystem.owns(requestId)) {
        const failed = await ctx.designSystem.answer(requestId, result);
        if (failed) {
          return failed;
        }
        if (receipt.outcome !== "answered") {
          throw new Error("That request is no longer pending.");
        }
        return;
      }
      // A browser ask (browser-tools.ts): a Decline answers its call; an
      // Approve is refused with the sentence saying to take over.
      if (ctx.browserAsks.owns(requestId)) {
        await ctx.browserAsks.answer(requestId, result);
        if (receipt.outcome !== "answered") {
          throw new Error("That request is no longer pending.");
        }
        return;
      }
      // A connect ask (connect-asks.ts): Not now answers its call; an
      // Approve is refused with the sentence saying to connect.
      if (ctx.connectAsks.owns(requestId)) {
        await ctx.connectAsks.answer(requestId, result);
        if (receipt.outcome !== "answered") {
          throw new Error("That request is no longer pending.");
        }
        return;
      }
      // A hub-raised ask is settled here, never delivered to a machine: a
      // move.
      if (ctx.moves.answer(requestId, result)) {
        if (receipt.outcome !== "answered") {
          throw new Error("That request is no longer pending.");
        }
        return;
      }
      if (!ctx.ownsPermission(parked)) {
        ctx.pending.resolve(requestId, "cancelled");
        throw new Error("That request is no longer pending.");
      }
      const delivered = await ctx.callAgent(
        parked.machineId,
        RESOLVE_PERMISSION,
        [requestId, result],
        READ_TIMEOUT_MS,
        undefined,
        instanceId
      );
      switch (delivered.kind) {
        case "unanswered":
          throw new Error(
            delivered.reason === "dead"
              ? ctx.machineFault(parked.machineId, "offline")
              : `Permission answer got no reply: ${ctx.silentWords(parked.machineId, delivered)}.`
          );
        case "answered":
          if (!delivered.value.ok) {
            throw new Error(
              delivered.value.error ?? "The session refused the answer."
            );
          }
          break;
        default:
          throw unreachable(delivered);
      }
      if (receipt.outcome === "cancelled" || !ctx.ownsPermission(parked)) {
        ctx.pending.resolve(requestId, "cancelled");
        throw new Error("That request is no longer pending.");
      }
      ctx.pending.resolve(requestId);
      if (receipt.outcome !== "answered") {
        throw new Error("That request is no longer pending.");
      }
      ctx.recordDelegateAnswer(parked.machineId, instanceId, requestId, result);
    } finally {
      ctx.answeringPermissions.delete(requestId);
    }
  };

  /** A prompt a permit granted, allowed at its process as asked; said in the log either way. */
  const allowGranted = async (ask: Envelope): Promise<void> => {
    const requestId = ask.requestId ?? "";
    const { input } = ask.payload as Partial<PermissionRequestFrame>;
    const allowed = await ctx.callAgent(
      ask.machineId,
      RESOLVE_PERMISSION,
      [requestId, { behavior: "allow", updatedInput: input ?? {} }],
      READ_TIMEOUT_MS,
      undefined,
      ask.instanceId
    );
    let said: string;
    switch (allowed.kind) {
      case "unanswered":
        said = ctx.silentWords(ask.machineId, allowed);
        break;
      case "answered":
        said = allowed.value.ok
          ? "allowed"
          : (allowed.value.error ?? "the machine refused it");
        break;
      default:
        throw unreachable(allowed);
    }
    console.log(
      `[hub] granted call session=${ask.instanceId ?? "none"} request=${requestId}: ${said}`
    );
  };

  /**
   * An ask admission refused (`askRefusal`) is taken back from the process
   * that asked it: denied in words saying it could not be shown and why, so
   * its turn goes on instead of waiting on a question nobody was shown.
   */
  const withdrawUnshown = async (ask: Envelope, why: string): Promise<void> => {
    const requestId = ask.requestId ?? "";
    const { toolName, input } = ask.payload as Partial<PermissionRequestFrame>;
    const question = questionsOf(toolName ?? "", input ?? {}) !== null;
    const withdrawn = await ctx.callAgent(
      ask.machineId,
      WITHDRAW_PERMISSION,
      [requestId, unshownAskMessage(question, why)],
      READ_TIMEOUT_MS,
      undefined,
      ask.instanceId
    );
    let said: string;
    switch (withdrawn.kind) {
      case "unanswered":
        said = ctx.silentWords(ask.machineId, withdrawn);
        break;
      case "answered":
        said = withdrawn.value.ok
          ? "the session was told and goes on"
          : (withdrawn.value.error ?? "the machine refused it");
        break;
      default:
        throw unreachable(withdrawn);
    }
    console.log(
      `[hub] ask withdrawn session=${ask.instanceId ?? "none"} request=${requestId}: ${said}`
    );
  };

  const relayPermissionAnswer = (
    message: Envelope<ControlPayload>,
    dashboard: HubSocket,
    replyAsFrame: boolean
  ): boolean => {
    const answer = peekAnswer(message.payload);
    if (message.payload.method !== RESOLVE_PERMISSION) {
      return false;
    }
    // The correlation id belongs to the control; args[0] belongs to the ask.
    // A receipt is sent only after delivery AND the pending ledger settlement.
    answerPermission(
      ctx.pending,
      message.instanceId ?? message.payload.instanceId ?? "",
      answer?.requestId ?? "",
      answer?.result as PermissionResult,
      ctx.answeredFrom(dashboard)
    ).then(
      (refused) =>
        refused
          ? failed(refused.response.detail)
          : reply({
              kind: "control_result",
              requestId: correlationId,
              ok: true,
            }),
      (error: unknown) =>
        failed(error instanceof Error ? error.message : String(error))
    );
    const correlationId = message.requestId ?? message.payload.requestId;
    const reply = (frame: ControlResult): void => {
      if (replyAsFrame) {
        ctx.sendFrame(dashboard, {
          ...message,
          verb: "frames",
          payload: frame,
        });
      } else {
        ctx.streams.settleCommand(correlationId, frame);
      }
    };
    const failed = (reason: string): void => {
      console.error(
        `[hub] dashboard permission.answer ${answer?.requestId ?? "(no request)"} failed: ${reason}`
      );
      reply({
        kind: "control_result",
        requestId: correlationId,
        ok: false,
        error: reason,
      });
    };
    return true;
  };

  /**
   * A model change on a pi or OpenCode session that crosses into or out of
   * an account provider: not relayed to the running process, which would go
   * on reading the store it started on. The row takes the new model and the
   * account placement gives it (none for a model outside accounts), and the
   * session moves at the turn boundary: now when it is at rest, else when its
   * turn ends. Undefined when the change crosses nothing; a refusal when no
   * account can take the new model.
   */
  /** Whether moving a pi or OpenCode row to `model` changes the provider of the account it runs on (or none). */
  const crossesProvider = (
    row: InstanceRow | undefined,
    model: string
  ): row is InstanceRow => {
    if (!row || traitsOf(row.harness).soleProvider !== null) {
      return false;
    }
    const current = row.accountId
      ? ctx.db.accounts.get(row.accountId)?.provider
      : undefined;
    return (
      ctx.accountProviderFor(row.machineId, row.harness, model) !== current
    );
  };

  const crossModel = async (
    instanceId: string,
    model: string
  ): Promise<"crossed" | { refusal: string } | undefined> => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!crossesProvider(row, model)) {
      return undefined;
    }
    const next = ctx.accountProviderFor(row.machineId, row.harness, model);
    const placed = next
      ? ctx.claimAccount(row.machineId, { ...row, model })
      : { accountId: undefined };
    if ("refusal" in placed) {
      return placed;
    }
    ctx.db.patchInstance(row.id, {
      model,
      accountId: placed.accountId ?? null,
    });
    if (await ctx.sessionIdle(row)) {
      ctx.relaunchOnAccount(row.id);
    } else {
      ctx.owedMoves.set(row.id, { move: null, waits: "turn" });
    }
    return "crossed";
  };

  /**
   * A dashboard's model change that crosses an account provider
   * ({@link crossModel}): answered here, never relayed. False for every
   * other control, which goes on to the machine.
   */
  const relayModelCrossing = (
    message: Envelope<ControlPayload>,
    dashboard: HubSocket,
    replyAsFrame: boolean
  ): boolean => {
    const { instanceId, payload } = message;
    const asked = payload.args?.[0];
    if (
      payload.method !== CONTROL_SET_MODEL ||
      !instanceId ||
      typeof asked !== "string"
    ) {
      return false;
    }
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!crossesProvider(row, asked)) {
      return false;
    }
    const requestId = message.requestId ?? payload.requestId;
    const receipt = (frame: ControlResult): void => {
      if (replyAsFrame) {
        ctx.sendFrame(dashboard, {
          ...message,
          verb: "frames",
          payload: frame,
        });
      } else {
        ctx.streams.settleCommand(requestId, frame);
      }
    };
    // The receipt is sent when the move is decided, or when deciding it
    // threw: a move that failed says so on the command that asked for it.
    const move = crossModel(instanceId, asked).then(
      (crossed) => {
        receipt(
          crossed && crossed !== "crossed"
            ? {
                kind: "control_result",
                requestId,
                ok: false,
                error: crossed.refusal,
              }
            : { kind: "control_result", requestId, ok: true }
        );
        ctx.publishInstances(row.machineId);
      },
      (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(
          `[hub] dashboard set-model for ${instanceId} failed: ${reason}`
        );
        receipt({
          kind: "control_result",
          requestId,
          ok: false,
          error: reason,
        });
      }
    );
    detach(move, "model move");
    return true;
  };

  const relayControl = (
    asked: Envelope<ControlPayload>,
    dashboard: HubSocket,
    replyAsFrame = true
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transcript deletion shares the control receipt path but records intent before machine delivery
  ): boolean => {
    const message = ctx.byIdNow(asked);
    if (relayModelCrossing(message, dashboard, replyAsFrame)) {
      return true;
    }
    // The hub owns skill reloads: an unchanged catalog must retain the CLI's
    // sent-skills record, whoever asks to reload it.
    // It owns every workspace control too: archive and a move to another
    // commit delete a clone's work, and only the hub reads it first. And
    // every stage control: only the hub resolves where a stage may run.
    const hubOwned = hubOwnedControl(message.payload.method);
    if (hubOwned) {
      const requestId = message.requestId ?? message.payload.requestId;
      const frame: ControlResult = {
        kind: "control_result",
        requestId,
        ok: false,
        error: hubOwned,
      };
      if (replyAsFrame) {
        ctx.sendFrame(dashboard, {
          ...message,
          verb: "frames",
          payload: frame,
        });
      } else {
        ctx.streams.settleCommand(requestId, frame);
      }
      return true;
    }
    if (relayPermissionAnswer(message, dashboard, replyAsFrame)) {
      return true;
    }
    // A `control` asking a machine to delete a transcript names its session.
    const deleted = peekControlArg(message.payload, "deleteSession");
    if (deleted && ctx.registry.agent(message.machineId)) {
      const rows = ctx.db
        .sessionOwnership(message.machineId)
        .filter((row) => row.sessionId === deleted);
      // The person purges the session: an agent's find no longer answers
      // with it, and every note it wrote is proposed withdrawn (memory.ts
      // `purged`), whether or not the hub held it.
      ctx.db.find.purge(message.machineId, [deleted]);
      for (const row of rows) {
        if (row.projectId) {
          const what = `memory: notes of purged session ${row.id}`;
          detach(
            ctx.projectMemory.purged(row.projectId, row.id).then((purged) => {
              if (purged instanceof ElysiaStatus) {
                console.warn(`[${what}] failed: ${purged.response.detail}`);
              }
            }),
            what
          );
        }
      }
      if (rows.length > 0) {
        for (const row of rows) {
          ctx.endSession(row.id, "delete-transcript", { kind: "person" });
        }
        const requestId = message.requestId ?? message.payload.requestId;
        const frame: ControlResult = {
          kind: "control_result",
          requestId,
          ok: true,
        };
        if (replyAsFrame) {
          ctx.sendFrame(dashboard, {
            ...message,
            verb: "frames",
            payload: frame,
          });
        } else {
          ctx.streams.settleCommand(requestId, frame);
        }
        return true;
      }
    }
    const requestId = message.requestId ?? message.payload.requestId;
    // A press carries what the hub's own installs do (`installAsk`): the
    // fleet's pin as the hub holds it, whatever the pressing surface had,
    // else the release to reach, so a copy its updater leaves older answers
    // why and keeps its Retry. A press is no automatic update.
    const toolId = peekControlArg(message.payload, "installTool");
    const ask = toolId ? ctx.installAsk(toolId) : {};
    const { newest } = ask;
    const correlated = {
      ...message,
      requestId,
      ...(toolId
        ? {
            payload: {
              ...message.payload,
              args: ctx.installArgs(toolId, ask, false),
            },
          }
        : {}),
    };
    if (!ctx.forward(correlated, dashboard, replyAsFrame)) {
      return false;
    }
    // A per-cell install or retry, clicked rather than swept: the chip
    // turns on every dashboard, not only the one that clicked it.
    if (toolId && requestId) {
      ctx.pendingInstalls.set(requestId, {
        machineId: message.machineId,
        toolId,
        ...(newest ? { newest } : {}),
      });
      const updated = ctx.db.agentTools(message.machineId)[toolId]?.version;
      ctx.db.setAgentToolCell(message.machineId, {
        id: toolId,
        state: "installing",
        ...(updated ? { version: updated } : {}),
        at: Date.now(),
      });
      ctx.publishInstances(message.machineId);
    }
    noteControl(message);
    return true;
  };

  /** Every interrupt of a session's turn the hub sends, and who asked for it, in the log. */
  const saidInterrupt = (instanceId: string, by: string): void => {
    console.log(`${turnWords.interruptOpening(instanceId)} ${by}`);
  };

  /** A control that interrupts a session's turn cuts into it ({@link noteInterrupt}). */
  const noteControl = (message: Envelope<ControlPayload>): void => {
    // The operator's effort for the session, which every later launch of it
    // asks for ({@link bounded}); the CLI's reading of it only moves the chip.
    const effort = message.payload.args?.[0];
    if (
      message.payload.method === CONTROL_SET_EFFORT &&
      message.instanceId &&
      isEffortLevel(effort)
    ) {
      ctx.db.chooseEffort(message.instanceId, effort);
    }
    if (message.payload.method === CONTROL_INTERRUPT && message.instanceId) {
      // Who stopped the turn, as a send's line says who sent it: the tab it
      // came from, read against its presence's lines.
      const { provenance } = message.payload as {
        provenance?: { clientId?: string; presenceId?: string };
      };
      saidInterrupt(
        message.instanceId,
        provenance
          ? turnWords.fromScreenBy(
              provenance.clientId ?? "?",
              provenance.presenceId?.slice(0, 8) ?? "?"
            )
          : turnWords.fromScreen
      );
      ctx.noteInterrupt(message.instanceId);
      // The error closing that turn is the stop's receipt, on every screen,
      // and the call it cut says it was the person's Stop.
      ctx.cutTurn(message.instanceId, turnCutWords.stop);
    }
  };

  return {
    relaySend,
    answerPendingPermission,
    allowGranted,
    withdrawUnshown,
    relayControl,
    saidInterrupt,
  };
};
