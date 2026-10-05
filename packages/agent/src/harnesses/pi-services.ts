/** Pi metadata, history and fleet profile. Shared with the host; no turn factory. */
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AuthState,
  FleetConfig,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessReport,
  ModelInfo,
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSessionInfo,
  SessionMessage,
} from "@cawco/core";
import { CONTROL_MODEL_CATALOG } from "@cawco/core";
import type {
  ImageContent,
  Model,
  TextContent,
} from "@earendil-works/pi-ai/compat";
import {
  type AgentSessionServices,
  createAgentSessionServices,
  ModelRuntime,
  parseSessionEntries,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { resolveBin } from "../tools";
import {
  hashText,
  readSidecar,
  syncMemory,
  syncSkillFiles,
  writeJson,
} from "./fleet-common";
import { historyPage } from "./history-page";
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

export const modelCatalog = async (): Promise<ModelInfo[]> => {
  const { modelRuntime, settingsManager } = await PiProfile.services();
  const available = await modelRuntime.getAvailable();
  const rows: ModelInfo[] = available.map((model) => ({
    value: modelIdOf(model),
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
    ? rows.find((entry) => entry.value === modelIdOf(resolved))
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

  static async runtime(): Promise<ModelRuntime> {
    return (await PiProfile.services()).modelRuntime;
  }

  /** Load extensions too: registered providers must appear in the model picker. */
  static services(): Promise<AgentSessionServices> {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        const services = await createAgentSessionServices({
          cwd: homedir(),
          modelRuntime: await ModelRuntime.create({ refreshOnCreate: false }),
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
    };
  }

  async checkCredential(
    modelId?: string
  ): Promise<PiCredentialState | undefined> {
    try {
      const { modelRuntime, settingsManager } = await PiProfile.services();
      const id =
        modelId && modelId !== "default"
          ? modelId
          : settingsManager.getDefaultModel();
      const provider =
        modelId && modelId !== "default"
          ? undefined
          : settingsManager.getDefaultProvider();
      const model = (await modelRuntime.getAvailable()).find(
        (one) =>
          modelIdOf(one) === id && (!provider || one.provider === provider)
      );
      const credential: PiCredentialState | undefined = model
        ? await checkPiProxyCredential(model)
        : {
            state: "unknown",
            reason: "pi: sign-in status unknown — configured model unavailable",
          };
      if (
        !modelId ||
        modelId === "default" ||
        (modelId === settingsManager.getDefaultModel() &&
          model?.provider === settingsManager.getDefaultProvider())
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

  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    if (!dir) {
      return [];
    }
    return (await SessionManager.list(dir)).map((info) => ({
      sessionId: info.id,
      harness: "pi",
      createdAt: info.created.getTime(),
      lastModified: info.modified.getTime(),
      cwd: info.cwd || dir,
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
    return await this.#messages(sessionKey, dir);
  }

  async getSessionHistory(
    sessionKey: string,
    options: import("@cawco/core").SessionHistoryOptions
  ): Promise<import("@cawco/core").SessionHistory> {
    return historyPage(
      await this.#messages(sessionKey, options.dir, true),
      options
    );
  }

  async #messages(
    sessionKey: string,
    dir?: string,
    ownLine = false
  ): Promise<SessionMessage[]> {
    if (!dir) {
      return [];
    }
    const path = await piSessionPath(sessionKey, dir);
    if (!path) {
      return [];
    }
    // Pinned pi 1.0.1 open() persists migrations and repairs a missing newline.
    // Parse bytes without the SDK's file loader; inMemory normalizes the same
    // formats and builds the same branch index with persistence disabled.
    const manager = SessionManager.inMemory(
      dir,
      undefined,
      parseSessionEntries(await Bun.file(path).text())
    );
    const entries: SessionMessage[] = [];
    const stored = ownLine ? manager.getBranch() : manager.getEntries();
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
  async machine(method: string): Promise<unknown> {
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
    report.have = { skills };
    return report;
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
    for (const name of Object.keys(sidecar.skills)) {
      const file = Bun.file(join(PI_SKILLS, name, "SKILL.md"));
      (report.skills as NonNullable<FleetSyncReport["skills"]>)[name] =
        // biome-ignore lint/performance/noAwaitInLoops: small ordered profile report
        (await file.exists())
          ? { state: "applied" }
          : { state: "failed", detail: "not on disk" };
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
    report.have = { skills: sidecar.skills };
    return report;
  }
}
