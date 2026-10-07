/**
 * Choices in previews (§5.7 of the Projects spec) and decision pages (§5.8).
 *
 * A previewed page marks choices (`data-cawco-choice="hero"` with
 * `data-option="b"`) or calls the overlay's `cawco.choose / note / set`. The
 * dashboard checks what the overlay says (`@cawco/core` choices.ts) and posts
 * it here, where it is kept per canvas: one previewed page, named by what it
 * is (`page:<project>:decisions/<name>`, or the machine, folder or port and
 * path), never by the session or the revision. So the picks outlive the
 * session that made the page, and a new revision that keeps its choice ids
 * keeps its picks. Each pick carries the page's content hash as served.
 *
 * The session reads them with `read_choices`, and gets one message when you
 * send (the dashboard's Send picks, or the page's `cawco.send()`): one per
 * send, and only when something changed since the last.
 *
 * A decision page is `decisions/<name>/index.html` in the project's hub
 * folder, written and shown by `decision_publish` (the decision-page skill
 * builds it); the hub serves it itself (preview.ts).
 */
import {
  CHOICE_ID_MAX,
  CHOICE_NOTE_MAX,
  CHOICE_OPTION_MAX,
  CHOICE_OPTIONS_MAX,
  CHOICE_SEND_TEXT_MAX,
  type ChoiceOp,
  type CommandResult,
  choiceOp,
  type InstanceRow,
  type PreviewChoices,
  type PreviewSource,
} from "@cawco/core";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import { tool } from "./admin-tools";
import type { DbShape } from "./db";
import type { CanvasRow } from "./db/choices";
import { quote } from "./landing";
import { contentHash, pageHash, pagePath, servedByHub } from "./preview";
import {
  FOLDER_FILE_LIMIT,
  type FolderAuthor,
  writeFolderFile,
} from "./project-folder";

/** Every choices tool, by name. */
export const CHOICE_TOOLS: ReadonlySet<string> = new Set([
  "read_choices",
  "decision_publish",
]);

/** A decision page's name: `onboarding`, `pricing-2`. */
const PAGE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DECISIONS = "decisions";
/** Picks one send message lists before it says how many more there are. */
const SEND_LINES = 60;
/** Canvases a bare `read_choices` answers. */
const READ_LIMIT = 10;
const CHOICE_ATTR = /data-cawco-choice\s*=\s*["']([^"']{1,100})["']/g;
const READ_TIMEOUT_MS = 30_000;
const INDEX_SUFFIX = /\/index\.html?$/i;
const SPACES = /\s+/g;

/** A refused choices request: the status and the sentence the caller reads. */
export class ChoicesRefusal extends Error {
  readonly status: 400 | 404 | 409 | 503;
  constructor(code: 400 | 404 | 409 | 503, message: string) {
    super(message);
    this.status = code;
  }
}

/** `decisions/<name>` from a name or any path into the page's folder. */
export const decisionPage = (raw: string): string => {
  const parts = raw.trim().replace(INDEX_SUFFIX, "").split("/").filter(Boolean);
  const name = parts[0] === DECISIONS ? parts[1] : parts[0];
  if (
    !name ||
    parts.length > (parts[0] === DECISIONS ? 2 : 1) ||
    !PAGE_NAME.test(name)
  ) {
    throw new ChoicesRefusal(
      400,
      `${raw} is not a decision page: name one like "onboarding" or decisions/onboarding (lowercase letters, digits and dashes, at most 64).`
    );
  }
  return `${DECISIONS}/${name}`;
};

/**
 * What `POST /api/instances/:id/preview` asks to show: a port, a folder, or a
 * decision page in the session's project (`page`, which the hub serves).
 */
export const askedPreview = (
  body: { port?: number; dir?: string; page?: string },
  projectId: string | null
): PreviewSource => {
  const asked = [body.port, body.dir, body.page].filter(
    (value) => value !== undefined
  ).length;
  if (asked !== 1) {
    throw new ChoicesRefusal(400, "Pass exactly one of port, dir or page.");
  }
  if (body.port !== undefined) {
    return { port: body.port };
  }
  if (body.dir !== undefined) {
    return { dir: body.dir };
  }
  if (!projectId) {
    throw new ChoicesRefusal(
      409,
      "This session is in no project, so it has no decision pages to show."
    );
  }
  return { project: projectId, page: decisionPage(body.page as string) };
};

/** What a canvas is, from the preview it is seen in and the page's path there. */
const canvasOf = (
  machineId: string,
  source: PreviewSource,
  path: string,
  projectId: string | null
): { key: string; page: string; projectId: string | null } => {
  if (servedByHub(source)) {
    return {
      key: `page:${source.project}:${source.page}`,
      page: source.page,
      projectId: source.project,
    };
  }
  const page = pagePath(path);
  return "dir" in source
    ? { key: `dir:${machineId}:${source.dir}:${page}`, page, projectId }
    : { key: `port:${machineId}:${source.port}:${page}`, page, projectId };
};

const pickLine = (pick: PreviewChoices["picks"][number]): string => {
  const said = pick.options?.join(", ") ?? pick.option ?? "nothing picked yet";
  return `- ${pick.id}: ${said}${pick.note ? ` (note: ${pick.note.replace(SPACES, " ")})` : ""}`;
};

export interface ChoicesDeps {
  db: DbShape;
  /** A session's row. */
  instance: (id: string) => InstanceRow | undefined;
  /** Shows a hub folder page as `instance`'s preview (server.ts `openPreview`). */
  openPage: (
    instance: InstanceRow,
    source: { project: string; page: string }
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Runs a command on a machine (server.ts `runOnMachine`): how a built page is read off it. */
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
  /** Puts one message into a session as yours; answers what became of it. */
  send: (
    instance: InstanceRow,
    content: string,
    uuid: string
  ) => { state: string; reason: string | null };
  /** The preview a session is showing, as preview.ts keeps it. */
  target: (
    instanceId: string
  ) => { machineId: string; source: PreviewSource } | undefined;
}

export const createChoices = (deps: ChoicesDeps) => {
  const store = deps.db.choices;

  const view = (row: CanvasRow): PreviewChoices => ({
    canvasId: row.id,
    page: row.page,
    projectId: row.projectId,
    instanceId: row.instanceId,
    contentHash: row.contentHash,
    picks: store.picks(row.id),
    dials: store.dials(row.id),
    sentAt: row.sentAt?.getTime() ?? null,
    unsent: !row.sentAt || row.changedAt > row.sentAt,
  });

  /** What the page a session's preview shows at `path` is, as a canvas. */
  const pageAt = (instanceId: string, path: string) => {
    const row = deps.instance(instanceId);
    if (!row) {
      throw new ChoicesRefusal(404, "The hub keeps no such session.");
    }
    const target = deps.target(instanceId);
    if (!target) {
      throw new ChoicesRefusal(
        409,
        "This session is showing no preview, so there is no page to keep picks for."
      );
    }
    return canvasOf(
      target.machineId,
      target.source,
      path,
      row.projectId ?? null
    );
  };

  /** The canvas a session's preview is showing at `path`, made on first use. */
  const canvasAt = (instanceId: string, path: string): CanvasRow =>
    store.ensureCanvas({
      ...pageAt(instanceId, path),
      instanceId,
      contentHash: pageHash(instanceId, path),
    });

  /** The picks, notes and dials on the page a session's preview shows. */
  const read = (instanceId: string, path: string): PreviewChoices => {
    const where = pageAt(instanceId, path);
    // A page that already has picks learns which session shows it now, and
    // the revision it is at; one without stays unmade until its first pick.
    return store.canvasByKey(where.key)
      ? view(canvasAt(instanceId, path))
      : {
          canvasId: null,
          page: where.page,
          projectId: where.projectId,
          instanceId,
          contentHash: pageHash(instanceId, path),
          picks: [],
          dials: {},
          sentAt: null,
          unsent: false,
        };
  };

  /** One pick, note or dial from the page; answers the canvas as it now is. */
  const apply = (
    instanceId: string,
    path: string,
    op: ChoiceOp
  ): PreviewChoices => {
    const canvas = canvasAt(instanceId, path);
    const done = store.apply(canvas.id, op, canvas.contentHash);
    if (!done.ok) {
      throw new ChoicesRefusal(409, done.refused);
    }
    return view(store.canvas(canvas.id) ?? canvas);
  };

  /** The one message a send makes, in your words. */
  const message = (choices: PreviewChoices, text?: string): string => {
    const where =
      choices.page.startsWith(`${DECISIONS}/`) && choices.projectId
        ? `${choices.page}/index.html in the project folder`
        : `the page at ${choices.page}`;
    const lines = choices.picks.slice(0, SEND_LINES).map(pickLine);
    const more = choices.picks.length - lines.length;
    const dials = Object.keys(choices.dials).length
      ? [`Dials: ${JSON.stringify(choices.dials).slice(0, 1000)}`]
      : [];
    return [
      `My picks on ${where}${choices.contentHash ? ` (revision ${choices.contentHash})` : ""}:`,
      ...lines,
      ...(more > 0 ? [`…and ${more} more.`] : []),
      ...dials,
      ...(text?.trim() ? ["", text.trim()] : []),
      "",
      `read_choices({ canvas: "${choices.canvasId}" }) has them in full.`,
    ].join("\n");
  };

  /** Sends the canvas's picks to the session that made the page: one message. */
  const send = (canvasId: string, uuid?: string, text?: string) => {
    const canvas = store.canvas(canvasId);
    if (!canvas) {
      throw new ChoicesRefusal(404, "The hub keeps no such canvas.");
    }
    const choices = view(canvas);
    if (choices.picks.length === 0 && Object.keys(choices.dials).length === 0) {
      throw new ChoicesRefusal(
        409,
        "Nothing is picked on this page yet. Pick or note something, then send."
      );
    }
    if (!choices.unsent) {
      throw new ChoicesRefusal(
        409,
        "These picks were already sent. Change one, then send again."
      );
    }
    const session = canvas.instanceId
      ? deps.instance(canvas.instanceId)
      : undefined;
    if (!session) {
      throw new ChoicesRefusal(
        409,
        "The session that made this page is gone, so there is no one to send to. The picks are kept; a session reads them with read_choices."
      );
    }
    const id = uuid ?? crypto.randomUUID();
    const sent = deps.send(session, message(choices, text), id);
    if (sent.state === "failed") {
      throw new ChoicesRefusal(
        409,
        `The session did not take the message: ${sent.reason ?? "it refused input"}. The picks are kept.`
      );
    }
    store.markSent(canvas.id);
    return { uuid: id, instanceId: session.id, state: sent.state };
  };

  // --- the MCP tools --------------------------------------------------------

  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });

  /** The canvases a bare read_choices answers: the caller's own, then its project's. */
  const canvasesFor = (actor: InstanceRow): CanvasRow[] => {
    const own = store.canvasesOf(actor.id);
    const project = actor.projectId
      ? store.canvasesOfProject(actor.projectId)
      : [];
    const seen = new Set<string>();
    return [...own, ...project]
      .filter((row) => !seen.has(row.id) && seen.add(row.id))
      .slice(0, READ_LIMIT);
  };

  const mayRead = (actor: InstanceRow, row: CanvasRow): boolean =>
    row.instanceId === actor.id ||
    (!!actor.projectId && row.projectId === actor.projectId);

  /** read_choices with `canvas`: one the caller or its project made. */
  const readCanvas = (me: InstanceRow, canvas: string) => {
    const row = store.canvas(canvas);
    if (!(row && mayRead(me, row))) {
      throw new Error(
        `No canvas ${canvas} that this session or its project made.`
      );
    }
    return view(row);
  };

  /** read_choices with `page`: a decision page in the caller's project. */
  const readPage = (me: InstanceRow, page: string) => {
    if (!me.projectId) {
      throw new Error(
        "This session is in no project, so it has no decision pages. Call read_choices without arguments for the pages your previews showed."
      );
    }
    const named = decisionPage(page);
    const row = store.canvasByKey(`page:${me.projectId}:${named}`);
    return row
      ? view(row)
      : {
          page: named,
          picks: [],
          dials: {},
          said: "Nothing has been picked on this page yet.",
        };
  };

  /** A bare read_choices: the caller's pages, then its project's. */
  const readOwn = (me: InstanceRow) => {
    const rows = canvasesFor(me);
    return rows.length
      ? rows.map(view)
      : {
          canvases: [],
          said: "No page you or your project showed has picks yet.",
        };
  };

  /** A built page off the session's own machine, as text; refused past the folder's file limit. */
  const readBuilt = async (
    actor: InstanceRow,
    path: string
  ): Promise<string> => {
    const answer = await deps.run(
      actor.machineId,
      actor.cwd,
      `test "$(wc -c < ${quote(path)})" -le ${FOLDER_FILE_LIMIT} || { echo "the file is over ${FOLDER_FILE_LIMIT / 1024} KiB" >&2; exit 3; }; base64 < ${quote(path)}`,
      READ_TIMEOUT_MS
    );
    if (answer.exitCode !== 0) {
      throw new Error(
        `${path} could not be read on ${actor.machineId}: ${answer.stderr.trim() || `exit ${answer.exitCode}`}.`
      );
    }
    return Buffer.from(answer.stdout.replace(SPACES, ""), "base64").toString(
      "utf8"
    );
  };

  const author = (actor: InstanceRow): FolderAuthor => ({
    name:
      actor.title?.trim() ||
      actor.derivedTitle?.trim() ||
      `session ${actor.id.slice(0, 8)}`,
  });

  const tools = (actor: InstanceRow | undefined) => {
    const caller = (): InstanceRow => {
      if (!actor) {
        throw new Error("Discovery cannot execute tools");
      }
      return actor;
    };
    return [
      tool(
        "read_choices",
        "Read what the operator picked, noted and set on a page you showed as a preview: each choice by its id (the page's data-cawco-choice or cawco.choose id) with the option or options picked, a note, and the page revision (content hash) it was picked on; plus dials (cawco.set). Picks survive your session and new revisions of the page while the choice ids stay the same. With `page`: a decision page in your project's folder (\"onboarding\" or decisions/onboarding). With `canvas`: the canvas id a sent message names. Without either: the pages your previews showed, then your project's, newest change first.",
        {
          page: z
            .string()
            .max(200)
            .optional()
            .describe(
              'A decision page in your project\'s folder: "onboarding" or decisions/onboarding.'
            ),
          canvas: z
            .string()
            .max(100)
            .optional()
            .describe("A canvas id, as a sent message names it."),
        },
        ({ page, canvas }) => {
          const me = caller();
          if (canvas) {
            return Promise.resolve(ok(readCanvas(me, canvas)));
          }
          return Promise.resolve(ok(page ? readPage(me, page) : readOwn(me)));
        }
      ),
      tool(
        "decision_publish",
        `Publish a decision page into your project's folder as decisions/<name>/index.html (a commit), and show it beside your transcript as your preview. Build the page with the decision-page skill: one self-contained HTML file, at most ${FOLDER_FILE_LIMIT / 1024} KiB, whose choices are marked data-cawco-choice="<id>" with data-option="<option>". Pass \`path\`, the built file's absolute path on your machine (the hub reads it; nothing passes through your context), or \`html\` for a small page. Publishing again under the same name is a new revision: picks stay with every choice id the new revision still has, so keep ids stable. The operator's picks reach you as one message when they send; read them any time with read_choices.`,
        {
          name: z
            .string()
            .regex(PAGE_NAME)
            .describe(
              "The page's folder name: lowercase letters, digits and dashes, e.g. onboarding."
            ),
          path: z
            .string()
            .startsWith("/")
            .max(1024)
            .optional()
            .describe(
              "Absolute path of the built index.html on this machine, as build.py wrote it."
            ),
          html: z
            .string()
            .min(1)
            .optional()
            .describe("The whole page, instead of `path`."),
          message: z
            .string()
            .max(2000)
            .optional()
            .describe(
              "The commit message; 'Publish decisions/<name>' by default."
            ),
        },
        async ({ name, path, html: given, message: commitMessage }) => {
          const me = caller();
          if (!me.projectId) {
            throw new Error(
              "This session is in no project, and a decision page lives in a project's folder. Make it a project first, or show a local page with show_preview."
            );
          }
          if ((path === undefined) === (given === undefined)) {
            throw new Error(
              "Pass exactly one of path (the built file on your machine) or html."
            );
          }
          const html = given ?? (await readBuilt(me, path as string));
          const page = `${DECISIONS}/${name}`;
          const written = await writeFolderFile(
            me.projectId,
            `${page}/index.html`,
            html,
            {
              author: author(me),
              message: commitMessage ?? `Publish ${page}`,
            }
          );
          const canvas = store.ensureCanvas({
            key: `page:${me.projectId}:${page}`,
            page,
            projectId: me.projectId,
            instanceId: me.id,
            contentHash: contentHash(html),
          });
          const opened = await deps.openPage(me, {
            project: me.projectId,
            page,
          });
          const onPage = new Set(
            [...html.matchAll(CHOICE_ATTR)].map((match) => match[1])
          );
          const kept = store.picks(canvas.id);
          const gone = kept.filter((pick) => !onPage.has(pick.id));
          return ok({
            page: `${page}/index.html`,
            commit: written.sha.slice(0, 12),
            changed: written.changed,
            canvas: canvas.id,
            contentHash: contentHash(html),
            choicesOnPage: onPage.size,
            picksKept: kept.length - gone.length,
            ...(gone.length
              ? {
                  picksNotOnPage: gone.map((pick) => pick.id),
                  said: "These ids have picks but are no longer marked on the page; the picks are kept in case they come back.",
                }
              : {}),
            preview: opened.ok
              ? "Shown beside your transcript."
              : `Not shown: ${opened.error}`,
          });
        }
      ),
    ];
  };

  return { read, apply, send, view, tools };
};

export type Choices = ReturnType<typeof createChoices>;

/** A refusal as a route's answer; anything else is thrown on. */
const refused = (error: unknown) => {
  if (error instanceof ChoicesRefusal) {
    return status(error.status, error.message);
  }
  throw error;
};

/**
 * The dashboard's routes: the picks on the page an instance's preview shows
 * (read and change, by the page's path there), and a send. Every body is checked again here, as `wire.ts` checks the overlay's.
 */
export const choiceRoutes = (choices: Choices) =>
  new Elysia()
    .get(
      "/api/instances/:id/preview/choices",
      { query: t.Object({ path: t.String({ maxLength: 1024 }) }) },
      ({ params, query }) => {
        try {
          return choices.read(params.id, query.path);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/instances/:id/preview/choices",
      {
        body: t.Object({
          path: t.String({ maxLength: 1024 }),
          op: t.Union([
            t.Literal("choose"),
            t.Literal("note"),
            t.Literal("set"),
          ]),
          id: t.Optional(t.String({ maxLength: CHOICE_ID_MAX })),
          option: t.Optional(
            t.Union([t.String({ maxLength: CHOICE_OPTION_MAX }), t.Null()])
          ),
          options: t.Optional(
            t.Array(t.String({ maxLength: CHOICE_OPTION_MAX }), {
              maxItems: CHOICE_OPTIONS_MAX,
            })
          ),
          text: t.Optional(t.String({ maxLength: CHOICE_NOTE_MAX })),
          key: t.Optional(t.String({ maxLength: CHOICE_ID_MAX })),
          value: t.Optional(t.Unknown()),
        }),
      },
      ({ params, body }) => {
        const op = choiceOp(body);
        if (!op) {
          return status(
            400,
            "That pick could not be kept: a choice needs an id and an option, a note an id and text, a dial a key and a value."
          );
        }
        try {
          return choices.apply(params.id, body.path, op);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/choices/:canvasId/send",
      {
        body: t.Object({
          uuid: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
          text: t.Optional(t.String({ maxLength: CHOICE_SEND_TEXT_MAX })),
        }),
      },
      ({ params, body }) => {
        try {
          return choices.send(params.canvasId, body.uuid, body.text);
        } catch (error) {
          return refused(error);
        }
      }
    );
