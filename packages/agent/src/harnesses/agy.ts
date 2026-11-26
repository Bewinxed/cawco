/**
 * Antigravity's adapter (core harness/agy.ts describes it): Google's `agy
 * acp`, one per session, held by a CawCo host the keeper keeps
 * (agy-sessiond.ts, agy-host.ts, agy-runtime.ts), in a home CawCo keeps per
 * Antigravity account and launched as that account's one sign-in method
 * says (agy-launch.ts), once the account's hook check passed
 * (agy-canary.ts), the fleet reaching them (agy-fleet.ts). A work item's
 * session runs in its workspace's boundary through CawCo's hook and judge
 * (agy-judge.ts, agy-runtime.ts). Stored conversations and adoption's proof
 * are the later items of tsk-340, and each refuses until then in its own
 * words.
 */
import { CONTROL_PROBE_ACCOUNT } from "@cawco/core/accounts/controls";
import type { RestartHold } from "@cawco/core/binary-updates";
import type { FleetSyncReport, PlacedFleetConfig } from "@cawco/core/fleet";
import type {
  HarnessCapabilities,
  HarnessReport,
  SignInFault,
} from "@cawco/core/harness";
import { AGY } from "@cawco/core/harness/agy";
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
import type { FleetPart } from "../fleet-parts";
import {
  cannot,
  type Harness,
  type HarnessContext,
  type HarnessSession,
  type KeeperCustody,
  noCarry,
  type SomeControls,
} from "../harness";
import { probeStarted } from "../probe-count";
import { procEpoch } from "../sessiond-client";
import { resolveBin, toolGate } from "../tools";
import {
  agyFleetHoldings,
  agyFleetHooks,
  agyFleetStatus,
  syncAgyFleet,
} from "./agy-fleet";
import { AGY_SPEC } from "./agy-launch";
import { agyAccountIds } from "./agy-models";
import {
  adoptAgy,
  agyDenials,
  agyKeepers,
  agySnapshot,
  spawnAgy,
} from "./agy-sessiond";
import { probeAgyAccount } from "./agy-signin";
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
  // The fleet's skills and memory reach every account's home and its hooks
  // run through CawCo's own (agy-fleet.ts); a fleet plugin is Claude
  // Code's, which agy does not load.
  plugins: false,
};

/** Why each stored-conversation member refuses until agy's store is read. */
const NO_STORE = "CawCo doesn't read Antigravity's stored conversations yet.";

class AgyHarness implements Harness<"agy"> {
  readonly kind = "agy" as const;
  readonly capabilities = AGY_CAPABILITIES;
  /** Its `detect` reads agy's version alone: each account's models are the hub's probe of it ({@link machineControls}). */
  readonly detectStartsNothing = true;
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
   * agy on this machine and its version. Its models are each account's, read
   * by the hub's probe of the account (descriptor `modelCatalog`), never the
   * machine's: a Gemini API key's account lists Gemini alone.
   */
  async detect(): Promise<HarnessReport> {
    const gate = await toolGate(AGY_SPEC);
    probeStarted();
    const installed = gate.refused !== "not-installed";
    this.authReason = gate.refused === "version" ? gate.words : undefined;
    return {
      harness: "agy",
      installed,
      auth: this.auth,
      capabilities: AGY_CAPABILITIES,
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

  /** agy's saved outputs are its conversation's, read through its judge (descriptor `spills`). */
  readonly spill = cannot(
    "Antigravity keeps an output too large for its model in its own home."
  );

  readonly providerList = cannot(
    "Antigravity's models are agy's own, listed per account."
  );

  /** The hub's probe of an Antigravity account: the models agy lists in its home (agy-signin.ts). */
  readonly machineControls: SomeControls = {
    [CONTROL_PROBE_ACCOUNT]: (account) => probeAgyAccount(account),
  };

  /**
   * A session on its account, a work item's in its workspace: a fork and a
   * clean start refused in words first. The fleet's baseline and every
   * session's own-list, subagent and question denials beside the spawn's
   * own, as every harness takes them, held by the session's judge in agy's
   * names.
   */
  async spawn(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession> {
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

  /** The fleet's skills and memory, linked into every Antigravity account's home here (agy-fleet.ts). */
  syncFleet(
    config: PlacedFleetConfig,
    parts: ReadonlySet<FleetPart>
  ): Promise<FleetSyncReport> {
    return syncAgyFleet(config, parts, agyAccountIds());
  }

  fleetHoldings() {
    return agyFleetHoldings();
  }

  /** Each fleet hook as CawCo's hook and ACP client run it (agy-fleet-hooks.ts). */
  fleetHooks() {
    return agyFleetHooks();
  }

  fleetStatus(): Promise<FleetSyncReport> {
    return agyFleetStatus();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

export const agyHarness: Harness<"agy"> = new AgyHarness();
