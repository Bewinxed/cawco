/**
 * What a session start says: the New session form (its title and Start, the
 * permission modes' names and the mode chip, the Full Send confirmation, a
 * move's Start), which the dashboard renders from here, and what the hub
 * logs of a start it refused (hub server.ts). The app
 * draws none of it, so it is not written into it (scripts/words-swift.ts).
 */

import type { OfferedMode } from "../harness/modes";
import { configurePage } from "./configure";

/** The mode chip's name, before the mode it names. */
const PERMISSION_MODE = "Permission mode:";

export const spawnWords = {
  /** Opens every line the hub logs of a start it refused. */
  refused: "[hub] refused spawn",
  /** One refused start, in the refusal's own words. */
  refusedLine: (refusal: string) => `${spawnWords.refused}: ${refusal}`,
  /**
   * A start refused on its machine because the project checkout it runs in
   * has no folder there (agent session.ts `workdirFor`): moved or removed by
   * hand, never made again empty.
   */
  placeMissing: (path: string) =>
    `The project's folder ${path} is missing, so the session didn't start. Put the folder back there, or start in another folder.`,
  /**
   * A start refused because its project's starting-set file does not read
   * (hub server.ts `startingSetOf`), to the agent or person who asked: it
   * never starts with everything for a file the hub could not read.
   */
  startingSetUnread: (project: string, file: string, problems: string[]) =>
    `Not started: ${project}'s ${file}, which names the skills and MCP servers its sessions start with, does not read, so the hub cannot tell what this session may load. ${problems.join(" ")} Fix it in the project's folder (or with project_settings' set_starting_set), then start it again.`,
  /**
   * A start refused because its task file's `accounts:` line does not read
   * whole (hub spawns.ts `taskAccounts`), to the agent or person who asked:
   * what of the line reads is not the allow-list it meant, and a list left
   * with none would read as every account. `why` is the reader's sentences,
   * quoted from the line.
   */
  taskAccountsUnread: (path: string, why: string) =>
    `Not started: ${path} has an accounts line that does not read, so the hub cannot tell which accounts this session may run on, and it places it on none. ${why} Fix the line in the task's file, then start it again.`,
  /**
   * A start refused on a model its harness does not list (hub server.ts
   * `modelRefusal`), to the agent or person who asked: the harness by name
   * (`harness`, core `harnessName`), the model ids it does list, and
   * how many more.
   */
  unlistedModel: {
    words: (
      harness: string,
      machine: string,
      model: string,
      listed: readonly string[],
      more: number
    ) =>
      `${harness} on ${machine} does not run ${model}. It lists ${listed.join(", ")}${more > 0 ? `, and ${more} more` : ""}.`,
    /** A model from a provider the harness lists nothing from. */
    noProvider: (
      harness: string,
      machine: string,
      model: string,
      provider: string
    ) =>
      `${harness} on ${machine} has no sign-in or key for ${provider}, so it cannot run ${model}.`,
    /** The harness there has read its models and lists none. */
    noneListed: (harness: string, machine: string, model: string) =>
      `${harness} on ${machine} lists no models, so it cannot run ${model}.`,
    /**
     * The harness there has not listed its models yet (a fresh install, a
     * read that failed: `why`, the machine's words), so a model can't be
     * judged and nothing starts on one.
     */
    unread: (
      harness: string,
      machine: string,
      model: string,
      why: string | undefined
    ) =>
      `${harness} on ${machine} hasn't listed its models yet, so nothing starts on ${model} there.${why ? ` ${why}` : ""} Start it again once its models are listed.`,
    /** Added when the model asked for is a harness's name. */
    harnessNamed: (model: string) =>
      `${model} is a harness, not a model. Choose it as the harness.`,
  },
  /**
   * A start that picks no model (none, or `default`), as the hub names its
   * model before anything spawns (hub start-models.ts): the harness's own
   * default when an account can take it, else the next model the harness
   * lists that one can. With none, the start is refused in these words: the
   * harness, each account and why it can't take the start, and what would
   * let it.
   */
  startModel: {
    /** Why one account can't take the start now, after its name and "is". */
    signedOut: (machine: string) => `signed out on ${machine}`,
    notAllowed: (by: "project" | "task") =>
      `left out by the ${by}'s account list`,
    benched: "benched",
    /** Its provider refused it for want of credit: "out of credit for opencode since 23:41". */
    outOfCredit: (provider: string, since: string) =>
      `out of credit for ${provider} since ${since}`,
    /**
     * An account's row in Configure › Accounts while a provider has refused
     * it for want of credit, above its Check again, which acknowledges a
     * top-up.
     */
    creditProblem: (provider: string, since: string) =>
      `Out of credit for ${provider} since ${since}. A model CawCo picks keeps off it until a turn on ${provider} is answered; top it up, then press Check again.`,
    /**
     * Its provider refused the account the use of a model: "opencode/claude-fable-5
     * is not enabled for team@acme.dev since 23:41". A whole reason, its own
     * subject the model.
     */
    notEnabled: (model: string, account: string, since: string) =>
      `${model} is not enabled for ${account} since ${since}`,
    /** The same, in placement's note of the accounts a start kept off. */
    notEnabledNote: (model: string, account: string) =>
      `${model} is not enabled for ${account}`,
    /**
     * An account's row in Configure › Accounts while a provider refuses it
     * a model (`refused`, as {@link notEnabled} says it), above its Check
     * again, which acknowledges the model was enabled.
     */
    accessProblem: (refused: string, model: string) =>
      `${refused}. A model CawCo picks passes it over on this account until a turn on ${model} is answered; enable it with its provider, then press Check again.`,
    /** When a mark began: its clock time today, else its day and time ("2 Oct 23:41"). */
    since: (day: string | null, clock: string) =>
      day ? `${day} ${clock}` : clock,
    /** `window` names the window whose floor it is ("5-hour", "weekly"); both floors are percents of different windows. */
    pastReserve: (percent: number, window?: string) =>
      `past its ${percent}% ${window ? `${window} ` : ""}reserve`,
    atLimit: "at its limit",
    /** At its limit, with its extra usage off for `reason` (Claude Code's words: "out of credits"). */
    noCredit: (reason: string) =>
      `at its limit, with its extra usage off (${reason})`,
    /** A moment ahead: "in 5d 19h (19:30)". */
    at: (span: string, clock: string) => `in ${span} (${clock})`,
    /** When it takes sessions again: "back in 5d 19h (19:30)". */
    back: (at: string) => `back ${at}`,
    /** One account and why: "bewinxed@gmail.com is benched, back in 5d 19h (19:30)". */
    account: (name: string, why: string, back: string | null) =>
      `${name} is ${why}${back ? `, ${back}` : ""}`,
    /** One provider's accounts: "ChatGPT: bewinxed@gmail.com is benched, back in 5d 19h (19:30)." */
    provider: (provider: string, accounts: readonly string[]) =>
      `${provider}: ${accounts.join("; ")}.`,
    /**
     * The models it lists that run on no CawCo account: its own default
     * (`own`) when that is one, and how many `more`. Only a pick starts one,
     * from the machine's own store.
     */
    unaccounted: (own: string | null, more: number) => {
      const others = `${more} ${more === 1 ? "model" : "models"}`;
      if (own === null) {
        return `${others} it lists ${more === 1 ? "runs" : "run"} on no CawCo account, so only a pick starts ${more === 1 ? "it" : "one"}.`;
      }
      return more === 0
        ? `Its own default, ${own}, runs on no CawCo account, so only a pick starts it.`
        : `Its own default, ${own}, and ${more} more ${more === 1 ? "model" : "models"} run on no CawCo account, so only a pick starts one.`;
    },
    /** No model the harness lists there can start now. `first`: when the soonest account is back ("in 5d 19h (19:30)"). */
    refused: (
      harness: string,
      machine: string,
      reasons: readonly string[],
      first: string | null
    ) =>
      [
        `No ${harness} model on ${machine} can start now: none was picked, and no account can take one it lists.`,
        ...reasons,
        `Pick a model, sign in another account or top one up in ${configurePage("accounts")}${first ? `, or start it again ${first}` : ""}. Nothing was started.`,
      ].join(" "),
    /** The harness there has not listed its models yet (`why`, the machine's words), so none can be named. */
    unread: (harness: string, machine: string, why: string | undefined) =>
      `${harness} on ${machine} hasn't listed its models yet, so a start that picks none has none to run.${why ? ` ${why}` : ""} Pick a model, or start it again once its models are listed. Nothing was started.`,
    /** The harness there lists no models, and names no default of its own. */
    noneListed: (harness: string, machine: string) =>
      `${harness} on ${machine} lists no models, so a start that picks none has none to run. Sign an account in to it in ${configurePage("accounts")}. Nothing was started.`,
    /**
     * A session that stays on its account (`account`), whose start picked
     * no model, where a provider refused the account every model of it the
     * harness lists: for want of credit, or a model not enabled for it
     * (`reasons`, each a whole reason: "team@acme.dev is out of credit for
     * opencode since 23:41", {@link notEnabled}).
     */
    heldRefused: (
      session: string,
      account: string,
      reasons: readonly string[],
      harness: string,
      machine: string
    ) =>
      `${session} runs on ${account}, and its provider refused it every model ${harness} on ${machine} lists for it: ${reasons.join("; ")}. Pick a model for it, or top the account up or enable the model, then press Check again in ${configurePage("accounts")}. Nothing was started.`,
    /**
     * A session that stays on its account (`account`), whose start picked
     * no model, where the harness lists none that account runs.
     */
    heldUnlisted: (
      session: string,
      account: string,
      harness: string,
      machine: string
    ) =>
      `${session} runs on ${account}, and ${harness} on ${machine} lists no model that account runs. Pick a model for it, then start it again. Nothing was started.`,
    /**
     * A launch that reached a machine naming no model, refused there before
     * its harness starts (agent session.ts): the hub names every launch's
     * model, and a harness never runs on a default of its own.
     */
    unnamedAtMachine:
      "This launch names no model, and a harness here never picks its own: the hub names every launch's model. Nothing was started.",
    /** The hub's line as it names the model a start picked none of. */
    namedLine: (instanceId: string, model: string, why: string) =>
      `[hub] ${instanceId} starts on ${model}: ${why}`,
    /** Why that model, in the line: the harness's own default, or the first after it an account can take. */
    ownDefault: "its harness's own default",
    nextListed: (own: string | null) =>
      own
        ? `the first model its harness lists that an account can take, since no account can take its own default ${own}`
        : "the first model its harness lists that an account can take",
    /**
     * A refused first turn on a model the hub chose goes on to its next pick
     * (hub start-model-moves.ts): the session's line where it moves, and
     * the hub's log of it. `refused`, the provider's refusal as a whole
     * reason ("opencode/claude-fable-5 is not enabled for go-key since
     * 03:12").
     */
    nextPick: (refused: string, model: string, account: string) =>
      `${refused}; trying ${model} on ${account}.`,
    /** What the session reads as it goes on there: its last turn's message, which it answers now. */
    carryOn: (model: string) =>
      `Your provider refused the model your last turn ran on, so this session now runs on ${model}. Answer the message that turn was asked.`,
    /** In placement's words for a start, a model and account a refused first turn already ran on. */
    tried: (model: string, account: string) =>
      `${model} on ${account} already refused this session's first turn`,
    /**
     * A refused first turn with no next pick left: each refusal it met
     * (`refused`, as {@link nextPick} takes one), then why no other model
     * runs (`noneLeft`, {@link refused}'s words).
     */
    noPickLeft: (refused: readonly string[], noneLeft: string) =>
      `Its first turn was refused on every model tried: ${refused.join("; ")}. ${noneLeft}`,
  },
  /** Between a session and the account its launch places it on, in the line the hub logs of it. */
  launchesOn: "launches on",
  /** The hub's line as a launch places a Claude session that ran on no account (server.ts `placeForLaunch`). */
  launchesOnLine: (instanceId: string, accountId: string, why: string) =>
    `[hub] ${instanceId} ${spawnWords.launchesOn} ${accountId} (${why}); its row says so once its conversation is there`,
  /** Each permission mode's name (the dashboard's permission-modes.ts says what each does). */
  modes: {
    default: "Ask first",
    plan: "Plan first",
    acceptEdits: "Accept edits",
    bypassPermissions: "Bypass",
    fullSend: "Full Send",
  } satisfies Record<OfferedMode, string>,
  /** The model picker's search field, by its accessible name. */
  searchModels: "Search models",
  /** The mode chip while no mode is picked: Start waits on one. */
  unchosenMode: "Choose a mode",
  /**
   * A start that names no permission mode, refused before anything starts
   * (hub server.ts `settleMode`): the harness and the machine by name.
   */
  /** A start named a permission mode CawCo has no word for at all. */
  modeUnknown: (mode: string) => `"${mode}" is not a permission mode.`,
  modeUnchosen: (harness: string, machine: string) =>
    `A permission mode must be chosen for the ${harness} session on ${machine}, and none was. Choose one, then start it again. Nothing was started.`,
  /**
   * Why Start is held, beside it (PRODUCT.md: a control that can't act is
   * disabled with the reason stated), for what nothing else on the form says.
   */
  held: {
    machine: "Choose a machine to run this session on.",
    mode: "Choose a permission mode to start.",
    repo: "Choose a repository, or paste its git URL.",
    uploading: "Wait for your file to finish uploading.",
  },
  /** The mode chip's accessible name: "Permission mode: Ask first". */
  permissionModeHead: PERMISSION_MODE,
  permissionMode: (mode: string) => `${PERMISSION_MODE} ${mode}`,
  /** The form's title. */
  forkSession: "Fork session",
  continueSession: "Continue session",
  /** Its Start, and a Start that moves the project to the machine first. */
  startSession: "Start session",
  moveAndStart: "Move & start",
  moveIt: "Move it",
  /** A move's approval's no (MoveWait, the hub's parked ask). */
  dontMove: "Don't move",
  /** The prompt's label, and a continuation's. */
  firstPrompt: "First prompt",
  nextStep: "Next step (optional)",
  /** A continuation's size: what the session holds now, before what it carries. */
  currentContext: "Current context",
  /** The warning while Full Send is the mode picked. */
  fullSendOn: "Full Send is on",
  fullSendCarried: "Full Send is on, from your last start",
  /** The confirmation a switch to Full Send asks first. */
  switchToFullSendTitle: "Switch to Full Send?",
  switchToFullSend: "Switch to Full Send",
  /** The Full Send switch's button while it applies. */
  switching: "Switching…",
  /** The permission picker's accessible name. */
  permissionModes: "Permission mode",

  /** The form's own controls: its head, its footer, its steps. */
  form: {
    back: "Back",
    close: "Close",
    cancel: "Cancel",
    /** Start while its work runs. */
    starting: "Starting…",
    /** Start on a continuation and on a fork. */
    continue: "Continue",
    fork: "Fork",
    startMany: (count: number) => `Start ${count} sessions`,
    /** The reading line while a machine is read, and Start while the folder is. */
    reading: "Reading…",
    checkingFolder: "Checking the folder…",
    notUploaded: "A file couldn't upload. Tap it to try again, or remove it.",
    hubUnreachable:
      "No spawn while the hub is unreachable. Reconnect to continue.",
    machineOffline: (machine: string) =>
      `${machine} is offline. Pick another machine, or start when it returns.`,
    dirUnreadable: (machine: string) =>
      `That directory can't be read on ${machine}. Check the path and try again.`,
    folderMissing: (machines: string) =>
      `Folder missing. Start creates it on ${machines}.`,
    /** The folder is a project checkout's that has gone (hub launches.ts `placeHolding`): a start there is refused. */
    placeMissing: (machines: string) =>
      `The project's folder is missing on ${machines}. Put it back there, or pick another folder.`,
    enterDirectory: "Enter the directory this session should work in.",
    /** What a machine that didn't answer leaves unknown (`didntAnswer`). */
    folderUnknown: "whether the folder is there is not known",
    startUnknown: "whether the session started is not known",
    forkUnknown: "whether the fork started is not known",
    forkWhere: (harness: string, machine: string, folder: string) =>
      `A fork runs where its session ran: ${harness} on ${machine}, in ${folder}.`,
    forkNeedsMode: "Choose a permission mode for the fork.",
    moveChanged:
      "The move changed before it started. Open it and start it again.",
    /**
     * A session row held for a project move whose record does not read
     * (hub moves.ts `resume`): the move goes no further and its session
     * never starts. Its error's words, on the row.
     */
    moveUnread:
      "Its project move doesn't read from its record, so the move stopped here and this session never starts. Remove it to clear it.",
    /** A move's reading: what Move & start does first, to the project or (several) the folder it takes. */
    moveReading: (what: string, machine: string, work: string, size: string) =>
      `${what} isn't on ${machine} yet. ${spawnWords.moveAndStart} clones it there first${work}${size}.`,
    /** The choice of which of the project's folders a move takes, when it has several. */
    moveFrom: "Move from",
    /** One folder of the Move from choice. */
    moveFromFolder: (folder: string, machine: string) =>
      `${folder} on ${machine}`,
    moveWork: (machine: string) => `, with your uncommitted work on ${machine}`,
    /** A continuation's project, named rather than picked. */
    startsIn: (project: string) => `Starts in ${project}`,
    startsInWhy: (project: string) =>
      `The new session starts in ${project}, the project of the session it continues`,
    /** What a continuation opens on, and its sizing while it is read. */
    opensOn: "What the new session opens on",
    fromSummary: "From a summary",
    fromAsks: "From my asks",
    readingContext: "Reading the session's context…",
    yourMessages: (count: number) =>
      `your ${count} message${count === 1 ? "" : "s"}`,
    toSummarise: "to summarise",
    summariseWith: "Summarise with",
    continueOn: "Continue on",
    model: "Model",
    /** The @ and / menu's kinds. */
    kinds: {
      machine: "Machine",
      project: "Project",
      skill: "Skill",
      command: "Command",
    },
    insert: "Insert",
    noMatches: "No matches",
    /** The prompt's placeholder, and its keys beside it. */
    promptPlaceholder: "What should the agent do first?",
    promptKeys: "@ machine or project · / skills and plugins",
  },

  /** The account chip. */
  account: {
    name: "Account",
    chip: (account: string) => `Account: ${account}`,
    auto: "Auto",
    noReading: "no reading yet",
    atLimit: "at its limit, back in ",
    neverBackup: "never a backup, only when picked",
    left: (percent: number) => `${percent}% left`,
    /** After `left`, the binding window by its noun ("5 hours", "week", "Fable week"): " of its week". */
    ofWindow: (name: string) => ` of its ${name}`,
    ofWindowResets: (name: string, when: string) =>
      ` of its ${name}, resets in ${when}`,
  },

  /** The effort chip and its scale. */
  effort: {
    name: "Effort",
    chip: (level: string) => `Effort: ${level}`,
    default: "Default",
    none: "No effort",
    noneWhy: "This model has no effort setting",
    notExposed: "Effort n/a",
    notExposedWhy: (harness: string) => `${harness} doesn't expose effort`,
  },

  /** The lifetime chip. */
  lifetime: {
    chip: (name: string) => `Session lifetime: ${name}`,
    persistent: "Persistent",
    persistentDesc: "Stays on the board after its task, to pick up again.",
    ephemeral: "Ephemeral",
    ephemeralDesc: "A spin-off: ends and clears itself when the task is done.",
  },

  /** The context chip: start with the instruction context, or clean (core `SpawnPayload.clean`). */
  context: {
    chip: (name: string) => `Context: ${name}`,
    full: "Full context",
    fullDesc:
      "Its instruction files, memory, skills and hooks, as every session.",
    clean: "Clean",
    cleanDesc:
      "Starts without instructions, memory or skills: its prompt and CawCo's tools alone.",
    /** The session's own mark, where its other start facts show. */
    mark: "Clean start",
  },

  /** The machines chip and its rows. */
  machines: {
    chip: (machines: string) => `Machines: ${machines}`,
    select: "Select machine",
    count: (count: number) => `${count} machines`,
    offline: "Offline",
    idle: "Idle",
    running: (count: number) => `${count} session${count === 1 ? "" : "s"}`,
    willClone: "will clone",
    willCloneSized: (size: string) => `will clone · ${size}`,
    noneCheckedIn: "No machines have checked in.",
    connect: "Connect a machine…",
  },

  /** The project chip and its new-project fields. */
  project: {
    chip: (project: string) => `Project: ${project}`,
    none: "No project",
    clear: "Clear project",
    name: "Project name",
    path: "Project path",
    pathPlaceholder: "/path/to/project",
    create: "Create",
    creating: "Creating…",
    new: "New project…",
  },

  /** The location chip, its repository picker and its folder browser. */
  location: {
    name: "Location",
    chip: (location: string) => `Location: ${location}`,
    chooseFolder: "Choose folder",
    chooseRepo: "Choose a repository",
    /** The switch between cloning a repository and working in a folder. */
    source: "Location source",
    repository: "Repository",
    folder: "Folder",
    /** The path box's label, by the switch. */
    cloneInto: "Clone into",
    workIn: "Work in",
    directoryPlaceholder: "~/code/project",
    fromProject: "From project",
    override: "Override",
    browse: "Browse",
    close: "Close",
    parentFolder: "Parent folder",
    loadingFolders: "Loading folders…",
    noSubfolders: "No subfolders",
    useFolder: "Use this folder",
    gitRepository: "git repository",
    listingMissed: "the folder's listing didn't come back",
    /** The repository picker: its search, its owners, its list. */
    search: "Search repositories or paste a git URL",
    owners: "Owner",
    allOwners: "All",
    repositories: "Repositories",
    private: "Private",
    loadingRepos: "Reading repositories…",
    reposMissed: "the repositories didn't come back",
    noMatch: (query: string) =>
      `No repository matches “${query}”. Paste a git URL to clone any other.`,
    noRepos: "No repositories on GitHub yet. Paste a git URL to clone one.",
    noGh: (machine: string) =>
      `gh isn't installed on ${machine}. Paste a git URL, or install gh to list your repositories.`,
    signedOut: (machine: string) =>
      `gh isn't signed in on ${machine}. Run \`gh auth login\` there, or paste a git URL.`,
    oldDaemon: (machine: string) =>
      `CawCo on ${machine} is too old to list repositories. Update it (Configure › Updates), or paste a git URL.`,
    /** A pasted URL's host, before its `owner/name`, where the host is not GitHub. */
    onHost: (host: string) => `${host} · `,
    /** A pasted GitHub URL where the machine's gh sees no repository. */
    notOnGithub: (machine: string) =>
      `GitHub has no repository here that gh can see. Cloning uses ${machine}'s git credentials.`,
    /** What happens once the session starts, under the path box. */
    clones: (repo: string, target: string, machine: string) =>
      `Clones ${repo} into ${target} on ${machine}.`,
    usesClone: (target: string, machine: string) =>
      `Uses the clone already at ${target} on ${machine}.`,
    holdsOther: (target: string, machine: string) =>
      `${target} on ${machine} holds another folder. Clone into another folder.`,
    folderMissing: (path: string, machine: string) =>
      `${path} isn't on ${machine}.`,
  },

  /** The model picker. */
  model: {
    harness: "Harness",
    notInstalledOn: (machine: string) => `Not installed on ${machine}`,
    notInstalled: "not installed",
    search: "Search or paste a model id…",
    clear: "Clear",
    list: (harness: string) => `${harness} models`,
    custom: "Use custom model id",
    enter: "↵ Enter",
    noMatch: (harness: string, query: string) =>
      `No ${harness} models match "${query}"`,
    noneReported: (harness: string) => `No ${harness} models reported yet`,
  },

  /** The rows of starts the form left running (spawn/parked). */
  starting: {
    name: "Starting",
    startedOn: (machine: string) => `Started on ${machine}`,
    couldntStart: "Couldn't start",
    couldntContinue: "Couldn't continue",
    couldntContinueWhy: (error: string) => `Couldn't continue: ${error}`,
    couldntContinueAgain: "Couldn't continue. Open it to start it again.",
    continueTitle: (title: string) => `Continue ${title}`,
    dismiss: "Dismiss",
    dismissNamed: (title: string) => `Dismiss ${title}`,
    reopen: "Reopen",
    continuationGone:
      "The continuation isn't on the hub any more, so how it ended isn't known. Check the session it continued, then continue it again if no new session started.",
    reloadedBeforeAsk:
      "Nothing started: the page reloaded before the session was asked for. Open it and start it again; your prompt and picks are kept.",
    reloadedUnknown:
      "Whether it started isn't known: the page reloaded before the hub answered. Check your sessions, then open it and start it again if it isn't there.",
    reloadedNotListed:
      "The session didn't start: the page reloaded before the hub answered, and the board never listed it. Open it and start it again; your prompt and picks are kept.",
    reloadedPartly: (started: number, asked: number) =>
      `${started} of ${asked} sessions started: the page reloaded before the rest were asked for. Open it and start the rest again.`,
  },
};
