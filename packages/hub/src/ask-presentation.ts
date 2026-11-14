/**
 * The hub's half of what a permission prompt says (core
 * permission-presentation.ts): the facts only the hub holds — which session
 * asked and what it is called, the fleet's memory as it stands, which named
 * settings already exist — handed to the one reading every surface renders.
 * Stamped onto the ask's payload as it parks (pending.ts `presentWith`), so a
 * memory write's diff is the change from what the fleet held at that moment.
 */

import type { SourceFacts } from "@cawco/core/asks";
import { maskMcpConfig, openUrl } from "@cawco/core/fleet-secrets";
import type { ParkedAsk, PermissionRequestFrame } from "@cawco/core/frames";
import {
  type AdminGroup,
  presentPermission,
  redact,
  type SetOwner,
  type SetStanding,
} from "@cawco/core/permission-presentation";
import type { Envelope } from "@cawco/core/protocol";
import { questionsOf } from "@cawco/core/question";
import type { PermissionResult } from "@cawco/core/session-messages";
import { ParkedAskShape } from "@cawco/core/stored-shapes";
import { z } from "zod";
import type { DbShape } from "./db";
import type { DelegateTypesShape } from "./db/delegate-types";
import { boardTitle } from "./labels";

/** Whether a parked ask is a permission, not a question. */
const isPermission = (payload: PermissionRequestFrame): boolean =>
  !questionsOf(payload.toolName, payload.input);

const MCP_SERVERS_WRITE = /^(?:mcp__cawco__|cawco_)?admin_mcp_servers_write$/u;

/** A connector write's `config.url` with its secret parts cut, as every read says it. */
const withOpenUrl = (
  input: Record<string, unknown>
): Record<string, unknown> => {
  const { config } = input;
  if (
    typeof config !== "object" ||
    config === null ||
    typeof (config as { url?: unknown }).url !== "string"
  ) {
    return input;
  }
  return {
    ...input,
    config: { ...config, url: openUrl((config as { url: string }).url) },
  };
};

/**
 * The copy of a parked ask that leaves the hub for a client (a dashboard, the
 * apps, `/api/pending`): its tool input with every secret hidden, as the card
 * shows it. The ledger keeps the original, and {@link answeredWithOriginal}
 * puts it back on the way in, so an Approve runs the call as it was asked. A
 * question is left whole: its answer is written into its input.
 */
export const clientAsk = (ask: ParkedAsk): ParkedAsk => {
  const { payload } = ask;
  if (!isPermission(payload)) {
    return ask;
  }
  const input = Object.fromEntries(
    Object.entries(payload.input).map(([key, value]) => [
      key,
      redact(key, value),
    ])
  );
  return {
    ...ask,
    payload: {
      ...payload,
      input: MCP_SERVERS_WRITE.test(payload.toolName)
        ? withOpenUrl(input)
        : input,
    },
  };
};

/** An envelope whose payload says it is a permission request, by its kind alone. */
const PERMISSION_KIND = z.object({ kind: z.literal("permission_request") });

/**
 * {@link clientAsk} for an envelope read as it arrives. The payload's kind
 * decides: a permission request is read as a `ParkedAsk` (one that is not
 * throws, a fault in the hub's own handling) and redacted; any other
 * envelope passes whole.
 */
export const clientCopy = (envelope: Envelope): Envelope =>
  PERMISSION_KIND.safeParse(envelope.payload).success
    ? clientAsk(ParkedAskShape.parse(envelope))
    : envelope;

/**
 * An answer to a parked permission, carrying the call's own input: clients
 * only ever held the redacted copy ({@link clientCopy}), so the input they
 * echo back is replaced by the ledger's.
 */
export const answeredWithOriginal = (
  parked: ParkedAsk,
  result: PermissionResult
): PermissionResult =>
  isPermission(parked.payload) && result.behavior === "allow"
    ? { ...result, updatedInput: parked.payload.input }
    : result;

export const createAskPresenter = (
  db: DbShape,
  delegateTypes: DelegateTypesShape,
  /**
   * A starting set as it stands and its sessions' calls, for an asker in
   * `projectId` (unused-trim.ts `standing`): what a trim is drawn against.
   */
  standing: (
    owner: SetOwner,
    projectId: string | null
  ) => SetStanding | undefined
) => {
  /**
   * The session that asked, as the board names it (a project's conversation is Caw;
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

  /** A session as an ask names it: as the board does, with its project. */
  const sessionAsker = (
    row: ReturnType<DbShape["getInstancesByIds"]>[number]
  ): { asker: string; project?: string } => {
    const project = row.projectId ? db.project(row.projectId)?.name : undefined;
    return {
      asker: boardTitle(row),
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
            // As a read says it: a held secret is never in a card.
            config: maskMcpConfig(row.config),
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
      case "subagents": {
        const agent = db.listFleetAgents().find((one) => one.name === key);
        return agent && { content: agent.content };
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
    const instanceId = envelope.instanceId ?? payload.instanceId;
    const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
    payload.presentation = presentPermission(payload.toolName, payload.input, {
      ...askerOf(instanceId, payload),
      memory,
      current,
      projectName,
      startingSet: (owner) => standing(owner, row?.projectId ?? null),
      ...(payload.sourceFacts ? { source: payload.sourceFacts } : {}),
    });
  };
};
