/**
 * A project's stages (§5.2 of the Projects spec, D17): `stages.md` in its hub
 * folder names the project's own stages, each on one of six fixed kinds, the
 * moves between them and who may make each, and its views.
 *
 * ```
 * ---
 * idea       todo
 * draft      active    runs: writer
 * review     you
 * scheduled  waiting   until: post_at
 * posted     done      after: 48h
 * measured   done
 * moves
 *   idea → draft         lead, session
 *   scheduled → posted   lead, session
 * views
 *   board      by stage
 *   calendar   by post_at
 * ---
 * Anything after the block is notes for people; the hub reads none of it.
 * ```
 *
 * - **A stage line** is a name, a kind and its hooks. Kinds: `todo` (the
 *   dispatcher picks it up), `active` (entering can start a delegate type),
 *   `waiting` (a routine or poller moves it on), `you` (Needs you, and the
 *   phone), `done` (counts as finished), `dropped` (closed, not counted). The
 *   first stage of kind `todo` (else the first stage) is where a new task
 *   starts.
 * - **Hooks** are recorded here and run by the dispatcher (slice 5), not yet:
 *   `runs: <delegate type>` starts that type when a task enters (active
 *   stages only); `until: <field>` holds a task here until the time in that
 *   field of its file; `after: <n>m|h|d|w` holds it that long; then a routine
 *   moves it on. `by: <who>` says who alone may move a task into the stage.
 * - **Moves** are `from → to  who, who` (`->` works too; `*` is any
 *   stage, so `* → *  you` lets you make every move).
 *   Who is `you` (the dashboard), `lead` (the project's lead, Caw), `session`
 *   (a session working in the project), `action` (an approved action) or
 *   `routine`. A move is allowed when a line covers it and the stage it goes
 *   to has no `by:` naming someone else. A file without `moves` lets you and
 *   the lead make any move.
 * - **Views** are a name and, optionally, `by <field>`.
 *
 * A project without stages.md uses the code template. "Needs you" is not a
 * stage: it is every task whose stage is of kind `you`, worked out on read.
 */

import {
  STAGE_KINDS as KINDS,
  type StageKind,
  type StarterGlyph,
} from "@cawco/core";

/** The fixed kinds a stage belongs to (WORDS.md: kind), core's: a view binds to them too. */
export type { StageKind } from "@cawco/core";

/** Who moves a task: you, the project's lead, a session, an approved action, a routine. */
export const MOVERS = ["you", "lead", "session", "action", "routine"] as const;
export type Mover = (typeof MOVERS)[number];

export interface StageHooks {
  /** `after:` as written, like `48h`. */
  after?: string;
  /** `after:` in milliseconds. */
  afterMs?: number;
  by?: Mover;
  runs?: string;
  until?: string;
}

export interface Stage {
  hooks: StageHooks;
  kind: StageKind;
  name: string;
}

export interface StageMove {
  /** A stage, or `*` for any. */
  from: string;
  /** A stage, or `*` for any. */
  to: string;
  who: Mover[];
}

export interface StageView {
  by: string | null;
  name: string;
}

export interface Stages {
  moves: StageMove[];
  stages: Stage[];
  views: StageView[];
}

/** What reading stages.md answers: its stages, or every problem it has. */
export type StagesReading =
  { ok: true; stages: Stages } | { ok: false; problems: string[] };

export const TEMPLATES = [
  "code",
  "launch",
  "seo",
  "brand",
  "design",
  "social",
  "outreach",
] as const;
export type StagesTemplate = (typeof TEMPLATES)[number];

/** A stage's name: lowercase, a letter first. */
export const STAGE_NAME = /^[a-z][a-z0-9_-]{0,39}$/;
const TYPE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const FIELD_NAME = /^[a-z_][a-z0-9_]{0,63}$/;
const DURATION = /^(\d{1,4})(m|h|d|w)$/;
const FENCE = /^---\s*$/;
const LINE_SPLIT = /\r?\n/;
const COMMENT = /(?:^|\s)#.*$/;
const SECTION = /^(moves|views):?$/;
const STAGE_LINE = /^(\S+)\s+(\S+)(.*)$/;
const HOOK = /([A-Za-z_]+):\s*(\S+)/g;
const MOVE_LINE = /^(\S+?)\s*(?:→|->)\s*(\S+)\s+(.+)$/;
const VIEW_LINE = /^(\S+)(?:\s+by\s+(\S+))?$/;
const WHO_SPLIT = /[\s,]+/;
const INDENTED = /^\s/;
const STAGES_LIMIT = 32;

const MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const isKind = (word: string): word is StageKind =>
  (KINDS as readonly string[]).includes(word);
const isMover = (word: string): word is Mover =>
  (MOVERS as readonly string[]).includes(word);

/** `a, b or c`. */
export const listed = (words: string[], joiner = "or"): string =>
  words.length < 2
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} ${joiner} ${words.at(-1)}`;

/** Who a sentence names: “you”, “the project lead”, “an approved action”. */
export const moverPhrase = (who: Mover): string =>
  ({
    you: "you",
    lead: "the project lead",
    session: "a session",
    action: "an approved action",
    routine: "a routine",
  })[who];

// --- reading -------------------------------------------------------------------

interface Reader {
  /** Whether the file has a `moves` section at all. */
  hasMoves: boolean;
  moves: StageMove[];
  /** Every stage name a line gave, its kind readable or not, so one bad kind is one problem. */
  names: Set<string>;
  problems: string[];
  stages: Stage[];
  views: StageView[];
}

/** One hook of a stage line; a problem when it cannot be one. */
const readHook = (
  reader: Reader,
  at: string,
  stage: Stage,
  key: string,
  value: string
): void => {
  const { hooks } = stage;
  if (key in hooks) {
    reader.problems.push(`${at}: ${stage.name} names ${key}: twice.`);
    return;
  }
  if (key === "runs") {
    if (stage.kind !== "active") {
      reader.problems.push(
        `${at}: runs: starts a delegate type as a task enters, which only an active stage does; ${stage.name} is ${stage.kind}.`
      );
    } else if (TYPE_NAME.test(value)) {
      hooks.runs = value;
    } else {
      reader.problems.push(`${at}: “${value}” is not a delegate type name.`);
    }
  } else if (key === "until") {
    if (FIELD_NAME.test(value)) {
      hooks.until = value;
    } else {
      reader.problems.push(
        `${at}: until: names a field of the task file, like post_at; “${value}” is not one.`
      );
    }
  } else if (key === "after") {
    const duration = DURATION.exec(value);
    if (duration) {
      hooks.after = value;
      hooks.afterMs = Number(duration[1]) * MS[duration[2]];
    } else {
      reader.problems.push(
        `${at}: after: takes a duration like 30m, 48h, 3d or 2w; “${value}” is not one.`
      );
    }
  } else if (key === "by") {
    if (isMover(value)) {
      hooks.by = value;
    } else {
      reader.problems.push(
        `${at}: by: names who alone moves a task in: ${listed([...MOVERS])}; “${value}” is not one.`
      );
    }
  } else {
    reader.problems.push(
      `${at}: “${key}:” is not a hook; a stage takes runs:, until:, after: and by:.`
    );
  }
};

const readStage = (reader: Reader, at: string, text: string): void => {
  const line = STAGE_LINE.exec(text);
  if (!line) {
    reader.problems.push(
      `${at}: a stage line is a name and a kind, like “review  you”.`
    );
    return;
  }
  const [, name, kind, rest] = line;
  if (!STAGE_NAME.test(name)) {
    reader.problems.push(
      `${at}: “${name}” is not a stage name: lowercase letters, digits, "_" and "-", starting with a letter.`
    );
    return;
  }
  if (reader.names.has(name)) {
    reader.problems.push(`${at}: ${name} is named twice.`);
    return;
  }
  reader.names.add(name);
  if (!isKind(kind)) {
    reader.problems.push(
      `${at}: “${kind}” is not a kind; a kind is one of ${listed([...KINDS])}.`
    );
    return;
  }
  const stage: Stage = { name, kind, hooks: {} };
  for (const [, key, value] of rest.matchAll(HOOK)) {
    readHook(reader, at, stage, key, value);
  }
  const left = rest.replace(HOOK, "").trim();
  if (left) {
    reader.problems.push(
      `${at}: “${left}” is not a hook; a stage takes runs:, until:, after: and by:.`
    );
  }
  reader.stages.push(stage);
};

const readMove = (reader: Reader, at: string, text: string): void => {
  const line = MOVE_LINE.exec(text);
  if (!line) {
    reader.problems.push(
      `${at}: a move is “from → to  who”, like “review → done  you”.`
    );
    return;
  }
  const [, from, to, whoText] = line;
  const who = whoText.split(WHO_SPLIT).filter(Boolean);
  const unknown = who.filter((word) => !isMover(word));
  if (unknown.length > 0) {
    reader.problems.push(
      `${at}: ${listed(
        unknown.map((word) => `“${word}”`),
        "and"
      )} ${unknown.length > 1 ? "are" : "is"} not who moves a task; that is ${listed([...MOVERS])}.`
    );
    return;
  }
  reader.moves.push({ from, to, who: who as Mover[] });
};

const readView = (reader: Reader, at: string, text: string): void => {
  const line = VIEW_LINE.exec(text);
  if (!(line && STAGE_NAME.test(line[1]))) {
    reader.problems.push(
      `${at}: a view is a name and, if it has one, “by <field>”, like “calendar  by post_at”.`
    );
    return;
  }
  if (reader.views.some((view) => view.name === line[1])) {
    reader.problems.push(`${at}: the view ${line[1]} is named twice.`);
    return;
  }
  reader.views.push({ name: line[1], by: line[2] ?? null });
};

/** Checks the moves against the stages once every stage is known. */
const checkMoves = (reader: Reader, lines: Map<StageMove, string>): void => {
  const names = new Map(reader.stages.map((stage) => [stage.name, stage]));
  for (const move of reader.moves) {
    const at = lines.get(move) ?? "stages.md";
    for (const end of [move.from, move.to]) {
      if (end !== "*" && !reader.names.has(end)) {
        reader.problems.push(
          `${at}: ${end} is not a stage here; the stages are ${listed([...reader.names], "and")}.`
        );
      }
    }
    if (move.from !== "*" && move.from === move.to) {
      reader.problems.push(
        `${at}: ${move.from} → ${move.to} goes nowhere; a move leaves its stage.`
      );
    }
    const by = names.get(move.to)?.hooks.by;
    const others = move.who.filter((who) => by && who !== by);
    if (by && others.length > 0) {
      reader.problems.push(
        `${at}: ${move.to} says by: ${by}, so only ${moverPhrase(by)} moves a task there, not ${listed(others, "or")}.`
      );
    }
  }
};

/**
 * Reads stages.md: its stages, moves and views, or every problem it has,
 * each a sentence naming its line.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass over the block's lines, switching between its three sections; each kind of line is read by its own function.
export const readStages = (content: string): StagesReading => {
  const lines = content.split(LINE_SPLIT);
  const open = lines.findIndex((line) => line.trim() !== "");
  if (open === -1 || !FENCE.test(lines[open])) {
    return {
      ok: false,
      problems: [
        "stages.md holds its stages between two --- lines at the top, and this one has none.",
      ],
    };
  }
  const close = lines.findIndex((line, at) => at > open && FENCE.test(line));
  if (close === -1) {
    return {
      ok: false,
      problems: [
        `stages.md opens a --- block on line ${open + 1} and never closes it.`,
      ],
    };
  }
  const reader: Reader = {
    names: new Set(),
    problems: [],
    stages: [],
    moves: [],
    views: [],
    hasMoves: false,
  };
  const moveLines = new Map<StageMove, string>();
  let section: "stages" | "moves" | "views" = "stages";
  for (let index = open + 1; index < close; index += 1) {
    const at = `stages.md line ${index + 1}`;
    const raw = lines[index].replace(COMMENT, "");
    const text = raw.trim();
    if (!text) {
      continue;
    }
    const header = INDENTED.test(raw) ? undefined : SECTION.exec(text);
    if (header) {
      section = header[1] as "moves" | "views";
      reader.hasMoves ||= section === "moves";
      continue;
    }
    if (section === "stages") {
      if (INDENTED.test(raw)) {
        reader.problems.push(
          `${at}: an indented line belongs under moves or views, and there is neither above it.`
        );
      } else {
        readStage(reader, at, text);
      }
    } else if (section === "moves") {
      const before = reader.moves.length;
      readMove(reader, at, text);
      if (reader.moves.length > before) {
        moveLines.set(reader.moves.at(-1) as StageMove, at);
      }
    } else {
      readView(reader, at, text);
    }
  }
  if (reader.stages.length === 0) {
    reader.problems.push(
      "stages.md names no stage; write one per line, like “ready  todo”."
    );
  }
  if (reader.stages.length > STAGES_LIMIT) {
    reader.problems.push(
      `stages.md names ${reader.stages.length} stages; a project takes up to ${STAGES_LIMIT}.`
    );
  }
  checkMoves(reader, moveLines);
  if (reader.problems.length > 0) {
    return { ok: false, problems: reader.problems };
  }
  return {
    ok: true,
    stages: {
      stages: reader.stages,
      moves: reader.hasMoves
        ? reader.moves
        : [{ from: "*", to: "*", who: ["you", "lead"] }],
      views: reader.views,
    },
  };
};

// --- what a stage means ------------------------------------------------------------

/** Where a new task starts: the first stage of kind todo, else the first stage. */
export const firstStage = (stages: Stages): Stage =>
  stages.stages.find((stage) => stage.kind === "todo") ??
  (stages.stages[0] as Stage);

export const stageNamed = (stages: Stages, name: string): Stage | undefined =>
  stages.stages.find((stage) => stage.name === name);

/**
 * Whether a move closes a task or takes it past review: into a stage of kind
 * done, or out of a stage of kind `you` to one after it that is not dropped.
 */
export const passesReview = (
  stages: Stages,
  from: string,
  to: string
): boolean => {
  const target = stageNamed(stages, to);
  if (!target) {
    return false;
  }
  if (target.kind === "done") {
    return true;
  }
  const source = stageNamed(stages, from);
  return (
    source?.kind === "you" &&
    target.kind !== "dropped" &&
    stages.stages.indexOf(target) > stages.stages.indexOf(source)
  );
};

/** Whether `who` may enter `to` at all: its `by:` names them, or nobody. */
const mayEnter = (to: Stage, who: Mover): boolean =>
  !to.hooks.by || to.hooks.by === who;

const covers = (
  stages: Stages,
  from: string,
  to: string,
  who: Mover
): boolean =>
  stages.moves.some(
    (move) =>
      (move.from === "*" || move.from === from) &&
      (move.to === "*" || move.to === to) &&
      move.who.includes(who)
  );

/** The stages `who` may move a task to from `from`. */
export const movesFrom = (stages: Stages, from: string, who: Mover): string[] =>
  stages.stages
    .filter(
      (to) =>
        to.name !== from &&
        mayEnter(to, who) &&
        covers(stages, from, to.name, who)
    )
    .map((to) => to.name);

const unknownStage = (stages: Stages, name: string): string =>
  `${name} is not a stage of this project; its stages are ${listed(
    stages.stages.map((stage) => stage.name),
    "and"
  )}.`;

/** Why `who` may not put a new task in `stage`, or undefined when they may. */
export const startProblem = (
  stages: Stages,
  stage: string,
  who: Mover
): string | undefined => {
  const to = stageNamed(stages, stage);
  if (!to) {
    return unknownStage(stages, stage);
  }
  if (!mayEnter(to, who)) {
    return `Only ${moverPhrase(to.hooks.by as Mover)} moves a task to ${stage}.`;
  }
};

/**
 * Why `who` may not move `task` from `from` to `to`, naming the moves they
 * can make instead; undefined when the move is allowed.
 */
export const moveProblem = (
  stages: Stages,
  task: string,
  from: string,
  to: string,
  who: Mover
): string | undefined => {
  const target = stageNamed(stages, to);
  if (!target) {
    return unknownStage(stages, to);
  }
  if (mayEnter(target, who) && covers(stages, from, to, who)) {
    return;
  }
  const why = mayEnter(target, who)
    ? `${moverPhrase(who)} may not make that move`
    : `only ${moverPhrase(target.hooks.by as Mover)} moves a task to ${to}`;
  const open = movesFrom(stages, from, who);
  const instead =
    open.length > 0
      ? `From ${from || "where it is"}, ${moverPhrase(who)} can move it to ${listed(open)}.`
      : `From ${from || "where it is"}, ${moverPhrase(who)} cannot move it anywhere.`;
  return `${task} cannot go from ${from || "no stage"} to ${to}: ${why}. ${instead}`;
};

// --- templates ---------------------------------------------------------------------

const NOTES = `Each line above is a stage and its kind: todo, active, waiting, you, done or
dropped. Hooks: \`runs: <delegate type>\` starts that type as a task enters an
active stage; \`until: <field>\` and \`after: <duration>\` hold a task until a
routine moves it on; \`by: <who>\` says who alone moves a task in. \`moves\`
lists who may make each move (you, lead, session, action, routine; \`*\` is
any stage). Tasks in a stage of kind \`you\` show in Needs you.
`;

const TEMPLATE_TEXT: Record<StagesTemplate, { block: string; about: string }> =
  {
    code: {
      about:
        "Stages for code: a task waits in ready, is worked on, and lands in done.\nReview is for the tasks you want a look at; turn on Review before done\nand every task waits there for you.",
      block: `ready      todo
working    active
review     you
done       done
dropped    dropped
moves
  * → *                you
  ready → working      lead, session
  ready → review       lead, session
  ready → done         lead, session
  working → review     lead, session
  working → done       lead, session
  review → working     lead
  review → ready       lead, session
  review → done        lead, session
  * → dropped          lead
views
  board      by stage
  table      by rank`,
    },
    launch: {
      about:
        "Stages for a launch campaign: a piece is planned, made by the writer,\nreviewed by you, scheduled for launch day, sent live by the agent,\nand measured a week on.",
      block: `plan       todo
make       active    runs: writer
review     you
scheduled  waiting   until: launch_at
live       done      after: 1w
measured   done
dropped    dropped
moves
  * → *                you
  plan → make          lead, session
  plan → review        lead, session
  make → review        lead, session
  review → make        lead
  review → plan        lead, session
  scheduled → live     lead, session, action
  live → measured      routine
  * → dropped          lead
views
  board      by stage
  calendar   by launch_at`,
    },
    brand: {
      about:
        "Stages for a brand kit: a source (a voice doc, a site) is read for its\nvoice, colours and type, you review what was drawn out, and it lands in\nthe kit.",
      block: `source     todo
extract    active    runs: brand
review     you
kit        done
dropped    dropped
moves
  * → *                you
  source → extract     lead, session
  source → review      lead, session
  extract → review     lead, session
  review → extract     lead
  review → source      lead, session
  * → dropped          lead
views
  board      by stage`,
    },
    social: {
      about:
        "Stages for social posts: an idea is drafted by the writer, reviewed by you,\nscheduled, posted by the agent, and measured two days later.",
      block: `idea       todo
draft      active    runs: writer
review     you
scheduled  waiting   until: post_at
posted     done      after: 48h
measured   done
dropped    dropped
moves
  * → *                you
  idea → draft         lead, session
  idea → review        lead, session
  draft → review       lead, session
  review → draft       lead
  review → idea        lead, session
  scheduled → posted   lead, session, action
  posted → measured    routine
  * → dropped          lead
views
  board      by stage
  calendar   by post_at`,
    },
    outreach: {
      about:
        "Stages for outreach: a prospect is contacted by the agent; a reply moves\nit on, three days of silence close it.",
      block: `prospect   todo
contacted  waiting   after: 3d
replied    active
meeting    you
won        done
lost       dropped
moves
  * → *                  you
  prospect → contacted   lead, session, action
  prospect → meeting     lead, session
  prospect → lost        lead
  contacted → replied    routine, lead, session
  contacted → lost       routine
  replied → meeting      lead, session
  replied → lost         lead, session
  meeting → prospect     lead, session
views
  pipeline   by stage
  table      by rank`,
    },
    seo: {
      about:
        "Stages for SEO: a topic gets a brief and a draft, you review and approve\nit, the agent publishes it, and a routine measures it four weeks on.",
      block: `topic      todo
brief      active    runs: seo
draft      active    runs: writer
review     you
approved   todo
published  waiting   after: 4w
measured   done
dropped    dropped
moves
  * → *                  you
  topic → brief          lead, session
  topic → review         lead, session
  brief → draft          lead, session
  draft → review         lead, session
  review → draft         lead
  review → topic         lead, session
  approved → published   lead, session, action
  published → measured   routine
  * → dropped            lead
views
  board      by stage
  table      by rank`,
    },
    design: {
      about:
        "Stages for design: a brief is explored, you review the variants and pick\none, and the picked one is built and shipped.",
      block: `brief      todo
explore    active    runs: explorer
review     you
picked     todo
build      active    runs: builder
shipped    done
dropped    dropped
moves
  * → *                you
  brief → explore      lead, session
  brief → review       lead, session
  explore → review     lead, session
  review → explore     lead
  review → brief       lead, session
  picked → build       lead, session
  build → shipped      lead, session
  * → dropped          lead
views
  board      by stage
  canvas     by stage`,
    },
  };

// --- routine starters ----------------------------------------------------------------

/**
 * A routine an empty Routines page offers to ask Caw for: the sentence, and
 * the glyph for its kind of work. A project's own starters are written for
 * it (project-starters.ts), not listed here.
 */
export interface Starter {
  glyph: StarterGlyph;
  text: string;
}

/** A code project's routines to ask Caw for, each with its schedule or event in its words. */
const CODE_ROUTINE_STARTERS: readonly Starter[] = [
  {
    glyph: "triage",
    text: "Every weekday at 09:00, triage new issues into Ready",
  },
  { glyph: "bug", text: "When a pull request merges, run the smoke tests" },
  {
    glyph: "refresh",
    text: "Every Monday, bump dependencies and open one pull request",
  },
  {
    glyph: "brief",
    text: "Every evening, write the day's merges into the changelog",
  },
];

/** Every other project's routines to ask Caw for. */
const GENERAL_ROUTINE_STARTERS: readonly Starter[] = [
  { glyph: "routine", text: "Suggest routines that fit this project" },
  {
    glyph: "brief",
    text: "Every morning at 08:30, sum up yesterday's sessions",
  },
  {
    glyph: "calendar",
    text: "Every Friday at 16:00, write up the week's work",
  },
  { glyph: "search", text: "Every Monday, list what changed in the folder" },
];

/** What an empty Routines page offers to ask Caw for, for a project made from `template`. */
export const routineStartersFor = (
  template: StagesTemplate | null | undefined
): readonly Starter[] =>
  template === "code" ? CODE_ROUTINE_STARTERS : GENERAL_ROUTINE_STARTERS;

/** A template as the stages.md it writes. */
export const templateText = (name: StagesTemplate): string => {
  const { block, about } = TEMPLATE_TEXT[name];
  return `---\n${block}\n---\n\n${about}\n\n${NOTES}`;
};

/** A move by the positions of its stages, which a rename leaves as they are: `0>2`, `*>4`. */
const placedMove = (stages: Stages, move: StageMove): string => {
  const at = (end: string) =>
    end === "*"
      ? "*"
      : String(stages.stages.findIndex((stage) => stage.name === end));
  return `${at(move.from)}>${at(move.to)}`;
};

/** Whether every move of `own` is one `template` allows, by position and by whom. */
const movesWithin = (own: Stages, template: Stages): boolean =>
  own.moves.every((move) =>
    template.moves.some(
      (allowed) =>
        placedMove(template, allowed) === placedMove(own, move) &&
        move.who.every((who) => allowed.who.includes(who))
    )
  );

/**
 * Which template a project's stages came from, through any renames: the
 * templates with the same kinds in the same order whose moves cover the
 * project's, by position. Two such (code and brand, launch and social) are
 * told apart by how many stage names still match; a tie stays a tie.
 */
export const templateOf = (
  own: Stages
): { template: StagesTemplate } | { candidates: StagesTemplate[] } => {
  const kinds = own.stages.map((stage) => stage.kind).join(" ");
  const candidates = TEMPLATES.filter((name) => {
    const template = templateStages(name);
    return (
      template.stages.map((stage) => stage.kind).join(" ") === kinds &&
      movesWithin(own, template)
    );
  });
  if (candidates.length < 2) {
    return candidates[0] ? { template: candidates[0] } : { candidates: [] };
  }
  const named = candidates.map(
    (name) =>
      templateStages(name).stages.filter(
        (stage, index) => stage.name === own.stages[index]?.name
      ).length
  );
  const best = Math.max(...named);
  const winners = candidates.filter((_, index) => named[index] === best);
  return best > 0 && winners.length === 1
    ? { template: winners[0] as StagesTemplate }
    : { candidates };
};

/**
 * A project's stages as the hub applies them: its stages.md (or the code
 * template) with the project's Review before done on top. On, every stage of
 * kind done is entered by you alone (`by: you`), so lead and sessions reach
 * no further than review; a done stage whose own `by:` names someone keeps
 * it. Off, the stages are as written.
 */
export const ruledStages = (stages: Stages, review: boolean): Stages =>
  review
    ? {
        ...stages,
        stages: stages.stages.map((stage) =>
          stage.kind === "done" && !stage.hooks.by
            ? { ...stage, hooks: { ...stage.hooks, by: "you" } }
            : stage
        ),
      }
    : stages;

/**
 * The code template's block before review became a project's choice: every
 * task waited for your review, and only you moved one to done. A stages.md
 * that reads as this (or as today's code template) is the template the
 * project was made with, not one of its own (`isCodeTemplate`).
 */
const FORMER_CODE = `---
ready      todo
working    active
review     you
done       done
dropped    dropped
moves
  * → *                you
  ready → working      lead, session
  ready → review       lead, session
  working → review     lead, session
  review → working     lead
  review → ready       lead, session
  * → dropped          lead
views
  board      by stage
  table      by rank
---
`;

/** Stages as one comparable line each: moves and their movers in any order are the same rules. */
const shapeOf = (stages: Stages): string =>
  JSON.stringify({
    stages: stages.stages.map(
      (stage) => `${stage.name} ${stage.kind} ${JSON.stringify(stage.hooks)}`
    ),
    moves: stages.moves
      .map((move) => `${move.from}>${move.to} ${[...move.who].sort().join()}`)
      .sort(),
    views: stages.views.map((view) => `${view.name} ${view.by ?? ""}`),
  });

/**
 * Whether a stages.md says nothing the code template (as it is, or as it
 * was before review became a choice) does not: the same stages, moves and
 * views, whatever its notes. Such a file is dropped, and the project reads
 * the hub's code template.
 */
export const isCodeTemplate = (content: string): boolean => {
  const reading = readStages(content);
  if (!reading.ok) {
    return false;
  }
  const shape = shapeOf(reading.stages);
  const former = readStages(FORMER_CODE);
  return (
    shape === shapeOf(templateStages("code")) ||
    (former.ok && shape === shapeOf(former.stages))
  );
};

/** A template, read: every template reads cleanly, or the hub would not start. */
export const templateStages = (name: StagesTemplate): Stages => {
  const reading = readStages(templateText(name));
  if (!reading.ok) {
    throw new Error(
      `The ${name} stages template does not read: ${reading.problems.join(" ")}`
    );
  }
  return reading.stages;
};
