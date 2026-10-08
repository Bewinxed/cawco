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
  presentPermission,
} from "@cawco/core";
import type { DbShape } from "./db";
import type { DelegateTypesShape } from "./delegate-types";

const leaf = (cwd: string): string | undefined =>
  cwd.split("/").filter(Boolean).at(-1);

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
        row.title?.trim() ||
        row.derivedTitle?.trim() ||
        leaf(row.cwd) ||
        row.id.slice(0, 8)
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
