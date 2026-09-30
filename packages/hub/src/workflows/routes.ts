import type { Problem, WorkflowGraph } from "@whiffle/core";
import { compileWorkflow, validateWorkflow } from "@whiffle/core";
import {
  programInputs,
  typecheckProgram,
  workflowProgramCheck,
} from "@whiffle/core/workflow-sandbox";
import { Elysia, t } from "elysia";
import type { DbShape } from "../db";
import { type createWorkflowRuntime, publicRun } from "./runtime";

const NOT_SLUG = /[^a-z0-9]+/g;
const SLUG_EDGES = /^-|-$/g;

export function workflowRoutes(
  db: DbShape,
  runtime: ReturnType<typeof createWorkflowRuntime>,
  presence: (id: string) => string | undefined,
  skills: {
    changed: () => void;
    check: (name: string, workflowId: string | undefined) => Promise<void>;
  }
) {
  const refusal = (error: unknown) =>
    new Response(error instanceof Error ? error.message : String(error), {
      status: 400,
    });
  const attempt = async (action: () => unknown) => {
    try {
      return await action();
    } catch (error) {
      return refusal(error);
    }
  };
  /**
   * A graph compiles to its program. A graph whose *authoring* rules fail
   * still saves and is refused at launch instead (§9.3), because the editor
   * autosaves; one the compiler cannot take, or a call cycle, is refused now.
   */
  const compileGraph = (
    graph: WorkflowGraph,
    id: string,
    name: string
  ): Response | { program: string; problems: Problem[] } => {
    const fatal = workflowProgramCheck(graph);
    if (fatal.length) {
      return Response.json({ problems: fatal }, { status: 400 });
    }
    const problems = validateWorkflow(graph, {
      workflowId: id,
      resolveWorkflow: (target) =>
        target === id ? { id, name, graph } : db.getWorkflow(target),
    });
    // A call cycle is the one graph problem that cannot be left for launch:
    // it is a property of the fleet's saved graphs, not of this one.
    const cycle = problems.find((problem) =>
      problem.message.startsWith("Workflow call cycle:")
    );
    if (cycle) {
      return Response.json({ problems: [cycle] }, { status: 400 });
    }
    return { program: compileWorkflow(graph).program, problems };
  };
  /** A workflow is authored as exactly one of a graph or a program. */
  const compile = (
    input: { graph?: WorkflowGraph; program?: string },
    id: string,
    name: string
  ): Response | { program: string; problems: Problem[] } => {
    if (input.graph && input.program) {
      throw new Error(
        "A workflow is authored either as a graph or as a program, never both."
      );
    }
    if (input.graph) {
      return compileGraph(input.graph, id, name);
    }
    if (!input.program) {
      throw new Error(
        "A workflow needs either a graph (the editor's model) or a program."
      );
    }
    // A program that will not typecheck is refused with the diagnostics.
    const fatal = typecheckProgram(input.program);
    return fatal.length
      ? Response.json({ problems: fatal }, { status: 400 })
      : { program: input.program, problems: [] };
  };
  /**
   * A new workflow (POST) names itself in the body. An existing one (PUT) is
   * the row its path names; a `name` in that body renames it.
   */
  const save = async (
    input: {
      description?: string;
      graph?: WorkflowGraph;
      name?: string;
      program?: string;
    },
    old?: NonNullable<ReturnType<DbShape["getWorkflow"]>>
  ) => {
    const id = old?.id ?? crypto.randomUUID();
    const name = (input.name ?? old?.name)?.trim();
    if (!name) {
      throw new Error("A workflow needs a name.");
    }
    const compiled = compile(input, id, name);
    if (compiled instanceof Response) {
      return compiled;
    }
    const { program, problems } = compiled;
    const slug = name
      .toLowerCase()
      .replace(NOT_SLUG, "-")
      .replace(SLUG_EDGES, "");
    if (!slug) {
      throw new Error("The workflow name needs at least one letter or number.");
    }
    await skills.check(`wf-${slug}`, old?.id);
    if (db.listSkills().some((skill) => skill.name === `wf-${slug}`)) {
      throw new Error(
        `Workflow slug ${slug} collides with operator-installed skill wf-${slug}.`
      );
    }
    const stored = db.putWorkflow({
      id,
      name,
      slug,
      graph: input.graph ?? null,
      program,
      origin: input.graph ? "editor" : "code",
      inputs: await programInputs(program),
      description: input.description ?? old?.description ?? "",
    });
    skills.changed();
    return { ...stored, problems };
  };
  const actor = (instanceId: string) => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row || row.canDelegate === false) {
      throw new Error(
        "Only a session that may delegate can run or steer workflows."
      );
    }
    return row;
  };
  return new Elysia()
    .get("/api/workflows", () => ({ workflows: db.listWorkflows() }))
    .post("/api/workflows", { body: t.Any() }, ({ body, set }) =>
      attempt(async () => {
        const saved = await save(body as Parameters<typeof save>[0]);
        if (!(saved instanceof Response)) {
          set.status = 201;
        }
        return saved;
      })
    )
    .get("/api/workflows/:id/program", ({ params }) => {
      const row = db.getWorkflow(params.id);
      return row
        ? new Response(row.program, {
            headers: { "content-type": "text/typescript; charset=utf-8" },
          })
        : new Response("Workflow not found.", { status: 404 });
    })
    .get("/api/workflows/:id", ({ params }) =>
      attempt(() => {
        const row = db.getWorkflow(params.id);
        if (!row) {
          return new Response("Workflow not found.", { status: 404 });
        }
        return {
          ...row,
          problems: row.graph
            ? validateWorkflow(row.graph, {
                workflowId: row.id,
                checkProgram: workflowProgramCheck,
                resolveWorkflow: db.getWorkflow,
              })
            : typecheckProgram(row.program),
        };
      })
    )
    .put("/api/workflows/:id", { body: t.Any() }, ({ body, params }) =>
      attempt(() => {
        const row = db.getWorkflow(params.id);
        if (!row) {
          throw new Error("Workflow not found.");
        }
        const input = body as Parameters<typeof save>[0];
        // No program compiles back to a graph: a program saved over a canvas
        // would drop the canvas.
        if (row.origin === "editor" && input.program !== undefined) {
          return new Response(
            "This workflow is authored as a graph; edit it in the canvas or save a graph.",
            { status: 409 }
          );
        }
        return save(input, row);
      })
    )
    .delete("/api/workflows/:id", ({ params }) =>
      attempt(async () => {
        const row = db.getWorkflow(params.id);
        if (!row) {
          throw new Error("Workflow not found.");
        }
        const runs = db.listWorkflowRuns(row.id);
        if (runs.some((run) => ["running", "waiting"].includes(run.status))) {
          throw new Error("A workflow with a live run cannot be deleted.");
        }
        await runtime.forget(runs.map((run) => run.id));
        db.deleteWorkflow(row.id);
        skills.changed();
        return { ok: true };
      })
    )
    .get("/api/workflows/:id/runs", ({ params }) => ({
      runs: db
        .listWorkflowRuns(db.getWorkflow(params.id)?.id ?? params.id)
        .map((run) => publicRun(run, db.listWorkflowLog(run.id))),
    }))
    .post("/api/workflows/:id/runs", { body: t.Any() }, ({ params, body }) =>
      attempt(() => {
        const input = body as Parameters<typeof runtime.launch>[1] & {
          instanceId?: string;
        };
        if (input.instanceId) {
          const row = actor(input.instanceId);
          return runtime.launch(params.id, {
            inputs: input.inputs,
            workspace: input.workspace ?? {
              path: row.cwd,
              machineId: row.machineId,
            },
            supervisor: { instanceId: row.id },
            launchedBy: `agent:${row.id}`,
          });
        }
        return runtime.launch(params.id, {
          inputs: input.inputs,
          workspace: input.workspace,
          supervisor: input.supervisor,
        });
      })
    )
    .get("/api/workflow-runs/:id", ({ params }) =>
      attempt(() => {
        const detail = runtime.detail(params.id);
        return {
          ...detail,
          steps: detail.steps.map((step) => ({
            ...step,
            ...(step.status === "running" &&
            step.instanceId &&
            presence(step.instanceId) !== "running"
              ? {
                  status:
                    presence(step.instanceId) === "unknown"
                      ? "unknown"
                      : "pending",
                }
              : {}),
          })),
        };
      })
    )
    .get("/api/workflow-runs/:id/log", ({ params }) => ({
      log: runtime.log(params.id),
    }))
    .get("/api/workflow-runs/:id/read", ({ params, query }) =>
      attempt(() => {
        const caller = String(query.instanceId ?? "");
        if (!caller) {
          throw new Error("workflow_read is for the run's supervisor session.");
        }
        const ref = String(query.ref ?? "");
        const number = (value: unknown) =>
          value === undefined || value === "" ? undefined : Number(value);
        return new Response(
          runtime.read(
            params.id,
            {
              ref: ref === "result" ? "result" : Number(ref),
              path: query.path ? String(query.path) : undefined,
              offset: number(query.offset),
              limit: number(query.limit),
            },
            caller
          ),
          { headers: { "content-type": "text/plain; charset=utf-8" } }
        );
      })
    )
    .post("/api/workflow-runs/:id/cancel", ({ params }) =>
      attempt(() => runtime.cancel(params.id))
    )
    .post(
      "/api/workflow-runs/:id/answer",
      {
        body: t.Object({
          stepId: t.String(),
          choice: t.Optional(t.String()),
          note: t.Optional(t.String()),
          value: t.Optional(t.Unknown()),
        }),
      },
      ({ params, body }) =>
        attempt(async () => {
          await runtime.answer(params.id, body.stepId, {
            choice: body.choice,
            note: body.note,
            value: body.value,
          });
          return { ok: true };
        })
    )
    .post(
      "/api/workflow-runs/:id/steer",
      {
        body: t.Object({
          instanceId: t.Optional(t.String()),
          action: t.Unknown(),
        }),
      },
      ({ params, body }) =>
        attempt(async () => {
          if (body.instanceId) {
            actor(body.instanceId);
          }
          return {
            message: await runtime.steer(
              params.id,
              body.action as Parameters<typeof runtime.steer>[1],
              body.instanceId
            ),
          };
        })
    )
    .post(
      "/api/workflow-runs/:id/rerun",
      { body: t.Object({ fromStepId: t.Optional(t.String()) }) },
      ({ params, body }) =>
        attempt(() => runtime.rerun(params.id, body.fromStepId))
    )
    .post(
      "/api/workflow-steps/:id/result",
      { body: t.Object({ instanceId: t.String(), result: t.Unknown() }) },
      ({ params, body }) =>
        attempt(() =>
          runtime.submitResult(params.id, body.instanceId, body.result)
        )
    )
    .post(
      "/api/workflow-runs/:id/state/:name",
      { body: t.Object({ instanceId: t.String(), value: t.Unknown() }) },
      ({ params, body }) =>
        attempt(() => {
          const [row] = db.getInstancesByIds([body.instanceId]);
          if (!row || row.workflowRunId !== params.id) {
            throw new Error("This session is not a step of that workflow run.");
          }
          return runtime.writeState(params.id, params.name, body.value);
        })
    )
    .get("/api/workflow-runs/:id/state/:name", ({ params, query }) =>
      attempt(() => {
        const [row] = db.getInstancesByIds([String(query.instanceId ?? "")]);
        if (!row || row.workflowRunId !== params.id) {
          throw new Error("This session is not a step of that workflow run.");
        }
        return { value: runtime.readState(params.id, params.name) ?? null };
      })
    );
}
