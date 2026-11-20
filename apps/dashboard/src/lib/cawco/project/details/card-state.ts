/**
 * The card's facts as they start, and the hub's records read as the card
 * says them: shared by the card's tie to the hub (details-hub.svelte.ts)
 * and its states files' stand-ins.
 */
import type { TrackerView } from "@cawco/core/trackers";
import type {
  CardOpen,
  Codebase,
  FolderAct,
  FolderStepFacts,
  FolderStepState,
  Read,
  Standing,
  StepState,
  TaskList,
  TaskStepFacts,
} from "./details";

/** A time as the card says it: `14:02`. */
export const clock = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** A folder step before anything is named. */
export const noFolderFacts = (): FolderStepFacts => ({
  forecast: { state: "none" },
  agents: [],
  tell: null,
  phase: "edit",
  run: null,
  after: null,
  refused: null,
  sending: false,
});

/** The task list step while its sign-ins are read. */
export const noTaskFacts = (): TaskStepFacts => ({
  signIns: { state: "reading" },
  targets: { state: "reading" },
  boards: { state: "read", value: [] },
  stages: [],
  refused: null,
  starting: false,
});

/** The card with nothing open on it. */
export const closedCard = (): CardOpen => ({
  folder: null,
  disconnect: null,
  stopUpdating: false,
  bigDraft: { open: false, address: "", signIn: null },
});

/** The project's links (`github.com/acme/hyucksfield`) as the codebases it is connected to. */
export const codebasesOf = (links: string[]): Codebase[] =>
  links.map((link) => {
    const [host = "", ...rest] = link.split("/");
    return { host, name: rest.join("/"), url: `https://${link}` };
  });

/**
 * The task list as the hub's tie reads: kept only here, or tied to GitHub
 * or Linear with its facts; `standing` says how it stands where the card
 * knows better than the tie (a refresh asked, or refused).
 */
export function taskListOf(
  view: TrackerView,
  standing?: Read<Standing>
): TaskList {
  const { binding } = view;
  if (view.tracker === "cawco" || !binding) {
    return { kind: "here" };
  }
  let board: Extract<TaskList, { kind: "github" | "linear" }>["board"] = null;
  if (binding.githubProject) {
    board = {
      name: binding.githubProject.title,
      url: binding.githubProject.url,
    };
  } else if (binding.githubProjectReason) {
    board = { reason: binding.githubProjectReason };
  }
  let stands: Standing;
  if (binding.state === "refused") {
    stands = { state: "refused", words: binding.reason ?? "" };
  } else if (binding.state === "syncing" || binding.polledAt === null) {
    stands = { state: "first" };
  } else {
    stands = { state: "up-to-date", at: clock(binding.polledAt) };
  }
  return {
    kind: binding.provider,
    target: { name: binding.targetName, url: binding.targetUrl },
    linked: binding.linked,
    signIn: binding.connection,
    standing: standing ?? { state: "read", value: stands },
    board,
  };
}

/** A step left by Back, when the same act on the same folder opens again: it returns to it. */
export const parkedFor = (
  parked: StepState,
  act: FolderAct,
  folderId: string | null
): FolderStepState | null =>
  parked?.kind === "folder" &&
  parked.act === act &&
  parked.folderId === folderId
    ? parked
    : null;

/** The stand-ins' waits: each run once after its time, all stopped together when the story is set again. */
export class Timers {
  readonly #held = new Set<ReturnType<typeof setTimeout>>();

  after(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.#held.delete(timer);
      run();
    }, ms);
    this.#held.add(timer);
  }

  clear(): void {
    for (const timer of this.#held) {
      clearTimeout(timer);
    }
    this.#held.clear();
  }
}
