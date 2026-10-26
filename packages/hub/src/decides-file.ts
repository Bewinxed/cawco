/**
 * A project's Who decides (PRD §5.8, core decides.ts), as it declares it:
 * `decides.md` in its hub folder, beside `gate.md`, in the gate file's
 * grammar (gate-file.ts). Each kind routes to `you`, `advisor`, `practice`
 * or `agent`; a kind the file leaves out takes the fleet's route (the one
 * `decides_settings` row, `GET`/`PUT /api/decides`), and one the fleet
 * leaves out core `DEFAULT_ROUTES`'s.
 *
 * ```
 * ---
 * Look and words: you
 * Approach: advisor
 * Tools and conventions: practice
 * Advisor: advisor
 * Yours:
 *   DESIGN.md
 *   packages/core/src/injected.ts
 * ---
 * Anything after the block is notes for people; the hub reads none of it.
 * ```
 *
 * - **A kind's line**: its name (core `DECISION_KIND_WORDS`, any case), a
 *   colon, and its route.
 * - **`Advisor:`** the delegate type an advisor runs as; the fleet's, else
 *   core `DEFAULT_ADVISOR`, when not given.
 * - **`Yours:`** opens the paths, one per indented line from the
 *   repository's root, whose change needs a card the person picked. Read and
 *   kept now; held at landing in a later slice.
 *
 * A decides.md that does not read is never taken for none: every kind is
 * the person's until it reads, and the hub says why with each card's route.
 */
import {
  DECIDES_ROUTES,
  DECISION_KIND_WORDS,
  DECISION_KINDS,
  DEFAULT_ADVISOR,
  DEFAULT_ROUTES,
  type DecidesRoute,
  type DecidesTable,
  type DecisionKind,
  type FleetDecides,
  kindNamed,
} from "@cawco/core/decides";
import { Elysia, t } from "elysia";
import type { DecidesDb } from "./db/decides";
import { FolderRefusal, readFolderFile, refused } from "./project-folder";

/** A refusal of `settle`, in one sentence. */
export class SettleRefusal extends Error {
  readonly status: 403 | 409;

  constructor(status: 403 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/** The file in the project's folder that declares its Who decides. */
export const DECIDES_FILE = "decides.md";

/** What reading decides.md answers: the routes and advisor it gives, and its own paths; or every problem it has. */
export type DecidesReading =
  | {
      advisor?: string;
      ok: true;
      routes: Partial<Record<DecisionKind, DecidesRoute>>;
      yours: string[];
    }
  | { ok: false; problems: string[] };

const FENCE = /^---\s*$/u;
const LINE_SPLIT = /\r?\n/u;
const INDENTED = /^\s/u;
const LINE = /^([^:]+):\s*(.*)$/u;
const LEADING = /^\.\//u;
const DELEGATE_TYPE = /^[a-z0-9][a-z0-9-]{0,62}$/u;

/** What reading the block holds so far. */
interface BlockRead {
  advisor?: string;
  /** The indented lines now are `Yours:` paths. */
  inYours: boolean;
  problems: string[];
  routes: Partial<Record<DecisionKind, DecidesRoute>>;
  yours?: string[];
}

/** One `Yours:` path as the diff names paths: from the repository's root. */
const yoursPath = (raw: string): { path: string } | { problem: string } => {
  const path = raw.trim().replace(LEADING, "");
  if (path.startsWith("/")) {
    return {
      problem: `Yours: ${path} is absolute; name it from the repository's root, like DESIGN.md.`,
    };
  }
  if (path.split("/").includes("..")) {
    return {
      problem: `Yours: ${path} climbs out of the repository with “..”.`,
    };
  }
  return { path };
};

/** `Advisor:`, the delegate type an advisor runs as. */
const advisorLine = (read: BlockRead, value: string): void => {
  if (read.advisor !== undefined) {
    read.problems.push("Advisor: is given twice.");
  } else if (DELEGATE_TYPE.test(value)) {
    read.advisor = value;
  } else {
    read.problems.push(
      `Advisor: “${value}” is not a delegate type's name, like advisor.`
    );
  }
};

/** A kind's line: its route. */
const kindLine = (read: BlockRead, kind: DecisionKind, value: string): void => {
  const route = value.toLowerCase();
  if (read.routes[kind] !== undefined) {
    read.problems.push(`${DECISION_KIND_WORDS[kind].name} is given twice.`);
  } else if ((DECIDES_ROUTES as readonly string[]).includes(route)) {
    read.routes[kind] = route as DecidesRoute;
  } else {
    read.problems.push(
      `“${value}” is not a route; a kind goes to ${DECIDES_ROUTES.join(", ")}.`
    );
  }
};

/** One line at the margin: a kind's route, `Advisor:` or `Yours:`. */
const marginLine = (read: BlockRead, text: string): void => {
  read.inYours = false;
  const line = LINE.exec(text);
  const name = line?.[1]?.trim() ?? "";
  const value = line?.[2]?.trim() ?? "";
  if (!line) {
    read.problems.push(
      `“${text}” is not a line of decides.md: a kind and its route (Approach: advisor), Advisor: or Yours:.`
    );
    return;
  }
  if (name.toLowerCase() === "advisor") {
    advisorLine(read, value);
    return;
  }
  if (name.toLowerCase() === "yours") {
    if (read.yours) {
      read.problems.push("Yours: is given twice; list every path under one.");
    } else if (value) {
      read.problems.push(
        `Yours: takes its paths on the indented lines under it, one each, not “${value}” beside it.`
      );
    }
    read.yours ??= [];
    read.inYours = true;
    return;
  }
  const kind = kindNamed(name);
  if (kind) {
    kindLine(read, kind, value);
    return;
  }
  read.problems.push(
    `“${name}” is not a kind; the kinds are ${DECISION_KINDS.map((each) => DECISION_KIND_WORDS[each].name).join(", ")}.`
  );
};

/** decides.md's block as routes, its advisor and its paths, or every problem it has. */
export const readDecides = (content: string): DecidesReading => {
  const lines = content.split(LINE_SPLIT);
  const start = lines.findIndex((line) => line.trim() !== "");
  const end =
    start >= 0 && FENCE.test(lines[start] ?? "")
      ? lines.findIndex((line, at) => at > start && FENCE.test(line))
      : -1;
  if (end < 0) {
    return {
      ok: false,
      problems: [
        "decides.md holds no block: its lines go between a --- line and the next --- line.",
      ],
    };
  }
  const read: BlockRead = { inYours: false, problems: [], routes: {} };
  for (const line of lines.slice(start + 1, end)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) {
      continue;
    }
    if (!INDENTED.test(line)) {
      marginLine(read, text);
    } else if (read.inYours) {
      const path = yoursPath(text);
      if ("problem" in path) {
        read.problems.push(path.problem);
      } else {
        read.yours?.push(path.path);
      }
    } else {
      read.problems.push(
        `“${text}” is indented outside Yours:; only Yours: takes lines under it.`
      );
    }
  }
  if (read.problems.length > 0) {
    return { ok: false, problems: read.problems };
  }
  return {
    ok: true,
    routes: read.routes,
    yours: read.yours ?? [],
    ...(read.advisor ? { advisor: read.advisor } : {}),
  };
};

/** decides.md as the project's folder holds it now, read; undefined with none. */
const decidesReading = async (
  projectId: string
): Promise<DecidesReading | undefined> => {
  try {
    const { content } = await readFolderFile(projectId, DECIDES_FILE);
    return readDecides(content);
  } catch (error) {
    if (error instanceof FolderRefusal && error.status === 404) {
      return;
    }
    throw error;
  }
};

/** Where a kind's route came from: the project's file, the fleet's table, or the defaults. */
const whence = (
  project: DecidesRoute | undefined,
  shared: DecidesRoute | undefined
): DecidesTable["from"][DecisionKind] => {
  if (project) {
    return "project";
  }
  return shared ? "fleet" : "default";
};

/**
 * The Who decides a card is settled by: the project's decides.md over the
 * fleet's, over core `DEFAULT_ROUTES`; outside a project (`projectId`
 * null), the fleet's. A decides.md that does not read routes every kind to
 * the person, its problems said.
 */
export const decidesTable = async (
  projectId: string | null,
  fleet: FleetDecides
): Promise<DecidesTable> => {
  const reading = projectId ? await decidesReading(projectId) : undefined;
  const own = reading?.ok ? reading.routes : {};
  const routes = {} as Record<DecisionKind, DecidesRoute>;
  const from = {} as DecidesTable["from"];
  for (const kind of DECISION_KINDS) {
    const project = own[kind];
    const shared = fleet.routes[kind];
    routes[kind] =
      reading?.ok === false
        ? "you"
        : (project ?? shared ?? DEFAULT_ROUTES[kind]);
    from[kind] = whence(project, shared);
  }
  return {
    routes,
    from,
    advisor:
      (reading?.ok ? reading.advisor : undefined) ??
      fleet.advisor ??
      DEFAULT_ADVISOR,
    yours: reading?.ok ? reading.yours : [],
    problems: reading?.ok === false ? reading.problems : [],
  };
};

const ROUTE = t.Union(DECIDES_ROUTES.map((route) => t.Literal(route)));

/**
 * `GET /api/projects/:id/decides`: the project's Who decides as the hub
 * reads it now (decides.md over the fleet's). `GET`/`PUT /api/decides`: the
 * fleet's, the default every project shows until it overrides a kind. The
 * project's file is written as any folder file is (`PUT
 * /api/projects/:id/folder/file` with `path: "decides.md"`).
 */
export const decidesRoutes = (
  db: DecidesDb,
  projectExists: (id: string) => boolean
) =>
  new Elysia()
    .get("/api/decides", (): FleetDecides => db.fleet())
    .put(
      "/api/decides",
      {
        body: t.Object({
          routes: t.Partial(
            t.Object(
              Object.fromEntries(
                DECISION_KINDS.map((kind) => [kind, ROUTE])
              ) as Record<DecisionKind, typeof ROUTE>
            )
          ),
          advisor: t.Nullable(t.String({ pattern: DELEGATE_TYPE.source })),
        }),
      },
      ({ body }): FleetDecides => {
        db.setFleet({ routes: body.routes, advisor: body.advisor });
        return db.fleet();
      }
    )
    .get("/api/projects/:id/decides", async ({ params }) => {
      try {
        if (!projectExists(params.id)) {
          throw new FolderRefusal(
            404,
            `The hub keeps no project ${params.id}.`
          );
        }
        return {
          file: DECIDES_FILE,
          decides: await decidesTable(params.id, db.fleet()),
        };
      } catch (error) {
        return refused(error);
      }
    });
