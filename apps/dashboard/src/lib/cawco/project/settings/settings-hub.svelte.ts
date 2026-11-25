/**
 * The project Settings view's tie to the hub: the record the view draws,
 * built from the project's row, the board's machines, the fleet's accounts
 * and the moves the hub carries, plus what the view reads as it opens (the
 * task list's tie, the fleet's sign-ins, the project's Who decides); and
 * what each press does, through the hub's existing calls on the client the
 * view's hub seam names.
 *
 * Every choice moves at the press (changes.ts `withAsked`): the ask stands
 * in the record until the hub answers; taken, the hub's own state carries
 * it; refused, the hub's value shows again and its words stand at the
 * control with Retry (`refused`). A newer ask on the same control outlives
 * an older answer. A place's Move, Change path and Copy elsewhere are a
 * step (`flow`): what will happen, read from the machine before anything
 * runs, then the act's stages as the hub carries them.
 */
import { accountNameAmong } from "@cawco/core/accounts";
import type { GhRepoList } from "@cawco/core/connections";
import { type ConnectionView, readsGitHubApi } from "@cawco/core/connections";
import type { DecidesTable } from "@cawco/core/decides";
import { machineLabel } from "@cawco/core/machine-names";
import { MOVE_JOB_STEPS, type MoveJob, moveSize } from "@cawco/core/move";
import type { MoveResult, MoveRun } from "@cawco/core/project-folders";
import type { TrackerView } from "@cawco/core/trackers";
import { decidesWords } from "@cawco/core/words/decides";
import { folderWords, stepWords } from "@cawco/core/words/project-details";
import { nameFor } from "#lib/cawco/config/connection-form.js";
import {
  type FleetOffer,
  readFleet,
  readProject,
  writeProjectRoutes,
} from "#lib/cawco/decides/decides-client.js";
import type { HubSeam } from "#lib/cawco/hub-seam.js";
import {
  cancelMove,
  moveEstimate,
  retryMove,
  startMove as startCopy,
} from "#lib/cawco/move.svelte.js";
import {
  callOffLocate,
  locateFolder,
  previewLocate,
} from "#lib/cawco/project-folders-locate.js";
import {
  callOffMove,
  interruptSession,
  previewMove,
  readMove,
  retryMoveStep,
  startMove,
} from "#lib/cawco/project-folders-move.js";
import {
  githubProjects,
  readTracker,
  setTracker,
  syncTracker,
  trackerTargets,
} from "#lib/cawco/project-tasks.js";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { AccountsView } from "#lib/cawco/stores/accounts.svelte.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";
import {
  addProjectPlace,
  editProject,
  previewProjectPlace,
  readConnections,
  removeProjectPlace,
} from "#lib/cawco/stores/projects.svelte.js";
import {
  failureWords,
  hubDone,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";
import {
  type Change,
  type ChangeKey,
  type FlowEvent,
  type KeyAsk,
  keyOf,
  type PlaceAct,
  type PlaceFlow,
  type Read,
  type SetupConnection,
  type StageId,
  type TieSetup,
  withAsked,
} from "./changes";
import type {
  ProjectPlace,
  SettingsRecord,
  SyncStanding,
  TrackerTie,
  WhoDecidesRead,
} from "./records";

/** What the view reads its project from, each read as it stands now. */
export interface SettingsSource {
  accounts: () => AccountsView | null;
  machines: () => Machine[];
  moves: () => MoveJob[];
  /** The project; null while the hub's list has it not yet, when nothing is read or drawn. */
  project: () => ProjectRow | null;
  seam: HubSeam;
}

/** The row a source without its project yet stands on: nothing is read or sent for it. */
const NO_PROJECT: ProjectRow = {
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: "",
  eventsOn: false,
  id: "",
  lands: "none",
  lfsConnection: null,
  lfsUrl: null,
  links: [],
  name: "",
  places: [],
  primaryPlaceId: null,
};

/** The wait before a typed folder is checked: the person has stopped typing. */
const SETTLE_MS = 400;
/** How often a running move is read again. */
const FOLLOW_MS = 2000;

const GITHUB_HOST = "github.com";

/** A copy still on its way: neither started nor settled. */
const copying = (job: MoveJob): boolean =>
  job.stage !== "started" &&
  job.stage !== "cancelled" &&
  job.stage !== "failed";

const isoOf = (ms: number | null): string =>
  new Date(ms ?? Date.now()).toISOString();

/** Where the tie's two sides stand, as the hub's binding says. */
const syncOf = (binding: NonNullable<TrackerView["binding"]>): SyncStanding => {
  switch (binding.state) {
    case "syncing":
      return binding.polledAt === null
        ? { kind: "first" }
        : { kind: "syncing" };
    case "refused":
      return {
        kind: "refused",
        at: isoOf(binding.polledAt),
        words: binding.reason ?? "",
      };
    case "synced":
      return { kind: "inStep", at: isoOf(binding.polledAt) };
  }
};

export class SettingsHub {
  readonly #src: SettingsSource;

  /** The task list's tie as the hub last said it. */
  #tracker = $state<Read<TrackerView>>({ state: "reading" });
  /** The fleet's sign-ins, as the hub last listed them. */
  #connections = $state<Read<ConnectionView[]>>({ state: "reading" });
  /** The fleet's Who decides and the project's table. */
  #decides = $state<Read<{ fleet: FleetOffer; table: DecidesTable }>>({
    state: "reading",
  });
  /** When the hub was last reached, ms epoch. */
  #reachedAt = $state(Date.now());

  /** Each control's change asked and not yet answered, with its ticket. */
  #asked = $state.raw<
    Partial<Record<ChangeKey, { change: Change; ticket: number }>>
  >({});
  #tickets = 0;
  /** The last change asked of each key, so Retry sends the same one. */
  readonly #last = new Map<ChangeKey, () => void>();
  refused = $state<Partial<Record<ChangeKey, string>>>({});
  /** Acts still running: a folder being added. */
  pending = $state<ChangeKey[]>([]);
  /** Sync now asked and not yet answered. */
  syncing = $state(false);
  /** Add folder's yes to the project its preview named as already having the folder's codebase, by `machine path`. */
  #addJoins: { at: string; joins: string } | null = null;

  /** The step open under a place's row. */
  #flow = $state<PlaceFlow | null>(null);
  #forecastTimer: ReturnType<typeof setTimeout> | null = null;
  #forecastFor = 0;
  /** Change path's yes to the project its preview named. */
  #joins: string | null = null;
  /** The copy the step started, by the hub's job id. */
  #copyId = $state<string | null>(null);
  /** The move the step started, as it runs or what it did. */
  #move = $state<MoveRun | MoveResult | null>(null);

  /** The setup's reads, by what they read. */
  #setupConnections = $state<TieSetup["connections"]>({});
  #teams = $state<TieSetup["teams"]>({});
  #projects = $state<TieSetup["projects"]>({});

  constructor(src: SettingsSource) {
    this.#src = src;
  }

  get #project(): ProjectRow {
    return this.#src.project() ?? NO_PROJECT;
  }

  get #client() {
    return this.#src.seam.client;
  }

  /** The hub's state now: kept as the time it was last reached. */
  heard(): void {
    if (this.#src.seam.state === "connected") {
      this.#reachedAt = Date.now();
    }
  }

  /** The page opened: what the view reads beyond the project's row. */
  read(): void {
    if (!this.#src.project()) {
      return;
    }
    this.#readTracker();
    this.#readConnections();
    this.#readDecides();
  }

  /** A stage whose read failed, read again. */
  reread(stage: StageId): void {
    if (stage === "tasks") {
      this.#tracker = { state: "reading" };
      this.#readTracker();
    } else if (stage === "waits") {
      this.#decides = { state: "reading" };
      this.#readDecides();
    } else {
      this.#readConnections();
    }
  }

  #readTracker(): void {
    readTracker(this.#project.id, this.#client).then(
      (view) => {
        this.#tracker = { state: "read", value: view };
      },
      (error: unknown) => {
        this.#tracker = { state: "failed", reason: failureWords(error) };
      }
    );
  }

  #readConnections(): void {
    readConnections(this.#client).then(
      (connections) => {
        this.#connections = { state: "read", value: connections };
      },
      (error: unknown) => {
        this.#connections = { state: "failed", reason: failureWords(error) };
      }
    );
  }

  #readDecides(): void {
    const { id } = this.#project;
    Promise.all([readFleet(), readProject(id)]).then(
      ([fleet, project]) => {
        this.#decides = {
          state: "read",
          value: { fleet, table: project.decides },
        };
      },
      (error: unknown) => {
        this.#decides = {
          state: "failed",
          reason: decidesWords.unread(failureWords(error)),
        };
      }
    );
  }

  /* ── What the view shows ─────────────────────────────────────────── */

  /** Stages still being read: each section that reads one draws its skeleton. */
  get loading(): StageId[] {
    return [
      ...(this.#tracker.state === "reading" ? (["tasks"] as const) : []),
      ...(this.#src.accounts() === null ? (["sessions"] as const) : []),
      ...(this.#decides.state === "reading" ? (["waits"] as const) : []),
    ];
  }

  /** Stages whose read failed, with the hub's words. */
  get readFailed(): Partial<Record<StageId, string>> {
    return {
      ...(this.#tracker.state === "failed"
        ? { tasks: this.#tracker.reason }
        : {}),
      ...(this.#decides.state === "failed"
        ? { waits: this.#decides.reason }
        : {}),
    };
  }

  get #places(): ProjectPlace[] {
    const homes = new Map(
      this.#src.machines().map((row) => [row.machineId, row.home])
    );
    const hubHome = this.#src.machines().find((row) => row.hostsHub)?.home;
    return this.#project.places.map((place) => {
      const hub = place.kind === "hub";
      const home = hub ? hubHome : homes.get(place.machineId);
      const shown = (path: string) =>
        home && path.startsWith(`${home}/`)
          ? `~${path.slice(home.length)}`
          : path;
      let kind: ProjectPlace["kind"] = "other";
      if (hub) {
        kind = "hub";
      } else if (place.isPrimary) {
        kind = "start";
      }
      return {
        id: place.id,
        kind,
        machineId: hub ? null : place.machineId,
        madeByCawco: place.made,
        missing: place.missing,
        path: shown(place.path),
        locateTo: place.locateTo ? shown(place.locateTo) : null,
      };
    });
  }

  get #tie(): TrackerTie | null {
    const read = this.#tracker;
    const binding = read.state === "read" ? read.value.binding : null;
    if (!binding) {
      return null;
    }
    const connections =
      this.#connections.state === "read" ? this.#connections.value : [];
    let githubProject: TrackerTie["githubProject"] = null;
    if (binding.provider === "github") {
      if (binding.githubProject) {
        githubProject = {
          name: binding.githubProject.title,
          url: binding.githubProject.url,
        };
      } else if (binding.githubProjectReason) {
        githubProject = { none: binding.githubProjectReason };
      }
    }
    return {
      home: binding.provider,
      direction: binding.direction,
      connection: {
        name: binding.connection,
        account:
          connections.find((one) => one.name === binding.connection)?.account ??
          "",
      },
      githubProject,
      linked: binding.linked,
      statusesRefused: binding.githubStatusesRefused,
      statusesAdded: binding.githubStatusesAdded
        ? { options: binding.githubStatusesAdded.options }
        : null,
      sync: syncOf(binding),
      target: {
        id: binding.target,
        label: binding.targetName,
        url: binding.targetUrl,
      },
    };
  }

  get #whoDecides(): WhoDecidesRead {
    const read = this.#decides;
    if (read.state !== "read") {
      return { kinds: [], members: [], rules: {}, unread: null };
    }
    const { fleet, table } = read.value;
    const kinds = fleet.kinds.toSorted((a, b) => a.position - b.position);
    return {
      kinds,
      members: fleet.members,
      rules: Object.fromEntries(
        kinds.map((kind) => [
          kind.id,
          {
            by: table.routes[kind.id] ?? fleet.routes[kind.id] ?? "you",
            fleet: fleet.routes[kind.id] ?? "you",
            own: table.from[kind.id] === "project",
          },
        ])
      ),
      unread: table.problems.length > 0 ? table.problems.join(" ") : null,
    };
  }

  /** The record as the hub holds it, every ask aside. */
  get #base(): SettingsRecord {
    const project = this.#project;
    const view = this.#src.accounts();
    const signedIn = new Set(
      (view?.signins ?? [])
        .filter((one) => one.state === "signed-in")
        .map((one) => one.accountId)
    );
    const read = this.#tracker;
    const tracker = read.state === "read" ? read.value.tracker : "cawco";
    const checkouts = project.places.filter((p) => p.kind !== "hub").length;
    return {
      project: { id: project.id, name: project.name },
      holdsCode: project.links.length > 0 || checkouts > 0,
      hubReachable: this.#src.seam.state !== "unreachable",
      asOf: isoOf(this.#reachedAt),
      machines: this.#src.machines().map((row) => ({
        id: row.machineId,
        name: machineLabel(row.hostname),
        online: row.status === "online",
        os: row.os,
        home: row.home ?? "",
      })),
      places: this.#places,
      repos: project.links.flatMap((link) => {
        const [host, owner, name] = link.split("/");
        return host && owner && name
          ? [
              {
                host,
                owner,
                name,
                url:
                  host === GITHUB_HOST
                    ? `https://${link}`
                    : `https://${host}/${owner}/${name}`,
              },
            ]
          : [];
      }),
      taskHome: tracker === "cawco" ? "files" : tracker,
      tie: this.#tie,
      account: { chosen: project.account, atLimit: project.accountAtLimit },
      accounts: (view?.accounts ?? []).map((one) => ({
        id: one.id,
        name: accountNameAmong(one, view?.accounts ?? []),
        hue: one.hue,
        provider: one.provider,
        signedIn: signedIn.has(one.id),
      })),
      whoDecides: this.#whoDecides,
      landing: project.lands,
      largeFiles: project.lfsUrl
        ? {
            kind: "declared",
            address: project.lfsUrl,
            connection: project.lfsConnection ?? "",
          }
        : { kind: "own" },
    };
  }

  /** The record as the person sees it: the hub's, every ask already in it. */
  get record(): SettingsRecord {
    return withAsked(
      this.#base,
      Object.values(this.#asked).flatMap((one) => (one ? [one.change] : []))
    );
  }

  /** The fleet's sign-ins that hold a key a large-file server takes. */
  get keys(): SetupConnection[] {
    const read = this.#connections;
    return read.state === "read"
      ? read.value
          .filter(
            (each) =>
              each.hasSecret &&
              (each.auth === "bearer" || each.auth === "header")
          )
          .map((each) => ({ name: each.name, account: each.account }))
      : [];
  }

  /** The place a move or copy is running from. */
  get movingPlaceId(): string | null {
    const project = this.#project;
    const job = this.#src
      .moves()
      .find((one) => one.projectId === project.id && copying(one));
    if (job) {
      return (
        project.places.find(
          (place) =>
            place.machineId === job.sourceMachineId &&
            place.path === job.sourcePath
        )?.id ??
        project.primaryPlaceId ??
        null
      );
    }
    return this.#move?.state === "running"
      ? (this.#flow?.placeId ?? null)
      : null;
  }

  /* ── Changes ─────────────────────────────────────────────────────── */

  /** A change asked: in the record at once, then the hub's answer settles it. */
  send = (change: Change): void => {
    const key = keyOf(change);
    this.#tickets += 1;
    const ticket = this.#tickets;
    this.#last.set(key, () => this.send(change));
    this.#asked = { ...this.#asked, [key]: { change, ticket } };
    this.#clearRefusal(key);
    this.#apply(change).then(
      () => {
        this.#settle(key, ticket, null);
      },
      (error: unknown) => {
        this.#settle(key, ticket, failureWords(error));
      }
    );
  };

  /** The control's last ask, sent again. */
  retry = (key: ChangeKey): void => {
    this.#last.get(key)?.();
  };

  #clearRefusal(key: ChangeKey): void {
    const { [key]: _gone, ...rest } = this.refused;
    this.refused = rest;
  }

  #settle(key: ChangeKey, ticket: number, refusal: string | null): void {
    if (this.#asked[key]?.ticket !== ticket) {
      // A newer ask on this control stands; its own answer settles it.
      return;
    }
    const { [key]: _done, ...still } = this.#asked;
    this.#asked = still;
    if (refusal !== null) {
      this.refused = { ...this.refused, [key]: refusal };
    }
  }

  /** What the hub does for `change`; its state is the record once it answers. */
  async #apply(change: Change): Promise<void> {
    const { id } = this.#project;
    const client = this.#client;
    switch (change.key) {
      case "taskHome":
        this.#tracker = {
          state: "read",
          value: await setTracker(id, { tracker: "cawco" }, client),
        };
        return;
      case "tie": {
        const tie = change.value;
        this.#tracker = {
          state: "read",
          value: await setTracker(
            id,
            {
              tracker: tie.home,
              connection: tie.connection,
              target: tie.target,
              direction: tie.direction,
              ...(tie.home === "github"
                ? {
                    githubProject: tie.githubProject
                      ? { id: tie.githubProject }
                      : null,
                  }
                : {}),
            },
            client
          ),
        };
        return;
      }
      case "account":
        await editProject(id, { account: change.value }, client);
        return;
      case "atLimit":
        await editProject(id, { accountAtLimit: change.value }, client);
        return;
      case "landing":
        await editProject(id, { lands: change.value }, client);
        return;
      case "largeFiles":
        await editProject(
          id,
          {
            lfs:
              change.value.kind === "own"
                ? null
                : {
                    url: change.value.address,
                    connection: change.value.connection,
                  },
          },
          client
        );
        return;
      case "decides":
      case "decidesReset":
        await this.#route(change);
        return;
    }
  }

  /** A kind handed to a member, or back to the fleet's choice, written to the project's decides.md. */
  async #route(
    change: Extract<Change, { key: "decides" | "decidesReset" }>
  ): Promise<void> {
    const read = this.#decides;
    if (read.state !== "read") {
      return;
    }
    const { fleet } = read.value;
    const kindName =
      fleet.kinds.find((kind) => kind.id === change.kind)?.name ?? change.kind;
    // Handed to the fleet's own choice, it follows the fleet again.
    const member =
      change.key === "decides" && fleet.routes[change.kind] !== change.value
        ? change.value
        : null;
    const memberName =
      member === null
        ? ""
        : (fleet.members.find((one) => one.id === member)?.name ?? member);
    const written = await writeProjectRoutes(
      this.#project.id,
      { [change.kind]: member },
      member === null
        ? decidesWords.backCommit([kindName])
        : decidesWords.handCommit(kindName, memberName)
    );
    this.#decides = {
      state: "read",
      value: { fleet, table: written.decides },
    };
  }

  /** Sync now: the tie read again on both sides. */
  sync = (): void => {
    this.syncing = true;
    this.#clearRefusal("sync");
    this.#last.set("sync", () => this.sync());
    syncTracker(this.#project.id, this.#client).then(
      (view) => {
        this.syncing = false;
        this.#tracker = { state: "read", value: view };
      },
      (error: unknown) => {
        this.syncing = false;
        this.refused = { ...this.refused, sync: failureWords(error) };
      }
    );
  };

  /* ── Places ──────────────────────────────────────────────────────── */

  /**
   * Add folder: what connecting it would do is read first. When another
   * project already has the folder's codebase, the hub's words say the two
   * become one, and the press again (or Retry) is the person's yes.
   */
  addPlace = (machineId: string, path: string): void => {
    const key = "addPlace" as const;
    const { id } = this.#project;
    const client = this.#client;
    const at = `${machineId} ${path}`;
    this.#last.set(key, () => this.addPlace(machineId, path));
    this.#clearRefusal(key);
    this.pending = [...this.pending, key];
    const done = (refusal: string | null) => {
      this.pending = this.pending.filter((one) => one !== key);
      if (refusal !== null) {
        this.refused = { ...this.refused, [key]: refusal };
      }
    };
    const said = this.#addJoins?.at === at ? this.#addJoins.joins : null;
    (async () => {
      if (said === null) {
        const plan = await previewProjectPlace(id, machineId, path, client);
        if (plan.forecast.state === "blocked") {
          done(plan.forecast.why);
          return;
        }
        if (plan.joins) {
          this.#addJoins = { at, joins: plan.joins.id };
          done(plan.forecast.lines.join(" "));
          return;
        }
      }
      await addProjectPlace(id, machineId, path, said, client);
      this.#addJoins = null;
      done(null);
    })().catch((error: unknown) => done(failureWords(error)));
  };

  /** A place's act that goes at once: Stop using, or calling off a held Change path. */
  place = (act: PlaceAct, placeId: string): void => {
    const { id } = this.#project;
    const client = this.#client;
    const key: ChangeKey =
      act === "drop" ? `drop.${placeId}` : `locate.${placeId}`;
    this.#last.set(key, () => this.place(act, placeId));
    this.#clearRefusal(key);
    const asked =
      act === "drop"
        ? removeProjectPlace(id, placeId, client)
        : callOffLocate(id, placeId, client);
    asked.catch((error: unknown) => {
      this.refused = { ...this.refused, [key]: failureWords(error) };
    });
  };

  /** The step open under a place's row, as the hub carries its act. */
  get flow(): PlaceFlow | null {
    const flow = this.#flow;
    if (!flow) {
      return null;
    }
    const job =
      this.#copyId === null
        ? undefined
        : this.#src.moves().find((one) => one.id === this.#copyId);
    if (job) {
      return { ...flow, ...this.#copyState(job) };
    }
    const move = this.#move;
    if (move?.state === "running") {
      return {
        ...flow,
        run: {
          stages: move.stages,
          at: move.at,
          callOff: move.callOff,
          failed: move.failed
            ? { stage: move.failed.stage, words: move.failed.words }
            : null,
          progress: move.progress,
          waitingFor: move.waitingFor,
        },
      };
    }
    if (move?.state === "done") {
      return {
        ...flow,
        run: null,
        after: {
          lines: [
            move.checked,
            ...move.leftBehind.map(
              (one) => `${stepWords.leftBehind}: ${one.name} (${one.why})`
            ),
            ...move.ended.map((one) => `${stepWords.ended}: ${one}`),
          ],
        },
      };
    }
    return flow;
  }

  /** Copy elsewhere as the hub's job stands. */
  #copyState(job: MoveJob): Pick<PlaceFlow, "run" | "after"> {
    const target = this.#machineName(job.targetMachineId);
    if (job.stage === "started" || job.stage === "cancelled") {
      return {
        run: null,
        after: {
          lines: [
            job.stage === "started"
              ? (job.moved ?? stepWords.copyDone(target))
              : stepWords.copyCalledOff,
            ...(job.kept ? [`${stepWords.leftBehind}: ${job.kept}`] : []),
          ],
        },
      };
    }
    const words = stepWords.copyStages;
    const stages = job.steps.map((step) =>
      step === "start" ? words.start(target) : words[step]
    );
    const failed = job.stage === "failed" && job.error ? job.error : null;
    const now = failed
      ? failed.stage
      : MOVE_JOB_STEPS.find((step) => step === job.stage);
    const at = Math.max(0, now ? job.steps.indexOf(now) : 0);
    return {
      after: null,
      run: {
        stages,
        at,
        callOff: true,
        progress: job.progress
          ? stepWords.copyProgress(
              moveSize(job.progress.bytes),
              moveSize(job.progress.total)
            )
          : null,
        waitingFor: null,
        failed: failed
          ? { stage: stages[at] ?? "", words: failed.detail ?? failed.message }
          : null,
      },
    };
  }

  #machineName(machineId: string): string {
    const row = this.#src.machines().find((one) => one.machineId === machineId);
    return row ? machineLabel(row.hostname) : folderWords.unknownComputer;
  }

  /** What the person does in a place's step. */
  onflow = (event: FlowEvent): void => {
    switch (event.kind) {
      case "open":
        this.#openFlow(event.act, event.placeId);
        return;
      case "draft":
        if (this.#flow) {
          this.#flow = {
            ...this.#flow,
            machineId: event.machineId,
            path: event.path,
          };
          this.#forecast();
        }
        return;
      case "run":
        this.#runFlow();
        return;
      case "interrupt":
        this.#interrupt(event.agentId);
        return;
      case "callOff":
        this.#callOff();
        return;
      case "tryStage":
        this.#tryStage();
        return;
      case "close":
        this.#closeFlow();
        return;
    }
  };

  #openFlow(act: PlaceFlow["act"], placeId: string): void {
    const place = this.#project.places.find((one) => one.id === placeId);
    this.#copyId = null;
    this.#move = null;
    this.#joins = null;
    this.#flow = {
      act,
      placeId,
      machineId: act === "find" ? (place?.machineId ?? null) : null,
      path: "",
      forecast: { state: "none" },
      agents: [],
      sending: false,
      refused: null,
      run: null,
      after: null,
    };
  }

  #closeFlow(): void {
    if (this.#forecastTimer) {
      clearTimeout(this.#forecastTimer);
    }
    this.#flow = null;
    this.#copyId = null;
    this.#move = null;
    this.#joins = null;
  }

  #setFlow(patch: Partial<PlaceFlow>): void {
    if (this.#flow) {
      this.#flow = { ...this.#flow, ...patch };
    }
  }

  /** What will happen, asked again for the machine and folder named, once the typing settles. */
  #forecast(): void {
    const flow = this.#flow;
    if (!flow) {
      return;
    }
    if (this.#forecastTimer) {
      clearTimeout(this.#forecastTimer);
    }
    this.#forecastFor += 1;
    // A yes holds only for the folder What will happen named.
    this.#joins = null;
    const ask = this.#forecastFor;
    const path = flow.path.trim();
    const { machineId } = flow;
    if (!(machineId && path)) {
      this.#setFlow({ forecast: { state: "none" }, agents: [], refused: null });
      return;
    }
    this.#forecastTimer = setTimeout(() => {
      this.#setFlow({
        forecast: { state: "checking", machine: this.#machineName(machineId) },
        refused: null,
      });
      this.#plan(flow.act, flow.placeId, machineId, path).then(
        (facts) => {
          if (ask === this.#forecastFor) {
            this.#setFlow(facts);
          }
        },
        (error: unknown) => {
          if (ask === this.#forecastFor) {
            this.#setFlow({
              forecast: {
                state: "blocked",
                why: failureWords(error),
                todo: "",
              },
            });
          }
        }
      );
    }, SETTLE_MS);
  }

  /** What the hub says each act would do, before anything runs. */
  async #plan(
    act: PlaceFlow["act"],
    placeId: string,
    machineId: string,
    path: string
  ): Promise<Partial<PlaceFlow>> {
    const { id } = this.#project;
    const client = this.#client;
    switch (act) {
      case "move": {
        const plan = await previewMove(
          id,
          placeId,
          { machineId, path },
          client
        );
        return { forecast: plan.forecast, agents: plan.agents };
      }
      case "find": {
        const plan = await previewLocate(id, placeId, path, client);
        this.#joins = plan.joins?.id ?? null;
        return {
          forecast:
            plan.forecast.state === "ready"
              ? {
                  state: "ready",
                  lines: [plan.tell, ...plan.forecast.lines].filter(Boolean),
                }
              : plan.forecast,
        };
      }
      case "copy": {
        const estimate = await moveEstimate(
          id,
          machineId,
          { from: placeId, path },
          undefined,
          client
        );
        const machine = this.#machineName(machineId);
        if (estimate.refused) {
          return {
            forecast: { state: "blocked", why: estimate.refused, todo: "" },
          };
        }
        if (!estimate.needed) {
          return {
            forecast: {
              state: "blocked",
              why: stepWords.copyThere(machine, estimate.display),
              todo: stepWords.copyThereTodo,
            },
          };
        }
        return {
          forecast: {
            state: "ready",
            lines: [
              stepWords.copyFetch(moveSize(estimate.bytes + estimate.lfsBytes)),
              ...(estimate.uncommittedFiles > 0
                ? [stepWords.copyUnsaved(estimate.uncommittedFiles)]
                : []),
              stepWords.copyStays,
            ],
          },
        };
      }
    }
  }

  /** The step's one act. */
  #runFlow(): void {
    const flow = this.#flow;
    if (!flow?.machineId) {
      return;
    }
    const { id } = this.#project;
    const client = this.#client;
    const path = flow.path.trim();
    const { machineId } = flow;
    this.#setFlow({ sending: true, refused: null });
    const run = async () => {
      switch (flow.act) {
        case "find":
          await locateFolder(id, flow.placeId, path, this.#joins, client);
          this.#closeFlow();
          return;
        case "copy": {
          const job = await startCopy(
            id,
            {
              from: flow.placeId,
              machineId,
              path,
              // A copy starts no session: the folder is all it leaves.
              spawn: {},
            },
            client
          );
          this.#copyId = job.id;
          break;
        }
        case "move":
          this.#move = await startMove(
            id,
            flow.placeId,
            { machineId, path, summaries: [] },
            client
          );
          this.#follow();
          break;
      }
      this.#setFlow({ sending: false });
    };
    run().catch((error: unknown) => {
      this.#setFlow({ sending: false, refused: failureWords(error) });
    });
  }

  /** The move the step started, read until it is done. */
  #follow(): void {
    const move = this.#move;
    if (move?.state !== "running") {
      return;
    }
    readMove(move.id, this.#client).then(
      (now) => {
        this.#move = now;
        if (now.state === "running") {
          setTimeout(() => this.#follow(), FOLLOW_MS);
        }
      },
      () => undefined
    );
  }

  #refuse(error: unknown): void {
    this.#setFlow({ refused: failureWords(error) });
  }

  #interrupt(agentId: string): void {
    interruptSession(agentId, this.#client).then(
      () => {
        const flow = this.#flow;
        if (flow) {
          this.#setFlow({
            agents: flow.agents.map((agent) =>
              agent.id === agentId ? { ...agent, replying: false } : agent
            ),
          });
        }
      },
      (error: unknown) => this.#refuse(error)
    );
  }

  #callOff(): void {
    const move = this.#move;
    if (this.#copyId !== null) {
      cancelMove(this.#copyId, this.#client).catch((error: unknown) =>
        this.#refuse(error)
      );
    } else if (move?.state === "running") {
      callOffMove(move.id, this.#client).then(
        (result) => {
          this.#move = result;
        },
        (error: unknown) => this.#refuse(error)
      );
    }
  }

  #tryStage(): void {
    const move = this.#move;
    if (this.#copyId !== null) {
      retryMove(this.#copyId, this.#client).catch((error: unknown) =>
        this.#refuse(error)
      );
    } else if (move?.state === "running") {
      retryMoveStep(move.id, this.#client).then(
        (run) => {
          this.#move = run;
          this.#follow();
        },
        (error: unknown) => this.#refuse(error)
      );
    }
  }

  /* ── The tie's setup ─────────────────────────────────────────────── */

  /** What the tie's setup reads, as it asks for each. */
  readonly setup: TieSetup = {
    connections: {},
    teams: {},
    projects: {},
    read: (ask) => this.#setupRead(ask),
    repos: {
      list: (key) => this.#repos(key),
      look: () =>
        Promise.resolve({
          kind: "unanswered",
          after: 0,
          reason: "dead",
        } as const),
    },
  };

  /** The setup's reads as they stand, for the view. */
  get tieSetup(): TieSetup {
    return {
      ...this.setup,
      connections: this.#setupConnections,
      teams: this.#teams,
      projects: this.#projects,
    };
  }

  #setupRead(ask: Parameters<TieSetup["read"]>[0]): void {
    const client = this.#client;
    switch (ask.kind) {
      case "connections": {
        // Read once while the view stands; a read that failed is asked again by its Retry.
        const was = this.#setupConnections[ask.home];
        if (was && was.state !== "failed") {
          return;
        }
        this.#setupConnections = {
          ...this.#setupConnections,
          [ask.home]: { state: "reading" },
        };
        readConnections(client).then(
          (all) => {
            const usable = all.filter(
              (each) =>
                each.service.toLowerCase() === ask.home &&
                (ask.home === "github"
                  ? readsGitHubApi(each.auth)
                  : each.auth === "app" || each.auth === "bearer")
            );
            this.#setupConnections = {
              ...this.#setupConnections,
              [ask.home]: {
                state: "read",
                value: usable.map((each) => ({
                  name: each.name,
                  account: each.account,
                })),
              },
            };
          },
          (error: unknown) => {
            this.#setupConnections = {
              ...this.#setupConnections,
              [ask.home]: { state: "failed", reason: failureWords(error) },
            };
          }
        );
        return;
      }
      case "teams": {
        const was = this.#teams[ask.connection];
        if (was && was.state !== "failed") {
          return;
        }
        this.#teams = {
          ...this.#teams,
          [ask.connection]: { state: "reading" },
        };
        trackerTargets(ask.connection, undefined, client).then(
          (answer) => {
            this.#teams = {
              ...this.#teams,
              [ask.connection]: {
                state: "read",
                value: answer.targets.map((one) => ({
                  id: one.id,
                  label: one.name,
                })),
              },
            };
          },
          (error: unknown) => {
            this.#teams = {
              ...this.#teams,
              [ask.connection]: {
                state: "failed",
                reason: failureWords(error),
              },
            };
          }
        );
        return;
      }
      case "projects": {
        const key = `${ask.connection} ${ask.repo}`;
        const was = this.#projects[key];
        if (was && was.state !== "failed") {
          return;
        }
        this.#projects = { ...this.#projects, [key]: { state: "reading" } };
        githubProjects(ask.connection, ask.repo, client).then(
          (read) => {
            this.#projects = {
              ...this.#projects,
              [key]: {
                state: "read",
                value: {
                  refused: read.refused,
                  projects: read.projects.map((one) => ({
                    id: one.id,
                    name: one.title,
                    linked: one.linked,
                  })),
                },
              },
            };
          },
          (error: unknown) => {
            this.#projects = {
              ...this.#projects,
              [key]: { state: "failed", reason: failureWords(error) },
            };
          }
        );
        return;
      }
    }
  }

  /** A GitHub sign-in's repositories, as the repository picker lists a machine's (`connection:<name>`). */
  async #repos(key: string) {
    const connection = key.slice("connection:".length);
    const answer = await trackerTargets(connection, undefined, this.#client);
    const list: GhRepoList = {
      kind: "listed",
      repos: answer.targets.flatMap((one) => (one.repo ? [one.repo] : [])),
    };
    return { kind: "answered", value: list } as const;
  }

  /* ── Add key ─────────────────────────────────────────────────────── */

  /** A key saved as a sign-in, as Configure's Connections adds one: the row, then its key. */
  addKey = async (
    ask: KeyAsk
  ): Promise<{ name: string } | { refused: string }> => {
    const client = this.#client;
    const name = nameFor(ask.service, ask.account);
    try {
      await hubDone(
        client.api.connections.post({
          name,
          service: ask.service,
          account: ask.account,
          transport: "http",
          url: ask.url,
          auth: "bearer",
        }),
        refusedOrUnreached
      );
      await hubDone(
        client.api.connections({ name }).key.put({ key: ask.key }),
        refusedOrUnreached
      );
    } catch (error) {
      return { refused: failureWords(error) };
    }
    this.#readConnections();
    return { name };
  };
}
