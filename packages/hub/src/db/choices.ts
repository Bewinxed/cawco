/**
 * The canvases' store (choices.ts): picks, notes and dials per previewed page.
 * Kept apart from `index.ts`'s one big shape so the queries for this one
 * feature sit together; `index.ts` hands it the connection.
 */
import {
  CHOICES_PER_CANVAS,
  type ChoiceOp,
  DIALS_PER_CANVAS,
  type PreviewChoice,
} from "@cawco/core";
import { and, count, desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { previewCanvases, previewChoices, previewDials } from "./schema";

export type CanvasRow = typeof previewCanvases.$inferSelect;

export interface ChoicesStore {
  /** Applies one pick, note or dial; a refusal says why in a sentence. */
  readonly apply: (
    canvasId: string,
    op: ChoiceOp,
    hash: string | null
  ) => { ok: true } | { ok: false; refused: string };
  readonly canvas: (id: string) => CanvasRow | undefined;
  readonly canvasByKey: (key: string) => CanvasRow | undefined;
  /** The canvases a session's previews made, newest change first. */
  readonly canvasesOf: (instanceId: string) => CanvasRow[];
  /** A project's canvases, newest change first. */
  readonly canvasesOfProject: (projectId: string) => CanvasRow[];
  readonly dials: (canvasId: string) => Record<string, unknown>;
  /**
   * The canvas for `key`, made on first use. Each call records the session
   * the page is now a preview of and, when known, the page's hash.
   */
  readonly ensureCanvas: (canvas: {
    contentHash: string | null;
    instanceId: string;
    key: string;
    page: string;
    projectId: string | null;
  }) => CanvasRow;
  readonly markSent: (canvasId: string) => void;
  readonly picks: (canvasId: string) => PreviewChoice[];
}

/** A choice after one pick or note: a note leaves the pick, a pick leaves the note. */
const nextChoice = (
  known: typeof previewChoices.$inferSelect | undefined,
  op: Exclude<ChoiceOp, { op: "set" }>
): { note: string | null; option: string | null; options: string[] | null } => {
  const kept = {
    option: known?.option ?? null,
    options: known?.options ?? null,
    note: known?.note ?? null,
  };
  if (op.op === "note") {
    return { ...kept, note: op.text.trim() ? op.text : null };
  }
  if ("options" in op) {
    return {
      ...kept,
      option: null,
      options: op.options.length ? op.options : null,
    };
  }
  return { ...kept, option: op.option, options: null };
};

export const choicesStore = (db: BunSQLiteDatabase): ChoicesStore => {
  const canvas = (id: string) =>
    db.select().from(previewCanvases).where(eq(previewCanvases.id, id)).get();
  const canvasByKey = (key: string) =>
    db.select().from(previewCanvases).where(eq(previewCanvases.key, key)).get();
  const choiceRow = (canvasId: string, choiceId: string) =>
    db
      .select()
      .from(previewChoices)
      .where(
        and(
          eq(previewChoices.canvasId, canvasId),
          eq(previewChoices.choiceId, choiceId)
        )
      )
      .get();
  const touch = (canvasId: string, at: Date) =>
    db
      .update(previewCanvases)
      .set({ changedAt: at })
      .where(eq(previewCanvases.id, canvasId))
      .run();

  const applyChoice = (
    canvasId: string,
    op: Exclude<ChoiceOp, { op: "set" }>,
    hash: string | null,
    at: Date
  ): { ok: true } | { ok: false; refused: string } => {
    const known = choiceRow(canvasId, op.id);
    if (!known) {
      const held =
        db
          .select({ n: count() })
          .from(previewChoices)
          .where(eq(previewChoices.canvasId, canvasId))
          .get()?.n ?? 0;
      if (held >= CHOICES_PER_CANVAS) {
        return {
          ok: false,
          refused: `This page already holds ${CHOICES_PER_CANVAS} choices, the most one canvas keeps; ${op.id} was not kept.`,
        };
      }
    }
    const next = nextChoice(known, op);
    if (next.option === null && next.options === null && next.note === null) {
      db.delete(previewChoices)
        .where(
          and(
            eq(previewChoices.canvasId, canvasId),
            eq(previewChoices.choiceId, op.id)
          )
        )
        .run();
      return { ok: true };
    }
    db.insert(previewChoices)
      .values({ canvasId, choiceId: op.id, ...next, hash, at })
      .onConflictDoUpdate({
        target: [previewChoices.canvasId, previewChoices.choiceId],
        set: { ...next, hash, at },
      })
      .run();
    return { ok: true };
  };

  const applyDial = (
    canvasId: string,
    op: Extract<ChoiceOp, { op: "set" }>,
    at: Date
  ): { ok: true } | { ok: false; refused: string } => {
    const where = and(
      eq(previewDials.canvasId, canvasId),
      eq(previewDials.key, op.key)
    );
    if (op.value === null) {
      db.delete(previewDials).where(where).run();
      return { ok: true };
    }
    const known = db.select().from(previewDials).where(where).get();
    if (!known) {
      const held =
        db
          .select({ n: count() })
          .from(previewDials)
          .where(eq(previewDials.canvasId, canvasId))
          .get()?.n ?? 0;
      if (held >= DIALS_PER_CANVAS) {
        return {
          ok: false,
          refused: `This page already holds ${DIALS_PER_CANVAS} dials, the most one canvas keeps; ${op.key} was not kept.`,
        };
      }
    }
    db.insert(previewDials)
      .values({ canvasId, key: op.key, value: op.value, at })
      .onConflictDoUpdate({
        target: [previewDials.canvasId, previewDials.key],
        set: { value: op.value, at },
      })
      .run();
    return { ok: true };
  };

  return {
    canvas,
    canvasByKey,
    canvasesOf: (instanceId) =>
      db
        .select()
        .from(previewCanvases)
        .where(eq(previewCanvases.instanceId, instanceId))
        .orderBy(desc(previewCanvases.changedAt))
        .all(),
    canvasesOfProject: (projectId) =>
      db
        .select()
        .from(previewCanvases)
        .where(eq(previewCanvases.projectId, projectId))
        .orderBy(desc(previewCanvases.changedAt))
        .all(),
    ensureCanvas: ({ key, projectId, instanceId, page, contentHash }) => {
      const now = new Date();
      return db
        .insert(previewCanvases)
        .values({
          id: crypto.randomUUID(),
          key,
          projectId,
          instanceId,
          page,
          contentHash,
          createdAt: now,
          changedAt: now,
        })
        .onConflictDoUpdate({
          target: previewCanvases.key,
          set: {
            instanceId,
            ...(projectId ? { projectId } : {}),
            ...(contentHash ? { contentHash } : {}),
          },
        })
        .returning()
        .get();
    },
    apply: (canvasId, op, hash) =>
      db.transaction(() => {
        const at = new Date();
        const done =
          op.op === "set"
            ? applyDial(canvasId, op, at)
            : applyChoice(canvasId, op, hash, at);
        if (done.ok) {
          touch(canvasId, at);
        }
        return done;
      }),
    picks: (canvasId) =>
      db
        .select()
        .from(previewChoices)
        .where(eq(previewChoices.canvasId, canvasId))
        .orderBy(previewChoices.at)
        .all()
        .map((row) => ({
          id: row.choiceId,
          option: row.option,
          options: row.options,
          note: row.note,
          hash: row.hash,
          at: row.at.getTime(),
        })),
    dials: (canvasId) =>
      Object.fromEntries(
        db
          .select()
          .from(previewDials)
          .where(eq(previewDials.canvasId, canvasId))
          .orderBy(previewDials.key)
          .all()
          .map((row) => [row.key, row.value])
      ),
    markSent: (canvasId) => {
      db.update(previewCanvases)
        .set({ sentAt: new Date() })
        .where(eq(previewCanvases.id, canvasId))
        .run();
    },
  };
};
