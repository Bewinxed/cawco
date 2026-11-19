/**
 * Codex's adapter (core harness/codex.ts describes it): one `codex
 * app-server` per session under the keeper (codex-session.ts), a Codex home
 * per account (codex-home.ts), stored threads read through Codex's own API
 * (codex-history.ts). The Codex audit of 2026-11-17 (the project's
 * `assets/f1ed8995/codex-harness-parity.md`) is what each member rests on.
 */

import { join } from "node:path";
import type { RestartHold } from "@cawco/core/binary-updates";
import type {
  FleetHoldings,
  FleetItemState,
  FleetSyncReport,
  PlacedFleetConfig,
} from "@cawco/core/fleet";
import type {
  HarnessCapabilities,
  HarnessReport,
  SignInFault,
} from "@cawco/core/harness";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { PERMISSION_MODES } from "@cawco/core/harness/modes";
import { codexFleetRoot, harnessRecordsDir } from "@cawco/core/paths/harnesses";
import type { SpawnPayload } from "@cawco/core/protocol";
import type {
  AuthState,
  NeutralSessionInfo,
  SessionMessage,
  StoredRun,
} from "@cawco/core/session-messages";
import { resumeCursor } from "@cawco/core/stream";
import type { TranscriptWindow, WindowAsk } from "@cawco/core/transcript-types";
import { toolVersion } from "../capabilities";
import { sessionFleetDenials } from "../denied-tools";
import { heldSkills, syncSkillFiles } from "../fleet";
import type { FleetPart } from "../fleet-parts";
import type {
  Harness,
  HarnessContext,
  HarnessSession,
  KeeperCustody,
  SessionCarry,
  TranscriptSpan,
} from "../harness";
import { cannot, noCarry } from "../harness";
import type { HarnessCli } from "../harness-cli";
import { writeJson } from "../json-file";
import { probeStarted } from "../probe-count";
import { procEpoch } from "../sessiond-client";
import { resolveBin, runnable, toolGate } from "../tools";
import { FULL_CAPABILITIES } from "./capabilities";
import { codexFolderCarry } from "./codex-folder";
import {
  codexEntries,
  codexThreadRan,
  deleteCodexThread,
  inStore,
  listCodexThreads,
  readCodexThread,
  renameCodexThread,
  tagCodexThread,
  windowOf,
} from "./codex-history";
import { CODEX_SPEC, endCodexSignIns } from "./codex-home";
import {
  adoptCodex,
  codexKeepers,
  codexWindows,
  spawnCodex,
} from "./codex-session";
import { type FleetSidecar, readSidecar, skillStatesIn } from "./fleet-common";
import { keeperCustody, liveChild } from "./keeper-custody";
import { neutralSubagentChange } from "./neutral-subagents";

/**
 * What Codex does, from everything a harness can: every permission mode
 * (codex-session.ts `CODEX_MODES`) and all the rest the audit found it
 * meets, but these.
 */
const CODEX_CAPABILITIES: HarnessCapabilities = {
  ...FULL_CAPABILITIES,
  permissionModes: [...PERMISSION_MODES],
  // Codex lists its servers (`mcpServerStatus/list`) but turns none on or
  // off one at a time: its reload takes the whole config again (C-bg).
  mcpControl: false,
  // `thread/revert` rewinds a thread's history and leaves its files (C-i);
  // CawCo's rewind is not wired to it yet.
  rewind: false,
  // Its background terminals are listed and ended over the API (C-bg);
  // CawCo's task list is not wired to them yet.
  tasks: false,
  // App-server's plugin methods are "under development … Don't call this
  // method from production clients yet" (C-z).
  plugins: false,
  // Its hooks run from the account home's `hooks.json`, each trusted by its
  // hash (C-b2); the fleet sync writes none there yet.
  hooks: false,
};

/** The fleet's skills for Codex, in CawCo's own dir, linked into every account's home as its `skills`. */
const CODEX_SKILLS = join(codexFleetRoot(), "skills");
/** What the fleet sync last wrote for Codex. */
const CODEX_SIDECAR = join(harnessRecordsDir("codex"), "fleet.json");

/** The providers a Codex account is of, by pi-ai's ids: a ChatGPT plan, an OpenAI key. */
const CODEX_PROVIDERS = ["openai-codex", "openai"] as const;

/**
 * Codex's models as its own catalog lists them (`model/list`, its bundled
 * catalog without a sign-in: C-e), one row per account provider that can
 * run them, `<provider>/<id>`, each with the window its turns reported.
 */
const modelCatalog = (): Promise<ModelInfo[]> =>
  inStore(async (peer) => {
    const listed = await peer.request("model/list", { limit: 100 });
    return listed.data
      .filter((model) => !model.hidden)
      .flatMap((model) =>
        CODEX_PROVIDERS.map((provider): ModelInfo => ({
          value: `${provider}/${model.id}`,
          displayName: model.displayName,
          description: model.description,
          supportsEffort: model.supportedReasoningEfforts.length > 0,
          supportedEffortLevels: model.supportedReasoningEfforts.map(
            (one) => one.reasoningEffort
          ),
          defaultEffort: model.defaultReasoningEffort,
          ...(codexWindows.has(model.id)
            ? { contextWindow: codexWindows.get(model.id) }
            : {}),
        }))
      );
  });

class CodexHarness implements Harness<"codex"> {
  readonly kind = "codex" as const;
  readonly capabilities = CODEX_CAPABILITIES;
  readonly subagentChange = neutralSubagentChange;
  readonly cli: HarnessCli = {
    find: () => Promise.resolve(resolveBin("codex")),
    missing: undefined,
    // The native binary the launcher fronts, as the gate reads it.
    version: (path) => {
      const run = runnable(CODEX_SPEC, path);
      return run.kind === "native"
        ? toolVersion(run.bin, run.env)
        : Promise.resolve({ kind: "answered", value: undefined });
    },
  };
  auth: AuthState = "authenticated";
  authReason: string | undefined;
  /** Its sign-ins are each account home's, read at each start. */
  readonly authMovesLive = false;
  /** Its threads are read through a one-off app-server. */
  readonly catalogFromServer = false;
  /** Its `detect` starts an app-server for its model list. */
  readonly detectStartsNothing = false;
  /** Codex re-initialises an HTTP MCP session the hub answers 404, by itself (C-hub). */
  readonly healsFleetMcp = false;
  /** Its `/compact` runs in its session's own app-server (`thread/compact/start`, C-c). */
  readonly relaunchesOnManualCompact = false;
  readonly signInFaults: SignInFault[] = [];

  async detect(): Promise<HarnessReport> {
    probeStarted();
    const gate = await toolGate(CODEX_SPEC);
    const installed = gate.refused !== "not-installed";
    const read =
      installed && !gate.refused
        ? await modelCatalog().then(
            (models) => ({ models }),
            (error: unknown) => ({
              modelsUnread: `Codex didn't list its models (${error instanceof Error ? error.message : String(error)}).`,
            })
          )
        : {};
    // A Codex not the one release CawCo runs is the machine's word on Codex.
    this.authReason = gate.refused === "version" ? gate.words : undefined;
    const report: HarnessReport = {
      harness: "codex",
      installed,
      auth: this.auth,
      capabilities: CODEX_CAPABILITIES,
      ...read,
    };
    if (gate.version) {
      report.version = gate.version;
    }
    if (gate.refused) {
      report.refused = gate.refused;
    }
    if (this.authReason) {
      report.authReason = this.authReason;
    }
    return report;
  }

  /** Each session reads its account's home as it starts. */
  accountsChanged(): Promise<void> {
    return Promise.resolve();
  }

  readonly folderCarry = codexFolderCarry;

  /** Every account's home reads one thread store, so a session that changes account carries nothing (descriptor `accountDir`). */
  carrier(): SessionCarry {
    return noCarry(
      "A Codex session keeps no account dir: every account's Codex home reads the machine's one thread store."
    );
  }

  /** Codex makes its MCP session with a restarted hub again by itself (C-hub). */
  hubRestarted(): Promise<void> {
    return Promise.resolve();
  }

  /** Every turn runs in its session's keeper-held app-server. */
  restartHolds(): RestartHold[] {
    return [];
  }

  /** Codex keeps a large output's head and tail and saves no file (C-s). */
  readonly spill = cannot(
    "Codex saves no output too large for its model: it keeps the output's head and tail."
  );

  readonly providerList = cannot(
    "Codex's providers are a ChatGPT plan's and an OpenAI key's, CawCo's own account providers."
  );

  readonly machineControls = {};

  /**
   * The fleet's baseline and every session's own-list, subagent and
   * question denials beside the spawn's own, as every harness takes them
   * (denied-tools.ts `sessionFleetDenials`): Codex's subagents go with
   * `agents.enabled = false` (C-z), its question tool answers nothing outside
   * its plan collaboration mode, which CawCo never starts (C-h).
   */
  async spawn(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession> {
    const fleet = await sessionFleetDenials();
    return await spawnCodex(
      {
        ...spec,
        denyTools: [...new Set([...fleet, ...(spec.denyTools ?? [])])],
      },
      ctx
    );
  }

  readonly custody: KeeperCustody = {
    kind: "keeper",
    ...keeperCustody("codex", codexKeepers),
    adopt: (spec, ctx, options) => adoptCodex(spec, ctx, options),
    // The keeper holds the app-server, whose turn runs on through an agent
    // restart (C-r); whether one runs is the thread's own status, read on
    // the adoption.
    turnRunning: () => Promise.resolve(false),
  };

  async reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined> {
    const proc = await liveChild(this.custody, "codex", spec.instanceId);
    return proc
      ? await adoptCodex(spec, ctx, {
          head: proc.head,
          afterSeq: resumeCursor(procEpoch(proc.epoch, proc.pid), ctx.ingested),
        })
      : undefined;
  }

  /**
   * Its threads are read through its own app-server, so a machine without
   * Codex has none to list: none, never a listing that failed (which the
   * hub says beside every find). A Codex the gate refuses for its version
   * is there and fails as it is.
   */
  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    if ((await toolGate(CODEX_SPEC)).refused === "not-installed") {
      return [];
    }
    return await listCodexThreads(dir);
  }

  getSessionInfo(sessionKey: string): Promise<NeutralSessionInfo | null> {
    return readCodexThread(sessionKey);
  }

  /** Its turns as said, every one: Codex keeps each turn across a compaction (C-c). */
  async getSessionMessages(
    sessionKey: string,
    _dir?: string,
    tail?: number,
    _span?: TranscriptSpan
  ): Promise<SessionMessage[]> {
    const entries = await codexEntries(sessionKey);
    return tail === undefined ? entries : entries.slice(-tail);
  }

  async readTranscriptWindow(
    sessionKey: string,
    _dir: string | undefined,
    ask: WindowAsk
  ): Promise<TranscriptWindow> {
    return windowOf(await codexEntries(sessionKey), ask);
  }

  renameSession(sessionKey: string, title: string): Promise<void> {
    return renameCodexThread(sessionKey, title);
  }

  deleteSession(sessionKey: string): Promise<void> {
    return deleteCodexThread(sessionKey);
  }

  tagSession(sessionKey: string, tag: string | null): Promise<void> {
    return tagCodexThread(sessionKey, tag);
  }

  /** What the thread last ran with: its model under the provider it ran on, and its effort. */
  async storedRun(sessionKey: string): Promise<StoredRun> {
    const ran = await codexThreadRan(sessionKey).catch(() => undefined);
    if (!ran?.model) {
      return {};
    }
    // Codex names a ChatGPT plan's provider `openai` as it does a key's:
    // the account a resume runs on says which, so the model is named bare.
    return {
      model: { from: "transcript", value: ran.model },
      ...(ran.effort
        ? { effort: { from: "transcript", value: ran.effort } }
        : {}),
    };
  }

  fleetHome(): string {
    return codexFleetRoot();
  }

  /**
   * The parts of a fleet sync Codex has: its skills, into CawCo's own dir
   * every account home links as its `skills`. The fleet's memory is the
   * shared file each session takes as its developer instructions at its
   * start (codex-session.ts), written by the other harnesses' syncs.
   */
  async syncFleet(
    config: PlacedFleetConfig,
    parts: ReadonlySet<FleetPart>
  ): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(CODEX_SIDECAR);
    const skillStates: Record<string, FleetItemState> = {};
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: skillStates,
      at: Date.now(),
    };
    // Codex runs a hook only from its home's `hooks.json`, each trusted by
    // its hash (C-b2), and CawCo writes none there yet: each fleet hook is
    // said not run on Codex, never left out.
    if (parts.has("hooks")) {
      report.hooks = Object.fromEntries(
        config.hooks.map((hook) => [
          hook.id,
          {
            state: "unsupported",
            detail:
              "CawCo doesn't run the fleet's hooks in Codex sessions yet.",
          },
        ])
      );
    }
    if (parts.has("skills")) {
      const skills = await syncSkillFiles(
        CODEX_SKILLS,
        config.skills,
        sidecar.skills,
        skillStates
      );
      await writeJson(CODEX_SIDECAR, {
        ...sidecar,
        skills,
        userLayerMoved: true,
      } satisfies FleetSidecar);
    }
    return report;
  }

  async fleetHoldings(): Promise<FleetHoldings> {
    const sidecar = await readSidecar(CODEX_SIDECAR);
    return {
      skills: await heldSkills(CODEX_SKILLS, Object.keys(sidecar.skills)),
    };
  }

  readonly fleetHooks = cannot(
    "Codex runs its hooks itself, from its home's hooks.json; its sync's report says each"
  );

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(CODEX_SIDECAR);
    return {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: await skillStatesIn(CODEX_SKILLS, sidecar.skills),
      at: Date.now(),
    };
  }

  dispose(): Promise<void> {
    endCodexSignIns();
    return Promise.resolve();
  }
}

export const codexHarness: Harness<"codex"> = new CodexHarness();
