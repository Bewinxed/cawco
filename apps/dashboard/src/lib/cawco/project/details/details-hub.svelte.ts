/**
 * The project details card's tie to the hub: what the card shows of a
 * project, read off the project's row, the board's machines, the fleet's
 * accounts and the moves the hub carries, plus what the card reads on
 * opening (the task list's tie, the sign-ins); and what each press does,
 * through the hub's existing calls (stores/projects, project-tasks,
 * move.svelte) on the client the card's hub seam names, so a states file's
 * stand-in answers them. Move files and Locate folder go through their own
 * modules (project-folders-move, project-folders-locate).
 *
 * Every change is asked, shown waiting beside the old value, and in force
 * only when the hub says so: a refusal puts the hub's words beside what
 * was pressed with Try again (`pending`). The person's answers in a step
 * live here, so closing the card loses nothing.
 */
import { accountNameAmong } from "@cawco/core/accounts";
import { type ConnectionView, readsGitHubApi } from "@cawco/core/connections";
import { LANDS_MODES } from "@cawco/core/injected";
import { machineLabel } from "@cawco/core/machine-names";
import {
  MOVE_JOB_STEPS,
  type MoveEstimate,
  type MoveJob,
  moveSize,
} from "@cawco/core/move";
import type { MoveResult, MoveRun } from "@cawco/core/project-folders";
import type { TrackerTarget, TrackerView } from "@cawco/core/trackers";
import { folderWords, stepWords } from "@cawco/core/words/project-details";
import type { HubSeam } from "#lib/cawco/hub-seam.js";
import {
  cancelMove,
  moveEstimate,
  retryMove,
  startMove as startCopy,
} from "#lib/cawco/move.svelte.js";
import {
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
  readStages,
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
  readConnections,
  removeProjectPlace,
} from "#lib/cawco/stores/projects.svelte.js";
import { failureWords } from "#lib/platform/hub-read.js";
import {
  clock,
  closedCard,
  codebasesOf,
  noFolderFacts,
  noTaskFacts,
  parkedFor,
  taskListOf,
} from "./card-state";
import type {
  AiAccount,
  Board,
  CardActs,
  CardOpen,
  Choice,
  Computer,
  Details,
  Folder,
  FolderAct,
  FolderStepFacts,
  FolderStepState,
  PendingChanges,
  Read,
  Section,
  SignIn,
  StepState,
  TaskList,
  TaskStepFacts,
  TaskStepState,
} from "./details";

/** What the card reads its project from, each read as it stands now. */
export interface DetailsSource {
  accounts: () => AccountsView | null;
  /** Sign in to an account: where the fleet keeps its sign-ins. */
  goSignIn: () => void;
  machines: () => Machine[];
  moves: () => MoveJob[];
  onclose: () => void;
  project: () => ProjectRow;
  seam: HubSeam;
}

/** The wait before a typed folder is checked: the person has stopped typing. */
const SETTLE_MS = 400;

/** A copy (today's Move) still on its way: neither started nor settled. */
const copying = (job: MoveJob): boolean =>
  job.stage !== "started" &&
  job.stage !== "cancelled" &&
  job.stage !== "failed";

const githubRepoOf = (link: string): string | null =>
  link.startsWith("github.com/") ? link.slice("github.com/".length) : null;

export class DetailsHub {
  readonly #src: DetailsSource;

  /** The task list's tie as the hub last said it. */
  tracker = $state<Read<TrackerView>>({ state: "reading" });
  /** Refresh now asked and not yet answered. */
  #syncing = $state(false);
  /** Refresh now's refusal, in the hub's words. */
  #syncFault = $state<string | null>(null);
  /** The fleet's sign-ins, as the hub last listed them. */
  #connections = $state<ConnectionView[]>([]);
  pending = $state<PendingChanges>({});
  opened = $state<CardOpen>(closedCard());
  #step = $state<StepState>(null);
  /** A step left by Back: opening the same act again returns to it. */
  #parked: StepState = null;
  #edit = $state<FolderStepFacts>(noFolderFacts());
  taskFacts = $state<TaskStepFacts>(noTaskFacts());
  /** The connection reaches more codebases than it listed: typing reads the rest. */
  #targetsMore = false;
  /** The copy this card started, by the hub's job id. */
  #copyId = $state<string | null>(null);
  /** The move this card started: where it stands, or what it did. */
  #move = $state<MoveRun | MoveResult | null>(null);
  /** When the hub was last reached, ms epoch. */
  #reachedAt = $state(Date.now());
  #forecastTimer: ReturnType<typeof setTimeout> | null = null;
  #forecastFor = 0;

  constructor(src: DetailsSource) {
    this.#src = src;
  }

  get #project(): ProjectRow {
    return this.#src.project();
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

  /** The card opened: what it reads beyond the project's row. */
  read(): void {
    this.#readTracker();
    this.#readConnections();
  }

  #readTracker(): void {
    const { id } = this.#project;
    readTracker(id, this.#client).then(
      (view) => {
        this.tracker = { state: "read", value: view };
      },
      (error: unknown) => {
        this.tracker = { state: "failed", reason: failureWords(error) };
      }
    );
  }

  #readConnections(): void {
    readConnections(this.#client).then(
      (connections) => {
        this.#connections = connections;
      },
      () => undefined
    );
  }

  /* ── What the card shows ─────────────────────────────────────────── */

  get #computers(): Computer[] {
    return this.#src.machines().map((row) => ({
      id: row.machineId,
      name: machineLabel(row.hostname),
      online: row.status === "online",
      os: row.os,
    }));
  }

  /** The fleet's computers, for the chips of a step and each mark's hue. */
  get fleet(): Computer[] {
    return this.#computers;
  }

  get #hubHost(): Computer | undefined {
    const host = this.#src.machines().find((row) => row.hostsHub);
    return host
      ? this.#computers.find((c) => c.id === host.machineId)
      : undefined;
  }

  #computerOf(machineId: string, hub: boolean): Computer {
    const found = hub
      ? this.#hubHost
      : this.#computers.find((c) => c.id === machineId);
    return (
      found ?? {
        id: machineId,
        name: folderWords.unknownComputer,
        online: false,
        os: "",
      }
    );
  }

  get #folders(): Folder[] {
    const homes = new Map(
      this.#src.machines().map((row) => [row.machineId, row.home])
    );
    const hubHome = this.#src.machines().find((row) => row.hostsHub)?.home;
    return this.#project.places.map((place) => {
      const hub = place.kind === "hub";
      const home = hub ? hubHome : homes.get(place.machineId);
      let role: Folder["role"] = "extra";
      if (hub) {
        role = "builtin";
      } else if (place.isPrimary) {
        role = "main";
      }
      return {
        id: place.id,
        machine: this.#computerOf(place.machineId, hub),
        path:
          home && place.path.startsWith(`${home}/`)
            ? `~${place.path.slice(home.length)}`
            : place.path,
        missing: false,
        readAt: null,
        role,
      };
    });
  }

  get #ai(): Details["ai"] {
    const view = this.#src.accounts();
    if (!view) {
      return { state: "reading" };
    }
    const signedIn = new Set(
      view.signins
        .filter((one) => one.state === "signed-in")
        .map((one) => one.accountId)
    );
    const accounts: AiAccount[] = view.accounts.map((one) => ({
      id: one.id,
      name: accountNameAmong(one, view.accounts),
      provider: one.provider,
      signedIn: signedIn.has(one.id),
    }));
    return {
      state: "read",
      value: {
        accounts,
        chosen: this.#project.account,
        atLimit: this.#project.accountAtLimit,
      },
    };
  }

  get #tasks(): Read<TaskList> {
    const read = this.tracker;
    if (read.state !== "read") {
      return read;
    }
    if (this.#syncing) {
      return {
        state: "read",
        value: taskListOf(read.value, {
          state: "read",
          value: { state: "updating" },
        }),
      };
    }
    return {
      state: "read",
      value: taskListOf(
        read.value,
        this.#syncFault
          ? { state: "failed", reason: this.#syncFault }
          : undefined
      ),
    };
  }

  /** The sign-ins with a key, which can serve big files. */
  get #bigFileSignIns(): SignIn[] {
    return this.#connections
      .filter(
        (each) =>
          each.hasSecret && (each.auth === "bearer" || each.auth === "header")
      )
      .map((each) => ({
        id: each.name,
        name: each.name,
        account: each.account,
      }));
  }

  get #primary() {
    return this.#project.places.find(
      (place) => place.isPrimary && place.kind === "checkout"
    );
  }

  get #copyJob(): MoveJob | undefined {
    const id = this.#copyId;
    return id === null
      ? undefined
      : this.#src.moves().find((job) => job.id === id);
  }

  get #running(): Details["running"] {
    const project = this.#project;
    const job = this.#src
      .moves()
      .find((one) => one.projectId === project.id && copying(one));
    if (job) {
      const from = project.places.find(
        (place) =>
          place.machineId === job.sourceMachineId &&
          place.path === job.sourcePath
      );
      return {
        folderId: from?.id ?? this.#primary?.id ?? "",
        says: stepWords.copyingTo(
          this.#computerOf(job.targetMachineId, false).name
        ),
      };
    }
    const step = this.#step;
    if (
      this.#move?.state === "running" &&
      step?.kind === "folder" &&
      step.folderId
    ) {
      return {
        folderId: step.folderId,
        says: this.#move.stages[this.#move.at] ?? "",
      };
    }
    return null;
  }

  get details(): Details {
    const project = this.#project;
    const checkouts = project.places.filter((p) => p.kind !== "hub").length;
    const reachable = this.#src.seam.state !== "unreachable";
    return {
      hub: reachable
        ? { reachable: true }
        : {
            reachable: false,
            host: this.#hubHost?.name ?? folderWords.unknownComputer,
            readAt: clock(this.#reachedAt),
          },
      folders: { state: "read", value: this.#folders },
      ai: this.#ai,
      hasCode: project.links.length > 0 || checkouts > 0,
      finished: { state: "read", value: project.lands },
      tasks: this.#tasks,
      codebases: codebasesOf(project.links),
      bigFiles: {
        state: "read",
        value: project.lfsUrl
          ? {
              mode: "custom",
              address: project.lfsUrl,
              signIn: project.lfsConnection ?? "",
            }
          : { mode: "defaults" },
      },
      bigFileSignIns: this.#bigFileSignIns,
      running: this.#running,
    };
  }

  get step(): StepState {
    return this.#step;
  }

  /** A folder step's facts: what the person is answering, or the act as the hub carries it. */
  get folderFacts(): FolderStepFacts {
    const job = this.#copyJob;
    if (job) {
      return this.#copyFacts(job);
    }
    const move = this.#move;
    if (move?.state === "running") {
      return { ...this.#edit, phase: "running", run: move };
    }
    if (move?.state === "done") {
      return { ...this.#edit, phase: "after", after: move, run: null };
    }
    return this.#edit;
  }

  /** Copy to computer as the hub's job stands. */
  #copyFacts(job: MoveJob): FolderStepFacts {
    const target = this.#computerOf(job.targetMachineId, false).name;
    const words = stepWords.copyStages;
    const stages = job.steps.map((step) =>
      step === "start" ? words.start(target) : words[step]
    );
    if (job.stage === "started" || job.stage === "cancelled") {
      return {
        ...this.#edit,
        phase: "after",
        run: null,
        after: {
          checked:
            job.stage === "started"
              ? (job.moved ?? stepWords.copyDone(target))
              : stepWords.copyCalledOff,
          agents: [],
          leftBehind: job.kept ? [{ name: target, why: job.kept }] : [],
          ended: job.stayed ? [job.stayed] : [],
        },
      };
    }
    const failed = job.stage === "failed" && job.error ? job.error : null;
    const now = failed
      ? failed.stage
      : MOVE_JOB_STEPS.find((step) => step === job.stage);
    const at = Math.max(0, now ? job.steps.indexOf(now) : 0);
    return {
      ...this.#edit,
      phase: "running",
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
          ? {
              stage: stages[at] ?? "",
              words: failed.detail ?? failed.message,
              folders: failed.message,
            }
          : null,
      },
    };
  }

  /* ── Changes ─────────────────────────────────────────────────────── */

  /** One change asked: shown waiting, then in force or refused in the hub's words. */
  async #ask(
    section: keyof PendingChanges,
    value: string,
    send: () => Promise<unknown>
  ): Promise<boolean> {
    if (this.pending[section] && !this.pending[section]?.refused) {
      return false;
    }
    this.pending = { ...this.pending, [section]: { value, refused: null } };
    try {
      await send();
      const { [section]: _, ...rest } = this.pending;
      this.pending = rest;
      return true;
    } catch (error) {
      this.pending = {
        ...this.pending,
        [section]: { value, refused: failureWords(error) },
      };
      return false;
    }
  }

  #pick({ section, value }: Choice): void {
    const { id } = this.#project;
    const client = this.#client;
    const sends: Record<Section, () => Promise<unknown>> = {
      finished: () => {
        const lands = LANDS_MODES.find((mode) => mode === value);
        return lands ? editProject(id, { lands }, client) : Promise.resolve();
      },
      account: () =>
        editProject(
          id,
          { account: value === "automatic" ? null : value },
          client
        ),
      atLimit: () =>
        editProject(
          id,
          { accountAtLimit: value === "move" ? "move" : "wait" },
          client
        ),
      bigFiles: () => editProject(id, { lfs: null }, client),
      tasks: async () => {
        const view = await setTracker(id, { tracker: "cawco" }, client);
        this.tracker = { state: "read", value: view };
      },
    };
    this.#ask(section, value, sends[section]);
  }

  /* ── Steps ───────────────────────────────────────────────────────── */

  #setStep(next: StepState): void {
    const before = this.#step;
    this.#step = next;
    if (next?.kind === "folder" && this.folderFacts.phase === "edit") {
      if (
        before?.kind !== "folder" ||
        before.machineId !== next.machineId ||
        before.path !== next.path
      ) {
        this.#forecast(next);
      }
      return;
    }
    if (next?.kind === "tasks") {
      if (before?.kind === "tasks" && before.signIn !== next.signIn) {
        this.#readTargets(next, "");
      } else if (before?.kind === "tasks" && before.target !== next.target) {
        this.#readBoards(next);
      }
    }
  }

  /** What will happen, asked again for the computer and folder named. */
  #forecast(step: FolderStepState): void {
    if (this.#forecastTimer) {
      clearTimeout(this.#forecastTimer);
    }
    this.#forecastFor += 1;
    const ask = this.#forecastFor;
    const machineId =
      step.act === "locate"
        ? (this.#folders.find((f) => f.id === step.folderId)?.machine.id ??
          null)
        : step.machineId;
    const computer = this.#computers.find((c) => c.id === machineId);
    const path = step.path.trim();
    this.#edit = { ...this.#edit, refused: null };
    if (!(computer && path)) {
      this.#edit = { ...this.#edit, forecast: { state: "none" }, tell: null };
      return;
    }
    this.#forecastTimer = setTimeout(() => {
      this.#edit = {
        ...this.#edit,
        forecast: { state: "checking", machine: computer.name },
      };
      this.#plan(step, computer, path).then(
        (facts) => {
          if (ask === this.#forecastFor) {
            this.#edit = { ...this.#edit, ...facts };
          }
        },
        (error: unknown) => {
          if (ask === this.#forecastFor) {
            this.#edit = {
              ...this.#edit,
              forecast: {
                state: "blocked",
                why: failureWords(error),
                todo: "",
              },
            };
          }
        }
      );
    }, SETTLE_MS);
  }

  /** What the hub says each act would do, before anything runs. */
  async #plan(
    step: FolderStepState,
    computer: Computer,
    path: string
  ): Promise<Partial<FolderStepFacts>> {
    const project = this.#project;
    switch (step.act) {
      case "connect":
        return {
          forecast: {
            state: "ready",
            lines: stepWords.connectLines(path, computer.name),
          },
        };
      case "copy": {
        const from = this.#primary?.id ?? "";
        const estimate = await moveEstimate(
          project.id,
          computer.id,
          { from, path },
          undefined,
          this.#client
        );
        return { forecast: this.#copyForecast(estimate, computer.name) };
      }
      case "move": {
        const plan = await previewMove(project.id, step.folderId ?? "", {
          machineId: computer.id,
          path,
        });
        return { forecast: plan.forecast, agents: plan.agents };
      }
      case "locate": {
        const plan = await previewLocate(project.id, step.folderId ?? "", path);
        return { forecast: plan.forecast, tell: plan.tell };
      }
      default:
        return {};
    }
  }

  #copyForecast(
    estimate: MoveEstimate,
    machine: string
  ): FolderStepFacts["forecast"] {
    if (estimate.refused) {
      return { state: "blocked", why: estimate.refused, todo: "" };
    }
    if (!estimate.needed) {
      return {
        state: "blocked",
        why: stepWords.copyThere(machine, estimate.display),
        todo: stepWords.copyThereTodo,
      };
    }
    return {
      state: "ready",
      lines: [
        stepWords.copyFetch(moveSize(estimate.bytes + estimate.lfsBytes)),
        ...(estimate.uncommittedFiles > 0
          ? [stepWords.copyUnsaved(estimate.uncommittedFiles)]
          : []),
        stepWords.copyStays,
      ],
    };
  }

  /** The Connect task list step: its sign-ins, then the codebases or teams, boards and task steps. */
  async #openTaskStep(step: TaskStepState): Promise<void> {
    const project = this.#project;
    try {
      const [connections, stages] = await Promise.all([
        readConnections(this.#client),
        readStages(project.id, this.#client),
      ]);
      this.#connections = connections;
      const usable = connections.filter(
        (each) =>
          each.service.toLowerCase() === step.provider &&
          (step.provider === "github"
            ? readsGitHubApi(each.auth)
            : each.auth === "app" || each.auth === "bearer")
      );
      const signIns = usable.map((each) => ({
        id: each.name,
        name: each.name,
        account: each.account,
      }));
      this.taskFacts = {
        ...this.taskFacts,
        signIns: { state: "read", value: signIns },
        stages: stages.stages.map((stage) => stage.name),
      };
      const now = this.#step;
      if (now?.kind !== "tasks") {
        return;
      }
      const signIn =
        now.signIn ?? (signIns.length > 0 ? (signIns[0]?.id ?? null) : null);
      this.#step = { ...now, signIn };
      if (signIn) {
        await this.#readTargets({ ...now, signIn }, "");
      } else {
        this.taskFacts = {
          ...this.taskFacts,
          targets: { state: "read", value: [] },
        };
      }
    } catch (error) {
      this.taskFacts = {
        ...this.taskFacts,
        signIns: { state: "failed", reason: failureWords(error) },
      };
    }
  }

  async #readTargets(step: TaskStepState, words: string): Promise<void> {
    if (!step.signIn) {
      return;
    }
    if (!words) {
      this.taskFacts = { ...this.taskFacts, targets: { state: "reading" } };
    }
    try {
      const answer = await trackerTargets(step.signIn, words, this.#client);
      this.#targetsMore = answer.more;
      const own = this.#project.links
        .map(githubRepoOf)
        .filter((repo): repo is string => repo !== null)
        .map((repo) => repo.toLowerCase());
      const targets = answer.targets.map((target: TrackerTarget) => ({
        id: target.id,
        name: target.name,
        own: own.includes(target.id.toLowerCase()),
      }));
      this.taskFacts = {
        ...this.taskFacts,
        targets: { state: "read", value: targets },
      };
      const now = this.#step;
      if (now?.kind === "tasks" && now.target === null && !words) {
        const target = targets.find((t) => t.own)?.id ?? null;
        this.#step = { ...now, target };
        await this.#readBoards({ ...now, target });
      } else if (now?.kind === "tasks" && !words) {
        await this.#readBoards(now);
      }
    } catch (error) {
      this.taskFacts = {
        ...this.taskFacts,
        targets: { state: "failed", reason: failureWords(error) },
      };
    }
  }

  async #readBoards(step: TaskStepState): Promise<void> {
    if (step.provider !== "github" || !(step.signIn && step.target)) {
      this.taskFacts = {
        ...this.taskFacts,
        boards: { state: "read", value: [] },
      };
      return;
    }
    this.taskFacts = { ...this.taskFacts, boards: { state: "reading" } };
    try {
      const read = await githubProjects(step.signIn, step.target, this.#client);
      if (read.refused) {
        this.taskFacts = {
          ...this.taskFacts,
          boards: { state: "refused", words: read.refused },
        };
        return;
      }
      const boards: Board[] = read.projects.map((each) => ({
        id: each.id,
        name: each.title,
        columns: each.options.map((option) => ({
          id: option.id,
          name: option.name,
        })),
      }));
      this.taskFacts = {
        ...this.taskFacts,
        boards: { state: "read", value: boards },
      };
      const now = this.#step;
      if (now?.kind === "tasks" && now.board === null && !now.changing) {
        this.#step = {
          ...now,
          board: read.projects.find((each) => each.linked)?.id ?? null,
        };
      }
    } catch (error) {
      this.taskFacts = {
        ...this.taskFacts,
        boards: { state: "failed", reason: failureWords(error) },
      };
    }
  }

  /** Start updating, or Save: the task list tied as the step says. */
  async #bindTasks(step: TaskStepState): Promise<void> {
    if (!(step.signIn && step.target)) {
      return;
    }
    this.taskFacts = { ...this.taskFacts, starting: true, refused: null };
    try {
      const view = await setTracker(
        this.#project.id,
        {
          tracker: step.provider,
          connection: step.signIn,
          target: step.target,
          ...(step.provider === "github"
            ? {
                githubProject: step.board
                  ? { id: step.board, map: step.columns }
                  : null,
              }
            : {}),
        },
        this.#client
      );
      this.tracker = { state: "read", value: view };
      this.taskFacts = noTaskFacts();
      this.#parked = null;
      this.#step = null;
    } catch (error) {
      this.taskFacts = {
        ...this.taskFacts,
        starting: false,
        refused: failureWords(error),
      };
    }
  }

  /** The folder step's one act. */
  async #runFolder(step: FolderStepState): Promise<void> {
    const project = this.#project;
    const client = this.#client;
    const path = step.path.trim();
    this.#edit = { ...this.#edit, sending: true, refused: null };
    try {
      switch (step.act) {
        case "connect":
          await addProjectPlace(project.id, step.machineId ?? "", path, client);
          this.#leaveStep();
          return;
        case "locate":
          await locateFolder(project.id, step.folderId ?? "", path);
          this.#leaveStep();
          return;
        case "copy": {
          const job = await startCopy(
            project.id,
            {
              from: this.#primary?.id,
              machineId: step.machineId ?? "",
              path,
              spawn: { harness: project.cawHarness },
            },
            client
          );
          this.#copyId = job.id;
          break;
        }
        case "move":
          this.#move = await startMove(project.id, step.folderId ?? "", {
            machineId: step.machineId ?? "",
            path,
            summaries: step.summaries,
          });
          this.#followMove();
          break;
        default:
          break;
      }
      this.#edit = { ...this.#edit, sending: false };
    } catch (error) {
      this.#edit = {
        ...this.#edit,
        sending: false,
        refused: failureWords(error),
      };
    }
  }

  /** The move this card started, read until it is done. */
  #followMove(): void {
    const move = this.#move;
    if (move?.state !== "running") {
      return;
    }
    readMove(move.id).then(
      (now) => {
        this.#move = now;
        if (now.state === "running") {
          setTimeout(() => this.#followMove(), SETTLE_MS * 5);
        }
      },
      () => undefined
    );
  }

  /** A refusal of the step's act, in the hub's words, by its button. */
  #refuse(error: unknown): void {
    this.#edit = { ...this.#edit, refused: failureWords(error) };
  }

  /** The move's stage that failed, or what it left behind, tried again. */
  #retryMove(id: string): void {
    retryMoveStep(id).then(
      (run) => {
        this.#move = run;
        this.#followMove();
      },
      (error: unknown) => this.#refuse(error)
    );
  }

  #leaveStep(): void {
    this.#edit = noFolderFacts();
    this.#copyId = null;
    this.#move = null;
    this.#parked = null;
    this.#step = null;
  }

  #folderStep(act: FolderAct, folderId: string | null): FolderStepState {
    const folder = this.#folders.find((f) => f.id === folderId);
    return {
      kind: "folder",
      act,
      folderId,
      machineId: act === "locate" ? (folder?.machine.id ?? null) : null,
      path: "",
      summaries: [],
    };
  }

  #taskStep(provider: "github" | "linear", changing: boolean): TaskStepState {
    const read = this.tracker;
    const binding =
      read.state === "read" && read.value.binding?.provider === provider
        ? read.value.binding
        : null;
    return {
      kind: "tasks",
      provider,
      signIn: binding?.connection ?? null,
      target: binding?.target ?? null,
      board: binding?.githubProject?.id ?? null,
      columns: binding?.githubProject?.map ?? {},
      changing,
    };
  }

  /** A folder act's step: the one left by Back, else a new one. */
  #openFolderAct(act: FolderAct, folderId: string | null): void {
    const parked = parkedFor(this.#parked, act, folderId);
    this.opened = { ...this.opened, folder: null, disconnect: null };
    this.#step = parked ?? this.#folderStep(act, folderId);
    if (!parked) {
      this.#edit = noFolderFacts();
      this.#copyId = null;
      this.#move = null;
    }
  }

  /** The card's presses. */
  readonly acts: CardActs = {
    pick: (choice) => this.#pick(choice),
    tryAgain: () => this.read(),
    signIn: () => this.#src.goSignIn(),
    folderAct: (act, folderId) => this.#openFolderAct(act, folderId),
    disconnect: (folderId) => {
      const project = this.#project;
      this.#ask("disconnect", folderId, () =>
        removeProjectPlace(project.id, folderId, this.#client)
      ).then((done) => {
        if (done) {
          this.opened = { ...this.opened, disconnect: null };
        }
      });
    },
    connectTasks: (provider, changing) => {
      this.opened = { ...this.opened, stopUpdating: false };
      const parked = this.#parked;
      const step =
        parked?.kind === "tasks" && parked.provider === provider
          ? parked
          : this.#taskStep(provider, changing);
      this.taskFacts = noTaskFacts();
      this.#step = step;
      this.#openTaskStep(step);
    },
    refreshTasks: () => {
      this.#syncing = true;
      this.#syncFault = null;
      syncTracker(this.#project.id, this.#client).then(
        (view) => {
          this.#syncing = false;
          this.tracker = { state: "read", value: view };
        },
        (error: unknown) => {
          this.#syncing = false;
          this.#syncFault = failureWords(error);
        }
      );
    },
    saveBigFiles: (address, signIn) => {
      const { id } = this.#project;
      this.#ask("bigFiles", "custom", () =>
        editProject(
          id,
          { lfs: { connection: signIn, url: address } },
          this.#client
        )
      ).then((done) => {
        if (done) {
          this.opened = {
            ...this.opened,
            bigDraft: { open: false, address: "", signIn: null },
          };
        }
      });
    },
    searchTargets: (words) => {
      const step = this.#step;
      if (step?.kind === "tasks" && this.#targetsMore) {
        this.#readTargets(step, words);
      }
    },
    step: (next) => this.#setStep(next),
    run: () => {
      const step = this.#step;
      if (step?.kind === "tasks") {
        this.#bindTasks(step);
      } else if (step?.kind === "folder") {
        this.#runFolder(step);
      }
    },
    interrupt: (agentId) => {
      interruptSession(agentId).then(
        () => {
          this.#edit = {
            ...this.#edit,
            agents: this.#edit.agents.map((agent) =>
              agent.id === agentId ? { ...agent, replying: false } : agent
            ),
          };
        },
        (error: unknown) => this.#refuse(error)
      );
    },
    callOff: () => {
      const job = this.#copyJob;
      const move = this.#move;
      if (job) {
        cancelMove(job.id, this.#client).catch((error: unknown) =>
          this.#refuse(error)
        );
      } else if (move?.state === "running") {
        callOffMove(move.id).then(
          (result) => {
            this.#move = result;
          },
          (error: unknown) => this.#refuse(error)
        );
      }
    },
    tryStage: () => {
      const job = this.#copyJob;
      const move = this.#move;
      if (job) {
        retryMove(job.id, this.#client).catch((error: unknown) =>
          this.#refuse(error)
        );
      } else if (move?.state === "running") {
        this.#retryMove(move.id);
      }
    },
    tryLeft: () => {
      const move = this.#move;
      if (move?.state === "done") {
        this.#retryMove(move.id);
      }
    },
    back: () => {
      this.#parked = this.#step;
      this.#step = null;
    },
    cancelStep: () => {
      this.#parked = null;
      this.#step = null;
      this.#edit = noFolderFacts();
      this.taskFacts = noTaskFacts();
    },
    close: () => {
      if (this.folderFacts.phase === "after") {
        this.#leaveStep();
      }
      this.#src.onclose();
    },
  };
}
