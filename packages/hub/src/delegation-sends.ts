/**
 * A session's sends and starts through its MCP tools (delegation-mcp.ts):
 * the caller's row read fresh, then the hub's one send path (sends.ts
 * `sessionSend`), the one step that writes a send's inputs and sends it
 * (work-items.ts `handOff`), or a start held until the session is in place
 * (spawns.ts `spawnSession`); and what it carries out on its delegates
 * (`forward`): a send, an interrupt, or an answer to a delegate's ask.
 * delegation-mcp.ts and delegation-actions.ts type their deps from these.
 */

import { RESOLVE_PERMISSION } from "@cawco/core/ask-tools";
import type { HubEnvelope } from "@cawco/core/envelopes";
import type { PermissionMode } from "@cawco/core/harness/modes";
import type {
  ControlPayload,
  InstanceRow,
  SpawnPayload,
} from "@cawco/core/protocol";
import { CONTROL_INTERRUPT } from "@cawco/core/session/controls";

import { turnCutWords } from "@cawco/core/words/cuts";
import { delegateWaitWords } from "@cawco/core/words/delegates";
import { ElysiaStatus, problem } from "elysia";
import type { ClosureContext } from "./closure-context";
import type { DbShape } from "./db";
import type { createDelegateWaits } from "./delegate-waits";
import { sessionLabel } from "./labels";
import { awayProblem } from "./machine-answers";
import { answerPermission } from "./pending";
import {
  ANSWER_UNREAD,
  answerOfControl,
  type createRelayControl,
} from "./relay-control";
import type { createSends } from "./sends";
import { type createSpawns, peekParent } from "./spawns";
import { type HandoffInputs, mayStartRefusal } from "./work-items";

export type DelegationSendsDeps = Pick<
  ClosureContext,
  | "cutTurn"
  | "machineFault"
  | "noteInterrupt"
  | "pending"
  | "registry"
  | "sendToMachine"
  | "sessionName"
  | "workItems"
> & {
  db: Pick<DbShape, "asks" | "getInstancesByIds" | "instanceIdOf">;
  delegateWaits: Pick<ReturnType<typeof createDelegateWaits>, "personOnly">;
  saidInterrupt: ReturnType<typeof createRelayControl>["saidInterrupt"];
  sessionSend: ReturnType<typeof createSends>["sessionSend"];
  spawnSession: ReturnType<typeof createSpawns>["spawnSession"];
};

export const createDelegationSends = (deps: DelegationSendsDeps) => {
  /** The row of the session whose tool call this is, read fresh: its permission may have changed mid-call; the problem when the hub has none. */
  const caller = (actor: InstanceRow) => {
    const [requester] = deps.db.getInstancesByIds([actor.id]);
    if (!requester) {
      return problem(400, {
        code: "delegation-caller-unknown",
        detail: "Unknown calling CawCo instanceId",
      });
    }
    return requester;
  };

  /**
   * The delegate `instanceId` names, which `requester` may control: its
   * parent, or its project's conversation (a co-parent of every work item of
   * the project, which may answer, steer and stop it); refused when it is
   * neither's, or retired.
   */
  const delegateControlled = (
    instanceId: string | undefined,
    requester: InstanceRow
  ) => {
    // A delegate named by a former id is acted on by its id now.
    const row = instanceId
      ? deps.db.getInstancesByIds([deps.db.instanceIdOf(instanceId)])[0]
      : undefined;
    if (!(
      row &&
      (row.parentInstanceId === requester.id ||
        deps.workItems.ledBy(row.id, requester.id))
    )) {
      return problem(403, {
        code: "delegation-control-not-yours",
        detail:
          "you can only control your own delegates, or the work items of the project whose conversation you are",
      });
    }
    const retired = deps.workItems.refusal(row, {
      kind: "peer",
      from: requester.id,
      fromSession: requester.id,
    });
    if (retired) {
      return problem(409, {
        code: "delegation-control-retired",
        detail: retired.reason,
      });
    }
    return row;
  };

  /**
   * A delegate's ask answered by `requester`, its parent or its project's
   * conversation: a question the hub owns (asks.ts) is its asker's parent's
   * to answer too, and a permit is, as the prompt it was kept from was; an
   * ask the hub raised and settles itself (an approval, a browser or connect
   * ask, a move, a proposal) only the person answers (delegate-waits.ts
   * `personOnly`). The answer's problem goes on in its status and code,
   * said for the delegate the target named.
   */
  const answerForDelegate = async (
    row: InstanceRow,
    requester: InstanceRow,
    control: ControlPayload
  ) => {
    const answer = answerOfControl(control);
    if (!answer) {
      throw new Error(ANSWER_UNREAD);
    }
    const { result } = answer;
    const owned = deps.db.asks.get(answer.requestId);
    const parked = deps.pending.get(answer.requestId);
    if (parked && deps.delegateWaits.personOnly(parked)) {
      return problem(403, {
        code: "delegation-ask-person-only",
        detail: delegateWaitWords.refused,
      });
    }
    if (owned && owned.instanceId !== row.id) {
      return problem(403, {
        code: "delegation-ask-not-theirs",
        detail: "That ask isn't this delegate's.",
      });
    }
    // Its refusal says which delegate the target named: an ask that is
    // no longer pending reads the same for every session otherwise.
    const said = (why: string) =>
      `Your delegate ${sessionLabel(row).tag}, ask ${answer.requestId}: ${why}`;
    const answered = await answerPermission(
      deps.pending,
      row.id,
      answer.requestId,
      result,
      { via: "session", name: deps.sessionName(requester) }
    ).catch((error: unknown) => {
      throw new Error(
        said(error instanceof Error ? error.message : String(error)),
        { cause: error }
      );
    });
    if (answered) {
      return problem(answered.status, {
        code: answered.response.code,
        detail: said(answered.response.detail),
      });
    }
  };

  /**
   * A control `requester` sends its delegate `row` on its machine, from
   * `requester`; an interrupt is noted and cuts the turn it lands in, said
   * as that session's.
   */
  const controlDelegate = (
    envelope: HubEnvelope<"control">,
    row: InstanceRow,
    requester: InstanceRow,
    control: ControlPayload
  ) => {
    const agent = deps.registry.agent(row.machineId);
    if (!agent) {
      return awayProblem(
        row.machineId,
        deps.machineFault(row.machineId, "offline")
      );
    }
    deps.sendToMachine(agent, {
      ...envelope,
      instanceId: row.id,
      machineId: row.machineId,
      payload: { ...control, instanceId: row.id, from: requester.id },
    });
    if (control.method === CONTROL_INTERRUPT) {
      deps.saidInterrupt(row.id, `by session ${requester.id}`);
      deps.noteInterrupt(row.id);
      deps.cutTurn(
        row.id,
        turnCutWords.interruptFrom(`“${deps.sessionName(requester)}”`)
      );
    }
  };

  return {
    caller,

    /**
     * Hands a session's send to the hub's one send path now, and answers
     * what became of it; a send that does not go answers the hub's problem.
     */
    deliver: (envelope: HubEnvelope<"send">, actor: InstanceRow) => {
      const requester = caller(actor);
      return Promise.resolve(
        requester instanceof ElysiaStatus
          ? requester
          : deps.sessionSend(envelope, requester)
      );
    },

    /**
     * A handoff with inputs: written and sent in one step of the receiver's
     * workspace's turn (work-items.ts `handOff`).
     */
    handOff: async (
      target: string,
      inputs: unknown[],
      compose: (landed: HandoffInputs) => HubEnvelope<"send">,
      actor: InstanceRow
    ) => {
      const requester = caller(actor);
      if (requester instanceof ElysiaStatus) {
        return requester;
      }
      return await deps.workItems.handOff(
        target,
        requester.id,
        inputs,
        (landed) => {
          const sent = deps.sessionSend(compose(landed), requester);
          return sent instanceof ElysiaStatus
            ? sent
            : { ...sent, ...(landed.cut ? { cut: true as const } : {}) };
        }
      );
    },

    /**
     * A session's start_session: the caller's own machine unless it named
     * one, refused to a leaf (one that may not start any type), held until
     * in place. Answers the folder it runs in as the hub settled it.
     */
    spawn: async (
      envelope: HubEnvelope<"spawn"> & {
        payload: { fallbackPermissionMode?: PermissionMode };
      },
      actor: InstanceRow
    ) => {
      const requester = caller(actor);
      if (requester instanceof ElysiaStatus) {
        return requester;
      }
      const refused = mayStartRefusal(requester, null);
      if (refused) {
        return problem(403, {
          code: "work-item-may-not-start",
          detail: refused,
        });
      }
      const { fallbackPermissionMode, ...asked } = envelope.payload;
      // The agent's check, nested under the agent whatever its call named.
      const { parentToolUseId } = peekParent(asked);
      const payload: SpawnPayload = {
        ...asked,
        parent: {
          instanceId: requester.id,
          ...(parentToolUseId ? { toolUseId: parentToolUseId } : {}),
        },
      };
      return await deps.spawnSession(
        envelope.machineId || requester.machineId,
        payload,
        "check",
        fallbackPermissionMode
      );
    },

    /**
     * Carries out what a call emitted, as session `actor`: a send through
     * the one send path, or a control on a delegate it may control (an
     * interrupt, or an answer to its ask), each checked in that order before
     * the answer or the control goes; the hub's problem when it may not.
     */
    forward: async (envelope: HubEnvelope, actor: InstanceRow) => {
      // The MCP resolver supplies the caller separately, never from provenance
      // on an envelope. Recheck the row in case its permission changed mid-call.
      const requester = caller(actor);
      if (requester instanceof ElysiaStatus) {
        return requester;
      }
      if (envelope.verb === "send") {
        const sent = deps.sessionSend(envelope, requester);
        return sent instanceof ElysiaStatus ? sent : undefined;
      }
      if (!(
        envelope.verb === "control" &&
        (envelope.payload.method === CONTROL_INTERRUPT ||
          envelope.payload.method === RESOLVE_PERMISSION)
      )) {
        throw new Error(`Unsupported delegation operation ${envelope.verb}`);
      }
      const control = envelope.payload;
      const row = delegateControlled(envelope.instanceId, requester);
      if (row instanceof ElysiaStatus) {
        return row;
      }
      return control.method === RESOLVE_PERMISSION
        ? await answerForDelegate(row, requester, control)
        : controlDelegate(envelope, row, requester, control);
    },
  };
};

export type DelegationSends = ReturnType<typeof createDelegationSends>;
