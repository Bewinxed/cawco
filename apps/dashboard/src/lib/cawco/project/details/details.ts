/**
 * The project details card's model (the structure "Project details card
 * structure", option 1): what the hub says of a project's folders, AI
 * account, finished code, task list and code details, as the card takes it.
 * Every fact is read, still reading, or failed with the hub's own words, so
 * a value being read never shows as a settled one. What a press asked and
 * the hub has not yet answered stands beside it (`Pending`), so the old pick
 * stays chosen until the hub confirms.
 */
import type { ProjectAtLimit } from "@cawco/core/accounts";
import type { LandsMode } from "@cawco/core/injected";
import type {
  AgentHere,
  FolderAct,
  FolderForecast,
  FolderRole,
  MoveResult,
  MoveRun,
} from "@cawco/core/project-folders";

export type { FolderAct } from "@cawco/core/project-folders";

/** A fact as the hub last said it. */
export type Read<T> =
  | { state: "reading" }
  | { state: "read"; value: T }
  | { state: "failed"; reason: string };

/** One computer of the fleet, as a chip or a row names it. */
export interface Computer {
  id: string;
  name: string;
  online: boolean;
  /** Its operating system, as its daemon reports it (`linux`, `darwin`). */
  os: string;
}

/** One folder of the project. */
export interface Folder {
  id: string;
  machine: Computer;
  /** Its folder is no longer where the project expects it. */
  missing: boolean;
  /** The whole path, as the machine reports it. */
  path: string;
  /** Its machine is away: when its facts were read, `14:02`. */
  readAt: string | null;
  role: FolderRole;
}

/** One AI account of the fleet. */
export interface AiAccount {
  id: string;
  /** Its own name, as it carries it everywhere. */
  name: string;
  /** Its provider's mark (ProviderLogo `provider`). */
  provider: string;
  signedIn: boolean;
}

/** The AI account section's facts: the fleet's accounts, the project's pick, and what happens at its limit. */
export interface AiChoice {
  accounts: AiAccount[];
  atLimit: ProjectAtLimit;
  /** The account its agents start on; null: Automatic. */
  chosen: string | null;
}

/** How tasks stand with GitHub or Linear while the task list is connected. */
export type Standing =
  | { state: "first" }
  | { state: "updating" }
  | { state: "up-to-date"; at: string }
  | { state: "refused"; words: string };

/** Where the project's tasks are kept, with the facts of a connection. */
export type TaskList =
  | { kind: "here" }
  | {
      kind: "github" | "linear";
      /** The codebase (`acme/hyucksfield`) or team (`ENG · Engineering`). */
      target: { name: string; url: string };
      linked: number;
      /** The sign-in it updates through, by its name. */
      signIn: string;
      standing: Read<Standing>;
      /** GitHub: the status board, or GitHub's words for why none can be used; null with none set. */
      board: { name: string; url: string } | { reason: string } | null;
    };

/** Where big files are kept. */
export type BigFiles =
  { mode: "defaults" } | { mode: "custom"; address: string; signIn: string };

/** A codebase the project is connected to. */
export interface Codebase {
  host: string;
  name: string;
  url: string;
}

/** A sign-in that can serve big files or a task list, by its name and the account behind it. */
export interface SignIn {
  account: string;
  id: string;
  name: string;
}

/** A change the person pressed and the hub has not taken yet: what was asked, and the hub's refusal once it says no. */
export interface Pending {
  refused: string | null;
  value: string;
}

/** The changes each section has in flight, by section; `disconnect`'s value is the folder's id. */
export interface PendingChanges {
  account?: Pending;
  atLimit?: Pending;
  bigFiles?: Pending;
  disconnect?: Pending;
  finished?: Pending;
  tasks?: Pending;
}

/** A folder act that runs under way, said on the card's top line and its folder's row. */
interface Running {
  folderId: string;
  /** What the top line says: "Moving files to studio-mac". */
  says: string;
}

/** Everything the card shows of a project. */
export interface Details {
  ai: Read<AiChoice>;
  /** The sign-ins that can serve big files. */
  bigFileSignIns: SignIn[];
  bigFiles: Read<BigFiles>;
  codebases: Codebase[];
  finished: Read<LandsMode>;
  folders: Read<Folder[]>;
  /** The project holds code: Finished code and More code details apply. */
  hasCode: boolean;
  /** The hub answers; else which computer stopped answering and when the details were read. */
  hub: { reachable: true } | { reachable: false; host: string; readAt: string };
  running: Running | null;
  tasks: Read<TaskList>;
}

/** Which section the person picks in. */
export type Section = Exclude<keyof PendingChanges, "disconnect">;

/** A pick a section sends: the section and the value asked. */
export interface Choice {
  section: Section;
  value: string;
}

/** What the hub tells of a destination before anything runs. */
export type Forecast =
  { state: "none" } | { state: "checking"; machine: string } | FolderForecast;

/** A running folder act's stages, in order, with the one it is on. */
export type RunView = Omit<MoveRun, "id" | "state">;

/** What a finished folder act did. */
export type AfterView = Omit<MoveResult, "state" | "id">;

export type { AgentHere } from "@cawco/core/project-folders";

/** What the person has typed and picked in a folder step: kept while the card is closed. */
export interface FolderStepState {
  act: FolderAct;
  /** The folder acted on; none for Connect existing folder and Copy to computer. */
  folderId: string | null;
  kind: "folder";
  machineId: string | null;
  path: string;
  /** Agents changed from their way to Continue from a summary, by id. */
  summaries: string[];
}

/** What the person has picked in the task list step. */
export interface TaskStepState {
  board: string | null;
  /** The step changes a connection already made: its act is Save. */
  changing: boolean;
  /** Each task step's column on the board, by the step's name; null leaves it alone. */
  columns: Record<string, string | null>;
  kind: "tasks";
  provider: "github" | "linear";
  signIn: string | null;
  target: string | null;
}

/** The step the card's body stands in; null: the card itself. */
export type StepState = FolderStepState | TaskStepState | null;

/** What the hub says inside a folder step. */
export interface FolderStepFacts {
  after: AfterView | null;
  agents: AgentHere[];
  forecast: Forecast;
  phase: "edit" | "running" | "after";
  /** The step's act was refused: the hub's words, by its one button. */
  refused: string | null;
  run: RunView | null;
  /** The step's act was sent and the hub has not answered yet. */
  sending: boolean;
  /** Locate folder: what CawCo can tell of the folder named. */
  tell: string | null;
}

/** A status board the task list can show each task step on: its columns. */
export interface Board {
  /** Its Status column's choices; none when it has no Status. */
  columns: { id: string; name: string }[];
  id: string;
  name: string;
}

/** What the hub says inside the task list step. */
export interface TaskStepFacts {
  boards: Read<Board[]> | { state: "refused"; words: string };
  /** The start was refused: the service's words, beside the group that failed. */
  refused: string | null;
  signIns: Read<SignIn[]>;
  /** The project's task steps, each of which a board column can stand for. */
  stages: string[];
  starting: boolean;
  targets: Read<{ id: string; name: string; own: boolean }[]>;
}

/** What the person has typed for a custom big file location, kept until Save. */
export interface BigDraft {
  address: string;
  open: boolean;
  signIn: string | null;
}

/** What the card's presses send, each to the hub or to a step. */
export interface CardActs {
  /** Back to the card, the step's answers kept. */
  back: () => void;
  callOff: () => void;
  /** Cancel: the step's answers let go, back to the card. */
  cancelStep: () => void;
  /** Done: the card closes; a step stays where it is. */
  close: () => void;
  /** A service that is not connected was pressed, or Change…: its step opens. */
  connectTasks: (provider: "github" | "linear", changing: boolean) => void;
  disconnect: (folderId: string) => void;
  /** A folder act that takes a step of its own. */
  folderAct: (act: FolderAct, folderId: string | null) => void;
  interrupt: (agentId: string) => void;
  /** A pick in a section; the old pick stays chosen until the hub answers. */
  pick: (pick: Choice) => void;
  refreshTasks: () => void;
  /** The step's one act: Move files, Locate folder, Start updating. */
  run: () => void;
  saveBigFiles: (address: string, signIn: string) => void;
  /** The typed words a codebase or team is searched by, in the task list step. */
  searchTargets: (words: string) => void;
  /** Sign in to an account, where the fleet keeps its sign-ins. */
  signIn: (accountId: string) => void;
  /** The person's answers in a step, changed. */
  step: (next: StepState) => void;
  /** Ask the hub again: a read that failed, or the hub out of reach. */
  tryAgain: () => void;
  tryLeft: (name: string) => void;
  tryStage: () => void;
}

/** What stands open on the card, kept while it is closed. */
export interface CardOpen {
  bigDraft: BigDraft;
  /** The folder Disconnect folder asks about. */
  disconnect: string | null;
  /** The folder whose acts stand open. */
  folder: string | null;
  more: boolean;
  /** Only here asks before it stops updating. */
  stopUpdating: boolean;
}

/** What the card is fed and answered by: the hub's tie in the product, a stand-in on the canvas. */
export interface CardSource {
  readonly acts: CardActs;
  readonly details: Details;
  readonly fleet: Computer[];
  readonly folderFacts: FolderStepFacts;
  opened: CardOpen;
  readonly pending: PendingChanges;
  readonly step: StepState;
  readonly taskFacts: TaskStepFacts;
}
