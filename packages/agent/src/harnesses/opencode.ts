/**
 * The OpenCode adapter, on OpenCode 2.0 (`@opencode/cli` and
 * `@opencode/client`, both pinned at 2.0.28).
 *
 * OpenCode is server-first: a headless `opencode serve` owns its sessions,
 * and the client is a typed Promise API over its HTTP surface and its one
 * event feed. This adapter keeps one server for the machine and one for each
 * CawCo account a session runs on, each under the session keeper (sessiond),
 * each on its own data dir and so its own database (settled #6), each with a
 * password of its own (settled #5). A session is addressed by the server's
 * session id; a spawn creates one, re-opens a stored id (`resume`), or forks
 * one (`resume.fork` / `resume.atMessage`). A session lives in one server's
 * database at a time: one that moves to another account's server is moved
 * there whole, by export and import (settled #7).
 *
 * Every server loads CawCo's v2 plugin (`opencode-plugin.ts`) and takes no
 * session in a location where it has not loaded it (the gate fails closed),
 * and no prompt before the location's MCP servers have connected.
 * One subscription per server generation carries every session's events
 * (`opencode-session.ts` turns them into frames).
 */

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type {
  FleetConfig,
  FleetItemState,
  FleetMcpConfig,
  FleetMcpServer,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessReport,
  ModelInfo,
  NeutralSessionInfo,
  SessionMessage,
  SlashCommand,
  SpawnPayload,
  WorkspaceRef,
} from "@cawco/core";
import {
  CONTROL_MODEL_CATALOG,
  CONTROL_SUPPORTED_COMMANDS,
  CUSTODY_HELD,
  IMAGE_GENERATION_TIMEOUT_MS,
  mcpFleetState,
} from "@cawco/core";
import type { RestartHold } from "@cawco/core/binary-updates";
import {
  credentialAccountIds,
  opencodeAccountHome,
  opencodeDatabases,
  opencodeDataDir,
  workspaceScratchDir,
  workspaceStateDir,
  xdgDataHome,
} from "@cawco/core/paths";
import type { ProcSpec } from "@cawco/core/sessiond";
import type {
  CredentialCreateInput,
  SessionInfo,
  SessionMessageInfo,
  V2Event,
} from "@opencode/client";
import { gitIn } from "../checkout-exclude";
import { harnessMcpUrl } from "../delegation";
import {
  type OpencodeRule,
  opencodeDenyRules,
  resolvedFleetDenials,
  sessionFleetDenials,
} from "../denied-tools";
import { GATE_FORM_ENV, gateForm } from "../gate-form";
import { sessionGitEnv } from "../git-credential";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
import {
  HarnessRecoveryRefused,
  ReattachFailed,
  SessionAddressRefused,
} from "../harness";
import { KeeperPool } from "../keepers";
import { isMachineAgent } from "../machine-agent";
import { gaugeTables } from "../memory";
import { OPENCODE_SERVER_PROC_ID, parseProcId } from "../proc-id";
import {
  type OpencodeOwnCredential,
  onAccountCredential,
  opencodeAccountEnv,
  opencodeCredentialOf,
  opencodeProviderOf,
  readHeld,
  setOpencodeAccountsHost,
} from "../provider-accounts";
import { readAccountSoon } from "../provider-usage";
import { fenced } from "../restart";
import type { SessiondClient } from "../sessiond-client";
import { listStandIns } from "../stand-ins";
import { resolveBin } from "../tools";
import { workspaceHolding, workspaceRefs } from "../workspace-records";
import { readJson, readSidecar, writeJson } from "./fleet-common";
import { OpencodeActivity } from "./opencode-activity";
import {
  assertPluginLoaded,
  at,
  errorText,
  MCP_CONNECT_TIMEOUT_MS,
  notFound,
  OPENCODE_BIN,
  OPENCODE_VERSION,
  type OpencodeClient,
  opencodeClient,
  unreachable,
  waitForMcp,
} from "./opencode-client";
import {
  buildPluginSource,
  CHROME_DEVTOOLS,
  OPENCODE_DIR,
  OPENCODE_PLACED_MCP,
  PLAN_AGENT_OFF,
  prunePlugins,
  retireV1Plugins,
  writePlugin,
} from "./opencode-plugin";
import {
  backupV1Database,
  isV1,
  launchOf,
  OpencodeServerOwner,
  readV1Activity,
  type ServerIdentity,
  type ServerLaunch,
} from "./opencode-server";
import {
  OpencodeSession,
  opencodeCatalog,
  RECOVERY_TIMEOUT_MS,
  splitModel,
  turnWasOpen,
} from "./opencode-session";
import { toTranscript } from "./opencode-transcript";

interface RecoveryRound {
  attempt: number;
  generations: Promise<ServerIdentity[]>;
  token: object;
}

interface RecoveryWave {
  pending: number;
  round?: RecoveryRound;
}

const OPENCODE_CONFIG = join(OPENCODE_DIR, "opencode.json");
const OPENCODE_SIDECAR = join(OPENCODE_DIR, "cawco-fleet.json");

/**
 * The static policy every server is launched with
 * (`OPENCODE_CONFIG_CONTENT`), in 2.0's native shape: ask before a shell
 * command or an edit (`write` and `patch` ask as `edit`), never run a `wf-*`
 * skill, and no built-in web fetch or search: fleet policy is the Firecrawl
 * and Exa MCP servers. 2.0 starts from allowing everything and the last rule
 * that matches decides (opencode.ai/v2/docs/permissions).
 */
const STATIC_POLICY = {
  permissions: [
    { action: "shell", resource: "*", effect: "ask" },
    { action: "edit", resource: "*", effect: "ask" },
    { action: "skill", resource: "wf-*", effect: "deny" },
    { action: "webfetch", resource: "*", effect: "deny" },
    { action: "websearch", resource: "*", effect: "deny" },
  ],
} as const;

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

/** The launch flag naming the plugin version a server loads. */
const PLUGIN_FLAG = "CAWCO_PLUGIN";
/** The launch flag naming the disk config a server read as it started. */
const CONFIG_FLAG = "CAWCO_CONFIG";

/**
 * How one server is launched: `opencode serve` under the keeper, with its
 * launch config, no self-update under a pinned fleet, and its sessions' git
 * reaching the hub's remote as each session (git-credential.ts). Its launch
 * flags name the gate form its plugin judges with ({@link gateForm}), the
 * plugin version it loads and the disk config it read: a server started on
 * other flags fails its launch check and is replaced at rest, its sessions
 * moving over as each comes to rest.
 */
const serverLaunch = (
  config: Record<string, unknown>,
  pluginDir: string,
  diskHash: string | null,
  env: Record<string, string> = {}
): ServerLaunch => ({
  spec: {
    command: resolveBin(OPENCODE_BIN) ?? OPENCODE_BIN,
    args: ["serve", "--hostname=127.0.0.1", "--port=0"],
    env: {
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      ...sessionGitEnv(),
      ...env,
    },
  },
  flags: {
    [GATE_FORM_ENV]: gateForm("opencode", buildPluginSource()),
    [PLUGIN_FLAG]: pluginDir,
    [CONFIG_FLAG]: `${diskHash ?? "none"}/${createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16)}`,
  },
});

/**
 * How long an account's OpenCode server runs on once no session is on it.
 * Ours: a session at rest is already kept attached for half an hour before it
 * sleeps, so the server is free only once its sessions slept, ended or moved
 * off the account; five more minutes cover a session woken or moved straight
 * back, and no longer is memory held for nobody.
 */
const ACCOUNT_SERVER_IDLE_MS = 5 * 60_000;

/**
 * How often the machine is read for CawCo's OpenCode servers that nothing
 * holds. Ours: one is left only when a keeper or a record is lost, which is
 * rare, and each read lists every process on the machine.
 */
const STRAY_SWEEP_MS = 5 * 60_000;

/**
 * An account's server data dir made ready to start in: its snapshot dir the
 * machine's, where OpenCode keeps each project's undo history, so a
 * session's undo follows it to any server it moves to (settled #7: a
 * modification reverts across servers only with one shared snapshot dir).
 * The account's credential as 1.x kept it there (`auth.json`, written by the
 * agent for 1.x's own sign-in code) is removed: 2.0 takes it through its API
 * ({@link OpencodeHarness.#putCredential}), and a database 2.0 makes new
 * never reads that file. A 1.x account server kept no database here; it
 * used the machine's.
 */
const prepareAccountServer = async (account: string): Promise<void> => {
  const snapshots = join(opencodeDataDir(), "snapshot");
  await mkdir(snapshots, { recursive: true });
  const dir = join(opencodeAccountHome(account), "opencode");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await rm(join(dir, "auth.json"), { force: true });
  const link = join(dir, "snapshot");
  const found = await lstat(link).catch(() => undefined);
  if (!found?.isSymbolicLink()) {
    await rm(link, { recursive: true, force: true });
    await symlink(snapshots, link);
  }
};

/** The hub's MCP server as 2.0 configures a remote server (`mcp.servers.<name>`). */
const cawcoMcp = () => ({
  type: "remote" as const,
  url: harnessMcpUrl("/mcp/cawco"),
  oauth: false as const,
  timeout: { execution: IMAGE_GENERATION_TIMEOUT_MS + 60_000 },
});

/**
 * How long the announce line may take to reach the keeper's ring. Ours: the
 * child boots through the keeper, on a cold machine maybe, and a false
 * timeout here starts a second server.
 */
export const SERVER_ANNOUNCE_TIMEOUT_MS = 30_000;

/**
 * How long a fleet report waits for the machine's server to run the config
 * just written: a candidate's announce ({@link SERVER_ANNOUNCE_TIMEOUT_MS}),
 * its plugin's load (30 s, `PLUGIN_LOAD_TIMEOUT_MS`) and its verification.
 * Ours, with margin.
 */
const CONFIG_SETTLE_TIMEOUT_MS = 90_000;

/**
 * How long one session's reattach goes on trying a server it cannot reach
 * (a refused connection, a timeout: a generation restarting) before it is
 * that session's failure. Our call: a server restart takes seconds, and two
 * minutes outlasts it many times over. Never forever: a reattach that never
 * ends holds that session, and once held a whole machine's custody.
 */
const RECOVERY_RETRY_BUDGET_MS = 120_000;

/** The generations a recovery round asked, as a custody line names them. */
const generationsAsked = async (round: RecoveryRound): Promise<string> => {
  const asked = await round.generations.catch(() => [] as ServerIdentity[]);
  return asked.length > 0 ? asked.map(generationName).join(", ") : "none live";
};

/** One server generation, as a custody line names it. */
const generationName = (identity: ServerIdentity): string =>
  `${identity.procId}/${identity.pid} at ${identity.url}`;

/** How long before a directory's deferred release is tried again. Ours: a held turn or a recovery is over in minutes, not seconds. */
const DIRECTORY_RELEASE_RETRY_MS = 30_000;

/**
 * Deterministic JSON: object keys sorted at every level, so logically
 * identical configs always hash the same whatever the key order.
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
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * The fingerprint of the machine's `opencode.json` as a server reads it at
 * start: the whole document, canonical, and the static policy. A server
 * reads its global config only when it starts, so a change needs a new one.
 */
const configHash = (config: Record<string, unknown>): string =>
  createHash("sha256")
    .update(canonicalizeJson({ config, _policy: STATIC_POLICY }))
    .digest("hex");

/**
 * Every write of the machine's opencode.json goes through here and says who
 * wrote it, so a hash change the watcher reports can be matched to its writer.
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

/**
 * Every server call keyed by a caller-supplied session key is guarded here, so
 * a CawCo instance id handed over as a key is refused, loudly, and never sent:
 * two sessions once went unrevivable because the hub resumed them under their
 * instance uuids.
 */
const assertOpencodeKey = (key: string, what: string): void => {
  if (!OPENCODE_SESSION_ID.test(key)) {
    throw new Error(
      `${what}: "${key}" is not an opencode session id (they start with "ses_") — this looks like a cawco instance id`
    );
  }
};

/** What `opencode --version` says, as a version: 2.0.28 prints `opencode v2.0.28`. */
const VERSION = /\d+\.\d+\.\d+\S*/;
const versionOf = (said: string): string | undefined => VERSION.exec(said)?.[0];

/**
 * The port announcement, parsed agent-side: sessiond hands back the child's
 * stdout lines opaque. 2.0.28 prints `server listening on
 * http://127.0.0.1:<port>` on stdout (settled #5), once, at boot.
 */
const SERVER_ANNOUNCEMENT_URL_PATTERN = /on\s+(https?:\/\/[^\s]+)/;

export const parseServerAnnouncement = (line: string): string | undefined =>
  line.startsWith("server listening")
    ? line.match(SERVER_ANNOUNCEMENT_URL_PATTERN)?.[1]
    : undefined;

interface OpencodeServerAttach {
  procId: string;
  sessiond: SessiondClient;
  signal?: AbortSignal;
  spec: ProcSpec;
  timeoutMs?: number;
}

const pendingServerAttachments = new WeakMap<
  SessiondClient,
  Map<string, Promise<string>>
>();

/**
 * Puts `opencode serve` under sessiond and returns the URL it announced. One
 * listener per client/procId: concurrent callers share its whole spawn and
 * replay.
 */
const attachOpencodeServer = (
  options: OpencodeServerAttach
): Promise<string> => {
  let pending = pendingServerAttachments.get(options.sessiond);
  if (!pending) {
    pending = new Map();
    pendingServerAttachments.set(options.sessiond, pending);
  }
  const existing = pending.get(options.procId);
  if (existing) {
    return existing;
  }
  const attached = announceOpencodeServer(options).finally(() =>
    pending.delete(options.procId)
  );
  pending.set(options.procId, attached);
  return attached;
};

const announceOpencodeServer = async (
  options: OpencodeServerAttach
): Promise<string> => {
  const { procId } = options;
  const timeoutMs = options.timeoutMs ?? SERVER_ANNOUNCE_TIMEOUT_MS;
  const client = options.sessiond;
  options.signal?.throwIfAborted();
  // Fresh, not the connect-time welcome: this client is long-lived.
  const held = (await client.list()).procs.find(
    (proc) => proc.procId === procId
  );
  options.signal?.throwIfAborted();
  if (!held?.alive) {
    await client.spawnProc(procId, options.spec);
  }
  return await new Promise<string>((resolve, reject) => {
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
              `[opencode] no "server listening" line from ${procId} within ${timeoutMs}ms`
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
    // agent reads it out of the replay ring long after it was written.
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
        // The ring outran the announce line: the URL is unrecoverable from here.
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
};

/** A fleet MCP definition, in 2.0's `mcp.servers.<name>` shape. */
const toOpencodeMcp = (config: FleetMcpConfig): Record<string, unknown> =>
  "url" in config
    ? {
        type: "remote",
        url: config.url,
        oauth: false,
        ...(config.headers ? { headers: config.headers } : {}),
      }
    : {
        type: "local",
        command: [config.command, ...(config.args ?? [])],
        ...(config.env ? { environment: config.env } : {}),
      };

const recordOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

/**
 * The fleet's servers merged into `opencode.json`'s `mcp.servers`, every
 * other key kept. A managed name 1.x's flat `mcp.<name>` held goes from
 * there: 2.0 reads both, and each server is named once. CawCo's own server is
 * every server's by its launch config, never the file's.
 */
const syncOpencodeMcp = async (
  desired: { name: string; config: FleetMcpConfig; enabled: boolean }[],
  managed: string[],
  report: Record<string, FleetItemState>
): Promise<string[]> => {
  const wanted = desired.filter((server) => server.enabled);
  const stored =
    (await readJson<Record<string, unknown>>(OPENCODE_CONFIG)) ?? {};
  const mcp = recordOf(stored.mcp);
  const servers = recordOf(mcp.servers);
  for (const name of ["cawco", ...managed, ...wanted.map((one) => one.name)]) {
    delete mcp[name];
  }
  for (const server of wanted) {
    servers[server.name] = toOpencodeMcp(server.config);
  }
  const names = wanted.map((server) => server.name);
  for (const name of managed) {
    if (names.includes(name)) {
      continue;
    }
    delete servers[name];
    report[name] = { state: "removed" };
  }
  const { cawco: _cawco, ...fleet } = servers;
  await writeOpencodeConfig("fleet sync", {
    ...stored,
    mcp: { ...mcp, servers: fleet },
  });
  return names;
};

type PlacedMcp = Record<string, { cwd: string; name: string; entry: unknown }>;

/**
 * A project's MCP servers at each of its places on this machine
 * (`FleetConfig.placedMcp`), for OpenCode: {@link OPENCODE_PLACED_MCP}
 * rewritten whole, which the plugin hands each location as it boots. Answers
 * each copy's state under `<name>@<place id>`, a copy no longer carried as
 * removed. A hub that predates placement sends no list, and the file is left.
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

/**
 * OpenCode's `plan` agent under the fleet's "CawCo's to-dos" choice: on,
 * `agents.plan.disabled` (2.0's agent config); off, taken back only when
 * CawCo set it. 1.x's `agent.plan.disable` goes, as 2.0 reads that key too.
 * Answers whether CawCo holds the setting now, for the sidecar.
 */
const syncPlanAgent = async (
  todosOn: boolean,
  ours: boolean
): Promise<boolean> => {
  const stored =
    (await readJson<Record<string, unknown>>(OPENCODE_CONFIG)) ?? {};
  const legacy = recordOf(stored.agent);
  const { plan: legacyPlan, ...legacyRest } = legacy;
  const agents = recordOf(stored.agents);
  const { disabled, ...planRest } = recordOf(agents.plan);
  const holds = disabled === true;
  if (legacyPlan === undefined && (todosOn ? holds : !(ours && holds))) {
    return todosOn && ours;
  }
  const plan = todosOn ? { ...planRest, disabled: true } : planRest;
  const { plan: _plan, ...otherAgents } = agents;
  const nextAgents =
    Object.keys(plan).length > 0 ? { ...otherAgents, plan } : otherAgents;
  const { agent: _agent, agents: _agents, ...rest } = stored;
  await writeOpencodeConfig("fleet sync", {
    ...rest,
    ...(Object.keys(legacyRest).length > 0 ? { agent: legacyRest } : {}),
    ...(Object.keys(nextAgents).length > 0 ? { agents: nextAgents } : {}),
  });
  return todosOn;
};

/**
 * OpenCode's `plan` agent for one session whose own delegate type turns
 * "CawCo's to-dos" on while the fleet's choice is off: a
 * {@link PLAN_AGENT_OFF} mark in its workspace's state dir, which the plugin
 * reads as the clone's location boots and turns into the agent's removal
 * there. Nothing is written into the clone. A session outside every clone is
 * said in the log and left as it is.
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
 * workspace's clone, exactly as `writeJson` wrote it: `agent.plan.disable`,
 * an `mcp` holding the fleet's chrome-devtools entry with the scratch as a
 * filesystem root, or the empty `mcp` left once the fleet dropped that
 * server, alone or together, in the order the writes came.
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
    await listStandIns(ref, process.platform === "linux");
  }
  return gone.length;
};

/**
 * At the agent's start: the `opencode.jsonc` files CawCo once wrote into
 * workspace clones, each removed with its `info/exclude` line only when it is
 * byte for byte what CawCo's writer made for that workspace and untracked;
 * every other file is left as it is. Says how many it removed.
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
  tasks: false,
  compaction: true,
  costUsd: true,
  thinking: true,
  images: true,
  handoff: true,
  hooks: false,
  plugins: true,
  fleet: true,
};

/** The scratch tag sidecar — OpenCode sessions have no tag, so CawCo keeps its own. */
const TAGS_PATH = join(OPENCODE_DIR, "cawco-tags.json");

const readTags = async (): Promise<Record<string, string>> =>
  (await readJson<Record<string, string>>(TAGS_PATH)) ?? {};

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
  await writeJson(TAGS_PATH, tags);
};

/**
 * Which server's database each OpenCode session is in, by session id: the
 * account whose server holds it, or `""` for the machine's. A session is in
 * one database at a time, and moves with export and import (settled #7). A
 * session this file does not name is in the machine's: every session 1.x
 * stored was in the machine's database, which 2.0 converted in place.
 */
const SESSION_HOMES = join(OPENCODE_DIR, "cawco-session-homes.json");

/** A root session as its server's database keeps it (2.0's `session_v2` row). */
interface StoredSession {
  directory: string;
  id: string;
  time_created: number;
  time_updated: number;
  title: string | null;
}

/**
 * The root sessions in one OpenCode database, read-only, as the session list
 * reads them: every server's database is read in place, so listing never
 * starts a server (an account's that is not running stays stopped). `query`
 * narrows them to one directory, or names one session, root or not.
 */
const storedSessions = (
  dbPath: string,
  query: { directory?: string; id?: string }
): StoredSession[] => {
  const db = new Database(dbPath, { readonly: true });
  try {
    // A database 2.0 is still making (an account server's first start) has
    // no sessions table yet, and so no session.
    if (
      !db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'"
        )
        .get()
    ) {
      return [];
    }
    return db
      .query<StoredSession, [string | null, string | null]>(
        `SELECT id, title, directory, time_created, time_updated FROM session_v2
         WHERE (CASE WHEN ?2 IS NULL THEN parent_id IS NULL ELSE id = ?2 END)
           AND (?1 IS NULL OR directory = ?1)`
      )
      .all(query.directory ?? null, query.id ?? null);
  } finally {
    db.close();
  }
};

/** Every database's sessions `query` names, each once (a session a move left half-way is in two). */
/**
 * One read of an OpenCode 1.x server ({@link readV1Activity}), said through
 * `say`: false while it is out of reach or runs something, true when it will
 * not say (decided by proof, {@link OpencodeHarness.#v1Idle}), undefined
 * when it runs nothing.
 */
const v1Decision = async (
  identity: ServerIdentity,
  say: (line: string) => void
): Promise<boolean | undefined> => {
  const read = await readV1Activity(identity);
  if (read.kind === "unreachable") {
    say(`out of reach (${read.reason}); read again later`);
    return false;
  }
  if (read.kind === "refused") {
    say(
      `will not say what it runs (${read.reason}); no session of this agent is on it, so it is ended`
    );
    return true;
  }
  if (read.running.length > 0) {
    say(
      `runs ${read.running.join(", ")}; ended once that is done, and no OpenCode 2.0 server starts before`
    );
    return false;
  }
  return undefined;
};

const sessionsOnMachine = (query: {
  directory?: string;
  id?: string;
}): StoredSession[] => {
  const seen = new Map<string, StoredSession>();
  for (const dbPath of opencodeDatabases()) {
    for (const session of storedSessions(dbPath, query)) {
      if (!seen.has(session.id)) {
        seen.set(session.id, session);
      }
    }
  }
  return [...seen.values()];
};

const sessionToInfo = (
  session: StoredSession,
  tag?: string
): NeutralSessionInfo => ({
  sessionId: session.id,
  harness: "opencode",
  ...(session.title ? { customTitle: session.title } : {}),
  lastModified: session.time_updated,
  createdAt: session.time_created,
  cwd: session.directory,
  ...(tag ? { tag } : {}),
});

/** Every page of a server's sessions, root sessions only, filtered as `query` says. */
const allSessions = async (
  client: OpencodeClient,
  query: { directory?: string; parentID?: string }
): Promise<SessionInfo[]> => {
  const sessions: SessionInfo[] = [];
  let cursor: string | undefined;
  do {
    // biome-ignore lint/performance/noAwaitInLoops: each page names the next
    const page = await client.session.list(
      {
        limit: 200,
        parentID: query.parentID ?? "null",
        ...(query.directory ? { directory: query.directory } : {}),
        ...(cursor ? { cursor } : {}),
      },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    sessions.push(...page.data);
    cursor = page.cursor.next ?? undefined;
  } while (cursor);
  return sessions;
};

/** Every projected message of a session, oldest first. */
const allMessages = async (
  client: OpencodeClient,
  sessionID: string
): Promise<SessionMessageInfo[]> => {
  const messages: SessionMessageInfo[] = [];
  let cursor: string | undefined;
  do {
    // biome-ignore lint/performance/noAwaitInLoops: each page names the next
    const page = await client.message.list(
      {
        sessionID,
        order: "asc",
        limit: 200,
        ...(cursor ? { cursor } : {}),
      },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    messages.push(...page.data);
    cursor = page.cursor.next ?? undefined;
  } while (cursor);
  return messages;
};

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

/** The id CawCo puts an account's credential on its server under: its own, named for its value. */
const CREDENTIAL_PREFIX = "cred_cawco_";

export class OpencodeHarness implements Harness {
  readonly kind = "opencode" as const;
  /** Its catalog is the server's: {@link listSessions} starts one. */
  readonly catalogFromServer = true as const;
  readonly capabilities = OPENCODE_CAPABILITIES;
  auth: import("@cawco/core").AuthState = "authenticated";

  /** The machine's keepers as OpenCode's servers reach them. */
  readonly #keepers = new KeeperPool();
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
  /** The 1.x servers ended and the 1.x database kept, once, before the first 2.0 server starts. */
  #cutover: Promise<void> | null = null;

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
      (epoch) => this.#keepers.byEpoch(epoch),
      (sessiond, procId, spec, signal) =>
        attachOpencodeServer({ sessiond, procId, spec, signal }),
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

  /** Every recorded 2.0 generation of every server, the machine's and each account's. */
  #generations(): ServerIdentity[] {
    return this.#slots()
      .flatMap((slot) => slot.owner.generations)
      .filter((generation) => !isV1(generation));
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
    )
      .flat()
      .filter((generation) => !isV1(generation));
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
  // Keyed by instanceId, not OpenCode's own session id: a resume reuses the
  // same session key, so several live instances can share one OpenCode
  // session id. Event routing, which only has OpenCode's id off the wire,
  // goes through {@link OpencodeHarness.#sessionForSid}.
  readonly #sessions = new Map<string, OpencodeSession>();
  readonly #children = new Map<
    string,
    { parent: OpencodeSession; callID: string; identity: ServerIdentity }
  >();
  #disposed = false;
  /**
   * The one subscription loop each server generation has, by the controller
   * that ends it. A loop runs only while it is the one on record here:
   * stopping it ends the loop rather than reconnecting beside its
   * replacement, so no event of a generation arrives twice.
   */
  readonly #pumps = new Map<string, AbortController>();
  readonly #pumpReady = new Map<string, Promise<void>>();
  /** Generations whose subscription is up right now. */
  readonly #pumpConnected = new Set<string>();
  #recovering = 0;
  #recoveryHighWater = 0;
  readonly #recoveryWaiters: (() => void)[] = [];
  readonly #reconcileJobs = new Map<OpencodeSession, Promise<void>>();
  readonly #reconcileAgain = new Set<OpencodeSession>();
  /** Session moves between servers in flight, by OpenCode session id: one at a time each. */
  readonly #moves = new Map<string, Promise<void>>();

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
    // A credential the agent wrote reaches the account's running server now
    // (2.0 applies a switch from the next request, settled #8).
    onAccountCredential((account) => {
      const slot = this.#accounts.get(account);
      if (!slot?.client) {
        return;
      }
      this.#putCredential(account, slot.client).catch((error: unknown) =>
        console.warn(
          `[opencode] account ${account}: its credential did not reach its server: ${errorText(error)}`
        )
      );
    });
    setOpencodeAccountsHost({
      carryOut: (account) => this.#carryOut(account),
      ownCredentials: () => this.#ownCredentials(),
      removeOwnCredential: async (id) => {
        await (await this.#ensure()).credential.remove(
          { credentialID: id },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        );
      },
    });
  }

  /**
   * OpenCode's own sign-ins on this machine: the credential each provider
   * uses on the machine's server (`GET /api/credential`, its active one per
   * integration). CawCo's own (`cred_cawco_…`) are on account servers only,
   * and never listed.
   */
  async #ownCredentials(): Promise<OpencodeOwnCredential[]> {
    const stored = await (await this.#ensure()).credential.list({
      signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
    });
    return stored.flatMap((entry) =>
      entry.active &&
      entry.integrationID &&
      !entry.id.startsWith(CREDENTIAL_PREFIX)
        ? [
            {
              id: entry.id,
              integrationID: entry.integrationID,
              value: entry.value as Record<string, unknown>,
            },
          ]
        : []
    );
  }

  /**
   * Before an account goes from this machine: every root session in its
   * server's database moved to the machine's server with its subagent
   * sessions ({@link #bringHome}), whatever the homes record says, then the
   * account's server ended. A session running there, or a move or an end
   * that fails, throws, and the account stays as it is.
   */
  async #carryOut(account: string): Promise<void> {
    const client = await this.#ensureAccount(account);
    const roots = await allSessions(client, {});
    for (const root of roots) {
      // biome-ignore lint/performance/noAwaitInLoops: one move at a time; each exports, imports and removes in order
      await this.#setHome([root.id], account);
      await this.#bringHome(root.id, undefined);
    }
    const slot = this.#accountSlot(account);
    slot.client = null;
    slot.ready = null;
    slot.applied = null;
    await slot.owner.endAll();
    console.info(
      `[opencode] account ${account}: ${roots.length} session(s) carried to the machine's server, and its server ended, before the account goes`
    );
  }

  // ---------------------------------------------------- config convergence

  /**
   * State of the config convergence subsystem: the desired and applied
   * hashes of the machine's opencode.json and versions of the binary; only
   * the latest desired revision matters.
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
   * Whether the server reads the OpenCode config this agent writes, in the
   * server's own words: `GET /api/config` names each config dir it loaded
   * (`{type: "directory", path}`).
   */
  async #readsThisConfig(client: OpencodeClient): Promise<boolean> {
    const sources = (await client.config.get(
      {},
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    )) as unknown as { type?: string; path?: string }[];
    const dirs = sources
      .filter((source) => source.type === "directory")
      .map((source) => source.path);
    if (dirs.includes(OPENCODE_DIR)) {
      return true;
    }
    console.log(
      JSON.stringify({
        type: "config-convergence",
        state: "idle",
        detail: `server reads ${dirs.join(", ") || "no config dir"}, this agent writes ${OPENCODE_DIR}; not converging it`,
        at: Date.now(),
      })
    );
    return false;
  }

  /** Lock held while a config change is applied: spawns queue behind it. */
  #applyGate: { promise: Promise<void>; resolve: () => void } | null = null;
  readonly #pendingSpawns: {
    resolve: (session: HarnessSession) => void;
    reject: (error: Error) => void;
    spec: SpawnPayload;
    ctx: HarnessContext;
  }[] = [];

  /**
   * {@link configHash} of opencode.json as it is on disk now, with the
   * project servers placed for OpenCode. Null when opencode.json is missing
   * or malformed.
   */
  async #hashConfig(): Promise<string | null> {
    const config = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
    if (!config) {
      return null;
    }
    // The placed servers too: a location takes them only as it boots.
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
        const binary = resolveBin(OPENCODE_BIN);
        if (!binary) {
          throw new Error(
            `${OPENCODE_BIN} not found: CawCo runs OpenCode ${OPENCODE_VERSION} (npm install -g @opencode/cli@${OPENCODE_VERSION})`
          );
        }
        const ran = await Bun.$`${binary} --version`.quiet().nothrow();
        const version = versionOf(ran.stdout.toString());
        if (ran.exitCode !== 0 || !version) {
          throw new Error(
            `opencode version probe failed: ${ran.stdout.toString()}${ran.stderr.toString()}`
          );
        }
        // The server API and the plugin are 2.0.28's: no other release starts.
        if (version !== OPENCODE_VERSION) {
          throw new Error(
            `${binary} is OpenCode ${version}; CawCo runs OpenCode ${OPENCODE_VERSION} (npm install -g @opencode/cli@${OPENCODE_VERSION})`
          );
        }
        return version;
      })();
    }
    return this.#versionProbe;
  }

  /** Watch config every 2s and the installed binary every 30s. */
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

  /** One tick of the config watcher: compare desired with applied, and apply. */
  async #configTick(): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method
    if (!this.#converging) {
      return;
    }
    const hash = await this.#hashConfig();
    const version = await this.#installedVersion();
    for (const slot of this.#slots()) {
      slot.owner.maintain();
    }
    await this.#leaveUnkept();
    if (Date.now() >= this.#straysSweptAt + STRAY_SWEEP_MS) {
      this.#straysSweptAt = Date.now();
      await this.#adoptStrays();
    }
    await this.#retireIdleAccounts();
    await this.#prunePlugins();
    // A keeper handover left the machine's server on the keeper before it:
    // it is replaced at rest as one on another config is.
    if (
      this.#appliedHash !== null &&
      !this.#applyGate &&
      (await this.#serverOwner.onRetiringKeeper())
    ) {
      console.info(
        `[opencode] the machine's server ${this.#serverOwner.active?.procId} runs on a retiring session keeper; a server on the current one takes its sessions as each comes to rest`
      );
      this.#appliedHash = null;
      this.#appliedVersion = null;
      this.#configState = "pending";
    }
    const versionChanged = version !== this.#desiredVersion;
    this.#desiredVersion = version;
    if (hash === null) {
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
      if (!this.#applyGate) {
        this.#configState = "applied";
        this.#configError = null;
        await this.#convergeAccounts();
      }
      return;
    }
    if (hash === this.#desiredHash && !versionChanged) {
      if (this.#configState === "pending" || this.#configState === "error") {
        // biome-ignore lint/complexity/noVoid: fire-and-forget; the attempt manages its own errors
        void this.#attemptConfigApply();
      }
      return;
    }
    this.#desiredHash = hash;
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
   * A server in use whose active generation no keeper holds any more takes no
   * new session: its slot's client is dropped and the server ensured again,
   * which retires that generation and starts one on the current keeper. Its
   * sessions keep their own clients and turns; each moves over at rest.
   */
  async #leaveUnkept(): Promise<void> {
    for (const slot of this.#slots()) {
      if (
        !(
          slot.client &&
          // biome-ignore lint/performance/noAwaitInLoops: one slot at a time; each read asks the keepers
          (await slot.owner.activeKeeperGone().catch(() => false))
        )
      ) {
        continue;
      }
      const gone = slot.owner.active;
      console.info(
        `[opencode] ${slot.account ? `account ${slot.account}'s` : "the machine's"} server ${gone?.procId}/${gone?.pid}: no keeper holds it; a server on the current keeper takes its new sessions`
      );
      slot.client = null;
      slot.ready = null;
      await (slot.account === undefined
        ? this.#ensure()
        : this.#ensureAccount(slot.account));
    }
  }

  /** When the machine was last read for CawCo servers nothing holds ({@link #adoptStrays}). */
  #straysSweptAt = 0;

  /** The servers this agent started that no keeper of it holds and no record names, taken in to be retired. */
  async #adoptStrays(): Promise<void> {
    await this.#serverOwner
      .adoptStrays(
        cawcoMcp().url,
        async () =>
          new Set(
            (await this.#keepers.held())
              .filter((proc) => proc.alive)
              .map((proc) => proc.pid)
          )
      )
      .catch((error: unknown) =>
        console.warn(`[opencode] stray server sweep: ${errorText(error)}`)
      );
  }

  /** Every plugin version no recorded generation was launched on, gone. */
  async #prunePlugins(): Promise<void> {
    if (!this.#pluginDir) {
      return;
    }
    const kept = new Set([this.#pluginDir]);
    for (const slot of this.#slots()) {
      for (const generation of slot.owner.generations) {
        try {
          const flags = JSON.parse(generation.launch ?? "[]") as [
            string,
            string,
          ][];
          const dir = flags.find(([name]) => name === PLUGIN_FLAG)?.[1];
          if (dir) {
            kept.add(dir);
          }
        } catch {
          // A launch that cannot be read names no plugin to keep.
        }
      }
    }
    await prunePlugins(kept);
  }

  /** An account's server no session has been on for {@link ACCOUNT_SERVER_IDLE_MS} is retired. */
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

  /** How the account's server is launched: the machine's launch, on the account's data dir and provider settings. */
  async #accountLaunch(account: string): Promise<ServerLaunch> {
    return serverLaunch(
      await this.#launchConfig(),
      await this.#plugin(),
      this.#desiredHash,
      {
        ...opencodeAccountEnv(account),
        XDG_DATA_HOME: opencodeAccountHome(account),
      }
    );
  }

  /** What an account's running server must have been verified on: the machine's binary, and its own launch. */
  async #accountRevision(account: string): Promise<{
    revision: string;
    launch: ServerLaunch;
  }> {
    const launch = await this.#accountLaunch(account);
    return {
      launch,
      revision: `${this.#desiredVersion}/${launchOf(launch)}`,
    };
  }

  /** Every running account's server squared with the machine's config and binary, once the machine's own is. */
  async #convergeAccounts(): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #accountApplying is held across this method's awaits
    if (this.#accountApplying || this.#applyGate || fenced()) {
      return;
    }
    this.#accountApplying = true;
    try {
      for (const slot of this.#accounts.values()) {
        const { account } = slot;
        if (slot.starting || !(account && slot.owner.active && slot.client)) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: one server is replaced at a time
        const { revision, launch } = await this.#accountRevision(account);
        if (
          slot.starting ||
          (slot.applied === revision && !(await slot.owner.onRetiringKeeper()))
        ) {
          continue;
        }
        try {
          await this.#replaceAccount(slot, launch, revision);
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
   * to rest. Both generations run on the account's one database (a second
   * server on it leaves the first one's running turn to finish, observed on
   * 2.0.28).
   */
  async #replaceAccount(
    slot: ServerSlot,
    launch: ServerLaunch,
    revision: string
  ): Promise<void> {
    const { account } = slot;
    if (account === undefined) {
      throw new Error("The machine's server is replaced by its own apply.");
    }
    await prepareAccountServer(account);
    await slot.owner.replace(
      launch,
      async (identity, signal) => {
        const candidate = this.#clientForGeneration(identity);
        await this.#verifyApply(
          candidate,
          identity,
          this.#desiredVersion,
          signal,
          launch
        );
        await this.#putCredential(account, candidate);
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
      activity = new OpencodeActivity(key);
      this.#activities.set(key, activity);
    }
    return activity;
  }

  #clientForGeneration(identity: ServerIdentity): OpencodeClient {
    let client = this.#generationClients.get(identity.procId);
    if (!client) {
      if (isV1(identity) || identity.password === undefined) {
        throw new Error(
          `OpenCode generation ${identity.procId} is a 1.x server: 2.0's client cannot reach it.`
        );
      }
      client = opencodeClient({
        url: identity.url,
        password: identity.password,
      });
      this.#generationClients.set(identity.procId, client);
    }
    return client;
  }

  /**
   * The session handed to the active generation of its own server, once it
   * is at rest there. A config change makes a new generation of the same
   * server, on the same database: the session is already there.
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
      const idleOn = async (): Promise<boolean> =>
        (await this.#activity(old).sessionState(oldClient, sessionId)).kind ===
          "decided" && this.#activity(old).state(sessionId) === "idle";
      if (!(await idleOn())) {
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
      // Both generations read one database: the newest message each sees is
      // the same, or the candidate has not caught up with the incumbent.
      const histories = await Promise.all(
        [oldClient, client].map((reader) =>
          reader.message.list(
            { sessionID: sessionId, order: "desc", limit: 1 },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        )
      );
      const settled = histories.map((history) => {
        const [last] = history.data;
        return last ? `${last.id}/${last.type}` : "empty";
      });
      if (settled[0] !== settled[1]) {
        throw new Error(
          "OpenCode candidate has not observed the incumbent's settled turn history."
        );
      }
      if (!(await idleOn())) {
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
      this.#activity(target).bind(sessionId, session.instanceId);
      session.rebindClient(client);
      console.info(
        `[opencode] handoff ${session.instanceId}: ${old.procId}/${old.pid} → ${target.procId}/${target.pid}`
      );
      await this.#ensurePump(target);
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
    this.#activity(identity).observeBusy(session.sessionId);
  }

  async #handoffIdle(): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set by dispose()
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
      this.#moves.size > 0 ||
      this.#pendingRecoveries.size > 0 ||
      this.#recovering > 0 ||
      this.#recoveryWaiters.length > 0
    );
  }

  /**
   * What an agent restart would cut of this adapter's work: the operations it
   * runs against a server from this process, the starts queued behind a
   * config apply, and the sends it holds that the server has not admitted.
   * The server's own turns are not on it: the server runs under the keeper,
   * and the next agent reads them back.
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
          ...[...this.#moves.keys()].map((id) => `move:${id}`),
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

  /** The sessions any generation is running, and whether anything is unknown. */
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
    identity: ServerIdentity | undefined
  ): Promise<boolean> {
    if (!identity) {
      return true;
    }
    const observed = await this.#activity(identity).sessionState(
      this.#clientForGeneration(identity),
      sessionId
    );
    return observed.kind !== "decided" || observed.state !== "idle";
  }

  /** Two complete reads of this exact generation, with a real sampling gap. */
  async #generationIdle(identity: ServerIdentity): Promise<boolean> {
    if (isV1(identity)) {
      return await this.#v1Idle(identity);
    }
    if (this.#operationsPending()) {
      return false;
    }
    const activity = this.#activity(identity);
    const client = this.#clientForGeneration(identity);
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
      second.sampledAt >= first.sampledAt + 2000 &&
      !this.#operationsPending()
    );
  }

  /** What each 1.x server was last seen running, so a wait on one is said once per change. */
  readonly #v1Seen = new Map<string, string>();

  /**
   * Whether an OpenCode 1.x server runs nothing: two reads by its own API
   * ({@link readV1Activity}), with a real gap, both of no running session.
   * One out of reach is not decided now (its process gone, its record goes).
   * One that answers but will not say (an HTTP error, a password it was not
   * launched with in its environment) is decided by what holds anyway: no
   * session of this agent is on it — a 2.0 agent attaches none to a 1.x
   * server, and no 1.x generation is one any session reattaches to — so no
   * turn the hub is owed from here runs there. A turn left there would come
   * back to the hub, when its session is next opened on 2.0, as cut with its
   * server, to be taken up again.
   */
  async #v1Idle(identity: ServerIdentity): Promise<boolean> {
    const name = `${identity.procId}/${identity.pid}`;
    const say = (line: string): void => {
      if (this.#v1Seen.get(name) !== line) {
        this.#v1Seen.set(name, line);
        console.info(`[opencode] 1.x server ${name}: ${line}`);
      }
    };
    const first = await v1Decision(identity, say);
    if (first !== undefined) {
      return first;
    }
    await Bun.sleep(2000);
    const second = await v1Decision(identity, say);
    if (second !== undefined) {
      return second;
    }
    say("runs nothing; ended");
    return true;
  }

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

  /**
   * Prepare and publish a verified candidate while incumbent turns keep
   * running. New turns use the active generation; existing turns keep their
   * client and subscription until idle handoff, and only then may the owner
   * retire their generation. A server reads its global config only as it
   * starts, so a new one is the only way to apply a change.
   */
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
      // servers to sort out: it waits, and the watcher tries again.
      this.#configState = "pending";
      return;
    }
    this.#checkingPublication = true;
    try {
      const preCheck = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
      if (!preCheck) {
        this.#configState = "error";
        this.#configError = "malformed config — will not stop working server";
        return;
      }
      if (!this.#serverOwner.active) {
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
      if ((await this.#hashConfig()) !== targetHash) {
        this.#desiredHash = await this.#hashConfig();
        this.#configState = "pending";
        return;
      }
      const launch = serverLaunch(
        await this.#launchConfig(),
        await this.#plugin(),
        targetHash
      );
      await this.#serverOwner.replace(
        launch,
        async (identity, signal) => {
          const candidate = this.#clientForGeneration(identity);
          if (!(await this.#readsThisConfig(candidate))) {
            throw new Error("Candidate reads another global config root.");
          }
          await this.#verifyApply(
            candidate,
            identity,
            targetVersion,
            signal,
            launch,
            targetHash
          );
        },
        (identity) => {
          const client = this.#adopt(this.#machine, identity);
          this.#ready = Promise.resolve(client);
          this.#verifiedProcId = identity.procId;
          this.#appliedHash = targetHash;
          this.#appliedVersion = targetVersion;
          this.#configError = null;
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
      }
    } catch (error) {
      this.#configState = "error";
      this.#configError = String(error);
      this.#retryConfigAt = Date.now() + 5000;
      console.error(
        `[opencode] config convergence: apply failed: ${String(error)}`
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

  /** Drain queued spawn requests that accumulated while the config gate was held. */
  #drainPendingSpawns(): void {
    const pending = this.#pendingSpawns.splice(0);
    for (const { resolve, reject, spec, ctx } of pending) {
      this.spawn(spec, ctx).then(resolve, reject);
    }
  }

  /**
   * Whether a generation runs what this agent launches now: the launch it was
   * started on (its flags name the plugin version, the gate form, the launch
   * config and the disk config it read as it started), the installed binary
   * (`GET /api/info`), and, for the machine's, a disk config no one changed
   * since. A generation started without these (an older agent's, or one on
   * another credential's provider settings) is restarted.
   */
  async #verifyApply(
    client: OpencodeClient,
    identity: ServerIdentity,
    targetVersion: string | null,
    signal: AbortSignal | undefined,
    launch: ServerLaunch,
    targetHash?: string | null
  ): Promise<void> {
    if (identity.launch !== launchOf(launch)) {
      throw new Error(
        `launch verification failed: started with ${identity.launch ?? "unknown flags"}, launching with ${launchOf(launch)}`
      );
    }
    const info = await client.server.info({
      signal: signal ?? AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
    });
    if (!targetVersion || info.version !== targetVersion) {
      throw new Error(
        `binary verification failed: running ${info.version}, installed ${targetVersion ?? "unknown"}`
      );
    }
    if (targetHash !== undefined) {
      const diskHash = await this.#hashConfig();
      if (targetHash && diskHash !== targetHash) {
        throw new Error(
          `config verification failed: disk hash ${diskHash?.slice(0, 8) ?? "null"}… differs from target ${targetHash.slice(0, 8)}… — concurrent modification`
        );
      }
    }
  }

  async detect(): Promise<HarnessReport> {
    const installed = resolveBin(OPENCODE_BIN) !== undefined;
    const version = installed
      ? await this.#installedVersion().catch(() => undefined)
      : undefined;
    // The catalog the machine reports, so a picker lists OpenCode's models
    // with no OpenCode session running.
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

  /** The current keeper's connection for this harness, dialled lazily: where a server starts. */
  sessiond(): Promise<SessiondClient> {
    return this.#keepers.current();
  }

  /**
   * Makes `identity`, the slot's active generation, the server its sessions
   * talk to: one client for it, cached on the slot. Live predecessor sessions
   * keep their own clients; only handles of the slot whose generation has
   * disappeared are rebound. A connection failure through this client means
   * the server is gone (crashed, killed): the slot's cached client is dropped
   * there, so the next call starts or finds the server again. An abort this
   * process asked for is not the server going away.
   */
  #adopt(slot: ServerSlot, identity: ServerIdentity): OpencodeClient {
    if (isV1(identity) || identity.password === undefined) {
      throw new Error(
        `OpenCode generation ${identity.procId} is a 1.x server: 2.0's client cannot reach it.`
      );
    }
    const dropWhenGone = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      try {
        return await fetch(input, init);
      } catch (error) {
        const signal = input instanceof Request ? input.signal : init?.signal;
        if (!signal?.aborted && slot.client === client) {
          slot.client = null;
          slot.ready = null;
        }
        throw error;
      }
    };
    const client = opencodeClient(
      { url: identity.url, password: identity.password },
      Object.assign(dropWhenGone, { preconnect: fetch.preconnect })
    );
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
        this.#activity(identity).bind(session.sessionId, session.instanceId);
      }
    }
    this.#ensurePump(identity).catch(console.warn);
    return client;
  }

  /**
   * The cutover from OpenCode 1.x, once per agent, before any 2.0 server
   * starts. Every 1.x server any record or the stray sweep names is retired,
   * each ended once it runs nothing ({@link #v1Idle}): what one writes after
   * 2.0 converts its database never reaches 2.0 (settled #10), and every 1.x
   * server CawCo started, the accounts' too, wrote the machine's database. No
   * turn is cut for it: while one runs, no 2.0 server starts, and the log
   * says which. Then the machine's 1.x database is copied whole beside itself
   * before 2.0 converts it in place.
   */
  #cutoverV1(): Promise<void> {
    this.#cutover ??= (async () => {
      await this.#loadRecorded();
      if (await isMachineAgent()) {
        await this.#adoptStrays();
        this.#straysSweptAt = Date.now();
      }
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the 1.x servers are read again until none is left
        const reads = await Promise.all(
          this.#slots().map((slot) => slot.owner.retireV1())
        );
        if (reads.flat().length === 0) {
          break;
        }
        await Bun.sleep(5000);
      }
      backupV1Database(xdgDataHome());
      await retireV1Plugins();
    })().catch((error: unknown) => {
      this.#cutover = null;
      throw error;
    });
    return this.#cutover;
  }

  #ensure(): Promise<OpencodeClient> {
    if (this.#client) {
      return Promise.resolve(this.#client);
    }
    if (!this.#ready) {
      // A spawn after a dispose is a revival: the adapter is a module
      // singleton, the server it attaches to outlived the teardown.
      this.#disposed = false;
      this.#ready = (async () => {
        // Only OpenCode 2.0.28 starts: its server API and plugin are what this speaks.
        await this.#installedVersion();
        await this.#cutoverV1();
        const launch = serverLaunch(
          await this.#launchConfig(),
          await this.#plugin(),
          await this.#hashConfig()
        );
        // Not a child of this process: the server goes under the keeper, so
        // an agent restart takes no session with it.
        const identity = await this.#serverOwner.ensure(launch);
        const client = this.#adopt(this.#machine, identity);
        await client.server.info({
          signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
        });
        // Convergence keeps the server matching the machine's global config;
        // that is the machine agent's to do, and only for a server that reads
        // the config this agent writes.
        if (
          this.#verifiedProcId !== identity.procId &&
          (await isMachineAgent()) &&
          (await this.#readsThisConfig(client))
        ) {
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
              await this.#verifyApply(
                client,
                identity,
                initialVersion,
                undefined,
                serverLaunch(
                  await this.#launchConfig(),
                  await this.#plugin(),
                  initialHash
                ),
                initialHash
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
   * The account's own OpenCode server: the one running, or one started now,
   * with the account's credential on it. The machine's is up first (it ends
   * 1.x's servers and writes the plugin every server loads). One on another
   * launch is replaced before any session runs in it; one on another binary
   * is the watcher's to replace at rest.
   */
  #ensureAccount(account: string): Promise<OpencodeClient> {
    const slot = this.#accountSlot(account);
    if (slot.client) {
      return Promise.resolve(slot.client);
    }
    slot.ready ??= (async () => {
      slot.starting = true;
      await this.#ensure();
      const { revision, launch } = await this.#accountRevision(account);
      await prepareAccountServer(account);
      const identity = await slot.owner.ensure(launch);
      if (identity.launch === launchOf(launch)) {
        const adopted = this.#adopt(slot, identity);
        await adopted.server.info({
          signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
        });
        // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure
        if (this.#converging) {
          try {
            await this.#verifyApply(
              adopted,
              identity,
              this.#desiredVersion,
              undefined,
              launch
            );
            slot.applied = revision;
          } catch (error) {
            console.info(
              `[opencode] account ${account}: its server is on another binary; the watcher replaces it at rest (${errorText(error)})`
            );
          }
        }
        await this.#putCredential(account, adopted);
      } else {
        await this.#replaceAccount(slot, launch, revision);
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

  /**
   * The account's credential on its server, and no other of CawCo's: put
   * under an id named for its value (`POST /api/credential`, then
   * `/activate`, which applies from the next request), and every earlier one
   * removed. CawCo keeps refreshing the account (pi-ai, 15 minutes ahead of
   * expiry) and puts each new token on the server from outside, as here: a
   * refresh in the server emits nothing a caller could follow (settled #8),
   * and the marker in the refresh token's place keeps OpenCode from spending
   * a rotating one. An account that holds nothing has nothing on its server.
   */
  async #putCredential(account: string, client: OpencodeClient): Promise<void> {
    const held = readHeld(account);
    const wanted = held ? opencodeCredentialOf(held) : undefined;
    const id = wanted
      ? `${CREDENTIAL_PREFIX}${createHash("sha256").update(JSON.stringify(wanted)).digest("hex").slice(0, 16)}`
      : undefined;
    const options = { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) };
    const stored = await client.credential.list(options);
    if (wanted && id) {
      if (!stored.some((entry) => entry.id === id)) {
        await client.credential.create(
          {
            id,
            integrationID: wanted.integrationID,
            label: `CawCo account ${account}`,
            // Read from the account's JSON file: every value in it is JSON.
            value: wanted.value as CredentialCreateInput["value"],
            activate: true,
          },
          options
        );
      }
      await client.credential.activate({ credentialID: id }, options);
    }
    await Promise.all(
      stored
        .filter(
          (entry) => entry.id.startsWith(CREDENTIAL_PREFIX) && entry.id !== id
        )
        .map((entry) =>
          client.credential.remove({ credentialID: entry.id }, options)
        )
    );
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

  /** The models the account's provider offers it, as its own server lists them, kept for the provider. */
  async #readAccountCatalog(
    account: string,
    client: OpencodeClient
  ): Promise<ModelInfo[]> {
    const held = readHeld(account);
    if (!held) {
      return [];
    }
    const provider = opencodeProviderOf(held.provider);
    const models = (await opencodeCatalog(client, undefined, provider)).filter(
      (row) => row.value !== "default"
    );
    const catalogs = { ...this.#loadAccountCatalogs(), [provider]: models };
    this.#accountCatalogs = catalogs;
    await writeJson(ACCOUNT_CATALOGS, catalogs);
    return models;
  }

  /**
   * Every model this machine's OpenCode runs: the machine's own server's, and
   * for each provider an account here is of, that provider's as an account's
   * own server lists them.
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
   * The hub restarted: each location's `cawco` MCP connection is made again
   * (`POST /api/experimental/mcp/cawco/connect`), for every location a live
   * session of this agent runs in, on the server it runs in.
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
        try {
          await client.mcp.connect(
            { server: "cawco", ...at(directory) },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          );
          console.info(
            `[opencode] ${directory}: cawco MCP reconnected after a hub restart`
          );
        } catch (error) {
          console.info(
            `[opencode] ${directory}: cawco MCP reconnect failed: ${errorText(error)}`
          );
        }
      })
    );
  }

  /** Every provider OpenCode can sign in to (its integrations), by id and name. */
  async providerList(): Promise<{ id: string; name: string }[]> {
    if (resolveBin(OPENCODE_BIN) === undefined) {
      return [];
    }
    const listed = await (await this.#ensure()).integration.list();
    return listed.data.map((one) => ({ id: one.id, name: one.name }));
  }

  /**
   * The accounts on this machine changed (one signed in, keyed, moved in or
   * forgotten). Each running account's server has its credential put on it as
   * it is written; one whose provider settings changed is replaced at rest,
   * and one whose account is gone retires once idle. A provider whose models
   * no account's server has listed yet has them listed.
   */
  async accountsChanged(): Promise<void> {
    if (!this.#client) {
      return;
    }
    await this.#configTick();
    await this.#catalog();
  }

  /** The plugin version this agent's servers load, written once per process. */
  #pluginDir: string | undefined;
  #pluginWrite: Promise<string> | null = null;

  #plugin(): Promise<string> {
    this.#pluginWrite ??= writePlugin(buildPluginSource())
      .then((dir) => {
        this.#pluginDir = dir;
        return dir;
      })
      .catch((error: unknown) => {
        this.#pluginWrite = null;
        throw error;
      });
    return this.#pluginWrite;
  }

  /**
   * What this agent's servers launch with: the fleet's static policy, CawCo's
   * plugin, its own hub's MCP server, and — the machine agent's — the fleet's
   * managed MCP servers as the disk config names them, so fleet-owned
   * definitions win over a user's own.
   */
  async #launchConfig(): Promise<Record<string, unknown>> {
    const plugin = await this.#plugin();
    const managed = (await isMachineAgent())
      ? new Set((await readSidecar(OPENCODE_SIDECAR)).mcp ?? [])
      : new Set<string>();
    const disk = recordOf(
      recordOf((await readJson<{ mcp?: unknown }>(OPENCODE_CONFIG))?.mcp)
        .servers
    );
    return {
      ...STATIC_POLICY,
      mcp: {
        servers: {
          ...Object.fromEntries(
            Object.entries(disk).filter(([name]) => managed.has(name))
          ),
          cawco: cawcoMcp(),
        },
      },
      plugins: [{ package: `file://${plugin}` }],
    };
  }

  // ------------------------------------------------------------ the pump

  /** Starts the generation's subscription, once; resolves when it is up. */
  #ensurePump(identity: ServerIdentity): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set by dispose()
    if (this.#disposed) {
      return Promise.reject(new Error("OpenCode adapter disposed"));
    }
    const key = identity.procId;
    if (!this.#pumps.has(key)) {
      const owner = new AbortController();
      this.#pumps.set(key, owner);
      this.#pumpReady.set(key, Promise.withResolvers<void>().promise);
      // biome-ignore lint/complexity/noVoid: the pump owns reconnection; callers await only readiness
      void this.#pump(identity, owner.signal).catch(console.warn);
    }
    // biome-ignore lint/style/noNonNullAssertion: set above or by the pump before its first await
    return this.#pumpReady.get(key)!;
  }

  /**
   * A LOCATION NO ATTACHED SESSION IS IN HOLDS NOTHING. Its loaded services
   * are evicted (`DELETE /api/debug/location`, which ends the location's MCP
   * servers, observed on 2.0.28), so a server does not keep one MCP server
   * set per directory any session ever ran in. Deferred, and tried again,
   * while the adapter is opening, migrating or recovering anything, and while
   * the server runs any session there or cannot say.
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
          `[opencode] ${directory}: releasing its location failed: ${errorText(error)}`
        )
      );
  }

  /** Whether the location is settled: evicted, or in use again and not this call's to evict. */
  async #disposeUnused(
    directory: string,
    identity: ServerIdentity,
    caller: string
  ): Promise<boolean> {
    const used = (): boolean =>
      // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set by dispose()
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
    if (await this.#runningIn(client, directory)) {
      return false;
    }
    if (used() || this.#operationsPending()) {
      return used();
    }
    await client.debug.location.evict(at(directory), {
      signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
    });
    console.info(
      `[opencode] ${directory}: location evicted by ${caller}, nothing attached and no turn running`
    );
    return true;
  }

  /** Whether the server runs any session in `directory` now. */
  async #runningIn(
    client: OpencodeClient,
    directory: string
  ): Promise<boolean> {
    const options = { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) };
    const running = Object.keys(await client.session.active(options));
    const sessions = await Promise.all(
      running.map((sessionID) => client.session.get({ sessionID }, options))
    );
    return sessions.some((session) => session.location.directory === directory);
  }

  /** Ends every generation's subscription loop; none reconnects. */
  #stopPumps(): void {
    for (const owner of this.#pumps.values()) {
      owner.abort();
    }
    this.#pumps.clear();
    this.#pumpReady.clear();
    this.#pumpConnected.clear();
  }

  /**
   * One server generation's event feed (`GET /api/event`), carrying every
   * location's sessions, routed by session id. The feed is live only, with
   * no replay and no reconnection of its own (opencode.ai/v2/docs/build/client:
   * "Subscriptions are live-only, with no replay or automatic
   * reconnection"): this loop reconnects, and every session on the generation
   * is read back over REST each time it is up again.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes every subscribed event to its owning session or child
  async #pump(identity: ServerIdentity, stopped: AbortSignal): Promise<void> {
    const key = identity.procId;
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
      const connection = new AbortController();
      const deadline = setTimeout(
        () => connection.abort(),
        RECOVERY_TIMEOUT_MS
      );
      let connected = false;
      try {
        const client = this.#clientForGeneration(identity);
        const feed = client.event.subscribe({
          signal: AbortSignal.any([stopped, connection.signal]),
        });
        // biome-ignore lint/performance/noAwaitInLoops: a feed's events are routed in the order they come; a dropped feed is subscribed again
        for await (const event of feed) {
          if (stopped.aborted) {
            break;
          }
          if (!connected) {
            connected = true;
            clearTimeout(deadline);
            console.info(
              `[opencode] ${identity.procId}/${identity.pid}: subscribe ready`
            );
            ready.resolve();
            this.#pumpConnected.add(key);
            for (const session of this.#sessions.values()) {
              if (
                this.#sessionOwners.get(session.instanceId)?.procId ===
                identity.procId
              ) {
                // biome-ignore lint/complexity/noVoid: snapshots must not block consumption of live gate events
                void this.#reconcile(session);
              }
            }
          }
          delay = 1000;
          this.#route(event, identity);
        }
      } catch {
        // The feed ended or dropped; reconnect below unless stopped.
      } finally {
        if (connected && !stopped.aborted) {
          this.#pumpConnected.delete(key);
        }
        clearTimeout(deadline);
        connection.abort();
        ready.reject(
          new Error(`OpenCode subscription unavailable: ${identity.procId}`)
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

  /** One event of a generation, to the session or subagent it is of, and to the generation's activity. */
  #route(event: V2Event, identity: ServerIdentity): void {
    if (event.type === "session.created") {
      const { parentID } = event.data;
      if (parentID) {
        this.#sessionForSid(parentID, identity)?.handleChildCreated(
          event.data.sessionID,
          event.data.agent,
          event.data.title
        );
      }
      return;
    }
    const sid =
      event.type === "form.created"
        ? event.data.form.sessionID
        : (event.data as { sessionID?: unknown } | undefined)?.sessionID;
    if (typeof sid !== "string") {
      return;
    }
    const activity = this.#activity(identity);
    if (event.type === "session.execution.started") {
      activity.observeBusy(sid);
    } else if (
      event.type === "session.execution.succeeded" ||
      event.type === "session.execution.failed" ||
      event.type === "session.execution.interrupted"
    ) {
      activity.observeIdle(sid);
    } else if (event.type.startsWith("session.")) {
      activity.observeProgress(sid);
    }
    const session = this.#sessionForSid(sid, identity);
    if (session) {
      session.handle(event);
      if (
        event.type.startsWith("session.execution.") &&
        event.type !== "session.execution.started"
      ) {
        this.#handoffIdle().catch(console.warn);
      }
      return;
    }
    const child = this.#children.get(sid);
    if (child && child.identity.procId === identity.procId) {
      child.parent.handleChild(event, child.callID);
    }
  }

  /**
   * OpenCode's own session id, off an event, back to one of ours on that
   * generation. When several share it (a resume), the most recently spawned
   * one wins: Map iteration is insertion order.
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
    // A released slot goes straight to its waiter, so newcomers cannot race
    // a woken recovery into a fifth concurrent operation.
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

  /** Interrupts `sessionKey` where it runs, and proves it stopped; false when it runs nowhere. */
  async abortSession(sessionKey: string, _dir: string): Promise<boolean> {
    // Never start a server to discard a turn that might already be gone.
    const options = () => ({
      signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
    });
    const readings = await Promise.all(
      (await this.#liveGenerations()).map(async (identity) => {
        const client = this.#clientForGeneration(identity);
        return {
          client,
          running: sessionKey in (await client.session.active(options())),
        };
      })
    );
    const client = readings.find(({ running }) => running)?.client;
    if (!client) {
      return false;
    }
    await client.session.interrupt({ sessionID: sessionKey }, options());
    if (sessionKey in (await client.session.active(options()))) {
      throw new Error(`OpenCode session ${sessionKey} is still running`);
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
      // Drop only this instance's routing; the turn, handles and location belong to the other.
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
    const options = () => ({
      signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
    });
    const generations = await this.#completeGenerations();
    for (const identity of generations) {
      const client = this.#clientForGeneration(identity);
      // biome-ignore lint/performance/noAwaitInLoops: each generation owns distinct runners
      if (sessionKey in (await client.session.active(options()))) {
        // Interrupt only this session on its captured generation.
        await client.session.interrupt({ sessionID: sessionKey }, options());
      }
      // Positive idle receipt precedes resource release.
      const after = await client.session.active(options());
      if (sessionKey in after) {
        throw new Error(`OpenCode turn ${sessionKey} has not ended`);
      }
      for (const [id, session] of this.#sessions) {
        if (id === instanceId && session.sessionId === sessionKey) {
          // biome-ignore lint/performance/noAwaitInLoops: release each handle of exactly this conversation
          await session.dispose();
        }
      }
      // The location is the remaining sessions'; released only by its last.
      if (
        !(
          [...this.#sessions.values()].some(
            (session) => session.directory === dir
          ) || (await this.#runningIn(client, dir))
        )
      ) {
        await client.debug.location.evict(at(dir), options());
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
          proc.procId !== OPENCODE_SERVER_PROC_ID &&
          !this.#slots().some((slot) =>
            slot.owner.generations.some(
              (identity) =>
                identity.procId === proc.procId &&
                identity.pid === proc.pid &&
                identity.epoch === held.epoch
            )
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
    _directory: string
  ): Promise<boolean> {
    const generations = await this.#completeGenerations();
    const readings = await Promise.all(
      generations.map(async (identity) => {
        try {
          await this.#clientForGeneration(identity).session.get(
            { sessionID: sessionKey },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          );
          return true;
        } catch (error) {
          if (notFound(error)) {
            return false;
          }
          throw new Error(
            `OpenCode session reading is incomplete: ${errorText(error)}`,
            { cause: error }
          );
        }
      })
    );
    if (this.#operationsPending()) {
      throw new Error("OpenCode ownership changed during its session reading.");
    }
    return readings.some(Boolean);
  }

  /**
   * Whether a recorded generation of any of this agent's servers still runs,
   * by its OS identity: a server whose keeper was killed under it runs on,
   * and so does every turn in it.
   */
  async serversRunning(): Promise<boolean> {
    return (await this.#liveGenerations()).length > 0;
  }

  sessionsOn(procId: string): string[] {
    return [...this.#sessionOwners]
      .filter(([, owner]) => owner.procId === procId)
      .map(([instanceId]) => instanceId);
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
    await Promise.all(
      generations.map(async (identity) => {
        const client = this.#clientForGeneration(identity);
        const options = { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) };
        const running = Object.keys(
          await client.session.active(options)
        ).filter((id) => !known.has(id));
        const sessions = await Promise.all(
          running.map((sessionID) => client.session.get({ sessionID }, options))
        );
        for (const session of sessions) {
          if (session.location.directory === directory) {
            unclaimed.add(session.id);
          }
        }
      })
    );
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

  /**
   * A held session taken back from the server generation running it, or
   * opened on its account's server when none runs its turn. Each attempt is
   * {@link #reattachOnce} on a round of its own, its every request bounded by
   * {@link RECOVERY_TIMEOUT_MS}. A server that answers for the session with an
   * error refuses it at once; one out of reach is tried again, a little later
   * each time, until {@link RECOVERY_RETRY_BUDGET_MS}.
   */
  async #recover(
    spec: SpawnPayload,
    ctx: HarnessContext,
    wave: RecoveryWave
  ): Promise<OpencodeSession | undefined> {
    const deadline = Date.now() + RECOVERY_RETRY_BUDGET_MS;
    let attempt = 0;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: dispose() terminates retrying recoveries during agent teardown
    while (!this.#disposed) {
      if (wave.round?.attempt !== attempt) {
        wave.round = {
          attempt,
          token: {},
          generations: this.#liveGenerations(),
        };
      }
      const { round } = wave;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: an unreachable server is tried again, within the budget
        return await this.#reattachOnce(spec, ctx, round);
      } catch (error) {
        if (
          error instanceof HarnessRecoveryRefused ||
          error instanceof SessionAddressRefused
        ) {
          throw error;
        }
        if (error instanceof ReattachFailed) {
          await this.#decideFailed(spec, round);
          throw error;
        }
        if (Date.now() >= deadline) {
          await this.#decideFailed(spec, round);
          throw new ReattachFailed(
            `OpenCode could not be reached to reattach session ${spec.resume?.sessionKey ?? ctx.instanceId} within ${RECOVERY_RETRY_BUDGET_MS / 1000} s on generation ${await generationsAsked(round)}: ${errorText(error)}`,
            { cause: error }
          );
        }
        const delay = Math.min(250 * 2 ** Math.min(attempt, 5), 5000);
        console.warn(
          `[opencode] recovery ${ctx.instanceId} waiting; retry in ${delay}ms: ${errorText(error)}`
        );
        attempt += 1;
        await Bun.sleep(delay);
      }
    }
  }

  /** A reattach that ended failed is decided in every generation it was looked for in. */
  async #decideFailed(spec: SpawnPayload, round: RecoveryRound): Promise<void> {
    const key = spec.resume?.sessionKey;
    if (!key) {
      return;
    }
    const generations = await round.generations.catch(
      () => [] as ServerIdentity[]
    );
    for (const generation of generations) {
      this.#activity(generation).observeFailed(key);
    }
  }

  async #reattachOnce(
    spec: SpawnPayload,
    ctx: HarnessContext,
    round: RecoveryRound
  ): Promise<OpencodeSession | undefined> {
    // Wait out publication before resolving custody across generations.
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
      // Each live generation owns its own runners: resolve the actual owner
      // before opening the session at all.
      const states = await Promise.all(
        generations.map(async (generation) => {
          const state = await this.#activity(generation).sessionState(
            this.#clientForGeneration(generation),
            resume.sessionKey,
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
          `OpenCode session ${resume.sessionKey} is running in multiple generations: ${busy.map(({ identity: owner }) => generationName(owner)).join(", ")}. Interrupt the duplicate runner explicitly before resuming; no runner was replaced.`
        );
      }
      if (busy.length === 0) {
        for (const generation of states) {
          if (generation.state.kind === "refused") {
            throw new ReattachFailed(
              `OpenCode session ${resume.sessionKey} cannot be reattached on generation ${generationName(generation.identity)}: ${generation.state.reason}`
            );
          }
        }
        for (const generation of states) {
          if (generation.state.kind === "unreachable") {
            throw new Error(
              `OpenCode generation ${generation.identity.procId} is temporarily unreachable: ${generation.state.reason}`
            );
          }
        }
      }
      // A turn running anywhere is reattached where it runs. At rest, the
      // session opens in the server of the account it runs on now (moved
      // there first when its database is another server's).
      const account = spec.accountDir?.accountId;
      if (
        !busy[0] &&
        (spec.reattachOnly === "busy" || spec.reattachOnly === "inspect")
      ) {
        return;
      }
      if (!busy[0]) {
        await (account === undefined
          ? this.#ensure()
          : this.#ensureAccount(account));
        await this.#bringHome(resume.sessionKey, account);
      }
      const target = this.#slotOf(account).owner.active;
      const chosen =
        busy[0] ??
        (target
          ? (states.find(
              (state) => state.identity.procId === target.procId
            ) ?? {
              identity: target,
              running: false,
            })
          : undefined);
      if (!chosen) {
        throw new Error(
          "OpenCode has no live active generation for idle recovery."
        );
      }
      const { identity, running } = chosen;
      const server = this.#clientForGeneration(identity);
      let session: SessionInfo;
      try {
        session = await server.session.get(
          { sessionID: resume.sessionKey },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        );
      } catch (error) {
        if (notFound(error)) {
          return;
        }
        if (unreachable(error)) {
          throw error;
        }
        throw new ReattachFailed(
          `OpenCode generation ${generationName(identity)} refused session ${resume.sessionKey}: ${errorText(error)}`,
          { cause: error }
        );
      }
      const activity = this.#activity(identity);
      activity.bind(resume.sessionKey, ctx.instanceId);
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
      // started while this recovery held its slot waits for the slot.
      const opened = await this.#open(spec, ctx, {
        client: server,
        session,
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
    // Config convergence gate: a spawn during a reload is delivered when it lifts.
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

  // ----------------------------------------------------- session homes

  async #homes(): Promise<Record<string, string>> {
    return (await readJson<Record<string, string>>(SESSION_HOMES)) ?? {};
  }

  /** Records that `sessionId` (and its children) is in `account`'s server's database; the machine's for none. */
  async #setHome(
    sessionIds: string[],
    account: string | undefined
  ): Promise<void> {
    const homes = await this.#homes();
    for (const id of sessionIds) {
      homes[id] = account ?? "";
    }
    await writeJson(SESSION_HOMES, homes);
  }

  /** The server whose database holds `sessionId`, started if it is not running. */
  async #homeClient(sessionId: string): Promise<OpencodeClient> {
    const home = (await this.#homes())[sessionId];
    return home ? await this.#ensureAccount(home) : await this.#ensure();
  }

  /**
   * The session moved into `account`'s server's database (the machine's for
   * none) when another's holds it: exported whole from the server that holds
   * it, imported into the target at its own location (2.0's import keeps
   * every id and ignores the location the session carries, settled #7), its
   * subagent sessions after it, then removed from the server it left. Undo
   * follows it: every server keeps its snapshots in the machine's one dir.
   */
  async #bringHome(
    sessionId: string,
    account: string | undefined
  ): Promise<void> {
    const home = (await this.#homes())[sessionId] ?? "";
    if (home === (account ?? "")) {
      return;
    }
    const prior = this.#moves.get(sessionId);
    if (prior) {
      return prior;
    }
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one move exports, imports, records and removes in order
    const moving = (async () => {
      const options = () => ({
        signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
      });
      const source = home
        ? await this.#ensureAccount(home)
        : await this.#ensure();
      const target =
        account === undefined
          ? await this.#ensure()
          : await this.#ensureAccount(account);
      let root: Awaited<ReturnType<OpencodeClient["session"]["export"]>>;
      try {
        root = await source.session.export({ sessionID: sessionId }, options());
      } catch (error) {
        if (notFound(error)) {
          // Not where the record says: it is already wherever it is.
          return;
        }
        throw error;
      }
      if (sessionId in (await source.session.active(options()))) {
        throw new Error(
          `OpenCode session ${sessionId} is running on its own server, so it does not move now.`
        );
      }
      const children = await allSessions(source, { parentID: sessionId });
      const exported = [
        root,
        ...(await Promise.all(
          children.map((child) =>
            source.session.export({ sessionID: child.id }, options())
          )
        )),
      ];
      for (const one of exported) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: a parent is imported before its children
          await target.session.import(
            {
              info: one.info,
              messages: one.messages,
              location: { directory: one.info.location.directory },
            },
            options()
          );
        } catch (error) {
          // An import a move cut half-way already made: 409, the same session.
          if (errorText(error).startsWith("ConflictError")) {
            continue;
          }
          throw error;
        }
      }
      await this.#setHome(
        exported.map((one) => one.info.id),
        account
      );
      await source.session.remove({ sessionID: sessionId }, options());
      console.info(
        `[opencode] session ${sessionId} moved from ${home ? `account ${home}'s` : "the machine's"} server to ${account ? `account ${account}'s` : "the machine's"}, with ${children.length} subagent session(s)`
      );
    })().finally(() => this.#moves.delete(sessionId));
    this.#moves.set(sessionId, moving);
    return moving;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: creates/resumes/forks a session across three branches, then wires the session up
  async #open(
    spec: SpawnPayload,
    ctx: HarnessContext,
    existing?: {
      client: OpencodeClient;
      session: SessionInfo;
      running: boolean;
      identity: ServerIdentity;
    }
  ): Promise<OpencodeSession> {
    // Before the server first boots the directory's location.
    await disablePlanAgentFor(spec, ctx.cwd);
    // The account a session runs on is the server it runs in: the account's
    // own, with that account's credential; on no account, the machine's.
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
    // The fleet's baseline, the delegate type's and the spawn's own denials,
    // as session rules.
    const deniedRules: OpencodeRule[] = opencodeDenyRules([
      ...(await sessionFleetDenials(spec.cawcoTodos)),
      ...(spec.denyTools ?? []),
    ]);
    // The location's readiness, awaited at the first dispatch, never at
    // publication: CawCo's plugin loaded there (the gate, failing closed) and
    // every MCP server connected (a prompt before then loses the tools of a
    // server still connecting, anomalyco/opencode#54794).
    const ready = existing?.running
      ? Promise.resolve()
      : (async () => {
          // Each wait has its own deadline, which says what it waited for.
          await assertPluginLoaded(client, ctx.cwd, this.#lifetimeSignal());
          await waitForMcp(client, ctx.cwd, this.#lifetimeSignal());
        })();
    ready.catch(() => undefined);
    let sessionId: string;
    const modelRef = spec.model ? splitModel(spec.model) : undefined;
    const model = modelRef?.providerID
      ? {
          providerID: modelRef.providerID,
          id: modelRef.id,
          ...(spec.effort ? { variant: spec.effort } : {}),
        }
      : undefined;
    const agent = spec.permissionMode === "plan" ? "plan" : "build";
    let applied: { model?: string; agent?: string; rules?: string } = {};
    const options = () => ({
      signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
    });
    if (existing) {
      sessionId = existing.session.id;
      applied = {
        ...(existing.session.model
          ? { model: JSON.stringify(existing.session.model) }
          : {}),
        ...(existing.session.agent ? { agent: existing.session.agent } : {}),
        ...(existing.session.permissions
          ? { rules: JSON.stringify(existing.session.permissions) }
          : {}),
      };
    } else if (spec.resume?.fork) {
      assertOpencodeKey(spec.resume.sessionKey, "fork");
      const source = await this.#homeClient(spec.resume.sessionKey);
      const forked = await source.session.fork(
        {
          sessionID: spec.resume.sessionKey,
          ...(spec.resume.atMessage ? { before: spec.resume.atMessage } : {}),
        },
        options()
      );
      sessionId = forked.id;
      await this.#setHome(
        [sessionId],
        (await this.#homes())[spec.resume.sessionKey] || undefined
      );
      await this.#bringHome(sessionId, account);
    } else if (spec.resume) {
      // Re-open: a session persists in its server's database, so resuming is
      // addressing the id again — but only an id a server here holds. A key
      // nobody holds is refused loudly rather than addressed blindly.
      assertOpencodeKey(spec.resume.sessionKey, "resume");
      await this.#bringHome(spec.resume.sessionKey, account);
      try {
        await client.session.get(
          { sessionID: spec.resume.sessionKey },
          options()
        );
      } catch (error) {
        throw new Error(
          `opencode has no session ${spec.resume.sessionKey} to resume: ${errorText(error)}`,
          { cause: error }
        );
      }
      sessionId = spec.resume.sessionKey;
    } else {
      // Its permission set is put before its first turn, whole, with what it
      // needs then (a lead's fence reads the location's MCP servers).
      const created = await client.session.create(
        {
          location: { directory: ctx.cwd },
          agent,
          ...(model ? { model } : {}),
        },
        options()
      );
      sessionId = created.id;
      applied = {
        agent,
        ...(model ? { model: JSON.stringify(model) } : {}),
      };
      await this.#setHome([sessionId], account);
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
      // Rewind: 2.0 stages the boundary, puts the files back as they were
      // before it, and commits it (settled #7: undo needs the shared
      // snapshot dir a move keeps).
      assertOpencodeKey(sessionId, "revert");
      try {
        await client.session.revert.stage(
          {
            sessionID: sessionId,
            messageID: spec.resume.atMessage,
            files: true,
          },
          options()
        );
        await client.session.revert.commit({ sessionID: sessionId }, options());
      } catch (error) {
        throw new Error(
          `opencode could not rewind to that message: ${errorText(error)}`,
          { cause: error }
        );
      }
    }

    let session!: OpencodeSession;
    session = new OpencodeSession({
      instanceId: ctx.instanceId,
      ctx,
      client,
      sessionId,
      directory: ctx.cwd,
      model: spec.model,
      permissionMode: spec.permissionMode,
      effort: spec.effort,
      workflowStepId: spec.workflowStepId,
      canDelegate: spec.canDelegate,
      deniedRules,
      account,
      lead: spec.lead === true,
      applied,
      ready,
      registerChild: (childId, callID) => {
        const owner = this.#sessionOwners.get(ctx.instanceId) ?? identity;
        this.#activity(owner).bind(childId, ctx.instanceId);
        this.#children.set(childId, {
          parent: session,
          callID,
          identity: owner,
        });
      },
      onRelease: () => {
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
      isConfigGateHeld: (urgent) =>
        this.#applyGate !== null ||
        (!urgent &&
          this.#sessionOwners.get(ctx.instanceId)?.procId !==
            slot.owner.active?.procId),
      readActivity: () =>
        this.#sessionBusy(sessionId, this.#sessionOwners.get(ctx.instanceId)),
      prepareDispatch: () => this.#prepareDispatch(session),
      liveSessions: () =>
        new Set(
          [...this.#sessions.values(), session].flatMap((held) =>
            held.sessionId ? [held.sessionId] : []
          )
        ),
    });
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
      this.#activity(owner).bind(sessionId, ctx.instanceId);
      if (owner.procId !== slot.owner.active?.procId) {
        this.#handoffIdle().catch(console.warn);
      }
      ctx.session(sessionId);
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
      // A resumed session may already be mid-turn on the server, or holding
      // an open permission or form; nothing else would ever tell this process
      // so. One snapshot per session, after its generation's subscription is
      // up: a subscription that comes up after this line reconciles every
      // session it holds, this one included, so only one already up does here.
      // biome-ignore lint/complexity/noVoid: attached handles remain operable while the subscription starts
      void this.#ensurePump(owner).catch((error: unknown) =>
        console.warn(String(error))
      );
      if (this.#pumpConnected.has(owner.procId)) {
        // biome-ignore lint/complexity/noVoid: attached handles remain operable while reconciliation runs
        void this.#reconcile(session);
      }
    };
    // Skills load natively, each as a message of its own, before the first prompt.
    if (!existing?.running && spec.skills?.length) {
      await session.loadSkills(spec.skills);
    }
    return session;
  }

  /** The adapter's lifetime: a wait it bounds ends when the adapter is disposed. */
  #lifetime = new AbortController();
  #lifetimeSignal(): AbortSignal {
    return this.#lifetime.signal;
  }

  /**
   * The sessions OpenCode holds on this machine, root sessions only: every
   * server's database, the machine's and each account's, read in place
   * ({@link sessionsOnMachine}), so a stopped account server's sessions are
   * listed without starting it. The machine's server is up first: it is
   * what converts a 1.x database before anything reads it as 2.0's.
   */
  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    if (resolveBin(OPENCODE_BIN) === undefined) {
      return [];
    }
    await this.#ensure();
    const tags = await readTags();
    return sessionsOnMachine(dir ? { directory: dir } : {}).map((session) =>
      sessionToInfo(session, tags[session.id])
    );
  }

  async getSessionInfo(
    sessionKey: string,
    _dir?: string
  ): Promise<NeutralSessionInfo | undefined> {
    if (resolveBin(OPENCODE_BIN) === undefined) {
      return;
    }
    // A read-only lookup: a key that cannot be an OpenCode session answers
    // "not held" rather than being sent.
    if (!OPENCODE_SESSION_ID.test(sessionKey)) {
      return;
    }
    await this.#ensure();
    const [session] = sessionsOnMachine({ id: sessionKey });
    return session
      ? sessionToInfo(session, (await readTags())[sessionKey])
      : undefined;
  }

  /**
   * The session's transcript from its server's projected history
   * ({@link toTranscript}), with the sends admitted and not yet read after
   * it, and each subagent's transcript under the `subagent` call that
   * started it (the call's `metadata.sessionID`).
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reads the session, its rewind point, its waiting sends and its subagents in one pass
  async getSessionMessages(
    sessionKey: string,
    _dir?: string
  ): Promise<SessionMessage[]> {
    if (resolveBin(OPENCODE_BIN) === undefined) {
      return [];
    }
    assertOpencodeKey(sessionKey, "getSessionMessages");
    const client = await this.#homeClient(sessionKey);
    const options = { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) };
    let info: SessionInfo;
    try {
      info = await client.session.get({ sessionID: sessionKey }, options);
    } catch (error) {
      if (notFound(error)) {
        return [];
      }
      throw error;
    }
    let messages = await allMessages(client, sessionKey);
    // A staged rewind hides its boundary message and everything after it.
    const revertID = info.revert?.messageID;
    if (revertID) {
      const index = messages.findIndex((message) => message.id === revertID);
      if (index >= 0) {
        messages = messages.slice(0, index);
      }
    }
    const waiting = await client.session.inbox.list(
      { sessionID: sessionKey },
      options
    );
    const entries = toTranscript(sessionKey, messages, waiting);
    const callByChild = new Map<string, string>();
    for (const message of messages) {
      if (message.type !== "assistant") {
        continue;
      }
      for (const block of message.content) {
        const child = (
          block.type === "tool" && block.name === "subagent"
            ? (block.state as { metadata?: { sessionID?: unknown } }).metadata
            : undefined
        )?.sessionID;
        if (block.type === "tool" && typeof child === "string") {
          callByChild.set(child, block.id);
        }
      }
    }
    for (const child of await allSessions(client, { parentID: sessionKey })) {
      const callID = callByChild.get(child.id);
      if (!callID) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: children are appended in this order; parallel reads would reorder subagents
      const childMessages = await allMessages(client, child.id);
      const childEntries = toTranscript(child.id, childMessages);
      for (const entry of childEntries) {
        entry.parent_tool_use_id = callID;
      }
      entries.push(...childEntries);
    }
    return entries;
  }

  async renameSession(
    sessionKey: string,
    title: string,
    _dir?: string
  ): Promise<void> {
    if (resolveBin(OPENCODE_BIN) === undefined) {
      return;
    }
    assertOpencodeKey(sessionKey, "renameSession");
    await (await this.#homeClient(sessionKey)).session.update({
      sessionID: sessionKey,
      title,
    });
  }

  async tagSession(
    sessionKey: string,
    tag: string | null,
    _dir?: string
  ): Promise<void> {
    assertOpencodeKey(sessionKey, "tagSession");
    await writeTag(sessionKey, tag);
  }

  async deleteSession(sessionKey: string, _dir?: string): Promise<void> {
    if (resolveBin(OPENCODE_BIN) === undefined) {
      return;
    }
    assertOpencodeKey(sessionKey, "deleteSession");
    await (await this.#homeClient(sessionKey)).session.remove({
      sessionID: sessionKey,
    });
  }

  async machine(method: string, _args: unknown[]): Promise<unknown> {
    switch (method) {
      case CONTROL_MODEL_CATALOG:
        return await this.#catalog();
      default:
        return;
    }
  }

  /**
   * Tear down the AGENT SIDE. The servers are deliberately left running: they
   * are the keeper's children, they own the machine's live sessions, and a
   * rebuilt supervisor finds them again through their records.
   */
  // biome-ignore lint/suspicious/useAwait: implements Harness.dispose's Promise<void> contract; this teardown is synchronous
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#converging = false;
    this.#lifetime.abort();
    this.#lifetime = new AbortController();
    this.#stopConfigWatcher();
    for (const activity of this.#activities.values()) {
      activity.stop();
    }
    if (this.#handoffTimer) {
      clearTimeout(this.#handoffTimer);
    }
    this.#handoffTimer = null;
    this.#stopPumps();
    this.#keepers.close();
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
    // Poke the watcher now rather than up to 2 s later.
    await this.#configTick();
    // What follows talks to the server on the config just written, never to
    // the one it replaces.
    await this.#ensure();
    const unsettled = await this.#configSettled();
    if (unsettled) {
      report.mcp = {
        ...placed,
        ...Object.fromEntries(mcp.map((name) => [name, unsettled])),
      };
      return report;
    }
    // Every running server here, for the locations its sessions run in. An
    // account's never for its own directory: a location connects every
    // configured MCP server, a second copy of the fleet's local servers held
    // for nobody.
    const machine = await this.#ensure();
    const places = [
      {
        client: machine,
        directories: new Set(
          [...this.#sessions.values()]
            .filter((session) => session.account === undefined)
            .map((session) => session.directory)
        ),
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
        // biome-ignore lint/performance/noAwaitInLoops: replace each location's connection before reporting runtime state
        await client.mcp.add({
          server: server.name,
          config: toOpencodeMcp(server.config) as never,
          ...at(directory),
        });
        await client.mcp.connect({ server: server.name, ...at(directory) });
      }
      // And the machine server's own location, the one this report reads. A
      // proxied server answers 503 until the hub signs in, and 2.0 does not
      // try a failed server again on its own; the hub's sync after a sign-in
      // is what connects it. Added first: a location just booted on a new
      // config may not hold it yet ("MCP server not found").
      await machine.mcp.add({
        server: server.name,
        config: toOpencodeMcp(server.config) as never,
      });
      await machine.mcp.connect({ server: server.name });
    }
    Object.assign(report.mcp, placed, await this.#readFleetMcp(mcp));
    return report;
  }

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    return {
      mcp: await this.#readFleetMcp(sidecar.mcp ?? []),
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    };
  }

  /**
   * Undefined once the machine's server runs the config last written, else
   * why not, as the report's state. A write's apply starts a moment after the
   * tick that saw it (`#configTick` does not wait on `#attemptConfigApply`),
   * and until it publishes, the server answering is the one on the old config:
   * read then, the report named what that server had (a fleet server "not
   * reported", or still connecting) and stayed so, as nothing reports again.
   * 2.0's apply no longer waits for sessions to go idle, so the wait is
   * bounded by a candidate's boot and verification. An agent that does not
   * converge the config (not the machine's) has nothing to wait for.
   */
  async #configSettled(): Promise<FleetItemState | undefined> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method
    if (!this.#converging) {
      return;
    }
    const deadline = Date.now() + CONFIG_SETTLE_TIMEOUT_MS;
    for (;;) {
      const gate = this.#applyGate;
      if (gate) {
        // biome-ignore lint/performance/noAwaitInLoops: an apply ends before the next look at its state
        await Promise.race([
          gate.promise,
          Bun.sleep(Math.max(0, deadline - Date.now())),
        ]);
      } else if (this.#configState === "applied") {
        return;
      } else if (this.#configState === "error") {
        return {
          state: "failed",
          detail: `OpenCode did not load its new config: ${this.#configError ?? "the apply failed"}`,
        };
      }
      if (Date.now() >= deadline) {
        return {
          state: "pending",
          detail: `OpenCode had not loaded its new config ${CONFIG_SETTLE_TIMEOUT_MS / 1000} s after it was written.`,
        };
      }
      await Bun.sleep(250);
    }
  }

  /**
   * The server's MCP list once none of `names` is still `pending`: 2.0
   * connects a location's servers after it answers, so a read right after a
   * boot names them connecting. Bounded by OpenCode's own startup timeout
   * ({@link MCP_CONNECT_TIMEOUT_MS}); a server the list does not name is not
   * waited for, since the config it runs is already the one written.
   */
  async #settledMcpList(client: OpencodeClient, names: string[]) {
    const deadline = Date.now() + MCP_CONNECT_TIMEOUT_MS;
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: each read decides whether the next is needed
      const listed = await client.mcp.list(
        {},
        { signal: AbortSignal.timeout(10_000) }
      );
      const connecting = names.some((name) => {
        const server = listed.data.find((one) => one.name === name);
        return !server || server.status.status === "pending";
      });
      if (!connecting || Date.now() >= deadline) {
        return listed;
      }
      await Bun.sleep(250);
    }
  }

  async #readFleetMcp(names: string[]): Promise<FleetSyncReport["mcp"]> {
    if (names.length === 0) {
      return {};
    }
    try {
      await this.#ensure();
      const unsettled = await this.#configSettled();
      if (unsettled) {
        return Object.fromEntries(names.map((name) => [name, unsettled]));
      }
      const client = await this.#ensure();
      const identity = this.#serverOwner.active;
      if (!identity) {
        throw new Error("OpenCode MCP probe has no verified server custody.");
      }
      // The server's own directory: a read there boots its location, which
      // may also hold live sessions. Its release shares the location
      // release's attachment and running checks.
      const listed = await this.#settledMcpList(client, names);
      await this.#disposeUnused(
        listed.location.directory,
        identity,
        "fleet MCP status"
      );
      const byName = new Map(
        listed.data.map((server) => [server.name, server.status] as const)
      );
      return Object.fromEntries(
        names.map((name) => {
          const status = byName.get(name);
          return [
            name,
            mcpFleetState(
              status
                ? {
                    status:
                      status.status === "needs_auth"
                        ? "needs_auth"
                        : status.status,
                    ...("error" in status ? { error: status.error } : {}),
                  }
                : undefined
            ),
          ];
        })
      );
    } catch (error) {
      return Object.fromEntries(
        names.map((name) => [name, { state: "failed", detail: String(error) }])
      );
    }
  }
}

export const opencodeHarness: Harness = new OpencodeHarness();
