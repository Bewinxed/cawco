/**
 * The OpenCode adapter, on OpenCode 2.0 (`@opencode/cli` and
 * `@opencode/client`, both pinned at core `OPENCODE_VERSION`).
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

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import type {
  FleetItemState,
  FleetMcpConfig,
  FleetMcpServer,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessReport,
  MachineFleetConfig,
  ModelInfo,
  NeutralSessionInfo,
  SessionMessage,
  SignInFault,
  SlashCommand,
  SpawnPayload,
  WorkspaceRef,
} from "@cawco/core";
import {
  CONTROL_MODEL_CATALOG,
  CONTROL_SUPPORTED_COMMANDS,
  CUSTODY_HELD,
  contactWords,
  IMAGE_GENERATION_TIMEOUT_MS,
  machineLabel,
  mcpFleetState,
  offeredMode,
  opencodeSignInFaultWords,
  PERMISSION_MODES,
} from "@cawco/core";
import type { RestartHold } from "@cawco/core/binary-updates";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  credentialAccountIds,
  opencodeAccountHome,
  opencodeDatabases,
  opencodeDataDir,
  workspaceScratchDir,
  workspaceSpillDir,
  xdgDataHome,
} from "@cawco/core/paths";
import type { ProcSpec } from "@cawco/core/sessiond";
import { isAlive, listedPid } from "@cawco/core/signal";
import { writeStateFile } from "@cawco/core/state-file";
import type {
  CredentialCreateInput,
  SessionInfo,
  SessionMessageInfo,
  V2Event,
} from "@opencode/client";
import { CHROME_DEVTOOLS } from "../browser/door";
import { gitIn } from "../checkout-exclude";
import { harnessMcpUrl } from "../delegation";
import {
  type OpencodeRule,
  opencodeDenyRules,
  sessionFleetDenials,
} from "../denied-tools";
import {
  hookStatesInSet,
  hookStatesOn,
  readFleetHarnessSet,
} from "../fleet-harness-set";
import { apartSignedOut, readFleetMcpSet } from "../fleet-mcp-set";
import { GATE_FORM_ENV, gateForm } from "../gate-form";
import { sessionGitEnv } from "../git-credential";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
import {
  HarnessRecoveryRefused,
  ReattachFailed,
  SessionAddressRefused,
} from "../harness";
import { KeeperPool } from "../keepers";
import { syncSection } from "../loop-watch";
import { isMachineAgent } from "../machine-agent";
import { fleetMcpMoved, MCP_CONNECT_MS } from "../mcp-status";
import { gaugeTables } from "../memory";
import { probeStarted } from "../probe-count";
import { OPENCODE_SERVER_PROC_ID, parseProcId } from "../proc-id";
import {
  type OpencodeOwnCredential,
  onAccountCredential,
  opencodeAccountEnv,
  opencodeCredentialOf,
  opencodeOwnChanges,
  opencodeOwnIntegrations,
  opencodeOwnSignInTypes,
  opencodeProviderOf,
  readHeld,
  setOpencodeAccountsHost,
} from "../provider-accounts";
import { readAccountSoon } from "../provider-usage";
import { fenced } from "../restart";
import type { SessiondClient } from "../sessiond-client";
import { listStandIns } from "../stand-ins";
import { onToolsMoved, toolGate } from "../tools";
import { workspaceRefs } from "../workspace-records";
import {
  hashText,
  readJson,
  readSidecar,
  syncMemory,
  writeJson,
} from "./fleet-common";
import { type ActivitySnapshot, OpencodeActivity } from "./opencode-activity";
import {
  answerOf,
  assertPluginLoaded,
  at,
  errorText,
  type McpNotConnected,
  notAnswered,
  notFound,
  OPENCODE_BIN,
  OPENCODE_SPEC,
  type OpencodeClient,
  opencodeBinary,
  opencodeClient,
  unreachable,
  waitForMcp,
} from "./opencode-client";
import { readOpencodeDb } from "./opencode-db";
import {
  catalogLaunchEnv,
  holdsCatalog,
  opencodeModels,
} from "./opencode-models";
import {
  buildPluginSource,
  OPENCODE_DIR,
  OPENCODE_PLACED_MCP,
  OPENCODE_QUIET_DIR,
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
  type ServerStart,
} from "./opencode-server";
import {
  askOpencode,
  forgetBackground,
  OpencodeSession,
  opencodeCatalog,
  splitModel,
  turnWasOpen,
} from "./opencode-session";
import { toTranscript } from "./opencode-transcript";

/** A reattach's read the server did not answer in time: undecided, so the reattach tries again, within its budget (`#recover`). */
class ReattachUnanswered extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReattachUnanswered";
  }
}

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
 * The fleet's MCP servers for OpenCode, by name, in 2.0's
 * `mcp.servers.<name>` shape: read into each server's launch config
 * ({@link OpencodeHarness.#launchConfig}), never by OpenCode itself (a
 * config dir's files it reads are `opencode.json` and `opencode.jsonc`, core
 * config/discovery.ts `names`, v2.0.29). Why not `opencode.json`:
 * {@link syncOpencodeMcp}.
 */
const OPENCODE_FLEET_MCP = join(OPENCODE_DIR, "cawco-fleet-mcp.json");

/**
 * The fleet's memory document for OpenCode: its global instructions file,
 * which every session loads before the `AGENTS.md` files from its folder up
 * ("OpenCode loads the global file followed by every `AGENTS.md` from the
 * current workspace directory toward the home directory",
 * opencode.ai/v2/docs/instructions). A project's own `AGENTS.md` OpenCode
 * finds itself.
 */
const OPENCODE_MEMORY = join(OPENCODE_DIR, "AGENTS.md");

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
 * What every server is launched with, whatever its account: no self-update
 * under a pinned fleet, and no file watcher. On macOS OpenCode's watcher
 * holds FSEvents streams over each session's dir and its `.git`, and over
 * every dir from the session's up to `/` (read from a server's own
 * FSEventStreamCreate calls, probe-kit `fsevents-scope`), so fseventsd
 * queued it every event on the volume; CawCo reads none of the file events
 * it drives. 2.0.29 reads `fs:{filewatcher:!b(process.env.
 * OPENCODE_FILEWATCHER_DISABLE??process.env.OPENCODE_DISABLE_FILEWATCHER)}`,
 * `b(e)` being `e==="1"||e?.toLowerCase()==="true"` (its binary). Its file
 * index (fff), which its glob and grep tools search, keeps its own stream
 * over the session's dir.
 */
export const SERVER_ENV: Readonly<Record<string, string>> = {
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_FILEWATCHER: "1",
};

/**
 * How one server is launched: `opencode serve` under the keeper, with its
 * launch config, no self-update under a pinned fleet, the model catalog the
 * agent holds (opencode-models.ts), and its sessions' git reaching the hub's
 * remote as each session (git-credential.ts). Its launch
 * flags name the gate form its plugin judges with ({@link gateForm}), the
 * plugin version it loads and the disk config it read: a server started on
 * other flags fails its launch check and is replaced at rest, its sessions
 * moving over as each comes to rest.
 */
const serverLaunch = async (
  config: Record<string, unknown>,
  pluginDir: string,
  diskHash: string | null,
  env: Record<string, string> = {}
): Promise<ServerLaunch> => ({
  spec: {
    command: (await opencodeBinary()) ?? OPENCODE_BIN,
    args: ["serve", "--hostname=127.0.0.1", "--port=0"],
    env: {
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      ...SERVER_ENV,
      ...catalogLaunchEnv(),
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
 * What a server's start depends on, as it stands now: its launch (binary
 * path, config content and the disk config's hash, environment, an
 * account's credential), and the stamps a launch does not carry: the binary
 * at that path (an upgrade in place), the config file (a touch counts), and
 * the database OpenCode 2.0 keeps its own sign-in in, in that server's data
 * home. A start refused on these is asked again only once one of them
 * changes (OpencodeServerOwner `ServerStart`).
 */
const startInputs = async (launch: ServerLaunch): Promise<string> => {
  const stamp = async (path: string): Promise<string> => {
    const found = await stat(path).catch(() => undefined);
    return found ? `${found.size}:${found.mtimeMs}` : "none";
  };
  const dataHome = launch.spec.env?.XDG_DATA_HOME;
  const data = dataHome ? join(dataHome, "opencode") : opencodeDataDir();
  return JSON.stringify([
    launchOf(launch),
    launch.spec.command,
    await stamp(launch.spec.command),
    await stamp(OPENCODE_CONFIG),
    await stamp(OPENCODE_FLEET_MCP),
    await stamp(join(data, "opencode.db")),
  ]);
};

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
/** A reattach's first wait before it tries again; each next doubles it. */
const RECOVERY_RETRY_FIRST_MS = 1000;
/**
 * The longest a reattach waits between tries. Our call: a server that has
 * not answered in half a minute is not hurried by a faster ask, and a
 * machine's worth of sessions asking every 5 s kept a loaded machine busy
 * (2026-10-23 20:20, obelisk: 369 reattaches, 5,166 retries).
 */
const RECOVERY_RETRY_MAX_MS = 30_000;

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
 * The fingerprint of the machine's `opencode.json`: the whole document,
 * canonical, and the static policy. A running server reloads a changed
 * `opencode.json` in its booted locations itself ({@link syncOpencodeMcp});
 * CawCo still replaces the server on a change, as on a launch-config one,
 * so the generation answering is one whose start was checked against this
 * hash (its `CAWCO_CONFIG` launch flag).
 */
const configHash = (config: Record<string, unknown>): string =>
  createHash("sha256")
    .update(canonicalizeJson({ config, _policy: STATIC_POLICY }))
    .digest("hex");

/**
 * The fleet servers a launch config runs (its `mcp.servers` but CawCo's own),
 * as a digest: two generations launched with the same one start the same
 * servers in a location, so a reading of one is a reading of the other
 * ({@link OpencodeHarness.#takenReading}).
 */
const fleetDigest = (config: Record<string, unknown>): string => {
  const { cawco: _own, ...fleet } = recordOf(recordOf(config.mcp).servers);
  return createHash("sha256")
    .update(canonicalizeJson(fleet))
    .digest("hex")
    .slice(0, 16);
};

/**
 * What a status read says of chrome-devtools without reading it. OpenCode
 * reaches it only in a workspace's location, through that workspace's MCP
 * gate, which runs it through the workspace's browser door; the plugin
 * removes it from every other location, as Claude Code and pi load none
 * without a door. The read runs in the machine server's own location, which
 * no gate opens on, so it holds none to read.
 */
const DOOR_ONLY: FleetItemState = {
  state: "applied",
  detail:
    "OpenCode reaches it only in a workspace's location, through that workspace's MCP gate.",
};

/**
 * `names` split into those a status read reads and what is said of the
 * rest without starting them: one the hub holds no sign-in for
 * ({@link apartSignedOut}), and chrome-devtools ({@link DOOR_ONLY}).
 */
const apartUnread = async (
  names: string[]
): Promise<{ read: string[]; said: Record<string, FleetItemState> }> => {
  const { read, signedOut } = apartSignedOut(names, await readFleetMcpSet());
  return {
    read: read.filter((name) => name !== CHROME_DEVTOOLS),
    said: {
      ...signedOut,
      ...(read.includes(CHROME_DEVTOOLS)
        ? { [CHROME_DEVTOOLS]: DOOR_ONLY }
        : {}),
    },
  };
};

let quietMade: Promise<void> | null = null;

/**
 * {@link OPENCODE_QUIET_DIR}, made on the first read that goes there: the
 * location a read of a server's own (its config sources, models,
 * integrations) is asked in, which starts no MCP server.
 */
const quietDir = async (): Promise<string> => {
  quietMade ??= mkdir(OPENCODE_QUIET_DIR, { recursive: true }).then(
    () => undefined,
    (error: unknown) => {
      quietMade = null;
      throw error;
    }
  );
  await quietMade;
  return OPENCODE_QUIET_DIR;
};

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
  const announcement = await readWithin(
    timeoutMs,
    (signal) =>
      new Promise<string>((resolve, reject) => {
        let settled = false;
        let stop = (): void => undefined;
        const settle = (finish: () => void): void => {
          if (settled) {
            return;
          }
          settled = true;
          signal.removeEventListener("abort", aborted);
          stop();
          finish();
        };
        const aborted = () => settle(() => reject(signal.reason));
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) {
          aborted();
          return;
        }
        // From seq 0: the announce line is printed once, at boot, and a returning
        // agent reads it out of the replay ring long after it was written.
        stop = client.subscribe(
          procId,
          {
            line: (event) => {
              const announced = parseServerAnnouncement(event.data);
              if (announced) {
                settle(() => resolve(announced));
              }
            },
            exit: (exitCode, _signal, pid) =>
              settle(() => {
                // A server that never announced serves nobody: its end is read here.
                client.release(procId, pid);
                reject(
                  new Error(
                    `[opencode] serve exited (code ${exitCode}) before announcing a port`
                  )
                );
              }),
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
      }),
    options.signal ? { signal: options.signal } : {}
  );
  switch (announcement.kind) {
    case "answered":
      return announcement.value;
    case "unanswered":
      throw new Error(
        `[opencode] no "server listening" line from ${procId} within ${timeoutMs}ms`
      );
    default: {
      const unhandled: never = announcement;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/**
 * A fleet MCP definition, in 2.0's `mcp.servers.<name>` shape. Its `timeout`
 * object overrides OpenCode's own (opencode.ai/v2/docs/mcp-servers
 * "Timeouts": `startup` "Transport connection and server initialization" and
 * `catalog` "Listing tools, prompts, resources…", 30 s each by default): a
 * fleet server slower than that read `Request timed out` on every sync. Both
 * get the fleet's connect window ({@link MCP_CONNECT_MS}), the one Claude
 * Code gets, so a slow server reads the same in either harness.
 */
const toOpencodeMcp = (config: FleetMcpConfig): Record<string, unknown> => {
  const timeout = { startup: MCP_CONNECT_MS, catalog: MCP_CONNECT_MS };
  return "url" in config
    ? {
        type: "remote",
        url: config.url,
        oauth: false,
        timeout,
        ...(config.headers ? { headers: config.headers } : {}),
      }
    : {
        type: "local",
        command: [config.command, ...(config.args ?? [])],
        timeout,
        ...(config.env ? { environment: config.env } : {}),
      };
};

/**
 * When CawCo starts again a fleet server OpenCode holds `failed`, as OpenCode
 * 2.0 never does: its `startServer` runs only for a config add or change, a
 * `connect`, a credential switch and an expired HTTP session, and a start
 * that failed ends at `entry.status = { status: "failed", error }` with no
 * retry (packages/core/src/mcp/index.ts, the same at v2.0.29 and v2.0.32).
 * `failed` carries only the error's words, so a server that will never start
 * reads as one that was slow once, and both are tried again. Ours: the first
 * try 15 s on (a start that timed out on a loaded machine is usually moments
 * from connecting), then each wait doubled up to 5 min.
 */
const MCP_RETRY_FIRST_MS = 15_000;
const MCP_RETRY_MAX_MS = 5 * 60_000;

/**
 * How many passes read the fleet's servers again after a change left one
 * unsettled. Each read boots the machine server's location and starts every
 * fleet server there, so a server that never starts (the Mac's `xcode`,
 * 2026-10-22) once cost twelve such boots an hour for as long as the agent
 * ran. Ours: five, at 15, 30, 60, 120 and 240 s, under eight minutes, which
 * outlasts a slow start on a loaded machine; then the reading stands until
 * the fleet's servers or the generation change. While a live session runs,
 * passes go on starting the failed servers in its location, which reading
 * never boots.
 */
const MCP_PASS_READS = 5;

/**
 * How long one `connect` of a fleet server may take to answer: OpenCode
 * answers once its start settles, which is bounded by the `startup` and
 * `catalog` timeouts each is written with ({@link toOpencodeMcp}), plus 30 s
 * of CawCo's own margin for a loaded machine, as {@link MCP_CONNECT_MS}'s
 * status read has.
 */
const MCP_START_AGAIN_MS = 2 * MCP_CONNECT_MS + 30_000;

/** A fleet server's reading that is not a lasting verdict: it is read again until it is. */
const unsettledState = (item: FleetItemState): boolean =>
  item.state === "failed" || item.state === "pending";

const recordOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

/**
 * The fleet's servers written whole to {@link OPENCODE_FLEET_MCP}, which
 * each server takes in its launch config, and none of them in
 * `opencode.json`. OpenCode watches its config dirs from every location of
 * every server running and reloads a changed `opencode.json` there (core
 * config.ts: `watcher.subscribe(target, requestReload)`, then `reload()`
 * publishes `config.updated`, on which config/plugin/mcp.ts reloads MCP;
 * v2.0.29), so a server named there was started in each booted location of
 * each generation, the one being replaced too, beside the new generation's
 * own start. A launch config is read once, as its server starts: a changed
 * set starts a new generation ({@link OpencodeHarness.#hashConfig}), and
 * that generation alone runs it, each session taking it as it moves there
 * at rest. The person's `opencode.json` is his: CawCo never makes one, and
 * writes his only to take back out a name it once put there, from its
 * `mcp.servers` and 1.x's flat `mcp.<name>` alike, so his own `opencode`
 * loads only what he configured; CawCo's own server is every server's by
 * its launch config.
 */
const syncOpencodeMcp = async (
  desired: { name: string; config: FleetMcpConfig; enabled: boolean }[],
  managed: string[],
  report: Record<string, FleetItemState>
): Promise<string[]> => {
  const wanted = desired.filter((server) => server.enabled);
  const names = wanted.map((server) => server.name);
  for (const name of managed) {
    if (!names.includes(name)) {
      report[name] = { state: "removed" };
    }
  }
  const stored = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
  const mcp = recordOf(stored?.mcp);
  const servers = recordOf(mcp.servers);
  const ours = ["cawco", ...managed, ...names];
  if (stored && ours.some((name) => name in mcp || name in servers)) {
    for (const name of ours) {
      delete mcp[name];
      delete servers[name];
    }
    await writeOpencodeConfig("fleet sync", {
      ...stored,
      mcp: { ...mcp, servers },
    });
  }
  await writeJson(
    OPENCODE_FLEET_MCP,
    Object.fromEntries(
      wanted.map((server) => [server.name, toOpencodeMcp(server.config)])
    )
  );
  return names;
};

type PlacedMcp = Record<string, { cwd: string; name: string; entry: unknown }>;

/**
 * The placed servers' revision, in a server's config hash for them
 * (OpencodeHarness `#hashConfig`): moved only when a place this machine
 * already had changed its servers.
 */
const OPENCODE_PLACED_REVISION = join(
  OPENCODE_DIR,
  "cawco-placed-mcp.revision"
);

/** Each place's servers in `placed`, canonical, by its folder. */
const serversByPlace = (placed: PlacedMcp): Map<string, string> => {
  const byPlace = new Map<string, Record<string, unknown>>();
  for (const { cwd, name, entry } of Object.values(placed)) {
    byPlace.set(cwd, { ...byPlace.get(cwd), [name]: entry });
  }
  return new Map(
    [...byPlace].map(([cwd, servers]) => [cwd, canonicalizeJson(servers)])
  );
};

/**
 * Whether a server must be replaced for `placed` where it held `before`:
 * only when a place whose servers changed (added, edited, removed) holds a
 * directory a live session runs in (`live`). A location takes its place's
 * servers as it boots (the plugin's `placeMcp`), and one no session is in
 * is evicted (`#releaseDirectory`), so a place added (a workspace cut) is
 * taken by the first location there, a place gone (a workspace archived) by
 * none, and neither is a change of any location a server runs: a sync that
 * carried one (the hub's "a place changed") touches that place alone. A
 * live session's location holds its place's old servers until it boots
 * again, on the server that replaces this one, which it moves to at rest.
 */
const placedRevisionMoved = (
  before: PlacedMcp,
  placed: PlacedMcp,
  live: readonly string[]
): boolean => {
  const was = serversByPlace(before);
  const now = serversByPlace(placed);
  return [...new Set([...was.keys(), ...now.keys()])].some(
    (cwd) =>
      was.get(cwd) !== now.get(cwd) &&
      live.some((dir) => dir === cwd || dir.startsWith(`${cwd}/`))
  );
};

/**
 * A project's MCP servers at each of its places on this machine
 * (`MachineFleetConfig.placedMcp`), for OpenCode: {@link OPENCODE_PLACED_MCP}
 * rewritten whole, which the plugin hands each location as it boots, and
 * {@link OPENCODE_PLACED_REVISION} moved when a place a live session runs
 * in changed (`live`, its directories: {@link placedRevisionMoved}).
 * Answers each copy's state under `<name>@<place id>`, a copy no longer
 * carried as removed.
 */
const placeOpencodeMcp = async (
  desired: FleetMcpServer[],
  live: readonly string[]
): Promise<Record<string, FleetItemState>> => {
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
        cause: "no-checkout",
        detail: `${server.cwd} is not on this machine`,
      };
    }
  }
  for (const key of Object.keys(before)) {
    report[key] ??= { state: "removed" };
  }
  if (placedRevisionMoved(before, placed, live)) {
    const revision = await readFile(OPENCODE_PLACED_REVISION, "utf8").catch(
      () => ""
    );
    await writeStateFile(
      OPENCODE_PLACED_REVISION,
      createHash("sha256")
        .update(`${revision}\u0000${canonicalizeJson(placed)}`)
        .digest("hex")
        .slice(0, 16)
    );
  }
  await writeJson(OPENCODE_PLACED_MCP, placed);
  return report;
};

/**
 * OpenCode's `plan` agent, its plan mode: off in every server CawCo launches
 * ({@link OpencodeHarness.#launchConfig}), since a session's plan and spec
 * are CawCo's (core `NATIVE_TOOLS.todos`); never in the person's
 * `opencode.json`, so his own `opencode` keeps it.
 */
const PLAN_AGENT_OFF_CONFIG = { agents: { plan: { disabled: true } } } as const;

/**
 * The `agents.plan.disabled` CawCo once wrote into the person's
 * `opencode.json` to turn its plan mode off (`ours`, its sidecar says so), taken
 * back out once, with every other key of his `plan` and `agents` kept. A
 * write that fails throws, and the sidecar keeps saying so for the next sync.
 */
const dropPlanAgentEntry = async (ours: boolean): Promise<void> => {
  if (!ours) {
    return;
  }
  const stored = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
  const agents = recordOf(stored?.agents);
  const { disabled, ...planRest } = recordOf(agents.plan);
  if (!stored || disabled !== true) {
    return;
  }
  const { plan: _plan, ...otherAgents } = agents;
  const nextAgents =
    Object.keys(planRest).length > 0
      ? { ...otherAgents, plan: planRest }
      : otherAgents;
  const { agents: _agents, ...rest } = stored;
  await writeOpencodeConfig("fleet sync", {
    ...rest,
    ...(Object.keys(nextAgents).length > 0 ? { agents: nextAgents } : {}),
  });
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
    await writeStateFile(
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
  permissionModes: [...PERMISSION_MODES],
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
  hooks: true,
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
  return readOpencodeDb(dbPath, [] as StoredSession[], (db) => {
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
  });
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
  switch (read.kind) {
    case "unreachable":
      say(`out of reach (${read.reason}); read again later`);
      return false;
    case "unanswered":
      say(
        `did not answer within ${Math.round(read.after / 1000)} s; read again later`
      );
      return false;
    case "refused":
      say(
        `will not say what it runs (${read.reason}); no session of this agent is on it, so it is ended`
      );
      return true;
    case "read":
      if (read.running.length > 0) {
        say(
          `runs ${read.running.join(", ")}; ended once that is done, and no OpenCode 2.0 server starts before`
        );
        return false;
      }
      return undefined;
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

const sessionsOnMachine = (query: {
  directory?: string;
  id?: string;
}): StoredSession[] => {
  const seen = new Map<string, StoredSession>();
  for (const dbPath of opencodeDatabases()) {
    for (const session of syncSection("OpenCode sessions listed (SQLite)", () =>
      storedSessions(dbPath, query)
    )) {
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
    const from = cursor;
    // biome-ignore lint/performance/noAwaitInLoops: each page names the next
    const read = await askOpencode((options) =>
      client.session.list(
        {
          limit: 200,
          parentID: query.parentID ?? "null",
          ...(query.directory ? { directory: query.directory } : {}),
          ...(from ? { cursor: from } : {}),
        },
        options
      )
    );
    const page = answerOf(read, "the session list");
    sessions.push(...page.data);
    cursor = page.cursor.next ?? undefined;
  } while (cursor);
  return sessions;
};

/**
 * Every projected message of a session, oldest first. The order goes on the
 * first page only: 2.0.28's cursor carries it, and a page asked with both
 * answers 400 "Cursor cannot be combined with order". A page names a next
 * cursor whenever it holds a message, so the read ends on an empty page.
 */
const allMessages = async (
  client: OpencodeClient,
  sessionID: string
): Promise<SessionMessageInfo[]> => {
  const messages: SessionMessageInfo[] = [];
  let cursor: string | undefined;
  do {
    const from = cursor;
    // biome-ignore lint/performance/noAwaitInLoops: each page names the next
    const read = await askOpencode((options) =>
      client.message.list(
        {
          sessionID,
          limit: 200,
          ...(from ? { cursor: from } : { order: "asc" as const }),
        },
        options
      )
    );
    const page = answerOf(read, `the messages of ${sessionID}`);
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

/** The machine's own OpenCode sign-ins their providers last refused, by provider ({@link HarnessReport.signInFaults}), kept across an agent's restart. */
const SIGN_IN_FAULTS = join(OPENCODE_DIR, "cawco-sign-in-faults.json");

/** How often the machine's own sign-ins are checked when none changed, and the least time between two requests for one key. Ours: an hour, so a check spends at most one request per key an hour. */
const SIGN_IN_CHECK_MS = 60 * 60_000;

/** How long a key's check request may take. Ours: a list of models answers in well under a second; past this it says nothing. */
const KEY_CHECK_TIMEOUT_MS = 20_000;

/** Anthropic's API, where OpenCode's Anthropic provider sends when its config names no other (`@ai-sdk/anthropic`'s default). */
const ANTHROPIC_API = "https://api.anthropic.com/v1";

/**
 * The free, read-only request that says whether a key works with its
 * provider, by the package OpenCode sends its requests through and the base
 * URL it sends them to: Anthropic's list of models (`x-api-key`), or an
 * OpenAI-compatible provider's (a bearer token, at the base URL its config
 * or catalog names). None for any other provider.
 */
const keyCheckRequest = (
  key: string,
  providerPackage: string | undefined,
  baseURL: unknown
): { headers: Record<string, string>; url: string } | undefined => {
  const base = typeof baseURL === "string" && baseURL ? baseURL : undefined;
  if (providerPackage?.endsWith("/anthropic")) {
    return {
      url: `${(base ?? ANTHROPIC_API).replace(TRAILING_SLASH, "")}/models`,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    };
  }
  if (providerPackage?.endsWith("/openai-compatible") && base) {
    return {
      url: `${base.replace(TRAILING_SLASH, "")}/models`,
      headers: { authorization: `Bearer ${key}` },
    };
  }
};

const TRAILING_SLASH = /\/+$/;

/** OpenCode's own list of its integrations (`GET /api/integration`), as far as CawCo reads it. */
const integrationsOf = (listed: {
  data: unknown;
}): { id: string; methods?: { id?: string; type: string }[] }[] =>
  listed.data as { id: string; methods?: { id?: string; type: string }[] }[];

/** The integrations OpenCode offers an OAuth method for: those it can sign in to again, rather than take only a key. */
const oauthIntegrationsOf = (listed: { data: unknown }): Set<string> =>
  new Set(
    integrationsOf(listed).flatMap((integration) =>
      (integration.methods ?? []).some((method) => method.type === "oauth")
        ? [integration.id]
        : []
    )
  );

/** What a check of one of the machine's own sign-ins found: it cannot work (and why), it works, or it cannot tell. */
type SignInVerdict =
  { state: "fault"; why: string } | { state: "works" } | { state: "unknown" };

/**
 * An OAuth sign-in's check, read locally: past its expiry, one OpenCode
 * cannot refresh (its integration has no method for it, or it holds no
 * refresh token) cannot work; one it can refresh, it refreshes as it is used
 * (CawCo never spends a rotating refresh token for it), so this cannot tell.
 * Unexpired, it works when it was signed in again since its fault, else a
 * turn says.
 */
const oauthVerdict = (
  value: Record<string, unknown>,
  refreshable: boolean,
  renewedSince: boolean
): SignInVerdict => {
  const expires = Number(value.expires);
  if (!(Number.isFinite(expires) && expires <= Date.now())) {
    return renewedSince ? { state: "works" } : { state: "unknown" };
  }
  const expired = new Date(expires).toISOString();
  if (!refreshable) {
    return {
      state: "fault",
      why: `its token expired ${expired}`,
    };
  }
  return value.refresh
    ? { state: "unknown" }
    : {
        state: "fault",
        why: `its token expired ${expired} and it holds no refresh token`,
      };
};

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
      (identity) => this.#whyNotIdle(identity),
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
  /**
   * MCP mutations running against a server's client (a fleet server's
   * `connect`, {@link #startFailedAt}): a lease, so no cutover closes that
   * client mid-call (e1ce75227) and no location it runs in is evicted
   * ({@link #operationsPending}). Reads are not leased.
   */
  #mutatingMcp = 0;
  /** Fleet syncs running: a pass waits for them ({@link #mendFleetMcp}), an agent restart too ({@link restartHolds}). */
  #syncing = 0;
  /** The locations a release is waiting on, by generation and directory ({@link #releaseDirectory}). */
  readonly #releasing = new Set<string>();
  /**
   * The fleet servers the machine's active generation was launched with
   * ({@link fleetDigest}), known for a generation this agent launched or
   * verified against its own launch; none for one it could not.
   */
  #activeFleet: { fleet: string; procId: string } | null = null;
  /**
   * The last reading that booted a location to read the fleet's servers
   * ({@link #readFleetMcpNow}): the fleet servers of the generation it was
   * read on (null when not known), the servers it read, what each read, and
   * whether each came to a lasting verdict. A sync, a report and a pass find
   * there whether the servers the active generation runs were read already
   * ({@link #takenReading}).
   */
  #fleetMcpRead: {
    fleet: string | null;
    names: ReadonlySet<string>;
    settled: boolean;
    states: Record<string, FleetItemState>;
  } | null = null;
  /** Each fleet server's state as last reported for the machine, by name ({@link #heardFleetMcp}). */
  readonly #fleetMcpReported = new Map<string, FleetItemState["state"]>();
  /** The next pass that reads unsettled fleet servers again ({@link #mendFleetMcp}). */
  #mendTimer: ReturnType<typeof setTimeout> | null = null;
  /** Passes in a row that left a fleet server unsettled: the backoff's exponent. */
  #mendAttempt = 0;
  /** Fleet MCP reads and passes, one at a time ({@link #fleetMcpTurn}). */
  #fleetMcpQueue: Promise<unknown> = Promise.resolve();
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
    // The machine's tools moved (an install this agent ran, or this adapter
    // finding another version): the next call reads the binary again, not a
    // probe up to 30 s old.
    onToolsMoved(() => {
      this.#versionProbe = null;
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
        const client = await this.#ensure();
        answerOf(
          await askOpencode((options) =>
            client.credential.remove({ credentialID: id }, options)
          ),
          `the removal of credential ${id}`
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
    const client = await this.#ensure();
    const stored = answerOf(
      await askOpencode((options) => client.credential.list(options)),
      "the machine's sign-ins"
    );
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
   * (`{type: "directory", path}`). Asked in the quiet location, where it
   * starts no MCP server ({@link OPENCODE_QUIET_DIR}).
   */
  async #readsThisConfig(
    client: OpencodeClient,
    signal?: AbortSignal
  ): Promise<boolean> {
    const quiet = at(await quietDir());
    const sources = answerOf(
      await askOpencode((options) => client.config.get(quiet, options), signal),
      "which config it reads"
    ) as unknown as { type?: string; path?: string }[];
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
   * placed servers' revision ({@link OPENCODE_PLACED_REVISION}), the fleet's
   * servers and the held catalog's entries for
   * the providers this machine's servers serve ({@link #catalogDigest}).
   * Null when opencode.json is missing or malformed.
   */
  async #hashConfig(): Promise<string | null> {
    const configHashed = await this.#configFileHash();
    if (configHashed === null) {
      return null;
    }
    // The placed servers' revision too: a location takes its place's as it
    // boots, so only a place it had that changed moves it
    // (placedRevisionMoved), never a place added or gone.
    const placed = (
      await readFile(OPENCODE_PLACED_REVISION, "utf8").catch(() => "")
    ).trim();
    // The fleet's servers too: a server takes them in its launch config.
    const fleet = await readJson<Record<string, unknown>>(OPENCODE_FLEET_MCP);
    // The catalog too: a server reads it only as it starts.
    const catalog = holdsCatalog() ? await this.#catalogDigest() : "";
    if (!(placed || (fleet && Object.keys(fleet).length > 0) || catalog)) {
      return configHashed;
    }
    const hash = createHash("sha256").update(configHashed);
    if (placed) {
      hash.update(`placed:${placed}`);
    }
    if (fleet && Object.keys(fleet).length > 0) {
      hash.update(`fleet:${canonicalizeJson(fleet)}`);
    }
    return hash.update(catalog).digest("hex");
  }

  /** opencode.json's text when it was last hashed, and its {@link configHash}. */
  #configHashed: { hash: string; text: string } | undefined;

  /**
   * {@link configHash} of opencode.json as it is on disk now, computed again
   * only when its text changed: the watcher asks every 2 s. Null when it is
   * missing or malformed.
   */
  async #configFileHash(): Promise<string | null> {
    const text = await readFile(OPENCODE_CONFIG, "utf8").catch(() => null);
    if (text === null) {
      return null;
    }
    if (this.#configHashed?.text === text) {
      return this.#configHashed.hash;
    }
    let config: unknown;
    try {
      config = JSON.parse(text);
    } catch {
      return null;
    }
    if (!config) {
      return null;
    }
    const hash = configHash(config as Record<string, unknown>);
    this.#configHashed = { hash, text };
    return hash;
  }

  /**
   * The held catalog's fingerprint over the providers this machine's
   * servers can send a request to: Zen's (`opencode`, keyless), each CawCo
   * account's here, each the machine's own OpenCode is signed in to, and
   * each whose key is in the environment. A change to any other provider's
   * entry replaces no server.
   */
  async #catalogDigest(): Promise<string> {
    await opencodeModels.ready();
    const providers = new Set<string>(["opencode"]);
    for (const account of credentialAccountIds()) {
      const held = readHeld(account);
      if (held) {
        providers.add(opencodeProviderOf(held.provider));
      }
    }
    for (const integration of opencodeOwnIntegrations()) {
      providers.add(integration);
    }
    for (const keyed of opencodeModels.providersKeyedIn(process.env)) {
      providers.add(keyed);
    }
    return opencodeModels.digest(providers);
  }

  /**
   * A new session's first turn runs on the config and catalog as they are
   * now: the held catalog confirmed the source's ({@link opencodeModels}),
   * and the server it opens on started on both, replaced first when it did
   * not (a change the watcher left for the next need, {@link #applyIfNeeded},
   * included). Refused, in words, when either cannot be had.
   */
  async #configCurrent(account: string | undefined): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method
    if (!this.#converging) {
      return;
    }
    if (holdsCatalog()) {
      await opencodeModels.current();
    }
    // The machine's server first: an account's launch carries its revision.
    const hash = await this.#hashConfig();
    if (hash !== null && hash !== this.#appliedHash) {
      this.#desiredHash = hash;
      this.#configState = "pending";
    }
    if (this.#configState === "pending") {
      const unsettled = await this.#configSettled();
      if (unsettled) {
        throw new Error(
          `This machine's OpenCode config or model catalog changed and its server has not restarted on it (${unsettled.detail}); nothing was started.`
        );
      }
    }
    if (account === undefined) {
      return;
    }
    const slot = this.#accounts.get(account);
    if (!slot?.client) {
      // Its server starts on the current launch (#ensureAccount).
      return;
    }
    const { revision, launch } = await this.#accountRevision(account);
    if (slot.applied !== revision) {
      await this.#replaceAccount(slot, launch, revision);
    }
  }

  /**
   * The machine's OpenCode, through the catalog's version gate (tools.ts
   * `toolGate`: missing, or not OPENCODE_VERSION, refuses the start in its
   * sentence, with its fix). Read at most every 30 s; upgrading it does not
   * replace sessiond's server.
   */
  #installedVersion(): Promise<string> {
    if (!this.#versionProbe || Date.now() - this.#versionProbedAt >= 30_000) {
      this.#versionProbedAt = Date.now();
      // The server API and the plugin are OPENCODE_VERSION's: no other release starts.
      this.#versionProbe = toolGate(OPENCODE_SPEC).then((gate) => {
        if (gate.refused || !gate.version) {
          throw new Error(gate.words);
        }
        return gate.version;
      });
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

  /**
   * One tick of the config watcher: compare desired with applied, and apply
   * as {@link #applyIfNeeded} does; `now` (a fleet sync that moved the
   * fleet's servers) applies whatever runs.
   */
  async #configTick(now = false): Promise<void> {
    this.#cutOnDeadServers();
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method
    if (!this.#converging) {
      return;
    }
    let needed = now;
    this.#signInChecksDue();
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
      // The retiring keeper ends only once its server is replaced.
      needed = true;
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
        this.#applyIfNeeded(needed);
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
    this.#applyIfNeeded(needed);
  }

  /** The revision an apply was left for the next need on, said once ({@link #applyIfNeeded}). */
  #leftRevision: string | null = null;

  /**
   * A config change is applied now when something needs the machine's
   * server on it (`needed`: a fleet sync that moved the fleet's servers, a
   * session's start, a read of the fleet's servers, a retiring keeper) or
   * anything runs on it: a session or subagent on one of its generations, a
   * start queued or opening, a recovery. Otherwise nothing runs that would
   * take it, and starting a server for it is a server nobody asked for
   * (the catalog's five-minute refresh, a person's `opencode.json` edit, a
   * place added on an idle machine): it waits, `pending`, for the first
   * need ({@link #configSettled}, {@link #configCurrent}) or the first
   * session, whose next tick applies it.
   */
  #applyIfNeeded(needed: boolean): void {
    if (
      needed ||
      this.#slotHeld(this.#machine) ||
      this.#pendingSpawns.length > 0 ||
      this.#opening > 0 ||
      this.#recovering > 0 ||
      this.#pendingRecoveries.size > 0
    ) {
      this.#leftRevision = null;
      // biome-ignore lint/complexity/noVoid: fire-and-forget; the attempt manages its own errors
      void this.#attemptConfigApply();
      return;
    }
    if (this.#leftRevision !== this.#desiredHash) {
      this.#leftRevision = this.#desiredHash;
      console.log(
        JSON.stringify({
          type: "config-convergence",
          state: "pending",
          detail: `revision ${this.#desiredHash?.slice(0, 8)}… left for the next need: nothing runs on the machine's server ${this.#serverOwner.active?.procId ?? "(none)"}`,
          at: Date.now(),
        })
      );
    }
  }

  /**
   * A server in use whose active generation no keeper holds any more takes no
   * new session: its slot's client is dropped and the server ensured again,
   * which retires that generation and starts one on the current keeper. Its
   * sessions keep their own clients and turns; each moves over at rest.
   */
  async #leaveUnkept(): Promise<void> {
    for (const slot of this.#slots()) {
      if (!(
        slot.client &&
        // biome-ignore lint/performance/noAwaitInLoops: one slot at a time; each read asks the keepers
        (await slot.owner.activeKeeperGone().catch(() => false))
      )) {
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
        const client = this.#adopt(slot, identity);
        slot.applied = revision;
        // biome-ignore lint/complexity/noVoid: publication does not wait for busy incumbent sessions to migrate
        void this.#handoffIdle().catch(console.warn);
        // What it offers, as the catalog it started on says (#catalog).
        // biome-ignore lint/complexity/noVoid: the catalog read rides on the start; nothing waits on it
        void this.#readAccountCatalogSoon(account, client);
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
          "An OpenCode server on this machine is an older version (1.x) that CawCo can't reach. CawCo ends it once nothing runs on it and starts the current version in its place; try again then."
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
        throw new Error(
          "This message wasn't sent: this session's OpenCode server is being replaced, and its last turn is still running on the old one. Send it again."
        );
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
          "This message wasn't sent: this session's OpenCode server is being replaced, and a subagent's turn is still running on the old one. Send it again."
        );
      }
      if (session.turnInFlight) {
        await this.#reconcile(session);
      }
      if (session.turnInFlight) {
        throw new Error(
          "This message wasn't sent: this session's OpenCode server is being replaced, and its last turn is still running on the old one. Send it again."
        );
      }
      const client = this.#clientForGeneration(target);
      // The session's location on the target, ready as a spawn's is before
      // its first prompt: CawCo's plugin loaded there and its MCP servers
      // done connecting. The target boots it on its first request, and a
      // prompt before its servers connect loses their tools for that turn
      // (anomalyco/opencode#54794).
      await assertPluginLoaded(
        client,
        session.directory,
        this.#lifetimeSignal()
      );
      const unconnected = await waitForMcp(
        client,
        session.directory,
        this.#lifetimeSignal()
      );
      // Both generations read one database: the newest message each sees is
      // the same, or the candidate has not caught up with the incumbent.
      const histories = await Promise.all(
        [oldClient, client].map(async (reader) =>
          answerOf(
            await askOpencode((options) =>
              reader.message.list(
                { sessionID: sessionId, order: "desc", limit: 1 },
                options
              )
            ),
            `the last message of ${sessionId}`
          )
        )
      );
      const settled = histories.map((history) => {
        const [last] = history.data;
        return last ? `${last.id}/${last.type}` : "empty";
      });
      if (settled[0] !== settled[1]) {
        throw new Error(
          "This message wasn't sent: this session's new OpenCode server hasn't caught up with its last turn yet. Send it again."
        );
      }
      if (!(await idleOn())) {
        throw new Error(
          "This message wasn't sent: this session's OpenCode server is being replaced, and a turn started on the old one. Send it again."
        );
      }
      if (
        this.#sessions.get(session.instanceId) !== session ||
        this.#sessionOwners.get(session.instanceId)?.procId !== old.procId
      ) {
        throw new Error(
          "This message wasn't sent: this session's OpenCode server changed while the message was on its way. Send it again."
        );
      }
      if (slot.owner.active?.procId !== target.procId) {
        throw new Error(
          "This message wasn't sent: this session's OpenCode server changed while the message was on its way. Send it again."
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
        throw new Error(
          "This message wasn't sent: this session stopped or restarted while its OpenCode server was being replaced. Send it again."
        );
      }
      await session.mcpUnconnected(unconnected);
    })().finally(() => this.#migrations.delete(session.instanceId));
    this.#migrations.set(session.instanceId, migrating);
    return migrating;
  }

  async #prepareDispatch(session: OpencodeSession): Promise<void> {
    if (this.#applyGate) {
      await this.#applyGate.promise;
    }
    // The account's server stopped for being idle, or went down, since the
    // session last ran: it starts again, and the session goes to it. A
    // message sent is an explicit attempt, as a session's start is: a start
    // refused earlier is tried again for it (ServerStart).
    if (session.account !== undefined) {
      await this.#ensureAccount(session.account, true);
    }
    await this.#migrate(session);
    if (this.#sessions.get(session.instanceId) !== session) {
      throw new Error(
        "This message wasn't sent: this session stopped or restarted while the message was on its way. Send it again."
      );
    }
    const identity = this.#sessionOwners.get(session.instanceId);
    if (!(identity && session.sessionId)) {
      throw new Error(
        "This message wasn't sent: no OpenCode server holds this session right now. Send it again."
      );
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
    return this.#pendingOperations().length > 0;
  }

  /** The operations still pending against this adapter's servers, in words. */
  #pendingOperations(): string[] {
    return [
      ...(this.#custodyReadiness() ? [] : ["custody not decided"]),
      ...(this.#applyGate === null ? [] : ["a config apply"]),
      ...(this.#pendingSpawns.length > 0
        ? [`${this.#pendingSpawns.length} start(s) queued`]
        : []),
      ...(this.#opening > 0 ? [`${this.#opening} session(s) opening`] : []),
      ...(this.#mutatingMcp > 0 ? ["an MCP change"] : []),
      ...(this.#migrations.size > 0
        ? [`handoff of ${[...this.#migrations.keys()].join(", ")}`]
        : []),
      ...(this.#moves.size > 0
        ? [`move of ${[...this.#moves.keys()].join(", ")}`]
        : []),
      ...(this.#pendingRecoveries.size > 0 ||
      this.#recovering > 0 ||
      this.#recoveryWaiters.length > 0
        ? ["a recovery"]
        : []),
    ];
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
          ...Array.from({ length: this.#syncing }, (_, n) => `fleet-sync:${n}`),
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

  /**
   * Why this exact generation is not idle, in words for the retirement's
   * log line; undefined once two complete reads with a real sampling gap say
   * it runs nothing, no operation is pending and no session is bound to it.
   */
  async #whyNotIdle(identity: ServerIdentity): Promise<string | undefined> {
    if (isV1(identity)) {
      return (await this.#v1Idle(identity))
        ? undefined
        : "the 1.x server runs something or was not read (its own line says which)";
    }
    const pending = (): string | undefined => {
      const operations = this.#pendingOperations();
      return operations.length > 0
        ? `operations pending: ${operations.join(", ")}`
        : undefined;
    };
    const unread = (snapshot: ActivitySnapshot): string | undefined => {
      if (!snapshot.known) {
        return "its activity is not known";
      }
      return snapshot.instances.length > 0
        ? `its activity is busy: ${snapshot.instances.join(", ")}`
        : undefined;
    };
    const before = pending();
    if (before) {
      return before;
    }
    const activity = this.#activity(identity);
    const client = this.#clientForGeneration(identity);
    const first = await activity.sample(client, true);
    const firstWhy = unread(first) ?? pending();
    if (firstWhy) {
      return firstWhy;
    }
    await Bun.sleep(2000);
    const second = await activity.sample(client, true);
    const secondWhy = unread(second);
    if (secondWhy) {
      return secondWhy;
    }
    if (
      this.#slotOfGeneration(identity)?.owner.active?.procId !== identity.procId
    ) {
      await this.#handoffIdle();
      const bound = [...this.#sessionOwners]
        .filter(([, owner]) => owner.procId === identity.procId)
        .map(([instanceId]) => instanceId);
      if (bound.length > 0) {
        return `session(s) still bound to it: ${bound.join(", ")}`;
      }
    }
    if (second.sampledAt < first.sampledAt + 2000) {
      return "its two readings were less than 2 s apart";
    }
    return pending();
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
   * retire their generation. What only a new server takes is its launch
   * config (`OPENCODE_CONFIG_CONTENT`, read once as it starts), which
   * carries the fleet's MCP servers ({@link syncOpencodeMcp}); a changed
   * `opencode.json` every running server reloads in its booted locations
   * itself, and is replaced the same way ({@link configHash}).
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
      const config = await this.#launchConfig();
      const launch = await serverLaunch(
        config,
        await this.#plugin(),
        targetHash
      );
      await this.#serverOwner.replace(
        launch,
        async (identity, signal) => {
          const candidate = this.#clientForGeneration(identity);
          if (!(await this.#readsThisConfig(candidate, signal))) {
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
          this.#activeFleet = {
            procId: identity.procId,
            fleet: fleetDigest(config),
          };
          this.#appliedHash = targetHash;
          this.#appliedVersion = targetVersion;
          this.#configError = null;
          // biome-ignore lint/complexity/noVoid: publication does not wait for busy incumbent sessions to migrate
          void this.#handoffIdle().catch(console.warn);
          // What was reported of the fleet's servers may have been read on
          // other servers than this generation runs: the pass reads them
          // again unless a reading of the same servers stands (#mendFleetMcp).
          this.#mendLater(true);
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
    // Within a cutover, the cutover's own time bounds it.
    const info = signal
      ? await client.server.info({ signal })
      : answerOf(
          await askOpencode((options) => client.server.info(options)),
          "its version"
        );
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
    probeStarted();
    // The version gate's own word on it: the start's refusal, typed.
    const gate = await toolGate(OPENCODE_SPEC);
    const installed = gate.refused !== "not-installed";
    const { version } = gate;
    // The catalog the machine reports, so a picker lists OpenCode's models
    // with no OpenCode session running: the machine's server is started for
    // it when none runs. One that cannot be read says why instead.
    const read = installed
      ? await this.#ensure()
          .then(() => this.#catalog())
          .then(
            (models) => ({ models }),
            (error: unknown) => {
              console.warn(`[opencode] model catalog unavailable: ${error}`);
              return {
                modelsUnread: `OpenCode's server here didn't list its models (${errorText(error)}).`,
              };
            }
          )
      : {};
    // An OpenCode at another version is the machine's word on OpenCode; one
    // not there is no fault.
    const reason =
      (gate.refused === "version" ? gate.words : undefined) ?? this.authReason;
    return {
      harness: "opencode",
      installed,
      ...(version ? { version } : {}),
      auth: installed ? "authenticated" : "unauthenticated",
      ...(reason ? { authReason: reason } : {}),
      ...(gate.refused ? { refused: gate.refused } : {}),
      capabilities: OPENCODE_CAPABILITIES,
      ...read,
      ...(this.signInFaults.length > 0
        ? { signInFaults: this.signInFaults }
        : {}),
    };
  }

  /** The machine's own sign-ins their providers last refused, read once from {@link SIGN_IN_FAULTS}. */
  #faults: Map<string, SignInFault> | undefined;

  #faultsHeld(): Map<string, SignInFault> {
    if (!this.#faults) {
      let stored: SignInFault[] = [];
      try {
        stored = existsSync(SIGN_IN_FAULTS)
          ? (JSON.parse(readFileSync(SIGN_IN_FAULTS, "utf8")) as SignInFault[])
          : [];
      } catch (error) {
        console.warn(
          `[opencode] ${SIGN_IN_FAULTS} could not be read (${errorText(error)}); no refused sign-in is reported until one is refused again`
        );
      }
      this.#faults = new Map(stored.map((fault) => [fault.provider, fault]));
    }
    return this.#faults;
  }

  /**
   * The machine's own OpenCode sign-ins their providers refused the last
   * time a session here used them: what the machine's report carries
   * ({@link detect}), and the daemon's beat when it moves.
   */
  get signInFaults(): SignInFault[] {
    return [...this.#faultsHeld().values()].sort((a, b) =>
      a.provider.localeCompare(b.provider)
    );
  }

  /**
   * A turn on the machine's server ended on `provider`: refused by it
   * (`refusal`, the provider's words), or answered. A refusal is a sign-in's
   * fault only when the machine's own OpenCode holds a sign-in for that
   * provider (Zen's keyless free tier refusing is no sign-in's); an answer
   * clears the provider's fault. Kept across a restart, said once.
   */
  #signInOutcome(provider: string, refusal: string | undefined): void {
    if (refusal !== undefined) {
      this.#recordFault(provider, refusal).catch((error: unknown) =>
        console.warn(
          `[opencode] the machine's own ${provider} sign-in's fault was not recorded: ${errorText(error)}`
        )
      );
      return;
    }
    if (!this.#faultsHeld().delete(provider)) {
      return;
    }
    console.info(
      `[opencode] the machine's own ${provider} sign-in answered again`
    );
    this.#saveFaults();
  }

  /** The integrations whose OpenCode offers an OAuth method, as its own list last said (`GET /api/integration`). */
  #oauthIntegrations: Set<string> | undefined;

  /**
   * `provider`'s sign-in recorded as not working, `why`, in core's words
   * with the fix the OpenCode here offers ({@link opencodeSignInFaultWords}):
   * from its integration's methods, and whether the sign-in is an OAuth one.
   */
  async #recordFault(provider: string, why: string): Promise<void> {
    const kind = opencodeOwnSignInTypes()[provider];
    if (!kind) {
      return;
    }
    if (!this.#oauthIntegrations) {
      const client = await this.#ensure();
      const quiet = at(await quietDir());
      this.#oauthIntegrations = oauthIntegrationsOf(
        answerOf(
          await askOpencode((options) =>
            client.integration.list(quiet, options)
          ),
          "its integrations"
        )
      );
    }
    const words = opencodeSignInFaultWords(
      machineLabel(hostname()),
      opencodeModels.providerName(provider),
      why,
      {
        integration: provider,
        offersOAuth: this.#oauthIntegrations.has(provider),
        heldOAuth: kind === "oauth",
      }
    );
    const faults = this.#faultsHeld();
    if (faults.get(provider)?.words === words) {
      return;
    }
    faults.set(provider, { provider, words, at: Date.now() });
    console.warn(`[opencode] ${words}`);
    this.#saveFaults();
  }

  #saveFaults(): void {
    writeJson(SIGN_IN_FAULTS, this.signInFaults).catch((error: unknown) =>
      console.warn(
        `[opencode] ${SIGN_IN_FAULTS} was not written: ${errorText(error)}`
      )
    );
  }

  /** When the machine's own sign-ins were last checked, and their rows then: a check is due hourly, or when a row changed. */
  #signInsCheckedAt = 0;
  #signInRows: string | undefined;
  #checkingSignIns: Promise<void> | null = null;
  /** Each key credential's last request, by credential id: its value's hash and when. */
  readonly #keyAsked = new Map<string, { at: number; value: string }>();

  /**
   * The machine's own OpenCode sign-ins checked, before any turn finds them
   * refused: when the agent starts, every {@link SIGN_IN_CHECK_MS}, and when
   * one of them changed (a sign-in, a refresh, a removal). One at a time.
   */
  #signInChecksDue(): void {
    const rows = JSON.stringify(opencodeOwnChanges());
    if (
      this.#checkingSignIns ||
      (rows === this.#signInRows &&
        Date.now() < this.#signInsCheckedAt + SIGN_IN_CHECK_MS)
    ) {
      return;
    }
    this.#signInRows = rows;
    this.#signInsCheckedAt = Date.now();
    this.#checkingSignIns = this.#checkOwnSignIns()
      .catch((error: unknown) =>
        console.warn(
          `[opencode] the machine's own sign-ins were not checked: ${errorText(error)}`
        )
      )
      .finally(() => {
        this.#checkingSignIns = null;
      });
  }

  /**
   * Each of the machine's own OpenCode sign-ins, as OpenCode would use it
   * ({@link signInCheck}): one that cannot work is a fault, in the words a
   * refused turn has; one that works clears its provider's. A provider no
   * sign-in is held for any more has none.
   */
  async #checkOwnSignIns(): Promise<void> {
    const client = await this.#ensure();
    const quiet = at(await quietDir());
    const [own, [integrations, models]] = await Promise.all([
      this.#ownCredentials(),
      askOpencode((options) =>
        Promise.all([
          client.integration.list(quiet, options),
          client.model.list(quiet, options),
        ])
      ).then((read) => answerOf(read, "its integrations and models")),
    ]);
    const refreshable = new Set(
      integrationsOf(integrations).flatMap((integration) =>
        (integration.methods ?? []).flatMap((method) =>
          method.type === "oauth" && method.id
            ? [`${integration.id}/${method.id}`]
            : []
        )
      )
    );
    this.#oauthIntegrations = oauthIntegrationsOf(integrations);
    const changed = opencodeOwnChanges();
    const faults = this.#faultsHeld();
    let moved = false;
    for (const provider of [...faults.keys()]) {
      if (!own.some((one) => one.integrationID === provider)) {
        faults.delete(provider);
        moved = true;
      }
    }
    if (moved) {
      this.#saveFaults();
    }
    for (const credential of own) {
      const provider = credential.integrationID;
      const model = models.data.find((one) => one.providerID === provider);
      // biome-ignore lint/performance/noAwaitInLoops: one credential at a time, each at most one request
      const verdict = await this.#signInCheck(credential, {
        refreshable: refreshable.has(
          `${provider}/${String(credential.value.methodID ?? "")}`
        ),
        package: model?.package,
        baseURL: (model?.settings as { baseURL?: unknown } | undefined)
          ?.baseURL,
        renewedSince:
          (changed[credential.id] ?? 0) > (faults.get(provider)?.at ?? 0),
      });
      if (verdict.state === "fault") {
        this.#signInOutcome(provider, verdict.why);
      } else if (verdict.state === "works") {
        this.#signInOutcome(provider, undefined);
      }
    }
  }

  /**
   * Whether one of the machine's own sign-ins works, as OpenCode 2.0.28 uses
   * it (`Integration.connection.get`): an OAuth sign-in is refreshed only
   * through its integration's method for it, when it expires within five
   * minutes, else sent as it is; a key is sent as it is.
   *
   * - OAuth, past its expiry, that OpenCode cannot refresh (its integration
   *   has no method for it, as Anthropic's has none in 2.0.28, or it holds
   *   no refresh token): a fault, read locally. Unexpired: it works when it
   *   was signed in again since its fault, else this cannot tell (a turn
   *   says). Refreshable: OpenCode refreshes it as it is used, and CawCo
   *   never spends a rotating refresh token for it.
   * - A key, where its provider has a free read-only list of models
   *   (Anthropic's `/models`, an OpenAI-compatible `/models`): one request,
   *   at most once an {@link SIGN_IN_CHECK_MS} for the same key. A 401 or
   *   403 is a fault in the provider's words, a 2xx works, anything else
   *   cannot tell.
   */
  async #signInCheck(
    credential: OpencodeOwnCredential,
    read: {
      baseURL: unknown;
      package: string | undefined;
      refreshable: boolean;
      renewedSince: boolean;
    }
  ): Promise<SignInVerdict> {
    const { value } = credential;
    if (value.type === "oauth") {
      return oauthVerdict(value, read.refreshable, read.renewedSince);
    }
    if (value.type !== "key" || typeof value.key !== "string") {
      return { state: "unknown" };
    }
    return await this.#keyVerdict(credential.id, value.key, read);
  }

  /** A key's check: one request to its provider's list of models, at most once an {@link SIGN_IN_CHECK_MS} for the same key. */
  async #keyVerdict(
    id: string,
    key: string,
    read: { baseURL: unknown; package: string | undefined }
  ): Promise<SignInVerdict> {
    const request = keyCheckRequest(key, read.package, read.baseURL);
    if (!request) {
      return { state: "unknown" };
    }
    const hash = createHash("sha256").update(key).digest("hex");
    const asked = this.#keyAsked.get(id);
    if (asked?.value === hash && Date.now() < asked.at + SIGN_IN_CHECK_MS) {
      return { state: "unknown" };
    }
    this.#keyAsked.set(id, { at: Date.now(), value: hash });
    let checked: Bounded<{ message: string; ok: boolean; status: number }>;
    try {
      checked = await readWithin(KEY_CHECK_TIMEOUT_MS, async (signal) => {
        const response = await fetch(request.url, {
          headers: request.headers,
          signal,
        });
        if (response.status !== 401 && response.status !== 403) {
          return { ok: response.ok, status: response.status, message: "" };
        }
        const body = (await response.json().catch(() => undefined)) as
          { error?: { message?: unknown } } | undefined;
        return {
          ok: false,
          status: response.status,
          message:
            typeof body?.error?.message === "string" ? body.error.message : "",
        };
      });
    } catch {
      return { state: "unknown" };
    }
    switch (checked.kind) {
      case "unanswered":
        // No answer in time decides nothing about the key.
        return { state: "unknown" };
      case "answered": {
        const { ok, status, message } = checked.value;
        if (ok) {
          return { state: "works" };
        }
        if (status === 401 || status === 403) {
          return {
            state: "fault",
            why: `${status}${message ? ` ${message}` : ""}`,
          };
        }
        return { state: "unknown" };
      }
      default: {
        const unhandled: never = checked;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * Why an OpenCode session cannot start here, while that stands: the start
   * of the machine's server, or an account's, that failed, said as its owner
   * recorded it (ServerStart). The machine's report carries it to the home's
   * word on this machine: {@link detect}, and the daemon's beat whenever it
   * moves, so it goes once a start succeeds.
   */
  get authReason(): string | undefined {
    return (
      this.#slots()
        .map((slot) => slot.owner.refusal)
        .find((refusal) => refusal !== null) ?? undefined
    );
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
        "An OpenCode server on this machine is an older version (1.x) that CawCo can't reach. CawCo ends it once nothing runs on it and starts the current version in its place; try again then."
      );
    }
    const dropWhenGone = async (
      input: string | URL | Request,
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
      syncSection("OpenCode 1.x database backed up (SQLite)", () =>
        backupV1Database(xdgDataHome())
      );
      await retireV1Plugins();
    })().catch((error: unknown) => {
      this.#cutover = null;
      throw error;
    });
    return this.#cutover;
  }

  /**
   * The machine's server: the one running, or one started now. A start it
   * refused is answered from the owner's record, unless a session is being
   * started or sent a message (`attempt`), which always tries (ServerStart).
   */
  #ensure(attempt = false): Promise<OpencodeClient> {
    if (this.#client) {
      return Promise.resolve(this.#client);
    }
    if (attempt && this.#ready && this.#serverOwner.refusal) {
      // A read answering the standing refusal is in flight: a session's
      // start still tries, once that read has answered.
      return this.#ready.catch(() => this.#ensure(true));
    }
    if (!this.#ready) {
      // A spawn after a dispose is a revival: the adapter is a module
      // singleton, the server it attaches to outlived the teardown.
      this.#disposed = false;
      this.#ready = (async () => {
        // Only OPENCODE_VERSION starts: its server API and plugin are what this speaks.
        await this.#installedVersion();
        await this.#cutoverV1();
        const launch = await serverLaunch(
          await this.#launchConfig(),
          await this.#plugin(),
          await this.#hashConfig()
        );
        // Not a child of this process: the server goes under the keeper, so
        // an agent restart takes no session with it.
        const start: ServerStart = {
          inputs: await startInputs(launch),
          attempt,
        };
        const identity = await this.#serverOwner.ensure(launch, start);
        const client = this.#adopt(this.#machine, identity);
        answerOf(
          await askOpencode((options) => client.server.info(options)),
          "its server info"
        );
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
              const config = await this.#launchConfig();
              await this.#verifyApply(
                client,
                identity,
                initialVersion,
                undefined,
                await serverLaunch(config, await this.#plugin(), initialHash),
                initialHash
              );
              this.#appliedHash = initialHash;
              this.#appliedVersion = initialVersion;
              this.#verifiedProcId = identity.procId;
              // Its launch is this agent's own (its flags carry the launch
              // config's hash), so it runs these fleet servers.
              this.#activeFleet = {
                procId: identity.procId,
                fleet: fleetDigest(config),
              };
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
  #ensureAccount(account: string, attempt = false): Promise<OpencodeClient> {
    const slot = this.#accountSlot(account);
    if (slot.client) {
      return Promise.resolve(slot.client);
    }
    if (
      attempt &&
      slot.ready &&
      (slot.owner.refusal || this.#serverOwner.refusal)
    ) {
      // As in #ensure: a session's start tries once the read in flight answers.
      return slot.ready.catch(() => this.#ensureAccount(account, true));
    }
    slot.ready ??= (async () => {
      slot.starting = true;
      await this.#ensure(attempt);
      const { revision, launch } = await this.#accountRevision(account);
      await prepareAccountServer(account);
      const identity = await slot.owner.ensure(launch, {
        inputs: await startInputs(launch),
        attempt,
      });
      if (identity.launch === launchOf(launch)) {
        const adopted = this.#adopt(slot, identity);
        answerOf(
          await askOpencode((options) => adopted.server.info(options)),
          "its server info"
        );
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
    const put = await askOpencode(async (options) => {
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
    });
    answerOf(put, `account ${account}'s credential`);
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
    const models = (
      await opencodeCatalog(client, await quietDir(), provider)
    ).filter((row) => row.value !== "default");
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
    const own = await opencodeCatalog(await this.#ensure(), await quietDir());
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
          answerOf(
            await askOpencode((options) =>
              client.mcp.connect({ server: "cawco", ...at(directory) }, options)
            ),
            "the cawco MCP reconnect"
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
    if ((await opencodeBinary()) === undefined) {
      return [];
    }
    const client = await this.#ensure();
    const listed = await client.integration.list(at(await quietDir()));
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
   * MCP servers ({@link OPENCODE_FLEET_MCP}), and its `plan` agent off
   * ({@link PLAN_AGENT_OFF_CONFIG}). The launch
   * config is the highest of a server's config documents but managed
   * settings (core config.ts `load`: `...content, ...managedSettings`), so a
   * fleet server wins over a user's own of the same name.
   */
  async #launchConfig(): Promise<Record<string, unknown>> {
    // A server starts only on the catalog the agent holds, never on one
    // OpenCode would fall back to (its cache, or the binary's own copy).
    if (holdsCatalog()) {
      await opencodeModels.ready();
    }
    const plugin = await this.#plugin();
    const fleet = (await isMachineAgent())
      ? recordOf(await readJson<Record<string, unknown>>(OPENCODE_FLEET_MCP))
      : {};
    return {
      ...STATIC_POLICY,
      ...PLAN_AGENT_OFF_CONFIG,
      mcp: {
        servers: {
          ...fleet,
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
  #releaseDirectory(
    directory: string,
    identity: ServerIdentity,
    caller = "directory release"
  ): void {
    // One release of a location at a time: a second asked while one waits
    // is that one.
    const key = `${identity.procId}\u0000${directory}`;
    if (this.#releasing.has(key)) {
      return;
    }
    this.#releasing.add(key);
    this.#disposeUnused(directory, identity, caller)
      .then((settled) => {
        if (!settled) {
          setTimeout(() => {
            this.#releasing.delete(key);
            this.#releaseDirectory(directory, identity, caller);
          }, DIRECTORY_RELEASE_RETRY_MS).unref();
          return;
        }
        this.#releasing.delete(key);
      })
      .catch((error: unknown) => {
        this.#releasing.delete(key);
        console.warn(
          `[opencode] ${directory}: releasing its location failed: ${errorText(error)}`
        );
      });
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
    answerOf(
      await askOpencode((options) =>
        client.debug.location.evict(at(directory), options)
      ),
      `the eviction of ${directory}`
    );
    console.info(
      `[opencode] ${directory}: location evicted by ${caller}, nothing attached and no turn running`
    );
    return true;
  }

  /** Whether the server runs any session in `directory` now; a read not answered is the caller's error, never "no". */
  async #runningIn(
    client: OpencodeClient,
    directory: string
  ): Promise<boolean> {
    const sessions = answerOf(
      await askOpencode(async (options) => {
        const running = Object.keys(await client.session.active(options));
        return await Promise.all(
          running.map((sessionID) => client.session.get({ sessionID }, options))
        );
      }),
      `which sessions run in ${directory}`
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
      // The feed is up when its first event comes, given RECOVERY_TIMEOUT_MS;
      // the signal the read hands it then only ever aborts on `stopped`.
      const connection = new AbortController();
      let connected = false;
      let unavailable = `OpenCode subscription unavailable: ${identity.procId}`;
      try {
        const client = this.#clientForGeneration(identity);
        let feed: AsyncIterator<V2Event> | undefined;
        // biome-ignore lint/performance/noAwaitInLoops: one connect per round; a dropped feed is subscribed again
        const first = await askOpencode(({ signal }) => {
          feed = client.event
            .subscribe({ signal: AbortSignal.any([signal, connection.signal]) })
            [Symbol.asyncIterator]();
          return feed.next();
        }, stopped);
        switch (first.kind) {
          case "unanswered":
            unavailable = `OpenCode subscription unavailable: ${notAnswered("its event feed", first)}`;
            console.warn(`[opencode] ${identity.procId}: ${unavailable}`);
            break;
          case "answered": {
            let next = first.value;
            while (!(next.done || stopped.aborted)) {
              if (!connected) {
                connected = true;
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
              this.#route(next.value, identity);
              // biome-ignore lint/performance/noAwaitInLoops: a feed's events are routed in the order they come
              next = await (feed as AsyncIterator<V2Event>).next();
            }
            break;
          }
          default: {
            const unhandled: never = first;
            throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
          }
        }
      } catch {
        // The feed ended or dropped; reconnect below unless stopped.
      } finally {
        if (connected && !stopped.aborted) {
          this.#pumpConnected.delete(key);
        }
        connection.abort();
        ready.reject(new Error(unavailable));
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

  /**
   * THE SERVER-DEATH CUT, on every tick of the config watcher: a session
   * whose turn is open on a server process that is gone (killed from
   * outside, crashed: no shutdown it announced) has that turn ended cut, as
   * a shutdown cuts it ({@link OpencodeSession.serverGone}), which the hub
   * hands back to it on the next server, and the agent ends what its
   * commands left running (left-running.ts). Said in the log, with each
   * session it cut.
   */
  #cutOnDeadServers(): void {
    const cut = [...this.#sessions.values()].filter((session) => {
      const pid = session.serverPidNow();
      return (
        pid !== undefined && !isAlive(listedPid(pid)) && session.serverGone()
      );
    });
    if (cut.length > 0) {
      console.warn(
        `[opencode] the server process under ${cut.map((session) => `${session.instanceId} (pid ${session.serverPidNow()})`).join(", ")} died; their open turns end cut`
      );
    }
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
      // The jobs that ended while nothing was subscribed go first: a missed
      // turn's end, read next, says what still runs.
      await session.reconcileBackground().catch((error: unknown) => {
        console.warn(
          `[opencode] ${session.instanceId}: its background jobs were not reconciled: ${errorText(error)}`
        );
      });
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
    const active = async (server: OpencodeClient) =>
      answerOf(
        await askOpencode((options) => server.session.active(options)),
        "which sessions run"
      );
    const readings = await Promise.all(
      (await this.#liveGenerations()).map(async (identity) => {
        const reader = this.#clientForGeneration(identity);
        return {
          client: reader,
          running: sessionKey in (await active(reader)),
        };
      })
    );
    const client = readings.find(({ running }) => running)?.client;
    if (!client) {
      return false;
    }
    answerOf(
      await askOpencode((options) =>
        client.session.interrupt({ sessionID: sessionKey }, options)
      ),
      `the interrupt of ${sessionKey}`
    );
    if (sessionKey in (await active(client))) {
      throw new Error(`OpenCode session ${sessionKey} is still running`);
    }
    return true;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: runner idle and last-directory-owner confirmation must remain one ordered transaction
  async endSession(
    sessionKey: string,
    dir: string,
    instanceId?: string,
    claimed: readonly string[] = [],
    forget = false
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
    const active = async (server: OpencodeClient) =>
      answerOf(
        await askOpencode((options) => server.session.active(options)),
        "which sessions run"
      );
    const generations = await this.#completeGenerations();
    for (const identity of generations) {
      const client = this.#clientForGeneration(identity);
      // biome-ignore lint/performance/noAwaitInLoops: each generation owns distinct runners
      if (sessionKey in (await active(client))) {
        // Interrupt only this session on its captured generation.
        answerOf(
          await askOpencode((options) =>
            client.session.interrupt({ sessionID: sessionKey }, options)
          ),
          `the interrupt of ${sessionKey}`
        );
      }
      // Positive idle receipt precedes resource release.
      const after = await active(client);
      if (sessionKey in after) {
        throw new Error(
          "This session didn't end: OpenCode still runs its turn after it was interrupted. End it again."
        );
      }
      for (const [id, session] of this.#sessions) {
        if (id === instanceId && session.sessionId === sessionKey) {
          // biome-ignore lint/performance/noAwaitInLoops: release each handle of exactly this conversation
          await session.dispose();
        }
      }
      // The location is the remaining sessions'; released only by its last.
      if (!(
        [...this.#sessions.values()].some(
          (session) => session.directory === dir
        ) || (await this.#runningIn(client, dir))
      )) {
        answerOf(
          await askOpencode((options) =>
            client.debug.location.evict(at(dir), options)
          ),
          `the eviction of ${dir}`
        );
      }
    }
    if (this.#operationsPending()) {
      throw new Error(
        "This session didn't end: this machine's OpenCode servers changed while CawCo was ending it. End it again."
      );
    }
    // Nothing reattaches it, so nothing reads its jobs again.
    if (forget) {
      forgetBackground(sessionKey);
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
        "CawCo couldn't read which sessions OpenCode runs on this machine: an OpenCode server is running that CawCo has no record of. Try again."
      );
    }
    if (generations.length > 0 && this.#operationsPending()) {
      throw new Error(
        "CawCo couldn't read which sessions OpenCode runs on this machine while its OpenCode servers are changing. Try again in a moment."
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
        const client = this.#clientForGeneration(identity);
        try {
          answerOf(
            await askOpencode((options) =>
              client.session.get({ sessionID: sessionKey }, options)
            ),
            `session ${sessionKey}`
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
        const sessions = answerOf(
          await askOpencode(async (options) => {
            const running = Object.keys(
              await client.session.active(options)
            ).filter((id) => !known.has(id));
            return await Promise.all(
              running.map((sessionID) =>
                client.session.get({ sessionID }, options)
              )
            );
          }),
          "which sessions run"
        );
        for (const session of sessions) {
          if (session.location.directory === directory) {
            unclaimed.add(session.id);
          }
        }
      })
    );
    if (this.#operationsPending()) {
      throw new Error(
        "CawCo couldn't read which sessions OpenCode runs on this machine: its OpenCode servers changed during the reading. Try again."
      );
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
   * error refuses it at once. One out of reach, or one that does not answer
   * in time ({@link ReattachUnanswered}), is tried again after
   * {@link RECOVERY_RETRY_FIRST_MS}, doubling to {@link RECOVERY_RETRY_MAX_MS},
   * until {@link RECOVERY_RETRY_BUDGET_MS}: then the reattach fails in its
   * own words, and the session is settled asleep (session.ts: unavailable),
   * its sends owed to its next start, which asks OpenCode again whether it
   * runs it. Never retried for good: 369 sessions asked OpenCode every 5 s
   * for an hour that it never answered (2026-10-23, obelisk).
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
        const delay = Math.min(
          RECOVERY_RETRY_FIRST_MS * 2 ** Math.min(attempt, 16),
          RECOVERY_RETRY_MAX_MS
        );
        if (Date.now() >= deadline) {
          await this.#decideFailed(spec, round);
          console.warn(
            `[opencode] recovery ${ctx.instanceId} gave up after ${attempt + 1} tries in ${Math.round((Date.now() - deadline + RECOVERY_RETRY_BUDGET_MS) / 1000)} s, past its ${RECOVERY_RETRY_BUDGET_MS / 1000} s: ${errorText(error)}`
          );
          throw new ReattachFailed(
            error instanceof ReattachUnanswered
              ? `${contactWords.reattachSilent(RECOVERY_RETRY_BUDGET_MS / 1000)} (${errorText(error)}). ${contactWords.reattachSilentNext}`
              : `CawCo couldn't take this session back after a restart: OpenCode didn't answer within ${RECOVERY_RETRY_BUDGET_MS / 1000} s (${errorText(error)}). Start it again.`,
            { cause: error }
          );
        }
        console.warn(
          `[opencode] recovery ${ctx.instanceId} waiting; retry ${attempt + 1} in ${delay}ms: ${errorText(error)}`
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
          `CawCo didn't take this session back after a restart: its conversation is running on ${busy.length} OpenCode servers at once, and CawCo stops none of them by itself. Stop the session, then start it again.`
        );
      }
      if (busy.length === 0) {
        for (const generation of states) {
          if (generation.state.kind === "refused") {
            throw new ReattachFailed(
              `CawCo couldn't take this session back after a restart: its OpenCode server refused it (${generation.state.reason}). Start it again.`
            );
          }
        }
        for (const generation of states) {
          if (generation.state.kind === "unreachable") {
            throw new Error(
              `its OpenCode server isn't reachable: ${generation.state.reason}`
            );
          }
          if (generation.state.kind === "unanswered") {
            throw new ReattachUnanswered(
              `OpenCode generation ${generation.identity.procId} has not said whether it runs ${resume.sessionKey}: ${generation.state.reason}`
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
        throw new Error("no OpenCode server is running for it");
      }
      const { identity, running } = chosen;
      const server = this.#clientForGeneration(identity);
      let read: Bounded<SessionInfo>;
      try {
        read = await askOpencode((options) =>
          server.session.get({ sessionID: resume.sessionKey }, options)
        );
      } catch (error) {
        if (notFound(error)) {
          return;
        }
        if (unreachable(error)) {
          throw error;
        }
        throw new ReattachFailed(
          `CawCo couldn't take this session back after a restart: its OpenCode server refused it (${errorText(error)}). Start it again.`,
          { cause: error }
        );
      }
      let session: SessionInfo;
      switch (read.kind) {
        case "answered":
          session = read.value;
          break;
        case "unanswered":
          throw new ReattachUnanswered(
            notAnswered(`session ${resume.sessionKey}`, read)
          );
        default: {
          const unhandled: never = read;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
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

  /**
   * OpenCode saves a tool output it cuts in its server's data dir, every
   * session's together ("[showing … of M; full output saved to <file>]",
   * 2.0.29), and its `read` cuts each line at 2000 characters, so the model
   * reads a long one by the shell. CawCo's plugin cuts a workspace
   * session's output itself, saving it whole in the session's own folder
   * and naming it there (opencode-plugin.ts `cutInto`).
   */
  // biome-ignore lint/suspicious/useAwait: implements Harness.spill's Promise contract
  async spill(
    spec: SpawnPayload,
    _cwd: string,
    workspace: string
  ): Promise<{ dir: string; spec: SpawnPayload }> {
    return { dir: workspaceSpillDir(workspace, spec.instanceId), spec };
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
    // A session started is an explicit attempt: a server start refused
    // earlier is tried again for it, once, before anything reads the
    // refusal (ServerStart). Every other read answers with the refusal.
    const account = spec.accountDir?.accountId;
    if (
      this.#serverOwner.refusal ||
      (account !== undefined && this.#accounts.get(account)?.owner.refusal)
    ) {
      await (account === undefined
        ? this.#ensure(true)
        : this.#ensureAccount(account, true));
    }
    if (spec.resume && !spec.resume.fork) {
      const recovered = await this.reattach(spec, ctx);
      if (recovered) {
        return recovered;
      }
    }
    if (!spec.resume) {
      await this.#ensure(true);
      await this.#configCurrent(account);
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
      const ask = async <T>(
        what: string,
        read: (options: { signal: AbortSignal }) => Promise<T>
      ): Promise<T> => answerOf(await askOpencode(read), what);
      const source = home
        ? await this.#ensureAccount(home)
        : await this.#ensure();
      const target =
        account === undefined
          ? await this.#ensure()
          : await this.#ensureAccount(account);
      let root: Awaited<ReturnType<OpencodeClient["session"]["export"]>>;
      try {
        root = await ask(`the export of ${sessionId}`, (options) =>
          source.session.export({ sessionID: sessionId }, options)
        );
      } catch (error) {
        if (notFound(error)) {
          // Not where the record says: it is already wherever it is.
          return;
        }
        throw error;
      }
      if (
        sessionId in
        (await ask("which sessions run", (options) =>
          source.session.active(options)
        ))
      ) {
        throw new Error(
          `OpenCode session ${sessionId} is running on its own server, so it does not move now.`
        );
      }
      const children = await allSessions(source, { parentID: sessionId });
      const exported = [
        root,
        ...(await Promise.all(
          children.map((child) =>
            ask(`the export of ${child.id}`, (options) =>
              source.session.export({ sessionID: child.id }, options)
            )
          )
        )),
      ];
      for (const one of exported) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: a parent is imported before its children
          await ask(`the import of ${one.info.id}`, (options) =>
            target.session.import(
              {
                info: one.info,
                messages: one.messages,
                location: { directory: one.info.location.directory },
              },
              options
            )
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
      await ask(`the removal of ${sessionId}`, (options) =>
        source.session.remove({ sessionID: sessionId }, options)
      );
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
      throw new Error(
        "This session didn't start: OpenCode's server on this machine isn't running. Start it again to try the server again."
      );
    }
    if (existing?.running && spec.resume?.atMessage && !spec.resume.fork) {
      throw new Error("OpenCode cannot rewind a running incumbent turn.");
    }
    // The fleet's baseline, the delegate type's and the spawn's own denials,
    // as session rules.
    const deniedRules: OpencodeRule[] = opencodeDenyRules([
      ...(await sessionFleetDenials()),
      ...(spec.denyTools ?? []),
    ]);
    // The location's readiness, awaited at the first dispatch, never at
    // publication: CawCo's plugin loaded there (the gate, failing closed),
    // CawCo's MCP server connected, and no other server still connecting (a
    // prompt before then loses the tools of a server still connecting,
    // anomalyco/opencode#54794). It answers the servers that did not connect,
    // which the session says once.
    const ready: Promise<McpNotConnected[]> = existing?.running
      ? Promise.resolve([])
      : (async () => {
          // Each wait has its own deadline, which says what it waited for.
          await assertPluginLoaded(client, ctx.cwd, this.#lifetimeSignal());
          return await waitForMcp(client, ctx.cwd, this.#lifetimeSignal());
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
    const ask = async <T>(
      what: string,
      read: (options: { signal: AbortSignal }) => Promise<T>
    ): Promise<T> => answerOf(await askOpencode(read), what);
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
      const { sessionKey, atMessage } = spec.resume;
      const forked = await ask(`the fork of ${sessionKey}`, (options) =>
        source.session.fork(
          {
            sessionID: sessionKey,
            ...(atMessage ? { before: atMessage } : {}),
          },
          options
        )
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
      const { sessionKey } = spec.resume;
      await this.#bringHome(sessionKey, account);
      let found: Bounded<SessionInfo>;
      try {
        found = await askOpencode((options) =>
          client.session.get({ sessionID: sessionKey }, options)
        );
      } catch (error) {
        throw new Error(
          `opencode has no session ${sessionKey} to resume: ${errorText(error)}`,
          { cause: error }
        );
      }
      switch (found.kind) {
        case "answered":
          break;
        case "unanswered":
          // Not "no such session": it did not say.
          throw new Error(
            notAnswered(`session ${sessionKey} to resume`, found)
          );
        default: {
          const unhandled: never = found;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      sessionId = sessionKey;
    } else {
      // Its permission set is put before its first turn, whole, with what it
      // needs then (a fenced session's fence reads the location's MCP servers).
      const created = await ask("a new session", (options) =>
        client.session.create(
          {
            location: { directory: ctx.cwd },
            agent,
            ...(model ? { model } : {}),
          },
          options
        )
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
      const { atMessage } = spec.resume;
      try {
        await ask("the rewind", (options) =>
          client.session.revert.stage(
            { sessionID: sessionId, messageID: atMessage, files: true },
            options
          )
        );
        await ask("the rewind", (options) =>
          client.session.revert.commit({ sessionID: sessionId }, options)
        );
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
      permissionMode: offeredMode(spec.permissionMode),
      effort: spec.effort,
      canDelegate: spec.canDelegate,
      instructions: spec.instructions,
      deniedRules,
      account,
      fence: spec.fence === true,
      lead: spec.lead === true,
      applied,
      ready,
      // Only the machine's server sends with the machine's own sign-ins; an
      // account's runs on the account, whose faults stand on its own row.
      turnOutcome: (provider, refusal) => {
        if (account === undefined) {
          this.#signInOutcome(provider, refusal);
        }
      },
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
      // A config being applied holds every send. A session still on a
      // retiring server is held only for a send that would start a turn
      // there: one into its running turn starts none, so the session still
      // comes to rest and moves, and it is read at the turn's next step. A
      // turn that ends between that check and the admission is a turn
      // started there, which the server's retirement waits out.
      isConfigGateHeld: (joinsTurn) =>
        this.#applyGate !== null ||
        (!joinsTurn &&
          this.#sessionOwners.get(ctx.instanceId)?.procId !==
            slot.owner.active?.procId),
      readActivity: () =>
        this.#sessionBusy(sessionId, this.#sessionOwners.get(ctx.instanceId)),
      serverPid: () =>
        (this.#sessionOwners.get(ctx.instanceId) ?? identity).pid,
      prepareDispatch: () => this.#prepareDispatch(session),
    });
    this.#sessionOwners.set(ctx.instanceId, identity);
    // A session an earlier agent left mid-turn: the hub still waits on that
    // turn's end, which the reconcile after its subscription comes up pays.
    if (spec.resume && !spec.resume.fork && turnWasOpen(sessionId)) {
      session.inheritOpenTurn();
    }
    // Its jobs in the background run on in the server; their ends wake it.
    if (spec.resume && !spec.resume.fork) {
      session.inheritBackground();
    }
    if (spec.reattachOnly === true) {
      session.sleepAfterRecovery();
    }
    session.attached = () => {
      // Publishing a handle retains its captured generation, even if a newer
      // active generation was published while this attachment was prepared.
      const owner = this.#sessionOwners.get(ctx.instanceId);
      if (!owner) {
        throw new Error(
          "This session stopped: its OpenCode server went away as the session started. Start it again; what you sent and it hadn't read waits for it."
        );
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
    if ((await opencodeBinary()) === undefined) {
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
    if ((await opencodeBinary()) === undefined) {
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
    if ((await opencodeBinary()) === undefined) {
      return [];
    }
    assertOpencodeKey(sessionKey, "getSessionMessages");
    const client = await this.#homeClient(sessionKey);
    let info: SessionInfo;
    try {
      info = answerOf(
        await askOpencode((options) =>
          client.session.get({ sessionID: sessionKey }, options)
        ),
        `session ${sessionKey}`
      );
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
    const waiting = answerOf(
      await askOpencode((options) =>
        client.session.inbox.list({ sessionID: sessionKey }, options)
      ),
      `the waiting sends of ${sessionKey}`
    );
    const entries = syncSection("OpenCode transcript built", () =>
      toTranscript(sessionKey, messages, waiting)
    );
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
      const childEntries = syncSection("OpenCode transcript built", () =>
        toTranscript(child.id, childMessages)
      );
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
    if ((await opencodeBinary()) === undefined) {
      return;
    }
    assertOpencodeKey(sessionKey, "renameSession");
    await (
      await this.#homeClient(sessionKey)
    ).session.update({
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
    if ((await opencodeBinary()) === undefined) {
      return;
    }
    assertOpencodeKey(sessionKey, "deleteSession");
    await (
      await this.#homeClient(sessionKey)
    ).session.remove({
      sessionID: sessionKey,
    });
    forgetBackground(sessionKey);
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
    if (this.#mendTimer) {
      clearTimeout(this.#mendTimer);
    }
    this.#mendTimer = null;
    this.#stopPumps();
    this.#keepers.close();
    for (const slot of this.#slots()) {
      slot.client = null;
      slot.ready = null;
    }
  }

  async syncFleet(config: MachineFleetConfig): Promise<FleetSyncReport> {
    this.#syncing += 1;
    try {
      return await this.#syncFleet(config);
    } finally {
      this.#syncing -= 1;
    }
  }

  /**
   * One fleet sync, applied as far as it changed what OpenCode runs. The hub
   * sends its whole config each time (a place added or archived, a skill, a
   * sign-in); the fleet's servers as a server's launch takes them are
   * compared before and after the write. Only a change there is a need: the
   * machine's server is replaced on it now, whatever runs, and its servers
   * read on the new one. Any other change of the config is applied as the
   * config watcher applies one ({@link #configTick}), and a sync that changed
   * none of the servers reads none of them again ({@link #readFleetMcp}).
   */
  async #syncFleet(config: MachineFleetConfig): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      // CawCo's plugin runs the fleet's hooks from the harness set; what it
      // cannot run is said unsupported here.
      hooks: hookStatesOn(
        "opencode",
        config.hooks.filter((hook) => hook.enabled)
      ),
      at: Date.now(),
    };
    const serversBefore = canonicalizeJson(
      await readJson<Record<string, unknown>>(OPENCODE_FLEET_MCP)
    );
    const mcp = await syncOpencodeMcp(
      config.mcp,
      sidecar.mcp ?? [],
      report.mcp
    );
    await dropPlanAgentEntry(sidecar.planAgentDisabled === true);
    // Before the poke below: a placement that changed where a live session
    // runs replaces the server as opencode.json changing does (`#hashConfig`).
    const placed = await placeOpencodeMcp(
      config.placedMcp,
      [...this.#sessions.values()].map((session) => session.directory)
    );
    const memory = await syncMemory(
      OPENCODE_MEMORY,
      config.memory,
      sidecar.memory,
      report
    );
    await writeJson(OPENCODE_SIDECAR, {
      mcp,
      ...(memory ? { memory } : {}),
    });
    if (!(await this.#runsHere())) {
      // Its files are written, for the OpenCode put on later; with none
      // that CawCo runs here there is no server to start or read, so the
      // sync stops at them rather than failing every item of the pass.
      report.mcp = {};
      return report;
    }
    const serversMoved =
      canonicalizeJson(
        await readJson<Record<string, unknown>>(OPENCODE_FLEET_MCP)
      ) !== serversBefore;
    // Poke the watcher now rather than up to 2 s later.
    await this.#configTick(serversMoved);
    await this.#ensure();
    // What follows talks to the server on the servers just written, never
    // to the one it replaces.
    const unsettled = serversMoved ? await this.#configSettled() : undefined;
    if (unsettled) {
      const { read, said } = await apartUnread(mcp);
      const states = {
        ...said,
        ...Object.fromEntries(read.map((name) => [name, unsettled])),
      };
      this.#heardFleetMcp(states, "report");
      report.mcp = { ...placed, ...states };
      return report;
    }
    // A fleet server OpenCode holds failed where a live session runs is
    // started again now, not at the next pass. One the hub holds no sign-in
    // for is not: its proxy answers 503 until the sign-in, and the hub's sync
    // after it, with the mark dropped, is the one that starts it again in
    // every location a live session runs in. A location booted on the config
    // just written holds every fleet server already, in its launch config;
    // one still connecting is left to connect.
    await this.#fleetMcpTurn(() => this.#startFailed(mcp));
    Object.assign(report.mcp, placed, await this.#readFleetMcp(mcp, "fresh"));
    return report;
  }

  /**
   * An OpenCode CawCo runs is here (tools.ts `toolGate`). One missing, or at
   * another version, is said where it blocks (the machine's harness block),
   * once; the fleet's sync and reads leave its server alone, so its refusal
   * never fails the items every other harness converged
   * (niftybot.art, 2026-10-23: 141 of 141 "not set up", each with
   * "OpenCode isn't installed on this machine").
   */
  async #runsHere(): Promise<boolean> {
    return !(await toolGate(OPENCODE_SPEC)).refused;
  }

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const report: FleetSyncReport = {
      mcp: (await this.#runsHere())
        ? await this.#readFleetMcp(sidecar.mcp ?? [], "latest")
        : {},
      marketplaces: {},
      plugins: {},
      skills: {},
      hooks: hookStatesInSet("opencode", await readFleetHarnessSet()),
      at: Date.now(),
    };
    if (sidecar.memory !== undefined) {
      const file = Bun.file(OPENCODE_MEMORY);
      const hash = (await file.exists()) ? hashText(await file.text()) : null;
      if (hash === sidecar.memory) {
        report.memory = { state: "applied" };
      } else if (hash === null) {
        report.memory = {
          state: "failed",
          cause: "absent",
          detail: "not on disk",
        };
      } else {
        report.memory = {
          state: "failed",
          cause: "drifted",
          detail: "edited on this machine",
        };
      }
    }
    return report;
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
   * converge the config (not the machine's) has nothing to wait for. A
   * caller here needs the config: an apply the watcher left for the next
   * need ({@link #applyIfNeeded}) starts now.
   */
  async #configSettled(): Promise<FleetItemState | undefined> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method
    if (!this.#converging) {
      return;
    }
    const settled = await readWithin(
      CONFIG_SETTLE_TIMEOUT_MS,
      async (signal): Promise<FleetItemState | undefined> => {
        for (;;) {
          signal.throwIfAborted();
          if (this.#configState === "pending" && !this.#applyGate) {
            this.#applyIfNeeded(true);
          }
          const gate = this.#applyGate;
          if (gate) {
            // biome-ignore lint/performance/noAwaitInLoops: an apply ends before the next look at its state
            await gate.promise;
          } else if (this.#configState === "applied") {
            return;
          } else if (this.#configState === "error") {
            return {
              state: "failed",
              cause: "unknown",
              detail: `OpenCode did not load its new config: ${this.#configError ?? "the apply failed"}`,
            };
          }
          await Bun.sleep(250);
        }
      }
    );
    switch (settled.kind) {
      case "answered":
        return settled.value;
      case "unanswered":
        // Not settled in time is not failed: the report says it is pending.
        return {
          state: "pending",
          detail: `OpenCode had not loaded its new config ${CONFIG_SETTLE_TIMEOUT_MS / 1000} s after it was written.`,
        };
      default: {
        const unhandled: never = settled;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * The server's MCP list once none of `names` is still `pending`: 2.0
   * connects a location's servers after it answers, so a read right after a
   * boot names them connecting. Bounded by the startup timeout each fleet
   * server is written with ({@link MCP_CONNECT_MS}, toOpencodeMcp) and 30 s
   * more for a cold machine (CawCo's own margin), so OpenCode's own verdict
   * on a server is what is read, never a cut-off of ours. The wait is one
   * read given that time; when it ends, the last list the server gave is
   * what it said, and none at all is said as not answered.
   */
  async #settledMcpList(client: OpencodeClient, names: string[]) {
    type Listed = Awaited<ReturnType<OpencodeClient["mcp"]["list"]>>;
    let last: Listed | undefined;
    const settled = await readWithin(
      MCP_CONNECT_MS + 30_000,
      async (signal): Promise<Listed> => {
        for (;;) {
          signal.throwIfAborted();
          // biome-ignore lint/performance/noAwaitInLoops: each read decides whether the next is needed
          const listed = await client.mcp.list({}, { signal });
          last = listed;
          const connecting = names.some((name) => {
            const server = listed.data.find((one) => one.name === name);
            return !server || server.status.status === "pending";
          });
          if (!connecting) {
            return listed;
          }
          await Bun.sleep(250);
        }
      }
    );
    switch (settled.kind) {
      case "answered":
        return settled.value;
      case "unanswered":
        if (last) {
          return last;
        }
        throw new Error(notAnswered("its MCP server list", settled));
      default: {
        const unhandled: never = settled;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /** Runs `work` once every fleet MCP read and pass before it has ended. */
  #fleetMcpTurn<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#fleetMcpQueue.then(work, work);
    this.#fleetMcpQueue = next.catch(() => undefined);
    return next;
  }

  /**
   * The last reading, when it read the servers the active generation runs
   * ({@link #activeFleet}) and each of `names`. Reading them again would
   * boot the machine server's location and start every fleet server there
   * for the verdict already read: a generation that replaced another on the
   * same servers (a catalog or `opencode.json` change) runs them as the
   * last one did.
   */
  #takenReading(names: readonly string[]) {
    const taken = this.#fleetMcpRead;
    const active = this.#activeFleet;
    return taken &&
      active &&
      taken.fleet === active.fleet &&
      active.procId === this.#serverOwner.active?.procId &&
      names.every((name) => taken.names.has(name))
      ? taken
      : undefined;
  }

  /**
   * The fleet servers' states on the machine's active generation, as a
   * report says them, one read at a time. The last reading of the servers
   * the active generation runs ({@link #takenReading}) is said again rather
   * than read: by `fresh` (a sync) when every server in it settled, and by
   * `latest` (a status report) whatever it read, since a pass reads an
   * unsettled one again on its own schedule and asks for the report that
   * says it ({@link fleetMcpMoved}). Anything else is read now
   * ({@link #readFleetMcpNow}).
   */
  #readFleetMcp(
    names: string[],
    use: "fresh" | "latest"
  ): Promise<FleetSyncReport["mcp"]> {
    return this.#fleetMcpTurn(async () => {
      const { read, said } = await apartUnread(names);
      const taken = this.#takenReading(read);
      if (taken && (use === "latest" || taken.settled)) {
        const states = {
          ...said,
          ...Object.fromEntries(
            read.map((name) => [name, taken.states[name] as FleetItemState])
          ),
        };
        this.#heardFleetMcp(states, "report");
        return states;
      }
      return await this.#readFleetMcpNow(names, "report");
    });
  }

  /**
   * What `states` says against what was last reported. A report's reading
   * is recorded as reported. A pass's that differs from it is news the hub
   * has not had: the agent sends it a report ({@link fleetMcpMoved}), which
   * says this reading, and this answers true. Any reading not a lasting
   * verdict (failed, or still pending) has the next pass scheduled; one
   * where every server settled ends the backoff.
   */
  #heardFleetMcp(
    states: Record<string, FleetItemState>,
    by: "report" | "pass"
  ): boolean {
    const entries = Object.entries(states);
    const moved =
      by === "pass" &&
      entries.some(
        ([name, item]) => this.#fleetMcpReported.get(name) !== item.state
      );
    if (by === "report") {
      this.#fleetMcpReported.clear();
      for (const [name, item] of entries) {
        this.#fleetMcpReported.set(name, item.state);
      }
    }
    const unsettled = entries.filter(([, item]) => unsettledState(item));
    if (unsettled.length > 0) {
      console.info(
        `[opencode] fleet MCP read again later: ${unsettled.map(([name, item]) => `${name} ${item.state} (${item.detail ?? "no detail"})`).join("; ")}`
      );
      this.#mendLater();
    } else {
      this.#mendAttempt = 0;
    }
    if (moved) {
      fleetMcpMoved();
    }
    return moved;
  }

  /** Whether the end of the passes' reads was said for the backoff running now ({@link #mendLater}). */
  #passReadsSpentSaid = false;

  /**
   * Schedules the next pass ({@link #mendFleetMcp}): `restart` from the first
   * wait, else after the backoff's next one ({@link MCP_RETRY_FIRST_MS}). A
   * pass already scheduled stands unless restarted. Once
   * {@link MCP_PASS_READS} passes have read, a pass is scheduled only while
   * a live session runs here, whose location it starts the failed servers
   * in without reading: the verdict stands until the fleet's servers or the
   * generation change.
   */
  #mendLater(restart = false): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set by dispose()
    if (this.#disposed || !this.#converging) {
      return;
    }
    if (restart) {
      this.#mendAttempt = 0;
      this.#passReadsSpentSaid = false;
      if (this.#mendTimer) {
        clearTimeout(this.#mendTimer);
        this.#mendTimer = null;
      }
    }
    if (this.#mendTimer) {
      return;
    }
    if (this.#mendAttempt >= MCP_PASS_READS && this.#livePlaces().size === 0) {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: a restart, an earlier call, clears it
      if (!this.#passReadsSpentSaid) {
        this.#passReadsSpentSaid = true;
        console.info(
          `[opencode] fleet MCP pass: ${MCP_PASS_READS} passes read a fleet server unsettled and no session runs here; its reading stands until the fleet's servers or OpenCode's generation change`
        );
      }
      return;
    }
    const wait = Math.min(
      MCP_RETRY_FIRST_MS * 2 ** this.#mendAttempt,
      MCP_RETRY_MAX_MS
    );
    this.#mendAttempt += 1;
    this.#mendTimer = setTimeout(() => {
      this.#mendTimer = null;
      this.#fleetMcpTurn(() => this.#mendFleetMcp()).catch((error: unknown) =>
        console.warn(`[opencode] fleet MCP pass: ${errorText(error)}`)
      );
    }, wait);
    this.#mendTimer.unref();
  }

  /**
   * One pass over the fleet's servers on this machine: each OpenCode holds
   * failed where a live session runs is started again ({@link #startFailed}),
   * then the machine's reading is taken as a report's is, against the
   * generation serving now. A fleet sync running reads and reports them
   * itself: the pass waits for it. Servers read already, each to a lasting
   * verdict, on a generation that runs them as the active one does
   * ({@link #takenReading}: the sync's own read after the publication its
   * change made, or a generation replaced on the catalog alone), leave the
   * pass nothing to mend or report: it reads nothing, so the location is not
   * booted again for the same reading. Past {@link MCP_PASS_READS} reads,
   * a pass only starts failed servers where live sessions run.
   */
  async #mendFleetMcp(): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set by dispose()
    if (this.#disposed || !this.#converging) {
      return;
    }
    if (this.#syncing > 0) {
      this.#mendAttempt = Math.max(0, this.#mendAttempt - 1);
      this.#mendLater();
      return;
    }
    const names = (await readSidecar(OPENCODE_SIDECAR)).mcp ?? [];
    if (names.length === 0) {
      this.#mendAttempt = 0;
      return;
    }
    if (this.#takenReading((await apartUnread(names)).read)?.settled) {
      console.info(
        `[opencode] fleet MCP pass: generation ${this.#serverOwner.active?.procId} runs the fleet servers read already, every one settled: nothing read`
      );
      this.#mendAttempt = 0;
      return;
    }
    await this.#startFailed(names);
    if (this.#mendAttempt > MCP_PASS_READS) {
      this.#mendLater();
      return;
    }
    await this.#readFleetMcpNow(names, "pass");
  }

  /**
   * The locations live sessions run in here, each on the generation serving
   * its session, by generation and directory.
   */
  #livePlaces(): Map<string, { client: OpencodeClient; directory: string }> {
    const places = new Map<
      string,
      { client: OpencodeClient; directory: string }
    >();
    for (const session of this.#sessions.values()) {
      const owner = this.#sessionOwners.get(session.instanceId);
      if (owner && !isV1(owner) && owner.password !== undefined) {
        places.set(`${owner.procId}\u0000${session.directory}`, {
          client: this.#clientForGeneration(owner),
          directory: session.directory,
        });
      }
    }
    return places;
  }

  /**
   * Starts again each of `names` that OpenCode holds failed in each location
   * a live session runs in, on the generation serving that session, so the
   * session gains its tools (OpenCode publishes them as the server
   * connects). A location's MCP servers are its own, so each is started
   * where it failed. The machine server's own location is not asked: a list
   * there boots it, starting every fleet server, and its reading
   * ({@link #readFleetMcpNow}) boots it fresh on the servers it runs. A
   * place that does not answer its list is left to the next pass. A server
   * the hub holds no sign-in for is started nowhere ({@link apartSignedOut}):
   * with none other, no location is asked anything.
   */
  async #startFailed(all: string[]): Promise<void> {
    const names = apartSignedOut(all, await readFleetMcpSet()).read;
    if (names.length === 0) {
      return;
    }
    for (const { client, directory } of this.#livePlaces().values()) {
      // biome-ignore lint/performance/noAwaitInLoops: one place at a time, so a pass is never a burst of server starts on a loaded machine
      await this.#startFailedAt(client, directory, names);
    }
  }

  /** {@link #startFailed} in one live session's location. */
  async #startFailedAt(
    client: OpencodeClient,
    directory: string,
    names: string[]
  ): Promise<void> {
    const where = at(directory);
    const place = directory;
    const listed = await askOpencode((options) =>
      client.mcp.list(where, options)
    );
    if (listed.kind !== "answered") {
      console.warn(
        `[opencode] fleet MCP pass: ${notAnswered(`its MCP list at ${place}`, listed)}`
      );
      return;
    }
    const failed = listed.value.data.flatMap((server) =>
      names.includes(server.name) && server.status.status === "failed"
        ? [{ name: server.name, error: server.status.error }]
        : []
    );
    for (const { name, error } of failed) {
      // The call holds the client: leased, as e1ce75227 leased the sync's.
      this.#mutatingMcp += 1;
      // biome-ignore lint/performance/noAwaitInLoops: one start at a time, so a pass is never a burst of server starts on a loaded machine
      const started = await readWithin(MCP_START_AGAIN_MS, (signal) =>
        client.mcp.connect({ server: name, ...where }, { signal })
      )
        .then(
          (read) =>
            read.kind === "answered"
              ? "settled"
              : notAnswered("the start", read),
          (thrown: unknown) => errorText(thrown)
        )
        .finally(() => {
          this.#mutatingMcp -= 1;
        });
      console.info(
        `[opencode] ${name} at ${place}: OpenCode held it failed (${error}); started again: ${started}`
      );
    }
  }

  /**
   * The fleet servers' states on the machine's active generation, read on
   * the location of its own directory once none is still connecting
   * ({@link #settledMcpList}), each in OpenCode's own words. A server
   * OpenCode holds failed is said so, with the pass that starts it again
   * ({@link #heardFleetMcp}). The location is borrowed for the read: the
   * read boots it when none runs, and it is released after, as a session's
   * directory is ({@link #releaseDirectory}), so no copy of the fleet's
   * servers runs on in it for nobody. A server the hub holds no sign-in for
   * needs one, read from nothing ({@link apartSignedOut}): with none other,
   * no location boots. The reading is kept with the fleet servers of the
   * generation it was read on ({@link #takenReading}), for the reports and
   * passes after it.
   */
  async #readFleetMcpNow(
    all: string[],
    by: "report" | "pass"
  ): Promise<FleetSyncReport["mcp"]> {
    if (all.length === 0) {
      return {};
    }
    const { read: names, said } = await apartUnread(all);
    const { states: live, read } =
      names.length > 0 ? await this.#readLiveFleetMcp(names) : { states: {} };
    if (read) {
      this.#releaseDirectory(read.directory, read.identity, "fleet MCP status");
    }
    if (names.length > 0) {
      // A read that took no reading (it threw, or the config had not
      // settled) leaves the servers unread: the pass it asks for reads.
      const active = this.#activeFleet;
      this.#fleetMcpRead = read
        ? {
            fleet:
              active?.procId === read.identity.procId ? active.fleet : null,
            names: new Set(names),
            settled: !Object.values(live).some(unsettledState),
            states: live,
          }
        : null;
    }
    const states = { ...said, ...live };
    this.#heardFleetMcp(states, by);
    return states;
  }

  /** {@link #readFleetMcpNow}'s read of `names`, and the location it borrowed for it, for the release. */
  async #readLiveFleetMcp(names: string[]): Promise<{
    states: Record<string, FleetItemState>;
    read?: { directory: string; identity: ServerIdentity };
  }> {
    try {
      await this.#ensure();
      const unsettled = await this.#configSettled();
      if (unsettled) {
        return {
          states: Object.fromEntries(names.map((name) => [name, unsettled])),
        };
      }
      const client = await this.#ensure();
      const identity = this.#serverOwner.active;
      if (!identity) {
        throw new Error(
          "OpenCode's server isn't running, so its MCP servers couldn't be checked."
        );
      }
      // The server's own directory: a read there boots its location, which
      // may also hold live sessions. Its release shares the location
      // release's attachment and running checks.
      const listed = await this.#settledMcpList(client, names);
      const byName = new Map(
        listed.data.map((server) => [server.name, server.status] as const)
      );
      return {
        read: { directory: listed.location.directory, identity },
        states: Object.fromEntries(
          names.map((name) => {
            const status = byName.get(name);
            const item = mcpFleetState(
              status
                ? {
                    status: status.status,
                    ...("error" in status ? { error: status.error } : {}),
                  }
                : undefined
            );
            return [
              name,
              status?.status === "failed"
                ? {
                    ...item,
                    detail: `${item.detail} (OpenCode does not start a failed server again; CawCo does, until it connects)`,
                  }
                : item,
            ];
          })
        ),
      };
    } catch (error) {
      const failed: FleetItemState = {
        state: "failed",
        cause: "unknown",
        detail: String(error),
      };
      return {
        states: Object.fromEntries(names.map((name) => [name, failed])),
      };
    }
  }
}

export const opencodeHarness: Harness = new OpencodeHarness();
