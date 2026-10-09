/** Pi metadata, history and fleet profile. Shared with the host; no turn factory. */
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AuthState,
  FleetConfig,
  FleetHoldings,
  FleetItemState,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessReport,
  ModelInfo,
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSessionInfo,
  SessionMessage,
} from "@cawco/core";
import { CONTROL_MODEL_CATALOG, CONTROL_PI_DEFAULT_MODEL } from "@cawco/core";
import type {
  ImageContent,
  Model,
  TextContent,
} from "@earendil-works/pi-ai/compat";
import {
  type AgentSessionServices,
  createAgentSessionServices,
  getAgentDir,
  type ModelRuntime,
  resolveCliModel,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { heldSkills, skillDrift, skillRecords } from "../fleet";
import { resolveBin } from "../tools";
import {
  hashText,
  readSidecar,
  syncMemory,
  syncSkillFiles,
  writeJson,
} from "./fleet-common";
import { machineWithAccountsRuntime } from "./pi-accounts";
import { checkPiProxyCredential, type PiCredentialState } from "./pi-auth";
import { piOpenTurns } from "./pi-sessiond";

const PI_DIR = join(homedir(), ".pi", "agent");
const PI_SKILLS = join(PI_DIR, "skills");
const PI_MEMORY = join(PI_DIR, "AGENTS.md");
const PI_SIDECAR = join(PI_DIR, "cawco-fleet.json");

/**
 * The id a compaction's boundary goes by, live and read back alike: pi stores
 * one entry per compaction, and its own id is the summary's.
 */
export const compactBoundaryId = (compaction: string): string =>
  `${compaction}:boundary`;

/** A stored compaction as its boundary and its summary. */
const compactionEntries = (
  sessionKey: string,
  entry: {
    id: string;
    summary: string;
    timestamp: string;
    tokensBefore: number;
  },
  keptFrom: string | undefined
): SessionMessage[] => [
  {
    type: "system",
    uuid: compactBoundaryId(entry.id),
    session_id: sessionKey,
    message: {
      type: "system",
      subtype: "compact_boundary",
      uuid: compactBoundaryId(entry.id),
      session_id: sessionKey,
      compact_metadata: { pre_tokens: entry.tokensBefore },
    },
    parent_tool_use_id: null,
    parent_agent_id: null,
    timestamp: entry.timestamp,
  },
  {
    type: "user",
    uuid: entry.id,
    session_id: sessionKey,
    message: { role: "user", content: entry.summary },
    parent_tool_use_id: null,
    parent_agent_id: null,
    compactSummary: true,
    ...(keptFrom ? { keptFrom } : {}),
    timestamp: entry.timestamp,
  },
];

export const PI_CAPABILITIES: HarnessCapabilities = {
  interrupt: true,
  permissionModes: [],
  setModel: true,
  effort: false,
  contextUsage: true,
  supportedModels: true,
  supportedCommands: true,
  reloadSkills: false,
  mcpStatus: false,
  mcpControl: false,
  listSessions: true,
  getSessionMessages: true,
  renameSession: false,
  deleteSession: true,
  fork: true,
  rewind: false,
  tagSession: false,
  skills: true,
  subagents: false,
  tasks: false,
  compaction: true,
  costUsd: false,
  thinking: true,
  images: true,
  handoff: true,
  hooks: false,
  plugins: false,
  fleet: true,
};

export const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === "object" && block !== null && "text" in block
          ? String((block as { text: unknown }).text)
          : ""
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

export const contentOf = (content: unknown): string | NeutralContentBlock[] => {
  if (
    !(Array.isArray(content) && content.some((block) => block.type === "image"))
  ) {
    return textOf(content);
  }
  return (content as (TextContent | ImageContent)[]).map((block) =>
    block.type === "image"
      ? {
          type: "image",
          source: {
            type: "base64",
            media_type: block.mimeType,
            data: block.data,
          },
        }
      : { type: "text", text: block.text }
  );
};

// biome-ignore lint/suspicious/noExplicitAny: pi's model configuration varies across providers; only id is read
export const modelIdOf = (model: Model<any>): string =>
  String((model as { id?: unknown }).id ?? "");

/**
 * How CawCo names a pi model: `provider/id`, pi's own `--model` grammar. A
 * bare id is ambiguous once a proxy and a subscription offer the same model
 * (`gpt-5.5` from `openai-codex` and from a proxy), and only the provider says
 * which account, if any, a session runs on.
 */
// biome-ignore lint/suspicious/noExplicitAny: pi's model configuration varies across providers; only provider and id are read
export const piModelValue = (model: Model<any>): string =>
  `${model.provider}/${modelIdOf(model)}`;

/**
 * The model a CawCo model value names, by pi's own resolver
 * (`resolveCliModel`: `provider/id` first, then an id unique among the
 * providers signed in), and only when `runtime` can run it.
 */
export const resolvePiModel = async (
  runtime: ModelRuntime,
  value: string
  // biome-ignore lint/suspicious/noExplicitAny: pi's model configuration varies across providers
): Promise<Model<any>> => {
  const resolved = resolveCliModel({ cliModel: value, modelRuntime: runtime });
  const { model } = resolved;
  if (!model) {
    throw new Error(
      `pi cannot use model ${value}: ${resolved.error ?? "pi knows no such model."}`
    );
  }
  const available = await runtime.getAvailable();
  if (
    !available.some(
      (one) =>
        one.provider === model.provider && modelIdOf(one) === modelIdOf(model)
    )
  ) {
    throw new Error(
      `pi cannot use model ${value}: it is not available with the configured provider credentials.`
    );
  }
  return model;
};

/**
 * pi's own resolution of each bare model id pi can run on this machine, with
 * its accounts ({@link HarnessReport.modelNames}): `resolveCliModel`'s answer
 * for each.
 */
export const modelNames = async (): Promise<Record<string, string>> => {
  const { modelRuntime } = await PiProfile.services();
  const available = await modelRuntime.getAvailable();
  const names: Record<string, string> = {};
  for (const model of available) {
    const bare = modelIdOf(model);
    if (bare in names) {
      continue;
    }
    const resolved = resolveCliModel({
      cliModel: bare,
      modelRuntime,
    }).model;
    if (resolved) {
      names[bare] = piModelValue(resolved);
    }
  }
  return names;
};

/**
 * The model pi starts a new session on in `cwd` when none is named, with
 * this machine's accounts counted as signed in ({@link
 * CONTROL_PI_DEFAULT_MODEL}): its saved default, read through pi's own
 * settings merge for that directory (`SettingsManager.create(cwd)`: the
 * global `settings.json` and `<cwd>/.pi/settings.json`,
 * core/settings-manager.js 99-100), when that model's provider has auth
 * configured (`findInitialModel`, core/model-resolver.js 503-515). Null when
 * it has none: pi then picks among the machine's own providers, which needs
 * no account.
 */
export const piDefaultModel = async (cwd: string): Promise<string | null> => {
  const { modelRuntime } = await PiProfile.services();
  await modelRuntime.getAvailable();
  const settings = SettingsManager.create(cwd, getAgentDir());
  const provider = settings.getDefaultProvider();
  const id = settings.getDefaultModel();
  const saved =
    provider && id ? modelRuntime.getModel(provider, id) : undefined;
  return saved && modelRuntime.hasConfiguredAuth(saved.provider)
    ? piModelValue(saved)
    : null;
};

/** The models `runtime` (the machine's own with its accounts, unless a session's is given) can run. */
export const modelCatalog = async (
  runtime?: ModelRuntime
): Promise<ModelInfo[]> => {
  const { modelRuntime, settingsManager } = await PiProfile.services();
  await settingsManager.reload();
  const available = await (runtime ?? modelRuntime).getAvailable();
  const rows: ModelInfo[] = available.map((model) => ({
    value: piModelValue(model),
    displayName: String((model as { name?: unknown }).name ?? modelIdOf(model)),
    contextWindow: model.contextWindow,
  }));
  const id = settingsManager.getDefaultModel();
  const provider = settingsManager.getDefaultProvider();
  const resolved = id
    ? available.find(
        (model) =>
          modelIdOf(model) === id && (!provider || model.provider === provider)
      )
    : undefined;
  const row = resolved
    ? rows.find((entry) => entry.value === piModelValue(resolved))
    : undefined;
  return row
    ? [...rows, { ...row, value: "default", resolvedModel: row.value }]
    : rows;
};

export function toBlocks(content: unknown): NeutralAssistantBlock[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const blocks: NeutralAssistantBlock[] = [];
  for (const block of content) {
    const b = block as {
      type?: string;
      text?: string;
      thinking?: string;
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    };
    if (b.type === "text" && b.text) {
      blocks.push({ type: "text", text: b.text });
    } else if (b.type === "thinking" && b.thinking) {
      blocks.push({ type: "thinking", thinking: b.thinking });
    } else if (b.type === "toolCall" && b.id && b.name) {
      blocks.push({
        type: "tool_use",
        id: b.id,
        name: b.name,
        input: b.arguments ?? {},
      });
    }
  }
  return blocks;
}

const failedTurn = (
  sessionKey: string,
  entry: { id: string; timestamp: string },
  errorMessage: string
): SessionMessage => ({
  type: "system",
  uuid: `${entry.id}:error`,
  session_id: sessionKey,
  message: {
    type: "result",
    uuid: `${entry.id}:error`,
    session_id: sessionKey,
    subtype: "error_during_execution",
    is_error: true,
    errors: [errorMessage],
  },
  parent_tool_use_id: null,
  parent_agent_id: null,
  timestamp: entry.timestamp,
});

const assistantEntries = (
  sessionKey: string,
  entry: { id: string; timestamp: string },
  message: { content?: unknown },
  next: string | undefined
): SessionMessage[] => {
  const blocks = toBlocks(message.content);
  const { errorMessage, stopReason } = message as {
    errorMessage?: string;
    stopReason?: string;
  };
  // A stored failed attempt isn't the turn's result during a retry gap.
  const retried =
    next === "assistant" || (next === undefined && piOpenTurns.has(sessionKey));
  return [
    ...(blocks.length
      ? [
          {
            type: "assistant" as const,
            uuid: entry.id,
            session_id: sessionKey,
            message: { role: "assistant", content: blocks },
            parent_tool_use_id: null,
            parent_agent_id: null,
            timestamp: entry.timestamp,
            ...(stopReason === "stop" ? { turnEnd: true as const } : {}),
          },
        ]
      : []),
    ...(errorMessage && !retried
      ? [failedTurn(sessionKey, entry, errorMessage)]
      : []),
  ];
};

export async function piSessionPath(
  sessionKey: string,
  cwd: string
): Promise<string | undefined> {
  return (await SessionManager.list(cwd)).find(
    (info) => info.id === sessionKey || info.path.includes(sessionKey)
  )?.path;
}

let servicesPromise: Promise<AgentSessionServices> | null = null;
const PI_AUTH_STATE: Record<PiCredentialState["state"], AuthState> = {
  live: "authenticated",
  dead: "unauthenticated",
  unknown: "unreadable-credentials",
};

/** Read-only SDK metadata plus the machine's pi profile; both processes use it. */
export class PiProfile {
  readonly kind = "pi" as const;
  readonly capabilities = PI_CAPABILITIES;
  auth: AuthState = "authenticated";
  authReason: string | undefined;

  /**
   * Load extensions too: registered providers must appear in the model
   * picker. Its runtime is the machine's with its accounts
   * ({@link machineWithAccountsRuntime}): a provider whose sign-in moved into
   * an account is still one pi offers here.
   */
  static services(): Promise<AgentSessionServices> {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        const services = await createAgentSessionServices({
          cwd: homedir(),
          modelRuntime: await machineWithAccountsRuntime(),
        });
        for (const diagnostic of services.diagnostics) {
          console.warn(`[pi] ${diagnostic.type}: ${diagnostic.message}`);
        }
        return services;
      })().catch((error) => {
        servicesPromise = null;
        throw error;
      });
    }
    return servicesPromise;
  }

  async detect(): Promise<HarnessReport> {
    const installed = resolveBin("pi") !== undefined;
    const models = installed
      ? await modelCatalog().catch((error: unknown) => {
          console.warn(`[pi] model catalog unavailable: ${error}`);
        })
      : undefined;
    const names = installed
      ? await modelNames().catch((error: unknown) => {
          console.warn(`[pi] model names unavailable: ${error}`);
        })
      : undefined;
    const credential = installed ? await this.checkCredential() : undefined;
    this.#setCredential(credential);
    if (!installed) {
      this.auth = "unauthenticated";
    }
    return {
      harness: "pi",
      installed,
      auth: this.auth,
      ...(credential?.reason ? { authReason: credential.reason } : {}),
      capabilities: PI_CAPABILITIES,
      ...(models ? { models } : {}),
      ...(names ? { modelNames: names } : {}),
    };
  }

  async checkCredential(
    modelId?: string
  ): Promise<PiCredentialState | undefined> {
    try {
      const { modelRuntime, settingsManager } = await PiProfile.services();
      const defaultId = settingsManager.getDefaultModel();
      const defaultProvider = settingsManager.getDefaultProvider();
      const defaultValue =
        defaultId && defaultProvider
          ? `${defaultProvider}/${defaultId}`
          : defaultId;
      const asked = modelId && modelId !== "default" ? modelId : defaultValue;
      const model = asked
        ? await resolvePiModel(modelRuntime, asked).catch(() => undefined)
        : undefined;
      const credential: PiCredentialState | undefined = model
        ? await checkPiProxyCredential(model)
        : {
            state: "unknown",
            reason: "pi: sign-in status unknown — configured model unavailable",
          };
      if (
        !modelId ||
        modelId === "default" ||
        (model !== undefined &&
          modelIdOf(model) === defaultId &&
          model.provider === defaultProvider)
      ) {
        this.#setCredential(credential);
      }
      return credential;
    } catch {
      const credential = {
        state: "unknown" as const,
        reason: "pi: sign-in status unknown — provider metadata unavailable",
      };
      if (!modelId || modelId === "default") {
        this.auth = "unreadable-credentials";
        this.authReason = credential.reason;
      }
      return credential;
    }
  }

  #setCredential(credential: PiCredentialState | undefined): void {
    this.auth = PI_AUTH_STATE[credential?.state ?? "live"];
    this.authReason = credential?.reason;
  }

  /**
   * pi's stored conversations: those run in `dir`, or without one every
   * conversation on this machine, which is the catalog a register reads to
   * tell a session it can resume from one that left nothing.
   */
  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    const sessions = dir
      ? await SessionManager.list(dir)
      : await SessionManager.listAll();
    return sessions.map((info) => ({
      sessionId: info.id,
      harness: "pi",
      createdAt: info.created.getTime(),
      lastModified: info.modified.getTime(),
      ...(info.cwd || dir ? { cwd: info.cwd || dir } : {}),
      ...(info.firstMessage ? { firstPrompt: info.firstMessage } : {}),
      ...(info.name ? { customTitle: info.name } : {}),
    }));
  }

  async getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | undefined> {
    return (await this.listSessions(dir)).find(
      (one) => one.sessionId === sessionKey
    );
  }

  async getSessionMessages(
    sessionKey: string,
    dir?: string
  ): Promise<SessionMessage[]> {
    if (!dir) {
      return [];
    }
    const path = await piSessionPath(sessionKey, dir);
    if (!path) {
      return [];
    }
    const manager = SessionManager.open(path, undefined, dir);
    const entries: SessionMessage[] = [];
    const stored = manager.getEntries();
    const placeOf = new Map(stored.map((entry, index) => [entry.id, index]));
    /** The first transcript entry each stored entry made, in stored order. */
    const made: { index: number; uuid: string }[] = [];
    const nextRole = (index: number): string | undefined => {
      for (let at = index + 1; at < stored.length; at += 1) {
        const later = stored[at];
        if (later.type === "message") {
          return (later as { message?: { role?: string } }).message?.role;
        }
      }
      return undefined;
    };
    for (const [index, entry] of stored.entries()) {
      // A compaction, where it happened — where the live stream drew it
      // (pi-runtime). Its boundary carries what pi stores of it: how full the
      // context was, not what triggered it. What the model still holds from
      // before it begins at the first entry it kept (`keptFrom`).
      if (entry.type === "compaction") {
        const kept = placeOf.get(entry.firstKeptEntryId) ?? index;
        entries.push(
          ...compactionEntries(
            sessionKey,
            entry,
            made.find((one) => one.index >= kept)?.uuid
          )
        );
        continue;
      }
      if (entry.type !== "message") {
        continue;
      }
      const before = entries.length;
      const message = (entry as { message?: unknown }).message as
        | { role?: string; content?: unknown }
        | undefined;
      if (!message) {
        continue;
      }
      if (message.role === "user") {
        entries.push({
          type: "user",
          uuid: entry.id,
          session_id: sessionKey,
          message: { role: "user", content: contentOf(message.content) },
          parent_tool_use_id: null,
          parent_agent_id: null,
          timestamp: entry.timestamp,
        });
      } else if (message.role === "assistant") {
        entries.push(
          ...assistantEntries(sessionKey, entry, message, nextRole(index))
        );
      } else if (message.role === "toolResult") {
        const tool = message as { toolCallId?: string; isError?: boolean };
        entries.push({
          type: "user",
          uuid: entry.id,
          session_id: sessionKey,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: tool.toolCallId ?? "",
                content: contentOf(message.content),
                is_error: tool.isError,
              },
            ],
          },
          parent_tool_use_id: null,
          parent_agent_id: null,
          timestamp: entry.timestamp,
        });
      }
      if (entries.length > before) {
        made.push({ index, uuid: entries[before].uuid });
      }
    }
    return entries;
  }

  renameSession(): Promise<void> {
    return Promise.resolve();
  }
  tagSession(): Promise<void> {
    return Promise.resolve();
  }
  async deleteSession(sessionKey: string, dir?: string): Promise<void> {
    if (!dir) {
      return;
    }
    const path = await piSessionPath(sessionKey, dir);
    if (path) {
      await Bun.$`rm -f ${path}`.quiet().nothrow();
    }
  }
  dispose(): Promise<void> {
    servicesPromise = null;
    return Promise.resolve();
  }
  async machine(method: string, args: unknown[]): Promise<unknown> {
    if (method === CONTROL_PI_DEFAULT_MODEL) {
      return await piDefaultModel(String(args[0]));
    }
    return method === CONTROL_MODEL_CATALOG ? await modelCatalog() : undefined;
  }

  async syncFleet(config: FleetConfig): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(PI_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    };
    for (const row of config.mcp) {
      report.mcp[row.name] = row.enabled
        ? {
            state: "unsupported",
            detail:
              "pi has no MCP support. Use Claude Code or OpenCode to call this server.",
          }
        : { state: "disabled" };
    }
    const skills = await syncSkillFiles(
      PI_SKILLS,
      config.skills ?? [],
      sidecar.skills,
      report.skills as NonNullable<FleetSyncReport["skills"]>
    );
    const memory = await syncMemory(
      PI_MEMORY,
      config.memory,
      sidecar.memory,
      report
    );
    await writeJson(PI_SIDECAR, {
      skills,
      mcp: config.mcp.filter((row) => row.enabled).map((row) => row.name),
      ...(memory ? { memory } : {}),
    });
    return report;
  }

  /** The skills cawco wrote into pi's directory, as they are on disk now. */
  async fleetHoldings(): Promise<FleetHoldings> {
    const sidecar = await readSidecar(PI_SIDECAR);
    return {
      skills: await heldSkills(PI_SKILLS, Object.keys(sidecar.skills)),
    };
  }

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(PI_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    };
    for (const name of sidecar.mcp ?? []) {
      report.mcp[name] = {
        state: "unsupported",
        detail:
          "pi has no MCP support. Use Claude Code or OpenCode to call this server.",
      };
    }
    const held = await heldSkills(PI_SKILLS, Object.keys(sidecar.skills));
    const records = await skillRecords(PI_SKILLS, sidecar.skills, held);
    for (const [name, recorded] of Object.entries(records)) {
      const drift = skillDrift(held[name], recorded, recorded);
      let state: FleetItemState = { state: "applied" };
      if (held[name] === undefined) {
        state = { state: "failed", detail: "not on disk" };
      } else if (drift) {
        state = { state: "failed", detail: drift };
      }
      (report.skills as NonNullable<FleetSyncReport["skills"]>)[name] = state;
    }
    if (sidecar.memory !== undefined) {
      const file = Bun.file(PI_MEMORY);
      const hash = (await file.exists()) ? hashText(await file.text()) : null;
      report.memory =
        hash === sidecar.memory
          ? { state: "applied" }
          : {
              state: "failed",
              detail: hash === null ? "not on disk" : "edited on this machine",
            };
    }
    return report;
  }
}
