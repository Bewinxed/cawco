/**
 * Antigravity's adapter (core harness/agy.ts describes it): Google's `agy
 * acp`, one per session, held by a CawCo host the keeper keeps
 * (agy-sessiond.ts, agy-host.ts, agy-runtime.ts), in a home CawCo keeps per
 * Antigravity account and launched as that account's one sign-in method
 * says (agy-launch.ts). Plain sessions run here; a work item's session,
 * stored conversations, fleet sync and adoption's proof are the later
 * items of tsk-340, and each refuses until then in its own words.
 */
import type { RestartHold } from "@cawco/core/binary-updates";
import type { FleetSyncReport } from "@cawco/core/fleet";
import type {
  HarnessCapabilities,
  HarnessReport,
  SignInFault,
} from "@cawco/core/harness";
import { AGY } from "@cawco/core/harness/agy";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { agyFleetRoot } from "@cawco/core/paths/harnesses";
import type { SpawnPayload } from "@cawco/core/protocol";
import type {
  AuthState,
  NeutralSessionInfo,
} from "@cawco/core/session-messages";
import { resumeCursor } from "@cawco/core/stream";
import type { TranscriptWindow } from "@cawco/core/transcript-types";
import { agyWords } from "@cawco/core/words/agy";
import { toolVersion } from "../capabilities";
import { sessionFleetDenials } from "../denied-tools";
import {
  cannot,
  type Harness,
  type HarnessContext,
  type HarnessSession,
  type KeeperCustody,
  noCarry,
} from "../harness";
import { probeStarted } from "../probe-count";
import { procEpoch } from "../sessiond-client";
import { resolveBin, toolGate } from "../tools";
import { AGY_SPEC } from "./agy-launch";
import { agyAccountIds, agyAccountModels } from "./agy-models";
import {
  adoptAgy,
  agyDenials,
  agyKeepers,
  agySnapshot,
  spawnAgy,
} from "./agy-sessiond";
import { FULL_CAPABILITIES } from "./capabilities";
import { keeperCustody, liveChild } from "./keeper-custody";
import { neutralSubagentChange } from "./neutral-subagents";

/**
 * What Antigravity does, from everything a harness can, but these, each
 * with why.
 */
const AGY_CAPABILITIES: HarnessCapabilities = {
  ...FULL_CAPABILITIES,
  // CawCo's modes, answered by its judge (agy-judge.ts); Claude Code's Auto is not agy's.
  permissionModes: [...AGY.permissionModes],
  // agy's ACP has no fork (`session/fork` is a draft agy does not answer) and no rewind.
  fork: false,
  rewind: false,
  // agy's own subagents are denied: work goes to CawCo's delegates.
  subagents: false,
  // agy reports a turn's tokens, never their price.
  costUsd: false,
  // agy's ACP lists no MCP server's state and turns none on or off.
  mcpStatus: false,
  mcpControl: false,
  // agy reads its skills again before each turn by itself.
  reloadSkills: false,
  // Stored conversations are read, listed, renamed, tagged and deleted
  // once agy's store is read (tsk-340 item 8).
  listSessions: false,
  getSessionMessages: false,
  renameSession: false,
  tagSession: false,
  deleteSession: false,
  // Its background commands are agy's own; CawCo's task list is not wired to them.
  tasks: false,
  // The fleet's skills, memory, hooks and plugins reach agy's home with its fleet sync (tsk-340 item 9).
  fleet: false,
  skills: false,
  hooks: false,
  plugins: false,
};

/** Why each stored-conversation member refuses until agy's store is read. */
const NO_STORE = "CawCo doesn't read Antigravity's stored conversations yet.";

/** Why agy's fleet hooks are not read: the fleet sync writes none for it yet. */
const NO_FLEET = "CawCo doesn't sync the fleet into Antigravity yet.";

/**
 * Whether `spec` is a work item's session, which agy runs none of until its
 * workspace boundary is proven (tsk-340 item 4): a delegate's workspace, or
 * a host-scope delegate's scratch.
 */
const isWorkItem = (spec: SpawnPayload, ctx: HarnessContext): boolean =>
  spec.workspace !== undefined ||
  spec.hostScratch !== undefined ||
  ctx.boundary !== undefined ||
  ctx.hostTmp !== undefined;

/**
 * The models every Antigravity account here offers, read live in its own
 * home, each model once; and each account whose models agy would not list,
 * in its own words.
 */
const accountModels = async (): Promise<{
  models: ModelInfo[];
  unread: string[];
}> => {
  const models = new Map<string, ModelInfo>();
  const unread: string[] = [];
  for (const accountId of agyAccountIds()) {
    try {
      for (const model of await agyAccountModels(accountId)) {
        models.set(model.value, models.get(model.value) ?? model);
      }
    } catch (error) {
      unread.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { models: [...models.values()], unread };
};

class AgyHarness implements Harness<"agy"> {
  readonly kind = "agy" as const;
  readonly capabilities = AGY_CAPABILITIES;
  /** Its `detect` starts agy in each account's home for its models. */
  readonly detectStartsNothing = false;
  /** Each account's sign-in is read at each start. */
  readonly authMovesLive = false;
  /** Its `/compact` runs in its session's own agy. */
  readonly relaunchesOnManualCompact = false;
  /** agy's MCP client makes its session with a restarted hub again by itself. */
  readonly healsFleetMcp = false;
  readonly catalogFromServer = false;
  readonly signInFaults: SignInFault[] = [];
  readonly subagentChange = neutralSubagentChange;
  auth: AuthState = "authenticated";
  authReason: string | undefined;
  /** The `agy` on the machine's PATH, its version its `--version`. */
  readonly cli = {
    missing: undefined,
    version: toolVersion,
    find: () => Promise.resolve(resolveBin(AGY_SPEC.bin)),
  };

  /**
   * agy on this machine and its version, and the models each Antigravity
   * account here offers ({@link accountModels}).
   */
  async detect(): Promise<HarnessReport> {
    const gate = await toolGate(AGY_SPEC);
    probeStarted();
    const installed = gate.refused !== "not-installed";
    this.authReason = gate.refused === "version" ? gate.words : undefined;
    const read =
      installed && !gate.refused
        ? await accountModels()
        : { models: [], unread: [] };
    return {
      harness: "agy",
      installed,
      auth: this.auth,
      capabilities: AGY_CAPABILITIES,
      ...(read.models.length > 0 ? { models: read.models } : {}),
      ...(read.unread.length > 0
        ? { modelsUnread: read.unread.join(" ") }
        : {}),
      ...(gate.version ? { version: gate.version } : {}),
      ...(gate.refused ? { refused: gate.refused } : {}),
      ...(this.authReason ? { authReason: this.authReason } : {}),
    };
  }

  /** Each session reads its account as it starts. */
  accountsChanged(): Promise<void> {
    return Promise.resolve();
  }

  readonly folderCarry = {
    drop: cannot(NO_STORE),
    here: cannot(NO_STORE),
    take: cannot(NO_STORE),
    tops: cannot(NO_STORE),
  };

  /** A conversation lives in its account's own home (descriptor `accountDir`). */
  carrier() {
    return noCarry("An Antigravity session never moves between accounts.");
  }

  /** agy's MCP client reconnects to a restarted hub by itself. */
  hubRestarted(): Promise<void> {
    return Promise.resolve();
  }

  /** Every turn runs in its session's own keeper-held host. */
  restartHolds(): RestartHold[] {
    return [];
  }

  /** agy's saved outputs stay in its home, which no workspace reads (descriptor `spills`). */
  readonly spill = cannot(
    "Antigravity keeps an output too large for its model in its own home."
  );

  readonly providerList = cannot(
    "Antigravity's models are agy's own, listed per account."
  );

  readonly machineControls = {};

  /**
   * A plain session on its account: a work item, a fork and a clean start
   * refused in words first. The fleet's baseline and every session's
   * own-list, subagent and question denials beside the spawn's own, as
   * every harness takes them, held by the session's judge in agy's names.
   */
  async spawn(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession> {
    if (isWorkItem(spec, ctx)) {
      throw new Error(agyWords.noWorkItems);
    }
    if (spec.resume?.fork) {
      throw new Error(agyWords.noFork);
    }
    if (spec.clean) {
      throw new Error(AGY.cleanStartRefused);
    }
    const fleet = await sessionFleetDenials();
    return await spawnAgy(
      spec,
      ctx,
      agyDenials([...new Set([...fleet, ...(spec.denyTools ?? [])])])
    );
  }

  readonly custody: KeeperCustody = {
    kind: "keeper",
    ...keeperCustody("agy", agyKeepers),
    adopt: (spec, ctx, options) => adoptAgy(spec.instanceId, ctx, options),
    turnRunning: async (instanceId) => (await agySnapshot(instanceId)).busy,
  };

  async reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined> {
    const proc = await liveChild(this.custody, "agy", spec.instanceId);
    return proc
      ? await adoptAgy(spec.instanceId, ctx, {
          head: proc.head,
          afterSeq: resumeCursor(procEpoch(proc.epoch, proc.pid), ctx.ingested),
        })
      : undefined;
  }

  /** None yet: agy's store is not read (capability `listSessions`). */
  listSessions(): Promise<NeutralSessionInfo[]> {
    return Promise.resolve([]);
  }

  getSessionInfo(): Promise<NeutralSessionInfo | null> {
    return Promise.resolve(null);
  }

  getSessionMessages = cannot(NO_STORE);
  readTranscriptWindow: () => Promise<TranscriptWindow> = cannot(NO_STORE);
  renameSession = cannot(NO_STORE);
  deleteSession = cannot(NO_STORE);
  tagSession = cannot(NO_STORE);

  /** Nothing read back of a stored conversation yet. */
  storedRun() {
    return Promise.resolve({});
  }

  fleetHome(): string {
    return agyFleetRoot();
  }

  /**
   * Nothing written yet (capability `fleet`): an empty report, which says
   * nothing of any entry, so no other harness's word on one is outranked.
   */
  syncFleet(): Promise<FleetSyncReport> {
    return Promise.resolve({
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    });
  }

  fleetHoldings() {
    return Promise.resolve({ skills: {} });
  }

  readonly fleetHooks = cannot(NO_FLEET);

  fleetStatus(): Promise<FleetSyncReport> {
    return this.syncFleet();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

export const agyHarness: Harness<"agy"> = new AgyHarness();
