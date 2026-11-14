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
import { Elysia, problem, t } from "elysia";
import type { Static } from "typebox";
import type { DbShape } from "../db";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";
import { sessionLabel } from "../labels";

export const ruleBody = t.Object({
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

/** The 400 a rule that does not pass `ruleProblem` is refused with, or nothing. */
const invalidRule = (draft: RuleDraft) => {
  const first = firstRuleProblem(draft);
  return first
    ? problem(400, { code: "rule-invalid", detail: first })
    : undefined;
};

/** The 400 a rule scoped to a project or area this hub does not keep is refused with, or nothing. */
const misplacedRule = (db: DbShape, draft: RuleDraft) => {
  const misplaced = ruleScopeProblem(db, draft);
  return misplaced
    ? problem(400, { code: "rule-misplaced", detail: misplaced })
    : undefined;
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

/**
 * Rules: standing instructions the hub enforces on the frame stream. The
 * shape is validated loosely here and strictly by `ruleProblem`, which is
 * the same validator the editor refuses with — one set of sentences, so the
 * form and the hub never disagree about what is wrong. The routes answer
 * these, and the admin tools call them directly.
 */
export const ruleCalls = ({
  db,
  ruleEngine,
  ruleRowsOf,
}: Pick<HubContext, "db" | "ruleEngine" | "ruleRowsOf">) => ({
  list: () => ({
    rules: ruleRowsOf(db.listRules()),
    templates: RULE_TEMPLATES,
  }),
  create: (body: Static<typeof ruleBody>) => {
    const draft = body as unknown as RuleDraft;
    const invalid = invalidRule(draft) ?? misplacedRule(db, draft);
    if (invalid) {
      return invalid;
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
  },
  update: (id: string, body: Static<typeof ruleBody>) => {
    const draft = body as unknown as RuleDraft;
    const invalid = invalidRule(draft);
    if (invalid) {
      return invalid;
    }
    // Strictly an edit: an id this hub never minted is a caller's mistake,
    // not an invitation to upsert.
    const existing = db.getRule(id);
    if (!existing) {
      return problem(404, {
        code: "no-rule-edit",
        detail: `there is no rule ${id} to edit`,
      });
    }
    const misplaced = misplacedRule(db, draft);
    if (misplaced) {
      return misplaced;
    }
    const rule: Rule = { ...draft, id, createdAt: existing.createdAt };
    db.putRule(rule);
    ruleEngine.reload();
    return rule;
  },
  /** The rule stops at once, into the trash with every session's standing. */
  remove: (id: string) => {
    const trashed = db.trash.put({ kind: "rule", key: id }, Date.now());
    if (trashed === undefined) {
      return problem(404, {
        code: "no-rule",
        detail: `there is no rule ${id}`,
      });
    }
    ruleEngine.reload();
    return undoable(trashed);
  },
});

export const ruleRoutes = (ctx: Parameters<typeof ruleCalls>[0]) => {
  const calls = ruleCalls(ctx);
  return new Elysia()
    .get("/api/rules", () => calls.list())
    .post("/api/rules", { body: ruleBody }, ({ body }) => calls.create(body))
    .put("/api/rules/:id", { body: ruleBody }, ({ params, body }) =>
      calls.update(params.id, body)
    )
    .delete("/api/rules/:id", ({ params }) => calls.remove(params.id));
};

export const ruleActivityRoutes = ({ db }: Pick<HubContext, "db">) =>
  new Elysia()
    /**
     * What a rule has actually been doing, per session: fires, and whether
     * each session is still pending on it. A session never sees the rule's
     * fire count, so this listing is the only window onto it.
     */
    .get("/api/rules/:id/activity", ({ params }) => {
      const rule = db.getRule(params.id);
      if (!rule) {
        return problem(404, {
          code: "rule-no-longer-exists",
          detail: "That rule no longer exists.",
        });
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
