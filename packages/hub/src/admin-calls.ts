/**
 * THE CALLS the admin tools (admin-tools.ts) make on the fleet's settings,
 * each the same function its route calls (routes/fleet-skills.ts,
 * routes/rules.ts and the rest): a tool calls it directly, as the session the
 * MCP gateway authenticated, never over the hub's own HTTP. A body is held to
 * the schema its route validates it with before the call, as the route's own
 * validator holds it; what stops a call is a returned problem with its
 * status, code and words.
 */
import { readWithin } from "@cawco/core/bounded";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { ElysiaStatus, problem } from "elysia";
import type { Static, TSchema } from "typebox";
import Value from "typebox/value";
import type { Areas } from "./areas";
import {
  connectionCalls,
  createConnectionBody,
  signInBody,
  updateConnectionBody,
} from "./connections";
import { delegateTypeBody, delegateTypeCalls } from "./delegate-types";
import { HARNESS_CONFIG_BODY } from "./harness-config-body";
import type { HubContext } from "./hub-context";
import { previewSettings, previewSettingsBody } from "./preview-routes";
import { accountsListed } from "./routes/accounts";
import { fleetCalls } from "./routes/fleet";
import { agentBody, fleetAgentCalls } from "./routes/fleet-agents";
import { fleetHookCalls, hookBody } from "./routes/fleet-hooks";
import { fleetMarketplaceCalls } from "./routes/fleet-marketplaces";
import { fleetMcpCalls, mcpBody } from "./routes/fleet-mcp";
import {
  fleetMemoryCalls,
  memoryBody,
  memoryDocBody,
} from "./routes/fleet-memory";
import { fleetPluginCalls } from "./routes/fleet-plugins";
import { fleetSkillCalls, skillBody } from "./routes/fleet-skills";
import { projectsListed } from "./routes/projects";
import { ruleBody, ruleCalls } from "./routes/rules";

/** What the admin calls read of the hub's context. */
export type AdminCallsDeps = Parameters<typeof accountsListed>[0] &
  Parameters<typeof delegateTypeCalls>[0] &
  Parameters<typeof fleetAgentCalls>[0] &
  Parameters<typeof fleetCalls>[0] &
  Parameters<typeof fleetHookCalls>[0] &
  Parameters<typeof fleetMarketplaceCalls>[0] &
  Parameters<typeof fleetMcpCalls>[0] &
  Parameters<typeof fleetMemoryCalls>[0] &
  Parameters<typeof fleetPluginCalls>[0] &
  Parameters<typeof fleetSkillCalls>[0] &
  Parameters<typeof projectsListed>[0] &
  Parameters<typeof ruleCalls>[0] &
  Pick<
    HubContext,
    | "connections"
    | "harnessConfigDelete"
    | "harnessConfigList"
    | "harnessConfigPut"
    | "previewListeners"
  >;

/** What the context does not hold: the areas, and the republishing of every shown preview a change of how they are reached asks. */
export interface AdminCallsExtra {
  readonly areas: Pick<Areas, "list">;
  readonly republishPreviews: () => void;
}

/** How long a call that waits on a server outside the hub is waited on. */
const OUTSIDE_MS = 30_000;

/** `run`, which waits on a server outside the hub, answered or the problem that it did not in time. */
const within = async <T>(what: string, run: () => Promise<T>) => {
  const read = await readWithin(OUTSIDE_MS, run);
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      return problem(504, {
        code: "hub-unanswered",
        detail: `${what}: the hub did not answer within ${secondsOf(read.after)} s`,
      });
    default:
      return unhandled("read", read);
  }
};

/** `asked` as `schema` takes it, or the problem that says what does not fit, as a route answers an invalid body. */
const shaped = <S extends TSchema>(
  schema: S,
  asked: unknown
):
  | Static<S>
  | ReturnType<
      typeof problem<422, { code: "body-invalid"; detail: string }>
    > => {
  if (Value.Check(schema, asked)) {
    return asked;
  }
  const [first] = Value.Errors(schema, asked);
  return problem(422, {
    code: "body-invalid",
    detail: first
      ? `${first.instancePath || "the body"}: ${first.message}`
      : "the body does not fit",
  });
};

export const adminCalls = (deps: AdminCallsDeps, extra: AdminCallsExtra) => {
  const delegateTypes = delegateTypeCalls(deps);
  const skills = fleetSkillCalls(deps);
  const plugins = fleetPluginCalls(deps);
  const marketplaces = fleetMarketplaceCalls(deps);
  const mcp = fleetMcpCalls(deps);
  const rules = ruleCalls(deps);
  const hooks = fleetHookCalls(deps);
  const agents = fleetAgentCalls(deps);
  const memory = fleetMemoryCalls(deps);
  const connections = connectionCalls(deps.connections);
  const previews = previewSettings({
    listeners: deps.previewListeners,
    republish: extra.republishPreviews,
  });
  return {
    /** The fleet's whole configuration (routes/fleet.ts). */
    fleet: fleetCalls(deps).read,
    accounts: () => accountsListed(deps, undefined),
    projects: () => projectsListed(deps),
    areas: () => extra.areas.list(),
    delegateTypes: {
      list: delegateTypes.list,
      put: (name: string, asked: unknown) => {
        const body = shaped(delegateTypeBody, asked);
        return body instanceof ElysiaStatus
          ? body
          : delegateTypes.put(name, body);
      },
      remove: delegateTypes.remove,
    },
    connections: {
      list: connections.list,
      create: (asked: unknown) => {
        const body = shaped(createConnectionBody, asked);
        return body instanceof ElysiaStatus
          ? Promise.resolve(body)
          : within("create a connection", () => connections.create(body));
      },
      update: (name: string, asked: unknown) => {
        const body = shaped(updateConnectionBody, asked);
        return body instanceof ElysiaStatus
          ? Promise.resolve(body)
          : within("change a connection", () => connections.update(name, body));
      },
      signIn: (name: string, asked: unknown) => {
        const body = shaped(signInBody, asked);
        return body instanceof ElysiaStatus
          ? Promise.resolve(body)
          : within("start a sign-in", () => connections.signIn(name, body));
      },
      remove: connections.remove,
    },
    skills: {
      /** Installed from `body.source`, from a machine's folder, or adopted off a machine */
      put: (name: string, asked: unknown) => {
        const body = shaped(skillBody, asked);
        return body instanceof ElysiaStatus
          ? Promise.resolve(body)
          : skills.put(name, body);
      },
      setEnabled: skills.setEnabled,
      remove: skills.remove,
    },
    marketplaces,
    plugins,
    mcp: {
      put: (name: string, asked: unknown) => {
        const body = shaped(mcpBody, asked);
        return body instanceof ElysiaStatus
          ? Promise.resolve(body)
          : within("put an MCP server", () => mcp.put(name, body));
      },
      remove: mcp.remove,
    },
    rules: {
      list: rules.list,
      create: (asked: unknown) => {
        const body = shaped(ruleBody, asked);
        return body instanceof ElysiaStatus ? body : rules.create(body);
      },
      update: (id: string, asked: unknown) => {
        const body = shaped(ruleBody, asked);
        return body instanceof ElysiaStatus ? body : rules.update(id, body);
      },
      remove: rules.remove,
    },
    hooks: {
      list: hooks.list,
      put: (id: string, asked: unknown) => {
        const body = shaped(hookBody, asked);
        return body instanceof ElysiaStatus ? body : hooks.put(id, body);
      },
      remove: hooks.remove,
    },
    agents: {
      put: (name: string, asked: unknown) => {
        const body = shaped(agentBody, asked);
        return body instanceof ElysiaStatus ? body : agents.put(name, body);
      },
      remove: agents.remove,
    },
    /** Claude Code settings, OpenCode plugins and pi extensions: each kind's list, partial put by name and delete. */
    harnessConfigs: {
      list: deps.harnessConfigList,
      put: (
        kind: Parameters<AdminCallsDeps["harnessConfigPut"]>[0],
        name: string,
        asked: unknown
      ) => {
        const body = shaped(HARNESS_CONFIG_BODY, asked);
        return body instanceof ElysiaStatus
          ? body
          : deps.harnessConfigPut(kind, name, body);
      },
      remove: deps.harnessConfigDelete,
    },
    memory: {
      set: (asked: unknown) => {
        const body = shaped(memoryBody, asked);
        return body instanceof ElysiaStatus ? body : memory.set(body);
      },
      setDoc: (asked: unknown) => {
        const body = shaped(memoryDocBody, asked);
        return body instanceof ElysiaStatus ? body : memory.setDoc(body);
      },
      removeDoc: memory.removeDoc,
    },
    previews: {
      get: previews.get,
      set: (asked: unknown) => {
        const body = shaped(previewSettingsBody, asked);
        return body instanceof ElysiaStatus
          ? Promise.resolve(body)
          : previews.set(body);
      },
    },
  };
};

/** What the admin tools call directly. */
export type AdminCalls = ReturnType<typeof adminCalls>;
