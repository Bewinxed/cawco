/**
 * A project's own delegate types (Projects spec §5.1, D16): one file each in
 * the project folder's `delegates/`, shadowing a fleet type of the same name.
 * A project in an area (core areas.ts) also has its area's, from the area
 * folder's `delegates/`, read the same way: the project's own shadow the
 * area's, and both shadow the fleet's.
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
 * The file's name is the type's name; the body is its description (what a
 * calling model routes by), unless the front matter gives one. A type is a
 * preset: there is no persona text. `deny` (Claude's tool
 * names) and `may_start` (`[browser]`, or `any`) mean what a fleet type's
 * `denyTools` and `mayStart` mean, and `account:` names the account its sessions prefer
 * (an account id).
 *
 * Files are the truth: the catalog is read from the folder each time it is
 * asked for, synchronously (a handful of small files), so the work-item path
 * that resolves a type in one synchronous step can ask too. A file that does
 * not make a type is left out of the catalog and named in `problems`, never
 * guessed at.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SettingSource } from "@cawco/core/areas";
import {
  DELEGATE_TYPE_NAME,
  type DelegateType,
  delegateTypeProblem,
  mayStartProblem,
  SESSION_ROLES,
  type SessionRole,
} from "@cawco/core/delegate-types";
import { type FrontMatterLine, frontMatterBlock } from "@cawco/core/fleet";
import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
import { delegateTypesWords } from "@cawco/core/words/delegate-types";
import { Elysia, ElysiaStatus } from "elysia";
import type { DelegateTypesShape } from "./db/delegate-types";
import { areaFolder, FOLDER_FILE_LIMIT, projectRoot } from "./project-folder";
import { refusal } from "./refusal";
import { listOf, scalarOf } from "./task-file";

/**
 * The toolsets a type may run in (§5.3's roles): every role but `curator`,
 * which is the memory curator run's alone (the hub starts it, never a type).
 */
const TYPE_ROLES = SESSION_ROLES.filter((role) => role !== "curator");

const BUDGET_PERIODS = ["attempt", "task", "day", "week", "month"] as const;

/** A type's spending limit: any of cost, turns and time, per a period. */
interface DelegateBudget {
  minutes?: number;
  per?: (typeof BUDGET_PERIODS)[number];
  turns?: number;
  usd?: number;
}

/** One entry of a catalog, saying where it comes from. */
type CatalogType = DelegateType & {
  budget?: DelegateBudget;
  lands?: LandsMode;
  /** The file it was read from, inside its folder (the project's, or its area's). */
  path?: string;
  /** A project or area type that replaces a type of the same name below it. */
  shadows?: boolean;
  source: SettingSource;
};

/** A file under `delegates/` that did not make a type, or a field one ignored. */
interface TypeFileProblem {
  path: string;
  problem: string;
  /** The folder it is in: the project's, or its area's. */
  source: Exclude<SettingSource, "fleet">;
}

export interface DelegateCatalog {
  problems: TypeFileProblem[];
  types: CatalogType[];
}

const DELEGATES = "delegates";
const TYPE_FILE = /^(.+)\.md$/u;
const NUMBER = /^\d+(?:\.\d+)?$/u;
const PAIR = /^([A-Za-z_]+)\s*:\s*(.*)$/u;
const LEADING_SPACE = /^\s+/u;

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
  "may_start",
  "account",
  "description",
]);

/** `{ usd: 2, per: day }`, or the same pairs indented under the key. */
const budgetOf = (line: FrontMatterLine): DelegateBudget | string => {
  const flow = line.value.trim();
  const pairs = flow.startsWith("{")
    ? flow.replace(/^\{|\}$/gu, "").split(",")
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
      "budget" | "lands" | "connections" | "role" | "mayStart"
    > => {
  const role = fields.scalar("role");
  if (role === "curator") {
    return delegateTypesWords.problemCuratorRole;
  }
  if (!oneOf(role, TYPE_ROLES)) {
    return `role is one of ${TYPE_ROLES.join(", ")}, not “${role}”`;
  }
  const lands = fields.scalar("lands");
  if (!oneOf(lands, LANDS_MODES)) {
    return `lands is one of ${LANDS_MODES.join(", ")}, not “${lands}”`;
  }
  // `may_start: any` reads as the list `[any]`.
  const mayStart = fields.list("may_start");
  const mayStartWrong = mayStart ? mayStartProblem(mayStart) : undefined;
  if (mayStartWrong) {
    return `may_start: ${mayStartWrong}`;
  }
  const budgetLine = fields.line("budget");
  const budget = budgetLine ? budgetOf(budgetLine) : undefined;
  if (typeof budget === "string") {
    return budget;
  }
  // `mcp:` names connections (§5.1): the hub calls them, the session never
  // holds their keys.
  const connections = fields.list("mcp");
  return {
    ...(connections?.length ? { connections } : {}),
    ...(role ? { role: role as SessionRole } : {}),
    ...(budget && Object.keys(budget).length > 0 ? { budget } : {}),
    ...(lands ? { lands: lands as LandsMode } : {}),
    ...(mayStart?.length ? { mayStart } : {}),
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
  const body = block.body.trim();
  const effort = fields.scalar("effort");
  const skills = fields.list("skills");
  const deny = fields.list("deny");
  const account = fields.scalar("account");
  const draft: Partial<DelegateType> = {
    name,
    description: fields.scalar("description") ?? body,
    harness: harness as DelegateType["harness"],
    model: fields.scalar("model") ?? "",
    ...(effort ? { effort: effort as DelegateType["effort"] } : {}),
    ...(skills?.length ? { skills } : {}),
    ...(deny?.length ? { denyTools: deny } : {}),
    ...(account ? { account } : {}),
    ...(extra.connections ? { connections: extra.connections } : {}),
    ...(extra.mayStart ? { mayStart: extra.mayStart } : {}),
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
    },
    ignored,
  };
};

/** The words naming the fields a type file had no use for. */
const ignoredWords = (ignored: string[]): string =>
  `ignored ${ignored.map((key) => `“${key}”`).join(", ")}: a type reads harness, model, effort, skills, mcp, role, budget, lands, deny, may_start, account and description`;

/**
 * Why `content` written at `path` (`delegates/<name>.md`) would not make a
 * type whole, or nothing when it would: what Caw's proposed type is checked
 * against before the person sees it (memory.ts `proposeType`).
 */
export const typeFileProblem = (
  path: string,
  content: string
): string | undefined => {
  const match = TYPE_FILE.exec(path.slice(DELEGATES.length + 1));
  if (!(path.startsWith(`${DELEGATES}/`) && match)) {
    return `${path} is not a type file: write delegates/<name>.md.`;
  }
  const { problem, ignored } = parseTypeFile(match[1], path, content);
  return problem ?? (ignored.length > 0 ? ignoredWords(ignored) : undefined);
};

/**
 * Every type the project's `delegates/` folder holds, in name order, with
 * what kept the others out. A project without a folder, or without that
 * folder, has none. Links and anything over the folder's file limit are
 * refused: the folder's files are read whole, and only its own.
 */
const readFolderTypes = (
  folder: string,
  source: Exclude<SettingSource, "fleet">
): DelegateCatalog => {
  const types: CatalogType[] = [];
  const problems: TypeFileProblem[] = [];
  let dir: string;
  const root = projectRoot(folder);
  if (root instanceof ElysiaStatus) {
    return { types, problems };
  }
  try {
    dir = join(root, DELEGATES);
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
      problems.push({
        path,
        problem: "not a plain file (a link or a folder)",
        source,
      });
      continue;
    }
    if (info.size > FOLDER_FILE_LIMIT) {
      problems.push({ path, problem: "larger than the folder reads", source });
      continue;
    }
    const { type, problem, ignored } = parseTypeFile(
      match[1],
      path,
      readFileSync(full, "utf8")
    );
    if (problem) {
      problems.push({ path, problem, source });
    }
    if (ignored.length > 0) {
      problems.push({ path, problem: ignoredWords(ignored), source });
    }
    if (type) {
      types.push({ ...type, source });
    }
  }
  return { types, problems };
};

/** The catalog, resolver and route surface over the fleet's types and each project's. */
export interface ProjectDelegateTypes {
  /** The project's types, its area's they leave unshadowed, then the fleet's either leaves, with what kept files out. */
  readonly catalog: (projectId: string | null | undefined) => DelegateCatalog;
  /** One name, as a session of that project resolves it: its project's type first. */
  readonly resolveTypeFor: (
    projectId: string | null | undefined,
    name: string
  ) => CatalogType | undefined;
  /** What a session of that project may name: project types, then its area's, then the fleet's, each unshadowed. */
  readonly typesFor: (projectId: string | null | undefined) => CatalogType[];
}

export const makeProjectDelegateTypes = (
  fleet: Pick<DelegateTypesShape, "list">,
  /** The area a project sits in now; null: none. */
  areaOf: (projectId: string) => string | null
): ProjectDelegateTypes => {
  const catalog = (projectId: string | null | undefined): DelegateCatalog => {
    const fleetTypes: CatalogType[] = fleet
      .list()
      .map((type) => ({ ...type, source: "fleet" as const }));
    if (!projectId) {
      return { types: fleetTypes, problems: [] };
    }
    const areaId = areaOf(projectId);
    const layers = [
      readFolderTypes(projectId, "project"),
      ...(areaId ? [readFolderTypes(areaFolder(areaId), "area")] : []),
      { types: fleetTypes, problems: [] },
    ];
    // Each layer's types that no layer above names; each marked when it
    // replaces one below.
    const types: CatalogType[] = [];
    const named = new Set<string>();
    layers.forEach((layer, at) => {
      const below = new Set(
        layers.slice(at + 1).flatMap((one) => one.types.map((t) => t.name))
      );
      for (const type of layer.types) {
        if (named.has(type.name)) {
          continue;
        }
        types.push(below.has(type.name) ? { ...type, shadows: true } : type);
      }
      for (const type of layer.types) {
        named.add(type.name);
      }
    });
    return { types, problems: layers.flatMap((layer) => layer.problems) };
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
  new Elysia().get("/api/projects/:id/delegate-types", ({ params }) => {
    if (!projectExists(params.id)) {
      return refusal(
        404,
        "no-project",
        `The hub keeps no project ${params.id}.`
      );
    }
    return types.catalog(params.id);
  });
