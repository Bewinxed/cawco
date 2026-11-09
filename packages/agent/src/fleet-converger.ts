/**
 * The machine's fleet convergence: the deltas the hub sends held on disk as
 * they arrive (fleet-desired.ts), converged across every harness one pass at
 * a time (`#fleetTurn`), reported back, and probed on a
 * tick of its own. It never touches a session except to tell a live one to
 * take again what of the fleet it reads ({@link FleetConverger.healFleetMcp}),
 * through what its {@link FleetHost} lets it see.
 */

import { existsSync } from "node:fs";
import { detach } from "@cawco/core/detach";
import type {
  FleetAck,
  FleetConvergeFrame,
  FleetDelta,
  FleetHeld,
  FleetHoldings,
  FleetItemState,
  FleetItemStatus,
  FleetMcpServer,
  FleetSyncReport,
  PlacedFleetConfig,
} from "@cawco/core/fleet";
import {
  PLACED_SECTIONS,
  placedApart,
  worstFleetState,
} from "@cawco/core/fleet";
import { readingLines, shortDetail } from "@cawco/core/fleet-fault-reason";
import type { FleetItemKind } from "@cawco/core/fleet-items";
import { secretValuesOf, withoutSecrets } from "@cawco/core/fleet-secrets";
import type { FleetReportFrame } from "@cawco/core/frames";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { Envelope } from "@cawco/core/protocol";
import type { FleetMcpTakeAnswer } from "@cawco/core/session/controls";
import {
  CONTROL_FLEET_SETTINGS,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_FLEET_HEAL,
} from "@cawco/core/session/controls";
import { recordAgentState } from "./agent-state";
import { rearmMoved, recheckNarrowed } from "./boundary/looks";
import { buildKey } from "./build";
import { harnessMcpUrl } from "./delegation";
import { applyFleetDenials } from "./denied-tools";
import { placeFolder, probeToolchain } from "./fleet";
import { basisMoved, type ConvergeBasis } from "./fleet-converged";
import { FleetDesired, itemStatuses } from "./fleet-desired";
import { within, writeFleetMcpSet } from "./fleet-mcp-set";
import {
  FLEET_PARTS,
  type FleetMoves,
  type FleetPart,
  movesOf,
} from "./fleet-parts";
import {
  type FleetPlace,
  placedConfig,
  place as placeRowsAt,
  placesNow,
} from "./fleet-place";
import { keepOnlyPlaceSets, keepPlaceSet } from "./fleet-place-set";
import { laidOver } from "./fleet-report";
import type { HarnessSession } from "./harness";
import { harnesses, harness as harnessOf } from "./harnesses";
import { isMachineAgent } from "./machine-agent";
import { type HostedConfig, hostedEntry, mcpHost } from "./mcp-host";
import { placeInstalls, syncInstalls } from "./mcp-install";
import { resolveMcpLauncher } from "./mcp-launcher";
import { onFleetMcpMoved } from "./mcp-status";
import { errorText, warn } from "./session-log";

/** What the converger reads of the live sessions, and where its frames go. */
export interface FleetHost {
  /** The folder a live session runs in, as its spawn named it. */
  cwdOf: (instanceId: string) => string | undefined;
  /** An envelope on the daemon's hub socket. */
  emit: (envelope: Envelope) => void;
  /** The live sessions, by instance id. */
  ids: () => string[];
  /** The live session's harness process, if this agent carries one. */
  session: (instanceId: string) => HarnessSession | undefined;
}

/**
 * The key a row's resolved launch is kept under (`#launcherOf`): a fleet
 * row's name, a project row's name and project, so every place of the
 * project launches it as its first did and a clone cut later resolves
 * nothing again.
 */
const launchKeyOf = (row: FleetMcpServer): string =>
  row.placeId ? `${row.name}@project:${row.projectId ?? ""}` : row.name;

/** Each placed copy that failed in `report`, in words: its section, its row and why. */
const failedPlaced = (report: FleetSyncReport): string[] =>
  Object.entries(placedApart(report).placed ?? {}).flatMap(([section, rows]) =>
    Object.entries(rows ?? {}).flatMap(([key, byPlace]) =>
      Object.values(byPlace)
        .filter((state) => state.state === "failed")
        .map((state) => `${section} ${key}: ${state.detail ?? "failed"}`)
    )
  );

/**
 * How often the machine's fleet probes run (`#healthTick`): every `claude`'s
 * version and the fleet content on its disk, which no converge reads.
 */
const HEALTH_MS = 10 * 60_000;

/**
 * What EVERY claimant agrees this machine holds, by hash.
 *
 * Intersected, never unioned: more than one harness converges the fleet's
 * skills, into more than one directory, so a hash one of them holds is not a
 * hash the machine holds. The hub leaves content out on the strength of this,
 * and the cost of being wrong is a harness stranded without files it needs.
 *
 * No claimants agree on nothing, which is the honest answer for a daemon whose
 * harnesses keep no copy: it is then sent everything.
 */
const agreedHashes = (
  claims: Record<string, string>[]
): Record<string, string> => {
  const [first, ...rest] = claims;
  if (!first) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(first).filter(([name, hash]) =>
      rest.every((claim) => claim[name] === hash)
    )
  );
};

export class FleetConverger {
  readonly #host: FleetHost;

  constructor(host: FleetHost) {
    this.#host = host;
  }

  /** The fleet MCP heal passes, one session after another ({@link healFleetMcp}). */
  #healing: Promise<void> = Promise.resolve();
  /** The machine's fleet syncs and reads, one after another ({@link #fleetTurn}). */
  #fleetQueue: Promise<unknown> = Promise.resolve();
  /** A fleet report the hub is owed and not yet read ({@link reportFleet}). */
  #fleetReportOwedValue = false;
  get #fleetReportOwed(): boolean {
    return this.#fleetReportOwedValue;
  }
  /** What this agent holds of the fleet, as the hub's deltas carried it (fleet-desired.ts). */
  readonly #desired = new FleetDesired();
  /** The machine's last fleet report sent, which a clone's placement adds its place to ({@link placeClone}). */
  #lastReport: FleetSyncReport | undefined;
  /** The machine's probe tick ({@link #healthSoon}), once its agent has taken a delta. */
  #healthTimer: ReturnType<typeof setInterval> | undefined;
  /** The items deltas moved or took away since the last converge began. */
  readonly #convergeIds = new Set<string>();
  /** A person's Sync: the next converge takes every item, changed or not. */
  #reconvergeValue = false;
  get #reconverge(): boolean {
    return this.#reconvergeValue;
  }
  /** A converge is queued and not yet begun: a delta meanwhile joins it ({@link convergeSoon}). */
  #convergeOwedValue = false;
  get #convergeOwed(): boolean {
    return this.#convergeOwedValue;
  }
  /** A converge pass runs now: a delta that moved nothing is converged once it ends. */
  #passingValue = false;
  get #passing(): boolean {
    return this.#passingValue;
  }
  /** Each harness whose converge threw in the last pass, in its words: every item of that pass failed with it. */
  #harnessFailures = new Map<HarnessKind, string>();
  /** Each delta's write of the policy, begun as it arrived and awaited before its answer, by its request. */
  readonly #fleetDenials = new Map<string, Promise<void>>();
  readonly #mcpLauncherStates = new Map<
    string,
    import("@cawco/core/fleet").FleetItemState
  >();
  /**
   * Asks each named live Claude session, one after another, to take again
   * what of the fleet it reads that moved: with `mcp`, every fleet server
   * the hub proxies that it holds broken: failed, or connected with none of
   * the tools the proxy lists (claude.ts `healFleetMcp`); with `settings`,
   * the fleet's hooks and Claude Code settings placed at its folder
   * (claude.ts `#takeFleetSettings`), so one placed while it runs reaches its
   * next tool call, as OpenCode's and pi's read the set at each call. At an
   * attach, which every session meets at an agent restart, both, so sessions
   * a past burst left without a server's tools heal with no new sign-in;
   * after a converge, each only as what it reads moved
   * ({@link convergeSoon}). One at a time, so a pass over a machine's
   * sessions is never a burst of its own. Nothing waits on it.
   */
  healFleetMcp(
    asks: readonly { instanceId: string; mcp: boolean; settings: boolean }[]
  ): void {
    this.#healing = this.#healing.then(async () => {
      for (const { instanceId, mcp, settings } of asks) {
        const session = this.#host.session(instanceId);
        if (!(session && harnessOf(session.harness)?.healsFleetMcp)) {
          continue;
        }
        if (mcp) {
          try {
            await session.control(CONTROL_MCP_FLEET_HEAL, []);
          } catch (error) {
            warn(`fleet MCP heal of ${instanceId} failed: ${errorText(error)}`);
          }
        }
        if (settings) {
          try {
            await session.control(CONTROL_FLEET_SETTINGS, []);
          } catch (error) {
            warn(
              `the fleet's hooks and settings did not reach ${instanceId}: ${errorText(error)}`
            );
          }
        }
      }
    });
  }
  /**
   * The live sessions what converge `moves` wrote reaches, and what of it
   * each reads: the fleet's servers every session, a project's placed
   * copies the sessions in its `places`; the fleet's hooks and settings
   * every session, a project's those in its places.
   */
  #reachedBy(
    moves: FleetMoves,
    places: readonly FleetPlace[]
  ): { instanceId: string; mcp: boolean; settings: boolean }[] {
    const movedAt = (parts: readonly FleetPart[]): string[] =>
      places
        .filter((one) => {
          const moved = moves.projects.get(one.projectId);
          return moved !== undefined && parts.some((part) => moved.has(part));
        })
        .map((one) => one.path);
    const mcpAt = movedAt(["mcp"]);
    const settingsAt = movedAt(["hooks", "harnessConfig"]);
    const wideMcp = moves.wide.has("mcp");
    const wideSettings =
      moves.wide.has("hook") || moves.wide.has("harnessConfig");
    return this.#host.ids().flatMap((instanceId) => {
      const cwd = this.#host.cwdOf(instanceId);
      const inside = (paths: readonly string[]): boolean =>
        cwd !== undefined && paths.some((path) => within(cwd, path));
      const mcp = wideMcp || inside(mcpAt);
      const settings = wideSettings || inside(settingsAt);
      return mcp || settings ? [{ instanceId, mcp, settings }] : [];
    });
  }
  /**
   * Runs `work` once every fleet sync and read before it has answered: one at
   * a time on the machine, so no report the hub keeps is older than one it
   * was sent before it.
   */
  #fleetTurn<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#fleetQueue.then(work, work);
    this.#fleetQueue = next.catch(() => undefined);
    return next;
  }
  /**
   * A delta held as it arrives (fleet-desired.ts), in the order the hub sent
   * them: one of a generation the disk already keeps (sent again because its
   * answer went unheard) is answered and not applied again; any other's
   * items join what this agent holds, which is written to disk before the
   * agent answers (ACK means kept, before anything is applied). Its policy,
   * when it moved (or a welcome), begins to be written at once
   * (denied-tools.ts `applyFleetDenials`), and every spawn waits for that
   * write; the items it moved wait for the next converge
   * ({@link convergeSoon}).
   */
  async #holdDelta(delta: FleetDelta | undefined): Promise<void> {
    if (!delta || typeof delta.generation !== "number") {
      return;
    }
    await this.#desired.loaded;
    if (this.#desired.observed(delta)) {
      console.info(
        `[fleet] gen ${delta.generation} sent again: this machine keeps gen ${this.#desired.generation} already, so it is answered and not applied again`
      );
      return;
    }
    // A welcome to an agent whose last converge was cut short (it stopped
    // mid-way): what that converge left owed converges with what it moved.
    const cutShort =
      delta.welcome &&
      this.#desired.behind &&
      !this.#passing &&
      !this.#convergeOwed;
    const applied = this.#desired.apply(delta);
    for (const id of cutShort ? this.#desired.unconverged() : []) {
      this.#convergeIds.add(id);
    }
    for (const id of [...applied.changed, ...applied.removed]) {
      if (id !== "policy") {
        this.#convergeIds.add(id);
      }
    }
    this.#reconvergeValue ||= delta.reconverge === true;
    // A build that has not converged every part yet (an update, a first
    // start) does, as the hub welcomes it: what an earlier build's rules
    // left behind is this one's to take away, though nothing moved at the
    // hub. So does one whose harnesses write the fleet elsewhere now: the
    // record says what was written where it last wrote.
    if (delta.welcome) {
      const moved = basisMoved(
        this.#desired.convergedBasis,
        await convergeBasis()
      );
      if (moved) {
        console.info(`[fleet] ${moved}`);
        this.#reconvergeValue = true;
      }
    }
    const denied = this.#desired.deniedTools;
    if (denied && (applied.policy || delta.welcome)) {
      this.#writePolicy(denied, applied.policy);
    }
    await this.#desired.keep();
  }
  /**
   * The fleet's denied tools written (denied-tools.ts `applyFleetDenials`,
   * which every spawn waits on while it runs), and said as the `policy`
   * item's converge; `moved`: the policy changed, and so did
   * `~/.claude/settings.json`, which a boundary binds.
   */
  #writePolicy(denied: readonly string[], moved: boolean): void {
    const generation = this.#desired.generation ?? 0;
    const hash = this.#desired.hashOf("policy");
    const started = Date.now();
    applyFleetDenials(denied).then(
      () => {
        this.#desired.policyWritten();
        if (moved) {
          this.#converging(generation, [
            { id: "policy", hash, state: "ok", ms: Date.now() - started },
          ]);
          rearmBoundaries("the fleet's policy");
        }
      },
      (error: unknown) => {
        warn(`the fleet's policy was not written: ${errorText(error)}`);
        this.#converging(generation, [
          {
            id: "policy",
            hash,
            state: "failed",
            error: errorText(error),
            ms: Date.now() - started,
          },
        ]);
      }
    );
  }
  /**
   * A workspace's clone at `cwd`, cut for project `projectId`, given the
   * project's rows this agent holds (fleet-place.ts `place`), which the
   * disk keeps through a restart (fleet-desired.ts): its skills and memory documents written into
   * the clone, its MCP servers, hooks and harness settings into the files
   * CawCo's sessions read for that folder. Before its boundary and first
   * session start (workspace.ts `createWorkspace`), after any converge
   * already under way, and with nothing asked of the hub: nothing else on
   * the machine is written, no session is told, no boundary looked at. Its
   * states go to the hub in the machine's report, beside the places it had.
   */
  placeClone(cwd: string, projectId: string): Promise<void> {
    return this.#fleetTurn(async () => {
      await this.#desired.loaded;
      const rows = this.#desired.config().projects[projectId];
      if (!rows) {
        return;
      }
      const copies = placeRowsAt(rows, cwd);
      const mcp = await this.#placeMcp(cwd, copies.mcp);
      const placed = await placeFolder(cwd, copies, Object.keys(mcp.taken));
      placed.mcp = mcp.states;
      const said = failedPlaced(placed);
      console.info(
        `[fleet] ${cwd}: project ${projectId}'s ${copies.skills.length} skill(s), ${copies.mcp.length} MCP server(s), ${copies.memory.length} memory document(s), ${copies.hooks.length} hook(s) and ${copies.harnessConfig.length} harness setting(s) placed from the rows it holds, as its workspace was cut${said.length > 0 ? `; not placed: ${said.join("; ")}` : ""}`
      );
      this.#reportPlaced(placed);
    });
  }
  /**
   * The MCP copies placed at `cwd` as this machine launches them
   * ({@link #launchRows}), each that launches in that place's own file
   * (fleet-place-set.ts) for the sessions in that folder. Answers the copies
   * it took and each enabled copy's state, by `<name>@<place id>`: applied
   * once in the file, else why it cannot launch.
   */
  async #placeMcp(
    cwd: string,
    rows: FleetMcpServer[]
  ): Promise<{
    states: Record<string, FleetItemState>;
    taken: Record<string, FleetMcpServer>;
  }> {
    const launched = await placeInstalls(async () => {
      const result = await Promise.all(
        rows.map(async (row) => ({
          row,
          launcher: row.enabled
            ? await this.#launcherOf(launchKeyOf(row), row.config)
            : undefined,
        }))
      );
      return {
        dirs: result.flatMap(({ launcher }) =>
          launcher && "dir" in launcher && launcher.dir ? [launcher.dir] : []
        ),
        result,
      };
    });
    const taken: Record<string, FleetMcpServer> = {};
    const states: Record<string, FleetItemState> = {};
    for (const { row, launcher } of launched) {
      if (!row.enabled) {
        continue;
      }
      const key = `${row.name}@${row.placeId ?? ""}`;
      const local = this.#launchRow(row, launcher, key);
      if (local.enabled) {
        taken[key] = local;
        states[key] = { state: "applied" };
      } else {
        states[key] = this.#mcpLauncherStates.get(key) ?? {
          state: "failed",
          cause: "unknown",
          detail: "it does not launch on this machine",
        };
      }
    }
    await keepPlaceSet(cwd, {
      mcp: Object.fromEntries(
        Object.values(taken).map((row) => [row.name, row.config])
      ),
    });
    return { states, taken };
  }
  /**
   * A clone's placement (`placed`, keyed per place) sent to the hub in the
   * machine's report: the last one with each placed row's state at the
   * clone's place put in. None before the machine's first report, which
   * the disk keeps through a restart (fleet-converged.ts).
   */
  #reportPlaced(placed: FleetSyncReport): void {
    const last = this.#lastReport ?? this.#desired.report;
    if (!last) {
      return;
    }
    const fresh = placedApart(placed).placed ?? {};
    const merged: NonNullable<FleetSyncReport["placed"]> = {
      ...last.placed,
    };
    for (const section of PLACED_SECTIONS) {
      for (const [key, byPlace] of Object.entries(fresh[section] ?? {})) {
        const rows = { ...merged[section] };
        rows[key] = { ...rows[key], ...byPlace };
        merged[section] = rows;
      }
    }
    const report: FleetSyncReport = { ...last, placed: merged, at: Date.now() };
    this.#lastReport = report;
    this.#desired.reported(report);
    this.#sendReport(report, null);
  }
  /** The machine's fleet report to the hub: one a converge reached (its `generation`), or one read unasked (`null`), with the generation converged now. */
  #sendReport(report: FleetSyncReport, generation: number | null): void {
    this.#host.emit({
      verb: "frames",
      machineId: "",
      payload: {
        kind: "fleet_report",
        report,
        generation,
        convergedGeneration: this.#desired.convergedGeneration,
      } satisfies FleetReportFrame,
    });
  }
  /** The machine's word on items as they move (core `FleetConvergeFrame`). */
  #converging(generation: number, items: FleetItemStatus[]): void {
    if (items.length === 0) {
      return;
    }
    this.#host.emit({
      verb: "frames",
      machineId: "",
      payload: {
        kind: "fleet_converge",
        generation,
        items,
      } satisfies FleetConvergeFrame,
    });
  }
  /**
   * The items deltas moved, converged in one pass once the passes before it
   * are done ({@link #fleetTurn}): each said running as it begins and ok or
   * failed, in the harness's words, as it ends. A delta that comes while one
   * is queued joins it. Only the parts those items move are converged
   * (fleet-parts.ts), and only what read them is told: a live session takes
   * the fleet's servers or settings again only when they, or its own place's
   * copies, moved ({@link #reachedBy}), and the boundaries in use are looked
   * at only when an item they bind moved ({@link BOUND_KINDS}). A delta that
   * moved nothing but the policy converges nothing; one a person asked for
   * (`reconverge`) converges every part.
   */
  convergeSoon(): void {
    const owed = this.#convergeIds.size > 0 || this.#reconverge;
    if (this.#convergeOwed || !owed) {
      return;
    }
    this.#convergeOwedValue = true;
    this.#fleetTurn(async () => {
      this.#convergeOwedValue = false;
      this.#passingValue = true;
      const all = this.#reconverge;
      const ids = (all ? this.#desired.ids() : [...this.#convergeIds]).filter(
        (id) => id !== "policy"
      );
      this.#convergeIds.clear();
      this.#reconvergeValue = false;
      const moves = movesOf(ids, all);
      // Said item by item: the ones held; one taken away is said gone.
      const held = ids.filter((id) => this.#desired.has(id));
      const generation = this.#desired.generation ?? 0;
      this.#converging(
        generation,
        held.map((id) => ({
          id,
          hash: this.#desired.hashOf(id),
          state: "running" as const,
        }))
      );
      const started = Date.now();
      const { report, thrown, places } = await this.#convergeParts(moves);
      if (thrown) {
        warn(`the fleet's gen ${generation} did not converge: ${thrown}`);
      }
      const statuses = itemStatuses(
        this.#desired,
        held,
        report,
        Date.now() - started,
        thrown
      );
      // Every generation since converged too, when no delta since moved
      // anything: one that did is owed the next pass.
      this.#passingValue = false;
      const owedSince =
        this.#convergeOwed || this.#convergeIds.size > 0 || this.#reconverge;
      this.#desired.converged(
        ids,
        statuses,
        report,
        owedSince ? generation : (this.#desired.generation ?? generation),
        all && !thrown ? await convergeBasis() : undefined
      );
      this.#converging(generation, statuses);
      if (report) {
        this.#sendReport(report, generation);
      }
      this.healFleetMcp(this.#reachedBy(moves, places));
      const bound = [...moves.wide].filter((kind) => BOUND_KINDS.has(kind));
      if (
        bound.length > 0 ||
        [...moves.projects.values()].some(
          (parts) => parts.has("hooks") || parts.has("mcp")
        )
      ) {
        rearmBoundaries(bound.join(", ") || "a project's hooks or servers");
      }
    })
      .catch((error: unknown) =>
        warn(`the fleet converge failed: ${errorText(error)}`)
      )
      .finally(() => {
        this.#passingValue = false;
      });
  }
  /**
   * The parts `moves` moved converged over each project's rows at each of
   * its places here now (its checkouts, and the clones of its workspaces
   * this agent cut), and the file of every place gone since (an archived
   * clone, a checkout the hub no longer names) taken away with it. Answers
   * the report, what threw in each harness's words, and the places.
   */
  async #convergeParts(moves: FleetMoves): Promise<{
    places: FleetPlace[];
    report?: FleetSyncReport;
    thrown?: string;
  }> {
    let places: FleetPlace[] = [];
    try {
      const holding = this.#desired.config();
      places = await placesNow(holding.projects);
      const placed = placedConfig(holding, places);
      const report = await this.#syncFleet(placed, "syncFleet", moves.parts);
      if (PLACE_FILE_PARTS.some((part) => moves.parts.has(part))) {
        await keepOnlyPlaceSets(placed.places);
      }
      const failed = [...this.#harnessFailures].map(
        ([harness, error]) => `${harness}: ${shortDetail(error) ?? "failed"}`
      );
      return {
        places,
        report,
        ...(failed.length > 0 ? { thrown: failed.join("\n") } : {}),
      };
    } catch (error) {
      return { places, thrown: errorText(error) };
    }
  }
  /**
   * The machine's probes, read on a tick of their own and never by a
   * converge: every `claude` with its version (the report's `toolchain`)
   * and what the disk holds of the fleet's content (`have`). The first runs
   * as the machine's agent takes its first delta; each that reads something
   * other than the last report says is sent laid over it.
   */
  #healthSoon(): void {
    if (this.#healthTimer) {
      return;
    }
    this.#healthTimer = setInterval(() => this.#healthTick(), HEALTH_MS);
    this.#healthTimer.unref();
    this.#healthTick();
  }
  #healthTick(): void {
    this.#fleetTurn(async () => {
      const [toolchain, have] = await Promise.all([
        probeToolchain(),
        fleetHoldings(),
      ]);
      const last = this.#lastReport ?? this.#desired.report;
      const probed = toolchain.claude ? toolchain : undefined;
      if (
        !last ||
        (JSON.stringify(last.toolchain) === JSON.stringify(probed) &&
          JSON.stringify(last.have) === JSON.stringify(have))
      ) {
        return;
      }
      const report: FleetSyncReport = {
        ...last,
        ...(probed ? { toolchain: probed } : {}),
        have,
        at: Date.now(),
      };
      this.#lastReport = report;
      this.#desired.reported(report);
      this.#sendReport(report, null);
    }).catch((error: unknown) =>
      warn(`the machine's fleet probes were not read: ${errorText(error)}`)
    );
  }
  /** What this agent holds of the fleet, for its register (core `FleetHeld`): read once the disk's is ({@link fleetLoaded}). */
  fleetHeld(): FleetHeld | undefined {
    return this.#desired.held();
  }
  /** Once what the disk keeps of the fleet is read: a register waits for it, so it claims what this agent holds through a restart. */
  fleetLoaded(): Promise<void> {
    return this.#desired.loaded;
  }
  /**
   * The machine's fleet report read again and sent to the hub unasked, when a
   * harness's reading of a fleet MCP server moved with no fleet change
   * ({@link onFleetMcpMoved}): the hub's row says what is true now, not what
   * the last sync met. One is owed at a time; a move heard while it waits its
   * turn is in the read it makes. Only the machine's agent reports for it.
   */
  reportFleet(): void {
    if (this.#fleetReportOwed) {
      return;
    }
    this.#fleetReportOwedValue = true;
    this.#fleetTurn(async () => {
      this.#fleetReportOwedValue = false;
      if (!(await isMachineAgent())) {
        return;
      }
      this.#sendReport(await this.#syncFleet(undefined, "fleetStatus"), null);
    }).catch((error: unknown) =>
      warn(`the fleet report was not read again: ${errorText(error)}`)
    );
  }
  /** Each row's launch as last resolved, by its key, with the config it was resolved for ({@link #launcherOf}). */
  readonly #launched = new Map<
    string,
    {
      asked: string;
      launcher: Extract<
        Awaited<ReturnType<typeof resolveMcpLauncher>>,
        { config: unknown }
      >;
    }
  >();
  /**
   * A row's launch: the last one resolved for this config, while what it
   * launches is still on disk, else resolved now. A sync changes only what
   * changed: one that carries a row as it was (a place added, a skill
   * moved) resolves nothing for it again, so it runs no `npm view` for it
   * and no npm error then disables a row that launches (`exactVersion`
   * failing turned a working server `enabled: false` until the next sync).
   * A row whose config changed, or whose launch failed, is resolved again;
   * so is every row once per agent.
   */
  async #launcherOf(
    key: string,
    config: FleetMcpServer["config"]
  ): Promise<Awaited<ReturnType<typeof resolveMcpLauncher>>> {
    const asked = JSON.stringify(config);
    const kept = this.#launched.get(key);
    const launched = kept?.launcher;
    if (
      kept?.asked === asked &&
      launched &&
      (launched.dir === undefined || existsSync(launched.dir)) &&
      (!(
        "command" in launched.config && launched.config.command.startsWith("/")
      ) ||
        existsSync(launched.config.command))
    ) {
      return launched;
    }
    const launcher = await resolveMcpLauncher(config);
    if ("config" in launcher) {
      this.#launched.set(key, { asked, launcher });
    } else {
      this.#launched.delete(key);
    }
    return launcher;
  }
  /**
   * The fleet's MCP rows and each project's placed copies as this machine
   * launches them (mcp-launcher.ts), each npx row's package installed first
   * (mcp-install.ts): a row that cannot launch here is disabled and says why
   * in its launcher state (a placed copy under `<name>@<place id>`), and a
   * shared fleet row goes to the gateway (`hosted`) with the harnesses
   * dialing it there. A project row's launch is resolved once for all its
   * places ({@link launchKeyOf}). The installs no row launches from any
   * more retire once no session uses them.
   */
  async #launchRows(
    incoming: PlacedFleetConfig,
    hosted: { name: string; config: HostedConfig }[]
  ): Promise<Pick<PlacedFleetConfig, "mcp" | "placedMcp">> {
    const resolveAll = (rows: FleetMcpServer[]) =>
      Promise.all(
        rows.map(async (row) => ({
          row,
          launcher: row.enabled
            ? await this.#launcherOf(launchKeyOf(row), row.config)
            : undefined,
        }))
      );
    const launched = await syncInstalls(
      async () => {
        const result = {
          mcp: await resolveAll(incoming.mcp),
          placedMcp: await resolveAll(incoming.placedMcp),
        };
        return {
          dirs: [...result.mcp, ...result.placedMcp].flatMap(({ launcher }) =>
            launcher && "dir" in launcher && launcher.dir ? [launcher.dir] : []
          ),
          result,
        };
      },
      () => this.#host.ids()
    );
    return {
      mcp: launched.mcp.map(({ row, launcher }) =>
        this.#launchRow(row, launcher, row.name, hosted)
      ),
      placedMcp: launched.placedMcp.map(({ row, launcher }) =>
        this.#launchRow(row, launcher, `${row.name}@${row.placeId ?? ""}`)
      ),
    };
  }
  /** One row as {@link #launchRows} launches it, its launcher state kept under `key`; a shared fleet row onto `hosted`. */
  #launchRow(
    row: FleetMcpServer,
    launcher: Awaited<ReturnType<typeof resolveMcpLauncher>> | undefined,
    key: string,
    hosted?: { name: string; config: HostedConfig }[]
  ): FleetMcpServer {
    if (!launcher) {
      return row;
    }
    if (!("config" in launcher)) {
      this.#mcpLauncherStates.set(
        key,
        "failed" in launcher
          ? { state: "failed", cause: "unknown", detail: launcher.failed }
          : { state: "pending", detail: launcher.unavailable }
      );
      return { ...row, enabled: false };
    }
    const local = { ...row, config: launcher.config };
    if (!hosted) {
      return local;
    }
    if (local.shared && "command" in local.config) {
      hosted.push({ name: row.name, config: local.config });
      return {
        ...local,
        config: hostedEntry(
          harnessMcpUrl(`/mcp/local/${encodeURIComponent(row.name)}`)
        ),
      };
    }
    return local.proxied && "url" in local.config
      ? {
          ...local,
          config: {
            ...local.config,
            url: harnessMcpUrl(`/mcp/fleet/${encodeURIComponent(row.name)}`),
          },
        }
      : local;
  }
  /**
   * Converges the parts `parts` of the fleet across every harness that has
   * a profile (`syncFleet`), or reads what every harness has of it
   * (`fleetStatus`), merged into one report. A converge's is laid over the
   * machine's last report (fleet-report.ts `laidOver`): only its parts'
   * sections are new. Only a converge of the servers (`mcp`) launches the
   * fleet's servers and writes the set every session takes; only one of the
   * skills or plugins reads what the disk holds of them (`have`).
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: merges every existing fleet report field across harnesses, preserving per-harness ownership
  async #syncFleet(
    incoming: PlacedFleetConfig | undefined,
    which: "syncFleet" | "fleetStatus",
    parts: ReadonlySet<FleetPart> = new Set(FLEET_PARTS)
  ): Promise<FleetSyncReport> {
    const servers = incoming !== undefined && parts.has("mcp");
    // The daemon's connection names a hub reachable from this machine.
    if (servers) {
      this.#mcpLauncherStates.clear();
    }
    // The fleet's shared servers, run once for the machine by its gateway
    // (mcp-host.ts): each harness dials the gateway for them.
    const hosted: { name: string; config: HostedConfig }[] = [];
    const config =
      incoming &&
      (servers
        ? { ...incoming, ...(await this.#launchRows(incoming, hosted)) }
        : incoming);
    if (config && servers) {
      mcpHost.configure(hosted);
      // What every CawCo session on Claude Code and pi loads from now on,
      // written before any harness converges: a session started while the
      // harnesses report takes this set (fleet-mcp-set.ts).
      await writeFleetMcpSet({
        servers: Object.fromEntries(
          config.mcp
            .filter((row) => row.enabled)
            .map((row) => [row.name, row.config])
        ),
        // The hub's own word that it holds no sign-in for a server: each
        // harness reports it needing one and starts it for no status read.
        signedOut: config.mcp
          .filter((row) => row.enabled && row.auth?.state === "needs-auth")
          .map((row) => row.name),
      });
      // Each place's copies into its own file, a place with none taking
      // none (fleet-place-set.ts).
      await Promise.all(
        config.places.map((cwd) =>
          keepPlaceSet(cwd, {
            mcp: Object.fromEntries(
              config.placedMcp
                .filter((row) => row.enabled && row.cwd === cwd)
                .map((row) => [row.name, row.config])
            ),
          })
        )
      );
    }
    type State = import("@cawco/core/fleet").FleetItemState;
    const mcp: FleetSyncReport["mcp"] = {};
    const mcpByHarness: NonNullable<FleetSyncReport["mcpByHarness"]> = {};
    const mcpHarnesses = new Set(
      harnesses()
        .filter((adapter) => adapter.capabilities.mcpStatus)
        .map((adapter) => adapter.kind)
    );
    const mcpFailures = new Map<HarnessKind, string>();
    // What a status line may not carry: the values of each server's secrets
    // (core fleet-secrets.ts), cut out where the line is made.
    const secretsByName = this.#mcpSecrets(incoming);
    const allSecrets = [...secretsByName.values()].flat();
    const withoutValues = (
      rows: Record<string, State>
    ): Record<string, State> =>
      Object.fromEntries(
        Object.entries(rows).map(([name, item]) => [
          name,
          item.detail
            ? {
                ...item,
                detail: withoutSecrets(
                  item.detail,
                  secretsByName.get(name) ?? []
                ),
              }
            : item,
        ])
      );
    const marketplaces: FleetSyncReport["marketplaces"] = {};
    const plugins: FleetSyncReport["plugins"] = {};
    const skills: Record<string, State> = {};
    // Merged rather than dropped. This rebuilds the machine's one word from
    // each harness's, and every field it does not name is a field the hub never
    // hears about — which is how the memory documents, the hooks and (once it
    // existed) `have` all went missing between a daemon that
    // reported them and a hub that had nowhere to read them from.
    const memoryDocs: Record<string, State> = {};
    const hooks: Record<string, State> = {};
    // The fleet's Claude Code settings, OpenCode plugins and pi extensions
    // (fleet-harness-config.ts): made ready once for every harness, each
    // row the worst of the harnesses' words on it.
    const harnessConfig: Record<string, State> = {};
    // Each harness's word on each hook: Claude Code's registration, and
    // whether OpenCode and pi run it at all (fleet-harness-set.ts
    // `hookStatesOn`), merged below as MCP servers are.
    const hooksByHarness: Partial<Record<HarnessKind, Record<string, State>>> =
      {};
    let memory: FleetSyncReport["memory"];
    // Merged the same way, and it has to be: the toolchain is what attributes a
    // CLI failure to a binary, and a field this rebuild does not name is a field
    // the hub never hears about.
    let toolchain: FleetSyncReport["toolchain"];
    // Every harness converges at once, each onto its own files (Claude Code's,
    // OpenCode's, pi's directories), and the reports merge in harness order
    // after: one whose server is slow to start or to fail (OpenCode waits 30s
    // for its server's first line) no longer holds the others' convergence
    // and the machine's whole report behind it.
    const settled = await Promise.all(
      harnesses()
        .filter((adapter) =>
          which === "syncFleet" ? adapter.syncFleet : adapter.fleetStatus
        )
        .map(async (adapter) => {
          try {
            const report =
              which === "syncFleet"
                ? // biome-ignore lint/style/noNonNullAssertion: filtered to adapters that have it above
                  await adapter.syncFleet!(
                    (adapter.capabilities.mcpStatus
                      ? config
                      : incoming) as PlacedFleetConfig,
                    parts
                  )
                : // biome-ignore lint/style/noNonNullAssertion: filtered to adapters that have it above
                  await adapter.fleetStatus!();
            return { adapter, report } as const;
          } catch (error) {
            return { adapter, error } as const;
          }
        })
    );
    for (const outcome of settled) {
      const { adapter } = outcome;
      if ("error" in outcome) {
        const { error } = outcome;
        warn(`${which} on ${adapter.kind} failed: ${error}`);
        const short =
          shortDetail(withoutSecrets(String(error), allSecrets)) ?? "failed";
        mcpFailures.set(adapter.kind, short);
        mcpByHarness[adapter.kind] = Object.fromEntries(
          (config?.mcp ?? []).map((row) => [
            row.name,
            {
              state: "failed",
              cause: "unknown",
              detail: `${adapter.kind}: ${short}`,
            },
          ])
        );
        continue;
      }
      const { report } = outcome;
      mcpByHarness[adapter.kind] = withoutValues(report.mcp);
      Object.assign(marketplaces, report.marketplaces);
      Object.assign(plugins, report.plugins);
      // A skill lives in more than one harness's directory, so its row is
      // the worst of them: one harness's copy edited or missing is not
      // undone by another's that is fine.
      for (const [name, item] of Object.entries(report.skills ?? {})) {
        skills[name] = skills[name]
          ? worstFleetState([skills[name], item])
          : item;
      }
      // The memory and its documents too: each harness keeps its own copy
      // (Claude Code's CLAUDE.md, OpenCode's and pi's), and one edited on the
      // machine is drift whatever the others say. Taken as the last harness's
      // word, OpenCode's "applied" hid a hand-edited CLAUDE.md, so it was
      // never offered to compare or adopt (machine-away, 2026-10-22).
      for (const [path, item] of Object.entries(report.memoryDocs ?? {})) {
        memoryDocs[path] = memoryDocs[path]
          ? worstFleetState([memoryDocs[path], item])
          : item;
      }
      if (report.hooks) {
        hooksByHarness[adapter.kind] = report.hooks;
      }
      for (const [key, item] of Object.entries(report.harnessConfig ?? {})) {
        harnessConfig[key] = harnessConfig[key]
          ? worstFleetState([harnessConfig[key], item])
          : item;
      }
      if (report.memory) {
        memory = memory
          ? worstFleetState([memory, report.memory])
          : report.memory;
      }
      if (report.toolchain) {
        toolchain = { ...toolchain, ...report.toolchain };
      }
    }
    // A hook's row is the worst of its harnesses' words, each harness's
    // said in its detail: one OpenCode or pi cannot run is unsupported for
    // that harness on this machine, never left out.
    for (const id of new Set(
      Object.values(hooksByHarness).flatMap((rows) => Object.keys(rows ?? {}))
    )) {
      const readings = Object.entries(hooksByHarness).flatMap(([kind, rows]) =>
        rows?.[id] ? [{ kind, item: rows[id] }] : []
      );
      const [only] = readings;
      hooks[id] =
        readings.length === 1 && only
          ? only.item
          : {
              ...worstFleetState(readings.map(({ item }) => item)),
              detail: readingLines(readings),
            };
    }
    const names = new Set([
      ...this.#mcpLauncherStates.keys(),
      ...Object.values(mcpByHarness).flatMap((rows) => Object.keys(rows ?? {})),
    ]);
    if (which === "syncFleet") {
      this.#harnessFailures = new Map(mcpFailures);
    }
    for (const [kind, detail] of mcpFailures) {
      mcpByHarness[kind] = Object.fromEntries(
        [...names].map((name) => [
          name,
          { state: "failed", cause: "unknown", detail },
        ])
      );
    }
    for (const [kind, report] of Object.entries(mcpByHarness)) {
      if (!mcpHarnesses.has(kind as HarnessKind)) {
        continue;
      }
      for (const [name, state] of this.#mcpLauncherStates) {
        report[name] = withoutValues({ [name]: state })[name] as State;
      }
    }
    for (const name of names) {
      const readings = Object.entries(mcpByHarness).flatMap(([kind, rows]) =>
        rows?.[name] ? [{ kind, item: rows[name] }] : []
      );
      const worst = worstFleetState(
        readings
          .filter((reading) => mcpHarnesses.has(reading.kind as HarnessKind))
          .map((reading) => reading.item)
      );
      mcp[name] = {
        ...worst,
        detail: readingLines(readings),
      };
    }
    // Each project row's state said per place, as the hub keeps it.
    const fresh = placedApart({
      mcp,
      mcpByHarness,
      marketplaces,
      plugins,
      skills,
      memoryDocs,
      hooks,
      harnessConfig,
      ...(memory ? { memory } : {}),
      ...(toolchain ? { toolchain } : {}),
      ...(which === "fleetStatus" || parts.has("skills") || parts.has("plugins")
        ? { have: await fleetHoldings() }
        : {}),
      at: Date.now(),
    });
    if (which === "fleetStatus") {
      this.#lastReport = fresh;
      this.#desired.reported(fresh);
      return fresh;
    }
    const report = laidOver(
      this.#lastReport ?? this.#desired.report,
      fresh,
      parts
    );
    this.#lastReport = report;
    return report;
  }

  /** Each server's secret values by name, from the config in hand or else the desired one (core fleet-secrets.ts). */
  #mcpSecrets(incoming?: PlacedFleetConfig): Map<string, string[]> {
    const byName = new Map<string, string[]>();
    for (const row of [
      ...(incoming?.mcp ?? this.#desired.config().mcp),
      ...(incoming?.placedMcp ??
        Object.values(this.#desired.config().projects).flatMap(
          (rows) => rows.mcp
        )),
    ]) {
      byName.set(row.name, [
        ...(byName.get(row.name) ?? []),
        ...secretValuesOf(row.config),
      ]);
    }
    return byName;
  }

  /** A control's answer, with the fleet MCP change's and heal's cut of secrets. */
  answerWithoutSecrets(method: string, result: unknown): unknown {
    return method === CONTROL_MCP_FLEET_CHANGED ||
      method === CONTROL_MCP_FLEET_HEAL
      ? this.#takenWithoutSecrets(result)
      : result;
  }

  /** A fleet MCP change's or heal's answer with each server's secret values cut from its words. */
  #takenWithoutSecrets(result: unknown): unknown {
    const { servers } = (result ?? {}) as Partial<FleetMcpTakeAnswer>;
    if (!Array.isArray(servers)) {
      return result;
    }
    const byName = this.#mcpSecrets();
    return {
      ...(result as object),
      servers: servers.map((server) => {
        const secrets = byName.get(server.name) ?? [];
        return {
          ...server,
          status: withoutSecrets(server.status, secrets),
          ...(server.error === undefined
            ? {}
            : { error: withoutSecrets(server.error, secrets) }),
        };
      }),
    };
  }

  /** The machine's fleet report, read in turn with every converge (`fleetStatus`). */
  status(): Promise<FleetSyncReport> {
    return this.#fleetTurn(() => this.#syncFleet(undefined, "fleetStatus"));
  }

  /** A harness CLI was installed here: the next converge takes every item, as each harness already here did. */
  reconverge(): void {
    this.#reconvergeValue = true;
    this.convergeSoon();
  }

  /**
   * A delta as it arrives, held in the order the hub sent it
   * ({@link #holdDelta}), its write of the policy kept for its answer by its
   * request ({@link denialsFor}).
   */
  takeDelta(requestId: string, delta: FleetDelta): void {
    const held = this.#holdDelta(delta);
    // Awaited by the delta's answer, which says a failure.
    held.catch(() => undefined);
    this.#fleetDenials.set(requestId, held);
  }

  /** The policy write a delta began as it arrived, by its request, handed once to the delta's answer. */
  denialsFor(requestId: string | undefined): Promise<void> | undefined {
    if (!requestId) {
      return undefined;
    }
    const denials = this.#fleetDenials.get(requestId);
    this.#fleetDenials.delete(requestId);
    return denials;
  }

  /**
   * A delta, held as it arrived and kept on disk (#holdDelta): answered
   * at once with the generation kept (ACK; READY for a welcome), its
   * policy and items applied after (#writePolicy, convergeSoon), each
   * said as it moves. Only the machine's agent holds the hub's link, and
   * so only it is sent one.
   */
  answerDelta(delta: FleetDelta): FleetAck {
    // What a workspace's policy reads may have moved with it (a
    // project's folder the hub moved away): every boundary this agent
    // holds is checked for a narrowed access.
    if (delta.recheck) {
      recheckNarrowed("folder-moved").catch(() => undefined);
    }
    if (delta.items.length > 0 || delta.reconverge) {
      console.info(
        `[fleet] sync from the hub: gen ${delta.generation}, ${delta.items.length} item(s)${delta.full ? " (all it holds)" : ""}${delta.welcome ? ", its welcome" : ""}${delta.reconverge ? ", converging every item" : ""}`
      );
    }
    // Every delta taken, as the hub hears it acknowledged.
    detach(
      recordAgentState("fleetSync", {
        full: Boolean(delta.full),
        items: delta.items.length,
        reconverge: Boolean(delta.reconverge),
        generation: delta.generation,
        welcome: Boolean(delta.welcome),
      }),
      "fleet sync record"
    );
    this.convergeSoon();
    this.#healthSoon();
    // A delta that moved nothing to converge, with no converge under
    // way, is converged as it is kept.
    if (!(this.#convergeOwed || this.#passing)) {
      this.#desired.convergedTo(this.#desired.generation ?? delta.generation);
    }
    return {
      observedGeneration: this.#desired.generation ?? delta.generation,
      convergedGeneration: this.#desired.convergedGeneration,
    } satisfies FleetAck;
  }
}

/**
 * What this machine holds of the fleet's content on its disk now, read from
 * every harness that keeps a copy. One set per harness, INTERSECTED — never
 * unioned. Skills are written by more than one harness into more than one
 * directory (claude's `~/.claude/skills`, pi's own), so a hash one of them
 * holds is not a hash the machine holds: leaving those bytes out would
 * strand every harness that still needs them. A harness that converges none
 * reads no set and is not counted, which is why opencode — which reads
 * claude's directory rather than keeping its own — does not veto every
 * skill on the machine. A harness whose read fails holds nothing, so the
 * hub sends everything rather than trust a copy nobody could read.
 */
async function fleetHoldings(): Promise<FleetHoldings> {
  const skillClaims: Record<string, string>[] = [];
  const pluginClaims: Record<string, string>[] = [];
  for (const adapter of harnesses()) {
    if (!adapter.fleetHoldings) {
      continue;
    }
    try {
      const held = await adapter.fleetHoldings();
      if (held.skills) {
        skillClaims.push(held.skills);
      }
      if (held.plugins) {
        pluginClaims.push(held.plugins);
      }
    } catch (error) {
      warn(`reading ${adapter.kind}'s fleet holdings failed: ${error}`);
      return { skills: {}, plugins: {} };
    }
  }
  return {
    skills: agreedHashes(skillClaims),
    plugins: agreedHashes(pluginClaims),
  };
}

/** The parts whose converge writes each place's file (fleet-place-set.ts). */
const PLACE_FILE_PARTS: readonly FleetPart[] = [
  "mcp",
  "placedSkills",
  "hooks",
  "harnessConfig",
];

/**
 * What a converge of every part runs as now: this agent's build, and where
 * each harness that converges the fleet writes it (harness.ts `fleetHome`).
 */
const convergeBasis = async (): Promise<ConvergeBasis> => ({
  build: await buildKey(),
  homes: Object.fromEntries(
    harnesses().flatMap((adapter) =>
      adapter.syncFleet && adapter.fleetHome
        ? [[adapter.kind, adapter.fleetHome()]]
        : []
    )
  ),
});

/**
 * The kinds of fleet-wide items a Linux boundary's form names
 * (fleet-converged.ts `syncedHeld`): one of them moved, the boundaries in
 * use are looked at again ({@link rearmBoundaries}); no other converge
 * looks at any.
 */
const BOUND_KINDS: ReadonlySet<FleetItemKind> = new Set<FleetItemKind>([
  "memory",
  "hook",
  "plugin",
  "pluginPayload",
  "skill",
  "mcp",
]);

/**
 * What a converge (or the policy's write) moved, `what`, is in what a
 * boundary binds: each boundary in use whose form's synced part moved is
 * handed over to one that has it (boundary/looks.ts `rearmMoved`). Nothing waits
 * on it.
 */
function rearmBoundaries(what: string): void {
  rearmMoved(`the fleet sync wrote ${what}, which a boundary reads`).catch(
    (error: unknown) =>
      warn(`the boundaries were not looked at again: ${errorText(error)}`)
  );
}
