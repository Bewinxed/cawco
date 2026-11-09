import { t } from "elysia";

/** The body fields that bind a fleet item to a project or an area, as its routes take them. */
export const boundFields = {
  /**
   * One project's only: placed at each of its checkouts and
   * delegate workspaces. Null: every machine. Left out: as it was.
   */
  projectId: t.Optional(t.Union([t.String(), t.Null()])),
  /** Every project in one area instead, as read now. Null: none. Left out: as it was. */
  areaId: t.Optional(t.Union([t.String(), t.Null()])),
};
