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
import { sessionLabel } from "./labels";

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
   * The session that asked, as the board names it: its given title, else the
   * title its first message gave it, else its folder. A workflow's question is
   * its workflow's.
   */
  const askerOf = (
    instanceId: string | undefined,
    payload: { workflowRunId?: unknown }
  ): string => {
    const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
    if (row) {
      return (
        row.title?.trim() || row.derivedTitle?.trim() || sessionLabel(row).name
      );
    }
    if (typeof payload.workflowRunId === "string") {
      const run = db.getWorkflowRun(payload.workflowRunId);
      const workflow = run ? db.getWorkflow(run.workflowId) : undefined;
      if (workflow) {
        return `Workflow ${workflow.name}`;
      }
    }
    return instanceId ? instanceId.slice(0, 8) : "A session";
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
      workflowRunId?: unknown;
    };
    payload.presentation = presentPermission(payload.toolName, payload.input, {
      asker: askerOf(envelope.instanceId ?? payload.instanceId, payload),
      memory,
      named,
    });
  };
};
