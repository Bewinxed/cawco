/**
 * The project the card is fed in its states files: the product's own
 * records (ProjectRow and its ProjectPlaces, the board's Machines, a
 * TrackerView), shaped as the hub answers them, for one project with three
 * folders (its Main folder on obelisk, an Extra folder on studio-mac with a
 * long path, its Built-in folder), four AI accounts, GitHub Issues
 * connected with 128 tasks, and a move under way; and what the card makes
 * of each situation the person meets.
 */
import type { TrackerView } from "@cawco/core/trackers";
import { folderMoveWords } from "@cawco/core/words/folder-move";
import { stepWords } from "@cawco/core/words/project-details";
import {
  foldWords,
  locateLines,
  locateTells,
} from "@cawco/core/words/project-locate";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";
import { codebasesOf, taskListOf } from "./card-state";
import type {
  AfterView,
  AgentHere,
  AiAccount,
  Board,
  Computer,
  Details,
  Folder,
  FolderAct,
  Forecast,
  RunView,
  SignIn,
} from "./details";

const machine = (
  machineId: string,
  hostname: string,
  os: string,
  status: string
): Machine => ({
  auth: "unknown",
  hostname,
  joinedAt: Date.UTC(2026, 2, 4),
  machineId,
  os,
  pausedUntil: null,
  pauseStopped: null,
  status,
  home: os === "darwin" ? "/Users/sam" : "/home/sam",
});

/** The fleet: the computer that keeps the project's own folder, a laptop, a spare box with no copy of the code yet, and a render box that is off. */
export const MACHINES: Machine[] = [
  { ...machine("m-obelisk", "obelisk", "linux", "online"), hostsHub: true },
  machine("m-studio", "studio-mac", "darwin", "online"),
  machine("m-lab", "lab-nuc", "linux", "online"),
  machine("m-render", "render-box", "linux", "offline"),
];

export const PROJECT: ProjectRow = {
  account: "acc-work",
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: "inst-caw-hyf",
  createdAt: "2026-09-02T09:14:00.000Z",
  eventsOn: true,
  id: "hyucksfield",
  lands: "main",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/acme/hyucksfield"],
  name: "hyucksfield",
  places: [
    {
      createdAt: "2026-09-02T09:14:00.000Z",
      id: "pl-main",
      isPrimary: true,
      kind: "checkout",
      machineId: "m-obelisk",
      path: "/home/sam/code/clients/hyucksfield",
      found: true,
      made: false,
      missing: false,
      projectId: "hyucksfield",
      within: [],
      locateTo: null,
    },
    {
      createdAt: "2026-10-11T16:40:00.000Z",
      id: "pl-studio",
      isPrimary: false,
      kind: "checkout",
      machineId: "m-studio",
      path: "/Users/sam/Work/Clients/Hyucksfield/2026 rebrand/hyucksfield-site-checkout",
      found: true,
      made: false,
      missing: false,
      projectId: "hyucksfield",
      within: [],
      locateTo: null,
    },
    {
      createdAt: "2026-09-02T09:14:00.000Z",
      id: "pl-hub",
      isPrimary: false,
      kind: "hub",
      machineId: "hub",
      path: "/home/sam/.cawco/projects/hyucksfield",
      found: true,
      made: false,
      missing: false,
      projectId: "hyucksfield",
      within: [],
      locateTo: null,
    },
  ],
  primaryPlaceId: "pl-main",
  review: false,
};

export const TRACKER: TrackerView = {
  tracker: "github",
  binding: {
    boundAt: Date.UTC(2026, 9, 1),
    connection: "acme-bot",
    githubProject: {
      fieldId: "PVTSSF_status",
      id: "PVT_roadmap",
      map: {},
      number: 4,
      options: [],
      title: "Roadmap",
      url: "https://github.com/orgs/acme/projects/4",
    },
    githubProjectReason: null,
    linked: 128,
    polledAt: new Date(2026, 10, 19, 14, 2).getTime(),
    provider: "github",
    reason: null,
    state: "synced",
    target: "acme/hyucksfield",
    targetName: "acme/hyucksfield",
    targetUrl: "https://github.com/acme/hyucksfield",
  },
};

/** The fleet's four AI accounts, by the names they carry everywhere. */
const ACCOUNTS: AiAccount[] = [
  {
    id: "acc-work",
    name: "Work",
    provider: "anthropic",
    signedIn: true,
  },
  {
    id: "acc-personal",
    name: "Personal",
    provider: "anthropic",
    signedIn: false,
  },
  {
    id: "acc-studio",
    name: "Studio",
    provider: "openai",
    signedIn: true,
  },
  {
    id: "acc-research",
    name: "Research",
    provider: "google",
    signedIn: true,
  },
];

const computerOf = (row: Machine): Computer => ({
  id: row.machineId,
  name: row.hostname,
  online: row.status === "online",
  os: row.os,
});

export const FLEET: Computer[] = MACHINES.map(computerOf);

const ROLE = { checkout: "extra", hub: "builtin" } as const;

/** Each place of the project as a folder on the card, its home shortened to `~`. */
function foldersOf(project: ProjectRow, machines: Machine[]): Folder[] {
  return project.places.map((place) => {
    const host = machines.find((row) =>
      place.kind === "hub" ? row.hostsHub : row.machineId === place.machineId
    );
    const home = host?.home;
    return {
      id: place.id,
      machine: host
        ? computerOf(host)
        : { id: place.machineId, name: place.machineId, online: false, os: "" },
      path:
        home && place.path.startsWith(`${home}/`)
          ? `~${place.path.slice(home.length)}`
          : place.path,
      missing: false,
      locateTo: null,
      readAt: null,
      role: place.isPrimary ? "main" : ROLE[place.kind],
    };
  });
}

export const BIG_FILE_SIGN_INS: SignIn[] = [
  {
    id: "lfs-acme",
    name: "acme files key",
    account: "deploy@acme on files.acme.dev",
  },
  {
    id: "lfs-studio",
    name: "Studio storage",
    account: "sam on storage.studio.example",
  },
];

/** What the person meets when they open the card. */
const SITUATIONS = [
  "all-well",
  "reading",
  "main-missing",
  "extra-missing",
  "computer-away",
  "locate-waiting",
  "signed-out",
  "tasks-refused",
  "moving",
  "unreachable",
  "read-failed",
  "no-code",
] as const;
export type Situation = (typeof SITUATIONS)[number];

/** The card's facts in a situation, from the records above. */
export function detailsOf(situation: Situation): Details {
  const folders = foldersOf(PROJECT, MACHINES);
  const base: Details = {
    hub: { reachable: true },
    folders: { state: "read", value: folders },
    ai: {
      state: "read",
      value: {
        accounts: ACCOUNTS,
        chosen: PROJECT.account,
        atLimit: PROJECT.accountAtLimit,
      },
    },
    hasCode: true,
    finished: { state: "read", value: PROJECT.lands },
    tasks: { state: "read", value: taskListOf(TRACKER) },
    codebases: codebasesOf(PROJECT.links),
    bigFiles: { state: "read", value: { mode: "defaults" } },
    bigFileSignIns: BIG_FILE_SIGN_INS,
    running: null,
  };
  const withFolders = (map: (folder: Folder) => Folder): Details => ({
    ...base,
    folders: { state: "read", value: folders.map(map) },
  });
  switch (situation) {
    case "all-well":
      return base;
    case "reading":
      return {
        ...base,
        folders: { state: "reading" },
        ai: { state: "reading" },
        finished: { state: "reading" },
        tasks: { state: "reading" },
      };
    case "main-missing":
      return withFolders((f) =>
        f.role === "main" ? { ...f, missing: true } : f
      );
    case "extra-missing":
      return withFolders((f) =>
        f.role === "extra" ? { ...f, missing: true } : f
      );
    case "computer-away":
      return withFolders((f) =>
        f.role === "extra"
          ? { ...f, machine: { ...f.machine, online: false }, readAt: "14:02" }
          : f
      );
    case "locate-waiting":
      return withFolders((f) =>
        f.role === "extra"
          ? {
              ...f,
              machine: { ...f.machine, online: false },
              missing: true,
              locateTo: "~/Work/Clients/Hyucksfield/hyucksfield-site",
              readAt: "14:02",
            }
          : f
      );
    case "signed-out":
      return {
        ...base,
        ai: {
          state: "read",
          value: {
            accounts: ACCOUNTS.map((a) =>
              a.id === "acc-work" ? { ...a, signedIn: false } : a
            ),
            chosen: "acc-work",
            atLimit: "wait",
          },
        },
      };
    case "tasks-refused":
      return {
        ...base,
        tasks: {
          state: "read",
          value: taskListOf({
            ...TRACKER,
            binding: TRACKER.binding && {
              ...TRACKER.binding,
              state: "refused",
              reason:
                "Resource not accessible by integration. The acme-bot app lost access to acme/hyucksfield on Nov 18.",
            },
          }),
        },
      };
    case "moving":
      return {
        ...base,
        running: { folderId: "pl-main", says: "Moving files to studio-mac" },
      };
    case "unreachable":
      return {
        ...base,
        hub: { reachable: false, host: "obelisk", readAt: "14:02" },
      };
    case "read-failed": {
      const tasks = taskListOf(TRACKER);
      return {
        ...base,
        tasks: {
          state: "read",
          value:
            tasks.kind === "here"
              ? tasks
              : {
                  ...tasks,
                  standing: {
                    state: "failed",
                    reason: "GitHub didn't answer within 10 s (timeout).",
                  },
                },
        },
      };
    }
    case "no-code":
      return {
        ...base,
        folders: {
          state: "read",
          value: folders.filter((f) => f.role === "builtin"),
        },
        ai: {
          state: "read",
          value: {
            accounts: ACCOUNTS.map((a) => ({ ...a, signedIn: false })),
            chosen: null,
            atLimit: "wait",
          },
        },
        hasCode: false,
        tasks: { state: "read", value: { kind: "here" } },
        codebases: [],
      };
    default:
      return base;
  }
}

/** The agents working in the Main folder now. */
export const AGENTS_HERE: AgentHere[] = [
  {
    id: "s-rounding",
    name: "Fix the checkout total rounding",
    replying: true,
    carry: { way: "same", why: null, tool: "Claude Code" },
  },
  {
    id: "s-launch",
    name: "Draft the launch post for the rebrand",
    replying: false,
    carry: {
      way: "summary",
      why: "studio-mac doesn't run OpenCode, so it continues from a summary",
      tool: "Claude Code",
    },
  },
  {
    id: "s-caw",
    name: "Caw's conversation about hyucksfield",
    replying: false,
    carry: { way: "same", why: null, tool: "Claude Code" },
  },
];

/** What will happen, for each act, once a computer and a folder are named. */
export function forecastFor(
  act: FolderAct,
  machineName: string,
  path: string,
  sameComputer: boolean
): Forecast {
  if (path.includes(".cawco/tmp") || path.startsWith("/tmp")) {
    return {
      state: "blocked",
      why: `${path} is a session's scratch folder on ${machineName}, removed when that session ends.`,
      todo: `Name a folder of your own on ${machineName}, such as ~/code/clients/hyucksfield.`,
    };
  }
  switch (act) {
    case "move":
      return {
        state: "ready",
        lines: [
          sameComputer
            ? folderMoveWords.renames(path)
            : folderMoveWords.copies(
                { files: 8310, bytes: 2_100_000_000, whole: true },
                path,
                machineName
              ),
          folderMoveWords.everything,
          folderMoveWords.inner("design-kit"),
          folderMoveWords.outer("client-work"),
          folderMoveWords.links(12),
        ],
      };
    case "locate":
      return {
        state: "ready",
        lines: [
          locateLines.pointed(path, machineName),
          locateLines.oldStays("~/code/clients/hyucksfield-old"),
          locateLines.conversations(2),
          locateLines.placed,
        ],
      };
    case "connect":
      return {
        state: "ready",
        lines: stepWords.connectLines(path, machineName),
      };
    case "copy":
      return {
        state: "ready",
        lines: [
          `Copies the saved code at a41c9e2 to ${path} on ${machineName}.`,
          "3 password files (.env, .env.local, keys/deploy.pem) and 1,940 files left out of the code's history stay behind.",
          "The original is untouched.",
        ],
      };
  }
}

/** Connect existing folder on a folder whose codebase another project already has: the ask, naming both. */
export const connectJoins = (machineName: string, path: string): Forecast => ({
  state: "ready",
  lines: [
    ...stepWords.connectLines(path, machineName),
    foldWords.line("hyucksfield-site", "hyucksfield", "hyucksfield-site"),
  ],
});

/** What Locate folder can tell of the folder named. */
export const LOCATE_TELL = `${locateTells.sameCodebase} ${locateTells.sameFolder("~/code/clients/hyucksfield-old")} ${locateTells.placed}`;

/** A move across computers with an agent continuing from a summary: its summary is written before the old folder goes. */
const MOVE_STAGES = [
  folderMoveWords.stages.quiet,
  folderMoveWords.stages.copy,
  folderMoveWords.stages.check,
  folderMoveWords.stages.summarise,
  folderMoveWords.stages.remove,
  folderMoveWords.stages.resume,
];

export const runAt = (at: number): RunView => ({
  stages: MOVE_STAGES,
  at,
  progress: at === 1 ? "1,204 of 8,310 files · 310 MB of 2.1 GB" : null,
  callOff: at < 3,
  waitingFor: null,
  failed: null,
});

export const MOVE_AFTER: AfterView = {
  checked:
    "8,310 files, 2.1 GB, checked on studio-mac. The code stands at a41c9e2.",
  agents: [
    { name: "Fix the checkout total rounding", resumed: true, why: null },
    {
      name: "Draft the launch post for the rebrand",
      resumed: true,
      why: folderMoveWords.resumedSummary("Claude Code"),
    },
    { name: "Caw's conversation about hyucksfield", resumed: true, why: null },
  ],
  leftBehind: [
    {
      name: "~/code/clients/hyucksfield/.next/cache",
      why: folderMoveWords.left({
        path: "/home/sam/code/clients/hyucksfield/.next/cache",
        why: "busy",
        words: "EBUSY: resource busy or locked",
      }),
    },
  ],
  ended: [
    "A background command on obelisk: bun run dev",
    "A wake-up set for 16:00 by Fix the checkout total rounding",
  ],
};

export const TASK_SIGN_INS: Record<"github" | "linear", SignIn[]> = {
  github: [
    {
      id: "gh-acme",
      name: "acme-bot",
      account: "GitHub app installed on acme",
    },
    { id: "gh-token", name: "Sam's token", account: "sam-k on GitHub" },
  ],
  linear: [
    {
      id: "ln-acme",
      name: "Linear for acme",
      account: "sam@acme.dev on Linear",
    },
  ],
};

export const TASK_TARGETS = {
  github: [
    { id: "acme/hyucksfield", name: "acme/hyucksfield", own: true },
    { id: "acme/hyucksfield-api", name: "acme/hyucksfield-api", own: false },
    { id: "acme/brand-site", name: "acme/brand-site", own: false },
    { id: "acme/infra", name: "acme/infra", own: false },
    { id: "acme/design-kit", name: "acme/design-kit", own: false },
  ],
  linear: [
    { id: "HYF", name: "HYF · Hyucksfield", own: true },
    { id: "ENG", name: "ENG · Engineering", own: false },
    { id: "DES", name: "DES · Design", own: false },
  ],
};

const COLUMNS = ["Todo", "In progress", "In review", "Done"].map((name) => ({
  id: `opt-${name.toLowerCase().replaceAll(" ", "-")}`,
  name,
}));

export const BOARDS: Board[] = [
  { id: "PVT_roadmap", name: "Roadmap", columns: COLUMNS },
  { id: "PVT_sprint", name: "Sprint board", columns: [] },
];

export const STAGES = ["Brief", "Building", "Review", "Done"];
