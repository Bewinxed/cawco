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

/** What a folder is to the project: where agents begin, another place, or the folder kept on the hub. */
export type FolderRole = "main" | "extra" | "builtin";

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
  /** Its tool, said beside its name: Claude, Codex, Gemini. */
  tool: string;
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

/** The changes each section has in flight, by section. */
export interface PendingChanges {
  account?: Pending;
  atLimit?: Pending;
  bigFiles?: Pending;
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
export type Section = keyof PendingChanges;

/** A pick a section sends: the section and the value asked. */
export interface Choice {
  section: Section;
  value: string;
}

/** The four acts on a folder that take a step of their own. */
export type FolderAct = "move" | "locate" | "connect" | "copy";

/** What the hub tells of a destination before anything runs. */
export type Forecast =
  | { state: "none" }
  | { state: "checking"; machine: string }
  | {
      state: "ready";
      /** Each line of What will happen, in order. */
      lines: string[];
    }
  | { state: "blocked"; why: string; todo: string };

/** One agent working in the folder now. */
export interface AgentHere {
  /** To another computer: whether it keeps its conversation, or why it continues from a summary and on which tool. */
  carry: { way: "same" | "summary"; why: string | null; tool: string };
  id: string;
  name: string;
  /** In the middle of a reply: it waits, and can be interrupted. */
  replying: boolean;
}

/** A running folder act's stages, in order, with the one it is on. */
export interface RunView {
  at: number;
  /** Call off stands until the old folder starts to be removed. */
  callOff: boolean;
  /** A stage that failed: the tool's words, both folders' state. */
  failed: { stage: string; words: string; folders: string } | null;
  /** How far along the stage it is on: "1,204 of 8,310 files". */
  progress: string | null;
  stages: string[];
  /** A machine away: the stage holds. */
  waitingFor: string | null;
}

/** What a finished folder act did. */
export interface AfterView {
  agents: { name: string; resumed: boolean; why: string | null }[];
  checked: string;
  ended: string[];
  leftBehind: { name: string; why: string }[];
}

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
  run: RunView | null;
  /** Locate folder: what CawCo can tell of the folder named. */
  tell: string | null;
}

/** What the hub says inside the task list step. */
export interface TaskStepFacts {
  boards:
    Read<{ id: string; name: string }[]> | { state: "refused"; words: string };
  /** The start was refused: the service's words, beside the group that failed. */
  refused: string | null;
  signIns: Read<SignIn[]>;
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
  /** Sign in to an account, where the fleet keeps its sign-ins. */
  signIn: (accountId: string) => void;
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
