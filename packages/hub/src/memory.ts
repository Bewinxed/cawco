/**
 * A project's memory (Projects spec §5.4, the cut of 2026-11-26): its
 * rules file, `AGENTS.md` in the project's folder (project-folder.ts),
 * which changes only when the person asks for a change. A correction a
 * tool can check becomes that check (a lint rule, a hook rule, a hub
 * refusal), never a line here.
 *
 * - **Loaded at every launch**: each project's index is read at the hub's
 *   start and again at every commit that changes it, and every session of
 *   the project launches with it (`indexOf`, launches.ts `grantLaunch`).
 *   The line format and the changes are memory-lessons.ts's.
 * - **One writer** (`memory_rule`, {@link ruleAsked}): a session removes,
 *   rewords or adds one rule at the person's word, read, checked and
 *   committed in one turn of the folder's commit queue (project-folder.ts
 *   `changeFolderInTurn`), so no write lands over another. The index's
 *   `## Notes` is the person's, edited in the folder; no change here
 *   touches it. No agent writes the rules files with `folder_write`
 *   ({@link personsTier}).
 * - **A brief's files** (dispatch.ts, {@link contextFor}): the files a
 *   task's `context:` names, each carried whole within the brief's budget.
 * - **What past sessions said** is `find` (find-tool.ts), the dashboard's
 *   Find, over every machine's transcripts: no store of its own here.
 */

import type { InstanceRow } from "@cawco/core/protocol";
import { shortSha } from "@cawco/core/short-id";
import { unhandled } from "@cawco/core/unhandled";
import { memoryWords } from "@cawco/core/words/memory";
import { projectRulesWords } from "@cawco/core/words/project-rules";
import { ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import { MEMORY_FILE_CHARS } from "./config";
import type { DbShape } from "./db";
import { boardTitle } from "./labels";
import { defineTool, sentence } from "./mcp-tool";
import {
  allLessons,
  applyLineChange,
  type Change,
  INDEX_FILE,
  indexSays,
  KNOWLEDGE_DIR,
  LESSONS_DIR,
  lessonOf,
  type MemoryFiles,
  newLessonId,
} from "./memory-lessons";
import {
  changeFolderInTurn,
  type FolderChangeAsked,
  folderFilePaths,
  readFolderFile,
} from "./project-folder";
import { type AnyProblem, isProblem } from "./refusal";
import { redactSecrets } from "./secret-filter";

/** What one brief carries of all its named files together; each file's share is the file budget (config.ts). */
const CONTEXT_CHARS = 24_000;
const LEADING_SLASHES = /^\/+/u;
/** A rule's id, as its line ends. */
const RULE_ID = /^L-[0-9a-f]{6}$/u;

/**
 * Why no agent may write `rel` in a project's folder with `folder_write`, or
 * nothing: the rules files change through `memory_rule` alone, and
 * `design/` is the design system, written through `design_write` alone
 * (design-system.ts).
 */
export const personsTier = (rel: string): string | undefined => {
  if (
    rel === INDEX_FILE ||
    rel === KNOWLEDGE_DIR ||
    rel.startsWith(`${KNOWLEDGE_DIR}/`) ||
    rel === LESSONS_DIR ||
    rel.startsWith(`${LESSONS_DIR}/`)
  ) {
    return `${rel} holds the project's rules, which change through memory_rule when the person asks. A free-form document, such as how something is operated or made, goes in reference/, written with folder_write.`;
  }
  if (rel === "design" || rel.startsWith("design/")) {
    return "design/ is the project's design system: it is written only with design_write, where a change goes to the person as a proposal. Delegate the change.";
  }
  return undefined;
};

// --- the folder -----------------------------------------------------------------------

/** A text file of the folder, or "" when it is not there. */
export const fileOr = async (projectId: string, path: string) => {
  const file = await readFolderFile(projectId, path);
  if (file instanceof ElysiaStatus) {
    return file.status === 404 ? "" : file;
  }
  return file.content;
};

/** The files a rule may live in, as they stand on disk, by path: the index, the skills' lessons and knowledge; a binary file of the brand kit left out. */
const rulesFiles = async (projectId: string) => {
  const lessons = await folderFilePaths(projectId, LESSONS_DIR);
  if (lessons instanceof ElysiaStatus) {
    return lessons;
  }
  const knowledge = await folderFilePaths(projectId, KNOWLEDGE_DIR, true);
  if (knowledge instanceof ElysiaStatus) {
    return knowledge;
  }
  const files: Record<string, string> = {};
  for (const path of [INDEX_FILE, ...lessons, ...knowledge].filter((each) =>
    each.endsWith(".md")
  )) {
    const text = await fileOr(projectId, path);
    if (text instanceof ElysiaStatus) {
      if (text.status === 413 || text.status === 415) {
        continue;
      }
      return text;
    }
    files[path] = text;
  }
  const read: MemoryFiles = files;
  return read;
};

// --- what a brief carries ---------------------------------------------------------------

/** The task a brief is for, as `contextFor` reads it. */
interface BriefTask {
  /** Project folder files the task names (its `context:`). */
  context: string[];
}

/** A file's words as a brief carries them: whole up to its share, else cut, said so. */
const excerpt = (content: string, limit: number): string =>
  content.length > limit
    ? `${content.slice(0, limit).trimEnd()}\n\n… (cut here; the rest is in the project's folder)`
    : content.trim();

/**
 * The files `task`'s `context:` names, each whole up to its budget, in the
 * order it names them, as one brief section; "" when it names none. A file
 * that is not there, or is binary, is left out; the folder's other refusals
 * are passed up.
 */
const contextFor = async (projectId: string, task: BriefTask) => {
  const parts: string[] = [];
  let room = CONTEXT_CHARS;
  for (const named of new Set(
    task.context.map((path) => path.replace(LEADING_SLASHES, ""))
  )) {
    const file = await readFolderFile(projectId, named);
    if (file instanceof ElysiaStatus) {
      if (file.status === 404 || file.status === 413 || file.status === 415) {
        continue;
      }
      return file;
    }
    if (file.content.trim() === "") {
      continue;
    }
    if (room <= 0) {
      parts.push(memoryWords.briefLeftOut(file.path));
      continue;
    }
    const said = excerpt(file.content, Math.min(MEMORY_FILE_CHARS, room));
    room -= said.length;
    parts.push(`### ${file.path}\n\n${said}`);
  }
  return parts.length === 0
    ? ""
    : projectRulesWords.briefContext(parts.join("\n\n"));
};

// --- a rule changed at the person's word ------------------------------------------------

/** A change to one of the project's rules a session makes at the person's word (`memory_rule`). */
export type RuleAsk =
  | { action: "remove"; rule: string }
  | { action: "reword"; rule: string; text: string; why?: string }
  | { action: "add"; text: string; why?: string };

/** `memory_rule`'s flat input as the one change it asks for; the refusal's words when a field it needs is missing. */
const ruleAskOf = (input: {
  action: RuleAsk["action"];
  rule?: string;
  text?: string;
  why?: string;
}): RuleAsk | string => {
  const rule = input.rule?.trim();
  const text = input.text?.trim();
  const why = input.why?.trim() || undefined;
  switch (input.action) {
    case "remove":
      return rule
        ? { action: "remove", rule }
        : projectRulesWords.ruleAskUnfit("remove", "rule");
    case "reword":
      return rule && text
        ? { action: "reword", rule, text, ...(why ? { why } : {}) }
        : projectRulesWords.ruleAskUnfit("reword", rule ? "text" : "rule");
    case "add":
      return text
        ? { action: "add", text, ...(why ? { why } : {}) }
        : projectRulesWords.ruleAskUnfit("add", "text");
    default:
      return unhandled("memory_rule action", input.action);
  }
};

const LOOSE = /[\s*_`>#|-]+/gu;
/** Words as an exact match compares them: case, markdown marks and spacing aside. */
const plain = (text: string): string =>
  text.toLowerCase().replace(LOOSE, " ").trim();

/** Whether two rules say the same, word for word. */
const sameWords = (a: string, b: string): boolean => plain(a) === plain(b);

/** Why a rule's words may not stand: one line, no secret, said by no other rule. Nothing when they may. */
const ruleWordsProblem = async (
  files: MemoryFiles,
  words: { text: string; why: string | undefined },
  except: string | undefined
) => {
  if (words.text.includes("\n") || words.why?.includes("\n")) {
    return problem(400, {
      code: "memory-rule-unfit",
      detail: projectRulesWords.ruleOneLine,
    });
  }
  for (const each of [words.text, words.why ?? ""]) {
    if ((await redactSecrets(each)) !== each) {
      return problem(400, {
        code: "memory-rule-secret",
        detail: projectRulesWords.ruleSecret,
      });
    }
  }
  const same = allLessons(files).find(
    ({ line }) => line.id !== except && sameWords(line.text, words.text)
  );
  return same
    ? problem(409, {
        code: "memory-rule-same",
        detail: projectRulesWords.ruleSame(same.line.id),
      })
    : undefined;
};

/** The rule `id` names and its file, or why it names none memory_rule may act on. */
const ruleOf = (files: MemoryFiles, id: string) => {
  if (!RULE_ID.test(id)) {
    return problem(400, {
      code: "memory-rule-id-unfit",
      detail: projectRulesWords.ruleIdUnfit(id),
    });
  }
  return (
    lessonOf(files, id) ??
    problem(404, {
      code: "memory-rule-unknown",
      detail: projectRulesWords.ruleUnknown(id),
    })
  );
};

/** A rule change checked against the rules as `files` hold them: the change, its commit's subject and its answer; or why not. */
const ruleChange = async (files: MemoryFiles, ask: RuleAsk) => {
  switch (ask.action) {
    case "remove": {
      const held = ruleOf(files, ask.rule);
      if (held instanceof ElysiaStatus) {
        return held;
      }
      const change: Change = { kind: "remove", id: ask.rule };
      return {
        change,
        subject: projectRulesWords.ruleRemoveSaid(ask.rule),
        answer: projectRulesWords.ruleRemoved(
          ask.rule,
          held.path,
          held.line.text
        ),
      };
    }
    case "reword": {
      const held = ruleOf(files, ask.rule);
      if (held instanceof ElysiaStatus) {
        return held;
      }
      const why = ask.why ?? held.line.why ?? undefined;
      const unfit = await ruleWordsProblem(
        files,
        { text: ask.text, why },
        ask.rule
      );
      if (unfit) {
        return unfit;
      }
      const change: Change = {
        kind: "reword",
        id: ask.rule,
        text: ask.text,
        why: why ?? null,
      };
      return {
        change,
        subject: projectRulesWords.ruleRewordSaid(ask.rule, held.path),
        answer: projectRulesWords.ruleReworded(ask.rule, held.path),
      };
    }
    case "add": {
      const unfit = await ruleWordsProblem(
        files,
        { text: ask.text, why: ask.why },
        undefined
      );
      if (unfit) {
        return unfit;
      }
      const taken = new Set(allLessons(files).map(({ line }) => line.id));
      const id = newLessonId((one) => taken.has(one));
      const change: Change = {
        kind: "add",
        line: { id, text: ask.text, why: ask.why ?? null, anchor: null },
      };
      return {
        change,
        subject: projectRulesWords.ruleAddSaid(id, INDEX_FILE),
        answer: projectRulesWords.ruleAdded(id, INDEX_FILE),
      };
    }
    default:
      return unhandled("memory rule ask", ask);
  }
};

// --- the module -------------------------------------------------------------------------

export interface MemoryDeps {
  readonly db: Pick<DbShape, "listProjects" | "project">;
  /** The project's folder changed under its tasks (a commit landed). */
  readonly folderChanged: (projectId: string) => void;
}

export const createMemory = ({ db, folderChanged }: MemoryDeps) => {
  /**
   * Each project's index as a session launches with it ({@link indexOf}):
   * read at the hub's start and again at every commit that changes
   * AGENTS.md ({@link folderCommitted}).
   */
  const indexes = new Map<string, string>();

  /**
   * A session changes one of the project's rules at the person's word
   * (`memory_rule`): removes it, rewords it or adds one, one commit by the
   * session, its message naming the session. Refused for a session in no
   * project, and for a change that would take its file past its character
   * budget. The rules are read from disk, the change checked and committed
   * in one turn of the folder's commit queue, so no other write lands
   * between the read and the commit.
   */
  const ruleAsked = async (actor: InstanceRow, ask: RuleAsk) => {
    const { projectId } = actor;
    if (!projectId) {
      return problem(409, {
        code: "memory-session-no-project",
        detail: projectRulesWords.ruleNoProject,
      });
    }
    if (!db.project(projectId)) {
      return problem(404, {
        code: "memory-project-unknown",
        detail: `The hub keeps no project ${projectId}.`,
      });
    }
    const author = boardTitle(actor);
    const done = await changeFolderInTurn(
      projectId,
      async (): Promise<
        { change?: FolderChangeAsked; value: string | AnyProblem } | AnyProblem
      > => {
        const files = await rulesFiles(projectId);
        if (isProblem(files)) {
          return files;
        }
        const asked = await ruleChange(files, ask);
        if (asked instanceof ElysiaStatus) {
          return { value: asked };
        }
        const made = applyLineChange(files, asked.change);
        if ("gone" in made) {
          return {
            value: problem(409, {
              code: "memory-rule-refused",
              detail: projectRulesWords.noLongerThere(made.gone),
            }),
          };
        }
        if ("over" in made) {
          return {
            value: problem(409, {
              code: "memory-rule-over-budget",
              detail: projectRulesWords.overBudget(made.over),
            }),
          };
        }
        const change = applied({
          before: files,
          after: made.files,
          author,
          message: `memory: ${projectRulesWords.ruleCommit(asked.subject)}\n\n${projectRulesWords.ruleBy(author, actor.id)}`,
        });
        return change
          ? { change, value: asked.answer }
          : { value: asked.answer };
      }
    );
    if (isProblem(done)) {
      return done;
    }
    if (done.commits) {
      folderChanged(projectId);
      console.log(
        `[memory] ${projectId}: a rule changed by ${actor.id} at ${shortSha(done.commits.sha)}`
      );
    }
    return done.value;
  };

  /** Project `projectId`'s index read again into {@link indexes}; a read the folder refuses leaves the copy it had. */
  const readIndex = async (projectId: string) => {
    const agents = await fileOr(projectId, INDEX_FILE);
    if (agents instanceof ElysiaStatus) {
      return agents;
    }
    indexes.set(
      projectId,
      indexSays(agents) ? projectRulesWords.indexInstruction(agents) : ""
    );
  };

  /** Every project's index read, as the hub starts. */
  const start = async (): Promise<void> => {
    await Promise.all(
      db.listProjects().map(async (project) => {
        try {
          const indexed = await readIndex(project.id);
          if (indexed) {
            console.warn(
              `[memory] ${project.name}: its index was not read: ${indexed.response.detail}`
            );
          }
        } catch (error) {
          console.warn(
            `[memory] ${project.name}: its index was not read: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );
  };

  return {
    contextFor,
    start,

    /**
     * Project `projectId`'s index (AGENTS.md) as every session of the
     * project launches with it (launches.ts `grantLaunch`), under the words
     * saying what it is; empty when it says nothing yet. A copy, read at the
     * hub's start and at each commit that changes it.
     */
    indexOf: (projectId: string): string => indexes.get(projectId) ?? "",

    /** A commit changed `paths` in `projectId`'s folder: its index is read again when AGENTS.md is among them. */
    folderCommitted: async (projectId: string, paths: ReadonlySet<string>) =>
      paths.has(INDEX_FILE) ? await readIndex(projectId) : undefined,

    /**
     * The memory tools, bound to the calling session; with no session, the
     * same definitions for discovery.
     */
    tools(actor: InstanceRow | undefined) {
      const me = (): InstanceRow => {
        if (!actor) {
          throw new Error("Discovery cannot execute tools");
        }
        return actor;
      };
      return [
        MEMORY_RULE_DEFINITION.run(async (input) => {
          const ask = ruleAskOf(input);
          return typeof ask === "string"
            ? problem(400, { code: "memory-rule-ask-unfit", detail: ask })
            : await ruleAsked(me(), ask);
        }),
      ];
    },
  };
};

/** A checked change as the folder commits it: every rules file whose words moved, by `author`; none when nothing changed. */
const applied = ({
  after,
  author,
  before,
  message,
}: {
  after: MemoryFiles;
  author: string;
  before: MemoryFiles;
  message: string;
}): FolderChangeAsked | undefined => {
  const writes = Object.entries(after).flatMap(([path, content]) =>
    content !== undefined && content !== before[path] ? [{ path, content }] : []
  );
  return writes.length === 0
    ? undefined
    : { writes, deletes: [], author: { name: author }, message };
};

export type Memory = ReturnType<typeof createMemory>;

/** Every memory tool, by name. */
export const MEMORY_TOOLS: ReadonlySet<string> = new Set(["memory_rule"]);

const MEMORY_RULE_DEFINITION = defineTool(
  "memory_rule",
  projectRulesWords.ruleTool,
  {
    action: z.enum(["remove", "reword", "add"]),
    rule: z
      .string()
      .optional()
      .describe("For remove and reword: its id, like L-28939a."),
    text: z
      .string()
      .optional()
      .describe("For reword and add: the rule in one sentence."),
    why: z
      .string()
      .optional()
      .describe("For reword and add: why it holds, in one line."),
  },
  sentence
);

/** The tools as a listing reads them, before any session's handlers are bound. */
export const MEMORY_DEFINITIONS = [MEMORY_RULE_DEFINITION.listed()];
