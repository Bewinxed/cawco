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
  provenanceKindOf,
  questionsOf,
  redact,
  type SourceFacts,
  turnCall,
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
  delegateTypes: DelegateTypesShape,
  /** Why a session's turn is outside now, as a card's clause says it; null while it is its principal's (turn-provenance.ts). */
  outside: (instanceId: string) => string | null
) => {
  /**
   * The session that asked, as the board names it (a project's lead is Caw;
   * any other its given title, else the title its first message gave it,
   * else its folder), and its project by name.
   */
  const askerOf = (
    instanceId: string | undefined,
    payload: { proposer?: unknown }
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

  /** A setting as the fleet keeps it, under the names the write's input uses: what its before → after is read against. */
  const current = (
    group: AdminGroup,
    key: string
  ): Record<string, unknown> | undefined => {
    switch (group) {
      case "mcp_servers": {
        const row = db.getMcpServer(key);
        return (
          row && {
            config: row.config,
            enabled: row.enabled,
            projectId: row.projectId,
          }
        );
      }
      case "delegate_types": {
        const type = delegateTypes.get(key);
        return type && { ...type };
      }
      case "hooks": {
        const hook = db.getFleetHook(key);
        return hook && { ...hook };
      }
      case "rules": {
        const rule = db.getRule(key);
        return rule && { ...rule };
      }
      case "skills": {
        const skill = db.listSkills().find((one) => one.name === key);
        return (
          skill && {
            source: skill.source,
            enabled: skill.enabled,
            projectId: skill.projectId ?? null,
          }
        );
      }
      case "plugins": {
        const plugin = db.listPlugins().find((one) => one.id === key);
        return (
          plugin && {
            enabled: plugin.enabled,
            projectId: plugin.projectId ?? null,
          }
        );
      }
      case "connections": {
        // Never its key: the sealed secret stays out of every card.
        const row = db.connections.byName(key);
        return (
          row && {
            service: row.service,
            account: row.account,
            transport: row.transport,
            url: row.url,
            command: row.command,
            args: row.args,
            auth: row.auth,
            header: row.header,
            projects: db.connections.projectsOf(row.id),
          }
        );
      }
      case "previews":
        return { ...db.previews.settings() };
      default:
        return undefined;
    }
  };

  const projectName = (id: string): string | undefined => db.project(id)?.name;

  const memory = (path: string | null): string | undefined =>
    path === null
      ? db.getFleetMemory()?.content
      : db.getFleetMemoryDoc(path)?.content;

  /** Stamps the ask's presentation onto its payload, read from what the hub holds now. */
  return (envelope: Envelope): void => {
    const payload = envelope.payload as PermissionRequestFrame & {
      proposer?: unknown;
      sourceFacts?: SourceFacts;
    };
    // A Caw call his gate put to you says which rule did (lead-gate.ts);
    // any session's shell or edit call in an outside turn says what made the
    // turn so (core turn-provenance.ts).
    const gated = envelope.requestId
      ? db.leadCalls.ofRequest(envelope.requestId)
      : undefined;
    const asker = envelope.instanceId ?? payload.instanceId;
    const provenance = turnCall(
      asker ? outside(asker) : null,
      undefined,
      provenanceKindOf(payload.toolName)
    );
    let askedBecause: string | undefined;
    if (gated?.outcome === "asked" && gated.why) {
      askedBecause = gated.why;
    } else if (provenance.kind === "ask") {
      askedBecause = provenance.why;
    }
    payload.presentation = presentPermission(payload.toolName, payload.input, {
      ...askerOf(asker, payload),
      ...(askedBecause ? { askedBecause } : {}),
      memory,
      current,
      projectName,
      ...(payload.sourceFacts ? { source: payload.sourceFacts } : {}),
    });
  };
};
