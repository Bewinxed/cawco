/**
 * The opencode adapter.
 *
 * opencode is server-first: one headless server per machine owns every session,
 * and the npm SDK is a type-safe client over its HTTP + SSE surface. This
 * adapter lazily starts that server and keeps one event-stream subscription
 * PER WORKING DIRECTORY — started the first time a session spawns into that
 * directory, kept alive until the harness disposes — because opencode's event
 * stream is scoped per directory. Sessions are addressed by the server's
 * session id; a spawn either creates one, re-opens a stored id (`resume`), or
 * forks (`resume.fork` / `resume.atMessage`).
 *
 * Translation is one-directional: opencode events become {@link NeutralMessage}
 * frames the dashboard already folds. Events route to their session by session
 * id — including part-carrying events, whose id lives on the part itself
 * (`part.sessionID`). Text streams in via `properties.delta` while `part.text`
 * carries the full accumulated text, which is what the closing frame replays;
 * reasoning streams the same way as a live thinking block and settles as a
 * `thinking` block on the closing frame; tool states emit deduped
 * `tool_use`/`tool_result` frames keyed by call id. A turn's `result` frame
 * closes on `session.idle` or on `session.error` (`aborted` /
 * `error_during_execution`), so a busy session is never left hung.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type {
  EffortLevel,
  FleetConfig,
  FleetItemState,
  FleetMcpConfig,
  FleetMcpServer,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessReport,
  McpServerStatus,
  ModelInfo,
  ModelTurnUsage,
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSessionInfo,
  NeutralSystemMessage,
  PermissionResult,
  SentMessage,
  SessionMessage,
  SlashCommand,
  SpawnPayload,
  UserAnswers,
  UserQuestion,
  UserQuestionResult,
  WorkspaceRef,
} from "@cawco/core";
import {
  ASK_USER_QUESTION,
  CAWCO_ENV,
  CONTROL_CONTEXT_USAGE,
  CONTROL_GET_TODOS,
  CONTROL_INTERRUPT,
  CONTROL_MCP_RECONNECT,
  CONTROL_MCP_STATUS,
  CONTROL_MCP_TOGGLE,
  CONTROL_MODEL_CATALOG,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  CUSTODY_HELD,
  EFFORT_READ,
  IMAGE_GENERATION_TIMEOUT_MS,
  INSTALL_SESSION_CREDENTIAL,
  MESSAGES_READ,
  MESSAGES_STORED,
  mcpFleetState,
  PROVIDER_LIMIT,
  PROVIDER_RETRY,
  REPEATED_FAILURE,
  REPEATED_FAILURE_LIMIT,
  SERVER_STOPPED_MID_TURN,
  usageByModel,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core";
import type { RestartHold } from "@cawco/core/binary-updates";
import {
  credentialAccountIds,
  WORKSPACE_POLICY_NAME,
  workspaceScratchDir,
  workspaceStateDir,
  workspacesDir,
} from "@cawco/core/paths";
// The protocol subpath, never the `@cawco/core` barrel: `sessiond.ts` reaches
// for `node:os` and the barrel is imported by the browser bundle (see f2e1c4c).
import { SESSION_CAWCO_ENV } from "@cawco/core/session-env";
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
import { opencodeDataDir } from "@cawco/core/usage/opencode-go";
import {
  type AssistantMessage,
  type Command,
  type CompactionPart,
  createOpencodeClient,
  type Event,
  type FilePart,
  type McpLocalConfig,
  type McpRemoteConfig,
  type McpStatus,
  type Message,
  type OpencodeClient,
  type Part,
  type PermissionRequest,
  type Project,
  type Provider,
  type Session,
  type TextPart,
  type Todo,
} from "@opencode-ai/sdk/v2";
import { JUDGE_SCRIPT } from "../boundary";
import { gitIn } from "../checkout-exclude";
import { delegationHubUrl, harnessMcpUrl } from "../delegation";
import {
  type OpencodeDenySettings,
  opencodeDenySettings,
  resolvedFleetDenials,
  sessionFleetDenials,
} from "../denied-tools";
import { GATE_FORM_ENV, gateForm } from "../gate-form";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
import { HarnessRecoveryRefused, SessionAddressRefused } from "../harness";
import { isMachineAgent } from "../machine-agent";
import { gaugeTables } from "../memory";
import { OPENCODE_SERVER_PROC_ID, parseProcId } from "../proc-id";
import {
  opencodeAccountEnv,
  opencodeAccountHome,
  opencodeLaunchCredential,
  opencodeProviderOf,
  prepareOpencodeAccount,
  readHeld,
} from "../provider-accounts";
import { readAccountSoon } from "../provider-usage";
import { fenced, holdRestart, withRestartHold } from "../restart";
import { acknowledgeSessionCredential } from "../session-identity";
import { ensureSessiond, SessiondClient } from "../sessiond-client";
import { resolveBin } from "../tools";
import { workspaceHolding, workspaceRefs } from "../workspace-records";
import {
  readJson,
  readSidecar,
  syncMemory,
  syncSkillFiles,
  writeJson,
} from "./fleet-common";
import { managedMcpMismatches } from "./managed-mcp";
import { OpencodeActivity } from "./opencode-activity";
import {
  opencodeCredentialFile,
  readOpencodeCredentials,
  storeOpencodeCredential,
} from "./opencode-credentials";
import {
  launchOf,
  OpencodeServerOwner,
  type ServerIdentity,
} from "./opencode-server";

interface RecoveryRound {
  attempt: number;
  generations: Promise<ServerIdentity[]>;
  token: object;
}

interface RecoveryWave {
  pending: number;
  round?: RecoveryRound;
}

function withImageAttachments(
  output: string,
  attachments: FilePart[] = []
): string | NeutralContentBlock[] {
  const images: NeutralContentBlock[] = attachments
    .filter(
      (part) => part.mime.startsWith("image/") && part.url.startsWith("data:")
    )
    .map((part) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: part.mime,
        data: part.url.slice(part.url.indexOf(",") + 1),
      },
    }));
  return images.length ? [{ type: "text", text: output }, ...images] : output;
}

type ToolPart = Extract<Part, { type: "tool" }>;
type ToolUseBlock = Extract<NeutralContentBlock, { type: "tool_use" }>;
type ToolResultBlock = Extract<NeutralContentBlock, { type: "tool_result" }>;

/** An MCP result's content as a direct call's would read: its words, and its pictures after them. */
function mcpContentOf(content: unknown): string | NeutralContentBlock[] {
  const blocks = Array.isArray(content)
    ? (content as {
        type?: string;
        text?: string;
        data?: string;
        mimeType?: string;
      }[])
    : [];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n");
  const images: NeutralContentBlock[] = blocks
    .filter(
      (block) =>
        block.type === "image" &&
        typeof block.data === "string" &&
        typeof block.mimeType === "string"
    )
    .map((block) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: block.mimeType as string,
        data: block.data as string,
      },
    }));
  return images.length ? [{ type: "text", text }, ...images] : text;
}

/**
 * The calls a code-mode program ({@link CODE_MODE_TOOL}) made, each as the
 * tool call and result it would be made directly — the rows the transcript
 * already draws for it, under the name and input a direct call carries.
 *
 * OpenCode records each call's path, input and status on the program's part
 * as it runs (`metadata.toolCalls`, in the order they started, `<call>/<n>`
 * in its hooks), and nothing of what one returned. The bridge plugin writes
 * what each call that succeeded answered, under its own tool name, onto the
 * part (`metadata.calls`): as the program returns, or — a program that threw
 * has no `after` — once its part has settled in error, as a second update.
 * A call that failed answered nothing OpenCode keeps; the program's error is
 * the words of the failure that ended it.
 *
 * `live`: a call that succeeded in a program that threw has its answer still
 * to come, in that second update, and is left open until it does. Read back,
 * whatever the part holds is all there is.
 */
function codeModeCalls(
  part: ToolPart,
  live: boolean
): { key: string; use: ToolUseBlock; result?: ToolResultBlock }[] {
  if (part.tool !== CODE_MODE_TOOL || part.state.status === "pending") {
    return [];
  }
  const meta = (part.state as { metadata?: unknown }).metadata as
    | {
        toolCalls?: { tool: string; status: string; input?: unknown }[];
        calls?: {
          id: string;
          tool: string;
          input?: Record<string, unknown>;
          content?: unknown;
          isError?: boolean;
          structuredContent?: Record<string, unknown>;
        }[];
      }
    | undefined;
  const threw = part.state.status === "error" ? part.state.error : undefined;
  const settled = part.state.status === "completed" || threw !== undefined;
  const calls = meta?.toolCalls ?? [];
  // A program stops at the first failure it does not catch: the last call
  // that failed in a program that threw is that one.
  const fatal =
    threw === undefined
      ? -1
      : calls.findLastIndex((call) => call.status !== "completed");
  return calls.map((call, index) => {
    const id = `${part.callID}/${index + 1}`;
    const answered = meta?.calls?.find((row) => row.id === id);
    const use: ToolUseBlock = {
      type: "tool_use",
      id,
      // `server.tool` is the path the program wrote; the hook's name is the
      // one a direct call carries.
      name: answered?.tool ?? call.tool.replace(".", "_"),
      input: toolInputOf(
        answered?.input ?? (call.input as Record<string, unknown>) ?? {}
      ),
    };
    if (answered) {
      return {
        key: id,
        use,
        result: {
          type: "tool_result",
          tool_use_id: id,
          content: mcpContentOf(answered.content),
          is_error: answered.isError === true,
          ...(answered.structuredContent
            ? { structuredContent: answered.structuredContent }
            : {}),
        },
      };
    }
    if (!settled) {
      return { key: id, use };
    }
    if (call.status === "completed") {
      // Its answer is the plugin's to write; live, it is on its way.
      return live && threw !== undefined
        ? { key: id, use }
        : {
            key: id,
            use,
            result: { type: "tool_result", tool_use_id: id, content: "" },
          };
    }
    return {
      key: id,
      use,
      result: {
        type: "tool_result",
        tool_use_id: id,
        content:
          index === fatal
            ? threw
            : "Failed inside its code-mode program, which caught the error; OpenCode keeps no words for it.",
        is_error: true,
      },
    };
  });
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let lastIdMs = 0;
let idCounter = 0;

/**
 * An opencode message id, minted here so a send can name the message it
 * becomes. opencode refuses a given id without its `msg` prefix, so it is
 * minted the way opencode's own `Identifier.ascending` mints one
 * (packages/opencode/src/id/id.ts): the prefix, the low 6 bytes of
 * `Date.now() * 0x1000 + counter` as hex, then 14 random base62 characters.
 * It lists a session's messages by when it wrote them, the id only breaking
 * ties (message-v2.ts: `.orderBy(desc(MessageTable.time_created),
 * desc(MessageTable.id))`).
 */
export function messageId(): string {
  const now = Date.now();
  if (now !== lastIdMs) {
    lastIdMs = now;
    idCounter = 0;
  }
  idCounter += 1;
  const stamp = (BigInt(now) * 0x10_00n + BigInt(idCounter))
    .toString(16)
    .padStart(12, "0")
    .slice(-12);
  const random = Array.from(
    crypto.getRandomValues(new Uint8Array(14)),
    (byte) => BASE62[byte % 62]
  ).join("");
  return `msg_${stamp}${random}`;
}

/**
 * opencode's own config files — the machine profile the fleet sync converges.
 * Resolved the way opencode resolves its global config (`xdg-basedir`'s
 * `xdgConfig`, joined with "opencode") and the way `CONFIG_PATH` (../config)
 * resolves cawco's: an agent run under another `XDG_CONFIG_HOME` joins the hub its own
 * config names, so the opencode config it writes must be that root's too, never
 * the machine's.
 */
const OPENCODE_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "opencode"
);
const OPENCODE_SKILLS = join(OPENCODE_DIR, "skills");
const OPENCODE_MEMORY = join(OPENCODE_DIR, "AGENTS.md");
const OPENCODE_CONFIG = join(OPENCODE_DIR, "opencode.json");
const OPENCODE_SIDECAR = join(OPENCODE_DIR, "cawco-fleet.json");
const OPENCODE_PLUGINS = join(OPENCODE_DIR, "plugins");

/**
 * The static permission/tools policy passed via OPENCODE_CONFIG_CONTENT at
 * server spawn time. Single source of truth shared by {@link #ensure} (which
 * builds the env var) and {@link #hashConfig} (which includes it in the
 * convergence fingerprint). Changes here require a server restart, not just
 * a dispose reload.
 */
const STATIC_POLICY = {
  permission: {
    bash: "ask",
    edit: "ask",
    skill: { "wf-*": "deny" },
    webfetch: "deny",
  },
  tools: { websearch: false },
} as const;

/**
 * OpenCode's code mode: MCP tools leave the request's tool list and the model
 * reaches them through one `execute` tool, whose description lists a bounded
 * catalog and a `tools.$codemode.search` for the rest. Upstream's own answer
 * to MCP schemas filling the context (anomalyco/opencode#8625, #12520): "We
 * added support for codemode instead of a tool search, you can enable with:
 * OPENCODE_EXPERIMENTAL_CODE_MODE=true … v2 of opencode ships with it enabled
 * by default" — https://github.com/anomalyco/opencode/issues/12520.
 *
 * Measured on 1.18.34 with the fleet's MCP servers connected, ElevenLabs's
 * 160 tools and 1.13 MB of input schemas among them: a turn's request went
 * from 1,425,289 bytes and 416 tools — more than every model under ~400k
 * tokens of input would take, so each of them refused every turn — to
 * 55,154 bytes and 15 tools. The calls a program makes come back as rows of
 * their own ({@link codeModeCalls}).
 */
const CODE_MODE_TOOL = "execute";

/** The `opencode serve` this agent launches, under its launch config. */
/** A session on an account: each turn's end reads the account's windows shortly after. */
const withAccountReads = (
  spec: SpawnPayload,
  ctx: HarnessContext
): HarnessContext => {
  const account = spec.accountDir?.accountId;
  return account
    ? {
        ...ctx,
        busy: (active) => {
          ctx.busy(active);
          if (!active) {
            readAccountSoon(account);
          }
        },
      }
    : ctx;
};

/**
 * The machine's OpenCode server launch. Its launch flags name the gate form
 * its bridge plugin judges workspace sessions' calls with ({@link gateForm}):
 * a server started on another fails its launch check and is replaced at rest,
 * its sessions moving over as each comes to rest.
 */
const serverSpec = (config: Record<string, unknown>) => ({
  command: resolveBin("opencode") ?? "opencode",
  args: ["serve", "--hostname=127.0.0.1", "--port=0"],
  env: {
    OPENCODE_EXPERIMENTAL_CODE_MODE: "true",
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    [GATE_FORM_ENV]: gateForm("opencode", buildHandoffPluginSource()),
  },
});

/**
 * How long an account's OpenCode server runs on once no session is on it.
 * Ours: a move onto one started for it takes about 2 s, and it holds
 * 0.7-0.8 GiB with a session on it (measured on 1.18.34,
 * artifacts/opencode-accounts-eval/REPORT.md §5). A session at rest is already
 * kept attached for half an hour before it sleeps (IDLE_SLEEP_MS), so the
 * server is free only once its sessions slept, ended or moved off the
 * account; five more minutes cover a session woken or moved straight back,
 * and no longer is memory held for nobody.
 */
const ACCOUNT_SERVER_IDLE_MS = 5 * 60_000;

/**
 * The database every OpenCode server on the machine shares, in OpenCode's
 * own words (`opencode db path`, run as the machine's own server runs): an
 * account's server is pointed at it (`OPENCODE_DB`, an absolute path used as
 * given: packages/core/src/database/database.ts 44-46), so its sessions are
 * the machine's, and a session moves between servers with all its history.
 * OpenCode opens it in WAL with a busy timeout (same file, 27-29), as every
 * `opencode` process on a machine already shares it.
 */
let sharedDatabase: Promise<string> | undefined;
const opencodeDatabase = (): Promise<string> => {
  sharedDatabase ??= (async () => {
    const binary = resolveBin("opencode");
    if (!binary) {
      throw new Error("opencode binary not found");
    }
    const ran = await Bun.$`${binary} db path`.quiet().nothrow();
    const path = ran.stdout.toString().trim().split("\n").at(-1)?.trim();
    if (ran.exitCode !== 0 || !path || !isAbsolute(path)) {
      throw new Error(
        `opencode db path named no database: ${ran.stdout.toString()}${ran.stderr.toString()}`
      );
    }
    return path;
  })();
  sharedDatabase.catch(() => {
    sharedDatabase = undefined;
  });
  return sharedDatabase;
};

/**
 * An account's own OpenCode server: the machine's launch, with its data dir
 * the account's ({@link opencodeAccountHome}), so OpenCode's own store there
 * holds that account's credential and OpenCode's own sign-in code runs on it
 * unmodified, on the machine's database. `CAWCO_XDG_DATA_HOME` is the
 * machine's own data dir, which the bridge plugin gives back to everything
 * the server starts; `CAWCO_ACCOUNT_CREDENTIAL` is what of the credential the
 * server read once at start ({@link opencodeLaunchCredential}), so a server
 * launched on another is replaced, as one is when the provider settings its
 * key carries change ({@link opencodeAccountEnv}).
 */
const accountServerSpec = async (
  account: string,
  config: Record<string, unknown>
): Promise<ProcSpec> => {
  const spec = serverSpec(config);
  return {
    ...spec,
    env: {
      ...spec.env,
      ...opencodeAccountEnv(account),
      XDG_DATA_HOME: opencodeAccountHome(account),
      OPENCODE_DB: await opencodeDatabase(),
      CAWCO_XDG_DATA_HOME: process.env.XDG_DATA_HOME ?? "",
      CAWCO_ACCOUNT_CREDENTIAL: opencodeLaunchCredential(account),
    },
  };
};

/**
 * The account's server data dir made ready to start in: its store written
 * from the credential, and its snapshot dir the machine's, where OpenCode
 * keeps each project's undo history by project and worktree
 * (`Global.Path.data/snapshot/<project>/<hash>`, snapshot/index.ts 71), so a
 * session's undo follows it to any server.
 */
const prepareAccountServer = async (account: string): Promise<void> => {
  await prepareOpencodeAccount(account);
  const snapshots = join(opencodeDataDir(), "snapshot");
  await mkdir(snapshots, { recursive: true });
  const link = join(opencodeAccountHome(account), "opencode", "snapshot");
  const found = await lstat(link).catch(() => undefined);
  if (!found?.isSymbolicLink()) {
    await rm(link, { recursive: true, force: true });
    await symlink(snapshots, link);
  }
};

/** The hub's MCP server as opencode configures a remote server. */
const cawcoMcp = () => ({
  type: "remote" as const,
  url: harnessMcpUrl("/mcp/cawco"),
  timeout: IMAGE_GENERATION_TIMEOUT_MS + 60_000,
  enabled: true,
  oauth: false as const,
});

/**
 * The config keys the convergence system fingerprints and verifies against
 * the server's resolved state. Keyed by the opencode.json field name.
 * MCP definitions are verified separately, scoped to CawCo's managed names.
 */
const CONTROLLED_CONFIG_FIELDS = [
  "agent",
  "disabled_providers",
  "enabled_providers",
  "model",
  "plugin",
  "provider",
  "small_model",
] as const;

/** Retire the pre-rename generated plugin so OpenCode registers each fleet tool once. */
export async function retireLegacyHandoffPlugin(
  directory = OPENCODE_DIR
): Promise<void> {
  const legacy = join(directory, "plugins", "cockpit-handoff.js");
  if (await Bun.file(legacy).exists()) {
    await rename(legacy, `${legacy}.disabled-${Date.now()}`);
  }
  const configPath = join(directory, "opencode.json");
  const config = await readJson<Record<string, unknown>>(configPath);
  if (Array.isArray(config?.plugin)) {
    const plugins = config.plugin.filter(
      (entry) =>
        typeof entry !== "string" ||
        !(
          entry === "cockpit-handoff.js" ||
          entry.endsWith("/cockpit-handoff.js")
        )
    );
    if (plugins.length !== config.plugin.length) {
      await writeJson(configPath, { ...config, plugin: plugins });
    }
  }
}

const GENERATED_BRIDGE = /^cawco-(?:handoff|context)(?:-[a-f0-9]+)?\.js$/;

/** A new import URL bypasses Bun's plugin module cache without restarting OpenCode. */
export async function writeHandoffPlugin(
  source: string,
  directory = OPENCODE_DIR
): Promise<string> {
  const plugins = join(directory, "plugins");
  const name = `cawco-context-${Bun.hash(source).toString(16)}.js`;
  const target = join(plugins, name);
  if (!(await Bun.file(target).exists())) {
    await Bun.write(target, source);
  }
  await retireLegacyHandoffPlugin(directory);
  const obsolete = (await readdir(plugins)).filter(
    (file) => file !== name && GENERATED_BRIDGE.test(file)
  );
  await Promise.all(
    obsolete.map((file) =>
      rename(
        join(plugins, file),
        join(plugins, `${file}.disabled-${Date.now()}`)
      )
    )
  );
  const configPath = join(directory, "opencode.json");
  const config = await readJson<Record<string, unknown>>(configPath);
  if (Array.isArray(config?.plugin)) {
    const remaining = config.plugin.filter(
      (entry) =>
        typeof entry !== "string" ||
        !GENERATED_BRIDGE.test(entry.split("/").pop() ?? "")
    );
    if (remaining.length !== config.plugin.length) {
      await writeJson(configPath, { ...config, plugin: remaining });
    }
  }
  return target;
}

/**
 * The server's identity under sessiond. One headless server per machine owns
 * every session, so one procId per machine — stable across agent restarts,
 * which is exactly what lets a returning agent find the server it left running
 * instead of starting a second one.
 */

/**
 * How long the announce line may take to reach the ring. Our choice: the SDK's
 * own `createOpencodeServer` default is 5 s
 * (`@opencode-ai/sdk/dist/server.js`, `timeout: 5000`); we allow more because
 * the child now boots through a daemon on a cold machine rather than as a
 * direct child, and a false timeout here starts a *second* server.
 */
export const SERVER_ANNOUNCE_TIMEOUT_MS = 30_000;
/** Recovery cancels the actual HTTP operation, never races an abandoned promise. */
export const RECOVERY_TIMEOUT_MS = 10_000;

/**
 * How long the first request for a directory may take on a server: it boots
 * the directory's OpenCode instance ({@link bootInstance}). With a plugin
 * installed, and CawCo's bridge plugin always is, the boot waits for
 * OpenCode's own install of `@opencode-ai/plugin` into every config dir that
 * has no `node_modules` yet (v1.18.34: `if (plugins.length) yield*
 * config.waitForDependencies()`, plugin/index.ts 184; the install,
 * config/config.ts 452-471; "no node_modules" → reify, core/src/npm.ts
 * 155-159). That is the machine's config dir on a machine's first start (9.4 s
 * measured, artifacts/opencode-accounts-eval/REPORT.md §7), and a project's
 * `.opencode` dir in every fresh clone. The config dir is every server's,
 * so an account's server never pays it again on its own empty data dir.
 *
 * The install is npm's Arborist on npm's own network settings
 * (core/src/npm-config.ts), so its bound is npm's: a stalled fetch is cut at
 * `fetch-timeout` (300 s) and tried `fetch-retries` (2) more times, after
 * waits of `fetch-retry-mintimeout` (10 s) and then that × `fetch-retry-factor`
 * (10) capped at `fetch-retry-maxtimeout` (60 s): @npmcli/config 10.8.1,
 * lib/definitions/definitions.js 662-717, the version OpenCode pins.
 */
export const INSTANCE_BOOT_TIMEOUT_MS = 3 * 300_000 + 10_000 + 60_000;

/** How long before a directory's deferred release is tried again. Ours: a held turn or a recovery is over in minutes, not seconds. */
const DIRECTORY_RELEASE_RETRY_MS = 30_000;

/**
 * How long a turn may go with no server event at all before the wait itself
 * is framed as a `provider_stalled` system note. Our choice: the hangs seen
 * live ran 6+ silent minutes, while first tokens on huge contexts can
 * legitimately take one or two — 3 minutes sits between "slow" and "stuck".
 * Fires at most once per turn; any server event re-arms it.
 */
export const STALLED_TURN_MS = 3 * 60_000;

/**
 * What an opencode session id looks like — the server's own shape (verified
 * live: it answers `Expected a string starting with "ses"` to anything else).
 * Every server call keyed by a caller-supplied session key is guarded by
 * {@link assertOpencodeKey}, so a cawco instance id handed over as a key is
 * refused here, loudly, and never sent: two sessions once went unrevivable
 * because the hub resumed them under their instance uuids.
 */
/**
 * Deterministic JSON serialization: sorts object keys at every level so that
 * logically identical configs always produce the same hash regardless of key
 * insertion order.
 */
const canonicalizeJson = (value: unknown): string => {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * Whether every leaf in `desired` is present in `resolved` with the same value.
 * The runtime config is not the desired document read back: the server fills in
 * its own defaults (`agent.*.options`), and the plugin list carries CawCo's
 * own injected `cawco-context-*.js`. It is a superset of the parts CawCo
 * controls, so convergence means containment, not equality.
 *
 * A key the server genuinely lacks is still divergence, and stays divergence —
 * that is the check having teeth. An invalid key in the operator's config (the
 * schema sets `additionalProperties: false` on a model entry, so a typo like
 * `tools` for `tool_call` is dropped on read) will therefore fail convergence
 * and be reported by name. That is correct: the operator's config is wrong and
 * should say so, rather than being silently tolerated here.
 */
const containsJson = (desired: unknown, resolved: unknown): boolean => {
  if (desired === undefined) {
    return true;
  }
  if (Array.isArray(desired)) {
    return (
      Array.isArray(resolved) &&
      desired.every((value) =>
        resolved.some(
          (candidate) => canonicalizeJson(value) === canonicalizeJson(candidate)
        )
      )
    );
  }
  if (desired !== null && typeof desired === "object") {
    return (
      resolved !== null &&
      typeof resolved === "object" &&
      !Array.isArray(resolved) &&
      Object.entries(desired).every(
        ([key, value]) =>
          Object.hasOwn(resolved, key) &&
          containsJson(value, (resolved as Record<string, unknown>)[key])
      )
    );
  }
  return desired === resolved;
};

/**
 * The fingerprint of an opencode.json for the running server: the sections a
 * server reads at startup (plugin, mcp, provider, agent, models) plus the
 * permission/tools policy passed via OPENCODE_CONFIG_CONTENT, which a change
 * also needs a restart for. Theme/keybinds/tui don't affect the backend.
 * Canonical, so key order never moves it.
 */
const configHash = (config: Record<string, unknown>): string =>
  createHash("sha256")
    .update(
      canonicalizeJson({
        agent: config.agent ?? config.mode,
        disabled_providers: config.disabled_providers,
        enabled_providers: config.enabled_providers,
        mcp: config.mcp,
        model: config.model,
        plugin: config.plugin,
        provider: config.provider,
        small_model: config.small_model,
        _policy: STATIC_POLICY,
      })
    )
    .digest("hex");

/**
 * Every write of the machine's opencode.json goes through here and says who
 * wrote it, so a hash change the watcher reports can be matched to its writer
 * — or, with no line before it, to a writer outside this agent.
 */
const writeOpencodeConfig = async (
  writer: string,
  config: Record<string, unknown>
): Promise<void> => {
  await writeJson(OPENCODE_CONFIG, config);
  console.info(
    `[opencode] config written by ${writer} hash=${configHash(config).slice(0, 8)}`
  );
};

const OPENCODE_SESSION_ID = /^ses_/;

const assertOpencodeKey = (key: string, what: string): void => {
  if (!OPENCODE_SESSION_ID.test(key)) {
    throw new Error(
      `${what}: "${key}" is not an opencode session id (they start with "ses_") — this looks like a cawco instance id`
    );
  }
};

/**
 * The port announcement, parsed agent-side. sessiond parses nothing — it hands
 * back the child's stdout lines opaque, and the meaning is decided here.
 *
 * The format is the server's own, and the rule below is byte-for-byte the
 * SDK's (`@opencode-ai/sdk/dist/server.js`: `line.startsWith("opencode server
 * listening")` then `/on\s+(https?:\/\/[^\s]+)/`). Verified against the
 * installed binary (opencode 1.18.19), which prints:
 *
 *   Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.
 *   opencode server listening on http://127.0.0.1:43663
 *
 * — hence a per-line scan rather than a read of the first line.
 */
const SERVER_ANNOUNCEMENT_URL_PATTERN = /on\s+(https?:\/\/[^\s]+)/;

export const parseServerAnnouncement = (line: string): string | undefined => {
  if (!line.startsWith("opencode server listening")) {
    return undefined;
  }
  return line.match(SERVER_ANNOUNCEMENT_URL_PATTERN)?.[1];
};

/**
 * Put `opencode serve` under sessiond — or find the one already there — and
 * return the URL it announced.
 *
 * This is the whole of opencode's sessiond story (design §4.2). opencode is
 * server-first: sessions live in the server's own DB, events are re-subscribable
 * per directory, and the adapter is a plain HTTP + SSE client. The only reason
 * an agent restart used to kill live opencode work was that `createOpencode`
 * spawned the server as the *agent's* child. So opencode gets process keeping
 * and nothing else — no neutral-frame ring, because the server is its own event
 * authority and duplicating its storage would be pure cost.
 *
 * If a live server is already held, its spec is NOT re-applied: keeping the
 * running process is the point, and a config change lands on the next machine
 * boot (or a deliberate `sessiond` stop), never by killing sessions.
 */
interface OpencodeServerAttach {
  procId?: string;
  sessiond: SessiondClient;
  signal?: AbortSignal;
  spec: ProcSpec;
  timeoutMs?: number;
}

const pendingServerAttachments = new WeakMap<
  SessiondClient,
  Map<string, Promise<{ url: string; freshlySpawned: boolean }>>
>();

/** One listener per client/procId: concurrent callers share its whole spawn and replay. */
export const attachOpencodeServer = (
  options: OpencodeServerAttach
): Promise<{ url: string; freshlySpawned: boolean }> => {
  let pending = pendingServerAttachments.get(options.sessiond);
  if (!pending) {
    pending = new Map();
    pendingServerAttachments.set(options.sessiond, pending);
  }
  const procId = options.procId ?? OPENCODE_SERVER_PROC_ID;
  const existing = pending.get(procId);
  if (existing) {
    return existing;
  }
  const attached = announceOpencodeServer(options).finally(() =>
    pending.delete(procId)
  );
  pending.set(procId, attached);
  return attached;
};

const announceOpencodeServer = async (
  options: OpencodeServerAttach
): Promise<{ url: string; freshlySpawned: boolean }> => {
  const procId = options.procId ?? OPENCODE_SERVER_PROC_ID;
  const timeoutMs = options.timeoutMs ?? SERVER_ANNOUNCE_TIMEOUT_MS;
  const client = options.sessiond;
  options.signal?.throwIfAborted();

  // Fresh, not the connect-time welcome: this client is long-lived and the
  // server may have exited since.
  const held = (await client.list()).procs.find(
    (proc) => proc.procId === procId
  );
  const freshlySpawned = !held?.alive;
  options.signal?.throwIfAborted();
  if (freshlySpawned) {
    await client.spawnProc(procId, options.spec);
  }

  const url = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", aborted);
      client.unsubscribe(procId);
      finish();
    };
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new Error(
              `[opencode] no "opencode server listening" line from ${procId} within ${timeoutMs}ms`
            )
          )
        ),
      timeoutMs
    );
    const aborted = () => settle(() => reject(options.signal?.reason));
    options.signal?.addEventListener("abort", aborted, { once: true });
    if (options.signal?.aborted) {
      aborted();
      return;
    }
    // From seq 0: the announce line is printed once, at boot, and a returning
    // agent reads it out of the replay ring long after it was written. That
    // replay IS the port discovery — there is nowhere else the port is written.
    client.subscribe(
      procId,
      {
        line: (event) => {
          const announced = parseServerAnnouncement(event.data);
          if (announced) {
            settle(() => resolve(announced));
          }
        },
        exit: (exitCode) =>
          settle(() =>
            reject(
              new Error(
                `[opencode] serve exited (code ${exitCode}) before announcing a port`
              )
            )
          ),
        // The ring outran the announce line. Honest refusal rather than a guess:
        // the URL is unrecoverable from here, and inventing one would attach the
        // fleet to nothing.
        reset: (nextSeq) =>
          settle(() =>
            reject(
              new Error(
                `[opencode] ${procId}'s replay window lost the port announcement (resumes at ${nextSeq})`
              )
            )
          ),
      },
      0
    );
  });
  return { url, freshlySpawned };
};

/**
 * The fleet's Chrome DevTools MCP server, by its fleet name
 * (`mcp-launcher.ts`). A workspace session's writes captures to the
 * workspace's scratch as well as its clone. It writes a `filePath` only
 * inside its roots: the ones its client answers `roots/list` with, those
 * named by `--filesystem-root` ("A directory that filesystem tools are
 * allowed to access. May be specified more than once.", chrome-devtools-mcp
 * 1.10.1 build/src/config/mcp-options.js) and its own temp dir. OpenCode
 * answers `roots/list` with the session's directory alone (1.18.34:
 * `roots:[{uri:<directory>}]`) and starts a local server per directory, so
 * the bridge plugin gives the clone's instance the scratch as a filesystem
 * root. Its temp dir stays the machine's: Chromium refuses a temp dir as
 * deep as a workspace's scratch ("Socket path too long",
 * process_singleton_posix.cc), and the plugin's judge refuses a capture
 * there anyway, as it refuses every write outside the clone, the scratch and
 * the workspace caches.
 */
const CHROME_DEVTOOLS = "chrome-devtools";

/** The mark in a workspace's state dir that turns OpenCode's plan agent off in its clone ({@link disablePlanAgentFor}). */
const PLAN_AGENT_OFF = "opencode-plan-agent-off";

/** The dir in a workspace's state dir where the bridge plugin records each session's saved outputs, a file per session. */
const SAVED_OUTPUTS = "opencode-saved-outputs";

/**
 * Supplies each `cawco_*` call its session's credential, the workflow-only
 * tool enabled by each session's tool mask, and — in a delegation
 * workspace's clone — the `bash` that runs every command through the
 * workspace's executor, inside its boundary. A plugin tool named like a
 * built-in takes its place (opencode.ai/docs/plugins: "If a plugin tool uses
 * the same name as a built-in tool, the plugin tool takes precedence").
 *
 * The credential is added to the call's arguments object in place, never by
 * replacing it: OpenCode hands `tool.execute.before` the very `args` object
 * the MCP call then sends (`trigger(…, { args })`, then `execute(args, …)`,
 * packages/opencode/src/session/tools.ts), so a replacement is lost
 * (anomalyco/opencode#31680) and a property set on it is not. It comes from
 * {@link opencodeCredentialFile} by OpenCode's own session id, never from
 * anything the model wrote: the model's own `__cawco` is overwritten.
 * The plugin is set up once per directory, which is the workspace's clone
 * for every session a work item runs there.
 *
 * Anywhere inside a workspace's clone it also judges every other call before it runs, by
 * the workspace's policy (`workspace-policy.ts`): OpenCode's file tools
 * (read, edit, write, apply_patch, glob, grep, list, lsp) and MCP calls run
 * in its server, on the host, outside any boundary. A path the policy
 * refuses throws, which refuses the call with the reason the model reads
 * (opencode.ai/docs/plugins: a `tool.execute.before` that throws stops the
 * call). The judge is the copy the agent writes into the workspace's state
 * dir beside the hook's, and the policy is read at each call; a policy that
 * cannot be read refuses the call.
 *
 * Every OpenCode server on the machine loads it, an account's own server
 * ({@link accountServerSpec}) too. That one runs under the account's
 * `XDG_DATA_HOME`, which only OpenCode's own paths are to read: OpenCode
 * reads it once, when it starts (`xdgData`, packages/core/src/global.ts 11 at
 * v1.18.34), and loads plugins before an instance starts anything
 * (project/bootstrap.ts: "Plugin can mutate config so it has to be
 * initialized before anything else"). So the plugin gives the machine's own
 * back as it loads, and every shell, MCP server and LSP the server starts
 * reads and writes the user's data where it always has.
 */
export const buildHandoffPluginSource =
  (): string => `import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { tool } from "@opencode-ai/plugin";
// Where this server saves a truncated tool output for the model to read back:
// \`tool-output\` in the data dir OpenCode read as it started, before the
// swap below (tool/truncation-dir.ts, core/src/global.ts 11 at 1.18.34).
const cawcoToolOutput = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "tool-output");
if (process.env.CAWCO_XDG_DATA_HOME !== undefined) {
  if (process.env.CAWCO_XDG_DATA_HOME) process.env.XDG_DATA_HOME = process.env.CAWCO_XDG_DATA_HOME;
  else delete process.env.XDG_DATA_HOME;
  delete process.env.CAWCO_XDG_DATA_HOME;
}
// CawCo's launch flags and wiring (CAWCO_GATE_FORM, CAWCO_ACCOUNT_CREDENTIAL;
// they are read off the launch spec, never this process) and its embedded
// pi's package dir stay out of what the server starts: a session gets only
// the CAWCO_* its tools read (core session-env.ts).
for (const name of Object.keys(process.env)) {
  if (name === "PI_PACKAGE_DIR" || (name.startsWith("CAWCO_") && !${JSON.stringify(SESSION_CAWCO_ENV)}.includes(name))) delete process.env[name];
}
const cawcoBase = ${JSON.stringify(harnessMcpUrl(""))};
const cawcoWorkspaces = ${JSON.stringify(workspacesDir())};
const cawcoCredentials = ${JSON.stringify(opencodeCredentialFile())};
const realOf = (path) => { try { return realpathSync(path); } catch { return path; } };
const cawcoPlacedMcp = ${JSON.stringify(OPENCODE_PLACED_MCP)};
// The project MCP servers CawCo placed (the agent's placeOpencodeMcp) at the
// deepest place holding \`directory\`, real paths on whole path segments, put
// into \`cfg\`. A server the loaded config already names stays as it is.
const placedMcpFor = (cfg, directory) => {
  let placed = {};
  try { placed = JSON.parse(readFileSync(cawcoPlacedMcp, "utf8")); } catch { return; }
  const here = realOf(directory);
  let place;
  for (const { cwd } of Object.values(placed)) {
    const root = realOf(cwd);
    if ((here === root || here.startsWith(root + "/")) && !(place && place.length >= root.length)) place = root;
  }
  if (!place) return;
  for (const { cwd, name, entry } of Object.values(placed)) {
    if (realOf(cwd) === place && !(cfg.mcp && name in cfg.mcp)) cfg.mcp = { ...cfg.mcp, [name]: entry };
  }
};
// The workspace whose clone holds \`directory\`, by the records the agent keeps
// for it outside the clone: \`create.json\`, written before the clone is cut and
// removed only with it, and the running boundary's \`boundary.json\`, the first
// that names a path. The clone itself or any directory inside it, both at
// their real paths, whole path segments only; of clones inside one another,
// the deepest (the agent's workspaceHolding, workspace-records.ts).
const workspaceOf = (directory) => {
  let ids = [];
  try { ids = readdirSync(cawcoWorkspaces); } catch { return undefined; }
  const at = realOf(directory);
  let found;
  for (const id of ids) {
    let path;
    for (const name of ["create.json", "boundary.json"]) {
      try { path = JSON.parse(readFileSync(cawcoWorkspaces + "/" + id + "/" + name, "utf8")).path; } catch {}
      if (typeof path === "string") break;
    }
    if (typeof path !== "string") continue;
    const root = realOf(path);
    if ((at === root || at.startsWith(root + "/")) && !(found && found.root.length >= root.length)) found = { id, root };
  }
  return found;
};
// The workspace's boundary as it stands at the call. None means the command
// does not run: never the built-in bash, which would run it outside.
const boundaryOf = (id, root) => {
  let held;
  try { held = JSON.parse(readFileSync(cawcoWorkspaces + "/" + id + "/boundary.json", "utf8")); } catch (error) {
    throw new Error("cawco: workspace " + id + "'s boundary could not be read (" + error.message + "), so this command did not run. The workspace's next session starts it again.");
  }
  if (typeof held.path !== "string" || realOf(held.path) !== root || typeof held.exec !== "string") {
    throw new Error("cawco: workspace " + id + "'s boundary record does not name this clone, so this command did not run.");
  }
  return held;
};
// Judges a call of workspace \`id\`'s session by the workspace's policy, and
// throws its refusal. A judge or policy that cannot be read refuses it too.
// \`saved\` is every output the session may read back (\`savedOutputs\`).
const judgeIn = async (id, tool, args, directory, saved) => {
  const state = cawcoWorkspaces + "/" + id;
  let judge;
  let policy;
  try {
    judge = await import(state + "/" + ${JSON.stringify(JUDGE_SCRIPT)});
    policy = judge.readPolicy(state + "/" + ${JSON.stringify(WORKSPACE_POLICY_NAME)});
  } catch (error) {
    throw new Error("cawco: " + tool + " was refused: workspace " + id + "'s file policy could not be read (" + (error instanceof Error ? error.message : String(error)) + ").");
  }
  const verdict = judge.judgeCall(policy, { harness: "opencode", tool, input: args, cwd: directory, toolOutput: cawcoToolOutput, savedOutputs: saved });
  if (!verdict.ok) throw new Error(verdict.reason);
};
// The outputs this server saved for each session of workspace \`id\`, one
// file per session in the workspace's state dir, which the session's tools
// never write: the server's tool-output dir holds every session's, by
// tool-call id alone, so a session reads back only what it was told it saved.
const SESSION_ID = /^[A-Za-z0-9_-]+$/;
const savedFile = (id, sessionID) => {
  if (!SESSION_ID.test(sessionID)) throw new Error("session id " + JSON.stringify(sessionID) + " names no file");
  return cawcoWorkspaces + "/" + id + "/" + ${JSON.stringify(SAVED_OUTPUTS)} + "/" + sessionID;
};
// The file a call's result says this server saved: OpenCode's own hint
// names it ("Full output saved to: <file>", tool/truncate.ts and
// tool/shell.ts at 1.18.34) and its metadata carries it as \`outputPath\`,
// in this server's tool-output dir. Text the tool printed alone names none.
const savedOutputOf = (output) => {
  const file = output?.metadata?.outputPath;
  if (output?.metadata?.truncated !== true || typeof file !== "string" || dirname(file) !== cawcoToolOutput) return undefined;
  return typeof output.output === "string" && output.output.includes("Full output saved to: " + file) ? file : undefined;
};
const recordSaved = (id, sessionID, file) => {
  const record = savedFile(id, sessionID);
  mkdirSync(dirname(record), { recursive: true });
  appendFileSync(record, file + "\\n");
};
const savedBy = (id, sessionID) => {
  try {
    return readFileSync(savedFile(id, sessionID), "utf8").split("\\n").filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};
const OUTPUT_LIMIT = 30000;
// What each code-mode program's calls answered, by session and the program's
// own call, until the program's result is written: OpenCode records each
// call's name, input and status on the \`execute\` part, never what it returned.
const codeCalls = new Map();
const sessionHeld = (sessionID) => {
  try { return JSON.parse(readFileSync(cawcoCredentials, "utf8"))[sessionID]; } catch { return undefined; }
};
const sessionEnv = (sessionID) => {
  const held = sessionHeld(sessionID);
  return held ? { ${JSON.stringify(CAWCO_ENV.instanceId)}: held.instanceId, ${JSON.stringify(CAWCO_ENV.sessionCredential)}: held.credential } : {};
};
const boundedBash = (id, root) => tool({
  description: "Runs a bash command inside this workspace's boundary, in the session's directory unless workdir says otherwise. The command can write only the clone, /tmp (the workspace's own) and the workspaces' own package cache; it reads none of the credentials CawCo, the harnesses and the machine's tools keep; it sees and signals only this workspace's processes, and cannot reach the service manager. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.",
  args: {
    command: tool.schema.string().describe("The command to run"),
    timeout: tool.schema.number().optional().describe("Milliseconds before the command is killed: 120000 unless given, at most 600000"),
    workdir: tool.schema.string().optional().describe("The directory to run in; the session's directory unless given"),
    description: tool.schema.string().describe("What the command does, in 5-10 words"),
  },
  async execute(args, context) {
    const held = boundaryOf(id, root);
    const timeout = Math.min(args.timeout ?? 120000, 600000);
    const child = spawn(held.exec, [args.command], { cwd: args.workdir ?? context.directory, env: { ...process.env, ...sessionEnv(context.sessionID) }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const take = (chunk) => { output += chunk.toString(); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    context.abort.addEventListener("abort", stop, { once: true });
    const exit = await new Promise((resolve) => {
      child.on("error", (error) => { output += String(error); resolve(127); });
      child.on("close", (code, signal) => resolve(code ?? signal));
    });
    clearTimeout(timer);
    context.abort.removeEventListener("abort", stop);
    const cut = output.length > OUTPUT_LIMIT ? output.slice(0, OUTPUT_LIMIT) + "\\n[output cut at " + OUTPUT_LIMIT + " characters]" : output;
    const notes = (timedOut ? "\\n[killed after " + timeout + "ms]" : "") + (exit === 0 ? "" : "\\n[exit " + exit + "]");
    return { title: args.description, output: cut + notes, metadata: { exit, description: args.description } };
  },
});
export const CawcoContext = async ({ directory, serverUrl }) => {
// A session anywhere inside a workspace's clone is that workspace's.
const holding = workspaceOf(directory);
const workspace = holding?.id;
// Each session's parent, as its server keeps it (\`parentID\`, GET
// /session/:sessionID): a subagent reads back what its parents saved too,
// the files OpenCode's hint hands it. A session's parent never changes.
const parents = new Map();
const parentOf = async (sessionID) => {
  if (parents.has(sessionID)) return parents.get(sessionID);
  const url = new URL("/session/" + encodeURIComponent(sessionID), serverUrl);
  url.searchParams.set("directory", directory);
  const response = await fetch(url);
  if (!response.ok) throw new Error("session " + sessionID + " could not be read: " + response.status + " " + await response.text());
  const parent = (await response.json()).parentID;
  parents.set(sessionID, typeof parent === "string" ? parent : undefined);
  return parents.get(sessionID);
};
const savedFor = async (id, sessionID) => {
  const lineage = [];
  for (let at = sessionID; at && !lineage.includes(at); at = await parentOf(at)) lineage.push(at);
  return lineage.flatMap((one) => savedBy(id, one));
};
const cawcoStep = async (context) => {
  const response = await fetch(cawcoBase + "/api/instances");
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  const actor = rows.find(row => row.sessionId === context.sessionID && row.cwd === directory && row.workflowStepId);
  if (!actor) throw new Error("This tool is available only to workflow steps.");
  return actor;
};
return ({
  tool: {
    cawco_submit_result: tool({
      description: "Call exactly once with an object matching the schema in your instructions, then end your turn. The hub's validation message is returned verbatim on failure.",
      args: { result: tool.schema.record(tool.schema.string(), tool.schema.unknown()) },
      async execute({ result }, context) {
        const actor = await cawcoStep(context);
        const recorded = await fetch(cawcoBase + "/api/workflow-steps/" + encodeURIComponent(actor.workflowStepId) + "/result", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instanceId: actor.id, result })
        });
        return recorded.text();
      }
    }),
    cawco_workflow_state_read: tool({
      description: "Read a named slot of this workflow run's shared state. Only slots the run's program declared with w.state(name, schema) exist.",
      args: { name: tool.schema.string() },
      async execute({ name }, context) {
        const actor = await cawcoStep(context);
        const read = await fetch(cawcoBase + "/api/workflow-runs/" + encodeURIComponent(actor.workflowRunId) + "/state/" + encodeURIComponent(name) + "?instanceId=" + encodeURIComponent(actor.id));
        if (!read.ok) throw new Error(await read.text());
        return read.text();
      }
    }),
    cawco_workflow_state_write: tool({
      description: "Write a named slot of this workflow run's shared state. The value is validated against the schema the run's program declared; the validator's message comes back verbatim on failure.",
      args: { name: tool.schema.string(), value: tool.schema.unknown() },
      async execute({ name, value }, context) {
        const actor = await cawcoStep(context);
        const written = await fetch(cawcoBase + "/api/workflow-runs/" + encodeURIComponent(actor.workflowRunId) + "/state/" + encodeURIComponent(name), {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instanceId: actor.id, value })
        });
        return written.text();
      }
    }),
    ...(holding ? { bash: boundedBash(holding.id, holding.root) } : {})
  },
  // A workspace's own config, given to its directory's instance as OpenCode
  // loads it, never written into the clone: plugins run before anything
  // else and are handed the instance's loaded config to change
  // (project/bootstrap.ts 37-38, plugin/index.ts 244-250 at 1.18.34), after
  // every file and OPENCODE_CONFIG_CONTENT were merged (config/config.ts
  // 415-489). The workspace's scratch is a root of its chrome-devtools-mcp
  // (CHROME_DEVTOOLS in the agent says why). OpenCode's plan agent is
  // off for a workspace whose delegate type turns CawCo's to-dos on
  // (disablePlanAgentFor). A project's MCP servers come to any directory a
  // place of it holds, checkout or clone (placeOpencodeMcp).
  config: async (cfg) => {
    placedMcpFor(cfg, directory);
    if (!workspace) return;
    const state = cawcoWorkspaces + "/" + workspace;
    // The clone too: in a directory inside it, roots/list names that directory alone.
    const { clone, scratch } = JSON.parse(readFileSync(state + "/" + ${JSON.stringify(WORKSPACE_POLICY_NAME)}, "utf8"));
    const devtools = cfg.mcp?.[${JSON.stringify(CHROME_DEVTOOLS)}];
    if (devtools?.type === "local" && Array.isArray(devtools.command) && typeof scratch === "string" && typeof clone === "string") {
      cfg.mcp[${JSON.stringify(CHROME_DEVTOOLS)}] = { ...devtools, command: [...devtools.command, "--filesystem-root=" + scratch, "--filesystem-root=" + clone] };
    }
    if (existsSync(state + "/" + ${JSON.stringify(PLAN_AGENT_OFF)})) {
      cfg.agent = { ...cfg.agent, plan: { ...cfg.agent?.plan, disable: true } };
    }
  },
  "tool.execute.before": async (input, output) => {
    if (workspace) {
      let saved;
      try {
        saved = await savedFor(workspace, input.sessionID);
      } catch (error) {
        throw new Error("cawco: " + input.tool + " was refused: the outputs this session saved could not be read (" + (error instanceof Error ? error.message : String(error)) + ").");
      }
      await judgeIn(workspace, input.tool, output.args, directory, saved);
    }
    if (input.tool.startsWith("cawco_")) {
      const credential = sessionHeld(input.sessionID)?.credential;
      if (typeof credential !== "string" || !credential) {
        throw new Error("This OpenCode session holds no CawCo session credential, so it cannot call CawCo tools.");
      }
      output.args.__cawco = { credential };
    }
  },
  // A call a code-mode program made runs as \`<program's call>/<n>\`; what it
  // answered is kept, and written onto the program's own result as
  // \`metadata.calls\` when it ends, so the transcript shows each call as the
  // row it would be when made directly — live, and read back alike.
  "tool.execute.after": async (input, output) => {
    // Every tool OpenCode cuts runs through here with its cut already made
    // (tool/tool.ts and tool/registry.ts truncate inside the call, before
    // this hook); an MCP tool reached directly is cut after it, but the
    // fleet's servers run code mode, where it is reached through \`execute\`.
    const saved = workspace ? savedOutputOf(output) : undefined;
    if (saved) recordSaved(workspace, input.sessionID, saved);
    const slash = input.callID.indexOf("/");
    if (slash > 0) {
      const key = input.sessionID + " " + input.callID.slice(0, slash);
      const { __cawco, ...args } = input.args ?? {};
      codeCalls.set(key, [...(codeCalls.get(key) ?? []), {
        id: input.callID,
        tool: input.tool,
        input: args,
        content: output.content ?? [],
        ...(output.isError ? { isError: true } : {}),
        ...(output.structuredContent ? { structuredContent: output.structuredContent } : {}),
      }]);
      return;
    }
    if (input.tool === ${JSON.stringify(CODE_MODE_TOOL)}) {
      const key = input.sessionID + " " + input.callID;
      output.metadata = { ...output.metadata, calls: codeCalls.get(key) ?? [] };
      codeCalls.delete(key);
    }
  },
  // A program that throws ends without its \`after\`: the calls it made before
  // the throw are written onto its part once it has settled, which OpenCode
  // never writes again.
  event: async ({ event }) => {
    if (event.type !== "message.part.updated") return;
    const part = event.properties.part;
    if (part.type !== "tool" || part.tool !== ${JSON.stringify(CODE_MODE_TOOL)} || part.state.status !== "error") return;
    const key = part.sessionID + " " + part.callID;
    const calls = codeCalls.get(key);
    if (!calls) return;
    codeCalls.delete(key);
    const url = new URL("/session/" + part.sessionID + "/message/" + part.messageID + "/part/" + part.id, serverUrl);
    url.searchParams.set("directory", directory);
    const written = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...part, state: { ...part.state, metadata: { ...part.state.metadata, calls } } }),
    });
    if (!written.ok) throw new Error("Could not record what a code-mode program's calls answered: " + written.status + " " + await written.text());
  },
  // Every shell a session's tool opens acts as that session: \`cawco tool\`
  // there sends its own credential. A shell no session opened gets none.
  "shell.env": async (input, output) => {
    if (input.sessionID) {
      Object.assign(output.env, sessionEnv(input.sessionID));
    }
  },
});
};`;

/**
 * Whether a parked permission should be auto-allowed by the daemon itself.
 *
 * A question always routes — the parent session, or the user, answers it. Only
 * `acceptEdits` is left to the caller: granting edits alone needs the
 * permission's own type, which this decision does not see.
 *
 * Full Send is bypass here. Bypass already answers every tool ask opencode
 * raises: it has no safety check of its own that outlasts bypass, no plan
 * approval to put to the owner, and an ask names no rule it came from.
 */
export function autoAllows(
  permissionMode: string | undefined,
  kind: "question" | "tool"
): boolean {
  if (kind === "question") {
    return false;
  }
  return (
    permissionMode === "bypassPermissions" || permissionMode === "fullSend"
  );
}

/** opencode's own name for the tool a question rides on. */
const QUESTION_TOOL = "question";

/**
 * What a question part is written down as. opencode calls the tool `question`;
 * the rest of the fleet calls it {@link ASK_USER_QUESTION}, and the renderer
 * keys off that name, so the rename happens here rather than in the dashboard.
 */
const toolNameOf = (tool: string): string =>
  tool === QUESTION_TOOL ? ASK_USER_QUESTION : tool;

/**
 * A tool call's input as the fleet sees it. The session credential the
 * plugin stamps into a CawCo call (`__cawco`) is the session's secret, never
 * the transcript's, whenever OpenCode's part happens to carry it.
 */
const toolInputOf = (
  input: Record<string, unknown>
): Record<string, unknown> => {
  const { __cawco: _secret, ...rest } = input;
  return rest;
};

/** opencode's question shape, which says `multiple` where the fleet says `multiSelect`. */
const questionsOf = (raw: unknown): UserQuestion[] | null => {
  if (!Array.isArray(raw)) {
    return null;
  }
  const questions: UserQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const q = item as {
      question?: unknown;
      header?: unknown;
      options?: unknown;
      multiple?: unknown;
    };
    if (typeof q.question !== "string" || !Array.isArray(q.options)) {
      return null;
    }
    questions.push({
      question: q.question,
      header: typeof q.header === "string" ? q.header : q.question,
      options: q.options as UserQuestion["options"],
      multiSelect: q.multiple === true,
    });
  }
  return questions;
};

/**
 * How a question ended, read off the part opencode already keeps: the asked
 * questions live in `state.input`, and the reader's choices in
 * `state.metadata.answers` as one label array per question, in the order they
 * were asked.
 *
 * Taking it from the part rather than from the `question.*` events is what
 * makes every route agree. The part completes whether the answer came through
 * cawco, through opencode's own TUI, or from any other client on the server —
 * and because opencode stores it, a reloaded transcript replays it too. Events
 * would have covered only the live case, and only the routes we thought of.
 *
 * `null` for any part that is not a question, which is every other tool.
 */
function questionResultOf(part: {
  tool: string;
  state: { status: string; input?: unknown; metadata?: unknown };
}): UserQuestionResult | null {
  if (part.tool !== QUESTION_TOOL) {
    return null;
  }
  const questions = questionsOf(
    (part.state.input as { questions?: unknown } | undefined)?.questions
  );
  if (!questions) {
    return null;
  }
  const raw = (part.state.metadata as { answers?: unknown } | undefined)
    ?.answers;
  // A question that completed carrying no answers is one the reader walked away
  // from; it is not an answered question with an empty map, and saying so is the
  // whole reason the outcome is a union.
  if (!Array.isArray(raw)) {
    return { outcome: "dismissed", questions };
  }
  const answers: UserAnswers = {};
  questions.forEach((question, i) => {
    const picked = Array.isArray(raw[i]) ? (raw[i] as string[]) : [];
    // opencode answers uniformly in arrays. The array is kept only where the
    // question allowed several — a lone choice stored as a one-element array
    // would draw as a list of one.
    answers[question.question] = question.multiSelect
      ? picked
      : (picked[0] ?? "");
  });
  return { outcome: "answered", questions, answers };
}

/** A fleet MCP definition, in opencode's `opencode.json` `mcp` shape. */
const toOpencodeMcp = (
  config: FleetMcpConfig
): McpLocalConfig | McpRemoteConfig => {
  if ("url" in config) {
    return {
      type: "remote",
      url: config.url,
      enabled: true,
      oauth: false,
      ...(config.headers ? { headers: config.headers } : {}),
    };
  }
  return {
    type: "local",
    enabled: true,
    command: [config.command, ...(config.args ?? [])],
    ...(config.env ? { environment: config.env } : {}),
  };
};

/** Merges the fleet's servers into `opencode.json`, preserving every other key. */
const syncOpencodeMcp = async (
  desired: { name: string; config: FleetMcpConfig; enabled: boolean }[],
  managed: string[],
  report: Record<string, FleetItemState>
): Promise<string[]> => {
  const wanted = desired.filter((server) => server.enabled);
  const stored =
    (await readJson<Record<string, unknown>>(OPENCODE_CONFIG)) ?? {};
  const mcp = (stored.mcp as Record<string, unknown> | undefined) ?? {};

  for (const server of wanted) {
    mcp[server.name] = toOpencodeMcp(server.config);
  }
  const names = wanted.map((server) => server.name);
  for (const name of managed) {
    if (names.includes(name)) {
      continue;
    }
    delete mcp[name];
    report[name] = { state: "removed" };
  }

  await writeOpencodeConfig("fleet sync", { ...stored, mcp });
  return names;
};

/**
 * The project MCP servers CawCo places for OpenCode on this machine, by
 * `<name>@<place id>`, each with its place's folder and its OpenCode entry.
 * The agent's own file, outside every folder: the bridge plugin's `config`
 * hook hands a directory's instance the servers of the deepest place that
 * holds it as OpenCode loads it, so nothing is written into a place.
 */
const OPENCODE_PLACED_MCP = join(OPENCODE_DIR, "cawco-placed-mcp.json");

type PlacedMcp = Record<string, { cwd: string; name: string; entry: unknown }>;

/**
 * A project's MCP servers at each of its places on this machine
 * (`FleetConfig.placedMcp`), for OpenCode, as Claude Code gets them in each
 * place's `.claude.json` map: {@link OPENCODE_PLACED_MCP} rewritten whole.
 * Answers each copy's state under `<name>@<place id>`, a copy no longer
 * carried as removed. A hub that predates placement sends no list, and the
 * file is left as it is.
 */
const placeOpencodeMcp = async (
  desired: FleetMcpServer[] | undefined
): Promise<Record<string, FleetItemState>> => {
  if (!desired) {
    return {};
  }
  const before = (await readJson<PlacedMcp>(OPENCODE_PLACED_MCP)) ?? {};
  const placed: PlacedMcp = {};
  const report: Record<string, FleetItemState> = {};
  for (const server of desired) {
    if (!(server.enabled && server.cwd && server.placeId)) {
      continue;
    }
    const key = `${server.name}@${server.placeId}`;
    if (existsSync(server.cwd)) {
      placed[key] = {
        cwd: server.cwd,
        name: server.name,
        entry: toOpencodeMcp(server.config),
      };
      report[key] = { state: "applied" };
    } else {
      report[key] = {
        state: "failed",
        detail: `${server.cwd} is not on this machine`,
      };
    }
  }
  for (const key of Object.keys(before)) {
    report[key] ??= { state: "removed" };
  }
  await writeJson(OPENCODE_PLACED_MCP, placed);
  return report;
};

const recordOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

/**
 * OpenCode's `plan` primary agent under the fleet's "CawCo's to-dos" choice:
 * on, `agent.plan.disable` (OpenCode deletes a disabled agent from its list
 * when it loads its config); off, taken back only when CawCo set it. Answers
 * whether CawCo holds the setting now, for the sidecar.
 */
const syncPlanAgent = async (
  todosOn: boolean,
  ours: boolean
): Promise<boolean> => {
  const stored =
    (await readJson<Record<string, unknown>>(OPENCODE_CONFIG)) ?? {};
  const { plan: storedPlan, ...others } = recordOf(stored.agent);
  const { disable, ...planRest } = recordOf(storedPlan);
  if (todosOn ? disable === true : !(ours && disable === true)) {
    return todosOn && ours;
  }
  const plan = todosOn ? { ...planRest, disable: true } : planRest;
  const agent =
    Object.keys(plan).length > 0 ? { ...others, plan } : { ...others };
  const { agent: _agent, ...rest } = stored;
  await writeOpencodeConfig(
    "fleet sync",
    Object.keys(agent).length > 0 ? { ...rest, agent } : rest
  );
  return todosOn;
};

/**
 * OpenCode's `plan` agent for one session whose own delegate type turns
 * "CawCo's to-dos" on while the fleet's choice is off (the fleet's turns it
 * off machine-wide, `syncPlanAgent`): a {@link PLAN_AGENT_OFF} mark in its
 * workspace's state dir, which the bridge plugin's `config` hook reads as
 * the clone's instance loads and turns into `agent.plan.disable` there.
 * Nothing is written into the clone. The workspace is the one whose clone
 * holds the session's directory, as the plugin finds it; a session outside
 * every clone is said in the log and left as it is.
 */
const disablePlanAgentFor = async (
  spec: SpawnPayload,
  cwd: string
): Promise<void> => {
  if (!spec.cawcoTodos || (await resolvedFleetDenials()).cawcoTodos) {
    return;
  }
  const workspace = await workspaceHolding(cwd);
  if (!workspace) {
    console.warn(
      `[opencode] ${spec.instanceId}: its delegate type turns CawCo's to-dos on, but it runs in ${cwd}, inside no workspace's clone, so OpenCode's plan agent is left as it is there.`
    );
    return;
  }
  await Bun.write(join(workspaceStateDir(workspace.id), PLAN_AGENT_OFF), "");
};

/** A line CawCo's `excludeFromCheckout` added for an `opencode.jsonc` it wrote into a clone, at its root or in a directory inside it. */
const CAWCO_CONFIG_LINE = /^\/(?:.+\/)?opencode\.jsonc$/;

/**
 * Every `opencode.jsonc` CawCo's earlier writers could have left in a
 * workspace's clone (e1ab8f11's `capturesToScratch` and the clone-config
 * `disablePlanAgentFor` before it), exactly as `writeJson` wrote it
 * (`JSON.stringify(value, null, 2)`): `agent.plan.disable`, an `mcp` holding
 * the fleet's chrome-devtools entry with the scratch as a filesystem root,
 * or the empty `mcp` left once the fleet dropped that server, alone or
 * together, in the order the writes came.
 */
const cawcoSessionConfigs = (
  root: Record<string, unknown> | undefined
): Buffer[] => {
  const agent = { plan: { disable: true } };
  const shapes: Record<string, unknown>[] = [{ agent }];
  for (const mcp of [{}, ...(root ? [{ [CHROME_DEVTOOLS]: root }] : [])]) {
    shapes.push({ mcp }, { agent, mcp }, { mcp, agent });
  }
  return shapes.map((shape) => Buffer.from(JSON.stringify(shape, null, 2)));
};

/** The CawCo-written `opencode.jsonc` files {@link removeCawcoSessionConfigs} removes from one clone, and their exclude lines; how many. */
const removeCawcoSessionConfigsIn = async (
  ref: WorkspaceRef,
  fleet: Record<string, unknown>
): Promise<number> => {
  const exclude = await gitIn(ref.path, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "info/exclude",
  ]);
  if (!exclude) {
    return 0;
  }
  const lines = (await readFile(exclude, "utf8").catch(() => "")).split("\n");
  const top = await realpath(ref.path);
  const known = cawcoSessionConfigs(
    fleet.type === "local" && Array.isArray(fleet.command)
      ? {
          ...fleet,
          command: [
            ...fleet.command,
            `--filesystem-root=${workspaceScratchDir(ref.id)}`,
          ],
        }
      : undefined
  );
  const gone: string[] = [];
  for (const line of lines.filter((one) => CAWCO_CONFIG_LINE.test(one))) {
    const inside = line.slice(1);
    const file = join(top, inside);
    // biome-ignore lint/performance/noAwaitInLoops: one clone's few lines, each read and judged in turn
    const bytes = await readFile(file).catch(() => undefined);
    if (
      bytes &&
      known.some((one) => one.equals(bytes)) &&
      (await gitIn(top, ["ls-files", "--error-unmatch", "--", inside])) ===
        undefined
    ) {
      await rm(file);
      gone.push(line);
    }
  }
  if (gone.length > 0) {
    await writeFile(
      exclude,
      lines.filter((line) => !gone.includes(line)).join("\n")
    );
  }
  return gone.length;
};

/**
 * At the agent's start: the `opencode.jsonc` files CawCo once wrote into
 * workspace clones (the bridge plugin's `config` hook gives an instance that
 * config now, and nothing is written into a clone), each removed with its
 * `info/exclude` line only when it is byte for byte what CawCo's writer made
 * for that workspace ({@link cawcoSessionConfigs}) and untracked; every
 * other file is left as it is. Says how many it removed.
 */
export const removeCawcoSessionConfigs = async (): Promise<void> => {
  let removed = 0;
  try {
    const fleet = recordOf(
      recordOf((await readJson<{ mcp?: unknown }>(OPENCODE_CONFIG))?.mcp)[
        CHROME_DEVTOOLS
      ]
    );
    for (const ref of await workspaceRefs()) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: clones are judged one at a time, at start, off the hot path
        removed += await removeCawcoSessionConfigsIn(ref, fleet);
      } catch (error) {
        console.warn(
          `[opencode] workspace ${ref.id}: its clone's opencode.jsonc is left as it is: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } catch (error) {
    console.warn(
      `[opencode] the opencode.jsonc files CawCo once wrote into clones were not looked for: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  console.log(
    `[opencode] start: removed ${removed} opencode.jsonc file(s) CawCo once wrote into workspace clones`
  );
};

const EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

const COMMAND_KINDS: Partial<Record<string, SlashCommand["kind"]>> = {
  skill: "skill",
  mcp: "mcp",
  command: "custom",
};

export const OPENCODE_CAPABILITIES: HarnessCapabilities = {
  interrupt: true,
  permissionModes: [
    "default",
    "acceptEdits",
    "plan",
    "bypassPermissions",
    "fullSend",
  ],
  setModel: true,
  effort: true,
  contextUsage: true,
  supportedModels: true,
  supportedCommands: true,
  reloadSkills: true,
  mcpStatus: true,
  mcpControl: true,
  listSessions: true,
  getSessionMessages: true,
  renameSession: true,
  deleteSession: true,
  fork: true,
  rewind: true,
  tagSession: true,
  skills: true,
  subagents: true,
  tasks: true,
  compaction: true,
  costUsd: true,
  thinking: true,
  images: true,
  handoff: true,
  hooks: false,
  plugins: true,
  fleet: true,
};

/** The scratch tag sidecar — opencode sessions have no tag, so cawco keeps its own. */
const TAGS_PATH = join(homedir(), ".config", "opencode", "cawco-tags.json");

const readTags = async (): Promise<Record<string, string>> => {
  const file = Bun.file(TAGS_PATH);
  if (!(await file.exists())) {
    return {};
  }
  try {
    return (await file.json()) as Record<string, string>;
  } catch {
    return {};
  }
};

const writeTag = async (
  sessionId: string,
  tag: string | null
): Promise<void> => {
  const tags = await readTags();
  if (tag === null) {
    delete tags[sessionId];
  } else {
    tags[sessionId] = tag;
  }
  await Bun.write(TAGS_PATH, JSON.stringify(tags));
};

/**
 * The opencode sessions with a turn this agent opened and has not ended: the
 * hub is waiting on each for its `result`. On disk because an agent restart
 * loses the process that would have sent it; the process that reattaches the
 * session reads it here, and ends that turn from the server's own history if
 * the server finished it meanwhile (see `watchResumedTurn`).
 */
const OPEN_TURNS_PATH = join(OPENCODE_DIR, "cawco-open-turns.json");
let openTurns: Set<string> | undefined;

const loadOpenTurns = (): Set<string> => {
  openTurns ??= existsSync(OPEN_TURNS_PATH)
    ? new Set(JSON.parse(readFileSync(OPEN_TURNS_PATH, "utf8")) as string[])
    : new Set<string>();
  return openTurns;
};

/** Records that `sessionId`'s turn is open (the hub is owed its end) or closed. */
const markTurn = (sessionId: string, open: boolean): void => {
  const ids = loadOpenTurns();
  if (open === ids.has(sessionId)) {
    return;
  }
  const next = new Set(ids);
  if (open) {
    next.add(sessionId);
  } else {
    next.delete(sessionId);
  }
  // Commit before publishing the result: no deferred write can be lost at restart.
  const pending = `${OPEN_TURNS_PATH}.${process.pid}.tmp`;
  writeFileSync(pending, JSON.stringify([...next]));
  renameSync(pending, OPEN_TURNS_PATH);
  openTurns = next;
};

/** Whether an earlier process left `sessionId` with a turn it never ended. */
const turnWasOpen = (sessionId: string): boolean =>
  loadOpenTurns().has(sessionId);

const sessionToInfo = (session: Session, tag?: string): NeutralSessionInfo => ({
  sessionId: session.id,
  harness: "opencode",
  ...(session.title ? { customTitle: session.title } : {}),
  lastModified: session.time.updated,
  ...(session.time.created ? { createdAt: session.time.created } : {}),
  ...(session.directory ? { cwd: session.directory } : {}),
  ...(tag ? { tag } : {}),
});

/** A provider error's own words, kept whole: name, status and message ride together. */
const errorText = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  const e = error as
    | {
        name?: string;
        message?: string;
        cause?: unknown;
        data?: { message?: string; statusCode?: number };
      }
    | undefined;
  const name = e?.name ?? "error";
  const status = e?.data?.statusCode;
  const message = e?.data?.message ?? e?.message ?? String(error);
  const cause =
    e?.cause && e.cause !== error ? `; cause: ${errorText(e.cause)}` : "";
  return `${name}${status ? ` ${status}` : ""}: ${message}${cause}`;
};

/**
 * The SDK answers a request that never reached the server (connection
 * refused, reset, timed out) with `{ error }` and no response, the same shape
 * as the server's own refusal. Here that is an exception: an unreachable
 * server is never "no sessions", "not held" or "no commands". A request the
 * server answered comes back for its own `error` to be read.
 */
async function reached<T extends { response?: Response; error?: unknown }>(
  pending: Promise<T>
): Promise<T> {
  const result = await pending;
  if (!result.response) {
    throw result.error;
  }
  return result;
}

/** What OpenCode makes of a server's name in its tools' ids (`McpCatalog.sanitize`, mcp/catalog.ts 117 at 1.18.34). */
const MCP_NAME_UNSAFE = /[^a-zA-Z0-9_-]/g;

/**
 * A project's Caw on OpenCode: every tool of every MCP server the directory's
 * server has, but CawCo's, switched off. One OpenCode server runs every
 * session in a directory and loads every server its config names, so the
 * fence is the session's own: OpenCode names an MCP tool
 * `<server>_<tool>` (`toolName`, mcp/catalog.ts 119), and a `<server>_*`
 * switched off is a deny rule its permission set matches by wildcard
 * (permission/index.ts 204-219), which hides the tool from the turn and from
 * code mode's catalog alike (`Permission.visibleTools(yield* mcp.tools(),
 * ruleset)`, tool/code-mode.ts 210) and refuses a call to it (`ctx.ask`, 147).
 * The list is the server's MCP status (every server it was configured with,
 * and any the agent added since: `client.mcp.add`), read each time a turn is
 * about to run, so a server added later is fenced too.
 */
const leadMcpFence = async (
  client: OpencodeClient,
  directory: string
): Promise<Record<string, false>> => {
  const status = await reached(
    client.mcp.status({ directory }, { signal: AbortSignal.timeout(65_000) })
  );
  if (status.error || !status.data) {
    throw new Error(
      `A project's Caw takes no turn without its MCP server list, which OpenCode did not give: ${errorText(status.error)}`
    );
  }
  return Object.fromEntries(
    Object.keys(status.data)
      .filter((name) => name !== "cawco")
      .map((name) => [`${name.replace(MCP_NAME_UNSAFE, "_")}_*`, false])
  );
};

/**
 * Boots the server's OpenCode instance for `directory` (the server's own
 * working directory when undefined) on its boot budget, before any request
 * there runs on {@link RECOVERY_TIMEOUT_MS}: a booted instance answers at
 * once, and a first boot may wait on OpenCode's own dependency install
 * ({@link INSTANCE_BOOT_TIMEOUT_MS}). A server that went away fails it at once.
 */
async function bootInstance(
  client: OpencodeClient,
  directory?: string
): Promise<void> {
  const booted = await reached(
    client.path.get(directory === undefined ? {} : { directory }, {
      signal: AbortSignal.timeout(INSTANCE_BOOT_TIMEOUT_MS),
    })
  );
  if (booted.error) {
    throw new Error(
      `OpenCode did not boot ${directory ?? "its own directory"}: ${errorText(booted.error)}`
    );
  }
}

/**
 * The SSE reader owns cancellation once headers arrive. Aborting fetch's body
 * first makes the SDK's unobserved reader.cancel() reject (SDK 1.18.34).
 * Until headers arrive the caller still cancels the actual connection.
 */
export async function fetchOpencode(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = new Request(input, init);
  if (new URL(request.url).pathname !== "/event") {
    return await fetch(request);
  }
  const { signal } = request;
  signal.throwIfAborted();
  const connecting = new AbortController();
  const stop = () => connecting.abort(signal.reason);
  signal.addEventListener("abort", stop, { once: true });
  try {
    const response = await fetch(
      new Request(request, { signal: connecting.signal })
    );
    signal.throwIfAborted();
    return response;
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

/** `provider/model` or a bare model id, into opencode's two-part model reference. */
const splitModel = (
  model: string
): { providerID?: string; modelID?: string } => {
  const slash = model.indexOf("/");
  if (slash < 0) {
    return { modelID: model };
  }
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) };
};

const WHITESPACE_RE = /\s+/;
const MCP_USAGE = "Usage: /mcp auth|logout|connect|disconnect <server>";

/** `/name rest` → its parts; undefined for anything that is not a slash command. */
const parseCommand = (
  text: string
): { name: string; args: string } | undefined => {
  if (!text.startsWith("/") || text.length === 1) {
    return undefined;
  }
  const rest = text.slice(1);
  const sp = rest.indexOf(" ");
  if (sp === -1) {
    return { name: rest, args: "" };
  }
  return { name: rest.slice(0, sp), args: rest.slice(sp + 1) };
};

/** A message's final content, keyed by part id in arrival order, for its closing frame. */
interface PendingMessage {
  /**
   * The message's text, reasoning and tool parts, in the order they appeared —
   * the order {@link toTranscript} lists them in, so a block's place here is
   * the index its row is keyed by live and after a reload alike.
   */
  blocks: string[];
  parts: Map<string, { kind: "text" | "thinking"; text: string }>;
  /** The parts already published as a block; each is published once. */
  published: Set<string>;
}

const pendingMessage = (): PendingMessage => ({
  blocks: [],
  parts: new Map(),
  published: new Set(),
});

/** A part's place among its message's blocks, taken on first sight. */
const blockIndex = (pending: PendingMessage, partID: string): number => {
  const at = pending.blocks.indexOf(partID);
  return at === -1 ? pending.blocks.push(partID) - 1 : at;
};

/**
 * The live thinking stream, in the partial-event shape the dashboard's stream
 * reader already folds — the same events the claude adapter forwards from the
 * SDK verbatim. `NeutralStreamMessage` names only the text delta the adapters
 * emitted until now, so these three are typed here and widened once at the sink
 * rather than sent loosely.
 */
interface ThinkingStreamFrame {
  event:
    | {
        type: "content_block_start";
        content_block: { type: "thinking"; thinking: string };
      }
    | {
        type: "content_block_delta";
        delta: { type: "thinking_delta"; thinking: string };
      }
    | { type: "content_block_stop" };
  session_id?: string;
  type: "stream_event";
}

/** A child (subagent) session's own pipeline state, kept apart from the parent's. */
interface ChildState {
  pending: Map<string, PendingMessage>;
  roles: Map<string, "user" | "assistant">;
  toolsEmitted: Map<string, "called" | "resolved">;
}

const EMPTY_TOKENS = {
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

/** Providers an OpenCode account can actually use, including OAuth. */
async function connectedProviders(
  client: OpencodeClient,
  directory?: string
): Promise<Pick<Provider, "id" | "models">[]> {
  const result = await client.provider.list(directory ? { directory } : {});
  if (result.error) {
    throw new Error(errorText(result.error));
  }
  const data = result.data as unknown as {
    all?: Pick<Provider, "id" | "models">[];
    connected?: string[];
  };
  const connected = new Set(data.connected ?? []);
  return (data.all ?? []).filter((provider) => connected.has(provider.id));
}

/**
 * Every model the connected providers offer, plus a `default` row naming the
 * model this opencode server itself runs when a session names none — so a
 * spawn that picks no model still names one. Opencode's own rule
 * (`Provider.defaultModel`, packages/opencode/src/provider/provider.ts
 * 2030–2062): the config's `model`; else the first provider (among the
 * configured ones, when the config names any) and that provider's top model,
 * which is what the server's `default` map holds for it (`defaultModelIDs`,
 * same file 1188, the same `sort()[0]`). Its recent-model step reads a local
 * state file the server does not expose, so it is not followed. A default
 * the catalog does not list gets no row: nothing would run it.
 */
export async function opencodeCatalog(
  client: OpencodeClient,
  directory?: string
): Promise<ModelInfo[]> {
  const scope = directory ? { directory } : {};
  const [listed, configured] = await Promise.all([
    client.provider.list(scope),
    client.config.get(scope),
  ]);
  if (listed.error) {
    throw new Error(errorText(listed.error));
  }
  if (configured.error) {
    throw new Error(errorText(configured.error));
  }
  const data = listed.data as unknown as {
    all?: Pick<Provider, "id" | "models">[];
    connected?: string[];
    default?: Record<string, string>;
  };
  const connected = new Set(data.connected ?? []);
  const providers = (data.all ?? []).filter((p) => connected.has(p.id));
  const models = modelCatalog(providers);
  const config = configured.data as { model?: string; provider?: object };
  const named = Object.keys(config.provider ?? {});
  const first = providers.find(
    (p) => named.length === 0 || named.includes(p.id)
  );
  const id =
    config.model ??
    (first && data.default?.[first.id]
      ? `${first.id}/${data.default[first.id]}`
      : undefined);
  const resolved = id ? models.find((row) => row.value === id) : undefined;
  return resolved
    ? [
        ...models,
        { ...resolved, value: "default", resolvedModel: resolved.value },
      ]
    : models;
}

/**
 * How many tokens one request to the model may send: its input limit where
 * the catalog gives one below its context (OpenCode's `limit.input`; gpt-5.5:
 * context 400000, input 272000), else its context.
 */
const requestWindow = (limit: { context: number; input?: number }): number =>
  limit.input ? Math.min(limit.input, limit.context) : limit.context;

/** Every model the connected providers offer, with its effort scale and the tokens a request may send. */
function modelCatalog(
  providers: Pick<Provider, "id" | "models">[]
): ModelInfo[] {
  const models: ModelInfo[] = [];
  for (const provider of providers) {
    for (const [modelID, model] of Object.entries(provider.models ?? {})) {
      const { variants } = model as unknown as {
        variants?: Record<
          string,
          { reasoningEffort?: string; disabled?: boolean }
        >;
      };
      const supportedEffortLevels = EFFORT_LEVELS.filter(
        (level) =>
          variants?.[level]?.reasoningEffort === level &&
          !variants[level].disabled
      );
      models.push({
        value: `${provider.id}/${modelID}`,
        displayName: `${model.name ?? modelID}`,
        ...(supportedEffortLevels.length
          ? { supportsEffort: true, supportedEffortLevels }
          : {}),
        ...(model.limit && requestWindow(model.limit)
          ? { contextWindow: requestWindow(model.limit) }
          : {}),
      });
    }
  }
  return models;
}

export class OpencodeSession implements HarnessSession {
  attached?: () => void;
  readonly harness = "opencode" as const;
  sessionId: string | null;
  readonly #ctx: HarnessContext;
  #client: OpencodeClient;
  readonly #directory: string;
  #model: string | undefined;
  #effort: EffortLevel | undefined;
  #lastTokens = EMPTY_TOKENS;
  /** The tokens the session's last answered request sent: its context then. */
  #lastSent: number | undefined;
  readonly #roles = new Map<string, "user" | "assistant">();
  /**
   * The assistant messages opencode wrote as a compaction's summary
   * (`summary: true` on the message): their text is the brief, not an answer.
   */
  readonly #summaries = new Set<string>();
  /** The compaction parts whose boundary has gone out: a part is updated more than once. */
  readonly #boundaries = new Set<string>();
  /** A compaction is under way: the session has said so and not yet said otherwise. */
  #compacting: boolean;
  readonly #costs = new Map<string, number>();
  /** The turn's assistant messages' tokens, by message id: each update carries the message's whole count. */
  readonly #turnTokens = new Map<string, ModelTurnUsage>();
  #costBase = 0;
  readonly #pending = new Map<string, PendingMessage>();
  /** The reasoning part whose live block is open, so it is closed exactly once. */
  #openThinking: string | null = null;
  readonly #toolsEmitted = new Map<string, "called" | "resolved">();
  /**
   * Code-mode calls drawn and not yet answered: a call that succeeded in a
   * program that threw waits for the answer the bridge plugin writes after
   * ({@link codeModeCalls}), and one that never comes is closed with the turn.
   */
  readonly #codeModeOpen = new Set<string>();
  #busy = false;
  /** Live turn transitions outrank status/history snapshots already in flight. */
  #turnRevision = 0;
  /**
   * Busy since {@link reattachedMidTurn}, on the server's word alone, until
   * {@link watchResumedTurn} has read the turn again.
   */
  #reattachedBusy = false;
  /** The last provider-retry note surfaced, so a repeating retry says it once. */
  #lastRetryNote = "";
  /** The message id of the prompt this process sent that the open turn answers. */
  #turnPrompt: string | undefined;
  #completion: { uuid: string; timestamp?: string } | undefined;
  #recoveringTurn = false;
  #sleepAfterRecovery = false;
  #open = false;
  /**
   * A turn is open: the hub is owed its end (a `result` frame). Recorded on
   * disk as well, so an agent restart that loses this process does not lose
   * the debt — the process that reattaches the session reads it back.
   */
  get #turnOpen(): boolean {
    return this.#open;
  }
  set #turnOpen(open: boolean) {
    this.#turnRevision += 1;
    if (!open) {
      this.#turnPrompt = undefined;
    }
    if (open !== this.#open) {
      this.#open = open;
      if (this.sessionId) {
        markTurn(this.sessionId, open);
      }
    }
  }
  /** Armed while a turn is open without any server event; see STALLED_TURN_MS. */
  #stallTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Sends held while the config gate is up, and any that arrive while they
   * are delivered, each under the message id it will become.
   */
  readonly #queue: {
    parts: unknown[];
    model?: { providerID?: string; modelID?: string };
    messageID: string;
    uuid: string;
  }[] = [];
  /** The held send delivered last, until opencode has written it. */
  #draining: string | undefined;
  /** The assistant message opencode is writing, until it is complete. */
  #answering: string | undefined;
  /** User messages opencode has written that the session has yet to be given. */
  readonly #readAfter: string[] = [];
  /**
   * When opencode created each message it has said this session (or one of
   * its subagents) has, by message id — the clock a history read dates its
   * entries by, so the live frames carry it too.
   */
  readonly #created = new Map<string, string>();
  /** Every user message already counted into {@link #readAfter}, so none is read twice. */
  readonly #written = new Set<string>();
  #permissionMode: string | undefined;
  #providersCache: Promise<Pick<Provider, "id" | "models">[]> | undefined;
  #commandNames: Promise<Set<string>> | null = null;
  readonly #questions = new Set<string>();
  readonly #seenGates = new Set<string>();
  readonly #resolvedGates = new Set<string>();
  readonly #gateFailures = new Set<string>();
  #reconciling: Promise<void> | undefined;
  readonly #lifetime = new AbortController();
  readonly #questionData = new Map<string, UserQuestion[]>();
  readonly #childInfo = new Map<string, { agent?: string; title?: string }>();
  readonly #childState = new Map<string, ChildState>();
  readonly #boundCalls = new Set<string>();
  readonly #registerChild: (childId: string, callID: string) => void;
  readonly #onRelease: () => void;
  readonly instanceId: string;
  /**
   * Returns true when the harness's config gate is held. Injected by the
   * harness so sessions can queue dispatches without a back-reference.
   */
  readonly #isConfigGateHeld: (urgent?: boolean) => boolean;
  readonly #readActivity: () => Promise<boolean>;
  readonly #prepareDispatch: () => Promise<void>;
  /** The OpenCode session ids this agent runs, so a credential store keeps only theirs. */
  readonly #liveSessions: () => ReadonlySet<string>;
  readonly #workflowStepId?: string;
  readonly #canDelegate?: boolean;
  /** Tools denied to this session (fleet, type and spawn), switched off on every prompt. */
  readonly #deniedTools: OpencodeDenySettings["tools"];
  /** A project's Caw ({@link SpawnPayload.lead}): it has CawCo's MCP server and no other ({@link leadMcpFence}). */
  readonly #lead: boolean;
  /** A lead's {@link leadMcpFence}, as last read before a turn; none for any other session. */
  #mcpFence: Record<string, false> = {};
  /** The CawCo account this session runs on, whose own server it runs in; undefined: the machine's. */
  readonly account: string | undefined;

  constructor(
    instanceId: string,
    ctx: HarnessContext,
    client: OpencodeClient,
    sessionId: string,
    directory: string,
    model: string | undefined,
    permissionMode: string | undefined,
    registerChild: (childId: string, callID: string) => void,
    onRelease: () => void,
    isConfigGateHeld: (urgent?: boolean) => boolean,
    readActivity: () => Promise<boolean>,
    prepareDispatch: () => Promise<void>,
    cawcoConnected: Promise<void>,
    liveSessions: () => ReadonlySet<string>,
    effort?: EffortLevel,
    workflowStepId?: string,
    canDelegate?: boolean,
    deniedTools: OpencodeDenySettings["tools"] = {},
    account?: string,
    lead = false
  ) {
    this.instanceId = instanceId;
    this.account = account;
    this.#lead = lead;
    this.#ctx = ctx;
    this.#client = client;
    this.sessionId = sessionId;
    this.#directory = directory;
    this.#compacting = false;
    this.#model = model;
    this.#effort = effort;
    this.#permissionMode = permissionMode;
    this.#registerChild = registerChild;
    this.#onRelease = onRelease;
    this.#isConfigGateHeld = isConfigGateHeld;
    this.#readActivity = readActivity;
    // No prompt or command reaches the server before its CawCo tools do: a
    // directory whose cawco slot did not connect fails the session with why,
    // and every send it was handed fails with it. Awaited here, at dispatch,
    // never at publication (bb65de38: publishing must not wait on unrelated
    // cold MCP servers, and the status read warms every one of them).
    const admitted = cawcoConnected.catch((error: unknown) => {
      const reason = new Error(
        `The session's CawCo MCP did not connect, so it takes no work: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
      this.#ctx.failed(reason);
      throw reason;
    });
    // Its rejection is a send's, at dispatch; unawaited it is not unhandled.
    admitted.catch(() => undefined);
    this.#prepareDispatch = async () => {
      await admitted;
      await prepareDispatch();
      await this.#readFence();
    };
    this.#liveSessions = liveSessions;
    this.#workflowStepId = workflowStepId;
    this.#canDelegate = canDelegate;
    this.#deniedTools = deniedTools;
  }

  /**
   * Says the effort this session sends ({@link EFFORT_READ}): the variant every
   * prompt and command carries, or null when it carries none and the server
   * answers on the model's own default.
   */
  sayEffort(): void {
    this.#ctx.frame({
      type: "system",
      subtype: EFFORT_READ,
      effort: this.#effort ?? null,
    });
  }

  /** A lead's fence, read again before a turn ({@link leadMcpFence}). */
  async #readFence(): Promise<void> {
    if (this.#lead) {
      this.#mcpFence = await leadMcpFence(this.#client, this.#directory);
    }
  }

  /**
   * Before a lead's turn that carries no tool switches: a command (a skill
   * the spawn loads, a slash command). A prompt's switches become the
   * session's whole permission set (`session.permission = permissions`,
   * session/prompt.ts 1060-1067 at 1.18.34), and a command runs its prompt
   * with none (1465-1472), so it runs on the set the last prompt left, or
   * the one the session was created with. This session's denials and its
   * fence are given to that set first: the server adds them after what it
   * holds (`Permission.merge(current.permission ?? [], …)`,
   * handlers/session.ts 197), and the last matching rule decides.
   */
  async fenceCommandTurn(): Promise<void> {
    if (!this.#lead) {
      return;
    }
    await this.#readFence();
    const updated = await reached(
      this.#client.session.update({
        sessionID: this.#opencodeSessionId(),
        directory: this.#directory,
        permission: Object.keys({
          ...this.#deniedTools,
          ...this.#mcpFence,
        }).map((permission) => ({
          permission,
          pattern: "*",
          action: "deny" as const,
        })),
      })
    );
    if (updated.error) {
      throw new Error(
        `A project's Caw takes no command turn its MCP fence was not given: ${errorText(updated.error)}`
      );
    }
  }

  /**
   * Called by the harness after a config reload completes. Drains any messages
   * that were queued because the config gate was held.
   */
  configGateLifted(): void {
    this.#drainQueue();
  }

  /**
   * Rebind this session to a new server after the old one went away — a
   * config restart, or a crash the harness respawned it from. The session
   * keeps its id and history; only the client changes.
   */
  rebindClient(client: OpencodeClient): void {
    this.#client = client;
    this.#commandNames = null;
    this.#providersCache = undefined;
  }

  /** Dispatch custody, not an independent server-idle heuristic. */
  get turnInFlight(): boolean {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: server events and dispatch methods update these fields outside this getter
    return this.#busy || this.#turnOpen;
  }

  /**
   * The sends this process holds that the server has not been handed: queued
   * behind the config gate or behind one still being written. They live in
   * this process alone, so an agent restart loses them.
   */
  get unhanded(): number {
    return this.#queue.length;
  }

  tables(): Record<string, number> {
    return {
      opencodeRoles: this.#roles.size,
      opencodeCosts: this.#costs.size,
      opencodePending: this.#pending.size,
      opencodeTools: this.#toolsEmitted.size,
      opencodeCreated: this.#created.size,
      opencodeWritten: this.#written.size,
      opencodeGates: this.#seenGates.size + this.#resolvedGates.size,
      opencodeChildren: this.#childInfo.size + this.#childState.size,
      opencodeBoundCalls: this.#boundCalls.size,
    };
  }

  /**
   * What this handle still owes or holds: a turn it opened or is reading
   * back, and the sends it has yet to hand the server or the model.
   */
  holding(): string | undefined {
    if (
      this.turnInFlight ||
      this.#reattachedBusy ||
      this.#recoveringTurn ||
      this.#answering
    ) {
      return "a turn is running";
    }
    if (
      this.#queue.length > 0 ||
      this.#draining ||
      this.#readAfter.length > 0
    ) {
      return "a send is waiting to be read";
    }
    return undefined;
  }

  /** Routes one opencode event into neutral frames for this session. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the opencode event union's per-type routing switch; not refactored in this pass
  handle(event: Event): void {
    const p = event.properties as Record<string, unknown> & {
      sessionID?: string;
    };
    const sid = p.sessionID;
    if (sid !== undefined && sid !== this.sessionId) {
      return;
    }
    // Any event off the wire is a sign of life: a turn that keeps emitting
    // can never trip the stall notice, only a truly silent one does.
    this.#noteServerActivity();

    // `message.part.delta` is a real event the SDK's generated union omits, so
    // switch on the string form rather than the nominal `Event` union.
    const type = event.type as string;
    if (
      sid === this.sessionId &&
      (type === "permission.updated" ||
        type === "permission.asked" ||
        type === "question.asked" ||
        type === "question.v2.asked")
    ) {
      const id = p.id as string;
      if (this.#seenGates.has(id) || this.#resolvedGates.has(id)) {
        return;
      }
      this.#seenGates.add(id);
    }
    if (type === "permission.replied") {
      const id = p.requestID as string;
      this.#resolvedGates.add(id);
      this.#ctx.permissionResolved?.(id);
      return;
    }
    switch (type) {
      case "message.updated": {
        const { info } = p as { info?: Message };
        if (!info) {
          return;
        }
        this.#roles.set(info.id, info.role);
        this.#noteCreated(info);
        if (info.role === "assistant") {
          if (info.summary) {
            this.#summaries.add(info.id);
          } else if (this.#compacting) {
            // The model is answering again: the compaction is behind it. A
            // compaction that ends its turn needs no word here — the turn's
            // end clears the status — and saying "done" when the summary
            // landed left the session busy with nothing to show for it, so
            // the working indicator flashed under the divider.
            this.#compacting = false;
            this.#ctx.frame({
              type: "system",
              subtype: "status",
              status: null,
              session_id: this.sessionId ?? undefined,
            });
          }
          this.#completion = {
            uuid: info.id,
            ...(info.time.completed
              ? { timestamp: new Date(info.time.completed).toISOString() }
              : {}),
          };
          this.#costs.set(info.id, info.cost);
          // OpenCode's `input` leaves out the cached tokens (see below), so it
          // is the uncached input; a summary message is a compaction's spend.
          this.#turnTokens.set(info.id, {
            model: `${info.providerID}/${info.modelID}`,
            input: info.tokens.input,
            output: info.tokens.output,
            cacheRead: info.tokens.cache.read,
            cacheWrite: info.tokens.cache.write,
          });
          this.#lastTokens = info.tokens;
          // The tokens this message's request sent: OpenCode's `input` leaves
          // out the cached ones (session/session.ts 361-375), so they are
          // added back. A request that failed sent none that counted.
          const sent =
            info.tokens.input +
            info.tokens.cache.read +
            info.tokens.cache.write;
          if (sent > 0) {
            this.#lastSent = sent;
          }
          if (!info.time.completed) {
            this.#answering = info.id;
          } else if (this.#answering === info.id) {
            // The answer is whole: its blocks go on screen, then the sends
            // written while it was being written — the order opencode keeps.
            this.#answering = undefined;
            this.#flushMessages(this.#pending, this.#roles);
            this.#releaseReads();
          }
        }
        // A user message written into the session: read, by the id the hub
        // was told at dispatch (`MESSAGES_STORED`). Written while an answer is
        // still being written, it is read after that answer: where opencode
        // stores it, and when the model is given it. One the hub never sent
        // (typed in opencode itself) is an id it has no send under.
        if (info.role === "user" && !this.#written.has(info.id)) {
          this.#written.add(info.id);
          this.#readAfter.push(info.id);
          if (!this.#answering) {
            this.#releaseReads();
          }
        }
        this.#drained(info.id);
        break;
      }
      case "message.part.updated": {
        const { part } = p as { part?: Part };
        if (!part) {
          return;
        }
        const { messageID } = part;
        if (
          messageID !== undefined &&
          part.sessionID !== undefined &&
          part.sessionID !== this.sessionId
        ) {
          return;
        }
        this.#part(part);
        break;
      }
      case "message.part.delta": {
        const props = event.properties as unknown as {
          sessionID?: string;
          messageID?: string;
          partID?: string;
          field?: string;
          delta?: string;
        };
        if (props.field !== "text") {
          break;
        }
        if (this.#roles.get(props.messageID ?? "") !== "assistant") {
          break;
        }
        if (!props.delta) {
          break;
        }
        // A delta event carries no part type, so the kind is whatever the
        // part's `message.part.updated` already established — opencode opens a
        // reasoning part with an empty-text update and then streams its trace
        // over these `field: "text"` deltas. Routing them blindly as prose is
        // what made a reasoning trace appear as message text while streaming.
        const pending = this.#pendingOf(props.messageID ?? "");
        const existing = props.partID
          ? pending.parts.get(props.partID)
          : undefined;
        const held = existing?.kind === "thinking" ? "thinking" : "text";
        if (props.partID) {
          blockIndex(pending, props.partID);
        }
        // A compaction's summary is not an answer being written: its words
        // are kept and nothing streams, so the transcript shows the divider
        // its boundary drew and never an agent's row filling in.
        if (this.#summaries.has(props.messageID ?? "")) {
          // Nothing to show while it is written.
        } else if (held === "thinking" && props.partID) {
          if (this.#openThinking !== props.partID) {
            this.#closeThinking();
            this.#openThinking = props.partID;
            this.#thinkingFrame({
              type: "content_block_start",
              content_block: { type: "thinking", thinking: "" },
            });
          }
          this.#thinkingFrame({
            type: "content_block_delta",
            delta: { type: "thinking_delta", thinking: props.delta },
          });
        } else {
          this.#closeThinking();
          this.#ctx.frame({
            type: "stream_event",
            session_id: this.sessionId ?? undefined,
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: props.delta },
            },
          });
        }
        // `message.part.delta` is the streaming chunks, and the full stream they
        // carry is the authoritative text — `part.text` on `message.part.updated`
        // is capped at 4000 chars, and a part longer than the transport's buffer
        // never lands at all. The accumulated deltas are the truth either way.
        if (props.partID) {
          const acc = (existing?.text ?? "") + props.delta;
          pending.parts.set(props.partID, { kind: held, text: acc });
        }
        break;
      }
      case "permission.asked": {
        if (sid !== this.sessionId) {
          return;
        }
        const asked = event.properties as unknown as PermissionRequest;
        // opencode's permission system publishes events and never consults a
        // plugin, so the daemon is where a session's mode is enforced.
        if (
          autoAllows(this.#permissionMode, "tool") ||
          (this.#permissionMode === "acceptEdits" &&
            asked.permission === "edit")
        ) {
          this.#replyPermission(asked.id, "once");
          break;
        }
        this.#ctx.permission({
          requestId: asked.id,
          toolName: asked.permission,
          input: asked.metadata ?? {},
          requestKind: "tool",
          ...(asked.tool ? { toolUseId: asked.tool.callID } : {}),
        });
        break;
      }
      // opencode carries two generations of this event with byte-identical
      // payloads, and the server's own spec publishes both. Naming only the
      // older one is a silent failure waiting for the day it stops firing:
      // questions would simply stop appearing, with nothing raised anywhere.
      case "question.asked":
      case "question.v2.asked": {
        if (sid !== this.sessionId) {
          return;
        }
        const asked = event.properties as unknown as {
          id: string;
          sessionID: string;
          questions: {
            question: string;
            header: string;
            options: { label: string; description: string }[];
            multiple?: boolean;
          }[];
          tool?: { messageID: string; callID: string };
        };
        this.#questions.add(asked.id);
        const questions: UserQuestion[] = asked.questions.map((q) => ({
          question: q.question,
          header: q.header,
          options: q.options,
          multiSelect: q.multiple === true,
        }));
        this.#questionData.set(asked.id, questions);
        // Only the parked permission is raised here. The transcript row comes
        // from the `question` tool part this ask rides on, which opencode emits
        // and stores like any other tool — writing a second row from this event
        // would draw the same question twice, under two different ids.
        this.#ctx.permission({
          requestId: asked.id,
          toolName: ASK_USER_QUESTION,
          input: { questions },
          requestKind: "question",
          ...(asked.tool ? { toolUseId: asked.tool.callID } : {}),
        });
        break;
      }
      // A question can also be settled where cawco cannot see it — in
      // opencode's own TUI, or by any other client on the same server. Without
      // these the `tool_use` the ask emitted never closes, and the row sits on
      // "waiting for your answer" for the rest of the session while the model
      // has long since moved on.
      //
      // `#questionData` is the guard against answering twice: `resolvePermission`
      // clears the entry before it replies, so the echo of cawco's own reply
      // finds nothing here and falls through. Only a settlement cawco did not
      // make still has its questions on hand.
      // A settlement cawco did not make — opencode's own TUI, or any other
      // client on the server. The transcript needs nothing here, because the
      // `question` tool part completes on every route and carries the answers
      // with it; this only lets go of the parked request so a later
      // `resolvePermission` for the same id cannot reply to a closed question.
      case "question.replied":
      case "question.v2.replied":
      case "question.rejected":
      case "question.v2.rejected": {
        if (sid !== this.sessionId) {
          return;
        }
        const settled = event.properties as unknown as { requestID: string };
        this.#resolvedGates.add(settled.requestID);
        this.#ctx.permissionResolved?.(settled.requestID);
        this.#questions.delete(settled.requestID);
        this.#questionData.delete(settled.requestID);
        break;
      }
      case "session.status": {
        if (sid !== this.sessionId) {
          return;
        }
        this.#applyStatus(
          p.status as { type?: string; message?: string; next?: number }
        );
        break;
      }
      case "session.idle": {
        if (sid !== this.sessionId) {
          return;
        }
        this.#turnRevision += 1;
        this.#ctx.busy(false);
        this.#busy = false;
        this.#flushResult();
        // Anything the config gate held while this turn ran goes now.
        this.#drainQueue();
        break;
      }
      case "session.error": {
        if (sid !== undefined && sid !== this.sessionId) {
          return;
        }
        this.#turnRevision += 1;
        // One failure, one result. opencode reports a prompt that dies before
        // the model is reached (an unknown model) twice — its message, then the
        // same error again with a stack — and the first already closed the turn.
        if (!this.#turnOpen) {
          return;
        }
        const error = p.error as { name?: string; data?: { message?: string } };
        // A compaction the turn died in did not compact: say so, the way
        // Claude Code does, so its divider never reads "Compacted".
        if (this.#compacting) {
          this.#compacting = false;
          this.#ctx.frame({
            type: "system",
            subtype: "status",
            status: null,
            compact_result: "failed",
            compact_error: errorText(error),
            session_id: this.sessionId ?? undefined,
          });
        }
        this.#ctx.busy(false);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: `as` is an unchecked cast; p.error can still be undefined at runtime even though the cast type says otherwise
        if (error?.name === "MessageAbortedError") {
          this.#flushResult({ subtype: "aborted", is_error: false });
        } else {
          this.#flushResult({
            subtype: "error_during_execution",
            is_error: true,
            errors: [errorText(error)],
          });
        }
        // The turn is over either way: whatever the config gate held runs
        // now, same as the idle path.
        this.#drainQueue();
        break;
      }
      default:
        break;
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes every opencode part kind (text, tool, reasoning, …) into neutral frames; not refactored in this pass
  #part(part: Part): void {
    const role = this.#roles.get(part.messageID);
    switch (part.type) {
      // A compaction has begun: the word that it is compacting, then its
      // boundary, once, so the divider stands in the transcript from here
      // and the summary that follows opens it. The word comes first: the
      // transcript reads the boundary that lands while it compacts as that
      // compaction's row, live, never as one already done.
      case "compaction": {
        if (this.#boundaries.has(part.id)) {
          return;
        }
        this.#boundaries.add(part.id);
        this.#compacting = true;
        this.#ctx.frame({
          type: "system",
          subtype: "status",
          status: "compacting",
          session_id: this.sessionId ?? undefined,
        });
        this.#ctx.frame(
          compactBoundary(part, this.#createdOf(part.messageID).timestamp)
        );
        break;
      }
      case "text": {
        if (part.synthetic || part.ignored) {
          return;
        }
        // Captured even before the message's role is known — a part can arrive
        // ahead of its `message.updated`, and dropping it is what left a
        // delegate's report empty. `#flushResult` filters by role at flush time,
        // when the role is settled. `part.text` is capped at 4000 chars (and a
        // part longer than the transport's buffer never lands at all), so the
        // `message.part.delta` text already accumulated here is the truth.
        this.#closeThinking();
        const pending = this.#pendingOf(part.messageID);
        blockIndex(pending, part.id);
        const existing = pending.parts.get(part.id);
        const acc = existing?.kind === "text" ? existing.text : "";
        const text = acc.length >= part.text.length ? acc : part.text;
        pending.parts.set(part.id, { kind: "text", text });
        break;
      }
      case "reasoning": {
        // Its place is taken even before the role is known, as a stored
        // message lists it.
        const pending = this.#pendingOf(part.messageID);
        blockIndex(pending, part.id);
        // A summary's reasoning is no part of its brief, live or stored.
        if (role !== "assistant" || this.#summaries.has(part.messageID)) {
          return;
        }
        const stored = pending.parts.get(part.id);
        // A reasoning update carries the whole text again, so what streams is
        // what grew past the last one. A rewrite that does not extend it says
        // nothing rather than replaying the block.
        const sent = stored?.kind === "thinking" ? stored.text : "";
        // `part.text` is capped at 4000 chars, so an update that arrives
        // shorter than what the deltas already accumulated is the capped view
        // of the same trace, not a rewrite: the longer one wins.
        const settled =
          stored?.kind === "thinking" && stored.text.length >= part.text.length
            ? stored.text
            : part.text;
        if (settled.length > sent.length && settled.startsWith(sent)) {
          if (this.#openThinking !== part.id) {
            this.#closeThinking();
            this.#openThinking = part.id;
            this.#thinkingFrame({
              type: "content_block_start",
              content_block: { type: "thinking", thinking: "" },
            });
          }
          this.#thinkingFrame({
            type: "content_block_delta",
            delta: {
              type: "thinking_delta",
              thinking: settled.slice(sent.length),
            },
          });
        }
        pending.parts.set(part.id, { kind: "thinking", text: settled });
        break;
      }
      case "tool": {
        this.#closeThinking();
        // A `task` tool spawns a child session; its metadata carries the child id
        // (verified: `state.metadata.sessionId`), so bind it to this callID.
        if (part.tool === "task") {
          const meta = part.state as {
            metadata?: { sessionId?: string };
            input?: { subagent_type?: string };
            title?: string;
          };
          if (typeof meta.metadata?.sessionId === "string") {
            this.#bindChild(
              part.callID,
              meta.metadata.sessionId,
              meta.input?.subagent_type,
              meta.title
            );
          }
        }
        const { status } = part.state;
        const emitted = this.#toolsEmitted.get(part.callID);
        // One tool_use per call, on the first part that carries usable input.
        if (
          !emitted &&
          (status === "running" || status === "completed" || status === "error")
        ) {
          this.#flushMessages(this.#pending, this.#roles);
          this.#ctx.frame({
            type: "assistant",
            uuid: part.messageID,
            ...this.#createdOf(part.messageID),
            contentOffset: blockIndex(this.#pendingOf(part.messageID), part.id),
            message: {
              content: [
                {
                  type: "tool_use",
                  id: part.callID,
                  name: toolNameOf(part.tool),
                  input: toolInputOf(part.state.input),
                },
              ],
            },
          });
          this.#toolsEmitted.set(part.callID, "called");
        }
        this.#codeModeFrames(
          part,
          this.#pendingOf(part.messageID),
          this.#toolsEmitted
        );
        // One tool_result per call, once it completes or errors.
        if (
          (status === "completed" || status === "error") &&
          emitted !== "resolved"
        ) {
          const output =
            status === "completed" ? part.state.output : part.state.error;
          const metadata =
            status === "completed" && part.tool !== CODE_MODE_TOOL
              ? (part.state as { metadata?: Record<string, unknown> }).metadata
              : undefined;
          const structuredContent =
            metadata && Object.keys(metadata).length > 0 ? metadata : undefined;
          const questionResult = questionResultOf(part);
          this.#ctx.frame({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: part.callID,
                  content:
                    part.state.status === "completed"
                      ? withImageAttachments(output, part.state.attachments)
                      : output,
                  is_error: status === "error",
                  ...(structuredContent ? { structuredContent } : {}),
                  ...(questionResult ? { questionResult } : {}),
                },
              ],
            },
          });
          this.#toolsEmitted.set(part.callID, "resolved");
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * A code-mode program's calls ({@link codeModeCalls}): each one once, as
   * soon as the program has made it, and each result once the program has
   * ended — ahead of the program's own result.
   */
  #codeModeFrames(
    part: ToolPart,
    pending: PendingMessage,
    emitted: Map<string, "called" | "resolved">,
    parentToolUseId?: string
  ): void {
    for (const { key, use, result } of codeModeCalls(part, true)) {
      if (!emitted.has(key)) {
        this.#ctx.frame({
          type: "assistant",
          uuid: part.messageID,
          ...this.#createdOf(part.messageID),
          contentOffset: blockIndex(pending, key),
          ...(parentToolUseId ? { parent_tool_use_id: parentToolUseId } : {}),
          message: { content: [use] },
        });
        emitted.set(key, "called");
        if (!parentToolUseId) {
          this.#codeModeOpen.add(key);
        }
      }
      if (result && emitted.get(key) !== "resolved") {
        this.#resolveCodeModeCall(result, parentToolUseId);
        emitted.set(key, "resolved");
        this.#codeModeOpen.delete(key);
      }
    }
  }

  #resolveCodeModeCall(
    result: ToolResultBlock,
    parentToolUseId?: string
  ): void {
    this.#ctx.frame({
      type: "user",
      ...(parentToolUseId ? { parent_tool_use_id: parentToolUseId } : {}),
      message: { role: "user", content: [result] },
    });
  }

  /** Keeps when opencode created a message, as {@link toTranscript} dates it. */
  #noteCreated(info: Message): void {
    this.#created.set(info.id, new Date(info.time.created).toISOString());
  }

  /** The stored time a frame of message `messageID` carries, once known. */
  #createdOf(messageID: string): { timestamp?: string } {
    const created = this.#created.get(messageID);
    return created ? { timestamp: created } : {};
  }

  #pendingOf(messageID: string): PendingMessage {
    let pending = this.#pending.get(messageID);
    if (!pending) {
      pending = pendingMessage();
      this.#pending.set(messageID, pending);
    }
    return pending;
  }

  /**
   * Ships one live thinking frame. The neutral stream union carries the
   * thinking events itself (harness.ts widened 2026-08-16), so this is a plain
   * frame — no widening, the literals stay checked end to end.
   */
  #thinkingFrame(event: ThinkingStreamFrame["event"]): void {
    const frame: ThinkingStreamFrame = {
      type: "stream_event",
      session_id: this.sessionId ?? undefined,
      event,
    };
    this.#ctx.frame(frame);
  }

  /** Closes the live thinking block, if one is open. */
  #closeThinking(): void {
    if (this.#openThinking === null) {
      return;
    }
    this.#openThinking = null;
    this.#thinkingFrame({ type: "content_block_stop" });
  }

  /** A `session.created` event named a child; remember its info for the bind. */
  handleChildCreated(
    childId: string,
    agent: string | undefined,
    title: string | undefined
  ): void {
    this.#childInfo.set(childId, { agent, title });
  }

  /** Links a task call to its child session; emits the branch-opening frame once. */
  #bindChild(
    callID: string,
    childId: string,
    fallbackAgent: string | undefined,
    fallbackTitle: string | undefined
  ): void {
    if (this.#boundCalls.has(callID)) {
      return;
    }
    this.#boundCalls.add(callID);
    const info = this.#childInfo.get(childId);
    this.#ctx.frame({
      type: "system",
      subtype: "task_started",
      session_id: this.sessionId ?? undefined,
      tool_use_id: callID,
      task_id: childId,
      subagent_type: info?.agent ?? fallbackAgent ?? "subagent",
      description: info?.title ?? fallbackTitle ?? "",
    });
    this.#registerChild(childId, callID);
  }

  /** Routes a child-session event through the parent's frame stream under `callID`. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the child event union's per-type routing switch; not refactored in this pass
  handleChild(event: Event, callID: string): void {
    const state = this.#childStateOf(callID);
    const type = event.type as string;
    const p = event.properties as Record<string, unknown>;
    switch (type) {
      case "message.updated": {
        const { info } = p as { info?: Message };
        if (!info) {
          return;
        }
        state.roles.set(info.id, info.role);
        this.#noteCreated(info);
        break;
      }
      case "message.part.updated": {
        const { part } = p as { part?: Part };
        if (!part) {
          return;
        }
        this.#partChild(state, part, undefined, callID);
        break;
      }
      case "message.part.delta": {
        const props = event.properties as unknown as {
          field?: string;
          messageID?: string;
          partID?: string;
          delta?: string;
        };
        if (props.field !== "text") {
          break;
        }
        if (state.roles.get(props.messageID ?? "") !== "assistant") {
          break;
        }
        if (!props.delta) {
          break;
        }
        // Same untyped delta event as the parent path: the kind is whatever the
        // part's `message.part.updated` established. A child's reasoning is
        // buffered and settled at flush — it has no live thinking block — so a
        // thinking part accumulates without streaming as prose.
        const pending = this.#pendingChild(state, props.messageID ?? "");
        const existing = props.partID
          ? pending.parts.get(props.partID)
          : undefined;
        const held = existing?.kind === "thinking" ? "thinking" : "text";
        if (props.partID) {
          blockIndex(pending, props.partID);
          pending.parts.set(props.partID, {
            kind: held,
            text: (existing?.text ?? "") + props.delta,
          });
        }
        if (held === "thinking") {
          break;
        }
        this.#ctx.frame({
          type: "stream_event",
          session_id: this.sessionId ?? undefined,
          parent_tool_use_id: callID,
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: props.delta },
          },
        });
        break;
      }
      case "session.idle":
      case "session.error":
        // The child's turn ended; replay its accumulated blocks as its branch's
        // final frames. No result frame — the parent's task tool_result closes it.
        this.#flushChild(state, callID);
        break;
      default:
        break;
    }
  }

  #childStateOf(callID: string): ChildState {
    let state = this.#childState.get(callID);
    if (!state) {
      state = { roles: new Map(), pending: new Map(), toolsEmitted: new Map() };
      this.#childState.set(callID, state);
    }
    return state;
  }

  #pendingChild(state: ChildState, messageID: string): PendingMessage {
    let pending = state.pending.get(messageID);
    if (!pending) {
      pending = pendingMessage();
      state.pending.set(messageID, pending);
    }
    return pending;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes a subagent's part kinds into the parent session's neutral frames; not refactored in this pass
  #partChild(
    state: ChildState,
    part: Part,
    delta: string | undefined,
    callID: string
  ): void {
    const role = state.roles.get(part.messageID);
    // Every block takes its place on first sight, whatever is shown of it.
    if (
      part.type === "reasoning" ||
      part.type === "tool" ||
      (part.type === "text" && !(part.synthetic || part.ignored))
    ) {
      blockIndex(this.#pendingChild(state, part.messageID), part.id);
    }
    switch (part.type) {
      case "text": {
        if (part.synthetic || part.ignored) {
          return;
        }
        if (role !== "assistant") {
          return;
        }
        if (delta) {
          this.#ctx.frame({
            type: "stream_event",
            session_id: this.sessionId ?? undefined,
            parent_tool_use_id: callID,
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: delta },
            },
          });
        }
        const pending = this.#pendingChild(state, part.messageID);
        const existing = pending.parts.get(part.id);
        const accumulated = existing?.kind === "text" ? existing.text : "";
        pending.parts.set(part.id, {
          kind: "text",
          text:
            accumulated.length >= part.text.length ? accumulated : part.text,
        });
        break;
      }
      case "reasoning":
        if (role !== "assistant") {
          return;
        }
        {
          const pending = this.#pendingChild(state, part.messageID);
          const stored = pending.parts.get(part.id);
          // `part.text` is capped at 4000 chars; the accumulated deltas win
          // when they are longer.
          const settled =
            stored?.kind === "thinking" &&
            stored.text.length >= part.text.length
              ? stored.text
              : part.text;
          pending.parts.set(part.id, { kind: "thinking", text: settled });
        }
        break;
      case "tool": {
        const { status } = part.state;
        const emitted = state.toolsEmitted.get(part.callID);
        if (
          !emitted &&
          (status === "running" || status === "completed" || status === "error")
        ) {
          this.#flushMessages(state.pending, state.roles, callID);
          this.#ctx.frame({
            type: "assistant",
            uuid: part.messageID,
            ...this.#createdOf(part.messageID),
            contentOffset: blockIndex(
              this.#pendingChild(state, part.messageID),
              part.id
            ),
            parent_tool_use_id: callID,
            message: {
              content: [
                {
                  type: "tool_use",
                  id: part.callID,
                  name: part.tool,
                  input: toolInputOf(part.state.input),
                },
              ],
            },
          });
          state.toolsEmitted.set(part.callID, "called");
        }
        this.#codeModeFrames(
          part,
          this.#pendingChild(state, part.messageID),
          state.toolsEmitted,
          callID
        );
        if (
          (status === "completed" || status === "error") &&
          emitted !== "resolved"
        ) {
          this.#ctx.frame({
            type: "user",
            parent_tool_use_id: callID,
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: part.callID,
                  content:
                    status === "completed"
                      ? part.state.output
                      : part.state.error,
                  is_error: status === "error",
                },
              ],
            },
          });
          state.toolsEmitted.set(part.callID, "resolved");
        }
        break;
      }
      default:
        break;
    }
  }

  #flushChild(state: ChildState, callID: string): void {
    this.#flushMessages(state.pending, state.roles, callID);
    state.pending.clear();
  }

  /**
   * Publish buffered prose before a tool frame clears the dashboard's live
   * text. Each part goes once, whole, keyed by its message and its place in it
   * — the key a history read gives the same block. opencode finishes a part
   * before it starts the next, so a part is done by the time a later one's
   * tool call or the turn's end flushes it.
   */
  #flushMessages(
    messages: Map<string, PendingMessage>,
    roles: Map<string, "user" | "assistant">,
    parentToolUseId?: string
  ): void {
    for (const [messageID, pending] of messages) {
      if (roles.get(messageID) !== "assistant") {
        continue;
      }
      for (const [partID, part] of pending.parts) {
        if (!part.text || pending.published.has(partID)) {
          continue;
        }
        pending.published.add(partID);
        this.#ctx.frame({
          type: "assistant",
          uuid: messageID,
          ...this.#createdOf(messageID),
          contentOffset: blockIndex(pending, partID),
          ...(parentToolUseId ? { parent_tool_use_id: parentToolUseId } : {}),
          ...(this.#summaries.has(messageID)
            ? { compactSummary: true as const }
            : {}),
          message: {
            content: [
              part.kind === "text"
                ? { type: "text", text: part.text }
                : { type: "thinking", thinking: part.text },
            ],
          },
        });
      }
    }
  }

  /**
   * Closes the turn: replays each assistant message's accumulated blocks as a
   * final frame, then a result. `result` overrides the default `success` result
   * for the abort/error paths, which also close a turn.
   */
  #flushResult(closing?: {
    subtype: string;
    is_error: boolean;
    errors?: string[];
  }): void {
    // A turn ended at its account's usage limit closes on that refusal,
    // however OpenCode ended it once asked to stop ({@link refuseAtLimit}).
    const refusal = this.#limitRefusal;
    this.#limitRefusal = undefined;
    const result =
      refusal && this.#turnOpen
        ? {
            subtype: "error_during_execution",
            is_error: true,
            errors: [refusal],
          }
        : closing;
    // The live trace ends before the settled blocks replace it.
    this.#closeThinking();
    this.#flushMessages(this.#pending, this.#roles);
    // As read back: a code-mode call whose answer was never written ended
    // with nothing OpenCode kept.
    for (const key of this.#codeModeOpen) {
      this.#resolveCodeModeCall({
        type: "tool_result",
        tool_use_id: key,
        content: "",
      });
      this.#toolsEmitted.set(key, "resolved");
    }
    this.#codeModeOpen.clear();
    // Whatever was written behind an answer that never completed is read now.
    this.#answering = undefined;
    this.#releaseReads();
    const flushed = [...this.#pending.keys()];
    this.#pending.clear();
    // A ghost idle (e.g. the idle that trails an abort) has no open turn and must
    // not emit a result frame; only a real turn close or an explicit abort/error
    // does. Assistant-block replay above is unaffected.
    if (!(this.#turnOpen || result)) {
      return;
    }
    const turnCost = [...this.#costs.values()].reduce((a, b) => a + b, 0);
    const identity =
      this.#completion ??
      (this.#turnPrompt ? { uuid: this.#turnPrompt } : undefined);
    this.#turnOpen = false;
    // Clear even an inherited disk entry when the in-memory turn was already closed.
    if (this.sessionId) {
      markTurn(this.sessionId, false);
    }
    this.#ctx.frame({
      type: "result",
      ...identity,
      // biome-ignore lint/suspicious/noUnnecessaryConditions: history recovery sets this across calls to handle().
      ...(this.#recoveringTurn ? { recovered: true } : {}),
      subtype: result?.subtype ?? "success",
      is_error: result?.is_error ?? false,
      ...(result?.errors ? { errors: result.errors } : {}),
      total_cost_usd: this.#costBase + turnCost,
      turnUsage: usageByModel(this.#turnTokens.values()),
      cache: {
        read: this.#lastTokens.cache.read,
        write: this.#lastTokens.cache.write,
      },
      ...(this.#lastSent === undefined
        ? {}
        : { contextTokens: this.#lastSent }),
    });
    this.#costBase += turnCost;
    this.#costs.clear();
    this.#turnTokens.clear();
    for (const messageID of flushed) {
      this.#roles.delete(messageID);
      this.#summaries.delete(messageID);
    }
    this.#compacting = false;
    for (const [callID, state] of this.#toolsEmitted) {
      if (state === "resolved") {
        this.#toolsEmitted.delete(callID);
      }
    }
    this.#completion = undefined;
    this.#clearStallTimer();
  }

  /**
   * The server's word on whether this session is mid-turn, whether it arrived
   * as a `session.status` event or was read back on a resume.
   */
  #applyStatus(status: {
    type?: string;
    message?: string;
    next?: number;
  }): void {
    this.#turnRevision += 1;
    // A retrying turn is still a turn in flight — and the provider's own
    // words go straight to the transcript. A quota notice that only ever
    // lived in this event once hid as a silent hang for an hour.
    this.#busy = status.type === "busy" || status.type === "retry";
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #busy was just assigned a live boolean; biome's field-declaration inference doesn't see it
    if (this.#busy) {
      this.#turnOpen = true;
    }
    if (status.type === "retry" && status.message) {
      const wait = status.next
        ? ` — next attempt in ${Math.max(0, Math.round((status.next - Date.now()) / 1000))}s`
        : "";
      const note = `${status.message}${wait}`;
      if (note !== this.#lastRetryNote) {
        this.#lastRetryNote = note;
        this.#ctx.frame({
          type: "system",
          subtype: PROVIDER_RETRY,
          session_id: this.sessionId ?? undefined,
          content: note,
          retry: {
            message: status.message,
            ...(status.next ? { nextAttemptAt: status.next } : {}),
          },
        });
      }
      // OpenCode retries what the provider refused, and says why in the
      // provider's own words (session/processor.ts 674-686 at v1.18.34): a
      // refusal at the account's usage limit ends the turn on it now.
      if (this.account !== undefined && PROVIDER_LIMIT.test(status.message)) {
        this.refuseAtLimit(status.message).catch((cause: unknown) =>
          console.warn(
            `[opencode] ${this.instanceId}: could not end the turn at its limit: ${errorText(cause)}`
          )
        );
      }
    }
    this.#ctx.busy(this.#busy);
  }

  /**
   * A session reattached while its turn was already open on the server. That
   * turn was started by a process that no longer exists, so no `session.status`
   * event will ever open it here, nothing arms the stall notice, and the
   * operator's sends queue silently behind it — for hours, once. Ask the server
   * once: a busy or retrying answer opens the turn exactly as the event would,
   * arms the stall notice, and says so in the transcript. Fails soft: a status
   * read that errors leaves the session as it is; the spawn already succeeded.
   */
  async watchResumedTurn(): Promise<void> {
    if (this.sessionId === null) {
      return;
    }
    const revision = this.#turnRevision;
    try {
      const running = await this.#readActivity();
      if (!this.#snapshotCurrent(revision)) {
        return;
      }
      const reattachedBusy = this.#reattachedBusy;
      this.#reattachedBusy = false;
      if (!running) {
        // Idle on the server, yet the hub is still owed this turn's end: it
        // ended while nothing here was subscribed.
        if (this.#turnOpen || this.#sleepAfterRecovery) {
          await this.#endMissedTurn(revision);
          // A replay that closed the missed turn advanced the revision itself;
          // a newer live turn is likewise left to its own events.
          if (revision !== this.#turnRevision && !this.#sleepAfterRecovery) {
            return;
          }
        }
        if (
          // biome-ignore lint/suspicious/noUnnecessaryConditions: sleepAfterRecovery() arms this before attachment.
          this.#sleepAfterRecovery &&
          !this.#busy &&
          this.#queue.length === 0
        ) {
          await this.dispose();
          this.#ctx.closed?.();
          return;
        }
        // The turn the reattach found running ended before this session was
        // subscribed: no idle event is coming for it. A prompt this process
        // has sent since is a turn of its own, and keeps the session busy.
        // biome-ignore lint/suspicious/noUnnecessaryConditions: #reattachedBusy is set true by reattachedMidTurn() elsewhere in the class; the checker sees only its initializer
        if (reattachedBusy && this.#busy && this.#turnPrompt === undefined) {
          this.#busy = false;
          this.#ctx.busy(false);
        }
        return;
      }
      await this.#resumeReads(revision);
      if (!this.#snapshotCurrent(revision)) {
        return;
      }
      this.#applyStatus({ type: "busy" });
      this.#noteServerActivity();
      this.#ctx.frame({
        type: "system",
        subtype: "resumed_mid_turn",
        session_id: this.sessionId,
        content:
          "Resumed mid-turn: the provider was still working when this session was reattached. If nothing arrives, interrupt and retry.",
      });
    } catch (error) {
      if (this.#lifetime.signal.aborted) {
        return;
      }
      console.warn(
        `[opencode] could not read the status of resumed session ${this.sessionId}: ${errorText(error)}`
      );
    }
  }

  /** A snapshot never reopens a turn a live event ended, or closes a newer send. */
  #snapshotCurrent(revision: number): boolean {
    if (this.#lifetime.signal.aborted) {
      return false;
    }
    if (revision === this.#turnRevision) {
      return true;
    }
    console.info(
      `[opencode] ${this.instanceId}: discarded stale turn snapshot revision=${revision} current=${this.#turnRevision} busy=${this.#busy} open=${this.#turnOpen}`
    );
    return false;
  }

  /**
   * A turn the hub is owed ended on the server while nothing was subscribed —
   * the agent restarted, the server was respawned, or the subscription was
   * down. Its replies are replayed from the server's history through the path
   * live events take, and the turn ends as it ended there: done, failed, or —
   * a reply the idle server never finished — cut off with its server.
   *
   * Only the replies to the prompt this turn is for: a prompt this process
   * has just sent and the server has not stored yet is not answered by the
   * replies to the one before it, and is left to its own events.
   */
  async #endMissedTurn(revision: number): Promise<void> {
    const listed = await reached(
      this.#client.session.messages(
        // biome-ignore lint/style/noNonNullAssertion: invariant: watchResumedTurn returns before this when sessionId is null
        { sessionID: this.sessionId!, directory: this.#directory },
        {
          signal: AbortSignal.any([
            this.#lifetime.signal,
            AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
          ]),
        }
      )
    );
    if (listed.error || !listed.data) {
      throw new Error(
        `could not list the messages of session ${this.sessionId}: ${errorText(listed.error)}`
      );
    }
    const rows = listed.data as { info: Message; parts: Part[] }[];
    if (!this.#snapshotCurrent(revision)) {
      return;
    }
    const prompt = rows.findLast((row) => row.info.role === "user")?.info;
    if (!prompt || (this.#turnPrompt && prompt.id !== this.#turnPrompt)) {
      return;
    }
    const replies = rows.filter(
      (row) => row.info.role === "assistant" && row.info.parentID === prompt.id
    );
    const last = replies.at(-1)?.info as AssistantMessage | undefined;
    if (!last) {
      return;
    }
    const replay = (type: string, properties: object) =>
      this.handle({ type, properties } as unknown as Event);
    this.#open = true;
    this.#recoveringTurn = true;
    for (const { info, parts } of replies) {
      replay("message.updated", {
        info: { ...info, time: { ...info.time, completed: undefined } },
      });
      for (const part of parts) {
        replay("message.part.updated", { part });
      }
      replay("message.updated", { info });
    }
    if (last.error) {
      replay("session.error", { sessionID: this.sessionId, error: last.error });
    } else if (last.time.completed) {
      replay("session.idle", { sessionID: this.sessionId });
    } else {
      // Cut, not ended: the hub hands this turn back on hearing it, so a
      // recovery handle stays to take it up rather than going to sleep.
      this.#sleepAfterRecovery = false;
      this.#ctx.busy(false);
      this.#busy = false;
      this.#flushResult({
        subtype: "error_during_execution",
        is_error: true,
        errors: [SERVER_STOPPED_MID_TURN],
      });
      this.#drainQueue();
    }
    this.#recoveringTurn = false;
  }

  /**
   * Reattached while the server still runs this session's turn: busy from
   * the moment it is handed back, as a turn started here would be. The
   * reconcile after its subscription comes up ({@link watchResumedTurn})
   * reads the turn again and takes it from there — on to its end, or to the
   * end it reached before anything here was subscribed.
   */
  reattachedMidTurn(): void {
    this.#turnRevision += 1;
    this.#reattachedBusy = true;
    this.#busy = true;
    this.#ctx.busy(true);
  }

  /**
   * A turn an earlier agent process opened on this session and never ended:
   * the hub is still owed its end, and the reconcile after this session's
   * subscription comes up pays it (see {@link watchResumedTurn}).
   */
  inheritOpenTurn(): void {
    this.#open = true;
  }

  /** A recovery handle ends normally once the server says its turn is idle. */
  sleepAfterRecovery(): void {
    this.#sleepAfterRecovery = true;
  }

  /**
   * A turn this process did not start: which of its messages are sends still
   * waiting behind the answer being written, as the stored session says
   * ({@link queuedMessages}). They are read when that answer completes — the
   * word this process would have given had it written them itself — and every
   * message already there is one it will not count as new.
   */
  async #resumeReads(revision: number): Promise<void> {
    const listed = await this.#client.session.messages(
      // biome-ignore lint/style/noNonNullAssertion: invariant: watchResumedTurn returns before this when sessionId is null
      { sessionID: this.sessionId!, directory: this.#directory },
      {
        signal: AbortSignal.any([
          this.#lifetime.signal,
          AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
        ]),
      }
    );
    if (listed.error || !listed.data) {
      throw new Error(
        `could not list the messages of resumed session ${this.sessionId}: ${errorText(listed.error)}`
      );
    }
    const rows = listed.data as { info: Message; parts: Part[] }[];
    if (revision !== this.#turnRevision || this.#lifetime.signal.aborted) {
      return;
    }
    for (const { info } of rows) {
      this.#noteCreated(info);
      if (info.role === "user") {
        this.#written.add(info.id);
      }
    }
    const { ids, answering } = queuedMessages(rows);
    this.#readAfter.push(...ids);
    this.#answering = answering;
  }

  get directory(): string {
    return this.#directory;
  }

  /** Called only after SSE readiness, including every reconnect. */
  reconcileGates(): Promise<void> {
    if (this.#reconciling) {
      return this.#reconciling;
    }
    this.#reconciling = Promise.all(
      (
        [
          ["permission", "permission.asked"],
          ["question", "question.asked"],
        ] as const
      )
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: independent bounded retry with cancellation and one warning per endpoint failure
        .map(async ([path, type]) => {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              console.info(`[opencode] ${this.instanceId}: ${path} snapshot`);
              const options = {
                signal: AbortSignal.any([
                  this.#lifetime.signal,
                  AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
                ]),
              };
              const query = { directory: this.#directory };
              const listed =
                path === "permission"
                  ? // biome-ignore lint/performance/noAwaitInLoops: bounded retry of this endpoint, independently of the other gate endpoint
                    await this.#client.permission.list(query, options)
                  : await this.#client.question.list(query, options);
              if (listed.error || !listed.data) {
                throw new Error(errorText(listed.error));
              }
              const pending: { sessionID: string }[] = listed.data;
              if (this.#lifetime.signal.aborted) {
                return;
              }
              for (const ask of pending) {
                if (ask.sessionID === this.sessionId) {
                  this.handle({ type, properties: ask } as unknown as Event);
                }
              }
              this.#gateFailures.delete(path);
              return;
            } catch (error) {
              if (this.#lifetime.signal.aborted) {
                return;
              }
              if (!this.#gateFailures.has(path)) {
                this.#gateFailures.add(path);
                console.warn(
                  `[opencode] ${this.instanceId}: ${path} snapshot failed: ${String(error)}`
                );
              }
              if (attempt < 2) {
                await Bun.sleep(250 * 2 ** attempt);
              }
            }
          }
        })
    )
      .then(() => undefined)
      .finally(() => {
        this.#reconciling = undefined;
      });
    return this.#reconciling;
  }

  /** Any server event is progress: re-arm the stall notice while a turn is open. */
  #noteServerActivity(): void {
    if (!this.#turnOpen) {
      return;
    }
    this.#clearStallTimer();
    this.#stallTimer = setTimeout(() => {
      this.#stallTimer = undefined;
      if (!this.#turnOpen) {
        return;
      }
      this.#ctx.frame({
        type: "system",
        subtype: "provider_stalled",
        session_id: this.sessionId ?? undefined,
        content:
          "Still waiting on the provider with no output — the turn is open and may yet complete. If this persists, interrupt and retry.",
      });
    }, STALLED_TURN_MS);
  }

  #clearStallTimer(): void {
    if (this.#stallTimer !== undefined) {
      clearTimeout(this.#stallTimer);
      this.#stallTimer = undefined;
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: message ordering and explicit urgent interruption share the same generation dispatch gate
  send(
    message: SentMessage,
    extras: {
      attachments?: { name: string; content: string }[];
      images?: { mediaType: string; data: string }[];
      urgent?: boolean;
    }
  ): void {
    this.#sleepAfterRecovery = false;
    this.#turnRevision += 1;
    const { content } = message.message;
    let text =
      typeof content === "string"
        ? content
        : content
            .filter(
              (block): block is { type: "text"; text: string } =>
                block.type === "text"
            )
            .map((block) => block.text)
            .join("\n");

    // Urgent delivery: start a turn NOW, busy or not. Busy: interrupt the
    // running turn first, with a factual note. Idle: prompt directly — urgent
    // to an idle session degrading to a silent append left delegates holding
    // unread briefs forever, since drained appends never wake a session.
    const urgent = Boolean(extras.urgent);
    if (urgent && this.#busy) {
      text = `[Urgent — your previous turn was interrupted to deliver this]\n\n${text}`;
    }

    const parts: (
      | { type: "text"; text: string }
      | { type: "file"; mime: string; filename: string; url: string }
    )[] = [];
    if (text) {
      parts.push({ type: "text", text });
    }
    for (const image of extras.images ?? []) {
      parts.push({
        type: "file",
        mime: image.mediaType,
        filename: "image",
        url: `data:${image.mediaType};base64,${image.data}`,
      });
    }
    for (const attachment of extras.attachments ?? []) {
      parts.push({
        type: "text",
        text: `\n\n<pasted-text name="${attachment.name}">\n${attachment.content}\n</pasted-text>`,
      });
    }

    const model = this.#model ? splitModel(this.#model) : undefined;
    // The message it becomes is named up front, and the hub told at once, so
    // opencode's word that the message exists says which send it was — even
    // to a hub hearing it from an agent that has since restarted.
    const messageID = messageId();
    const { uuid } = message;
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_STORED,
      storedAs: { [uuid]: messageID },
      session_id: this.sessionId ?? undefined,
    });

    // Publication briefly holds new work. After publication, a retained turn
    // keeps running while its ordinary next sends await idle handoff.
    const retiredUrgent =
      urgent && this.#isConfigGateHeld() && !this.#isConfigGateHeld(true);
    if (
      this.#isConfigGateHeld(urgent) ||
      this.#draining ||
      (!retiredUrgent && this.#queue.length > 0)
    ) {
      this.#queue.push({ parts, ...(model ? { model } : {}), messageID, uuid });
      this.#drainQueue();
      return;
    }

    if (urgent) {
      // Explicit interrupts retain their original target; the replacement
      // prompt hands off before ordinary retained sends are drained.
      if (retiredUrgent) {
        this.#draining = messageID;
      }
      // biome-ignore lint/complexity/noVoid: fire-and-forget: send() itself is not awaited by its callers
      void this.#client.session
        .abort({
          // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
          sessionID: this.sessionId!,
          directory: this.#directory,
        })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: the abort's own failure is not actionable; the prompt below runs regardless
        .catch(() => {})
        .then(() => this.#prompt(parts, messageID, uuid, model));
      return;
    }
    // Idle or busy, every send is prompted at once: opencode writes it into
    // the session as a message straight away and the running loop takes it
    // up, which is the moment it is read.
    this.#ctx.busy(true);
    const command = parseCommand(text);
    if (command) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget: send() itself is not awaited by its callers
      void this.#commandOrPrompt(
        command.name,
        command.args,
        parts,
        messageID,
        uuid,
        model
      );
    } else {
      this.#prompt(parts, messageID, uuid, model);
    }
  }

  /**
   * Starts one prompt turn with the given parts, as message `messageID`, for
   * the send `uuid`. A prompt opencode refuses is that send's failure; the
   * session goes on.
   */
  #prompt(
    parts: unknown[],
    messageID: string,
    uuid: string,
    model?: { providerID?: string; modelID?: string }
  ): void {
    // biome-ignore lint/complexity/noVoid: send() remains synchronous while dispatch custody is prepared
    void this.#dispatchPrompt(parts, messageID, uuid, model);
  }

  async #dispatchPrompt(
    parts: unknown[],
    messageID: string,
    uuid: string,
    model?: { providerID?: string; modelID?: string }
  ): Promise<void> {
    try {
      await this.#prepareDispatch();
    } catch (error) {
      this.#ctx.rejected(uuid, error);
      this.#drained(messageID);
      return;
    }
    this.#turnOpen = true;
    this.#turnPrompt = messageID;
    this.#noteServerActivity();
    // Held until the server has it: a restart before then loses the send.
    const handed = holdRestart("write", `prompt:${messageID}`);
    // biome-ignore lint/complexity/noVoid: fire-and-forget: #prompt itself is not awaited by its callers
    void reached(
      this.#client.session.promptAsync({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
        messageID,
        parts: parts as never,
        tools: {
          cawco_submit_result: !!this.#workflowStepId,
          cawco_workflow_state_read: !!this.#workflowStepId,
          cawco_workflow_state_write: !!this.#workflowStepId,
          ...Object.fromEntries(
            [
              "start_session",
              "continue_session",
              "delegate",
              "stop_delegate",
              "interrupt_delegate",
              "answer_delegate",
              "set_item_checks",
              "run_workflow",
              "steer_workflow",
              "workflow_read",
              "list_workflows",
            ].map((name) => [`cawco_${name}`, this.#canDelegate !== false])
          ),
          // Denied last, so a denial is never switched back on above.
          ...this.#deniedTools,
          ...this.#mcpFence,
        },
        ...(this.#effort ? { variant: this.#effort } : {}),
        // A bare model id (no provider) is left to opencode's default; never send `providerID: ''`.
        ...(model?.providerID && model.modelID
          ? {
              model: { providerID: model.providerID, modelID: model.modelID },
            }
          : {}),
        ...(this.#permissionMode === "plan" ? { agent: "plan" } : {}),
      })
    )
      .then((res) => {
        if (res.error) {
          this.#ctx.rejected(uuid, new Error(errorText(res.error)));
          this.#drained(messageID);
        }
      })
      .catch((error: unknown) => {
        // A prompt that never reached the server never opens a turn there, so
        // no pump event will ever settle it: say so and leave busy clear here,
        // or the session strands busy with every later message queuing behind
        // nothing.
        this.#turnOpen = false;
        this.#clearStallTimer();
        this.#busy = false;
        this.#ctx.busy(false);
        this.#ctx.rejected(uuid, error);
        this.#drained(messageID);
      })
      .finally(handed);
  }

  /**
   * Delivers what the config gate held, in arrival order, each as the message
   * it was named — so each is read as itself.
   */
  #drainQueue(): void {
    // Do not dispatch during publication or while this session still awaits
    // idle handoff. configGateLifted() resumes the intact queue after rebinding.
    //
    // One at a time: opencode lists a session's messages in the order it
    // writes them, and `promptAsync` answers before the message is written
    // (it forks the prompt and returns), so two held sends asked for at once
    // were stored the wrong way round. The next goes when opencode says the
    // last one is a message (`message.updated`), or that it failed.
    if (this.#draining || this.#isConfigGateHeld()) {
      return;
    }
    const next = this.#queue.shift();
    if (!next) {
      return;
    }
    this.#ctx.busy(true);
    this.#draining = next.messageID;
    this.#prompt(next.parts, next.messageID, next.uuid, next.model);
  }

  /** The sends waiting on an answer, read. */
  #releaseReads(): void {
    if (this.#readAfter.length === 0) {
      return;
    }
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_READ,
      read: this.#readAfter.splice(0),
      session_id: this.sessionId ?? undefined,
    });
  }

  /** A held send is in, one way or the other: the next may go. */
  #drained(messageID: string): void {
    if (messageID === this.#draining) {
      this.#draining = undefined;
      this.#drainQueue();
    }
  }

  /** The command names this session can answer, fetched once and cached. */
  #commandNamesOf(): Promise<Set<string>> {
    if (!this.#commandNames) {
      this.#commandNames = reached(
        this.#client.command.list({ directory: this.#directory })
      ).then(
        (res) =>
          new Set(
            (res.error ? [] : (res.data as Command[])).map(
              (command) => command.name
            )
          )
      );
    }
    return this.#commandNames;
  }

  /** A `/name` turned: run it as a command, or send it as a plain prompt. */
  async #commandOrPrompt(
    name: string,
    args: string,
    parts: unknown[],
    messageID: string,
    uuid: string,
    model?: { providerID?: string; modelID?: string }
  ): Promise<void> {
    const names = await this.#commandNamesOf();
    // `/compact` is a TUI command in opencode, not a registered one: it is the
    // session.summarize call, so it never reaches the model as a prompt.
    if (name === "compact" && !names.has(name)) {
      await this.#summarize(uuid);
      return;
    }
    // `/mcp` is a TUI dialog in opencode, not a registered command: it is the
    // server's mcp.* calls, so it never reaches the model as a prompt.
    if (name === "mcp" && !names.has(name)) {
      await this.#mcpCommand(args, uuid);
      return;
    }
    if (!names.has(name)) {
      this.#prompt(parts, messageID, uuid, model);
      return;
    }
    try {
      await this.#prepareDispatch();
      await this.fenceCommandTurn();
    } catch (error) {
      this.#ctx.rejected(uuid, error);
      return;
    }
    this.#turnOpen = true;
    this.#turnPrompt = messageID;
    const handed = holdRestart("write", `command:${messageID}`);
    // biome-ignore lint/complexity/noVoid: fire-and-forget: #commandOrPrompt itself is not awaited by its callers
    void this.#client.session
      .command({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
        messageID,
        command: name,
        arguments: args,
        ...(this.#effort ? { variant: this.#effort } : {}),
        ...(this.#model ? { model: this.#model } : {}),
        ...(this.#permissionMode === "plan" ? { agent: "plan" } : {}),
      })
      .then((res) => {
        if (res.error) {
          this.#ctx.rejected(uuid, new Error(errorText(res.error)));
        }
      })
      .finally(handed);
  }

  /**
   * `/mcp auth|logout|connect|disconnect <server>`: opencode's `mcp` CLI
   * verbs as one command, since its TUI dialog is not a server
   * command. `auth` runs opencode's own OAuth flow, which opens a browser on
   * this machine, so it needs a desktop session here; a fleet server is signed
   * in by the hub instead (the dashboard answers `/mcp auth` for those itself).
   * The send `uuid` fails with the reason when a step is refused.
   */
  async #mcpCommand(args: string, uuid: string): Promise<void> {
    const [verb = "", server = ""] = args.trim().split(WHITESPACE_RE);
    const target = { name: server, directory: this.#directory };
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_READ,
      read: [uuid],
      session_id: this.sessionId ?? undefined,
    });
    try {
      if (!(verb && server)) {
        throw new Error(MCP_USAGE);
      }
      const res = await (() => {
        switch (verb) {
          case "auth":
          case "login":
            return this.#client.mcp.auth.authenticate(target);
          case "logout":
            return this.#client.mcp.auth.remove(target);
          case "connect":
          case "reconnect":
            return this.#client.mcp.connect(target);
          case "disconnect":
            return this.#client.mcp.disconnect(target);
          default:
            throw new Error(`Unknown /mcp verb "${verb}". ${MCP_USAGE}`);
        }
      })();
      if (res.error) {
        const reason = errorText(res.error);
        throw new Error(
          reason.includes("does not support OAuth")
            ? `${reason}. A fleet server signs in from the dashboard: Configure → MCP servers, or /mcp auth ${server} in its composer.`
            : reason
        );
      }
      if (verb === "auth" || verb === "login") {
        const connected = await this.#client.mcp.connect(target);
        if (connected.error) {
          throw new Error(errorText(connected.error));
        }
      }
    } catch (error) {
      this.#ctx.rejected(uuid, error);
    } finally {
      this.#ctx.busy(false);
    }
  }

  /** Compacts the session with its current model; the send `uuid` fails if opencode refuses. */
  async #summarize(uuid: string): Promise<void> {
    if (!this.#model) {
      this.#ctx.rejected(uuid, new Error("compact needs the session's model"));
      return;
    }
    try {
      await this.#prepareDispatch();
    } catch (error) {
      this.#ctx.rejected(uuid, error);
      return;
    }
    // opencode stores no user message for a compaction, so nothing else would
    // tell the hub this send was taken up; without it the row stays queued.
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_READ,
      read: [uuid],
      session_id: this.sessionId ?? undefined,
    });
    const { providerID, modelID } = splitModel(this.#model);
    const res = await this.#client.session.summarize({
      // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
      sessionID: this.sessionId!,
      directory: this.#directory,
      providerID,
      modelID,
    });
    if (res.error) {
      this.#ctx.rejected(uuid, new Error(errorText(res.error)));
    }
  }

  /** Providers the current OpenCode account can actually use, including OAuth. */
  #connectedProviders(): Promise<Pick<Provider, "id" | "models">[]> {
    return connectedProviders(this.#client, this.#directory);
  }

  /** The current model's context window, from a lazily-cached provider list. */
  async #contextLimit(): Promise<number> {
    if (!this.#model) {
      return 200_000;
    }
    this.#providersCache ??= this.#connectedProviders();
    const providers = await this.#providersCache;
    const ref = splitModel(this.#model);
    for (const provider of providers) {
      if (ref.providerID && provider.id !== ref.providerID) {
        continue;
      }
      const model = ref.modelID ? provider.models?.[ref.modelID] : undefined;
      if (model) {
        return requestWindow(model.limit);
      }
    }
    return 200_000;
  }

  /** The server's command list as neutral commands, tagged with what opencode says each one is. */
  async #commands(): Promise<SlashCommand[]> {
    const result = await reached(
      this.#client.command.list({ directory: this.#directory })
    );
    if (result.error) {
      return [];
    }
    // The server supplies source; the installed SDK's Command type omits it.
    const listed = (result.data as (Command & { source?: string })[]).map(
      (command): SlashCommand => ({
        name: command.name,
        description: command.description ?? "",
        argumentHint: "",
        kind: COMMAND_KINDS[command.source ?? ""] ?? "custom",
      })
    );
    // The server does not list `/mcp` (a TUI dialog there); #mcpCommand answers it.
    return listed.some((command) => command.name === "mcp")
      ? listed
      : [
          ...listed,
          {
            name: "mcp",
            description:
              "Sign in to, sign out of, connect or disconnect an MCP server",
            argumentHint: "auth|logout|connect|disconnect <server>",
            kind: "builtin",
          },
        ];
  }

  async control(method: string, args: unknown[]): Promise<unknown> {
    // Config convergence gate: MCP mutations must not race with a dispose
    // cycle. Reads, interrupt, and local-only setters are always allowed.
    if (
      this.#isConfigGateHeld() &&
      (method === CONTROL_MCP_RECONNECT || method === CONTROL_MCP_TOGGLE)
    ) {
      throw new Error(`${method} blocked: config reload in progress`);
    }
    if (method === INSTALL_SESSION_CREDENTIAL) {
      return await this.#installCredential(args[0]);
    }
    if (method === VERIFY_SESSION_CREDENTIAL) {
      return await this.#verifyCredential();
    }
    switch (method) {
      case CONTROL_INTERRUPT:
        await this.interrupt();
        return undefined;
      case CONTROL_SET_MODEL:
        this.#model = args[0] as string;
        return undefined;
      case CONTROL_SET_EFFORT:
        if (!EFFORT_LEVELS.includes(args[0] as EffortLevel)) {
          throw new Error(`Unsupported OpenCode effort: ${String(args[0])}`);
        }
        this.#effort = args[0] as EffortLevel;
        this.sayEffort();
        return undefined;
      case CONTROL_SET_PERMISSION_MODE:
        this.#permissionMode = args[0] as string;
        return undefined;
      case CONTROL_CONTEXT_USAGE: {
        const tokens = this.#lastTokens;
        const total =
          tokens.input +
          tokens.output +
          tokens.reasoning +
          tokens.cache.read +
          tokens.cache.write;
        const maxTokens = await this.#contextLimit();
        return {
          totalTokens: total,
          maxTokens,
          percentage: Math.min(100, Math.round((total / maxTokens) * 100)),
          categories: [
            {
              name: "Input",
              tokens: tokens.input,
              color: "var(--flexoki-blue)",
            },
            {
              name: "Output",
              tokens: tokens.output,
              color: "var(--flexoki-green)",
            },
            {
              name: "Reasoning",
              tokens: tokens.reasoning,
              color: "var(--flexoki-orange)",
            },
          ],
        };
      }
      case CONTROL_SUPPORTED_MODELS:
        return await opencodeCatalog(this.#client, this.#directory);
      case CONTROL_SUPPORTED_COMMANDS:
        return await this.#commands();
      case CONTROL_RELOAD_SKILLS:
        // The server caches commands and skills at startup: this answers what
        // the server knows. Disk additions appear only after a server restart.
        return {
          skills: (await this.#commands()).filter(
            (command) => command.kind === "skill"
          ),
        };
      case CONTROL_MCP_STATUS: {
        const result = await reached(
          this.#client.mcp.status({ directory: this.#directory })
        );
        if (result.error) {
          return [];
        }
        const statuses = (result.data ?? {}) as Record<string, McpStatus>;
        return Object.entries(statuses).map(
          ([name, status]): McpServerStatus => ({
            name,
            status:
              status.status === "needs_auth" ||
              status.status === "needs_client_registration"
                ? "needs-auth"
                : status.status,
            ...("error" in status ? { error: status.error } : {}),
          })
        );
      }
      case CONTROL_MCP_RECONNECT: {
        const name = args[0] as string;
        const connected = await reached(
          this.#client.mcp.connect({
            name,
            directory: this.#directory,
          })
        );
        if (connected.error) {
          throw new Error(errorText(connected.error));
        }
        const snapshot = await reached(
          this.#client.mcp.status({ directory: this.#directory })
        );
        if (snapshot.error) {
          throw new Error(errorText(snapshot.error));
        }
        const status = snapshot.data?.[name];
        if (status?.status !== "connected") {
          throw new Error(
            `MCP ${name} is not connected (${status?.status ?? "missing"}).`
          );
        }
        return undefined;
      }
      case CONTROL_MCP_TOGGLE: {
        const name = args[0] as string;
        const enabled = args[1] as boolean;
        const target = { name, directory: this.#directory };
        await reached(
          enabled
            ? this.#client.mcp.connect(target)
            : this.#client.mcp.disconnect(target)
        );
        return undefined;
      }
      default:
        // An unsupported control verb is a silent no-op, never a user-facing
        // failure: the hub may send a reload this harness has no verb for, and a
        // session must not answer that with an error the reader sees.
        console.warn(`[opencode] no control verb ${method} — ignored`);
        return undefined;
    }
  }

  /**
   * OpenCode's reply carries no words, and its rejection writes the row: a
   * withdrawn gate is rejected as a denied one is.
   */
  withdrawPermission(requestId: string, message: string): void {
    this.resolvePermission(requestId, { behavior: "deny", message });
  }

  resolvePermission(requestId: string, result: PermissionResult): void {
    if (this.#resolvedGates.has(requestId)) {
      return;
    }
    if (this.#questions.has(requestId)) {
      this.#resolvedGates.add(requestId);
      this.#ctx.permissionResolved?.(requestId);
      this.#questions.delete(requestId);
      const questions = this.#questionData.get(requestId) ?? [];
      this.#questionData.delete(requestId);
      // Nothing is framed on either branch: replying settles the `question`
      // tool part, and that part is what writes the row. Framing here as well
      // drew the answer twice, once under the request id and once under the
      // tool's own call id.
      if (result.behavior === "deny") {
        // biome-ignore lint/complexity/noVoid: fire-and-forget: resolvePermission itself is not awaited by its callers
        void this.#rejectQuestion(requestId);
        return;
      }
      // The reader's choices arrive keyed by question text (QuestionCard builds
      // `UserAnswers` that way); opencode's reply API wants one label array per
      // question, in the order `question.asked` published them — so the join is
      // the question text on both sides.
      const answersByQuestion =
        (result as { updatedInput?: { answers?: UserAnswers } }).updatedInput
          ?.answers ?? {};
      const answers = questions.map((q) => {
        const raw = answersByQuestion[q.question];
        if (Array.isArray(raw)) {
          return raw;
        }
        if (typeof raw === "string") {
          return [raw];
        }
        return [] as string[];
      });
      // biome-ignore lint/complexity/noVoid: fire-and-forget: resolvePermission itself is not awaited by its callers
      void this.#replyQuestion(requestId, answers);
      return;
    }
    let response: "once" | "always" | "reject";
    if (result.behavior === "deny") {
      response = "reject";
    } else if (result.remember) {
      response = "always";
    } else {
      response = "once";
    }
    this.#replyPermission(requestId, response);
  }

  /** The one answer path for a tool permission — the auto-allow shares it. */
  #replyPermission(
    requestId: string,
    response: "once" | "always" | "reject"
  ): void {
    if (this.#resolvedGates.has(requestId)) {
      return;
    }
    this.#resolvedGates.add(requestId);
    this.#ctx.permissionResolved?.(requestId);
    // biome-ignore lint/complexity/noVoid: fire-and-forget: #replyPermission itself is not awaited by its callers
    void withRestartHold("write", `permission:${requestId}`, () =>
      reached(
        this.#client.permission.reply(
          { requestID: requestId, directory: this.#directory, reply: response },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      )
    ).catch((error: unknown) =>
      console.warn(`[opencode] permission reply failed: ${String(error)}`)
    );
  }

  #replyQuestion(id: string, answers: string[][]): Promise<void> {
    return (
      withRestartHold("write", `question:${id}`, () =>
        reached(
          this.#client.question.reply(
            { requestID: id, directory: this.#directory, answers },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        )
      )
        .then((res) => {
          if (res.error) {
            this.#ctx.failed(
              new Error(
                `opencode question reply failed: ${errorText(res.error)}`
              )
            );
          }
        })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: a request that never reached the server is not the session's failure; nothing further to report here
        .catch(() => {})
    );
  }

  #rejectQuestion(id: string): Promise<void> {
    return (
      withRestartHold("write", `question:${id}`, () =>
        reached(
          this.#client.question.reject(
            { requestID: id, directory: this.#directory },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        )
      )
        .then((res) => {
          if (res.error) {
            this.#ctx.failed(
              new Error(
                `opencode question reject failed: ${errorText(res.error)}`
              )
            );
          }
        })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: a request that never reached the server is not the session's failure; nothing further to report here
        .catch(() => {})
    );
  }

  /**
   * The credential its plugin stamps into each CawCo call, recorded by
   * OpenCode session id and acknowledged with itself: a session this agent
   * launched installs the one the hub minted for this spawn.
   */
  async #installCredential(credential: unknown) {
    if (typeof credential !== "string" || !credential) {
      throw new Error("Session credential is missing.");
    }
    await storeOpencodeCredential(
      this.#opencodeSessionId(),
      { credential, instanceId: this.instanceId },
      this.#liveSessions()
    );
    await acknowledgeSessionCredential(credential);
    return {
      installed: true,
      harness: "opencode",
      instanceId: this.instanceId,
    };
  }

  /**
   * A session an earlier agent launched still holds its credential in the
   * store the plugin reads; the hub acknowledging it is the proof.
   */
  async #verifyCredential(): Promise<{ credential: string }> {
    const credential = (await readOpencodeCredentials())[
      this.#opencodeSessionId()
    ]?.credential;
    if (!credential) {
      throw new Error("This OpenCode session holds no session credential.");
    }
    await acknowledgeSessionCredential(credential);
    console.info(`[opencode] held credential verified ${this.instanceId}`);
    return { credential };
  }

  #opencodeSessionId(): string {
    if (!this.sessionId) {
      throw new Error("This OpenCode session has no session id.");
    }
    return this.sessionId;
  }

  async interrupt(): Promise<void> {
    await reached(
      this.#client.session.abort({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
      })
    );
  }

  /** The provider's usage-limit refusal the open turn ends on, once asked to stop. */
  #limitRefusal: string | undefined;

  /**
   * The provider refused this session's request at its account's usage
   * limit (OpenCode's retry status said so): the open turn is stopped now and
   * closes on that refusal, so the hub's at-limit decision runs at once
   * instead of after OpenCode's own retries of a refusal no retry gets past.
   */
  async refuseAtLimit(error: string): Promise<void> {
    if (!this.#turnOpen || this.#limitRefusal) {
      return;
    }
    this.#limitRefusal = error;
    console.info(
      `[opencode] ${this.instanceId}: its account's usage limit refused the request; ending the turn on it`
    );
    await this.interrupt();
  }

  /**
   * Written into the session as a message that starts no turn (`noReply`),
   * under a mark {@link toTranscript} reads back as the stop the live stream
   * drew. Its words reach the model as context too, so a later turn knows
   * why the last one ended. Counted as written here, so it is no send read.
   */
  async noteStopped(words: string): Promise<void> {
    const messageID = messageId();
    this.#written.add(messageID);
    const written = await reached(
      this.#client.session.prompt({
        sessionID: this.#opencodeSessionId(),
        directory: this.#directory,
        messageID,
        noReply: true,
        parts: [
          {
            type: "text",
            synthetic: true,
            text: `CawCo stopped this session: it failed the same way ${REPEATED_FAILURE_LIMIT} times in a row, with nothing sent in between.\n\n${words}`,
            metadata: { cawco: REPEATED_FAILURE, words },
          },
        ],
      })
    );
    if (written.error) {
      throw new Error(errorText(written.error));
    }
  }

  async stop(): Promise<void> {
    this.#lifetime.abort();
    this.#onRelease();
    this.#turnOpen = false;
    this.#clearStallTimer();
    await this.#client.session
      .abort({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
      })
      // biome-ignore lint/suspicious/noEmptyBlockStatements: stop() is tearing down regardless; the abort's own failure is not actionable
      .catch(() => {});
  }

  // biome-ignore lint/suspicious/useAwait: implements Harness.dispose's Promise<void> contract; this session's teardown is synchronous
  async dispose(): Promise<void> {
    this.#lifetime.abort();
    this.#onRelease();
  }
}

/**
 * One OpenCode server's custody and the client adopted for its active
 * generation: the machine's own, which runs every session on no account, or
 * one account's, which runs every session on that account.
 */
interface ServerSlot {
  /** The account whose server this is; undefined for the machine's own. */
  readonly account: string | undefined;
  /** The config, binary and launch its active server was verified on (an account's). */
  applied: string | null;
  client: OpencodeClient | null;
  /** Since when no session has been on its server (an account's); null while one is. */
  idleSince: number | null;
  readonly owner: OpencodeServerOwner;
  ready: Promise<OpencodeClient> | null;
  /**
   * While {@link OpencodeHarness.#ensureAccount} starts, boots and verifies
   * the server (an account's): its client is already set, but it is not yet
   * the watcher's to replace or retire.
   */
  starting: boolean;
}

/** Each account's OpenCode models, by OpenCode's provider id, as its own server last listed them. */
const ACCOUNT_CATALOGS = join(OPENCODE_DIR, "cawco-account-catalogs.json");

export class OpencodeHarness implements Harness {
  readonly kind = "opencode" as const;
  /** Its catalog is the server's: {@link listSessions} starts one. */
  readonly catalogFromServer = true as const;
  readonly capabilities = OPENCODE_CAPABILITIES;
  auth: import("@cawco/core").AuthState = "authenticated";

  #sessiond: Promise<SessiondClient> | undefined;
  readonly #serverOwner = this.#newOwner(undefined);
  readonly #machine: ServerSlot = {
    account: undefined,
    applied: null,
    client: null,
    idleSince: null,
    owner: this.#serverOwner,
    ready: null,
    starting: false,
  };
  /** Every account's own server this agent keeps or has a record of, by account. */
  readonly #accounts = new Map<string, ServerSlot>();
  #recorded: Promise<void> | null = null;
  /** An account's server being replaced or verified by the config watcher: one at a time. */
  #accountApplying = false;
  #accountCatalogs: Record<string, ModelInfo[]> | undefined;

  get #client(): OpencodeClient | null {
    return this.#machine.client;
  }
  set #client(client: OpencodeClient | null) {
    this.#machine.client = client;
  }
  get #ready(): Promise<OpencodeClient> | null {
    return this.#machine.ready;
  }
  set #ready(ready: Promise<OpencodeClient> | null) {
    this.#machine.ready = ready;
  }

  #newOwner(account: string | undefined): OpencodeServerOwner {
    return new OpencodeServerOwner(
      () => this.sessiond(),
      async (sessiond, procId, spec, signal) =>
        (await attachOpencodeServer({ sessiond, procId, spec, signal })).url,
      isMachineAgent,
      (identity) => this.#generationIdle(identity),
      account
    );
  }

  /** The account's server slot, made on first use. */
  #accountSlot(account: string): ServerSlot {
    let slot = this.#accounts.get(account);
    if (!slot) {
      slot = {
        account,
        applied: null,
        client: null,
        idleSince: null,
        owner: this.#newOwner(account),
        ready: null,
        starting: false,
      };
      this.#accounts.set(account, slot);
    }
    return slot;
  }

  /** The server a session on `account` runs in: that account's own, or the machine's. */
  #slotOf(account: string | undefined): ServerSlot {
    return account === undefined ? this.#machine : this.#accountSlot(account);
  }

  #slots(): ServerSlot[] {
    return [this.#machine, ...this.#accounts.values()];
  }

  /** The slot whose server a generation is (or was). */
  #slotOfGeneration(identity: ServerIdentity): ServerSlot | undefined {
    return this.#slots().find((slot) =>
      slot.owner.generations.some(
        (generation) => generation.procId === identity.procId
      )
    );
  }

  /** Every recorded generation of every server, the machine's and each account's. */
  #generations(): ServerIdentity[] {
    return this.#slots().flatMap((slot) => slot.owner.generations);
  }

  /**
   * The accounts' servers an earlier agent left running, from the keeper's
   * records: custody, recovery and every reading of the machine's runners
   * take them in, so none is mistaken for a stranger's.
   */
  #loadRecorded(): Promise<void> {
    this.#recorded ??= (async () => {
      for (const account of await OpencodeServerOwner.recordedAccounts()) {
        this.#accountSlot(account);
      }
      await Promise.all(
        this.#slots().map((slot) => slot.owner.liveGenerations())
      );
    })().catch((error: unknown) => {
      this.#recorded = null;
      throw error;
    });
    return this.#recorded;
  }

  async #liveGenerations(): Promise<ServerIdentity[]> {
    await this.#loadRecorded();
    return (
      await Promise.all(
        this.#slots().map((slot) => slot.owner.liveGenerations())
      )
    ).flat();
  }

  /** Whether any session or subagent of this agent is on a generation of the slot's server. */
  #slotHeld(slot: ServerSlot): boolean {
    const procIds = new Set(slot.owner.generations.map((g) => g.procId));
    return (
      [...this.#sessionOwners.values()].some((owner) =>
        procIds.has(owner.procId)
      ) ||
      [...this.#children.values()].some((child) =>
        procIds.has(child.identity.procId)
      )
    );
  }
  #verifiedProcId: string | null = null;
  #opening = 0;
  #mutatingMcp = 0;
  readonly #activities = new Map<string, OpencodeActivity>();
  readonly #generationClients = new Map<string, OpencodeClient>();
  readonly #sessionOwners = new Map<string, ServerIdentity>();
  readonly #pendingSessionAddresses = new Map<
    string,
    import("@cawco/core").SessionAddress
  >();
  readonly #migrations = new Map<string, Promise<void>>();
  readonly #pendingRecoveries = new Map<
    string,
    Promise<OpencodeSession | undefined>
  >();
  #recoveryWave: RecoveryWave | null = null;
  #handoffTimer: ReturnType<typeof setTimeout> | null = null;
  #deferredRevision: string | null = null;
  // Keyed by instanceId, not opencode's own session id: a resume reuses the
  // same sessionKey (opencode.ts:spawn), so multiple live instances can share
  // one opencode session id, and a map keyed by THAT would silently overwrite
  // an earlier instance's entry with a later one's on every such resume.
  // Event routing, which only has opencode's own id off the wire, falls back
  // to {@link OpencodeHarness.#sessionForSid}.
  readonly #sessions = new Map<string, OpencodeSession>();
  readonly #children = new Map<
    string,
    { parent: OpencodeSession; callID: string; identity: ServerIdentity }
  >();
  #disposed = false;
  /**
   * The one subscription loop each directory has, by the controller that ends
   * it. A loop runs only while it is the one on record here: stopping it
   * (a config restart, dispose) aborts that controller, and the loop ends
   * rather than reconnecting beside its replacement. opencode binds 4096
   * again after a restart, so an old loop's client reaches the new server,
   * and every event of that directory arrived twice — a turn's second
   * `session.idle` then closed the turn the next prompt had just opened.
   */
  readonly #pumps = new Map<string, AbortController>();
  readonly #pumpReady = new Map<string, Promise<void>>();
  /** Directories whose subscription is up right now. */
  readonly #pumpConnected = new Set<string>();
  #recovering = 0;
  #recoveryHighWater = 0;
  readonly #recoveryWaiters: (() => void)[] = [];
  readonly #reconcileJobs = new Map<OpencodeSession, Promise<void>>();
  readonly #reconcileAgain = new Set<OpencodeSession>();

  constructor() {
    gaugeTables("opencode", {
      slots: this.#accounts,
      sessions: this.#sessions,
      children: this.#children,
      activities: this.#activities,
      sessionOwners: this.#sessionOwners,
      generationClients: this.#generationClients,
      pumps: this.#pumps,
      reconcileJobs: this.#reconcileJobs,
    });
  }

  // ---------------------------------------------------- config convergence

  /**
   * State of the config convergence subsystem:
   *
   * - `desiredHash`: hash of the relevant opencode.json on disk, last read.
   * - `appliedHash`: hash that the running server was last started with. `null`
   *   when the server was adopted (not started by us) and the baseline is unknown.
   * - `configState`: observable via fleetStatus / logs.
   * - `configError`: what went wrong, when state is "error".
   *
   * Only the LATEST desired revision matters — earlier ones are coalesced away.
   */
  #desiredHash: string | null = null;
  #appliedHash: string | null = null;
  #desiredVersion: string | null = null;
  #appliedVersion: string | null = null;
  #versionProbe: Promise<string> | null = null;
  #versionProbedAt = 0;
  #configState: "idle" | "pending" | "applying" | "applied" | "error" = "idle";
  #configError: string | null = null;
  #configWatchTimer: ReturnType<typeof setInterval> | null = null;
  #checkingPublication = false;
  #retryConfigAt = 0;
  /** Whether this agent keeps the server converged; see {@link #readsThisConfig}. */
  #converging = false;

  /**
   * Whether the server reads the opencode config this agent writes, in the
   * server's own words: `/path` reports the global config directory it loaded.
   */
  async #readsThisConfig(client: OpencodeClient): Promise<boolean> {
    const paths = await reached(
      client.path.get({}, { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) })
    );
    const reads = (paths.data as { config?: string } | undefined)?.config;
    if (reads === OPENCODE_DIR) {
      return true;
    }
    console.log(
      JSON.stringify({
        type: "config-convergence",
        state: "idle",
        detail: `server reads ${reads ?? "an unreported config"}, this agent writes ${OPENCODE_DIR}; not converging it`,
        at: Date.now(),
      })
    );
    return false;
  }

  /**
   * Lock held while a config change is being applied. When non-null, spawn and
   * send must queue their work until the lock resolves.
   */
  #applyGate: { promise: Promise<void>; resolve: () => void } | null = null;
  readonly #pendingSpawns: {
    resolve: (session: HarnessSession) => void;
    reject: (error: Error) => void;
    spec: SpawnPayload;
    ctx: HarnessContext;
  }[] = [];

  // ---------------------------------------------- config convergence methods

  /**
   * {@link configHash} of opencode.json as it is on disk now, with the
   * project servers placed for OpenCode ({@link OPENCODE_PLACED_MCP}).
   * Returns null if opencode.json is missing or malformed.
   */
  async #hashConfig(): Promise<string | null> {
    const config = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
    if (!config) {
      return null;
    }
    // The placed servers too: an instance takes them only as it loads
    // (the plugin's `config` hook), so a change restarts the server.
    const placed = await readJson<PlacedMcp>(OPENCODE_PLACED_MCP);
    return placed && Object.keys(placed).length > 0
      ? createHash("sha256")
          .update(configHash(config))
          .update(canonicalizeJson(placed))
          .digest("hex")
      : configHash(config);
  }

  /** Poll the installed CLI every 30s; upgrading it does not replace sessiond's server. */
  #installedVersion(): Promise<string> {
    if (!this.#versionProbe || Date.now() - this.#versionProbedAt >= 30_000) {
      this.#versionProbedAt = Date.now();
      this.#versionProbe = (async () => {
        const binary = resolveBin("opencode");
        if (!binary) {
          throw new Error("opencode binary not found");
        }
        const ran = await Bun.$`${binary} --version`.quiet().nothrow();
        const version = ran.stdout.toString().trim();
        if (ran.exitCode !== 0 || !version) {
          throw new Error(
            `opencode version probe failed: ${ran.stderr.toString()}`
          );
        }
        return version;
      })();
    }
    return this.#versionProbe;
  }

  /**
   * Watch config every 2s and the installed binary every 30s. An adopted server
   * must match both before convergence considers it current.
   */
  #startConfigWatcher(): void {
    if (this.#configWatchTimer) {
      return;
    }
    this.#configWatchTimer = setInterval(() => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget tick; errors logged, not thrown
      void this.#configTick().catch((error: unknown) =>
        console.warn(`[opencode] convergence probe failed: ${error}`)
      );
    }, 2000);
  }

  #stopConfigWatcher(): void {
    if (this.#configWatchTimer) {
      clearInterval(this.#configWatchTimer);
      this.#configWatchTimer = null;
    }
  }

  /**
   * One tick of the config watcher. Reads the hash, compares to applied,
   * and if different, records the desired revision and attempts to apply.
   */
  async #configTick(): Promise<void> {
    // A fleet sync pokes this directly; only a converging agent acts on it.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method biome's per-method inference doesn't see
    if (!this.#converging) {
      return;
    }
    const hash = await this.#hashConfig();
    const version = await this.#installedVersion();
    for (const slot of this.#slots()) {
      slot.owner.maintain();
    }
    await this.#retireIdleAccounts();
    const versionChanged = version !== this.#desiredVersion;
    this.#desiredVersion = version;
    if (hash === null) {
      // Malformed or missing config — surface the error but don't stop the
      // healthy backend.
      if (
        this.#configState !== "error" ||
        this.#configError !== "malformed config"
      ) {
        this.#configState = "error";
        this.#configError = "malformed config";
        console.log(
          JSON.stringify({
            type: "config-convergence",
            state: "error",
            detail: "malformed or missing opencode.json",
            at: Date.now(),
          })
        );
      }
      return;
    }
    if (hash === this.#appliedHash && version === this.#appliedVersion) {
      this.#desiredHash = hash;
      this.#desiredVersion = version;
      if (!this.#applyGate) {
        this.#configState = "applied";
        this.#configError = null;
        await this.#convergeAccounts();
      }
      return;
    }
    if (hash === this.#desiredHash && !versionChanged) {
      // No change since last read. But if we're pending (a prior attempt was
      // blocked by busy sessions), retry the apply — the sessions may be idle now.
      if (this.#configState === "pending" || this.#configState === "error") {
        // biome-ignore lint/complexity/noVoid: fire-and-forget; the attempt manages its own errors
        void this.#attemptConfigApply();
      }
      return;
    }
    this.#desiredHash = hash;
    // New desired revision differs from applied: coalesce and attempt.
    this.#configState = "pending";
    this.#configError = null;
    console.log(
      JSON.stringify({
        type: "config-convergence",
        state: "pending",
        detail: `new revision ${hash.slice(0, 8)}… vs applied ${this.#appliedHash?.slice(0, 8) ?? "unknown"}; binary ${version} vs running ${this.#appliedVersion ?? "unknown"}`,
        at: Date.now(),
      })
    );
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the attempt manages its own errors
    void this.#attemptConfigApply();
  }

  /**
   * An account's server no session has been on for
   * {@link ACCOUNT_SERVER_IDLE_MS} is retired: ended once it reports nothing
   * running ({@link #generationIdle}), and started again by the next session
   * on the account.
   */
  async #retireIdleAccounts(): Promise<void> {
    const now = Date.now();
    for (const slot of this.#accounts.values()) {
      if (
        !slot.owner.active ||
        this.#slotHeld(slot) ||
        slot.starting ||
        this.#operationsPending()
      ) {
        slot.idleSince = null;
        continue;
      }
      slot.idleSince ??= now;
      if (now - slot.idleSince < ACCOUNT_SERVER_IDLE_MS) {
        continue;
      }
      slot.idleSince = null;
      slot.client = null;
      slot.ready = null;
      slot.applied = null;
      console.info(
        `[opencode] account ${slot.account}: no session on its server for ${ACCOUNT_SERVER_IDLE_MS / 60_000} minutes`
      );
      // biome-ignore lint/performance/noAwaitInLoops: one retirement at a time; each reads the keeper
      await slot.owner.retireActive();
    }
  }

  /** What an account's running server must have been verified on: the machine's config and binary, and its own launch. */
  async #accountRevision(account: string): Promise<{
    revision: string;
    spec: ProcSpec;
  }> {
    const spec = await accountServerSpec(account, await this.#launchConfig());
    return {
      spec,
      revision: `${this.#desiredHash}/${this.#desiredVersion}/${launchOf(spec)}`,
    };
  }

  /**
   * Every running account's server squared with the machine's config and
   * binary, once the machine's own is, and with the account's credential as
   * its server reads it at start: one launched on another is replaced the
   * way the machine's is ({@link #replaceAccount}). An account gone from the
   * machine is left to retire.
   */
  async #convergeAccounts(): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #accountApplying is held across this method's awaits; a tick arriving meanwhile reads it true
    if (this.#accountApplying || this.#applyGate || fenced()) {
      return;
    }
    this.#accountApplying = true;
    try {
      for (const slot of this.#accounts.values()) {
        const { account } = slot;
        if (
          slot.starting ||
          !(account && slot.owner.active && slot.client && readHeld(account))
        ) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: one server is replaced at a time
        const { revision, spec } = await this.#accountRevision(account);
        // Read again after the await: a start may have begun meanwhile.
        if (slot.starting || slot.applied === revision) {
          continue;
        }
        try {
          await this.#replaceAccount(slot, spec, revision);
        } catch (error) {
          console.warn(
            `[opencode] account ${account}: its server was not replaced: ${errorText(error)}; tried again on the next tick`
          );
        }
      }
    } finally {
      this.#accountApplying = false;
    }
  }

  /**
   * A verified candidate for the account's server, published while the
   * incumbent's turns keep running; its sessions are handed over as they come
   * to rest ({@link #handoffIdle}), as the machine's are on a config change.
   */
  async #replaceAccount(
    slot: ServerSlot,
    spec: ProcSpec,
    revision: string
  ): Promise<void> {
    const { account } = slot;
    if (account === undefined) {
      throw new Error("The machine's server is replaced by its own apply.");
    }
    await prepareAccountServer(account);
    const launch = launchOf(spec);
    await slot.owner.replace(
      spec,
      async (identity, signal) => {
        const candidate = createOpencodeClient({
          baseUrl: identity.url,
          fetch: Object.assign(fetchOpencode, {
            preconnect: fetch.preconnect,
          }),
        });
        await bootInstance(candidate);
        if (!(await this.#readsThisConfig(candidate))) {
          throw new Error("Candidate reads another global config root.");
        }
        await this.#verifyApply(
          candidate,
          identity,
          this.#desiredHash,
          this.#desiredVersion,
          signal,
          launch
        );
      },
      (identity) => {
        this.#adopt(slot, identity);
        slot.applied = revision;
        // biome-ignore lint/complexity/noVoid: publication does not wait for busy incumbent sessions to migrate
        void this.#handoffIdle().catch(console.warn);
      }
    );
  }

  #activity(identity: ServerIdentity): OpencodeActivity {
    const key = `${identity.epoch}/${identity.procId}/${identity.startedAt}`;
    let activity = this.#activities.get(key);
    if (!activity) {
      activity = new OpencodeActivity(
        key,
        this.#serverOwner.startedAtMs(identity)
      );
      this.#activities.set(key, activity);
    }
    return activity;
  }

  #clientForGeneration(identity: ServerIdentity): OpencodeClient {
    let client = this.#generationClients.get(identity.procId);
    if (!client) {
      client = createOpencodeClient({
        baseUrl: identity.url,
        fetch: Object.assign(fetchOpencode, { preconnect: fetch.preconnect }),
      });
      this.#generationClients.set(identity.procId, client);
    }
    return client;
  }

  #pumpKey(directory: string, identity: ServerIdentity): string {
    return `${identity.procId}\n${directory}`;
  }

  /**
   * The session handed to the active generation of its own server, once it
   * is at rest there: the machine's for a session on no account, its
   * account's own otherwise. A config change makes a new generation of the
   * same server; a session reattached where its turn was running is brought
   * to its account's server the same way.
   */
  #migrate(session: OpencodeSession): Promise<void> {
    const slot = this.#slotOf(session.account);
    const target = slot.owner.active;
    const old = this.#sessionOwners.get(session.instanceId);
    const { sessionId } = session;
    if (!(target && old && sessionId) || target.procId === old.procId) {
      return Promise.resolve();
    }
    const prior = this.#migrations.get(session.instanceId);
    if (prior) {
      return prior;
    }
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one handoff transaction verifies old custody, target provenance and attachment stability
    const migrating = (async () => {
      const oldClient = this.#clientForGeneration(old);
      if (
        (
          await this.#activity(old).sessionState(
            oldClient,
            sessionId,
            session.directory
          )
        ).kind !== "decided" ||
        this.#activity(old).state(sessionId) !== "idle"
      ) {
        throw new Error("OpenCode turn remains in its incumbent generation.");
      }
      if (
        [...this.#children].some(
          ([id, child]) =>
            child.parent === session &&
            child.identity.procId === old.procId &&
            this.#activity(old).state(id) !== "idle"
        )
      ) {
        throw new Error(
          "OpenCode child turn remains in its incumbent generation."
        );
      }
      if (session.turnInFlight) {
        await this.#reconcile(session);
      }
      if (session.turnInFlight) {
        throw new Error(
          "OpenCode dispatch custody is still pending in the incumbent."
        );
      }
      const client = this.#clientForGeneration(target);
      const histories = await Promise.all(
        [oldClient, client].map((reader) =>
          reader.session.messages(
            { sessionID: sessionId, directory: session.directory, limit: 1 },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        )
      );
      if (histories.some((history) => history.error || !history.data)) {
        throw new Error(
          "OpenCode shared turn history is unreadable during handoff."
        );
      }
      const settled = histories.map((history) => {
        const info = history.data?.at(-1)?.info;
        return info
          ? JSON.stringify({
              id: info.id,
              role: info.role,
              created: info.time.created,
              ...(info.role === "assistant"
                ? {
                    completed: info.time.completed,
                    finish: info.finish,
                    error: Boolean(info.error),
                  }
                : {}),
            })
          : "empty";
      });
      if (settled[0] !== settled[1]) {
        throw new Error(
          "OpenCode candidate has not observed the incumbent's settled turn history."
        );
      }
      const config = await client.config.get(
        { directory: session.directory },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (
        config.error ||
        !config.data ||
        !containsJson(cawcoMcp(), config.data.mcp?.cawco)
      ) {
        throw new Error(
          "OpenCode idle migration config does not prove the correct CawCo hub."
        );
      }
      if (
        (
          await this.#activity(old).sessionState(
            oldClient,
            sessionId,
            session.directory
          )
        ).kind !== "decided" ||
        this.#activity(old).state(sessionId) !== "idle"
      ) {
        throw new Error("OpenCode incumbent resumed during idle migration.");
      }
      if (
        this.#sessions.get(session.instanceId) !== session ||
        this.#sessionOwners.get(session.instanceId)?.procId !== old.procId
      ) {
        throw new Error("OpenCode attachment changed during idle migration.");
      }
      if (slot.owner.active?.procId !== target.procId) {
        throw new Error(
          "OpenCode active generation changed during idle migration."
        );
      }
      this.#activity(old).unbind(sessionId, session.instanceId);
      for (const [id, child] of this.#children) {
        if (child.parent === session && child.identity.procId === old.procId) {
          this.#activity(old).unbind(id, session.instanceId);
        }
      }
      this.#sessionOwners.set(session.instanceId, target);
      this.#activity(target).bind(
        sessionId,
        session.instanceId,
        session.directory
      );
      session.rebindClient(client);
      console.info(
        `[opencode] handoff ${session.instanceId}: ${old.procId}/${old.pid} → ${target.procId}/${target.pid}`
      );
      await this.#ensurePump(session.directory, target);
      if (this.#sessions.get(session.instanceId) !== session) {
        throw new Error("OpenCode attachment ended during idle migration.");
      }
    })().finally(() => this.#migrations.delete(session.instanceId));
    this.#migrations.set(session.instanceId, migrating);
    return migrating;
  }

  async #prepareDispatch(session: OpencodeSession): Promise<void> {
    if (this.#applyGate) {
      await this.#applyGate.promise;
    }
    // The account's server stopped for being idle, or went down, since the
    // session last ran: it starts again, and the session goes to it.
    if (session.account !== undefined) {
      await this.#ensureAccount(session.account);
    }
    await this.#migrate(session);
    if (this.#sessions.get(session.instanceId) !== session) {
      throw new Error("OpenCode dispatch attachment has ended.");
    }
    const identity = this.#sessionOwners.get(session.instanceId);
    if (!(identity && session.sessionId)) {
      throw new Error("OpenCode dispatch has no generation custody.");
    }
    this.#activity(identity).observeBusy(session.sessionId, session.directory);
  }

  async #handoffIdle(): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set true by dispose(), a different method biome's per-method inference doesn't see
    if (this.#disposed) {
      return;
    }
    /** Bound elsewhere than its own server's active generation. */
    const away = (session: OpencodeSession): ServerIdentity | undefined => {
      const owner = this.#sessionOwners.get(session.instanceId);
      const target = this.#slotOf(session.account).owner.active;
      return owner && target && owner.procId !== target.procId
        ? owner
        : undefined;
    };
    const idle = [...this.#sessions.values()].filter((session) => {
      const owner = away(session);
      return (
        owner &&
        session.sessionId &&
        this.#activity(owner).state(session.sessionId) === "idle"
      );
    });
    await Promise.all(
      idle.map(async (session) => {
        try {
          await this.#migrate(session);
          session.configGateLifted();
        } catch (error) {
          console.warn(
            `[opencode] handoff ${session.instanceId} deferred: ${errorText(error)}`
          );
        }
      })
    );
    for (const slot of this.#slots()) {
      slot.owner.maintain();
    }
    if (
      [...this.#sessions.values()].some((session) => away(session)) &&
      !this.#handoffTimer
    ) {
      this.#handoffTimer = setTimeout(() => {
        this.#handoffTimer = null;
        this.#handoffIdle().catch(console.warn);
      }, 2000);
    }
  }

  #custodyReadiness: () => boolean = () => false;

  setCustodyReadiness(read: () => boolean): void {
    this.#custodyReadiness = read;
  }

  #operationsPending(): boolean {
    return (
      !this.#custodyReadiness() ||
      this.#applyGate !== null ||
      this.#pendingSpawns.length > 0 ||
      this.#opening > 0 ||
      this.#mutatingMcp > 0 ||
      this.#migrations.size > 0 ||
      this.#pendingRecoveries.size > 0 ||
      this.#recovering > 0 ||
      this.#recoveryWaiters.length > 0
    );
  }

  /**
   * What an agent restart would cut of this adapter's work: the operations it
   * runs against the server from this process (a config apply that replaces
   * the server, a session it is opening, an MCP change, a handoff between two
   * server generations), the starts queued behind a config apply, and the
   * sends it holds that the server has not been handed. The server's own
   * turns are not on it: the server runs under the keeper, and the next agent
   * reads them back.
   */
  restartHolds(): RestartHold[] {
    return [
      {
        reason: "opencode",
        ids: [
          ...(this.#applyGate || this.#checkingPublication
            ? ["config-apply"]
            : []),
          ...Array.from({ length: this.#opening }, (_, n) => `opening:${n}`),
          ...Array.from(
            { length: this.#mutatingMcp },
            (_, n) => `mcp-change:${n}`
          ),
          ...[...this.#migrations.keys()].map((id) => `handoff:${id}`),
          // A session being taken back is the supervisor's to name (a start
          // in flight), and a reconcile only reads the server back, which the
          // next agent does again: neither is named here.
        ],
      },
      {
        reason: "starting",
        ids: this.#pendingSpawns.map((pending) => pending.spec.instanceId),
      },
      {
        reason: "opencode-send",
        ids: [...this.#sessions.values()]
          .filter((session) => session.unhanded > 0)
          .map((session) => session.instanceId),
      },
    ];
  }

  /** No local turn maps participate in the server's idle decision. */
  // biome-ignore lint/suspicious/useAwait: the Harness contract returns a promise; activity reporting itself is deliberately synchronous
  async busyInstances(): Promise<string[]> {
    const identity = this.#serverOwner.active;
    const client = this.#client;
    const generations = this.#generations();
    if (!identity && generations.length === 0) {
      return [];
    }
    if (identity && !client) {
      return [
        ...this.#activity(identity).snapshot().instances,
        "opencode:activity-unknown",
      ];
    }
    const live = new Set(
      generations.map(
        (generation) =>
          `${generation.epoch}/${generation.procId}/${generation.startedAt}`
      )
    );
    for (const [key, retired] of this.#activities) {
      if (!live.has(key)) {
        retired.stop();
        this.#activities.delete(key);
      }
    }
    const snapshots = generations.map((generation) =>
      this.#activity(generation).report(this.#clientForGeneration(generation))
    );
    const operations = this.#operationsPending()
      ? ["opencode:pending-operations"]
      : [];
    return [
      ...new Set([
        ...snapshots.flatMap((snapshot) => snapshot.instances),
        ...operations,
      ]),
    ];
  }

  async #sessionBusy(
    sessionId: string,
    directory: string,
    identity: ServerIdentity | undefined
  ): Promise<boolean> {
    const client = identity ? this.#clientForGeneration(identity) : null;
    if (!(identity && client)) {
      return true;
    }
    const observed = await this.#activity(identity).sessionState(
      client,
      sessionId,
      directory
    );
    return observed.kind !== "decided" || observed.state !== "idle";
  }

  /** Two complete reads of this exact generation, with a real sampling gap. */
  async #generationIdle(identity: ServerIdentity): Promise<boolean> {
    if (this.#operationsPending()) {
      return false;
    }
    const activity = this.#activity(identity);
    const client = createOpencodeClient({
      baseUrl: identity.url,
      fetch: Object.assign(fetchOpencode, { preconnect: fetch.preconnect }),
    });
    const first = await activity.sample(client, true);
    if (!first.known || first.instances.length || this.#operationsPending()) {
      return false;
    }
    await Bun.sleep(2000);
    const second = await activity.sample(client, true);
    if (
      second.known &&
      second.instances.length === 0 &&
      this.#slotOfGeneration(identity)?.owner.active?.procId !== identity.procId
    ) {
      await this.#handoffIdle();
      if (
        [...this.#sessionOwners.values()].some(
          (owner) => owner.procId === identity.procId
        )
      ) {
        return false;
      }
    }
    return (
      second.known &&
      second.instances.length === 0 &&
      second.generation === first.generation &&
      second.sampledAt >= first.sampledAt + 2000 &&
      !this.#operationsPending()
    );
  }

  /**
   * Prepare and publish a verified candidate while incumbent turns keep running.
   * New turns use the active generation. Existing turns retain their client and
   * pump until idle handoff, and only then may the owner retire their generation.
   *
   * Global config (~/.config/opencode/opencode.json) is only read at
   * server startup — `instance.dispose()` re-reads project config but
   * NOT global. A full process restart is the only reliable path.
   *
   * Only one apply attempt runs at a time. New changes arriving mid-apply
   * remain as the next desired revision — the watcher will trigger another
   * attempt after the current one completes.
   */
  #noteDeferred(): void {
    const revision = `${this.#desiredHash}/${this.#desiredVersion}/${this.#serverOwner.active?.procId}`;
    if (this.#deferredRevision === revision) {
      return;
    }
    this.#deferredRevision = revision;
    console.info(
      JSON.stringify({
        type: "config-convergence",
        event: "deferred",
        generation: this.#serverOwner.active?.procId,
        detail: "incumbent has running turns or pending operations",
        at: Date.now(),
      })
    );
  }

  async #attemptConfigApply(): Promise<void> {
    if (
      this.#applyGate ||
      this.#checkingPublication ||
      Date.now() < this.#retryConfigAt
    ) {
      return;
    }
    if (!this.#client) {
      return;
    }
    if (
      this.#desiredHash === this.#appliedHash &&
      this.#desiredVersion === this.#appliedVersion
    ) {
      this.#configState = "applied";
      return;
    }
    if (fenced()) {
      // The agent is about to restart, and an apply cut half-way leaves two
      // servers to sort out: it waits, and the watcher tries a pending one again.
      this.#configState = "pending";
      return;
    }

    // A pending revision does not wait for the machine's turns to become idle.
    this.#checkingPublication = true;
    try {
      const preCheck = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
      if (!preCheck) {
        this.#configState = "error";
        this.#configError = "malformed config — will not stop working server";
        return;
      }
      const incumbent = this.#serverOwner.active;
      if (!incumbent) {
        this.#configState = "pending";
        this.#configError = null;
        this.#noteDeferred();
        return;
      }
      this.#deferredRevision = null;
    } finally {
      this.#checkingPublication = false;
    }

    let gateResolve!: () => void;
    const gatePromise = new Promise<void>((resolve) => {
      gateResolve = resolve;
    });
    this.#applyGate = { promise: gatePromise, resolve: gateResolve };

    try {
      if (
        this.#desiredHash === this.#appliedHash &&
        this.#desiredVersion === this.#appliedVersion
      ) {
        this.#configState = "applied";
        return;
      }
      const targetHash = this.#desiredHash;
      const targetVersion = this.#desiredVersion;

      this.#configState = "applying";
      console.log(
        JSON.stringify({
          type: "config-convergence",
          state: "applying",
          detail: `target ${targetHash?.slice(0, 8)}…, binary ${targetVersion}, restarting server`,
          at: Date.now(),
        })
      );

      // Re-read config: it may have changed during idle wait.
      const diskHash = await this.#hashConfig();
      if (targetHash && diskHash !== targetHash) {
        // Config changed during idle wait — coalesce to latest.
        this.#desiredHash = diskHash;
        this.#configState = "pending";
        return;
      }

      // Keep the incumbent and its event streams working until a verified
      // candidate is ready. The owner alone launches, publishes and retires.
      const config = await this.#launchConfig();
      await this.#serverOwner.replace(
        serverSpec(config),
        async (identity, signal) => {
          const candidate = createOpencodeClient({
            baseUrl: identity.url,
            fetch: Object.assign(fetchOpencode, {
              preconnect: fetch.preconnect,
            }),
          });
          await bootInstance(candidate);
          if (!(await this.#readsThisConfig(candidate))) {
            throw new Error("Candidate reads another global config root.");
          }
          await this.#verifyApply(
            candidate,
            identity,
            targetHash,
            targetVersion,
            signal
          );
        },
        (identity) => {
          const client = this.#adopt(this.#machine, identity);
          this.#ready = Promise.resolve(client);
          this.#verifiedProcId = identity.procId;
          this.#appliedHash = targetHash;
          this.#appliedVersion = targetVersion;
          this.#configError = null;
          // The incumbent's clients and pumps remain owned until its turns end.
          // biome-ignore lint/complexity/noVoid: publication does not wait for busy incumbent sessions to migrate
          void this.#handoffIdle().catch(console.warn);
        }
      );

      if (
        this.#desiredHash === targetHash &&
        this.#desiredVersion === targetVersion
      ) {
        this.#configState = "applied";
        console.log(
          JSON.stringify({
            type: "config-convergence",
            state: "applied",
            detail: `revision ${targetHash?.slice(0, 8)}… applied via process restart`,
            at: Date.now(),
          })
        );
      } else {
        this.#configState = "pending";
        console.log(
          JSON.stringify({
            type: "config-convergence",
            state: "pending",
            detail: `desired changed during restart (${this.#desiredHash?.slice(0, 8)}… vs applied ${targetHash?.slice(0, 8)}…)`,
            at: Date.now(),
          })
        );
      }
    } catch (error) {
      this.#configState = "error";
      this.#configError = String(error);
      this.#retryConfigAt = Date.now() + 5000;
      console.error(
        `[opencode] config convergence: apply failed: ${String(error)}`
      );
      console.log(
        JSON.stringify({
          type: "config-convergence",
          state: "error",
          detail: `${String(error)}; incumbent retained, retry in 5s`,
          at: Date.now(),
        })
      );
    } finally {
      this.#applyGate = null;
      gateResolve();
      for (const session of this.#sessions.values()) {
        session.configGateLifted();
      }
      this.#drainPendingSpawns();
    }
  }

  /**
   * Drain queued spawn requests that accumulated while the config gate was held.
   */
  #drainPendingSpawns(): void {
    const pending = this.#pendingSpawns.splice(0);
    for (const { resolve, reject, spec, ctx } of pending) {
      this.spawn(spec, ctx).then(resolve, reject);
    }
  }

  /**
   * Verify the running server's config matches the desired global config.
   *
   * After a process restart, the new server reads global config at startup.
   * This method confirms that the runtime config.get() reflects the desired
   * controlled fields and fleet-managed MCP definitions. Connection status is
   * reported separately and never changes whether configuration was applied.
   *
   * Does NOT check per-directory project configs — project overlays are the
   * user's business. Only verifies controlled fields from global config.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: disk provenance + runtime leaf + MCP status verification; each layer independent with own logging
  async #verifyApply(
    client: OpencodeClient,
    identity: ServerIdentity,
    targetHash: string | null,
    targetVersion: string | null,
    signal?: AbortSignal,
    // The flags it runs under are read nowhere else: a generation started
    // without them (an older agent's, without code mode; an account's on a
    // credential it no longer holds) is restarted.
    launch: string = launchOf(serverSpec({}))
  ): Promise<void> {
    if (identity.launch !== launch) {
      throw new Error(
        `launch verification failed: started with ${identity.launch ?? "unknown flags"}, launching with ${launch}`
      );
    }
    const health = await reached(
      client.global.health({
        signal: signal ?? AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
      })
    );
    const runningVersion = health.data?.version;
    if (!targetVersion || runningVersion !== targetVersion) {
      throw new Error(
        `binary verification failed: running ${runningVersion ?? "unknown"}, installed ${targetVersion ?? "unknown"}`
      );
    }
    // ---- 1. Disk provenance (concurrent-edit detection) --------------------
    const diskHash = await this.#hashConfig();
    if (targetHash && diskHash !== targetHash) {
      throw new Error(
        `config verification failed: disk hash ${diskHash?.slice(0, 8) ?? "null"}… differs from target ${targetHash.slice(0, 8)}… — concurrent modification`
      );
    }

    // ---- 2. Runtime leaf comparison ----------------------------------------
    const desiredRaw = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
    const liveResult = await client.config.get(
      {},
      { signal: signal ?? AbortSignal.timeout(10_000) }
    );
    if (!liveResult.data) {
      throw new Error(
        "config verification failed: config.get() returned no data"
      );
    }
    const liveConfig = liveResult.data as Record<string, unknown>;
    const fieldProblems: string[] = [];
    // The launch-time half: the policy the server was started with, and the
    // bridge plugin this agent wrote. A server launched by an older agent
    // under another policy or bridge fails here, not only one whose file
    // config drifted.
    if (!containsJson(STATIC_POLICY.permission, liveConfig.permission)) {
      fieldProblems.push("permission");
    }
    if (!containsJson(STATIC_POLICY.tools, liveConfig.tools)) {
      fieldProblems.push("tools");
    }
    if (
      this.#bridgePlugin &&
      !containsJson([`file://${this.#bridgePlugin}`], liveConfig.plugin)
    ) {
      fieldProblems.push("bridge plugin");
    }
    if (desiredRaw) {
      for (const field of CONTROLLED_CONFIG_FIELDS) {
        const desired = desiredRaw[field];
        if (desired === undefined) {
          continue;
        }
        const resolved =
          field === "agent"
            ? (liveConfig.agent ?? liveConfig.mode)
            : liveConfig[field];
        if (!containsJson(desired, resolved)) {
          fieldProblems.push(field);
        }
      }
    }
    console.log(
      JSON.stringify({
        type: "config-convergence",
        event: "runtime-verify",
        fields: CONTROLLED_CONFIG_FIELDS,
        mismatched: fieldProblems,
        at: Date.now(),
      })
    );
    if (fieldProblems.length > 0) {
      throw new Error(
        `config verification failed: runtime config diverges on: ${fieldProblems.join(", ")}`
      );
    }

    // Connection health belongs to fleetStatus, not configuration convergence.
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const managed = new Set(["cawco", ...(sidecar.mcp ?? [])]);
    const desiredMcp = desiredRaw?.mcp as Record<string, unknown> | undefined;
    const liveMcp = liveConfig.mcp as Record<string, unknown> | undefined;
    const mismatched = managedMcpMismatches(managed, desiredMcp, liveMcp);
    console.log(
      JSON.stringify({
        type: "config-convergence",
        event: "mcp-config",
        managed: [...managed],
        mismatched,
        at: Date.now(),
      })
    );
    if (mismatched.length > 0) {
      throw new Error(
        `config verification failed: managed MCP definitions diverge on: ${mismatched.join(", ")}`
      );
    }
  }

  async detect(): Promise<HarnessReport> {
    const installed = resolveBin("opencode") !== undefined;
    let version: string | undefined;
    if (installed) {
      const ran = await Bun.$`opencode --version`.quiet().nothrow();
      const said = ran.stdout.toString().trim();
      if (ran.exitCode === 0 && said) {
        version = said;
      }
    }
    // The catalog the machine reports, so a picker lists opencode's models
    // with no opencode session running. A server that cannot answer leaves
    // the report without one, as claude's does when its probe fails.
    const models = installed
      ? await this.#ensure()
          .then(() => this.#catalog())
          .catch((error: unknown) => {
            console.warn(`[opencode] model catalog unavailable: ${error}`);
          })
      : undefined;
    return {
      harness: "opencode",
      installed,
      ...(version ? { version } : {}),
      auth: installed ? "authenticated" : "unauthenticated",
      capabilities: OPENCODE_CAPABILITIES,
      ...(models ? { models } : {}),
    };
  }

  /**
   * The machine's one sessiond connection for this harness, dialled lazily.
   * A dropped socket is re-dialled and the SERVER is untouched by that — the
   * property the whole leaf exists for.
   */
  async sessiond(
    // `CAWCO_SESSIOND_ENDPOINT` is sessiond's own override
    // (`sessiond/src/main.ts`), honoured here too so a dev run — or a test —
    // points both halves at a scratch socket instead of the real one.
    endpoint: string = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
  ): Promise<SessiondClient> {
    const existing = await this.#sessiond?.catch(() => undefined);
    if (existing && !existing.retired) {
      return existing;
    }
    this.#sessiond = (async () => {
      await ensureSessiond(endpoint);
      return SessiondClient.connect(endpoint);
    })();
    return this.#sessiond;
  }

  /**
   * Makes `identity`, the slot's active generation, the server its sessions
   * talk to: one client for it, cached on the slot. Live predecessor sessions
   * keep their own clients; only handles of the slot whose generation has
   * disappeared are rebound for crash recovery. Every
   * request the SDK makes goes through the client's fetch, the event
   * subscriptions included.
   *
   * A connection failure there means the server this client was built for is
   * gone — crashed, OOM-killed, or stopped out from under sessiond — and
   * nothing else ever notices: `#ensure()` returns `#client` straight from
   * cache, so every later call kept re-throwing the same dead connection
   * forever (the live symptom: `listSessions on opencode failed: TypeError:
   * Unable to connect`, repeating with no recovery). This fetch is the one
   * place that sees the raw failure, so it is the one place that clears the
   * cache — the NEXT call then goes through `attachOpencodeServer` again,
   * which finds the proc dead via sessiond and respawns it. An abort this
   * process asked for (a request's own timeout, a subscription it ended) is
   * not the server going away, and leaves the client as it is.
   */
  #adopt(slot: ServerSlot, identity: ServerIdentity): OpencodeClient {
    const dropWhenGone = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      try {
        return await fetchOpencode(input, init);
      } catch (error) {
        const signal = input instanceof Request ? input.signal : init?.signal;
        if (!signal?.aborted && slot.client === client) {
          slot.client = null;
          slot.ready = null;
        }
        throw error;
      }
    };
    const client = createOpencodeClient({
      baseUrl: identity.url,
      fetch: Object.assign(dropWhenGone, { preconnect: fetch.preconnect }),
    });
    slot.client = client;
    this.#generationClients.set(identity.procId, client);
    const generations = this.#generations();
    for (const session of this.#sessions.values()) {
      if (this.#slotOf(session.account) !== slot) {
        continue;
      }
      const old = this.#sessionOwners.get(session.instanceId);
      if (
        old &&
        generations.some((generation) => generation.procId === old.procId)
      ) {
        continue;
      }
      session.rebindClient(client);
      if (session.sessionId) {
        this.#sessionOwners.set(session.instanceId, identity);
        this.#activity(identity).bind(
          session.sessionId,
          session.instanceId,
          session.directory
        );
        this.#ensurePump(session.directory, identity).catch(console.warn);
      }
    }
    return client;
  }

  #ensure(): Promise<OpencodeClient> {
    if (this.#client) {
      return Promise.resolve(this.#client);
    }
    if (!this.#ready) {
      // A spawn after a dispose is a revival, not a leak: the adapter is a
      // module singleton, the server it attaches to outlived the teardown, and
      // the pumps must be allowed to re-subscribe. Cleared here rather than in
      // `dispose` so an in-flight teardown still stops its own pumps.
      this.#disposed = false;
      this.#ready = (async () => {
        await this.installDelegationTools();
        // Ask on everything the dashboard can surface. Questions default to
        // allow and are answered through the session's `question.asked` round
        // trip, so no permission key is set for them here. `webfetch` is the
        // exception: fleet policy is the firecrawl MCP, and a `deny` publishes
        // no permission event at all, so it never reaches {@link autoAllows}.
        // Fleet policy: search is the Exa MCP. `webfetch: 'deny'` above
        // removes the fetch built-in; `websearch` has no permission key,
        // so the tool itself is switched off.
        const config = await this.#launchConfig();
        // Not `createOpencode`: that spawns the server as THIS process's child,
        // so every agent restart took the machine's opencode sessions with it.
        // The server goes under sessiond instead and we attach as a client —
        // the same client the bundled pair would have handed us.
        // The owner chooses the ephemeral port and captures the process identity.
        const identity = await this.#serverOwner.ensure(serverSpec(config));
        const client = this.#adopt(this.#machine, identity);
        await bootInstance(client);
        await this.#loadRecorded();

        // Convergence keeps the server matching the machine's global config;
        // that is the machine agent's to do. Another agent's server runs on
        // the config it was launched with and is not reconciled with a file
        // it must not write. And only a server that reads the config this
        // agent writes is its to restart: an agent under another config root
        // shares the machine's sessiond, and so the machine's server.
        if (
          this.#verifiedProcId !== identity.procId &&
          (await isMachineAgent()) &&
          (await this.#readsThisConfig(client))
        ) {
          // The baseline is whatever the running server verifiably loaded.
          // A server this agent just spawned and one it adopted from an
          // earlier agent are checked the same way: the adopted one keeps
          // its sessions running when it already matches, and is restarted
          // by the watcher only when it does not.
          const origin = `active generation ${identity.procId}/${identity.pid}`;
          const initialHash = await this.#hashConfig();
          const initialVersion = await this.#installedVersion();
          this.#desiredHash = initialHash;
          this.#desiredVersion = initialVersion;
          this.#appliedHash = null;
          this.#appliedVersion = null;
          this.#configState = "pending";
          if (initialHash) {
            try {
              // No directory is initialized yet; this verifies the global
              // resolved config (no directory query).
              await this.#verifyApply(
                client,
                identity,
                initialHash,
                initialVersion
              );
              this.#appliedHash = initialHash;
              this.#appliedVersion = initialVersion;
              this.#verifiedProcId = identity.procId;
              this.#configState = "applied";
              console.log(
                JSON.stringify({
                  type: "config-convergence",
                  state: "applied",
                  detail: `${origin}, verified baseline ${initialHash.slice(0, 8)}…`,
                  at: Date.now(),
                })
              );
            } catch (error) {
              console.log(
                JSON.stringify({
                  type: "config-convergence",
                  state: "pending",
                  detail: `${origin} failed verification, convergence scheduled: ${String(error)}`,
                  at: Date.now(),
                })
              );
            }
          }
          this.#converging = true;
          this.#startConfigWatcher();
        }

        return client;
      })().catch((error) => {
        this.#ready = null;
        throw error;
      });
    }
    return this.#ready;
  }

  /**
   * The account's own OpenCode server: the one running, or one started now.
   * The machine's is up first, which writes the config and bridge plugin
   * every server on the machine reads. A server an earlier agent left, on
   * another credential than the account holds now, is replaced before any
   * session runs in it; one on another config or binary is the watcher's to
   * replace at rest ({@link #convergeAccounts}).
   */
  #ensureAccount(account: string): Promise<OpencodeClient> {
    const slot = this.#accountSlot(account);
    if (slot.client) {
      return Promise.resolve(slot.client);
    }
    slot.ready ??= (async () => {
      slot.starting = true;
      await this.#ensure();
      const { revision, spec } = await this.#accountRevision(account);
      await prepareAccountServer(account);
      const identity = await slot.owner.ensure(spec);
      if (identity.launch === launchOf(spec)) {
        const adopted = this.#adopt(slot, identity);
        await bootInstance(adopted);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method biome's per-method inference doesn't see
        if (this.#converging) {
          try {
            await this.#verifyApply(
              adopted,
              identity,
              this.#desiredHash,
              this.#desiredVersion,
              undefined,
              launchOf(spec)
            );
            slot.applied = revision;
          } catch (error) {
            console.info(
              `[opencode] account ${account}: its server is on another config; the watcher replaces it at rest (${errorText(error)})`
            );
          }
        }
      } else {
        await this.#replaceAccount(slot, spec, revision);
      }
      const { client } = slot;
      if (!client) {
        throw new Error(`Account ${account}'s OpenCode server went away.`);
      }
      console.info(
        `[opencode] account ${account}: its server is ${slot.owner.active?.procId}/${slot.owner.active?.pid}`
      );
      // biome-ignore lint/complexity/noVoid: the catalog read rides on the start; nothing waits on it
      void this.#readAccountCatalogSoon(account, client);
      return client;
    })()
      .catch((error: unknown) => {
        slot.ready = null;
        throw error;
      })
      .finally(() => {
        slot.starting = false;
      });
    return slot.ready;
  }

  /** {@link #readAccountCatalog} as a start of the account's server makes it: a failure is said, and the next start reads again. */
  async #readAccountCatalogSoon(
    account: string,
    client: OpencodeClient
  ): Promise<void> {
    try {
      await this.#readAccountCatalog(account, client);
    } catch (error) {
      console.warn(
        `[opencode] account ${account}: its models were not read: ${errorText(error)}`
      );
    }
  }

  #loadAccountCatalogs(): Record<string, ModelInfo[]> {
    this.#accountCatalogs ??= existsSync(ACCOUNT_CATALOGS)
      ? (JSON.parse(readFileSync(ACCOUNT_CATALOGS, "utf8")) as Record<
          string,
          ModelInfo[]
        >)
      : {};
    return this.#accountCatalogs;
  }

  /**
   * The models the account's provider offers it, as its own server lists them
   * (OpenCode's own sign-in code shapes the list: ChatGPT's models for a
   * ChatGPT sign-in, Copilot's from Copilot), kept for the provider. Read
   * from `/config/providers`, the providers the server is signed in to
   * (v1.18.34 server/routes/instance/httpapi/handlers/config.ts 24-28), not
   * `/provider`, which serializes the whole models.dev catalog beside them
   * (handlers/provider.ts 42-60): 393 → 544 MiB on a server with no session
   * yet, for one provider's list (REPORT.md §8).
   */
  async #readAccountCatalog(
    account: string,
    client: OpencodeClient
  ): Promise<ModelInfo[]> {
    const held = readHeld(account);
    if (!held) {
      return [];
    }
    const provider = opencodeProviderOf(held.provider);
    const listed = await client.config.providers();
    if (listed.error || !listed.data) {
      throw new Error(errorText(listed.error));
    }
    const models = modelCatalog(
      listed.data.providers.filter((one) => one.id === provider)
    );
    const catalogs = { ...this.#loadAccountCatalogs(), [provider]: models };
    this.#accountCatalogs = catalogs;
    await writeJson(ACCOUNT_CATALOGS, catalogs);
    return models;
  }

  /**
   * Every model this machine's OpenCode runs: the machine's own server's, for
   * the providers it is signed in to, and for each provider an account here
   * is of, that provider's as an account's own server lists them. A provider
   * none of whose servers has listed them yet has one of its accounts'
   * servers started for it, which then retires when idle.
   */
  async #catalog(): Promise<ModelInfo[]> {
    const own = await opencodeCatalog(await this.#ensure());
    const accounts = new Map<string, string>();
    for (const account of credentialAccountIds()) {
      const held = readHeld(account);
      const provider = held ? opencodeProviderOf(held.provider) : undefined;
      if (provider && !accounts.has(provider)) {
        accounts.set(provider, account);
      }
    }
    const cached = this.#loadAccountCatalogs();
    const listed = await Promise.all(
      [...accounts].map(async ([provider, account]) => {
        const known = cached[provider];
        if (known) {
          return known;
        }
        try {
          return await this.#readAccountCatalog(
            account,
            await this.#ensureAccount(account)
          );
        } catch (error) {
          console.warn(
            `[opencode] ${provider}'s models are not listed: account ${account}'s server did not answer (${errorText(error)})`
          );
          return [];
        }
      })
    );
    const provided = (row: ModelInfo): string =>
      row.value.slice(0, row.value.indexOf("/"));
    const models = [
      ...own.filter(
        (row) => row.value === "default" || !accounts.has(provided(row))
      ),
      ...listed.flat(),
    ];
    return models.filter(
      (row) =>
        row.value !== "default" ||
        models.some((model) => model.value === row.resolvedModel)
    );
  }

  /**
   * Connects opencode to this agent's hub: the MCP server and the
   * identity-only bridge plugin. The machine's own agent writes them into
   * opencode's global config, where every opencode on the machine finds them.
   * Any other agent (a worktree's, against a test hub) must not: it hands them
   * to its own server alone, through the config it launches that server with,
   * and keeps the plugin in a cawco-owned directory named for its hub.
   */
  /**
   * The hub restarted: OpenCode's `cawco` MCP client gave its GET stream up
   * after two retries (its StreamableHTTPClientTransport takes the MCP SDK's
   * default `maxRetries: 2`), so it would never hear `tools/list_changed`
   * again. Its server's own route makes it again, per directory
   * (`POST /mcp/{name}/connect?directory=`, MCP.connect → createAndStore: a
   * new client, initialized and listed, with a new stream), for every
   * directory a live session of this agent runs in, on the server it runs in.
   */
  async hubRestarted(): Promise<void> {
    const places = new Map<
      string,
      { client: OpencodeClient; directory: string }
    >();
    for (const session of this.#sessions.values()) {
      const owner = this.#sessionOwners.get(session.instanceId);
      if (owner) {
        places.set(`${owner.procId}\n${session.directory}`, {
          client: this.#clientForGeneration(owner),
          directory: session.directory,
        });
      }
    }
    await Promise.all(
      [...places.values()].map(async ({ client, directory }) => {
        const connected = await reached(
          client.mcp.connect(
            { name: "cawco", directory },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        ).catch((error: unknown) => ({ error }));
        console.info(
          connected.error
            ? `[opencode] ${directory}: cawco MCP reconnect failed: ${errorText(connected.error)}`
            : `[opencode] ${directory}: cawco MCP reconnected after a hub restart`
        );
      })
    );
  }

  /** Every provider OpenCode's models list names (configured ones included), by id and name. */
  async providerList(): Promise<{ id: string; name: string }[]> {
    if (resolveBin("opencode") === undefined) {
      return [];
    }
    const listed = await (await this.#ensure()).provider.list({});
    if (listed.error) {
      throw new Error(errorText(listed.error));
    }
    const data = listed.data as unknown as {
      all?: { id: string; name?: string }[];
    };
    return (data.all ?? []).map((one) => ({
      id: one.id,
      name: one.name ?? one.id,
    }));
  }

  /**
   * The accounts on this machine changed (one signed in, keyed, moved in or
   * forgotten). Each account's store was written with its credential, which
   * a sign-in OpenCode reads on every request takes at once; an account's
   * server that read a key or a sign-in only when it started is replaced at
   * rest, and one whose account is gone retires once idle (the watcher's
   * tick, run now). A provider whose models no account's server has listed
   * yet has them listed.
   */
  async accountsChanged(): Promise<void> {
    if (!this.#client) {
      return;
    }
    await this.#configTick();
    await this.#catalog();
  }

  async installDelegationTools(): Promise<void> {
    const source = buildHandoffPluginSource();
    if (await isMachineAgent()) {
      await retireLegacyHandoffPlugin();
      await Bun.$`mkdir -p ${OPENCODE_PLUGINS}`.quiet();
      const config =
        (await readJson<Record<string, unknown>>(OPENCODE_CONFIG)) ?? {};
      await writeOpencodeConfig("delegation tools", {
        ...config,
        mcp: {
          ...(config.mcp as Record<string, unknown> | undefined),
          cawco: cawcoMcp(),
        },
      });
      this.#bridgePlugin = await writeHandoffPlugin(source);
      this.#serverConfig = STATIC_POLICY;
      return;
    }
    const own = join(
      homedir(),
      ".cawco",
      "hub-opencode",
      new URL(delegationHubUrl()).host.replaceAll(":", "_")
    );
    await Bun.$`mkdir -p ${join(own, "plugins")}`.quiet();
    const plugin = await writeHandoffPlugin(source, own);
    this.#bridgePlugin = plugin;
    this.#serverConfig = {
      ...STATIC_POLICY,
      mcp: { cawco: cawcoMcp() },
      plugin: [`file://${plugin}`],
    };
  }

  /**
   * What this agent's opencode server launches with: the fleet's static
   * policy, plus — for an agent that is not the machine's — its own hub.
   */
  #serverConfig: Record<string, unknown> = STATIC_POLICY;

  /** Runtime precedence makes fleet-owned definitions win over user JSONC overlays. */
  async #launchConfig(): Promise<Record<string, unknown>> {
    if (!(await isMachineAgent())) {
      return this.#serverConfig;
    }
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const managed = new Set(["cawco", ...(sidecar.mcp ?? [])]);
    const disk = await readJson<{ mcp?: Record<string, unknown> }>(
      OPENCODE_CONFIG
    );
    return {
      ...this.#serverConfig,
      mcp: Object.fromEntries(
        Object.entries(disk?.mcp ?? {}).filter(([name]) => managed.has(name))
      ),
    };
  }

  /** The bridge plugin file this agent wrote; a server that loaded another is stale. */
  #bridgePlugin: string | undefined;

  /** Starts the directory-scoped subscription for a directory, once per unique cwd. */
  #ensurePump(directory: string, identity: ServerIdentity): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set true by dispose(), a different method biome's per-method inference doesn't see
    if (this.#disposed) {
      return Promise.reject(new Error("OpenCode adapter disposed"));
    }
    const key = this.#pumpKey(directory, identity);
    if (!this.#pumps.has(key)) {
      const owner = new AbortController();
      this.#pumps.set(key, owner);
      // biome-ignore lint/complexity/noVoid: the pump owns reconnection; callers await only readiness
      void this.#pumpDirectory(directory, identity, owner.signal).catch(
        console.warn
      );
    }
    // biome-ignore lint/style/noNonNullAssertion: pumpDirectory installs readiness before its first await
    return this.#pumpReady.get(key)!;
  }

  /**
   * A DIRECTORY NO ATTACHED SESSION IS IN HOLDS NOTHING. Its subscription
   * ends and its instance is disposed, which is what stops the MCP servers
   * opencode started for the directory and whatever those launched. The
   * subscription used to stay up until the agent exited, and the instance
   * with it: one MCP server set per directory any opencode session had ever
   * run in, for as long as the server lived.
   *
   * Measured on opencode 1.18.34: `instance.dispose` ended a stdio MCP server
   * and its detached child within three seconds, and a `session.status` for
   * the directory afterwards (what the activity sampler sends) started
   * neither again; the first request that uses MCP there does. So a session
   * woken in the directory finds what it had, and nothing else brings it back.
   *
   * Deferred, and tried again, while the adapter is opening, migrating or
   * recovering anything, and while the server reports any session of the
   * directory busy or cannot say: a turn nobody here is attached to may be
   * running in it.
   */
  #releaseDirectory(directory: string, identity: ServerIdentity): void {
    this.#disposeUnused(directory, identity, "directory release")
      .then((settled) => {
        if (!settled) {
          setTimeout(
            () => this.#releaseDirectory(directory, identity),
            DIRECTORY_RELEASE_RETRY_MS
          ).unref();
        }
      })
      .catch((error: unknown) =>
        console.warn(
          `[opencode] ${directory}: releasing its instance failed: ${errorText(error)}`
        )
      );
  }

  /** Whether the directory is settled: disposed, or in use again and not this call's to dispose. */
  async #disposeUnused(
    directory: string,
    identity: ServerIdentity,
    caller: string
  ): Promise<boolean> {
    const used = (): boolean =>
      // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set true by dispose(), a different method biome's per-method inference doesn't see
      this.#disposed ||
      !this.#generations().some(
        (generation) => generation.procId === identity.procId
      ) ||
      [...this.#sessions.values()].some(
        (session) =>
          session.directory === directory &&
          this.#sessionOwners.get(session.instanceId)?.procId ===
            identity.procId
      );
    if (used()) {
      return true;
    }
    if (this.#operationsPending()) {
      return false;
    }
    const client = this.#clientForGeneration(identity);
    const status = await client.session.status(
      { directory },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (used()) {
      return true;
    }
    if (
      status.error ||
      !status.data ||
      this.#operationsPending() ||
      Object.values(status.data).some((state) => state.type !== "idle")
    ) {
      return false;
    }
    const key = this.#pumpKey(directory, identity);
    this.#pumps.get(key)?.abort();
    this.#pumps.delete(key);
    this.#pumpReady.delete(key);
    this.#pumpConnected.delete(key);
    const disposed = await client.instance.dispose(
      { directory },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (disposed.error) {
      throw new Error(errorText(disposed.error));
    }
    console.info(
      `[opencode] ${directory}: instance disposed by ${caller}, nothing attached and no turn running`
    );
    return true;
  }

  /** Ends every directory's subscription loop; none reconnects. */
  #stopPumps(): void {
    for (const owner of this.#pumps.values()) {
      owner.abort();
    }
    this.#pumps.clear();
    this.#pumpReady.clear();
    this.#pumpConnected.clear();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes every subscribed event to its owning session or child; not refactored in this pass
  async #pumpDirectory(
    directory: string,
    identity: ServerIdentity,
    stopped: AbortSignal
  ): Promise<void> {
    const key = this.#pumpKey(directory, identity);
    let delay = 1000;
    while (!stopped.aborted) {
      const slot = this.#slotOfGeneration(identity);
      if (!slot) {
        break;
      }
      const ready = Promise.withResolvers<void>();
      this.#pumpReady.set(key, ready.promise);
      // biome-ignore lint/complexity/noVoid: a reconnect need not have a caller waiting for readiness
      void ready.promise.catch(() => undefined);
      // One connection: its deadline drops it for a reconnect, the owner's
      // stop ends the loop.
      const connection = new AbortController();
      const deadline = setTimeout(
        () => connection.abort(),
        RECOVERY_TIMEOUT_MS
      );
      let connected = false;
      try {
        // Every stream remains on its captured generation through publication.
        // Only the active generation's connection may ask ensure to recover.
        let client = this.#clientForGeneration(identity);
        if (identity.procId === slot.owner.active?.procId && !slot.client) {
          // biome-ignore lint/performance/noAwaitInLoops: recover a dropped active connection before reconnecting its stream
          client = await (slot.account === undefined
            ? this.#ensure()
            : this.#ensureAccount(slot.account));
        }
        const { stream } = await client.event.subscribe(
          { directory },
          {
            signal: AbortSignal.any([stopped, connection.signal]),
            sseMaxRetryAttempts: 1,
          }
        );
        for await (const event of stream) {
          // A stopped loop routes nothing more, even what was already read.
          if (stopped.aborted) {
            break;
          }
          if (!connected) {
            connected = true;
            clearTimeout(deadline);
            console.info(`[opencode] ${directory}: subscribe ready`);
            ready.resolve();
            // Every session already attached here gets its snapshot now; one
            // that attaches while this holds takes its own (see `attached`).
            this.#pumpConnected.add(key);
            for (const session of this.#sessions.values()) {
              if (
                session.directory === directory &&
                this.#sessionOwners.get(session.instanceId)?.procId ===
                  identity.procId
              ) {
                // biome-ignore lint/complexity/noVoid: snapshots must not block consumption of live gate events
                void this.#reconcile(session);
              }
            }
          }
          delay = 1000;
          if (event.type === "session.created") {
            this.#routeChildCreated(event, identity);
            continue;
          }
          const sid = this.#eventSession(event);
          if (
            sid &&
            identity &&
            (event.type === "session.idle" ||
              (event.type === "session.status" &&
                event.properties.status.type === "idle"))
          ) {
            this.#activity(identity).observeIdle(sid, directory);
          }
          if (
            sid &&
            identity &&
            (event.type === "message.updated" ||
              event.type === "message.part.updated" ||
              (event.type === "session.status" &&
                event.properties.status.type !== "idle"))
          ) {
            if (event.type === "session.status") {
              this.#activity(identity).observeBusy(sid, directory);
            } else {
              this.#activity(identity).observeProgress(sid, directory);
            }
          }
          const session = sid ? this.#sessionForSid(sid, identity) : undefined;
          if (session) {
            session.handle(event);
            if (event.type === "session.idle") {
              this.#handoffIdle().catch(console.warn);
            }
          } else if (sid) {
            const child = this.#children.get(sid);
            if (child && child.identity.procId === identity.procId) {
              child.parent.handleChild(event, child.callID);
            }
          }
        }
      } catch {
        // The stream ended or dropped; reconnect below unless stopped.
      } finally {
        // A stopped loop's flag was cleared with it, and the directory may
        // already be a newer loop's.
        if (connected && !stopped.aborted) {
          this.#pumpConnected.delete(key);
        }
        clearTimeout(deadline);
        connection.abort();
        ready.reject(
          new Error(`OpenCode subscription unavailable: ${directory}`)
        );
      }
      if (stopped.aborted) {
        break;
      }
      await Bun.sleep(delay);
      delay = Math.min(delay * 2, 30_000);
    }
    this.#pumps.delete(key);
    this.#pumpReady.delete(key);
    this.#pumpConnected.delete(key);
  }

  /** A child session was created; hand its info to the named parent for binding. */
  #routeChildCreated(event: Event, identity: ServerIdentity): void {
    const props = event.properties as unknown as {
      sessionID?: string;
      info?: { id?: string; parentID?: string; agent?: string; title?: string };
    };
    const childId = props.info?.id ?? props.sessionID;
    const parentId = props.info?.parentID;
    if (!(childId && parentId)) {
      return;
    }
    const parent = this.#sessionForSid(parentId, identity);
    if (parent) {
      parent.handleChildCreated(childId, props.info?.agent, props.info?.title);
    }
  }

  #eventSession(event: Event): string | undefined {
    const p = event.properties as Record<string, unknown> & {
      sessionID?: string;
      info?: { sessionID?: string };
      part?: { sessionID?: string };
    };
    return p.sessionID ?? p.info?.sessionID ?? p.part?.sessionID;
  }

  /**
   * Resolves opencode's own session id, off an event, back to one of ours.
   * `#sessions` is keyed by instanceId now, so this is the lookup that used to
   * be free with a `sessionId`-keyed map. When more than one of our sessions
   * shares that opencode id (the resume collision the rekey exists for), the
   * most recently spawned one wins — Map iteration is insertion order, so the
   * last match is the newest — on the theory that a live event is more likely
   * meant for whichever instance most recently took that session over.
   */
  #sessionForSid(
    sid: string,
    identity: ServerIdentity
  ): OpencodeSession | undefined {
    let found: OpencodeSession | undefined;
    for (const session of this.#sessions.values()) {
      if (
        session.sessionId === sid &&
        this.#sessionOwners.get(session.instanceId)?.procId === identity.procId
      ) {
        found = session;
      }
    }
    return found;
  }

  async #withRecovery<T>(work: () => Promise<T>): Promise<T> {
    // Transfer a released slot directly to its waiter, so newcomers cannot
    // race a woken recovery into a fifth concurrent operation.
    if (this.#recovering === 4) {
      await new Promise<void>((resolve) => this.#recoveryWaiters.push(resolve));
    } else {
      this.#recovering += 1;
    }
    if (this.#recovering > this.#recoveryHighWater) {
      this.#recoveryHighWater = this.#recovering;
      console.info(
        `[opencode] recovery concurrency high-water ${this.#recoveryHighWater}`
      );
    }
    try {
      return await work();
    } finally {
      const next = this.#recoveryWaiters.shift();
      if (next) {
        next();
      } else {
        this.#recovering -= 1;
      }
    }
  }

  #reconcile(session: OpencodeSession): Promise<void> {
    const existing = this.#reconcileJobs.get(session);
    if (existing) {
      this.#reconcileAgain.add(session);
      return existing;
    }
    const job = this.#withRecovery(async () => {
      if (this.#sessions.get(session.instanceId) !== session) {
        return;
      }
      await Promise.all([session.watchResumedTurn(), session.reconcileGates()]);
    }).finally(() => {
      this.#reconcileJobs.delete(session);
      if (
        this.#reconcileAgain.delete(session) &&
        this.#sessions.get(session.instanceId) === session
      ) {
        // biome-ignore lint/complexity/noVoid: a reconnect during a snapshot needs a fresh snapshot after it
        void this.#reconcile(session);
      }
    });
    this.#reconcileJobs.set(session, job);
    return job;
  }

  async abortSession(sessionKey: string, dir: string): Promise<boolean> {
    // Never start a server to discard a turn that might already be gone: the
    // turn runs in whichever server here is running it, an account's or the
    // machine's.
    const readings = await Promise.all(
      (await this.#liveGenerations()).map(async (identity) => {
        const client = this.#clientForGeneration(identity);
        const status = await client.session.status(
          { directory: dir },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        );
        if (status.error || !status.data) {
          throw new Error(`Could not read OpenCode session status in ${dir}`);
        }
        return { client, state: status.data[sessionKey]?.type };
      })
    );
    const client = readings.find(
      ({ state }) => state === "busy" || state === "retry"
    )?.client;
    if (!client) {
      return false;
    }
    const aborted = await client.session.abort(
      { sessionID: sessionKey, directory: dir },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (aborted.error || aborted.data !== true) {
      throw new Error(`Could not abort OpenCode session ${sessionKey}`);
    }
    const after = await client.session.status(
      { directory: dir },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (after.error || !after.data) {
      throw new Error(
        `Could not verify OpenCode session ${sessionKey} stopped`
      );
    }
    const remaining = after.data[sessionKey]?.type;
    if (remaining === "busy" || remaining === "retry") {
      throw new Error(`OpenCode session ${sessionKey} is still ${remaining}`);
    }
    return true;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: runner idle and last-directory-owner confirmation must remain one ordered transaction
  async endSession(
    sessionKey: string,
    dir: string,
    instanceId?: string,
    claimed: readonly string[] = []
  ): Promise<void> {
    if (
      claimed.includes(sessionKey) ||
      [...this.#sessions].some(
        ([id, session]) => id !== instanceId && session.sessionId === sessionKey
      ) ||
      [...this.#pendingSessionAddresses].some(
        ([id, address]) => id !== instanceId && address.sessionId === sessionKey
      )
    ) {
      // Drop only A's routing; S's turn, handles and directory resources belong to B.
      if (instanceId) {
        const owner = this.#sessionOwners.get(instanceId);
        this.#sessions.delete(instanceId);
        this.#sessionOwners.delete(instanceId);
        if (owner) {
          this.#activity(owner).unbind(sessionKey, instanceId);
        }
      }
      return;
    }
    const candidates = await this.#liveGenerations();
    for (const identity of candidates) {
      // biome-ignore lint/performance/noAwaitInLoops: interrupt exactly this conversation before waiting on unrelated ownership operations
      const result = await reached(
        this.#clientForGeneration(identity).session.abort(
          { directory: dir, sessionID: sessionKey },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      );
      if (
        (result.error || result.data !== true) &&
        result.response?.status !== 404
      ) {
        throw new Error(`Could not end OpenCode turn ${sessionKey}`);
      }
    }
    const generations = await this.#completeGenerations();
    if (generations.length === 0) {
      return;
    }
    for (const identity of generations) {
      const client = this.#clientForGeneration(identity);
      const scope = { directory: dir };
      const options = { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) };
      // biome-ignore lint/performance/noAwaitInLoops: each generation owns distinct runners
      const before = await reached(client.session.status(scope, options));
      if (before.error || !before.data || !before.response?.ok) {
        throw new Error(`Could not read OpenCode custody for ${sessionKey}`);
      }
      if (
        before.data[sessionKey]?.type &&
        before.data[sessionKey]?.type !== "idle"
      ) {
        // Abort only this session on its captured generation.
        const aborted = await reached(
          client.session.abort({ ...scope, sessionID: sessionKey }, options)
        );
        if (aborted.error || aborted.data !== true) {
          throw new Error(`Could not end OpenCode turn ${sessionKey}`);
        }
      }
      // Positive idle receipt precedes resource release.
      const after = await reached(client.session.status(scope, options));
      if (
        after.error ||
        !after.data ||
        !after.response?.ok ||
        (after.data[sessionKey] && after.data[sessionKey]?.type !== "idle")
      ) {
        throw new Error(`OpenCode turn ${sessionKey} has not ended`);
      }
      for (const [id, session] of this.#sessions) {
        if (id === instanceId && session.sessionId === sessionKey) {
          // biome-ignore lint/performance/noAwaitInLoops: release each handle of exactly this conversation
          await session.dispose();
        }
      }
      // Shared directory resources belong to the remaining sessions; dispose only the last owner.
      if (
        !(
          Object.entries(after.data).some(
            ([id, state]) => id !== sessionKey && state.type !== "idle"
          ) ||
          [...this.#sessions.values()].some(
            (session) => session.directory === dir
          )
        )
      ) {
        const key = this.#pumpKey(dir, identity);
        this.#pumps.get(key)?.abort();
        this.#pumps.delete(key);
        this.#pumpReady.delete(key);
        this.#pumpConnected.delete(key);
        // Directory exit is part of this positive end receipt.
        const released = await reached(client.instance.dispose(scope, options));
        if (released.error || !released.response?.ok) {
          throw new Error(`OpenCode directory resources did not close: ${dir}`);
        }
      }
    }
    if (this.#operationsPending()) {
      throw new Error("OpenCode ownership changed during its end reading.");
    }
  }

  async #completeGenerations(): Promise<ServerIdentity[]> {
    const generations = await this.#liveGenerations();
    const held = await (await this.sessiond()).list();
    if (
      held.procs.some(
        (proc) =>
          proc.alive &&
          parseProcId(proc.procId).kind === "opencode-server" &&
          !generations.some(
            (identity) =>
              identity.procId === proc.procId &&
              identity.pid === proc.pid &&
              identity.epoch === held.epoch
          )
      )
    ) {
      throw new Error(
        "OpenCode runner reading is incomplete: no complete recorded generation custody."
      );
    }
    if (generations.length > 0 && this.#operationsPending()) {
      throw new Error(
        "OpenCode runner reading is incomplete while ownership operations are pending."
      );
    }
    return generations;
  }

  async sessionPresent(
    sessionKey: string,
    directory: string
  ): Promise<boolean> {
    const generations = await this.#completeGenerations();
    const readings = await Promise.all(
      generations.map(async (identity) => {
        const reading = await reached(
          this.#clientForGeneration(identity).session.get(
            { directory, sessionID: sessionKey },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        );
        if (reading.response?.status === 404) {
          return false;
        }
        if (!reading.response?.ok || reading.error || !reading.data) {
          throw new Error("OpenCode session reading is incomplete.");
        }
        return true;
      })
    );
    if (this.#operationsPending()) {
      throw new Error("OpenCode ownership changed during its session reading.");
    }
    return readings.some(Boolean);
  }

  sessionAddresses(): import("@cawco/core").SessionAddress[] {
    const addresses = new Map(this.#pendingSessionAddresses);
    for (const [instanceId, session] of this.#sessions) {
      if (session.sessionId) {
        addresses.set(instanceId, { instanceId, sessionId: session.sessionId });
      }
    }
    return [...addresses.values()];
  }

  async unclaimedRunners(
    directory: string,
    claimed: readonly string[]
  ): Promise<{ count: number; readStartedAt: number }> {
    const readStartedAt = Date.now();
    const generations = await this.#completeGenerations();
    const known = new Set(claimed);
    const unclaimed = new Set<string>();
    const readings = await Promise.all(
      generations.map(async (identity) => {
        const result = await reached(
          this.#clientForGeneration(identity).session.status(
            { directory },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        );
        if (result.error || !result.data || !result.response?.ok) {
          throw new Error("OpenCode runner reading is incomplete.");
        }
        return result.data;
      })
    );
    for (const reading of readings) {
      for (const [id, state] of Object.entries(reading)) {
        if (state.type !== "idle" && !known.has(id)) {
          unclaimed.add(id);
        }
      }
    }
    if (this.#operationsPending()) {
      throw new Error("OpenCode ownership changed during its runner reading.");
    }
    return { count: unclaimed.size, readStartedAt };
  }

  /** A register may recover every held session, but must never spawn new work. */
  reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<OpencodeSession | undefined> {
    const existing = this.#sessions.get(ctx.instanceId);
    if (existing) {
      return Promise.resolve(existing);
    }
    const pending = this.#pendingRecoveries.get(ctx.instanceId);
    if (pending) {
      return pending;
    }
    const wave: RecoveryWave = this.#recoveryWave ?? { pending: 0 };
    this.#recoveryWave = wave;
    wave.pending += 1;
    const recovery = this.#recover(
      spec,
      withAccountReads(spec, ctx),
      wave
    ).finally(() => {
      this.#pendingRecoveries.delete(ctx.instanceId);
      wave.pending -= 1;
      if (wave.pending === 0 && this.#recoveryWave === wave) {
        this.#recoveryWave = null;
      }
    });
    this.#pendingRecoveries.set(ctx.instanceId, recovery);
    return recovery;
  }

  async #recover(
    spec: SpawnPayload,
    ctx: HarnessContext,
    wave: RecoveryWave
  ): Promise<OpencodeSession | undefined> {
    let attempt = 0;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: dispose() terminates retrying recoveries during agent teardown
    while (!this.#disposed) {
      if (!wave.round || wave.round.attempt < attempt) {
        wave.round = {
          attempt,
          token: {},
          generations: this.#liveGenerations(),
        };
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: unresolved custody is retried, never converted to spawn failure
        return await this.#reattachOnce(spec, ctx, wave.round);
      } catch (error) {
        if (
          error instanceof HarnessRecoveryRefused ||
          error instanceof SessionAddressRefused
        ) {
          throw error;
        }
        const delay = Math.min(250 * 2 ** Math.min(attempt, 5), 5000);
        console.warn(
          `[opencode] recovery ${ctx.instanceId} waiting; retry in ${delay}ms: ${errorText(error)}`
        );
        attempt += 1;
        await Bun.sleep(delay);
      }
    }
    return undefined;
  }

  async #reattachOnce(
    spec: SpawnPayload,
    ctx: HarnessContext,
    round: RecoveryRound
  ): Promise<OpencodeSession | undefined> {
    // Wait out publication before resolving custody across active and retained
    // generations. Recovery slots then prevent retirement during the lookup.
    while (this.#applyGate) {
      // biome-ignore lint/performance/noAwaitInLoops: each apply must finish before the next check
      await this.#applyGate.promise;
    }
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: custody check, inspection-only policy and cancellation belong to one recovery transaction
    return this.#withRecovery(async () => {
      const { resume } = spec;
      if (!resume) {
        return;
      }
      const generations = await round.generations;
      if (!generations.length) {
        return;
      }
      // Storage is shared, but each live generation owns its own runners.
      // Resolve the actual owner before opening the stored session at all.
      const states = await Promise.all(
        generations.map(async (generation) => {
          const server = this.#clientForGeneration(generation);
          const state = await this.#activity(generation).sessionState(
            server,
            resume.sessionKey,
            ctx.cwd,
            round.token
          );
          return {
            identity: generation,
            state,
            running: state.kind === "decided" && state.state === "busy",
          };
        })
      );
      const busy = states.filter((state) => state.running);
      if (busy.length > 1) {
        throw new HarnessRecoveryRefused(
          `OpenCode session ${resume.sessionKey} is running in multiple generations: ${busy.map(({ identity: owner }) => `${owner.procId}/${owner.pid} at ${owner.url}`).join(", ")}. Interrupt the duplicate runner explicitly before resuming; no runner was replaced.`
        );
      }
      if (busy.length === 0) {
        for (const generation of states) {
          if (generation.state.kind === "unreachable") {
            throw new Error(
              `OpenCode generation ${generation.identity.procId} is temporarily unreachable: ${generation.state.reason}`
            );
          }
        }
      }
      // A turn running anywhere is reattached where it runs. At rest, the
      // session opens in the server of the account it runs on now (a move to
      // another account relaunches it at a turn boundary), started for it if
      // it is not running; on no account, in the machine's own.
      const account = spec.accountDir?.accountId;
      if (
        !busy[0] &&
        (spec.reattachOnly === "busy" || spec.reattachOnly === "inspect")
      ) {
        return;
      }
      if (!busy[0] && account !== undefined) {
        await this.#ensureAccount(account);
      }
      const target = this.#slotOf(account).owner.active;
      const chosen =
        busy[0] ??
        (target
          ? (states.find(
              (state) => state.identity.procId === target.procId
            ) ?? { identity: target, running: false })
          : undefined);
      if (!chosen) {
        throw new Error(
          "OpenCode has no live active generation for idle recovery."
        );
      }
      const { identity, running } = chosen;
      const server = this.#clientForGeneration(identity);
      const session = await server.session.get(
        { sessionID: resume.sessionKey, directory: ctx.cwd },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (session.response?.status === 404) {
        return;
      }
      if (session.error || !session.data) {
        throw new Error(
          `Could not reattach OpenCode session ${resume.sessionKey}`
        );
      }
      // Whether this session's turn is still running is the server's word,
      // asked before the session is handed back: a reattached session is
      // busy from that moment, not from the reconcile that follows its
      // subscription (`watchResumedTurn`), which a busy question after an
      // agent restart did not wait for.
      const activity = this.#activity(identity);
      activity.bind(resume.sessionKey, ctx.instanceId, ctx.cwd);
      if (spec.reattachOnly === "busy" || spec.reattachOnly === "inspect") {
        if (!running) {
          return;
        }
        if (spec.reattachOnly === "inspect") {
          // Not a session frame through ctx.frame: that folds a pulse and would
          // turn this safety inspection into fresh activity on the old row.
          ctx.emit({
            verb: "frames",
            machineId: "",
            instanceId: ctx.instanceId,
            payload: {
              kind: "frame",
              harness: "opencode",
              message: { type: "system", subtype: CUSTODY_HELD },
            },
          });
          return;
        }
      }
      // Not `spawn`: that queues behind an apply gate, and an apply that
      // started while this recovery held its slot waits for the slot —
      // queueing here would hold both. The apply stops nothing while a
      // recovery is running, so the server this opens against stays up.
      const opened = await this.#open(spec, ctx, {
        client: server,
        session: session.data as Session,
        running,
        identity,
      });
      if (running) {
        opened.reattachedMidTurn();
        console.info(
          `[opencode] recovery ${ctx.instanceId}: reattached running turn ${resume.sessionKey} on ${identity.procId}/${identity.pid}`
        );
      }
      return opened;
    });
  }

  spawn(spec: SpawnPayload, ctx: HarnessContext): Promise<HarnessSession> {
    // Config convergence gate: if a reload is in progress, queue this spawn
    // and deliver it when the gate lifts.
    if (this.#applyGate) {
      return new Promise<HarnessSession>((resolve, reject) => {
        this.#pendingSpawns.push({ resolve, reject, spec, ctx });
      });
    }
    this.#opening += 1;
    return this.#spawnResolved(spec, withAccountReads(spec, ctx)).finally(
      () => {
        this.#opening -= 1;
      }
    );
  }

  async #spawnResolved(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<OpencodeSession> {
    if (spec.resume && !spec.resume.fork) {
      const recovered = await this.reattach(spec, ctx);
      if (recovered) {
        return recovered;
      }
    }
    return this.#open(spec, ctx);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: creates/resumes/forks a session across three branches, then wires the session up; not refactored in this pass
  async #open(
    spec: SpawnPayload,
    ctx: HarnessContext,
    existing?: {
      client: OpencodeClient;
      session: Session;
      running: boolean;
      identity: ServerIdentity;
    }
  ): Promise<OpencodeSession> {
    // Before the server first reads the directory's config.
    await disablePlanAgentFor(spec, ctx.cwd);
    // The account a session runs on is the server it runs in: the account's
    // own, where OpenCode's own sign-in code sends its requests with that
    // account's credential; on no account, the machine's.
    const account = spec.accountDir?.accountId;
    const slot = this.#slotOf(account);
    const client =
      existing?.client ??
      (await (account === undefined
        ? this.#ensure()
        : this.#ensureAccount(account)));
    const identity = existing?.identity ?? slot.owner.active;
    if (!identity) {
      throw new Error("OpenCode open has no generation custody.");
    }
    if (existing?.running && spec.resume?.atMessage && !spec.resume.fork) {
      throw new Error("OpenCode cannot rewind a running incumbent turn.");
    }
    // The fleet's baseline, the delegate type's and the spawn's own denials —
    // the three layers the claude adapter unions too — as OpenCode denies them.
    const denied = opencodeDenySettings([
      ...(await sessionFleetDenials(spec.cawcoTodos)),
      ...(spec.denyTools ?? []),
    ]);
    // cbd4c3a0 required the correct hub and caller identity, not readiness of
    // every remote server. Config provenance is fast; MCP health is asynchronous.
    if (!existing?.running) {
      await bootInstance(client, ctx.cwd);
      const configured = await client.config.get(
        { directory: ctx.cwd },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (!configured.data || configured.error) {
        throw new Error(
          `Could not read OpenCode session config: ${errorText(configured.error)}`
        );
      }
      if (!containsJson(cawcoMcp(), configured.data.mcp?.cawco)) {
        throw new Error(
          "OpenCode session config points CawCo tools at another hub."
        );
      }
    }
    // Connection health never delays publishing a session (bb65de38): the
    // read warms every MCP server the directory has. The session's first
    // dispatch waits on the cawco slot alone ({@link OpencodeSession}).
    const cawcoConnected = client.mcp
      .status({ directory: ctx.cwd }, { signal: AbortSignal.timeout(65_000) })
      .then((status) => {
        console.info(
          `[opencode] ${ctx.cwd}: MCP status ${JSON.stringify(status.data ?? status.error)}`
        );
        const cawco = status.data?.cawco;
        if (cawco?.status !== "connected") {
          throw new Error(
            `CawCo MCP is not connected (${cawco ? `${cawco.status}${"error" in cawco ? `: ${cawco.error}` : ""}` : errorText(status.error)}).`
          );
        }
      });
    // A spawn that fails before its session exists leaves nobody to await it.
    cawcoConnected.catch(() => undefined);
    let sessionId: string;

    if (existing) {
      sessionId = existing.session.id;
    } else if (spec.resume?.fork) {
      assertOpencodeKey(spec.resume.sessionKey, "fork");
      const fork = await client.session.fork(
        {
          sessionID: spec.resume.sessionKey,
          directory: ctx.cwd,
          ...(spec.resume.atMessage
            ? { messageID: spec.resume.atMessage }
            : {}),
        },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (fork.error || !fork.data) {
        throw new Error("opencode could not fork the session");
      }
      sessionId = (fork.data as Session).id;
    } else if (spec.resume) {
      // Re-open: opencode sessions persist in the server's DB, so resuming is
      // just addressing the id again — but only an id the server actually
      // holds. A key nobody holds is refused loudly here rather than addressed
      // blindly: a blind address becomes a live handle whose every prompt
      // fails, plus an init frame that cements the bogus key into the hub row
      // (noteInstanceSession trusts it), poisoning the session permanently.
      assertOpencodeKey(spec.resume.sessionKey, "resume");
      const held = await client.session.get(
        { sessionID: spec.resume.sessionKey, directory: ctx.cwd },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (held.error || !held.data) {
        throw new Error(
          `opencode has no session ${spec.resume.sessionKey} to resume in ${ctx.cwd}`
        );
      }
      sessionId = spec.resume.sessionKey;
    } else {
      const created = await client.session.create(
        {
          directory: ctx.cwd,
          // Kept with the session, so a resume is denied the same tools.
          ...(denied.permission.length > 0
            ? { permission: denied.permission }
            : {}),
        },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (created.error || !created.data) {
        throw new Error("opencode could not create the session");
      }
      sessionId = (created.data as Session).id;
    }
    if (!ctx.recordSessionAddress) {
      throw new Error(
        "OpenCode work requires the hub's session-address acknowledgement."
      );
    }
    this.#pendingSessionAddresses.set(ctx.instanceId, {
      instanceId: ctx.instanceId,
      sessionId,
    });
    try {
      await ctx.recordSessionAddress(sessionId);
    } finally {
      this.#pendingSessionAddresses.delete(ctx.instanceId);
    }
    if (spec.resume?.atMessage && !spec.resume.fork) {
      assertOpencodeKey(sessionId, "revert");
      const reverted = await client.session.revert(
        {
          sessionID: sessionId,
          directory: ctx.cwd,
          messageID: spec.resume.atMessage,
        },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (reverted.error) {
        throw new Error(
          `opencode could not rewind to that message: ${errorText(reverted.error)}`
        );
      }
    }

    let session!: OpencodeSession;
    session = new OpencodeSession(
      ctx.instanceId,
      ctx,
      client,
      sessionId,
      ctx.cwd,
      spec.model,
      spec.permissionMode,
      (childId, callID) => {
        const owner = this.#sessionOwners.get(ctx.instanceId) ?? identity;
        this.#activity(owner).bind(childId, ctx.instanceId, ctx.cwd);
        this.#children.set(childId, {
          parent: session,
          callID,
          identity: owner,
        });
      },
      () => {
        const held = this.#sessionOwners.get(ctx.instanceId) ?? identity;
        if (this.#sessions.get(ctx.instanceId) === session) {
          this.#sessions.delete(ctx.instanceId);
          const owner = this.#sessionOwners.get(ctx.instanceId);
          if (owner) {
            this.#activity(owner).unbind(sessionId, ctx.instanceId);
          }
          this.#sessionOwners.delete(ctx.instanceId);
        }
        for (const [childId, entry] of this.#children) {
          if (entry.parent === session) {
            this.#activity(entry.identity).unbind(childId, ctx.instanceId);
            this.#children.delete(childId);
          }
        }
        this.#releaseDirectory(ctx.cwd, held);
      },
      (urgent) =>
        this.#applyGate !== null ||
        (!urgent &&
          this.#sessionOwners.get(ctx.instanceId)?.procId !==
            slot.owner.active?.procId),
      () =>
        this.#sessionBusy(
          sessionId,
          ctx.cwd,
          this.#sessionOwners.get(ctx.instanceId)
        ),
      () => this.#prepareDispatch(session),
      cawcoConnected,
      () =>
        new Set(
          [...this.#sessions.values(), session].flatMap((held) =>
            held.sessionId ? [held.sessionId] : []
          )
        ),
      spec.effort,
      spec.workflowStepId,
      spec.canDelegate,
      denied.tools,
      account,
      spec.lead === true
    );
    this.#sessionOwners.set(ctx.instanceId, identity);
    // A session an earlier agent left mid-turn: the hub still waits on that
    // turn's end, which the reconcile after its subscription comes up pays.
    if (spec.resume && !spec.resume.fork && turnWasOpen(sessionId)) {
      session.inheritOpenTurn();
    }
    if (spec.reattachOnly === true) {
      session.sleepAfterRecovery();
    }
    session.attached = () => {
      // Publishing a handle retains its captured generation, even if a newer
      // active generation was published while this attachment was prepared.
      const owner = this.#sessionOwners.get(ctx.instanceId);
      if (!owner) {
        throw new Error("OpenCode attachment has no generation custody.");
      }
      session.rebindClient(this.#clientForGeneration(owner));
      this.#sessions.set(ctx.instanceId, session);
      this.#activity(owner).bind(sessionId, ctx.instanceId, ctx.cwd);
      if (owner.procId !== slot.owner.active?.procId) {
        this.#handoffIdle().catch(console.warn);
      }
      ctx.session(sessionId);
      // The init frame the dashboard reads the model / cwd / commands off.
      ctx.frame({
        type: "system",
        subtype: "init",
        session_id: sessionId,
        cwd: ctx.cwd,
        ...(spec.model ? { model: spec.model } : {}),
        ...(spec.permissionMode ? { permissionMode: spec.permissionMode } : {}),
      });
      session.sayEffort();

      // biome-ignore lint/complexity/noVoid: the command prefill must not block attachment
      void session
        .control(CONTROL_SUPPORTED_COMMANDS, [])
        .then((answer) => {
          const commands = answer as SlashCommand[];
          if (commands.length) {
            ctx.frame({
              type: "system",
              subtype: "commands_changed",
              session_id: sessionId,
              commands,
            });
          }
        })
        .catch((error: unknown) =>
          console.warn(`[opencode] command list: ${String(error)}`)
        );

      // A resumed session may already be mid-turn on the server, or holding an
      // open permission or question; nothing else would ever tell this
      // process so (see `watchResumedTurn`, `reconcileGates`). One snapshot
      // per session, taken after its directory is subscribed so no live gate
      // event is missed: a directory that connects after this line reconciles
      // every session it holds, this one included, so only a directory whose
      // subscription is already up reconciles here. Both checks run without
      // an await between them and the connection's, so exactly one fires.
      // biome-ignore lint/complexity/noVoid: attached handles remain operable while the subscription starts
      void this.#ensurePump(ctx.cwd, owner).catch((error: unknown) =>
        console.warn(String(error))
      );
      if (this.#pumpConnected.has(this.#pumpKey(ctx.cwd, owner))) {
        // biome-ignore lint/complexity/noVoid: attached handles remain operable while reconciliation runs
        void this.#reconcile(session);
      }
    };

    // Load skills natively: send each as a /command before the first prompt.
    // The opencode server queues them in order, so skills load before work.
    if (!existing?.running && spec.skills?.length) {
      // Each is a command turn: a lead's fence goes to the session first.
      await session.fenceCommandTurn();
      for (const skill of spec.skills) {
        // biome-ignore lint/performance/noAwaitInLoops: skills must load in order, before the first prompt
        await reached(
          client.session.command(
            {
              sessionID: sessionId,
              directory: ctx.cwd,
              command: skill,
              arguments: "",
              ...(spec.model ? { model: spec.model } : {}),
              ...(spec.effort ? { variant: spec.effort } : {}),
            },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        );
      }
    }

    return session;
  }

  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    if (resolveBin("opencode") === undefined) {
      return [];
    }
    const client = await this.#ensure();
    const tags = await readTags();

    if (dir) {
      const result = await reached(
        client.session.list(
          { directory: dir },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      );
      if (result.error || !result.data) {
        throw new Error(
          `OpenCode session catalog unreadable: ${errorText(result.error)}`
        );
      }
      // Subagent children do not belong in the rail.
      return (result.data as Session[])
        .filter((session) => !session.parentID)
        .map((session) => sessionToInfo(session, tags[session.id]));
    }

    // Machine catalog: every session on the server, merged and deduped by id.
    // Asked per project worktree AND once unscoped: a scoped list only matches
    // its exact directory, so a session living directly under a parent dir
    // (e.g. /home/o with only / as a project worktree) appears in neither —
    // verified live at 1.18.19, where `?directory=/` answers []. The unscoped
    // list covers those; the per-worktree queries stay so an opencode whose
    // unscoped list is project-scoped still reports the whole machine.
    const projects = await reached(
      client.project.list(
        {},
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      )
    );
    if (projects.error || !projects.data) {
      throw new Error(
        `OpenCode project catalog unreadable: ${errorText(projects.error)}`
      );
    }
    const lists = await Promise.all([
      reached(
        client.session.list(
          {},
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      ),
      ...(projects.data as Project[]).map((project) =>
        reached(
          client.session.list(
            { directory: project.worktree },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        )
      ),
    ]);
    const seen = new Set<string>();
    const merged: Session[] = [];
    for (const list of lists) {
      if (list.error || !list.data) {
        throw new Error(
          `OpenCode session catalog unreadable: ${errorText(list.error)}`
        );
      }
      for (const session of list.data) {
        if (session.parentID || seen.has(session.id)) {
          continue;
        }
        seen.add(session.id);
        merged.push(session);
      }
    }
    return merged.map((session) => sessionToInfo(session, tags[session.id]));
  }

  async getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | undefined> {
    if (resolveBin("opencode") === undefined) {
      return undefined;
    }
    // A read-only lookup: a key that cannot be an opencode session answers
    // "not held" rather than being sent, keeping this method's contract.
    if (!OPENCODE_SESSION_ID.test(sessionKey)) {
      return undefined;
    }
    const client = await this.#ensure();
    const result = await reached(
      client.session.get({ sessionID: sessionKey, directory: dir })
    );
    if (result.error || !result.data) {
      return undefined;
    }
    const tags = await readTags();
    return sessionToInfo(result.data as Session, tags[sessionKey]);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reads the session, its revert point, and its subagent children in one pass; not refactored in this pass
  async getSessionMessages(
    sessionKey: string,
    dir?: string
  ): Promise<SessionMessage[]> {
    if (resolveBin("opencode") === undefined) {
      return [];
    }
    assertOpencodeKey(sessionKey, "getSessionMessages");
    const client = await this.#ensure();
    const result = await reached(
      client.session.messages({ sessionID: sessionKey, directory: dir })
    );
    if (result.error || !result.data) {
      return [];
    }
    let rows = result.data as { info: Message; parts: Part[] }[];

    // opencode keeps the full history even after a rewind; reflect the session's
    // `revert` point by dropping it and everything after.
    const sessionRes = await reached(
      client.session.get({ sessionID: sessionKey, directory: dir })
    );
    const revertID = (sessionRes.data as Session).revert?.messageID;
    if (revertID) {
      const idx = rows.findIndex((row) => row.info.id === revertID);
      if (idx >= 0) {
        rows = rows.slice(0, idx);
      }
    }

    const entries = toTranscript(sessionKey, rows);

    // Subagents: children of this session, linked to their parent's task tool
    // call by the task ToolPart's `state.metadata.sessionId` (verified capture).
    const childrenRes = await reached(
      client.session.children({ sessionID: sessionKey })
    );
    if (childrenRes.error || !childrenRes.data) {
      return entries;
    }

    const callByChild = new Map<string, string>();
    for (const row of rows) {
      for (const part of row.parts) {
        if (part.type !== "tool" || part.tool !== "task") {
          continue;
        }
        const childId = (part.state as { metadata?: { sessionId?: string } })
          .metadata?.sessionId;
        if (typeof childId === "string") {
          callByChild.set(childId, part.callID);
        }
      }
    }

    for (const child of childrenRes.data as Session[]) {
      const callID = callByChild.get(child.id);
      if (!callID) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: children are appended to the transcript in this order; parallel fetches would reorder subagents
      const childRes = await reached(
        client.session.messages({ sessionID: child.id, directory: dir })
      );
      if (childRes.error || !childRes.data) {
        continue;
      }
      const childEntries = toTranscript(
        child.id,
        childRes.data as { info: Message; parts: Part[] }[]
      );
      for (const entry of childEntries) {
        entry.parent_tool_use_id = callID;
      }
      entries.push(...childEntries);
    }

    return entries;
  }

  renameSession(
    sessionKey: string,
    title: string,
    dir?: string
  ): Promise<void> {
    if (resolveBin("opencode") === undefined) {
      return Promise.resolve(undefined);
    }
    assertOpencodeKey(sessionKey, "renameSession");
    return this.#ensure()
      .then((client) =>
        reached(
          client.session.update({
            sessionID: sessionKey,
            directory: dir,
            title,
          })
        )
      )
      .then(() => undefined);
  }

  async tagSession(
    sessionKey: string,
    tag: string | null,
    _dir?: string
  ): Promise<void> {
    assertOpencodeKey(sessionKey, "tagSession");
    await writeTag(sessionKey, tag);
  }

  deleteSession(sessionKey: string, dir?: string): Promise<void> {
    if (resolveBin("opencode") === undefined) {
      return Promise.resolve(undefined);
    }
    assertOpencodeKey(sessionKey, "deleteSession");
    return this.#ensure()
      .then((client) =>
        reached(
          client.session.delete({ sessionID: sessionKey, directory: dir })
        )
      )
      .then(() => undefined);
  }

  async machine(method: string, args: unknown[]): Promise<unknown> {
    switch (method) {
      case CONTROL_MODEL_CATALOG:
        return await this.#catalog();
      case CONTROL_GET_TODOS: {
        assertOpencodeKey(args[0] as string, CONTROL_GET_TODOS);
        const client = await this.#ensure();
        const result = await reached(
          client.session.todo({
            sessionID: args[0] as string,
            ...(args[1] ? { directory: args[1] as string } : {}),
          })
        );
        if (result.error || !result.data) {
          return [];
        }
        // opencode's todos carry no id: the list is ordered and replaced
        // whole on every write, so a todo's place in it is its identity,
        // counted before the cancelled ones drop out.
        return (result.data as Todo[])
          .map((todo, index) => ({ todo, id: String(index + 1) }))
          .filter(({ todo }) => todo.status !== "cancelled")
          .map(({ todo, id }): import("@cawco/core").NeutralTask => ({
            id,
            subject: todo.content,
            status:
              todo.status === "in_progress" || todo.status === "completed"
                ? todo.status
                : "pending",
            ...(todo.priority === "high" ||
            todo.priority === "medium" ||
            todo.priority === "low"
              ? { priority: todo.priority }
              : {}),
            blocks: [],
            blockedBy: [],
          }));
      }
      default:
        return undefined;
    }
  }

  /**
   * Tear down the AGENT SIDE. The server is deliberately left running: it is
   * sessiond's child now, it owns the machine's live sessions, and killing it
   * here would re-create exactly the death this leaf removes. A rebuilt
   * supervisor calls {@link OpencodeHarness.spawn} again, {@link #ensure}
   * re-reads the announced port from the ring, and the per-directory SSE pumps
   * re-subscribe against the same still-running server.
   */
  // biome-ignore lint/suspicious/useAwait: implements Harness.dispose's Promise<void> contract; this teardown is synchronous
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#converging = false;
    this.#stopConfigWatcher();
    for (const activity of this.#activities.values()) {
      activity.stop();
    }
    if (this.#handoffTimer) {
      clearTimeout(this.#handoffTimer);
    }
    this.#handoffTimer = null;
    this.#stopPumps();
    // The socket, not the child: a closed sessiond connection is re-dialled by
    // `sessiond()` and the held server never notices.
    // biome-ignore lint/complexity/noVoid: fire-and-forget close; dispose() must not block on the socket teardown
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best-effort close, a failed close here is not actionable
    void this.#sessiond?.then((client) => client.close()).catch(() => {});
    this.#sessiond = undefined;
    for (const slot of this.#slots()) {
      slot.client = null;
      slot.ready = null;
    }
  }

  async syncFleet(config: FleetConfig): Promise<FleetSyncReport> {
    this.#mutatingMcp += 1;
    try {
      return await this.#syncFleet(config);
    } finally {
      this.#mutatingMcp -= 1;
    }
  }

  async #syncFleet(config: FleetConfig): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    };

    const mcp = await syncOpencodeMcp(
      config.mcp,
      sidecar.mcp ?? [],
      report.mcp
    );
    // Remove the skills/memory the pre-2026-08-14 sync wrote; opencode reads
    // ~/.claude/skills/ and its own memory file, so cawco no longer owns these.
    if (Object.keys(sidecar.skills).length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: invariant: report.skills is initialized to {} a few lines above; TS drops the narrowing across the earlier await
      await syncSkillFiles(OPENCODE_SKILLS, [], sidecar.skills, report.skills!);
    }
    if (sidecar.memory !== undefined) {
      await syncMemory(OPENCODE_MEMORY, null, sidecar.memory, report);
    }
    const planAgentDisabled = await syncPlanAgent(
      config.cawcoTodos === true,
      sidecar.planAgentDisabled === true
    );
    // Before the poke below: a placement that changed restarts the server as
    // opencode.json changing does (`#hashConfig`).
    const placed = await placeOpencodeMcp(config.placedMcp);
    await writeJson(OPENCODE_SIDECAR, {
      mcp,
      ...(planAgentDisabled ? { planAgentDisabled: true } : {}),
    });

    // Poke the config watcher: syncFleet just wrote opencode.json, so the disk
    // hash will have changed. An immediate tick avoids the up-to-2s polling
    // delay before the convergence system notices.
    await this.#configTick();
    // A control RPC reports a restart, never waits on it. The watcher verifies
    // the written config and the next status read uses the replacement server.
    if (this.#applyGate) {
      const restarting = {
        state: "pending",
        detail: "OpenCode server restarting.",
      } as const;
      report.mcp = Object.fromEntries([
        ...Object.entries(placed).map(([key, state]) => [
          key,
          state.state === "applied" ? restarting : state,
        ]),
        ...mcp.map((name) => [name, restarting]),
      ]);
      return report;
    }
    // Every running server here, for the directories its sessions run in.
    // The machine's also for its own directory, which the fleet's MCP status
    // is read from ({@link #readFleetMcp}). An account's never for its own:
    // OpenCode starts every configured MCP server in an instance the first
    // time it connects one there, so that would be a second copy of the
    // fleet's local servers per account, held for nobody.
    const places = [
      {
        client: await this.#ensure(),
        directories: new Set([
          undefined,
          ...this.#pumps.keys(),
          ...[...this.#sessions.values()]
            .filter((session) => session.account === undefined)
            .map((session) => session.directory),
        ]),
      },
      ...[...this.#accounts.values()].flatMap((slot) =>
        slot.client
          ? [
              {
                client: slot.client,
                directories: new Set(
                  [...this.#sessions.values()]
                    .filter((session) => session.account === slot.account)
                    .map((session) => session.directory)
                ),
              },
            ]
          : []
      ),
    ];
    for (const server of config.mcp.filter(
      (row) => row.proxied && row.enabled
    )) {
      for (const { client, directory } of places.flatMap((place) =>
        [...place.directories].map((one) => ({
          client: place.client,
          directory: one,
        }))
      )) {
        // biome-ignore lint/performance/noAwaitInLoops: replace each directory's connection before reporting runtime state
        const connected = await client.mcp.add({
          name: server.name,
          config: toOpencodeMcp(server.config),
          directory,
        });
        if (connected.error) {
          throw new Error(errorText(connected.error));
        }
        const removed = await client.mcp.auth.remove({
          name: server.name,
          directory,
        });
        if (removed.error) {
          throw new Error(errorText(removed.error));
        }
        const reconnected = await client.mcp.connect({
          name: server.name,
          directory,
        });
        if (reconnected.error) {
          throw new Error(errorText(reconnected.error));
        }
      }
    }
    Object.assign(report.mcp, placed, await this.#readFleetMcp(mcp));

    return report;
  }

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    };

    report.mcp = await this.#readFleetMcp(sidecar.mcp ?? []);
    return report;
  }

  async #readFleetMcp(names: string[]): Promise<FleetSyncReport["mcp"]> {
    if (names.length === 0) {
      return {};
    }
    if (this.#applyGate) {
      return Object.fromEntries(
        names.map((name) => [
          name,
          { state: "pending", detail: "OpenCode server restarting." },
        ])
      );
    }
    try {
      const client = await this.#ensure();
      const identity = this.#serverOwner.active;
      const paths = await reached(
        client.path.get(
          {},
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      );
      if (!identity || paths.error || !paths.data) {
        throw new Error(
          "OpenCode MCP probe has no verified directory custody."
        );
      }
      const { directory } = paths.data;
      // A status probe can initialize the server's default directory, which
      // may also hold live sessions. Cleanup shares the directory release's
      // attachment and server-idle checks; a read never cuts their turns short.
      const result = await reached(
        client.mcp.status({}, { signal: AbortSignal.timeout(10_000) })
      ).finally(async () => {
        await this.#disposeUnused(directory, identity, "fleet MCP status");
      });
      if (result.error || !result.data) {
        throw new Error(errorText(result.error));
      }
      return Object.fromEntries(
        names.map((name) => [name, mcpFleetState(result.data[name])])
      );
    } catch (error) {
      return Object.fromEntries(
        names.map((name) => [name, { state: "failed", detail: String(error) }])
      );
    }
  }
}

/**
 * Whether an assistant message is the one its model ended the turn with: it
 * has completed, without an error, and finished on `stop` (not `tool-calls`,
 * `length` or `unknown`).
 */
const endsTurn = (info: AssistantMessage): boolean =>
  Boolean(info.time.completed) && !info.error && info.finish === "stop";

/**
 * The user messages opencode has written and not yet given the model: those
 * written behind an assistant message still being written. opencode stores a
 * send the moment it is dispatched and takes it up when the step in flight
 * ends — the same rule the live stream reads by (`#readAfter`, released when
 * that answer completes). The one still being written, when there is one, is
 * `answering`.
 */
function queuedMessages(rows: { info: Message }[]): {
  answering?: string;
  ids: Set<string>;
} {
  const ids = new Set<string>();
  let answering: string | undefined;
  for (const { info } of rows) {
    if (info.role === "assistant") {
      answering = (info as AssistantMessage).time.completed
        ? undefined
        : info.id;
      ids.clear();
    } else if (answering) {
      ids.add(info.id);
    }
  }
  return { ids, ...(answering ? { answering } : {}) };
}

/**
 * opencode's compaction part as the boundary frame, under the part's own id
 * live and read back alike. It says whether opencode compacted on its own or
 * was asked to; it carries no token count, so the frame carries none. Read
 * back, it carries how the compaction ended when opencode stored that
 * (`compactionOutcomes`); live, the outcome comes on a `status` frame.
 */
function compactBoundary(
  part: CompactionPart,
  timestamp: string | undefined,
  outcome?: CompactionOutcome
): NeutralSystemMessage {
  return {
    type: "system",
    subtype: "compact_boundary",
    uuid: part.id,
    session_id: part.sessionID,
    ...(timestamp ? { timestamp } : {}),
    compact_metadata: {
      trigger: part.auto ? "auto" : "manual",
      ...outcome,
    },
  };
}

type CompactionOutcome = NonNullable<
  Pick<
    NonNullable<NeutralSystemMessage["compact_metadata"]>,
    "result" | "error"
  >
>;

/**
 * How each compaction opencode stored ended, by the user message that opened
 * it. opencode writes the compaction's summary as an assistant message with
 * `summary` set, its `parentID` the compaction's message, and counts it
 * finished only with `finish` set and no `error` (`completedCompactions`,
 * packages/opencode/src/session/compaction.ts at v1.18.34); a compaction that
 * failed keeps that message with its `error` (and `finish: "error"`). One
 * still running has neither, and no outcome.
 */
function compactionOutcomes(
  rows: { info: Message }[]
): Map<string, CompactionOutcome> {
  const outcomes = new Map<string, CompactionOutcome>();
  for (const { info } of rows) {
    if (info.role !== "assistant" || !info.summary) {
      continue;
    }
    if (info.error) {
      outcomes.set(info.parentID, {
        result: "failed",
        error: errorText(info.error),
      });
    } else if (info.finish) {
      outcomes.set(info.parentID, { result: "success" });
    }
  }
  return outcomes;
}

/** opencode `{info, parts}` → the neutral transcript entries the folder reads. */
/**
 * Exported for its own sake as well as the session's: this is the whole of what
 * a reopened transcript is, so it is the one place a reload's fidelity can be
 * checked against parts a real server stored.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: replays every part kind opencode stores; not refactored in this pass
export function toTranscript(
  sessionKey: string,
  rows: { info: Message; parts: Part[] }[]
): SessionMessage[] {
  const entries: SessionMessage[] = [];
  const unread = queuedMessages(rows).ids;
  const outcomes = compactionOutcomes(rows);
  for (const { info, parts } of rows) {
    // opencode records when each message was created (`time.created`, epoch
    // ms, on UserMessage and AssistantMessage in @opencode-ai/sdk
    // types.gen.d.ts): every entry of the message carries it, a tool result
    // the moment its call ended.
    const timestamp = new Date(info.time.created).toISOString();
    if (info.role === "user") {
      // CawCo's own stop of a session failing the same way again and again
      // (`noteStopped`), read back as the line the live stream drew.
      const stopped = parts.find(
        (part): part is TextPart =>
          part.type === "text" &&
          (part.metadata as { cawco?: unknown } | undefined)?.cawco ===
            REPEATED_FAILURE
      );
      if (stopped) {
        entries.push({
          type: "system",
          uuid: stopped.id,
          session_id: sessionKey,
          message: {
            type: "system",
            subtype: REPEATED_FAILURE,
            uuid: stopped.id,
            session_id: sessionKey,
            timestamp,
            content: String(
              (stopped.metadata as { words?: unknown }).words ?? ""
            ),
          },
          parent_tool_use_id: null,
          parent_agent_id: null,
          timestamp,
        });
        continue;
      }
      // What opencode writes into a user message itself (`synthetic`: the
      // note a compaction continues with, a read file's contents) is not
      // anyone's words, and the live stream never draws it: read back, a
      // message that is nothing else is no row at all.
      const text = parts
        .filter(
          (part): part is TextPart =>
            part.type === "text" && !part.synthetic && !part.ignored
        )
        .map((part) => part.text)
        .join("\n");
      const content = withImageAttachments(
        text,
        parts.filter((part): part is FilePart => part.type === "file")
      );
      if (content) {
        // A sent message is keyed back to its send's uuid by the hub, which
        // was told this message id when the send was dispatched (`storedAs`).
        // Why a send failed is its record's to say, not the transcript's.
        entries.push({
          type: "user",
          uuid: info.id,
          session_id: sessionKey,
          message: { role: "user", content },
          parent_tool_use_id: null,
          parent_agent_id: null,
          timestamp,
          ...(unread.has(info.id) ? { queued: true as const } : {}),
        });
      }
      // The message a compaction opens with carries nothing but its part: the
      // boundary the live stream drew for it.
      for (const part of parts) {
        if (part.type === "compaction") {
          entries.push({
            type: "system",
            uuid: part.id,
            session_id: sessionKey,
            message: compactBoundary(part, timestamp, outcomes.get(info.id)),
            parent_tool_use_id: null,
            parent_agent_id: null,
            timestamp,
          });
        }
      }
      continue;
    }

    // An assistant message: its text/reasoning become one entry; its tool parts
    // become a tool_use entry, and each tool result a user entry.
    const blocks: NeutralAssistantBlock[] = [];
    for (const part of parts) {
      if (part.type === "text" && !part.synthetic && !part.ignored) {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "reasoning") {
        blocks.push({ type: "thinking", thinking: part.text });
      } else if (part.type === "tool") {
        blocks.push({
          type: "tool_use",
          id: part.callID,
          name: toolNameOf(part.tool),
          input: toolInputOf(part.state.input),
        });
        blocks.push(...codeModeCalls(part, false).map(({ use }) => use));
      }
    }
    if (blocks.length) {
      entries.push({
        type: "assistant",
        uuid: info.id,
        session_id: sessionKey,
        message: {
          role: "assistant",
          model: `${(info as AssistantMessage).providerID}/${(info as AssistantMessage).modelID}`,
          content: blocks,
        },
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp,
        // A compaction's summary: opencode's context restarts from here.
        ...((info as AssistantMessage).summary
          ? { compactSummary: true as const }
          : {}),
        ...(endsTurn(info as AssistantMessage)
          ? { turnEnd: true as const }
          : {}),
      });
    }
    for (const part of parts) {
      if (part.type !== "tool") {
        continue;
      }
      // A program's calls resolve as it ends, so they carry its end.
      const programEnd =
        part.state.status === "completed" || part.state.status === "error"
          ? new Date(part.state.time.end).toISOString()
          : timestamp;
      for (const { key, result } of codeModeCalls(part, false)) {
        if (result) {
          entries.push({
            type: "user",
            uuid: `${info.id}:${key}`,
            session_id: sessionKey,
            message: { role: "user", content: [result] },
            parent_tool_use_id: null,
            parent_agent_id: null,
            timestamp: programEnd,
          });
        }
      }
      if (part.state.status === "completed" || part.state.status === "error") {
        const output =
          part.state.status === "completed"
            ? part.state.output
            : part.state.error;
        const metadata =
          part.state.status === "completed" && part.tool !== CODE_MODE_TOOL
            ? (part.state as { metadata?: Record<string, unknown> }).metadata
            : undefined;
        const structuredContent =
          metadata && Object.keys(metadata).length > 0 ? metadata : undefined;
        entries.push({
          type: "user",
          uuid: `${info.id}:${part.id}`,
          session_id: sessionKey,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: part.callID,
                content:
                  part.state.status === "completed"
                    ? withImageAttachments(output, part.state.attachments)
                    : output,
                is_error: part.state.status === "error",
                ...(structuredContent ? { structuredContent } : {}),
                // Replay says what the live stream said: opencode keeps the
                // asked questions and the chosen answers on the part itself, so
                // a reopened transcript draws the answered card rather than
                // losing the exchange.
                ...(questionResultOf(part)
                  ? { questionResult: questionResultOf(part) }
                  : {}),
              },
            ],
          },
          parent_tool_use_id: null,
          parent_agent_id: null,
          timestamp: new Date(part.state.time.end).toISOString(),
        });
      }
    }
    // A turn that failed or was stopped keeps its error on the assistant
    // message opencode stored for it. Read back as the result frame the live
    // stream closed that turn with, a reload draws the same line instead of a
    // question that was never answered, and the turn reads as ended rather
    // than cut. An abort is the reader's own stop, not a failure.
    const failure = (info as AssistantMessage).error;
    if (failure) {
      const aborted = failure.name === "MessageAbortedError";
      entries.push({
        type: "system",
        uuid: `${info.id}:error`,
        session_id: sessionKey,
        message: {
          type: "result",
          uuid: `${info.id}:error`,
          session_id: sessionKey,
          ...(aborted
            ? { subtype: "aborted", is_error: false }
            : {
                subtype: "error_during_execution",
                is_error: true,
                errors: [errorText(failure)],
              }),
        },
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp,
      });
    }
  }
  return entries;
}

export const opencodeHarness: Harness = new OpencodeHarness();
