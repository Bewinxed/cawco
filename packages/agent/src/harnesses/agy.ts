/**
 * Antigravity's adapter (core harness/agy.ts describes it): Google's `agy
 * acp`, one per session, held by a CawCo host the keeper keeps
 * (agy-sessiond.ts, agy-host.ts, agy-runtime.ts), in a home CawCo keeps per
 * Antigravity account and launched as that account's one sign-in method
 * says (agy-launch.ts), once the account's hook check passed
 * (agy-canary.ts), the fleet reaching them (agy-fleet.ts). A work item's
 * session runs in its workspace's boundary through CawCo's hook and judge
 * (agy-judge.ts, agy-runtime.ts). Its stored conversations are read from
 * agy's own files (agy-store.ts), those of every account's home and of
 * agy's own default home. Adoption's proof is a later item of tsk-340.
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
import { isEffortLevel } from "@cawco/core/harness/kinds";
import { agyFleetRoot } from "@cawco/core/paths/harnesses";
import type { SpawnPayload } from "@cawco/core/protocol";
import type {
  AuthState,
  NeutralSessionInfo,
  SessionMessage,
  StoredRun,
} from "@cawco/core/session-messages";
import { resumeCursor } from "@cawco/core/stream";
import type { TranscriptWindow, WindowAsk } from "@cawco/core/transcript-types";
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
  type TranscriptSpan,
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
import { agySpan, agyWindow } from "./agy-history";
import { AGY_SPEC } from "./agy-launch";
import { changeAgyPersonNote } from "./agy-notes";
import {
  adoptAgy,
  agyDenials,
  agyKeepers,
  agySnapshot,
  spawnAgy,
} from "./agy-sessiond";
import { probeAgyAccount } from "./agy-signin";
import {
  agyConversationEntries,
  agyConversationInfo,
  agyLastModel,
  findAgyConversation,
  listAgyConversations,
} from "./agy-store";
import { agyAccountIds, deleteAgyConversation } from "./agy-store-files";
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
  // Its background commands are agy's own; CawCo's task list is not wired to them.
  tasks: false,
  // The fleet's skills and memory reach every account's home and its hooks
  // run through CawCo's own (agy-fleet.ts); a fleet plugin is Claude
  // Code's, which agy does not load.
  plugins: false,
};

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

  /**
   * A conversation follows its project's folder on this machine: its note
   * names the new folder, which a resume opens it in. agy's store lives in
   * its home, which no other machine's agy reads, so it never moves there.
   */
  readonly folderCarry = {
    here: async (one: { sessionId: string; to: string }) => {
      await changeAgyPersonNote(one.sessionId, (note) => ({
        ...note,
        movedTo: one.to,
      }));
    },
    drop: cannot(agyWords.staysOnMachine),
    take: cannot(agyWords.staysOnMachine),
    tops: cannot(agyWords.staysOnMachine),
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

  /** Every stored conversation, of every account's home and of agy's own, those run in `dir` alone when it names one. */
  listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    return listAgyConversations(dir);
  }

  /** A conversation id is agy's own, the same in every folder. */
  getSessionInfo(sessionKey: string): Promise<NeutralSessionInfo | null> {
    return agyConversationInfo(sessionKey);
  }

  async getSessionMessages(
    sessionKey: string,
    _dir?: string,
    tail?: number,
    span: TranscriptSpan = "chain"
  ): Promise<SessionMessage[]> {
    const entries = agySpan(await agyConversationEntries(sessionKey), span);
    return tail ? entries.slice(-tail) : entries;
  }

  async readTranscriptWindow(
    sessionKey: string,
    _dir: string | undefined,
    ask: WindowAsk
  ): Promise<TranscriptWindow> {
    return agyWindow(await agyConversationEntries(sessionKey), ask);
  }

  /** Named in CawCo's note: agy's own title stays its default (agy-notes.ts). */
  async renameSession(sessionKey: string, title: string): Promise<void> {
    await this.#stored(sessionKey);
    await changeAgyPersonNote(sessionKey, (note) => ({
      ...note,
      customTitle: title,
    }));
  }

  async tagSession(sessionKey: string, tag: string | null): Promise<void> {
    await this.#stored(sessionKey);
    await changeAgyPersonNote(sessionKey, ({ tag: _tag, ...note }) =>
      tag === null ? note : { ...note, tag }
    );
  }

  /**
   * Every file of the conversation removed from its account's home
   * (agy-store-files.ts). One in agy's own home is the person's, which CawCo
   * never writes; one no store holds is gone already.
   */
  async deleteSession(sessionKey: string): Promise<void> {
    const store = await findAgyConversation(sessionKey);
    if (!store) {
      return;
    }
    if (!store.accountId) {
      throw new Error(agyWords.ownDeleteRefused);
    }
    await deleteAgyConversation(store, sessionKey);
  }

  /**
   * What the conversation ran on: its account's home, and the model and
   * thinking level its transcript last names. One of agy's own home names
   * no account, and runs on agy's own sign-in. CawCo's mode is recorded
   * nowhere: it resumes in the default.
   */
  async storedRun(sessionKey: string): Promise<StoredRun> {
    const store = await findAgyConversation(sessionKey);
    if (!store) {
      return {};
    }
    const ran = await agyLastModel(sessionKey);
    return {
      ...(store.accountId ? { account: store.accountId } : {}),
      ...(ran ? { model: { from: "transcript", value: ran.model } } : {}),
      ...(ran?.effort && isEffortLevel(ran.effort)
        ? { effort: { from: "transcript", value: ran.effort } }
        : {}),
      permissionMode: { from: "default", value: "default" },
    };
  }

  /** The store that holds `sessionKey`, or why there is none. */
  async #stored(sessionKey: string): Promise<void> {
    if (!(await findAgyConversation(sessionKey))) {
      throw new Error(agyWords.noConversation);
    }
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
