/**
 * The fleet's rules and what each has done.
 */

import { MEMORY_ROLES } from "@cawco/core/fleet";
import {
  RULE_TEMPLATES,
  type Rule,
  type RuleDraft,
  ruleProblem,
} from "@cawco/core/rules";
import { areaWords } from "@cawco/core/words/areas";
import { Elysia, t } from "elysia";
import type { DbShape } from "../db";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";
import { sessionLabel } from "../labels";

const ruleBody = t.Object({
  name: t.String(),
  enabled: t.Boolean(),
  pattern: t.String(),
  matchKind: t.Union([
    t.Literal("phrase"),
    t.Literal("regex"),
    t.Literal("meaning"),
  ]),
  caseSensitive: t.Boolean(),
  wholeWord: t.Boolean(),
  watch: t.Union([t.Literal("text"), t.Literal("thinking"), t.Literal("both")]),
  reply: t.String(),
  timing: t.Union([
    t.Literal("turn"),
    t.Literal("message"),
    t.Literal("immediate"),
  ]),
  repeat: t.Boolean(),
  scope: t.Object({
    machineId: t.Optional(t.String()),
    projectId: t.Optional(t.String()),
    areaId: t.Optional(t.String()),
    harness: t.Optional(t.String()),
    model: t.Optional(t.String()),
    role: t.Optional(t.UnionEnum(MEMORY_ROLES)),
    delegateType: t.Optional(t.String()),
  }),
});

/** The first thing wrong with a rule as drafted, in the words the form shows. */
const firstRuleProblem = (draft: RuleDraft): string | undefined => {
  const [first] = Object.values(ruleProblem(draft));
  return first;
};

/** What is wrong with where a rule is scoped: a project or area this hub doesn't keep. */
const ruleScopeProblem = (
  db: DbShape,
  draft: RuleDraft
): string | undefined => {
  if (draft.scope.projectId && !db.project(draft.scope.projectId)) {
    return `There is no project ${draft.scope.projectId}.`;
  }
  if (draft.scope.areaId && !db.areas.get(draft.scope.areaId)) {
    return areaWords.scopeNoArea(draft.scope.areaId);
  }
  return undefined;
};

export const ruleRoutes = ({
  db,
  ruleEngine,
  ruleRowsOf,
}: Pick<HubContext, "db" | "ruleEngine" | "ruleRowsOf">) =>
  new Elysia()
    /**
     * Rules: standing instructions the hub enforces on the frame stream. The
     * shape is validated loosely here and strictly by `ruleProblem`, which is
     * the same validator the editor refuses with — one set of sentences, so the
     * form and the hub never disagree about what is wrong.
     */
    .get("/api/rules", () => ({
      rules: ruleRowsOf(db.listRules()),
      templates: RULE_TEMPLATES,
    }))
    .post("/api/rules", { body: ruleBody }, ({ body, status }) => {
      const draft = body as unknown as RuleDraft;
      const first = firstRuleProblem(draft);
      if (first) {
        return status(400, first);
      }
      const misplaced = ruleScopeProblem(db, draft);
      if (misplaced) {
        return status(400, misplaced);
      }
      // The hub mints the id: the client never invents identity, it asks for it.
      const rule: Rule = {
        ...draft,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      db.putRule(rule);
      ruleEngine.reload();
      return rule;
    })
    .put("/api/rules/:id", { body: ruleBody }, ({ params, body, status }) => {
      const draft = body as unknown as RuleDraft;
      const first = firstRuleProblem(draft);
      if (first) {
        return status(400, first);
      }
      // Strictly an edit: an id this hub never minted is a caller's mistake,
      // not an invitation to upsert.
      const existing = db.getRule(params.id);
      if (!existing) {
        return status(404, `there is no rule ${params.id} to edit`);
      }
      const misplaced = ruleScopeProblem(db, draft);
      if (misplaced) {
        return status(400, misplaced);
      }
      const rule: Rule = {
        ...draft,
        id: params.id,
        createdAt: existing.createdAt,
      };
      db.putRule(rule);
      ruleEngine.reload();
      return rule;
    })
    // The rule stops at once, into the trash with every session's standing.
    .delete("/api/rules/:id", ({ params, status }) => {
      const trashed = db.trash.put(
        { kind: "rule", key: params.id },
        Date.now()
      );
      if (trashed === undefined) {
        return status(404, `there is no rule ${params.id}`);
      }
      ruleEngine.reload();
      return undoable(trashed);
    });

export const ruleActivityRoutes = ({ db }: Pick<HubContext, "db">) =>
  new Elysia()
    /**
     * What a rule has actually been doing, per session: fires, and whether
     * each session is still pending on it. A session never sees the rule's
     * fire count, so this listing is the only window onto it.
     */
    .get("/api/rules/:id/activity", ({ params, status }) => {
      const rule = db.getRule(params.id);
      if (!rule) {
        return status(404, "That rule no longer exists.");
      }
      const states = db.ruleStatesFor(params.id);
      const named = new Map(
        db
          .listedInstancesByIds(states.map((state) => state.instanceId))
          .map((row) => [row.id, row])
      );
      return {
        activity: states.map((state) => {
          const row = named.get(state.instanceId);
          // Null once its session is gone; the app reads it as a plain name.
          const harness: string | null = row?.harness ?? null;
          return {
            ...state,
            where: row ? sessionLabel(row).name : "a session that is gone",
            harness,
          };
        }),
      };
    });
