/**
 * What the "Home first, the morning briefing" prototype of a project says
 * (apps/dashboard/src/lib/prototypes/project/home-first/): Home's briefing,
 * the places it leads to (Tasks, Routines, Decisions, Outputs, Sessions,
 * Spend), the task and Caw panes, and the Configure sheet under More.
 *
 * A prototype's words, kept apart from the shipped surfaces' modules and not
 * written into the native app. "Outputs" is the working name of the place
 * that gathers what the project produced; the pick page asks for its name.
 */
export const homeFirstWords = {
  places: {
    home: "Home",
    tasks: "Tasks",
    routines: "Routines",
    decisions: "Decisions",
    outputs: "Outputs",
    sessions: "Sessions",
    spend: "Spend",
  },

  bar: {
    backHome: "Back to Home",
    projects: "Projects",
    more: "More",
    askCaw: "Ask Caw",
    addTask: "Add task",
    newRoutine: "New routine",
    spinOff: "Spin off a session",
    findChosen: "Find what was chosen",
  },

  /** More, in every place's bar: the rare acts, each opening Configure at its section. */
  more: {
    configure: "Set up or change how it runs",
    wiring: "Places and wiring",
    cap: "Spend cap",
    arrange: "Arrange Home",
    select: "Select tasks",
    askView: "Ask Caw for a view",
    forget: "Forget project…",
    remove: "Delete project…",
  },

  /** Home's groups, in reading order. */
  groups: {
    needs: "Needs you",
    working: "Working now",
    stages: "Stages",
    coming: "Coming up",
    outputs: "Outputs since you looked",
    decisions: "Decisions open",
    spend: "Spend today",
  },
  seeAll: "See all",
  /** A group's See all, read out with what it opens. */
  seeAllOf: (place: string) => `See all in ${place}`,

  /** The hub is not live: a count's place, and a kept row's mark. */
  staleSince: (at: string) => `stale since ${at}, hub unreachable`,
  staleRow: "Stale",
  /** One group's read failed while the rest stayed live. */
  readFailed: (at: string, why: string) =>
    `Couldn't read this since ${at} (${why}). The rows are the last good ones.`,
  retry: "Retry",

  caw: {
    name: "Caw",
    open: "Open conversation",
    status: {
      working: "Working",
      idle: "Idle",
      asks: "Needs you",
      off: "Off",
      unreachable: "Unreachable",
    },
  },

  needs: {
    kind: {
      review: (stage: string) => `Task in ${stage}`,
      failed: "Attempt failed",
      ask: "Session asks",
      picks: "Picks to send",
      action: "Approved action",
      browser: "Browser ask",
    },
    from: (source: string) => `from ${source}`,
    approve: "Approve",
    decline: "Decline",
    deny: "Deny",
    openTask: "Open task",
    tryAgain: "Try again",
    openAt: (question: number) => `Open at question ${question}`,
    sendPicks: (count: number) =>
      count === 1 ? "Send 1 pick" : `Send ${count} picks`,
    takeOver: "Take over the browser",
    notNow: "Not now",
    /** A row put back with Not now, at the foot. */
    later: "Later",
    none: "Nothing needs you.",
    waited: (age: string) => `waited ${age}`,
    picked: (picked: number, total: number) => `${picked} of ${total} picked`,
  },

  work: {
    state: {
      working: "Working",
      stuck: "Stuck",
      asks: "Needs you",
      queued: "Queued",
      failed: "Failed",
      done: "Done",
      stopped: "Stopped",
      idle: "Idle",
    },
    todos: (done: number, total: number) => `${done} of ${total} to-dos`,
    openSession: "Open its session",
    none: "Nothing is running.",
    caw: "Caw",
    spunOff: "Spun off",
  },

  stages: {
    archive: "Archive",
    /** A stage meant for the person, said beside its name. */
    yours: "your stage",
    openAt: (stage: string) => `Open the board at ${stage}`,
  },

  coming: {
    failedAt: (at: string) => `failed ${at}`,
    none: "Nothing is scheduled.",
    routine: "Routine",
    dated: "Dated task",
  },

  outputs: {
    none: "Nothing yet.",
    noneSince: (at: string) => `Nothing new since ${at}.`,
    isNew: "New",
    kinds: {
      post: "Post",
      markdown: "Markdown",
      picture: "Picture",
      media: "Video or audio",
      file: "File",
      preview: "Preview",
      canvas: "Canvas",
      choices: "Choice set",
    },
    groupBy: "Group",
    byTask: "By task",
    newest: "Newest",
    search: "Find an output",
    openFile: "Open file",
    openTask: "Open its task",
    alternates: (count: number) =>
      count === 1 ? "1 alternate" : `${count} alternates`,
    mediaPlan: "media plan",
    pins: (count: number) => (count === 1 ? "1 pin" : `${count} pins`),
    cannotServe: "The hub can't serve this file",
  },

  decisions: {
    none: "No decision waits on you.",
    noneYet: "None yet.",
    waits: "Waits on you",
    sent: "Sent",
    decided: "Decided",
    after: (name: string) => `after ${name}`,
    unlocks: (name: string) => `unlocks ${name}`,
    madeTasks: (count: number) =>
      count === 1 ? "made 1 task" : `made ${count} tasks`,
    makeTasks: "Make tasks",
    settledBy: (who: string) => `settled by ${who}`,
    openAt: (question: number) => `Open at question ${question}`,
    reverse: "Reverse",
  },

  spend: {
    of: (cap: string) => `of ${cap}`,
    today: "Today",
    month: "This month",
    atCap: "At the cap",
    reaching: "Reaching the cap",
    byWhat: "By what spent it",
    caw: "Caw",
    attempts: "Attempts",
    routines: "Routines",
    sessions: "Spun-off sessions",
    noneToday: "Nothing spent today.",
  },

  tasks: {
    views: {
      board: "Board",
      table: "Table",
      calendar: "Calendar",
      dependencies: "Dependencies",
    },
    viewIdle: {
      calendar: "No task has a date yet",
      dependencies: "No task waits on another yet",
    },
    filters: {
      all: "All",
      needs: "Needs you",
      working: "Working",
      stuck: "Stuck",
      save: "Save this narrowing",
    },
    search: "Find a task",
    chips: {
      label: "Label",
      stage: "Stage",
      type: "Delegate type",
    },
    composer: "New task title",
    composerHint: "Enter files it",
    composerStage: "Stage",
    file: "File task",
    archive: "Archive",
    stageEmpty: "Nothing here",
    stageFailed: (why: string) => `Couldn't read this stage (${why}).`,
    movesOff: "Moves wait for the hub. The board is the last good one.",
    columns: {
      task: "Task",
      stage: "Stage",
      type: "Type",
      todos: "To-dos",
      changed: "Changed",
    },
  },

  routines: {
    proposed: "Proposed",
    /** A run's outcome, beside its glyph. */
    outcome: { ok: "Ran", failed: "Failed", silent: "Silent" },
    proposedNone: "No action waits on you.",
    list: "Routines",
    columns: {
      routine: "Routine",
      schedule: "Runs",
      last: "Last run",
      next: "Next",
      source: "Fired by",
    },
    on: "On",
    off: "Off",
    expired: (on: string) => `expired ${on}`,
    sourceFailing: "failing",
    runNow: "Run now",
    pause: "Pause",
    change: "Change",
    remove: "Delete routine…",
    instruction: "Instruction",
    runs: "Recent runs",
    openRun: "Open the run's session",
    byHand: "By hand",
    viaCaw: "Ask Caw",
    firstRun: "A new routine runs once at once, as its test.",
    none: "No routine yet. Ask Caw for one, or make one by hand.",
    failedReason: (why: string) => `failed: ${why}`,
  },

  sessions: {
    caw: "Caw's conversations",
    attempts: "Attempts",
    spunOff: "Spun off",
    openTranscript: "Open transcript",
    stop: "Stop",
    form: {
      title: "Spin off a session",
      place: "Machine and checkout",
      harness: "Harness",
      type: "Delegate type",
      along: "Comes along",
      start: "Start session",
      skills: (count: number) => (count === 1 ? "1 skill" : `${count} skills`),
      servers: (count: number) =>
        count === 1 ? "1 MCP server" : `${count} MCP servers`,
    },
    none: "No session of this project is running.",
  },

  taskPane: {
    standIn: "The task, opened",
    standInLine:
      "Its insides are being designed on their own. This is where it opens, and its size.",
    close: "Close the task",
  },

  cawPane: {
    title: "Caw",
    close: "Close Caw",
    newConversation: "New conversation",
    openSession: "Open as its own session",
    events: "The project's events reach Caw",
    turnOff: "Turn Caw off",
    turnOn: "Turn Caw on",
    starters: "Starters",
    composer: "Tell Caw what to do next",
    send: "Send to Caw",
    off: "Caw is off. What you send waits until he is on.",
    unreachable:
      "Caw's machine isn't answering (obelisk-of-light, timeout). Your words stay here.",
    fresh:
      "A new conversation. Caw knows this project's files, tasks and notes.",
  },

  configure: {
    title: "Configure",
    close: "Close Configure",
    setup: "How it runs",
    setupLine:
      "Stages, delegate types, its place and routines, changed with Caw.",
    changeWithCaw: "Change with Caw",
    wiring: "Places and wiring",
    cap: "Spend cap",
    capPer: "per day",
    atCap: "At the cap",
    end: "Forget or delete",
    forget: "Forget project…",
    remove: "Delete project…",
    forgetAsk: (name: string) => `Forget ${name}?`,
    forgetLine:
      "Its files stay where they are; it leaves the rail. These stop first:",
    forgetVerb: "Stop them and forget",
    cancel: "Cancel",
    rows: {
      places: "Places",
      tracker: "Tasks live in",
      lands: "Work lands",
      checks: "Merge checks",
      decides: "Who decides",
      events: "Events reach Caw",
      account: "Account",
    },
  },

  empty: {
    starter: "Ask Caw to plan the project",
    starterLine:
      "Tell him what the project is for. He drafts the stages and the first tasks, and asks before he files them.",
    stagesNamed: "No task yet",
  },
} as const;
