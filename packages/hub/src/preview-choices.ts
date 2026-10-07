/**
 * Choices in previews (Projects spec §5.7): the picks, notes and values a
 * page records through the overlay's bridge, kept per canvas in the hub.
 *
 * The page posts a change to the dashboard's pane, which checks it (wire.ts)
 * and sends it here; this checks it again against the same bounds
 * (`CHOICE_LIMITS`), stores it with the hash of the page it was made on, and
 * answers the canvas's whole state, which the pane hands back to the page.
 * The session reads the state with `read_choices`; when the person sends,
 * the session gets one message with every pick in it.
 *
 * A canvas is the preview's place, not the page: a decision page in a
 * project's hub folder (`decisions:<project>/<page>`), or a session's folder
 * or dev server on its machine (`dir:<machine>:<path>`,
 * `port:<machine>:<port>`). A revised page at the same place keeps every pick
 * whose id it still carries.
 */
import {
  type CanvasChoices,
  CHOICE_ID,
  CHOICE_LIMITS,
  type ChoiceChange,
  type ChoiceEntry,
  type InstanceRow,
  PAGE_HASH,
  type PreviewSource,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import type { CanvasRow, DbShape } from "./db";
import { previewTargets } from "./preview";

/** Where a preview's choices are kept: its place, on its machine or in its project. */
export const canvasId = (machineId: string, source: PreviewSource): string => {
  if ("project" in source) {
    return `decisions:${source.project}/${source.page}`;
  }
  return "port" in source
    ? `port:${machineId}:${source.port}`
    : `dir:${machineId}:${source.dir}`;
};

/** A canvas id as a person reads it. */
const placeOf = (id: string): string => {
  if (id.startsWith("decisions:")) {
    return `decisions/${id.slice(id.indexOf("/") + 1)}`;
  }
  const [kind, , ...rest] = id.split(":");
  return kind === "port" ? `localhost:${rest.join(":")}` : rest.join(":");
};

/** A decision page's name: one folder under `decisions/`. */
export const DECISION_PAGE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export class ChoicesRefusal extends Error {
  readonly status: 400 | 404 | 409 | 413;
  constructor(status: 400 | 404 | 409 | 413, message: string) {
    super(message);
    this.status = status;
  }
}

/** The canvas's state as the pane and `read_choices` read it. */
export const canvasChoices = (
  db: Pick<DbShape, "canvasChoices">,
  canvas: CanvasRow
): CanvasChoices => ({
  canvas: canvas.id,
  pageHash: canvas.pageHash,
  sentAt: canvas.sentAt?.toISOString() ?? null,
  choices: Object.fromEntries(
    db.canvasChoices(canvas.id).map((row) => [
      row.choice,
      {
        options: row.options,
        note: row.note,
        value: row.value ?? null,
        pageHash: row.pageHash,
        at: row.updatedAt.toISOString(),
      } satisfies ChoiceEntry,
    ])
  ),
});

/** The same checks the pane makes (wire.ts `previewChoice`), here refusals with a reason. */
const checked = (change: ChoiceChange): ChoiceChange => {
  const id = (value: string, max: number, what: string) => {
    if (value.length > max || !CHOICE_ID.test(value)) {
      throw new ChoicesRefusal(
        400,
        `${what} must be 1 to ${max} characters, with no control characters and no spaces at either end.`
      );
    }
  };
  id(change.choice, CHOICE_LIMITS.id, "A choice's id");
  if (!PAGE_HASH.test(change.pageHash)) {
    throw new ChoicesRefusal(400, "pageHash must be the page's sha256, hex.");
  }
  const fields = ["options", "note", "value"].filter((key) => key in change);
  if (fields.length !== 1) {
    throw new ChoicesRefusal(
      400,
      "Change exactly one of options, note or value."
    );
  }
  if ("options" in change) {
    if (change.options.length > CHOICE_LIMITS.options) {
      throw new ChoicesRefusal(
        413,
        `A choice holds at most ${CHOICE_LIMITS.options} options.`
      );
    }
    for (const option of change.options) {
      id(option, CHOICE_LIMITS.option, "An option");
    }
  }
  if ("note" in change && change.note.length > CHOICE_LIMITS.note) {
    throw new ChoicesRefusal(
      413,
      `A note stops at ${CHOICE_LIMITS.note} characters.`
    );
  }
  if (
    "value" in change &&
    JSON.stringify(change.value).length > CHOICE_LIMITS.value
  ) {
    throw new ChoicesRefusal(
      413,
      `A set value stops at ${CHOICE_LIMITS.value} characters of JSON.`
    );
  }
  return change;
};

/** One line per id for the message a send makes, cut to fit one message. */
const MESSAGE_MAX = 8000;
const summary = (state: CanvasChoices): string => {
  const lines = Object.entries(state.choices).map(([id, entry]) => {
    const parts = [
      entry.options.length > 0 ? entry.options.join(", ") : null,
      entry.value === null ? null : `value ${JSON.stringify(entry.value)}`,
      entry.note ? `note: ${JSON.stringify(entry.note)}` : null,
      state.pageHash && entry.pageHash !== state.pageHash
        ? "made on an earlier revision"
        : null,
    ].filter(Boolean);
    return `- ${id}: ${parts.length > 0 ? parts.join("; ") : "cleared"}`;
  });
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length > MESSAGE_MAX) {
      kept.push(
        `- … ${lines.length - kept.length} more; read_choices has them all.`
      );
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n");
};

export const sentMessage = (state: CanvasChoices, text?: string): string =>
  `I sent my picks from the preview of ${placeOf(state.canvas)}:\n\n${summary(state)}${text ? `\n\n${text}` : ""}\n\nread_choices returns them in full, with the page hash each was made on.`;

/**
 * The choices routes, on the session whose preview shows the canvas. Writes
 * and sends need that preview open; a read falls back to the canvas the
 * session showed last, so `read_choices` works after the pane is closed.
 */
export const previewChoicesRoutes = (deps: {
  db: Pick<
    DbShape,
    | "canvas"
    | "canvasChoices"
    | "latestCanvasOf"
    | "putCanvasChoice"
    | "markCanvasSent"
    | "touchCanvas"
  >;
  instance: (id: string) => InstanceRow | undefined;
  /** Puts the person's message into the session. */
  deliver: (instance: InstanceRow, content: string) => void;
}) => {
  const { db } = deps;
  const sessionOf = (id: string): InstanceRow => {
    const row = deps.instance(id);
    if (!row) {
      throw new ChoicesRefusal(404, "Session not found.");
    }
    return row;
  };
  /** The canvas the session's open preview shows, filed on first use. */
  const openCanvas = (instance: InstanceRow): CanvasRow => {
    const target = previewTargets.get(instance.id);
    if (!target) {
      throw new ChoicesRefusal(
        409,
        "This session shows no preview; its choices are kept with the preview it shows."
      );
    }
    const id = canvasId(target.machineId, target.source);
    return db.canvas(id) ?? db.touchCanvas({ id, instanceId: instance.id });
  };
  const readCanvas = (instance: InstanceRow, page?: string): CanvasRow => {
    if (page !== undefined) {
      if (!instance.projectId) {
        throw new ChoicesRefusal(
          409,
          "This session belongs to no project, so it has no decision pages."
        );
      }
      const id = canvasId("", { project: instance.projectId, page });
      const canvas = db.canvas(id);
      if (!canvas) {
        throw new ChoicesRefusal(
          404,
          `Nobody has picked anything on decisions/${page} yet.`
        );
      }
      return canvas;
    }
    if (previewTargets.has(instance.id)) {
      return openCanvas(instance);
    }
    const last = db.latestCanvasOf(instance.id);
    if (!last) {
      throw new ChoicesRefusal(
        404,
        "This session has shown no preview with choices."
      );
    }
    return last;
  };
  const refused = (error: unknown) => {
    if (error instanceof ChoicesRefusal) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  };

  return (
    new Elysia()
      .get(
        "/api/instances/:id/preview/choices",
        {
          query: t.Object({
            page: t.Optional(t.String({ pattern: DECISION_PAGE.source })),
          }),
        },
        ({ params, query }) => {
          try {
            return canvasChoices(
              db,
              readCanvas(sessionOf(params.id), query.page)
            );
          } catch (error) {
            return refused(error);
          }
        }
      )
      .put(
        "/api/instances/:id/preview/choices",
        {
          body: t.Object({
            choice: t.String({ minLength: 1, maxLength: CHOICE_LIMITS.id }),
            pageHash: t.String({ pattern: PAGE_HASH.source }),
            options: t.Optional(
              t.Array(t.String({ maxLength: CHOICE_LIMITS.option }), {
                maxItems: CHOICE_LIMITS.options,
              })
            ),
            note: t.Optional(t.String({ maxLength: CHOICE_LIMITS.note })),
            value: t.Optional(t.Unknown()),
          }),
        },
        ({ params, body }) => {
          try {
            const change = checked(body as ChoiceChange);
            const canvas = openCanvas(sessionOf(params.id));
            const rows = db.canvasChoices(canvas.id);
            const before = rows.find((row) => row.choice === change.choice);
            if (!before && rows.length >= CHOICE_LIMITS.perCanvas) {
              throw new ChoicesRefusal(
                413,
                `A canvas keeps at most ${CHOICE_LIMITS.perCanvas} ids.`
              );
            }
            db.putCanvasChoice({
              canvasId: canvas.id,
              choice: change.choice,
              options:
                "options" in change ? change.options : (before?.options ?? []),
              note:
                "note" in change ? change.note || null : (before?.note ?? null),
              value:
                "value" in change
                  ? (change.value ?? null)
                  : (before?.value ?? null),
              pageHash: change.pageHash,
              updatedAt: new Date(),
            });
            return canvasChoices(db, db.canvas(canvas.id) ?? canvas);
          } catch (error) {
            return refused(error);
          }
        }
      )
      // The session whose preview it is hears the picks, as the person's own message.
      // A page's `ui/message` adds its text below the picks.
      .post(
        "/api/instances/:id/preview/choices/send",
        {
          body: t.Optional(
            t.Object({
              text: t.Optional(t.String({ maxLength: CHOICE_LIMITS.note })),
            })
          ),
        },
        ({ params, body }) => {
          try {
            const instance = sessionOf(params.id);
            const canvas = openCanvas(instance);
            const state = canvasChoices(db, canvas);
            if (Object.keys(state.choices).length === 0) {
              throw new ChoicesRefusal(409, "Nothing is picked yet.");
            }
            deps.deliver(instance, sentMessage(state, body?.text?.trim()));
            db.markCanvasSent(canvas.id, new Date());
            return canvasChoices(db, db.canvas(canvas.id) ?? canvas);
          } catch (error) {
            return refused(error);
          }
        }
      )
  );
};
