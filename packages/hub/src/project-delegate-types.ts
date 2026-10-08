/**
 * A project's own delegate types (Projects spec §5.1, D16): one file each in
 * the project folder's `delegates/`, shadowing a fleet type of the same name.
 *
 * ```
 * delegates/writer.md
 * ---
 * harness: claude
 * model: claude-opus-5-5
 * effort: high
 * skills: [brand-voice, x-post]
 * mcp: [x-brand]          # named connections
 * role: web-facing        # its toolset
 * budget: { usd: 2, per: day }
 * lands: none             # drafts, not commits
 * ---
 * Draft posts in the brand voice.
 * ```
 *
 * The file's name is the type's name; the body is its brief, and also its
 * description (what a calling model routes by) unless the front matter gives
 * one. A type is a preset: there is no persona text. `deny` (Claude's tool
 * names) and `can_delegate` mean what a fleet type's `denyTools` and
 * `canDelegate` mean, `cawco_todos: true` turns "CawCo's to-dos" on for its
 * sessions as a fleet type's `cawcoTodos` does, and `account:` names the
 * account its sessions prefer (an account id).
 *
 * Files are the truth: the catalog is read from the folder each time it is
 * asked for, synchronously (a handful of small files), so the work-item path
 * that resolves a type in one synchronous step can ask too. A file that does
 * not make a type is left out of the catalog and named in `problems`, never
 * guessed at.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DELEGATE_TYPE_NAME,
  type DelegateType,
  delegateTypeProblem,
  type FrontMatterLine,
  frontMatterBlock,
  SESSION_ROLES,
  type SessionRole,
} from "@cawco/core";
import { Elysia } from "elysia";
import type { DelegateTypesShape } from "./delegate-types";
import { FOLDER_FILE_LIMIT, projectRoot } from "./project-folder";
import { listOf, scalarOf } from "./task-file";

/**
 * The toolsets a type may run in (§5.3's roles): every role but `lead`, which
 * is the project's Caw, a session the hub starts (caw.ts), never a type's.
 */
const TYPE_ROLES = SESSION_ROLES.filter((role) => role !== "lead");

/** Where a type's work goes: §5.3's `lands`, and `none` for drafts that are not commits. */
export const DELEGATE_LANDS = ["main", "branch", "pr", "none"] as const;
export type DelegateLands = (typeof DELEGATE_LANDS)[number];

const BUDGET_PERIODS = ["attempt", "task", "day", "week", "month"] as const;

/** A type's spending limit: any of cost, turns and time, per a period. */
export interface DelegateBudget {
  minutes?: number;
  per?: (typeof BUDGET_PERIODS)[number];
  turns?: number;
  usd?: number;
}

/** One entry of a catalog, saying where it comes from. */
export type CatalogType = DelegateType & {
  budget?: DelegateBudget;
  /** The type's brief: the file's body. */
  brief?: string;
  lands?: DelegateLands;
  mcp?: string[];
  /** The file it was read from, inside the project folder. */
  path?: string;
  /** A project type that replaces a fleet type of the same name. */
  shadows?: boolean;
  source: "project" | "fleet";
};

/** A file under `delegates/` that did not make a type, or a field one ignored. */
export interface TypeFileProblem {
  path: string;
  problem: string;
}

export interface DelegateCatalog {
  problems: TypeFileProblem[];
  types: CatalogType[];
}

const DELEGATES = "delegates";
const TYPE_FILE = /^(.+)\.md$/;
const NUMBER = /^\d+(?:\.\d+)?$/;
const PAIR = /^([A-Za-z_]+)\s*:\s*(.*)$/;
const LEADING_SPACE = /^\s+/;

const KNOWN_FIELDS = new Set([
  "harness",
  "model",
  "effort",
  "skills",
  "mcp",
  "role",
  "budget",
  "lands",
  "deny",
  "can_delegate",
  "cawco_todos",
  "account",
  "description",
]);

/** `{ usd: 2, per: day }`, or the same pairs indented under the key. */
const budgetOf = (line: FrontMatterLine): DelegateBudget | string => {
  const flow = line.value.trim();
  const pairs = flow.startsWith("{")
    ? flow.replace(/^\{|\}$/g, "").split(",")
    : line.under.map((under) => under.replace(LEADING_SPACE, ""));
  const budget: DelegateBudget = {};
  for (const raw of pairs.map((pair) => pair.trim()).filter(Boolean)) {
    const pair = PAIR.exec(raw);
    if (!pair) {
      return `budget: “${raw}” is not a key: value pair`;
    }
    const [, key, value] = pair;
    if (key === "per") {
      if (!(BUDGET_PERIODS as readonly string[]).includes(value)) {
        return `budget: per is one of ${BUDGET_PERIODS.join(", ")}, not “${value}”`;
      }
      budget.per = value as DelegateBudget["per"];
    } else if (key === "usd" || key === "turns" || key === "minutes") {
      if (!(NUMBER.test(value) && Number(value) > 0)) {
        return `budget: ${key} is a positive number, not “${value}”`;
      }
      budget[key] = Number(value);
    } else {
      return `budget: “${key}” is not a limit; use usd, turns, minutes and per`;
    }
  }
  return budget;
};

/** A type file's known fields, read as front matter writes them, and the keys it had no use for. */
const fieldsOf = (lines: FrontMatterLine[]) => {
  const fields = new Map<string, FrontMatterLine>();
  const ignored: string[] = [];
  for (const line of lines) {
    if (line.key === undefined) {
      continue;
    }
    if (KNOWN_FIELDS.has(line.key)) {
      fields.set(line.key, line);
    } else {
      ignored.push(line.key);
    }
  }
  return {
    ignored,
    line: (key: string): FrontMatterLine | undefined => fields.get(key),
    scalar: (key: string): string | undefined => {
      const line = fields.get(key);
      return line ? (scalarOf(line) ?? undefined) : undefined;
    },
    list: (key: string): string[] | undefined => {
      const line = fields.get(key);
      return line ? listOf(line) : undefined;
    },
  };
};

/** Whether `value` is absent or one of `allowed`. */
const oneOf = (value: string | undefined, allowed: readonly string[]) =>
  value === undefined || allowed.includes(value);

/** The fields only a project type has, or why one of them is wrong. */
const projectFieldsOf = (
  fields: ReturnType<typeof fieldsOf>
):
  | string
  | Pick<
      CatalogType,
      "budget" | "lands" | "mcp" | "role" | "canDelegate" | "cawcoTodos"
    > => {
  const role = fields.scalar("role");
  if (!oneOf(role, TYPE_ROLES)) {
    return `role is one of ${TYPE_ROLES.join(", ")}, not “${role}”`;
  }
  const lands = fields.scalar("lands");
  if (!oneOf(lands, DELEGATE_LANDS)) {
    return `lands is one of ${DELEGATE_LANDS.join(", ")}, not “${lands}”`;
  }
  const canDelegate = fields.scalar("can_delegate");
  if (!oneOf(canDelegate, ["true", "false"])) {
    return `can_delegate is true or false, not “${canDelegate}”`;
  }
  const cawcoTodos = fields.scalar("cawco_todos");
  if (!oneOf(cawcoTodos, ["true", "false"])) {
    return `cawco_todos is true or false, not “${cawcoTodos}”`;
  }
  const budgetLine = fields.line("budget");
  const budget = budgetLine ? budgetOf(budgetLine) : undefined;
  if (typeof budget === "string") {
    return budget;
  }
  const mcp = fields.list("mcp");
  return {
    ...(mcp?.length ? { mcp } : {}),
    ...(role ? { role: role as SessionRole } : {}),
    ...(budget && Object.keys(budget).length > 0 ? { budget } : {}),
    ...(lands ? { lands: lands as DelegateLands } : {}),
    ...(canDelegate ? { canDelegate: canDelegate === "true" } : {}),
    ...(cawcoTodos === "true" ? { cawcoTodos: true } : {}),
  };
};

/** One file's type, or why it is not one; `ignored` names fields it had no use for. */
const parseTypeFile = (
  name: string,
  path: string,
  content: string
): { type?: CatalogType; problem?: string; ignored: string[] } => {
  if (!DELEGATE_TYPE_NAME.test(name)) {
    return {
      problem: `“${name}” is not a type name: lowercase letters, digits and hyphens, starting with a letter`,
      ignored: [],
    };
  }
  const block = frontMatterBlock(content);
  if (!block) {
    return {
      problem: "the file has no front matter (a --- block on top)",
      ignored: [],
    };
  }
  const fields = fieldsOf(block.lines);
  const { ignored } = fields;
  const harness = fields.scalar("harness");
  if (!harness) {
    return {
      problem: "the front matter names no harness: claude, opencode or pi",
      ignored,
    };
  }
  const extra = projectFieldsOf(fields);
  if (typeof extra === "string") {
    return { problem: extra, ignored };
  }
  const brief = block.body.trim();
  const effort = fields.scalar("effort");
  const skills = fields.list("skills");
  const deny = fields.list("deny");
  const account = fields.scalar("account");
  const draft: Partial<DelegateType> = {
    name,
    description: fields.scalar("description") ?? brief,
    harness: harness as DelegateType["harness"],
    model: fields.scalar("model") ?? "",
    ...(effort ? { effort: effort as DelegateType["effort"] } : {}),
    ...(skills?.length ? { skills } : {}),
    ...(deny?.length ? { denyTools: deny } : {}),
    ...(account ? { account } : {}),
    ...(extra.canDelegate === undefined
      ? {}
      : { canDelegate: extra.canDelegate }),
  };
  const problem = delegateTypeProblem(draft);
  if (problem) {
    return { problem, ignored };
  }
  return {
    type: {
      ...(draft as DelegateType),
      ...extra,
      source: "project",
      path,
      ...(brief ? { brief } : {}),
    },
    ignored,
  };
};

/**
 * Every type the project's `delegates/` folder holds, in name order, with
 * what kept the others out. A project without a folder, or without that
 * folder, has none. Links and anything over the folder's file limit are
 * refused: the folder's files are read whole, and only its own.
 */
export const readProjectTypes = (projectId: string): DelegateCatalog => {
  const types: CatalogType[] = [];
  const problems: TypeFileProblem[] = [];
  let dir: string;
  try {
    dir = join(projectRoot(projectId), DELEGATES);
    if (!lstatSync(dir).isDirectory()) {
      return { types, problems };
    }
  } catch {
    return { types, problems };
  }
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return { types, problems };
  }
  for (const file of names) {
    const match = TYPE_FILE.exec(file);
    if (!match) {
      continue;
    }
    const path = `${DELEGATES}/${file}`;
    const full = join(dir, file);
    const info = lstatSync(full);
    if (!info.isFile()) {
      problems.push({ path, problem: "not a plain file (a link or a folder)" });
      continue;
    }
    if (info.size > FOLDER_FILE_LIMIT) {
      problems.push({ path, problem: "larger than the folder reads" });
      continue;
    }
    const { type, problem, ignored } = parseTypeFile(
      match[1],
      path,
      readFileSync(full, "utf8")
    );
    if (problem) {
      problems.push({ path, problem });
    }
    if (ignored.length > 0) {
      problems.push({
        path,
        problem: `ignored ${ignored.map((key) => `“${key}”`).join(", ")}: a type reads harness, model, effort, skills, mcp, role, budget, lands, deny, can_delegate, cawco_todos, account and description`,
      });
    }
    if (type) {
      types.push(type);
    }
  }
  return { types, problems };
};

/** The catalog, resolver and route surface over the fleet's types and each project's. */
export interface ProjectDelegateTypes {
  /** The project's types and the fleet types they leave unshadowed, with what kept files out. */
  readonly catalog: (projectId: string | null | undefined) => DelegateCatalog;
  /** One name, as a session of that project resolves it: its project's type first. */
  readonly resolveTypeFor: (
    projectId: string | null | undefined,
    name: string
  ) => CatalogType | undefined;
  /** What a session of that project may name: project types, then unshadowed fleet types. */
  readonly typesFor: (projectId: string | null | undefined) => CatalogType[];
}

export const makeProjectDelegateTypes = (
  fleet: Pick<DelegateTypesShape, "list">
): ProjectDelegateTypes => {
  const catalog = (projectId: string | null | undefined): DelegateCatalog => {
    const fleetTypes = fleet.list();
    if (!projectId) {
      return {
        types: fleetTypes.map((type) => ({ ...type, source: "fleet" })),
        problems: [],
      };
    }
    const own = readProjectTypes(projectId);
    const names = new Set(own.types.map((type) => type.name));
    const fleetNames = new Set(fleetTypes.map((type) => type.name));
    return {
      types: [
        ...own.types.map((type) =>
          fleetNames.has(type.name) ? { ...type, shadows: true } : type
        ),
        ...fleetTypes
          .filter((type) => !names.has(type.name))
          .map((type) => ({ ...type, source: "fleet" as const })),
      ],
      problems: own.problems,
    };
  };
  const typesFor = (projectId: string | null | undefined): CatalogType[] =>
    catalog(projectId).types;
  return {
    catalog,
    typesFor,
    resolveTypeFor: (projectId, name) =>
      typesFor(projectId).find((type) => type.name === name),
  };
};

/**
 * `GET /api/projects/:id/delegate-types`: the catalog a session of that
 * project sees, and the files under `delegates/` that did not make a type.
 */
export const projectDelegateTypesRoutes = (
  types: ProjectDelegateTypes,
  projectExists: (id: string) => boolean
) =>
  new Elysia().get("/api/projects/:id/delegate-types", ({ params, status }) => {
    if (!projectExists(params.id)) {
      return status(404, `The hub keeps no project ${params.id}.`);
    }
    return types.catalog(params.id);
  });
