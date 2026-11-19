/**
 * What answers the card in the hub's place in its states files: what the
 * hub would hold of the project (its details, the changes in flight, the
 * step's facts) and how it answers each press, after the wait a hub takes,
 * with a yes or with the refusal the `answer` dial names. Made anew for each
 * situation and view the story's args name (the live fixture's writable
 * `$derived`), so the args set where it starts and the presses carry it on.
 */
import { LANDS_MODES } from "@cawco/core/injected";
import {
  closedCard,
  noFolderFacts,
  noTaskFacts,
  parkedFor,
  Timers,
} from "./card-state";
import type {
  CardActs,
  CardOpen,
  Details,
  Folder,
  FolderAct,
  FolderStepFacts,
  FolderStepState,
  PendingChanges,
  Read,
  Section,
  Standing,
  StepState,
  TaskStepFacts,
  TaskStepState,
} from "./details";
import {
  AGENTS_HERE,
  BOARDS,
  connectJoins,
  detailsOf,
  FLEET,
  forecastFor,
  LOCATE_TELL,
  MOVE_AFTER,
  runAt,
  type Situation,
  STAGES,
  TASK_SIGN_INS,
  TASK_TARGETS,
} from "./records";

/** Where the card stands as a story opens. */
const VIEWS = [
  "card",
  "folder-open",
  "disconnect",
  "stop-updating",
  "more-open",
  "big-draft",
  "big-refused",
  "finished-waiting",
  "finished-refused",
  "tasks-updating",
  "move-empty",
  "move-checking",
  "move-ready",
  "move-blocked",
  "move-running",
  "move-waiting",
  "move-failed",
  "move-after",
  "locate-ready",
  "connect-ready",
  "connect-joins",
  "copy-ready",
  "tasks-github",
  "tasks-linear",
  "tasks-loading",
  "tasks-no-signin",
  "tasks-refused",
  "tasks-board-refused",
  "tasks-change",
] as const;
export type View = (typeof VIEWS)[number];

/** How the hub answers a change. */
export type Answer = "yes" | "refuse";

/** The hub's wait before it answers, ms. */
const WAIT = 900;
/** Each stage of a run, ms. */
const STAGE = 1100;

/** The hub's words for each section's refusal. */
const REFUSALS: Record<Section, string> = {
  account:
    "Studio can't take this project: its sign-in on obelisk expired (401).",
  atLimit:
    "The hub couldn't save the change: the project file is locked by another write (409).",
  bigFiles:
    "files.acme.dev answered 403 for acme files key: the key may not write to this address.",
  finished: "acme-bot may not open branches on acme/hyucksfield (403).",
  tasks: "GitHub refused to let the links go: Bad credentials (401).",
};

/** The hub's words when Call off comes too late. */
const LOCATE_CALL_OFF_REFUSAL =
  "studio-mac is back and already pointing this folder at ~/Work/Clients/Hyucksfield/hyucksfield-site (409).";

export class MockHub {
  readonly fleet = FLEET;
  details = $state<Details>(detailsOf("all-well"));
  pending = $state<PendingChanges>({});
  opened = $state<CardOpen>(closedCard());
  open = $state(true);
  folderFacts = $state<FolderStepFacts>(noFolderFacts());
  taskFacts = $state<TaskStepFacts>(noTaskFacts());
  #step = $state<StepState>(null);
  /** A step left by Back: opening the same act again returns to it. */
  /** The person's presses of Start again: a new count is a new start. */
  readonly again: number;
  #parked: StepState = null;
  readonly #timers = new Timers();
  #forecastTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #answer: () => Answer;

  constructor(
    situation: Situation,
    view: View,
    answer: () => Answer,
    open: boolean,
    again: number
  ) {
    this.again = again;
    this.#answer = answer;
    this.details = detailsOf(situation);
    this.open = open;
    this.#seed(view);
  }

  get step(): StepState {
    return this.#step;
  }

  /** The person's answers in a step: a folder step's What will happen is asked again from them. */
  set step(next: StepState) {
    const before = this.#step;
    this.#step = next;
    if (
      next?.kind === "folder" &&
      this.folderFacts.phase === "edit" &&
      (before?.kind !== "folder" ||
        before.machineId !== next.machineId ||
        before.path !== next.path)
    ) {
      this.#forecast(next);
    }
  }

  /** Stops every timer: the story was set again. */
  dispose(): void {
    this.#timers.clear();
    if (this.#forecastTimer) {
      clearTimeout(this.#forecastTimer);
    }
  }

  #later(ms: number, run: () => void): void {
    this.#timers.after(ms, run);
  }

  get #refuses(): boolean {
    return this.#answer() === "refuse";
  }

  #folderStep(
    act: FolderAct,
    folderId: string | null,
    machineId: string | null,
    path: string
  ): FolderStepState {
    return { kind: "folder", act, folderId, machineId, path, summaries: [] };
  }

  #taskStep(provider: "github" | "linear", changing: boolean): TaskStepState {
    const tasks =
      this.details.tasks.state === "read" ? this.details.tasks.value : null;
    const connected = tasks && tasks.kind === provider ? tasks : null;
    return {
      kind: "tasks",
      provider,
      signIn: connected
        ? (TASK_SIGN_INS[provider].find((s) => s.name === connected.signIn)
            ?.id ?? null)
        : null,
      target: connected
        ? (TASK_TARGETS[provider].find((t) => t.name === connected.target.name)
            ?.id ?? null)
        : null,
      board:
        connected?.board && "url" in connected.board
          ? (BOARDS[0]?.id ?? null)
          : null,
      columns: {},
      changing,
    };
  }

  #readTaskFacts(
    provider: "github" | "linear",
    over: Partial<TaskStepFacts> = {}
  ): TaskStepFacts {
    return {
      signIns: { state: "read", value: TASK_SIGN_INS[provider] },
      targets: { state: "read", value: TASK_TARGETS[provider] },
      boards: { state: "read", value: BOARDS },
      stages: STAGES,
      refused: null,
      starting: false,
      ...over,
    };
  }

  /** The view a story opens on, as the hub and the card would hold it. */
  #seed(view: View): void {
    const opened = closedCard();
    const move = (machineId: string | null, path: string) =>
      this.#folderStep("move", "pl-main", machineId, path);
    switch (view) {
      case "folder-open":
        opened.folder = "pl-main";
        break;
      case "disconnect":
        opened.disconnect = "pl-studio";
        break;
      case "stop-updating":
        opened.stopUpdating = true;
        break;
      case "more-open":
        opened.more = true;
        break;
      case "big-draft":
        opened.more = true;
        opened.bigDraft = {
          open: true,
          address: "https://files.acme.dev/acme/hyucksfield.git/info/lfs",
          signIn: null,
        };
        break;
      case "big-refused":
        opened.more = true;
        opened.bigDraft = {
          open: true,
          address: "https://files.acme.dev/acme/hyucksfield.git/info/lfs",
          signIn: "lfs-acme",
        };
        this.pending = {
          bigFiles: { value: "custom", refused: REFUSALS.bigFiles },
        };
        break;
      case "finished-waiting":
        this.pending = { finished: { value: "pr", refused: null } };
        break;
      case "finished-refused":
        this.pending = {
          finished: { value: "branch", refused: REFUSALS.finished },
        };
        break;
      case "tasks-updating":
        this.#setStanding({ state: "read", value: { state: "updating" } });
        break;
      case "move-empty":
        this.#step = move(null, "");
        this.folderFacts = { ...noFolderFacts(), agents: AGENTS_HERE };
        break;
      case "move-checking":
        this.#step = move("m-studio", "~/code/clients/hyucksfield");
        this.folderFacts = {
          ...noFolderFacts(),
          agents: AGENTS_HERE,
          forecast: { state: "checking", machine: "studio-mac" },
        };
        break;
      case "move-ready":
        this.#step = move("m-studio", "~/code/clients/hyucksfield");
        this.folderFacts = {
          ...noFolderFacts(),
          agents: AGENTS_HERE,
          forecast: forecastFor(
            "move",
            "studio-mac",
            "~/code/clients/hyucksfield",
            false
          ),
        };
        break;
      case "move-blocked":
        this.#step = move("m-studio", "~/.cawco/tmp/s-rounding");
        this.folderFacts = {
          ...noFolderFacts(),
          agents: AGENTS_HERE,
          forecast: forecastFor(
            "move",
            "studio-mac",
            "~/.cawco/tmp/s-rounding",
            false
          ),
        };
        break;
      case "move-running":
      case "move-waiting":
      case "move-failed": {
        this.#step = move("m-studio", "~/code/clients/hyucksfield");
        const run = runAt(view === "move-running" ? 1 : 2);
        this.folderFacts = {
          ...noFolderFacts(),
          phase: "running",
          run: {
            ...run,
            progress: view === "move-running" ? run.progress : null,
            waitingFor: view === "move-waiting" ? "studio-mac" : null,
            failed:
              view === "move-failed"
                ? {
                    stage: "Checking every file",
                    words:
                      'rsync: [receiver] write failed on "/Users/sam/code/clients/hyucksfield/assets/hero.mov": No space left on device (28)',
                    folders:
                      "Your folder on obelisk is untouched and still the project's. studio-mac holds a partial copy, which this stage replaces.",
                  }
                : null,
          },
        };
        this.details = {
          ...this.details,
          running: { folderId: "pl-main", says: "Moving files to studio-mac" },
        };
        break;
      }
      case "move-after":
        this.#step = move("m-studio", "~/code/clients/hyucksfield");
        this.folderFacts = {
          ...noFolderFacts(),
          phase: "after",
          after: MOVE_AFTER,
        };
        break;
      case "locate-ready":
        this.#step = this.#folderStep(
          "locate",
          "pl-main",
          "m-obelisk",
          "~/code/clients/hyucksfield-2026"
        );
        this.folderFacts = {
          ...noFolderFacts(),
          tell: LOCATE_TELL,
          forecast: forecastFor(
            "locate",
            "obelisk",
            "~/code/clients/hyucksfield-2026",
            true
          ),
        };
        break;
      case "connect-ready":
        this.#step = this.#folderStep(
          "connect",
          null,
          "m-render",
          "~/sites/hyucksfield"
        );
        this.folderFacts = {
          ...noFolderFacts(),
          forecast: forecastFor(
            "connect",
            "render-box",
            "~/sites/hyucksfield",
            false
          ),
        };
        break;
      case "connect-joins":
        this.#step = this.#folderStep(
          "connect",
          null,
          "m-studio",
          "~/Work/Clients/Hyucksfield/hyucksfield-site"
        );
        this.folderFacts = {
          ...noFolderFacts(),
          forecast: connectJoins(
            "studio-mac",
            "~/Work/Clients/Hyucksfield/hyucksfield-site"
          ),
        };
        break;
      case "copy-ready":
        this.#step = this.#folderStep(
          "copy",
          null,
          "m-lab",
          "~/code/hyucksfield"
        );
        this.folderFacts = {
          ...noFolderFacts(),
          forecast: forecastFor("copy", "lab-nuc", "~/code/hyucksfield", false),
        };
        break;
      case "tasks-github":
        this.#connecting(
          {
            provider: "github",
            signIn: "gh-acme",
            target: "acme/hyucksfield",
            board: "PVT_roadmap",
          },
          this.#readTaskFacts("github")
        );
        break;
      case "tasks-linear":
        this.#connecting(
          { provider: "linear", signIn: "ln-acme", target: "HYF" },
          this.#readTaskFacts("linear")
        );
        break;
      case "tasks-loading":
        this.#connecting({ provider: "github" }, noTaskFacts());
        break;
      case "tasks-no-signin":
        this.#connecting(
          { provider: "linear" },
          this.#readTaskFacts("linear", {
            signIns: { state: "read", value: [] },
          })
        );
        break;
      case "tasks-refused":
        this.#connecting(
          { provider: "github", signIn: "gh-acme", target: "acme/brand-site" },
          this.#readTaskFacts("github", {
            refused:
              "Resource not accessible by integration: acme-bot isn't installed on acme/brand-site (403).",
          })
        );
        break;
      case "tasks-board-refused":
        this.#connecting(
          {
            provider: "github",
            signIn: "gh-token",
            target: "acme/hyucksfield",
          },
          this.#readTaskFacts("github", {
            boards: {
              state: "refused",
              words:
                "Your token has not been granted the required scopes to read projects: read:project.",
            },
          })
        );
        break;
      case "tasks-change":
        this.#step = this.#taskStep("github", true);
        this.taskFacts = this.#readTaskFacts("github");
        break;
      case "card":
        break;
      default:
        break;
    }
    this.opened = opened;
  }

  /** The project keeps its tasks only here, and its Connect task list step stands with `picked` and `facts`. */
  #connecting(
    picked: Partial<TaskStepState> & Pick<TaskStepState, "provider">,
    facts: TaskStepFacts
  ): void {
    this.details = {
      ...this.details,
      tasks: { state: "read", value: { kind: "here" } },
    };
    this.#step = { ...this.#taskStep(picked.provider, false), ...picked };
    this.taskFacts = facts;
  }

  #setStanding(standing: Read<Standing>): void {
    const { tasks } = this.details;
    if (tasks.state !== "read" || tasks.value.kind === "here") {
      return;
    }
    this.details = {
      ...this.details,
      tasks: { state: "read", value: { ...tasks.value, standing } },
    };
  }

  #forecast(step: FolderStepState): void {
    if (this.#forecastTimer) {
      clearTimeout(this.#forecastTimer);
    }
    const computer = FLEET.find((c) => c.id === step.machineId);
    if (!computer || step.path.trim() === "") {
      this.folderFacts = { ...this.folderFacts, forecast: { state: "none" } };
      return;
    }
    this.#forecastTimer = setTimeout(() => {
      this.folderFacts = {
        ...this.folderFacts,
        forecast: { state: "checking", machine: computer.name },
      };
      this.#later(WAIT, () => {
        const folder = this.#folder(step.folderId);
        this.folderFacts = {
          ...this.folderFacts,
          tell: step.act === "locate" ? LOCATE_TELL : null,
          forecast: forecastFor(
            step.act,
            computer.name,
            step.path.trim(),
            folder?.machine.id === computer.id
          ),
        };
      });
    }, WAIT / 2);
  }

  #folder(id: string | null) {
    return this.details.folders.state === "read"
      ? this.details.folders.value.find((f) => f.id === id)
      : undefined;
  }

  #apply(section: Section, value: string): void {
    const d = this.details;
    switch (section) {
      case "finished":
        this.details = {
          ...d,
          finished: {
            state: "read",
            value: LANDS_MODES.find((mode) => mode === value) ?? "main",
          },
        };
        break;
      case "account":
        if (d.ai.state === "read") {
          this.details = {
            ...d,
            ai: {
              state: "read",
              value: {
                ...d.ai.value,
                chosen: value === "automatic" ? null : value,
              },
            },
          };
        }
        break;
      case "atLimit":
        if (d.ai.state === "read") {
          this.details = {
            ...d,
            ai: {
              state: "read",
              value: {
                ...d.ai.value,
                atLimit: value === "move" ? "move" : "wait",
              },
            },
          };
        }
        break;
      case "tasks":
        this.details = {
          ...d,
          tasks: { state: "read", value: { kind: "here" } },
        };
        break;
      case "bigFiles":
        this.details = {
          ...d,
          bigFiles: { state: "read", value: { mode: "defaults" } },
        };
        break;
      default:
        break;
    }
  }

  #ask(section: Section, value: string, then: () => void): void {
    this.pending = { ...this.pending, [section]: { value, refused: null } };
    this.#later(WAIT, () => {
      if (this.#refuses) {
        this.pending = {
          ...this.pending,
          [section]: { value, refused: REFUSALS[section] },
        };
        return;
      }
      const { [section]: _, ...rest } = this.pending;
      this.pending = rest;
      then();
    });
  }

  #runMove(): void {
    const step = this.#step;
    if (step?.kind !== "folder") {
      return;
    }
    const computer = FLEET.find((c) => c.id === step.machineId);
    const says =
      step.act === "move"
        ? `Moving files to ${computer?.name ?? "another folder"}`
        : null;
    if (says) {
      this.details = {
        ...this.details,
        running: { folderId: step.folderId ?? "", says },
      };
    }
    this.folderFacts = { ...this.folderFacts, phase: "running", run: runAt(0) };
    const advance = (at: number) => {
      const { run } = this.folderFacts;
      if (!run || run.failed) {
        return;
      }
      if (at >= run.stages.length) {
        this.#finishMove(step);
        return;
      }
      this.folderFacts = { ...this.folderFacts, run: runAt(at) };
      this.#later(STAGE, () => advance(at + 1));
    };
    this.#later(STAGE, () => advance(1));
  }

  #finishMove(step: FolderStepState): void {
    const computer = FLEET.find((c) => c.id === step.machineId);
    if (this.details.folders.state === "read" && computer) {
      this.details = {
        ...this.details,
        running: null,
        folders: {
          state: "read",
          value: this.details.folders.value.map((f) =>
            f.id === step.folderId
              ? { ...f, machine: computer, path: step.path, missing: false }
              : f
          ),
        },
      };
    }
    this.folderFacts = {
      ...this.folderFacts,
      phase: "after",
      run: null,
      after: MOVE_AFTER,
    };
  }

  /** The card's presses, answered as the hub would. */
  readonly acts: CardActs = {
    step: (next) => {
      this.step = next;
    },
    searchTargets: () => undefined,
    pick: ({ section, value }) =>
      this.#ask(section, value, () => this.#apply(section, value)),
    tryAgain: () => {
      if (!this.details.hub.reachable) {
        this.#later(WAIT, () => {
          this.details = { ...this.details, hub: { reachable: true } };
        });
        return;
      }
      const { tasks } = this.details;
      if (
        tasks.state === "read" &&
        tasks.value.kind !== "here" &&
        tasks.value.standing.state === "failed"
      ) {
        this.#setStanding({ state: "reading" });
        this.#later(WAIT, () =>
          this.#setStanding({
            state: "read",
            value: { state: "up-to-date", at: "14:07" },
          })
        );
      }
    },
    signIn: (accountId) => {
      this.#later(WAIT * 2, () => {
        const { ai } = this.details;
        if (ai.state === "read") {
          const accounts = ai.value.accounts.map((a) =>
            a.id === accountId || (accountId === "" && a.id === "acc-work")
              ? { ...a, signedIn: true }
              : a
          );
          this.details = {
            ...this.details,
            ai: { state: "read", value: { ...ai.value, accounts } },
          };
        }
      });
    },
    folderAct: (act, folderId) => {
      this.opened = { ...this.opened, folder: null, disconnect: null };
      const parked = parkedFor(this.#parked, act, folderId);
      if (parked) {
        this.#step = parked;
        return;
      }
      const folder = this.#folder(folderId);
      this.folderFacts = {
        ...noFolderFacts(),
        agents: act === "move" ? AGENTS_HERE : [],
      };
      this.#step = this.#folderStep(
        act,
        folderId,
        act === "locate" ? (folder?.machine.id ?? null) : null,
        ""
      );
    },
    callOffLocate: (folderId) => {
      this.pending = {
        ...this.pending,
        locate: { value: folderId, refused: null },
      };
      this.#later(WAIT, () => {
        if (this.#refuses) {
          this.pending = {
            ...this.pending,
            locate: { value: folderId, refused: LOCATE_CALL_OFF_REFUSAL },
          };
          return;
        }
        const { locate: _, ...rest } = this.pending;
        this.pending = rest;
        if (this.details.folders.state === "read") {
          this.details = {
            ...this.details,
            folders: {
              state: "read",
              value: this.details.folders.value.map((f) =>
                f.id === folderId ? { ...f, locateTo: null } : f
              ),
            },
          };
        }
      });
    },
    disconnect: (folderId) => {
      this.#later(WAIT, () => {
        if (this.details.folders.state === "read") {
          this.details = {
            ...this.details,
            folders: {
              state: "read",
              value: this.details.folders.value.filter(
                (f) => f.id !== folderId
              ),
            },
          };
        }
      });
    },
    connectTasks: (provider, changing) => {
      this.opened = { ...this.opened, stopUpdating: false };
      this.taskFacts = noTaskFacts();
      this.#step = this.#taskStep(provider, changing);
      this.#later(WAIT, () => {
        this.taskFacts = this.#readTaskFacts(provider);
        const step = this.#step;
        if (step?.kind === "tasks" && !step.changing) {
          const signIns = TASK_SIGN_INS[provider];
          const own = TASK_TARGETS[provider].find((t) => t.own);
          this.#step = {
            ...step,
            signIn:
              signIns.length === 1 ? (signIns[0]?.id ?? null) : step.signIn,
            target: own?.id ?? null,
          };
        }
      });
    },
    refreshTasks: () => {
      this.#setStanding({ state: "read", value: { state: "updating" } });
      this.#later(WAIT * 1.5, () =>
        this.#setStanding(
          this.#refuses
            ? {
                state: "read",
                value: {
                  state: "refused",
                  words:
                    "Bad credentials: acme-bot's key was revoked on Nov 18 (401).",
                },
              }
            : { state: "read", value: { state: "up-to-date", at: "14:07" } }
        )
      );
    },
    saveBigFiles: (address, signIn) => {
      this.#ask("bigFiles", "custom", () => {
        const name =
          this.details.bigFileSignIns.find((s) => s.id === signIn)?.name ??
          signIn;
        this.details = {
          ...this.details,
          bigFiles: {
            state: "read",
            value: { mode: "custom", address, signIn: name },
          },
        };
        this.opened = {
          ...this.opened,
          bigDraft: { open: false, address: "", signIn: null },
        };
      });
    },
    run: () => {
      const step = this.#step;
      if (step?.kind === "tasks") {
        this.taskFacts = { ...this.taskFacts, starting: true, refused: null };
        this.#later(WAIT, () => {
          if (this.#refuses) {
            this.taskFacts = {
              ...this.taskFacts,
              starting: false,
              refused:
                "Resource not accessible by integration: acme-bot isn't installed on this codebase (403).",
            };
            return;
          }
          const targets = TASK_TARGETS[step.provider];
          const target = targets.find((t) => t.id === step.target);
          const board = BOARDS.find((b) => b.id === step.board);
          this.details = {
            ...this.details,
            tasks: {
              state: "read",
              value: {
                kind: step.provider,
                target: {
                  name: target?.name ?? "",
                  url:
                    step.provider === "github"
                      ? `https://github.com/${target?.id}`
                      : `https://linear.app/acme/team/${target?.id}`,
                },
                linked: 0,
                signIn:
                  TASK_SIGN_INS[step.provider].find((s) => s.id === step.signIn)
                    ?.name ?? "",
                standing: { state: "read", value: { state: "first" } },
                board: board
                  ? {
                      name: board.name,
                      url: "https://github.com/orgs/acme/projects/4",
                    }
                  : null,
              },
            },
          };
          this.taskFacts = noTaskFacts();
          this.#step = null;
          this.#parked = null;
          this.#later(WAIT * 3, () => {
            const { tasks } = this.details;
            if (tasks.state === "read" && tasks.value.kind !== "here") {
              this.details = {
                ...this.details,
                tasks: {
                  state: "read",
                  value: {
                    ...tasks.value,
                    linked: 37,
                    standing: {
                      state: "read",
                      value: { state: "up-to-date", at: "14:08" },
                    },
                  },
                },
              };
            }
          });
        });
        return;
      }
      if (step?.kind !== "folder") {
        return;
      }
      if (step.act === "locate" || step.act === "connect") {
        this.folderFacts = {
          ...this.folderFacts,
          phase: "running",
          run: {
            ...runAt(0),
            stages: [
              "Checking the folder",
              "Carrying conversations",
              "Placing project files",
            ],
            callOff: false,
          },
        };
        this.#later(STAGE, () => {
          const computer = FLEET.find((c) => c.id === step.machineId);
          if (this.details.folders.state === "read" && computer) {
            const kept = this.details.folders.value;
            const value: Folder[] =
              step.act === "locate"
                ? kept.map((f) =>
                    f.id === step.folderId
                      ? {
                          ...f,
                          path: step.path,
                          missing: false,
                          locateTo: null,
                        }
                      : f
                  )
                : [
                    ...kept,
                    {
                      id: `pl-${computer.id}`,
                      machine: computer,
                      path: step.path,
                      missing: false,
                      locateTo: null,
                      readAt: null,
                      role: "extra",
                    },
                  ];
            this.details = {
              ...this.details,
              folders: { state: "read", value },
            };
          }
          this.folderFacts = noFolderFacts();
          this.#step = null;
          this.#parked = null;
        });
        return;
      }
      this.#runMove();
    },
    interrupt: (agentId) => {
      this.folderFacts = {
        ...this.folderFacts,
        agents: this.folderFacts.agents.map((a) =>
          a.id === agentId ? { ...a, replying: false } : a
        ),
      };
    },
    callOff: () => {
      this.dispose();
      this.details = { ...this.details, running: null };
      this.folderFacts = {
        ...this.folderFacts,
        phase: "after",
        run: null,
        after: {
          checked:
            "Called off before anything was removed. Your folder on obelisk is as it was, and still the project's.",
          agents: MOVE_AFTER.agents,
          leftBehind: [
            {
              name: "~/code/clients/hyucksfield on studio-mac",
              why: "The partial copy stays there; nothing of yours is in it alone.",
            },
          ],
          ended: [],
        },
      };
    },
    tryStage: () => {
      const { run } = this.folderFacts;
      if (run) {
        this.folderFacts = {
          ...this.folderFacts,
          run: { ...run, failed: null },
        };
        this.#later(STAGE, () => {
          const step = this.#step;
          if (step?.kind === "folder") {
            this.#finishMove(step);
          }
        });
      }
    },
    tryLeft: (name) => {
      this.#later(WAIT, () => {
        const { after } = this.folderFacts;
        if (after) {
          this.folderFacts = {
            ...this.folderFacts,
            after: {
              ...after,
              leftBehind: after.leftBehind.filter((i) => i.name !== name),
            },
          };
        }
      });
    },
    back: () => {
      this.#parked = this.#step;
      this.#step = null;
    },
    cancelStep: () => {
      this.#parked = null;
      this.#step = null;
      this.folderFacts = noFolderFacts();
    },
    close: () => {
      const step = this.#step;
      if (step?.kind === "folder" && this.folderFacts.phase === "after") {
        this.#step = null;
        this.folderFacts = noFolderFacts();
      }
      this.open = false;
    },
  };
}
