/**
 * The agent's side of an Antigravity session: its host, which the keeper
 * holds and which holds `agy acp` (agy-host.ts), started, followed on its
 * line (host-line.ts), and taken back after an agent restart on pi's shape
 * (pi-sessiond.ts): the ring read from the hub's mark, the host's state
 * read, each ask it still holds parked again.
 */
import { realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RestartHold } from "@cawco/core/binary-updates";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { CONTROL_REPLIES } from "@cawco/core/control-replies";
import { inStartingSet } from "@cawco/core/delegate-types";
import { BOUNDARY_RELAUNCH, SESSION_STOPPED } from "@cawco/core/harness";
import {
  type AgyHostCommand,
  type AgyHostEvent,
  type AgyHostState,
  type AgyMcpServer,
  agyHostEvent,
  agyHostState,
} from "@cawco/core/harness/agy-host-state";
import { fleetMemoryFile } from "@cawco/core/paths/fleet";
import { mcpGatewayPort } from "@cawco/core/ports";
import type { SpawnPayload } from "@cawco/core/protocol";
import { runtimeVersion, standalone } from "@cawco/core/runtime";
import { CONTROL_SET_PERMISSION_MODE } from "@cawco/core/session/controls";
import type {
  NeutralMessage,
  PermissionResult,
} from "@cawco/core/session-messages";
import { unhandled } from "@cawco/core/unhandled";
import { agyWords } from "@cawco/core/words/agy";
import { readPolicy } from "@cawco/core/workspace-judge";
import { Effect } from "effect";
import { delegationMcp, MCP_SERVER_NAME } from "../delegation";
import { fleetMcpAt } from "../fleet-mcp-set";
import { gateForm } from "../gate-form";
import {
  cannot,
  type HarnessContext,
  type HarnessSession,
  HeldProcessRefused,
  type SessionControls,
} from "../harness";
import { KeeperPool } from "../keepers";
import { enterSpawn } from "../layer";
import { throughMcpGate } from "../mcp-gate";
import { procIdFor } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { agyHookHeld } from "./agy-canary";
import { agyDeniedTools } from "./agy-judge";
import { agyLaunch, agyToStart } from "./agy-launch";
import { commandEnv } from "./command-env";
import { hostSnapshot } from "./host-line";
import { HostedSession } from "./hosted-session";
import { sessionMemory } from "./session-memory";

/** The machine's keepers as Antigravity's hosts reach them. */
export const agyKeepers = new KeeperPool();

declare const __CAWCO_RELEASE__: boolean | undefined;

class AgyRemoteSession
  extends HostedSession<AgyHostEvent>
  implements HarnessSession
{
  readonly harness = "agy" as const;
  /** The machine's agy as the launch read it, against which the running one is outdated. */
  readonly #installed: string | undefined;
  /** The running agy's version, as its `initialize` said it. */
  #running: string | undefined;
  /** The asks the host parked with this agent, by request id. */
  readonly #asks = new Set<string>();
  /** The gate form the host says its judge started on, in a workspace. */
  #hostForm: string | undefined;
  /** Why this session was refused, once it has been: said once. */
  #refusal: string | undefined;

  constructor(
    client: SessiondClient,
    ctx: HarnessContext,
    host: { epoch: string; pid: number },
    options: { afterSeq: number; installed?: string; recoveryHead?: number }
  ) {
    super({
      client,
      ctx,
      host,
      afterSeq: options.afterSeq,
      ...(options.recoveryHead === undefined
        ? {}
        : { recoveryHead: options.recoveryHead }),
      name: "Antigravity",
      procId: procIdFor("agy", ctx.instanceId),
      read: agyHostEvent,
    });
    this.#installed = options.installed;
  }

  protected override applySnapshot(value: unknown): void {
    this.applyState(agyHostState(value));
  }

  /** The host's state applied: the shared part, its gate form, and a refusal it holds. */
  applyState(state: AgyHostState): void {
    // An agent that takes the host back hears no `version` the host said
    // before its cursor: the host's state says it.
    this.#running = state.version ?? this.#running;
    this.#hostForm = state.gateForm;
    this.applyShared(state);
    if (state.refused !== undefined) {
      this.#refuse(state.refused);
    }
  }

  /**
   * The session stopped for good as no longer to be trusted, in `words`:
   * said in its transcript, its row and work item failed with them
   * (`HarnessContext.refused`), and its host ended.
   */
  #refuse(words: string): void {
    if (this.#refusal !== undefined) {
      return;
    }
    this.#refusal = words;
    this.ctx.frame({
      type: "system",
      subtype: SESSION_STOPPED,
      uuid: `session-stopped-${this.ctx.instanceId}-refused`,
      session_id: this.sessionId ?? "",
      content: words,
    });
    this.ctx.refused?.(new HeldProcessRefused(words));
    this.stop().catch((error: unknown) =>
      console.warn(
        `[agy] ${this.ctx.instanceId}: stopping after its refusal: ${String(error)}`
      )
    );
  }

  /**
   * Asks the hub to relaunch a workspace session whose host judges by
   * another gate than this build's ({@link gateForm}), as a pi host's is
   * (pi-sessiond.ts `askRelaunch`): at the attach when no turn runs, and as
   * each turn ends; the hub relaunches it only while it is idle.
   */
  askRelaunch(): void {
    if (
      this.ready &&
      !this.exited &&
      this.ctx.boundary &&
      this.#hostForm !== gateForm("agy")
    ) {
      this.ctx.frame({ type: "system", subtype: BOUNDARY_RELAUNCH });
    }
  }

  override attached(): void {
    super.attached();
    if (!this.busyNow) {
      this.askRelaunch();
    }
  }

  protected override afterFrame(message: NeutralMessage): void {
    if (message.type === "result" && !this.busyNow) {
      this.askRelaunch();
    }
  }

  protected override ownEvent(_seq: number, event: AgyHostEvent): void {
    switch (event.type) {
      case "version":
        this.#running = event.version;
        return;
      case "permission":
        this.#asks.add(event.request.requestId);
        this.ctx.permission(event.request);
        return;
      case "permissionResolved":
        if (this.#asks.delete(event.requestId)) {
          this.ctx.permissionResolved?.(event.requestId, event.outcome);
        }
        return;
      case "refused":
        this.#refuse(event.error);
        return;
      // Every host's own, which the shared session reads (hosted-session.ts).
      case "frame":
      case "busy":
      case "session":
      case "failed":
      case "rejected":
      case "reply":
        return;
      default:
        unhandled("event", event);
    }
  }

  protected override hostEnded(): void {
    this.#asks.clear();
  }

  /** Each ask the host still holds, parked again with this agent: what an agent taking the host back owes the person. */
  parkAgain(state: AgyHostState): void {
    for (const ask of state.asks) {
      if (!this.#asks.has(ask.requestId)) {
        this.#asks.add(ask.requestId);
        this.ctx.permission(ask);
      }
    }
  }

  write(command: AgyHostCommand): Promise<void> {
    return this.line.write(command);
  }

  resolvePermission(requestId: string, result: PermissionResult): void {
    this.#asks.delete(requestId);
    this.write({ type: "resolvePermission", requestId, result }).catch(
      (error: unknown) =>
        console.warn(
          `[agy] ${this.ctx.instanceId}: answering ask ${requestId} failed: ${error instanceof Error ? error.message : String(error)}`
        )
    );
  }

  withdrawPermission(requestId: string, message: string): void {
    this.#asks.delete(requestId);
    this.write({ type: "withdrawPermission", requestId, message }).catch(
      () => undefined
    );
  }

  readonly controls: SessionControls<"agy"> = {
    ...this.sharedControls(),
    [CONTROL_SET_PERMISSION_MODE]: async (...args) =>
      CONTROL_REPLIES[CONTROL_SET_PERMISSION_MODE].parse(
        await this.ask({ method: CONTROL_SET_PERMISSION_MODE, args })
      ),
  };

  /** agy's background commands come back with a resume on the same account, the only one it runs on. */
  heldForLater(): RestartHold[] {
    return [];
  }

  heldSince(): number | undefined {
    return undefined;
  }

  readonly endedForMove = cannot(
    "An Antigravity session never moves between accounts."
  );

  /** agy keeps no note of CawCo's in its history. */
  noteStopped(): Promise<void> {
    return Promise.resolve();
  }

  /** The running agy against the machine's, once both are read. */
  outdated(): Promise<{ uuid: string; words: string } | undefined> {
    const runs = this.#running;
    const machine = this.#installed;
    if (!(runs && machine) || runs === machine) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({
      uuid: `agy-outdated-${this.ctx.instanceId}-${runs}-${machine}`,
      words: agyWords.outdated(runs, machine),
    });
  }

  tables(): Record<string, number> {
    return { asks: this.#asks.size, requests: this.line.waiting };
  }
}

/** A fleet server's entry as agy takes it in `session/new` (ACP `McpServer`, its HTTP form). */
const agyServer = (
  name: string,
  config: { url: string; headers?: Readonly<Record<string, string>> }
): AgyMcpServer => ({
  type: "http",
  name,
  url: config.url,
  headers: Object.entries(config.headers ?? {}).map(([header, value]) => ({
    name: header,
    value,
  })),
});

/**
 * The MCP servers a session hands agy: CawCo's own with the session's
 * credential, and every fleet server its folder loads (the fleet's own and
 * its project's placed copies, held to its starting set), each with a
 * command through the session's gate, which runs it on the host
 * (chrome-devtools with its browser door), each remote HTTP one as it is,
 * as Claude Code's sessions take them (claude.ts `fleetMcpFor`). A server
 * agy's ACP takes no form of (a remote SSE one) is left out. A session with
 * no gate (a fenced one) takes the remote servers alone.
 */
const mcpServersOf = async (
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<AgyMcpServer[]> => {
  const cawco = delegationMcp(ctx.instanceId, ctx.sessionCredential);
  const own = agyServer(MCP_SERVER_NAME, cawco);
  const all = inStartingSet(await fleetMcpAt(ctx.cwd), spec.startingSet);
  const reached = ctx.mcpGate
    ? throughMcpGate(all, ctx.mcpGate)
    : Object.fromEntries(
        Object.entries(all).filter(([, config]) => !("command" in config))
      );
  const fleet = Object.entries(reached).flatMap(([name, config]) =>
    name !== MCP_SERVER_NAME && "url" in config && config.type === "http"
      ? [agyServer(name, config)]
      : []
  );
  return [own, ...fleet];
};

/**
 * The session's own memory documents, each under its path, for agy's
 * system prompt: its folder's placed memory and the hub's documents for
 * it. The fleet's memory is left out: it is the home's `GEMINI.md`
 * (agy-fleet.ts), which agy reads again before each turn.
 */
const memoryOf = async (spec: SpawnPayload, cwd: string): Promise<string> =>
  (await sessionMemory(spec, cwd))
    .filter(({ path }) => path !== fleetMemoryFile())
    .map(({ path, content }) => `# ${path}\n\n${content.trim()}`)
    .join("\n\n");

/**
 * Refuses a workspace session that does not start at its clone's root: agy
 * reads project config and rules from its folder and each one above it up
 * to the repository's root, and the workspace holds them at the root alone
 * (core clone-denies.ts, workspace-judge.ts `heldInstructions`). A place, a
 * person's own folder, guards its config at any depth and starts anywhere.
 */
const atCloneRoot = async (ctx: HarnessContext): Promise<void> => {
  const { boundary } = ctx;
  if (!boundary) {
    return;
  }
  const policy = readPolicy(boundary.policy);
  if (
    policy.protectConfig === undefined &&
    (await realpath(ctx.cwd)) !== policy.clone
  ) {
    throw new Error(agyWords.notAtRoot);
  }
};

/**
 * A new Antigravity session: its launch read from its account, its host
 * started under the keeper, and agy started there, signed in and its
 * session opened. A launch the account cannot run is refused before any
 * process starts.
 */
export const spawnAgy = async (
  spec: SpawnPayload,
  ctx: HarnessContext,
  denied: readonly string[]
): Promise<HarnessSession> => {
  const accountId = spec.accountDir?.accountId;
  if (!accountId) {
    throw new Error(agyWords.needsAccount);
  }
  await atCloneRoot(ctx);
  const launch = await Effect.runPromise(
    agyHookHeld(accountId).pipe(
      Effect.andThen(
        agyLaunch(
          accountId,
          ctx.instanceId,
          commandEnv(ctx),
          ctx.boundary !== undefined
        )
      ),
      Effect.mapError((refused) => new Error(refused.message))
    )
  );
  const mcpServers = await mcpServersOf(spec, ctx);
  const memory = await memoryOf(spec, ctx.cwd);
  const client = await agyKeepers.current();
  const procId = procIdFor("agy", ctx.instanceId);
  await agyKeepers.replaceElsewhere(procId, client);
  const host = join(
    dirname(fileURLToPath(import.meta.url)),
    typeof __CAWCO_RELEASE__ === "boolean" ? "agy-host.js" : "agy-host.ts"
  );
  const hubUrl = readEnv(CAWCO_ENV.hubUrl);
  // In a Linux view of its folder, the host and its agy run inside it
  // (layer.ts), so agy's file tools read and write the folder as its
  // commands do.
  await client.spawnProc(
    procId,
    enterSpawn(ctx.workspace, {
      command: process.execPath,
      args: standalone ? ["agy-host"] : [host],
      cwd: ctx.cwd,
      // The host reaches CawCo's tools through this agent's gateway; agy's own
      // environment comes whole in the start, never from here.
      env: {
        [CAWCO_ENV.mcpPort]: String(mcpGatewayPort()),
        ...(hubUrl ? { [CAWCO_ENV.hubUrl]: hubUrl } : {}),
      },
    })
  );
  const listed = await client.list();
  const proc = listed.procs.find((one) => one.procId === procId);
  if (!proc?.alive) {
    throw new Error("Antigravity's host did not start");
  }
  const session = new AgyRemoteSession(
    client,
    ctx,
    { epoch: listed.epoch, pid: proc.pid },
    { afterSeq: 0, ...(launch.version ? { installed: launch.version } : {}) }
  );
  try {
    await session.write({
      type: "start",
      spec: { ...spec, cwd: ctx.cwd },
      launch,
      ...(ctx.sessionCredential
        ? { sessionCredential: ctx.sessionCredential }
        : {}),
      mcpServers,
      denied: [...denied],
      clientVersion: runtimeVersion,
      ...(memory ? { memory } : {}),
      // A work item's session: every command through its executor, every
      // file tool by its policy (agy-judge.ts), every fleet hook through its
      // shell prefix (agy-fleet-hooks.ts), on this build's gate.
      ...(ctx.boundary
        ? {
            workspace: {
              exec: ctx.boundary.exec,
              policy: ctx.boundary.policy,
              prefix: ctx.boundary.prefix,
            },
            gateForm: gateForm("agy"),
          }
        : {}),
    });
    // Answered once the host has started agy and opened the session, or
    // with why it could not.
    await session.request({ type: "snapshot" });
  } catch (error) {
    await session.stop().catch(() => undefined);
    throw error;
  }
  return session;
};

/** The state of session `instanceId`'s host, read apart from any session that follows it. */
export const agySnapshot = (instanceId: string): Promise<AgyHostState> =>
  hostSnapshot(
    agyKeepers,
    procIdFor("agy", instanceId),
    agyHostState,
    agyHostEvent
  );

/**
 * An Antigravity session's host, taken back after an agent restart: read
 * from the hub's mark, its unread sends said held, each ask it holds parked
 * again, and the agy it runs read against the machine's as it is now.
 */
export const adoptAgy = async (
  instanceId: string,
  ctx: HarnessContext,
  options: { afterSeq?: number; head: number }
): Promise<HarnessSession> => {
  const proc = await agyKeepers.holding(procIdFor("agy", instanceId));
  if (!proc) {
    throw new Error(`Antigravity's host for ${instanceId} is gone`);
  }
  // The promise edge of the machine's agy, read as a start reads it.
  const installed = await Effect.runPromise(
    agyToStart().pipe(
      Effect.map((agy) => agy.version),
      Effect.orElseSucceed(() => undefined)
    )
  );
  const session = new AgyRemoteSession(proc.client, ctx, proc, {
    afterSeq: options.afterSeq ?? options.head,
    recoveryHead: options.head,
    ...(installed ? { installed } : {}),
  });
  const state = agyHostState(await session.request({ type: "snapshot" }));
  session.sayHeld(state);
  session.parkAgain(state);
  return session;
};

/** The denials a session's judge holds it to, in agy's names. */
export const agyDenials = (names: readonly string[]): string[] => [
  ...agyDeniedTools(names),
];
