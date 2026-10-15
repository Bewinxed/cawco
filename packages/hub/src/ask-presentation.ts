/**
 * The hub's half of what a permission prompt says (core
 * permission-presentation.ts): the facts only the hub holds — which session
 * asked and what it is called, the fleet's memory as it stands, which named
 * settings already exist — handed to the one reading every surface renders.
 * Stamped onto the ask's payload as it parks (pending.ts `presentWith`), so a
 * memory write's diff is the change from what the fleet held at that moment.
 */
import {
  type AdminGroup,
  type Envelope,
  type PermissionRequestFrame,
  type PermissionResult,
  presentPermission,
  questionsOf,
  redact,
} from "@cawco/core";
import type { DbShape } from "./db";
import type { DelegateTypesShape } from "./delegate-types";
import { boardTitle } from "./labels";

/** A permission (not a question) parked on this envelope, else undefined. */
const permissionOf = (
  envelope: Envelope
): PermissionRequestFrame | undefined => {
  const payload = envelope.payload as PermissionRequestFrame | undefined;
  return payload?.kind === "permission_request" &&
    !questionsOf(payload.toolName, payload.input)
    ? payload
    : undefined;
};

/**
 * The copy of a parked ask that leaves the hub for a client (a dashboard, the
 * apps, `/api/pending`): its tool input with every secret hidden, as the card
 * shows it. The ledger keeps the original, and {@link answeredWithOriginal}
 * puts it back on the way in, so an Approve runs the call as it was asked. A
 * question is left whole: its answer is written into its input.
 */
export const clientCopy = (envelope: Envelope): Envelope => {
  const payload = permissionOf(envelope);
  if (!payload) {
    return envelope;
  }
  return {
    ...envelope,
    payload: {
      ...payload,
      input: Object.fromEntries(
        Object.entries(payload.input).map(([key, value]) => [
          key,
          redact(key, value),
        ])
      ),
    },
  };
};

/**
 * An answer to a parked permission, carrying the call's own input: clients
 * only ever held the redacted copy ({@link clientCopy}), so the input they
 * echo back is replaced by the ledger's.
 */
export const answeredWithOriginal = (
  parked: Envelope,
  result: PermissionResult
): PermissionResult => {
  const payload = permissionOf(parked);
  return payload && result.behavior === "allow"
    ? { ...result, updatedInput: payload.input }
    : result;
};

export const createAskPresenter = (
  db: DbShape,
  delegateTypes: DelegateTypesShape
) => {
  /**
   * The session that asked, as the board names it (a project's lead is Caw;
   * any other its given title, else the title its first message gave it,
   * else its folder), and its project by name. A workflow's question is its
   * workflow's.
   */
  const askerOf = (
    instanceId: string | undefined,
    payload: { proposer?: unknown; workflowRunId?: unknown }
  ): { asker: string; project?: string } => {
    // A memory proposal (memory.ts) is no session's: it names who proposed
    // it and its project ("Memory curator · cawco").
    if (typeof payload.proposer === "string") {
      return { asker: payload.proposer };
    }
    const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
    if (row) {
      return sessionAsker(row);
    }
    const workflow =
      typeof payload.workflowRunId === "string"
        ? workflowName(payload.workflowRunId)
        : undefined;
    if (workflow) {
      return { asker: `Workflow ${workflow}` };
    }
    return { asker: instanceId ? instanceId.slice(0, 8) : "A session" };
  };

  /** A session as an ask names it: Caw for a project's lead, else as the board does; with its project. */
  const sessionAsker = (
    row: ReturnType<DbShape["getInstancesByIds"]>[number]
  ): { asker: string; project?: string } => {
    const project = row.projectId ? db.project(row.projectId)?.name : undefined;
    return {
      asker: row.role === "lead" ? "Caw" : boardTitle(row),
      ...(project ? { project } : {}),
    };
  };

  /** A workflow run's workflow, by name. */
  const workflowName = (runId: string): string | undefined => {
    const run = db.getWorkflowRun(runId);
    return run ? db.getWorkflow(run.workflowId)?.name : undefined;
  };

  const named = (group: AdminGroup, key: string): string | undefined => {
    switch (group) {
      case "mcp_servers":
        return db.getMcpServer(key)?.name;
      case "delegate_types":
        return delegateTypes.get(key)?.name;
      case "hooks":
        return db.getFleetHook(key)?.name;
      case "rules":
        return db.getRule(key)?.name;
      default:
        return undefined;
    }
  };

  const memory = (path: string | null): string | undefined =>
    path === null
      ? db.getFleetMemory()?.content
      : db.getFleetMemoryDoc(path)?.content;

  /** Stamps the ask's presentation onto its payload, read from what the hub holds now. */
  return (envelope: Envelope): void => {
    const payload = envelope.payload as PermissionRequestFrame & {
      proposer?: unknown;
      workflowRunId?: unknown;
    };
    payload.presentation = presentPermission(payload.toolName, payload.input, {
      ...askerOf(envelope.instanceId ?? payload.instanceId, payload),
      memory,
      named,
    });
  };
};
