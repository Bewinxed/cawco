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
 * posted     done      by: action   after: 48h
 * measured   done
 * moves
 *   idea → draft         lead, session
 *   scheduled → posted   action
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

import { STAGE_KINDS as KINDS, type StageKind } from "@cawco/core";

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
  | { ok: true; stages: Stages }
  | { ok: false; problems: string[] };

export const TEMPLATES = [
  "code",
  "social",
  "outreach",
  "seo",
  "design",
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
        "Stages for code: a task waits in ready, is worked on, waits for your\nreview, and lands.",
      block: `ready      todo
working    active
review     you
done       done
dropped    dropped
moves
  * → *                you
  ready → working      lead, session
  working → review     lead, session
  review → working     lead
  * → dropped          lead
views
  board      by stage
  table      by rank`,
    },
    social: {
      about:
        "Stages for social posts: an idea is drafted by the writer, reviewed by you,\nscheduled, posted by an approved action, and measured two days later.",
      block: `idea       todo
draft      active    runs: writer
review     you
scheduled  waiting   until: post_at
posted     done      by: action   after: 48h
measured   done
dropped    dropped
moves
  * → *                you
  idea → draft         lead, session
  draft → review       lead, session
  review → draft       lead
  scheduled → posted   action
  posted → measured    routine
  * → dropped          lead
views
  board      by stage
  calendar   by post_at`,
    },
    outreach: {
      about:
        "Stages for outreach: a prospect is contacted by an approved action; a\nreply moves it on, three days of silence close it.",
      block: `prospect   todo
contacted  waiting   by: action   after: 3d
replied    active
meeting    you
won        done
lost       dropped
moves
  * → *                  you
  prospect → contacted   action
  contacted → replied    routine, lead, session
  contacted → lost       routine
  replied → meeting      lead, session
views
  pipeline   by stage
  table      by rank`,
    },
    seo: {
      about:
        "Stages for SEO: a topic gets a brief and a draft, you review it, an\napproved action publishes it, and a routine measures it four weeks on.",
      block: `topic      todo
brief      active    runs: seo
draft      active    runs: writer
review     you
published  waiting   by: action   after: 4w
measured   done
dropped    dropped
moves
  * → *                  you
  topic → brief          lead, session
  brief → draft          lead, session
  draft → review         lead, session
  review → draft         lead
  review → published     action
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
  explore → review     lead, session
  review → explore     lead
  picked → build       lead, session
  build → shipped      lead, session
  * → dropped          lead
views
  board      by stage
  canvas     by stage`,
    },
  };

/** A template as the stages.md it writes. */
export const templateText = (name: StagesTemplate): string => {
  const { block, about } = TEMPLATE_TEXT[name];
  return `---\n${block}\n---\n\n${about}\n\n${NOTES}`;
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
