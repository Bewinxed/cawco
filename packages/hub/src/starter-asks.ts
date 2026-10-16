/**
 * What a project's starters can be, written by the hub from what the project
 * holds now (project-starters.ts gathers it; jev-placement.ts `jevStarters`
 * asks Jev which). TypeSafe's System One answers noul, choice and score
 * only (https://docs.typesafe.ai/api.md: "Noul: A yes/no question",
 * "Choice: Picks one option from a set you define"), so the words are the
 * hub's: each thing in the project (a task, a thread, a commit, a failure,
 * an event source, a draft view) offers the asks that fit it now, each one
 * sentence the person would say to Caw with the thing's own title or name in
 * it, and Jev chooses one ask per thing, or none.
 *
 * Three places, each its own set (core `StarterPlace`):
 * - `board`: what to start with Caw, on the empty board and in his panel;
 * - `routines`: what to hand Caw as a routine, on the empty Routines page,
 *   from what the project repeats or waits on;
 * - `decisions`: what to lay out as a decision page, on the empty Decisions
 *   tab, from the project's open choices.
 *
 * Every input is cut to a stated length and count ({@link STARTER_BOUNDS})
 * before Jev is asked and before the inputs are hashed.
 */
import type {
  StageKind,
  StarterGlyph,
  StarterOutcome,
  StarterPlace,
  StarterSource,
} from "@cawco/core";

/**
 * Every input's bound, and the output's: each text cut to its length, each
 * list to its count.
 */
export const STARTER_BOUNDS = {
  name: 100,
  agents: 1500,
  knowledge: 20,
  path: 160,
  tasks: 12,
  title: 160,
  threads: 5,
  line: 200,
  commits: 5,
  subject: 120,
  failures: 5,
  failure: 200,
  /** Task kinds filed often, and the tasks each names. */
  recentKinds: 5,
  kindTasks: 3,
  kindName: 60,
  /** Event sources whose events reached no routine. */
  unrouted: 5,
  source: 120,
  eventKind: 40,
  drafts: 5,
  routines: 10,
  shown: 10,
  /** The output: at most this many starters per place, each `text` and `reason` at most this long. */
  starters: 6,
  text: 90,
  reason: 120,
} as const;

/** A task untouched this long in a stage of kind active reads as stuck. Our own call. */
export const STARTER_STALE_DAYS = 3;
/** How far back "filed often" and "events that reached no routine" look. Our own call. */
export const STARTER_RECENT_DAYS = 14;
/** A task kind filed at least this often in {@link STARTER_RECENT_DAYS} is a routine's work. Our own call. */
export const STARTER_OFTEN = 3;
/** How many design-shaped tasks the design-system starter names as its sources. */
const DESIGN_SOURCES_MAX = 3;
const AGENTS_PATH = "AGENTS.md";

/** One open task, as the starters read it. */
export interface StarterTask {
  /** It waits on tasks that are not done. */
  blocked: boolean;
  /** Days since its file last changed (a move is a change): how long it has sat where it is. */
  days: number;
  /** Its labels or outputs are design work (design-offers.ts `designShaped`). */
  design: boolean;
  /** How its newest attempt failed, when it did and it is not done since. */
  failed: string | null;
  id: string;
  kind: StageKind | null;
  stage: string;
  title: string;
  /** Its stage is of kind `you`: only you move it on. */
  waitsOnYou: boolean;
}

/** What a project holds now, as Jev reads it for its starters. Build it with {@link boundStarterInputs}. */
export interface StarterInputs {
  /** AGENTS.md's head: the project's own curated words about itself. */
  agents: string;
  /** Its repository's default branch, when a checkout was read. */
  branch: string | null;
  commits: { sha: string; subject: string }[];
  /** Its work is design work: its template's (design, brand, launch, social), or an open task's labels or outputs (design-offers.ts `designShaped`). */
  designWork: boolean;
  /** Its draft views, by path (`views/drafts/<name>.oui`): views Caw drafted that no one has kept. */
  drafts: string[];
  failures: {
    id: string;
    kind: "attempt" | "routine";
    name: string;
    reason: string;
  }[];
  /** design/ in its folder or its repository: null when no checkout could be read and the folder has none. */
  hasDesign: boolean | null;
  knowledge: string[];
  name: string;
  /** Task kinds (a type, else a first label) filed at least {@link STARTER_OFTEN} times in {@link STARTER_RECENT_DAYS}, most first, with some of their tasks. */
  recentKinds: { count: number; name: string; tasks: string[] }[];
  /** Its routines now, by name: what is a routine already. */
  routines: { id: string; name: string }[];
  /** The starters offered before in every place, newest first, and what the person did with each. */
  shown: { outcome: StarterOutcome; place: StarterPlace; text: string }[];
  tasks: StarterTask[];
  template: string | null;
  threads: { id: string; last: string; title: string }[];
  /** Event sources and kinds whose events in {@link STARTER_RECENT_DAYS} reached no routine, most first. */
  unrouted: { count: number; kind: string; source: string }[];
}

/** `words` in at most `max` characters, its mark included: a bound is a ceiling. */
const within = (words: string, max: number): string =>
  words.length > max ? `${words.slice(0, max - 1)}…` : words;
/** `words`' end in at most `max` characters, its mark included: a conversation's last words are where it stands. */
const endWithin = (words: string, max: number): string =>
  words.length > max ? `…${words.slice(-(max - 1))}` : words;
const SPACES = /\s+/g;

/** Every text cut to its length and every list to its count. */
export const boundStarterInputs = (raw: StarterInputs): StarterInputs => {
  const b = STARTER_BOUNDS;
  return {
    name: within(raw.name, b.name),
    template: raw.template,
    agents: within(raw.agents.trim(), b.agents),
    knowledge: raw.knowledge
      .slice(0, b.knowledge)
      .map((path) => within(path, b.path)),
    tasks: raw.tasks.slice(0, b.tasks).map((task) => ({
      ...task,
      title: within(task.title, b.title),
      stage: within(task.stage, b.name),
      failed: task.failed === null ? null : within(task.failed, b.failure),
    })),
    threads: raw.threads.slice(0, b.threads).map((thread) => ({
      id: thread.id,
      title: within(thread.title, b.title),
      last: endWithin(thread.last.trim().replace(SPACES, " "), b.line),
    })),
    branch: raw.branch,
    commits: raw.commits.slice(0, b.commits).map((commit) => ({
      sha: commit.sha,
      subject: within(commit.subject, b.subject),
    })),
    designWork: raw.designWork,
    hasDesign: raw.hasDesign,
    failures: raw.failures.slice(0, b.failures).map((failure) => ({
      ...failure,
      name: within(failure.name, b.title),
      reason: within(failure.reason, b.failure),
    })),
    recentKinds: raw.recentKinds.slice(0, b.recentKinds).map((kind) => ({
      name: within(kind.name, b.kindName),
      count: kind.count,
      tasks: kind.tasks.slice(0, b.kindTasks),
    })),
    unrouted: raw.unrouted.slice(0, b.unrouted).map((each) => ({
      source: within(each.source, b.source),
      kind: within(each.kind, b.eventKind),
      count: each.count,
    })),
    drafts: raw.drafts.slice(0, b.drafts).map((path) => within(path, b.path)),
    routines: raw.routines.slice(0, b.routines).map((routine) => ({
      id: routine.id,
      name: within(routine.name, b.name),
    })),
    shown: raw.shown.slice(0, b.shown).map((each) => ({
      place: each.place,
      text: within(each.text, b.text),
      outcome: each.outcome,
    })),
  };
};

/**
 * `make(quoted)` with `quoted` cut, marked, until the sentence fits `max`:
 * the sentence's own words stay whole, what it quotes gives way.
 */
const fitted = (
  make: (quoted: string) => string,
  quoted: string,
  max: number
): string => {
  const whole = make(quoted);
  if (whole.length <= max) {
    return whole;
  }
  const room = Math.max(1, quoted.length - (whole.length - max) - 1);
  return make(`${quoted.slice(0, room).trimEnd()}…`);
};
const text = (make: (q: string) => string, quoted: string) =>
  fitted(make, quoted, STARTER_BOUNDS.text);

// --- reasons: why a starter is offered --------------------------------------------

/**
 * A reason's word cap. The owner's call ("at most ~14 words"): a line read
 * at a glance under the starter's own words.
 */
export const REASON_WORDS = 14;

/**
 * How every reason below is written, the rules {@link reasonRefusal} holds
 * them to. The owner, on reasons like the two bad ones: "the subtitle is
 * the same weight and no way to understand what's going on, is this just a
 * text or am i supposed to read sth here?"
 *
 * - One plain sentence a person reads at a glance: why this is offered, in
 *   the project's words, at most {@link REASON_WORDS} words, ending in a full
 *   stop.
 * - It says why; the starter's text already names the thing, so the reason
 *   does not repeat its title.
 * - No ids or slugs (`tsk-3`, `th-launch-email`, a commit sha, an event kind
 *   like `issue.opened`), no file paths or routes unless they are the thing
 *   itself, nothing set in mono.
 * - No shorthand: no `2d` for two days, no `·` lists.
 *
 * Good: "It has waited on you in Review for 2 days." / "No routine took the
 * 4 issues opened on acme/site in 14 days."
 * Bad: "/book · 3 errors in the last run" / "th-launch-email · 2d, no reply"
 *
 * `sources` carry what a starter comes from, for the grounding gate; they
 * never reach a reason's words.
 */
const REASON_RULES: [RegExp, string][] = [
  [/[·•|]/, "it lists with “·”"],
  [/`/, "it sets words in mono"],
  [/\b\d+(?:d|h|m|w|mo|y|hr|min)\b/i, "it shortens a duration (“2d”)"],
  [/\b[a-z]{1,4}-[a-z0-9]*\d[a-z0-9]*\b/i, "it names an id"],
  [/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/i, "it names a sha"],
  [/\b[a-z0-9]+(?:-[a-z0-9]+){2,}\b/i, "it names a slug"],
  [/\b[a-z0-9]+_[a-z0-9_]+\b/i, "it names an identifier"],
  [/\b[a-z]+\.[a-z]+\b/i, "it names a dotted id or a file"],
  [/(?:^|\s)\/\S/, "it names a route"],
];
const SENTENCE_END = /[.!?](?=\s+\S)/;
const ENDS = /[.!?]$/;

/**
 * Why `reason` breaks the rules above, in words, or null when it holds to
 * them. Pure; the write path drops a starter whose reason it refuses
 * (jev-placement.ts `jevStarters`).
 */
export const reasonRefusal = (reason: string): string | null => {
  const said = reason.trim();
  const words = said.split(SPACES).filter(Boolean).length;
  if (words === 0) {
    return "it is empty";
  }
  if (words > REASON_WORDS) {
    return `it is ${words} words; the cap is ${REASON_WORDS}`;
  }
  if (said.length > STARTER_BOUNDS.reason) {
    return `it is ${said.length} characters; the cap is ${STARTER_BOUNDS.reason}`;
  }
  for (const [rule, why] of REASON_RULES) {
    if (rule.test(said)) {
      return why;
    }
  }
  if (SENTENCE_END.test(said) || !ENDS.test(said)) {
    return "it is not one sentence";
  }
  return null;
};

/** One ask Jev may choose for a thing in the project: what it means to Jev, and the starter it becomes. */
export interface Ask {
  about: string;
  glyph: StarterGlyph;
  reason: string;
  sources: StarterSource[];
  text: string;
}

/** A thing in the project a place's starters may come from, and the asks that fit it now. */
export interface Subject {
  asks: Record<string, Ask>;
  /** Where it sits in `state`, as Jev's instructions name it. */
  at: string;
}

const days = (n: number): string => (n === 1 ? "1 day" : `${n} days`);
const named = (title: string) => `“${title}”`;
/** "It waits on you in Review." or, days on, "It has waited on you in Review for 2 days." */
const waited = (
  on: "waited on you" | "waited on your pick",
  task: StarterTask
) =>
  task.days > 0
    ? `It has ${on} in ${task.stage} for ${days(task.days)}.`
    : `It ${on.replace("waited", "waits")} in ${task.stage}.`;

// --- board: what to start with Caw ------------------------------------------------

/** The asks that fit one open task, as it stands. */
const taskAsks = (task: StarterTask): Record<string, Ask> => {
  const source: StarterSource[] = [{ kind: "task", ref: task.id }];
  const say = (make: (q: string) => string) =>
    text((title) => make(named(title)), task.title);
  const asks: Record<string, Ask> = {};
  if (task.waitsOnYou) {
    asks.answer = {
      about:
        "It waits on the person: they want Caw to walk them through what it needs from them.",
      glyph: "reply",
      text: say((q) => `Walk me through what ${q} needs from me`),
      reason: waited("waited on you", task),
      sources: source,
    };
  }
  if (task.failed !== null) {
    asks.retry = {
      about: "Its last attempt failed: find why, and try it again.",
      glyph: "bug",
      text: say((q) => `Find out why ${q} failed and try it again`),
      reason: "Its last attempt failed, and no one has tried it again.",
      sources: source,
    };
  }
  if (
    task.kind === "active" &&
    !task.waitsOnYou &&
    task.days >= STARTER_STALE_DAYS
  ) {
    asks.unstick = {
      about: "It has sat in its stage for days: find what holds it up.",
      glyph: "triage",
      text: say((q) => `Find out why ${q} is stuck in ${task.stage}`),
      reason: `It has sat in ${task.stage} for ${days(task.days)} without moving.`,
      sources: source,
    };
  }
  if (task.kind === "todo") {
    const still =
      task.days > 0
        ? `It has sat in ${task.stage} for ${days(task.days)}, not started.`
        : `It is in ${task.stage} and not started yet.`;
    if (!task.blocked) {
      asks.start = {
        about: "It is clear enough and nothing blocks it: start it now.",
        glyph: "rocket",
        text: say((q) => `Start ${q}`),
        reason: `It is in ${task.stage}, and nothing blocks it.`,
        sources: source,
      };
    }
    asks.spec = {
      about: "It is too vague to start: grill the person until it has a spec.",
      glyph: "grill",
      text: say((q) => `Grill me on ${q} until it has a spec`),
      reason: still,
      sources: source,
    };
    asks.split = {
      about: "It is too big for one go: break it into smaller tasks.",
      glyph: "tasks",
      text: say((q) => `Break ${q} into smaller tasks`),
      reason: still,
      sources: source,
    };
  }
  return asks;
};

/** A thread with words in it: pick it up, or turn what it settled into tasks. */
const threadSubject = (thread: StarterInputs["threads"][number]): Subject => {
  const sources: StarterSource[] = [{ kind: "thread", ref: thread.id }];
  const say = (make: (q: string) => string) =>
    text((title) => make(named(title)), thread.title);
  return {
    at: `threads["${thread.id}"]`,
    asks: {
      continue: {
        about:
          "The conversation stopped before it was done: pick it up where it left off.",
        glyph: "reply",
        text: say((q) => `Pick up ${q} where we left off`),
        reason: "This conversation stopped before it was done.",
        sources,
      },
      tasks: {
        about: "It settled what to do: turn that into tasks.",
        glyph: "tasks",
        text: say((q) => `Turn what we settled in ${q} into tasks`),
        reason: "This conversation settled what to do next.",
        sources,
      },
    },
  };
};

/** A routine whose last run failed: find why, and fix it. */
const routineSubject = (
  failure: StarterInputs["failures"][number]
): Subject => ({
  at: `failures (the routine ${failure.id})`,
  asks: {
    fix: {
      about: "The routine's last run failed: find why, and fix it.",
      glyph: "bug",
      text: text(
        (name) => `Find out why the “${name}” routine failed and fix it`,
        failure.name
      ),
      reason: "This routine's last run failed.",
      sources: [{ kind: "routine", ref: failure.id }],
    },
  },
});

/** A commit that landed on the default branch: check it with the person. */
const commitSubject = (
  commit: StarterInputs["commits"][number],
  branch: string | null
): Subject => ({
  at: `repository.commits (${commit.sha.slice(0, 9)})`,
  asks: {
    review: {
      about:
        "What landed may need a look: check it with the person, or what it leaves to do.",
      glyph: "search",
      text: text(
        (subject) => `Check what landed in “${subject}”`,
        commit.subject
      ),
      reason: `It is one of the latest commits on ${branch ?? "the default branch"}.`,
      sources: [{ kind: "commit", ref: commit.sha }],
    },
  },
});

/**
 * Design work with no design system (no design/, slice 2's signal): build
 * one. The signal only; Jev decides whether it is worth saying now.
 */
const designSubject = (inputs: StarterInputs): Subject | undefined => {
  if (!(inputs.hasDesign === false && inputs.designWork)) {
    return;
  }
  const designTasks = inputs.tasks.filter((task) => task.design);
  return {
    at: "repository.has_design_system",
    asks: {
      build: {
        about:
          "Its work is design work and it has no design system (no design/): build one from its own material.",
        glyph: "system",
        text:
          inputs.commits.length > 0
            ? "Build a design system from our site and code"
            : "Build a design system from our site and notes",
        reason:
          designTasks.length > 0
            ? "Its tasks are design work, and it has no design system yet."
            : `It is a ${inputs.template} project with no design system yet.`,
        sources: designTasks
          .slice(0, DESIGN_SOURCES_MAX)
          .map((task) => ({ kind: "task", ref: task.id })),
      },
    },
  };
};

/**
 * A project with no open tasks: read its notes and file its first tasks,
 * or, when nothing says what it is for, grill the person until it does.
 */
const projectSubject = (inputs: StarterInputs): Subject | undefined => {
  if (inputs.tasks.length > 0) {
    return;
  }
  const notes: StarterSource[] = [
    ...(inputs.agents ? [{ kind: "path" as const, ref: AGENTS_PATH }] : []),
    ...inputs.knowledge
      .slice(0, 3)
      .map((path) => ({ kind: "path" as const, ref: path })),
  ];
  if (notes.length === 0) {
    return {
      at: "project",
      asks: {
        define: {
          about:
            "It has no open tasks and nothing says what it is for: grill the person until it does.",
          glyph: "grill",
          text: text((name) => `Grill me on what ${name} is for`, inputs.name),
          reason: "It has no open tasks, and nothing says what it is for.",
          sources: [{ kind: "path", ref: AGENTS_PATH }],
        },
      },
    };
  }
  return {
    at: "project",
    asks: {
      first: {
        about:
          "It has no open tasks, and its notes say what it is for: read them and file its first tasks.",
        glyph: "tasks",
        text: text(
          (name) => `Read ${name}'s notes and file its first tasks`,
          inputs.name
        ),
        reason: "It has no open tasks, and its notes say what it is for.",
        sources: notes,
      },
    },
  };
};

const boardSubjects = (inputs: StarterInputs): Map<string, Subject> => {
  const subjects = new Map<string, Subject>();
  for (const task of inputs.tasks) {
    const asks = taskAsks(task);
    if (Object.keys(asks).length > 0) {
      subjects.set(`task:${task.id}`, { at: `tasks["${task.id}"]`, asks });
    }
  }
  for (const thread of inputs.threads.filter((each) => each.last)) {
    subjects.set(`thread:${thread.id}`, threadSubject(thread));
  }
  for (const failure of inputs.failures) {
    if (failure.kind === "routine") {
      subjects.set(`routine:${failure.id}`, routineSubject(failure));
    }
  }
  for (const commit of inputs.commits) {
    subjects.set(`commit:${commit.sha}`, commitSubject(commit, inputs.branch));
  }
  const design = designSubject(inputs);
  if (design) {
    subjects.set("design", design);
  }
  const project = projectSubject(inputs);
  if (project) {
    subjects.set("project", project);
  }
  return subjects;
};

// --- routines: what the project repeats or waits on --------------------------------

/**
 * An event, in the words a routine's sentence starts with, what to do with
 * it, and what its events are called in a reason (one, and many).
 */
const EVENT_WORDS: Record<
  string,
  {
    act: string;
    glyph: StarterGlyph;
    noun: [one: string, many: string];
    when: string;
  }
> = {
  "issue.opened": {
    when: "an issue opens",
    act: "triage it into a task",
    glyph: "triage",
    noun: ["issue opened", "issues opened"],
  },
  "issue.closed": {
    when: "an issue closes",
    act: "check its task is done",
    glyph: "tasks",
    noun: ["issue closed", "issues closed"],
  },
  "issue.labeled": {
    when: "an issue is labeled",
    act: "file it where it belongs",
    glyph: "triage",
    noun: ["issue labeled", "issues labeled"],
  },
  "pr.opened": {
    when: "a pull request opens",
    act: "review it",
    glyph: "search",
    noun: ["pull request opened", "pull requests opened"],
  },
  "pr.merged": {
    when: "a pull request merges",
    act: "write it into the changelog",
    glyph: "brief",
    noun: ["pull request merged", "pull requests merged"],
  },
  "pr.closed": {
    when: "a pull request closes",
    act: "tidy what it leaves",
    glyph: "tasks",
    noun: ["pull request closed", "pull requests closed"],
  },
  "comment.created": {
    when: "someone comments",
    act: "draft a reply",
    glyph: "reply",
    noun: ["comment", "comments"],
  },
};

/** `github:acme/site` → `acme/site`; `conn:linear:list_issues` → `linear`. */
const sourceName = (source: string): string => {
  const [scheme, rest = ""] = [
    source.slice(0, source.indexOf(":")),
    source.slice(source.indexOf(":") + 1),
  ];
  return scheme === "conn" ? (rest.split(":")[0] ?? rest) : rest || source;
};

const routineSubjects = (inputs: StarterInputs): Map<string, Subject> => {
  const subjects = new Map<string, Subject>();
  for (const kind of inputs.recentKinds) {
    subjects.set(`kind:${kind.name}`, {
      at: `recent_kinds["${kind.name}"]`,
      asks: {
        triage: {
          about:
            "Tasks of this kind keep being filed: a weekly routine could triage them as they come.",
          glyph: "triage",
          text: text(
            (name) => `Every Monday, triage the week's new “${name}” tasks`,
            kind.name
          ),
          reason: `${kind.count} tasks like these were filed in the last ${STARTER_RECENT_DAYS} days.`,
          sources: kind.tasks.map((ref) => ({ kind: "task", ref })),
        },
      },
    });
  }
  for (const thread of inputs.threads.filter((each) => each.last)) {
    subjects.set(`thread:${thread.id}`, {
      at: `threads["${thread.id}"]`,
      asks: {
        repeat: {
          about:
            "The person asks this again and again (another thread asks the same, or it asks for something recurring): make it a routine.",
          glyph: "routine",
          text: text(
            (title) => `Every Monday, do what “${title}” asked`,
            thread.title
          ),
          reason:
            "This conversation asks for work that comes back again and again.",
          sources: [{ kind: "thread", ref: thread.id }],
        },
      },
    });
  }
  for (const failure of inputs.failures) {
    if (failure.kind !== "attempt") {
      continue;
    }
    subjects.set(`check:${failure.id}`, {
      at: `failures (the task ${failure.id})`,
      asks: {
        watch: {
          about:
            "Its checks fail: a routine could run them each morning and say what fails.",
          glyph: "bug",
          text: text(
            (title) =>
              `Every morning, run “${title}”'s checks and tell me what fails`,
            failure.name
          ),
          reason:
            "Its last attempt failed, so its checks are worth a daily run.",
          sources: [{ kind: "task", ref: failure.id }],
        },
      },
    });
  }
  for (const event of inputs.unrouted) {
    const words = EVENT_WORDS[event.kind] ?? {
      when: `a “${event.kind}” event comes in`,
      act: "handle it",
      glyph: "routine",
      noun: ["event", "events"],
    };
    const [one, many] = words.noun;
    const from = sourceName(event.source);
    subjects.set(`event:${event.source} ${event.kind}`, {
      at: `unrouted (${event.source} ${event.kind})`,
      asks: {
        route: {
          about:
            "Events from this source reach no routine: a routine could take each one as it comes.",
          glyph: words.glyph,
          text: text(
            (name) => `When ${words.when} on ${name}, ${words.act}`,
            from
          ),
          reason:
            event.count === 1
              ? `No routine took the ${one} on ${from} in the last ${STARTER_RECENT_DAYS} days.`
              : `No routine took the ${event.count} ${many} on ${from} in ${STARTER_RECENT_DAYS} days.`,
          sources: [{ kind: "event", ref: `${event.source} ${event.kind}` }],
        },
      },
    });
  }
  return subjects;
};

// --- decisions: the project's open choices -----------------------------------------

/** `views/drafts/pricing.oui` → `pricing`. */
const draftName = (path: string): string =>
  (path.split("/").at(-1) ?? path).replace(OUI, "");
const OUI = /\.oui$/;

const decisionSubjects = (inputs: StarterInputs): Map<string, Subject> => {
  const subjects = new Map<string, Subject>();
  for (const task of inputs.tasks.filter((each) => each.waitsOnYou)) {
    subjects.set(`pick:${task.id}`, {
      at: `tasks["${task.id}"]`,
      asks: {
        page: {
          about:
            "It waits on a choice only the person can make: lay its options out as a decision page.",
          glyph: "brief",
          text: text(
            (title) => `Write a decision page for “${title}”`,
            task.title
          ),
          reason: waited("waited on your pick", task),
          sources: [{ kind: "task", ref: task.id }],
        },
      },
    });
  }
  for (const thread of inputs.threads.filter((each) => each.last)) {
    subjects.set(`thread:${thread.id}`, {
      at: `threads["${thread.id}"]`,
      asks: {
        options: {
          about:
            "Its last words lay out two or more proposals for the person to choose between.",
          glyph: "explore",
          text: text(
            (title) => `Lay out the options in “${title}” as a decision page`,
            thread.title
          ),
          reason: "Its last answer lays out options for you to choose between.",
          sources: [{ kind: "thread", ref: thread.id }],
        },
      },
    });
  }
  for (const path of inputs.drafts) {
    const name = draftName(path);
    subjects.set(`view:${path}`, {
      at: `drafts ("${path}")`,
      asks: {
        keep: {
          about:
            "A view Caw drafted waits for the person to keep it or drop it.",
          glyph: "screen",
          text: text(
            (view) => `Help me decide on the “${view}” draft view`,
            name
          ),
          reason: "Caw drafted this view, and no one has kept or dropped it.",
          sources: [{ kind: "path", ref: path }],
        },
      },
    });
  }
  return subjects;
};

/** Each place's question, as Jev is asked it about one thing. */
export const PLACE_QUESTION: Record<StarterPlace, (at: string) => string> = {
  board: (at) =>
    `Of these, what would the person most likely ask Caw about \`${at}\` now?`,
  routines: (at) =>
    `Of these, would the person want Caw to do this for \`${at}\` every time, as a routine? \`routines\` holds the routines the project has already.`,
  decisions: (at) =>
    `Of these, is there a choice about \`${at}\` only the person can make, worth laying out as a decision page?`,
};

/**
 * The things in the project each place's starters may come from, by
 * question id (`board/task:tsk-3`, `routines/event:github:acme/site
 * issue.opened`, `decisions/view:views/drafts/pricing.oui`), each with the
 * asks that fit it now. Only these ids are read back.
 */
export const subjectsOf = (
  inputs: StarterInputs
): Map<string, { place: StarterPlace; subject: Subject }> => {
  const all = new Map<string, { place: StarterPlace; subject: Subject }>();
  const places: [StarterPlace, Map<string, Subject>][] = [
    ["board", boardSubjects(inputs)],
    ["routines", routineSubjects(inputs)],
    ["decisions", decisionSubjects(inputs)],
  ];
  for (const [place, subjects] of places) {
    for (const [id, subject] of subjects) {
      all.set(`${place}/${id}`, { place, subject });
    }
  }
  return all;
};

/** Every thing the inputs hold, as `<kind>:<ref>`: a starter's sources must all be among them. */
export const refsOf = (inputs: StarterInputs): Set<string> =>
  new Set([
    ...inputs.tasks.map((task) => `task:${task.id}`),
    ...inputs.recentKinds.flatMap((kind) =>
      kind.tasks.map((ref) => `task:${ref}`)
    ),
    ...inputs.failures.map(
      (failure) =>
        `${failure.kind === "routine" ? "routine" : "task"}:${failure.id}`
    ),
    ...inputs.threads.map((thread) => `thread:${thread.id}`),
    ...inputs.commits.map((commit) => `commit:${commit.sha}`),
    ...inputs.unrouted.map((event) => `event:${event.source} ${event.kind}`),
    `path:${AGENTS_PATH}`,
    ...inputs.knowledge.map((path) => `path:${path}`),
    ...inputs.drafts.map((path) => `path:${path}`),
  ]);
