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
import { SESSION_STOPPED } from "@cawco/core/harness";
import { AGY_TOOLS } from "@cawco/core/harness/agy";
import {
  type AgyHostCommand,
  type AgyHostEvent,
  type AgyHostState,
  type AgyMcpServer,
  agyHostEvent,
  agyHostState,
} from "@cawco/core/harness/agy-host-state";
import { fleetMemoryFile } from "@cawco/core/paths/fleet";
import { AGY_SESSION_DIR_NAME } from "@cawco/core/paths/harnesses";
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
import { runPromise } from "../daemon-runtime";
import { MCP_SERVER_NAME } from "../delegation";
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
import { gatedCawco, throughMcpGate } from "../mcp-gate";
import { procIdFor } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { agyHookHeld } from "./agy-canary";
import { agyDeniedTools } from "./agy-judge";
import {
  type AgySessionPlace,
  agyLaunch,
  agyOwnLaunch,
  agyToStart,
} from "./agy-launch";
import { changeAgyPersonNote, readAgyNote } from "./agy-notes";
import { scrubAgyStoreSoon } from "./agy-scrub";
import { findAgyConversation } from "./agy-store";
import { accountStore } from "./agy-store-files";
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
  /** Whether its host handed agy its MCP servers on the gate alone (core agy-host-state.ts `gated`). */
  #hostGated = true;
  /** Why this session was refused, once it has been: said once. */
  #refusal: string | undefined;
  /** The tool calls agy began that have not ended, by id ({@link beforeFrame}). */
  readonly #pending = new Map<string, { name: string; since: number }>();

  constructor(
    client: SessiondClient,
    ctx: HarnessContext,
    host: { epoch: string; pid: number },
    options: {
      /** The account whose store agy writes (none in agy's own home, which CawCo never writes). */
      accountId?: string;
      afterSeq: number;
      installed?: string;
      recoveryHead?: number;
    }
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
    this.#accountId = options.accountId;
  }

  /** The account whose store agy writes ({@link hostEnded}). */
  readonly #accountId: string | undefined;

  protected override applySnapshot(value: unknown): void {
    this.applyState(agyHostState(value));
  }

  /** The host's state applied: the shared part, its gate form, and a refusal it holds. */
  applyState(state: AgyHostState): void {
    // An agent that takes the host back hears no `version` the host said
    // before its cursor: the host's state says it.
    this.#running = state.version ?? this.#running;
    this.#hostForm = state.gateForm;
    this.#hostGated = state.gated === true;
    for (const call of state.pending ?? []) {
      this.#pending.set(call.id, { name: call.name, since: call.since });
    }
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
   * Asks the hub to relaunch a session, at the attach when no turn runs and
   * as each turn ends (the hub relaunches it only while it is idle): a
   * workspace session whose host judges by another gate than this build's
   * ({@link gateForm}), as a pi host's is (pi-sessiond.ts `askRelaunch`);
   * any session whose host handed agy a server's own headers, started
   * before the gate relayed them (core agy-host-state.ts `gated`), so agy
   * stops writing them to its store.
   */
  askRelaunch(): void {
    this.relaunchIf({
      boundary:
        this.ctx.boundary !== undefined && this.#hostForm !== gateForm("agy"),
      gateway: !this.#hostGated,
    });
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

  /**
   * Each tool call agy began, from its tool use until its result: once a
   * turn is over, a running one is a command agy moved to the background
   * or a wake-up it set, which wakes the session when it ends and ends with
   * agy's process ({@link holding}).
   */
  protected override beforeFrame(message: NeutralMessage): void {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          this.#pending.set(block.id, { name: block.name, since: Date.now() });
        }
      }
    } else if (
      message.type === "user" &&
      Array.isArray(message.message.content)
    ) {
      for (const block of message.message.content) {
        if (block.type === "tool_result") {
          this.#pending.delete(block.tool_use_id);
        }
      }
    } else if (
      message.type === "result" &&
      message.wakes &&
      message.wakes.background + message.wakes.scheduled === 0
    ) {
      // A turn that ends with nothing pending leaves no call running.
      this.#pending.clear();
    }
  }

  /** The calls still running once no turn runs, as commands and wake-ups. */
  #held(): { commands: string[]; wakeUps: string[] } {
    const commands: string[] = [];
    const wakeUps: string[] = [];
    for (const [id, call] of this.#pending) {
      (AGY_TOOLS[call.name] === "schedule" ? wakeUps : commands).push(id);
    }
    return { commands, wakeUps };
  }

  /**
   * What stopping agy now would lose beyond its turn: the sends it holds
   * unread, then the commands it moved to the background and the wake-ups
   * it set, which agy's process ends with it (`assets/b5b3ca96/REPORT.md`
   * §2: a restart stops every one). A move never comes: an Antigravity
   * session stays on its account.
   */
  override holding(): string | undefined {
    const unread = super.holding();
    if (unread) {
      return unread;
    }
    if (this.busyNow) {
      return undefined;
    }
    const { commands, wakeUps } = this.#held();
    if (commands.length > 0) {
      return `${commands.length} background command(s) it started are still running`;
    }
    return wakeUps.length > 0
      ? `it has scheduled itself ${wakeUps.length} wake-up(s)`
      : undefined;
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

  /** Its asks and calls gone with the host, and its account's store scrubbed of any credential agy wrote while it ran (agy-scrub.ts). */
  protected override hostEnded(): void {
    this.#asks.clear();
    this.#pending.clear();
    if (this.#accountId) {
      scrubAgyStoreSoon(accountStore(this.#accountId));
    }
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
  /** Its background commands and wake-ups, which end with agy's process. */
  heldForLater(): RestartHold[] {
    if (this.busyNow) {
      return [];
    }
    const { commands, wakeUps } = this.#held();
    return [
      ...(commands.length > 0
        ? [{ reason: "command" as const, ids: commands }]
        : []),
      ...(wakeUps.length > 0
        ? [{ reason: "wake-up" as const, ids: wakeUps }]
        : []),
    ];
  }

  /** When its oldest background command began, as the host saw it. */
  heldSince(): number | undefined {
    if (this.busyNow) {
      return undefined;
    }
    const { commands } = this.#held();
    const starts = commands.flatMap((id) => {
      const call = this.#pending.get(id);
      return call ? [call.since] : [];
    });
    return starts.length > 0 ? Math.min(...starts) : undefined;
  }

  readonly endedForMove = cannot(
    "An Antigravity session never moves between accounts."
  );

  /**
   * agy starts turns of its own (a background command ended, a wake-up), so
   * it can fail the same way again and again; its history is agy's, which
   * CawCo never writes, so the stop is kept in CawCo's note of the
   * conversation, which a transcript read back draws where it was made
   * (agy-history.ts).
   */
  async noteStopped(words: string): Promise<void> {
    const { sessionId } = this;
    if (!sessionId) {
      return;
    }
    await changeAgyPersonNote(sessionId, (note) => ({
      ...note,
      stops: [...(note.stops ?? []), { at: Date.now(), words }],
    }));
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
 * The MCP servers a session hands agy, every one through the session's gate
 * (mcp-gate.ts), since agy writes each server's headers into its
 * conversation database in plain text and keeps them: CawCo's own, which
 * the gate relays with the session's credential, and every fleet server its
 * folder loads (the fleet's own and its project's placed copies, held to
 * its starting set), one with a command run on the host (chrome-devtools
 * with its browser door), a remote one relayed with its headers. So agy
 * holds the session's gate token alone, refused once the session's process
 * ends. A server agy's ACP takes no form of (a remote SSE one) is left out.
 * A fenced session takes CawCo's alone, as does one in agy's own home
 * (`withFleet` false), whose setup is agy's.
 */
const mcpServersOf = async (
  spec: SpawnPayload,
  ctx: HarnessContext,
  withFleet: boolean
): Promise<AgyMcpServer[]> => {
  const gate = ctx.mcpGate;
  if (!gate) {
    throw new Error(
      "An Antigravity session reaches its MCP servers through its gate, and this one has none."
    );
  }
  const own = agyServer(MCP_SERVER_NAME, gatedCawco(gate));
  if (!withFleet || spec.fence) {
    return [own];
  }
  const all = inStartingSet(await fleetMcpAt(ctx.cwd), spec.startingSet);
  const fleet = Object.entries(throughMcpGate(all, gate)).flatMap(
    ([name, config]) =>
      name !== MCP_SERVER_NAME && "url" in config && config.type === "http"
        ? [agyServer(name, config)]
        : []
  );
  return [own, ...fleet];
};

/**
 * The session's own memory documents, each under its path, for its dir's
 * `GEMINI.md`: its folder's placed memory and the hub's documents for it.
 * The fleet's memory is left out: the dir's `GEMINI.md` opens with it as
 * it is at each sync (agy-fleet.ts).
 */
const memoryOf = async (spec: SpawnPayload, cwd: string): Promise<string> =>
  (await sessionMemory(spec, cwd))
    .filter(({ path }) => path !== fleetMemoryFile())
    .map(({ path, content }) => `# ${path}\n\n${content.trim()}`)
    .join("\n\n");

/**
 * The dir session `spec` runs in on its account, and the fleet that dir
 * takes: its starting set's skills (every skill with none) and its own
 * memory. A conversation runs in the dir it ran in before, as CawCo's note
 * of it names (agy-notes.ts), so one conversation keeps one dir and its
 * delete removes it; a new one in a dir named by the session's id.
 */
const placeOf = async (
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<AgySessionPlace> => {
  const key = spec.resume?.sessionKey;
  const noted = key ? (await readAgyNote(key)).dir : undefined;
  return {
    name: noted && AGY_SESSION_DIR_NAME.test(noted) ? noted : ctx.instanceId,
    fleet: {
      skills: spec.startingSet?.skills,
      memory: await memoryOf(spec, ctx.cwd),
    },
  };
};

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
 * Whether `spec` continues a conversation of agy's own default home: one
 * the person started in agy's terminal, which runs there, under agy's own
 * settings (tsk-340 story 14), whatever account the hub placed it on;
 * never a work item's.
 */
const continuesOwn = async (
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<boolean> => {
  const key = spec.resume?.sessionKey;
  // A work item's session runs in its account's home, under its judge:
  // never in the person's own, where no hook of CawCo's runs.
  if (!key || ctx.boundary) {
    return false;
  }
  const store = await findAgyConversation(key);
  return store !== undefined && store.accountId === undefined;
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
  const own = await continuesOwn(spec, ctx);
  const accountId = spec.accountDir?.accountId;
  if (!(own || accountId)) {
    throw new Error(agyWords.needsAccount);
  }
  await atCloneRoot(ctx);
  const place = own ? undefined : await placeOf(spec, ctx);
  const launch = await runPromise(
    (own || !accountId
      ? agyOwnLaunch(ctx.instanceId, commandEnv(ctx))
      : agyHookHeld(accountId).pipe(
          Effect.andThen(
            agyLaunch(
              accountId,
              ctx.instanceId,
              commandEnv(ctx),
              ctx.boundary !== undefined,
              place
            )
          )
        )
    ).pipe(Effect.mapError((refused) => new Error(refused.message)))
  );
  // A credential an earlier agy wrote to the account's store goes from it
  // (agy-scrub.ts), beside the launch: what agy opens of it then waits on
  // SQLite's own lock.
  if (!own && accountId) {
    scrubAgyStoreSoon(accountStore(accountId));
  }
  // agy's own home runs under its own setup: none of the fleet's.
  const mcpServers = await mcpServersOf(spec, ctx, !own);
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
    {
      afterSeq: 0,
      ...(launch.version ? { installed: launch.version } : {}),
      ...(!own && accountId ? { accountId } : {}),
    }
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
  spec: SpawnPayload,
  ctx: HarnessContext,
  options: { afterSeq?: number; head: number }
): Promise<HarnessSession> => {
  const { instanceId } = spec;
  const proc = await agyKeepers.holding(procIdFor("agy", instanceId));
  if (!proc) {
    throw new Error(`Antigravity's host for ${instanceId} is gone`);
  }
  // The promise edge of the machine's agy, read as a start reads it.
  const installed = await runPromise(
    agyToStart().pipe(
      Effect.map((agy) => agy.version),
      Effect.orElseSucceed(() => undefined)
    )
  );
  const accountId = (await continuesOwn(spec, ctx))
    ? undefined
    : spec.accountDir?.accountId;
  const session = new AgyRemoteSession(proc.client, ctx, proc, {
    ...(accountId ? { accountId } : {}),
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
