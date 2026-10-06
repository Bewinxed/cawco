import {
  IMAGE_GENERATION_DESCRIPTION,
  LANDS_MODES,
  type LandsMode,
} from "@cawco/core";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  type HandoffDeps,
  handoffActions,
  SPAWNING_TOOLS,
} from "./delegation-actions";
import {
  SESSION_TITLE_DESCRIPTION,
  SESSION_TITLE_MAX,
  WAIT_ITEM_LIMIT,
} from "./work-items";

/** The name the caller gives a session it starts or delegates to; never cut from the brief. */
const sessionTitle = () =>
  z
    .string()
    .trim()
    .min(1)
    .max(SESSION_TITLE_MAX)
    .describe(SESSION_TITLE_DESCRIPTION);

/** A work item's acceptance checks: `delegate` files them, `set_item_checks` replaces them. */
const checksParameter = () =>
  z
    .array(
      z.object({
        name: z.string().describe("2 to 6 plain words."),
        command: z
          .string()
          .describe(
            "A shell command, run with the item's worktree as its working directory."
          ),
        expect: z
          .string()
          .optional()
          .describe(
            "A literal string the last 4,000 characters of stdout must contain."
          ),
        timeoutSec: z
          .number()
          .int()
          .min(1)
          .max(3600)
          .optional()
          .describe("Seconds before the command is killed. Default 600."),
      })
    )
    .min(1);

function tool<T extends z.ZodRawShape>(
  name: string,
  description: string,
  input: T,
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>,
  annotations?: ToolAnnotations,
  inputError?: string
) {
  const schema = inputError
    ? z.strictObject(input, { error: inputError })
    : z.object(input);
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(schema, { target: "draft-07", io: "input" }),
    ...(annotations ? { annotations } : {}),
    handler: (args: unknown) => handler(schema.parse(args)),
  };
}

/**
 * What `finish_item` says happens once the checks pass: the session's own
 * work item's landing (`lands`), so a delegate is never told the hub pushes
 * to the base branch when it does not.
 */
const finishItemDescription = (lands: LandsMode = "main"): string => {
  const outputs =
    " When the item names outputs, each must be a file at its path in your workspace: the hub copies them into the project's folder, and a missing one comes back to you like a failing check.";
  const close =
    " Pass `blocked` with the exact command and error text only when something outside your control stops the work; the item then fails with that reason. Anything you noticed outside your brief goes in `findings`, not in the work.";
  switch (lands) {
    case "branch":
      return `Finish your work item. Commit your work first and do not push. The hub runs the item's acceptance checks in your worktree and returns each result. When all pass, the hub pushes your branch to origin (nothing goes onto the base branch); the item is then done and your parent receives the results. When a check fails or work is left uncommitted, you get the details back: fix the cause and call finish_item again.${outputs}${close}`;
    case "pr":
      return `Finish your work item. Commit your work first and do not push. The hub runs the item's acceptance checks in your worktree and returns each result. When all pass, the hub pushes your branch to origin and opens a pull request against the base branch (or updates the one already open for it); the item is then done and your parent receives the results with the pull request's link. When a check fails or work is left uncommitted, you get the details back: fix the cause and call finish_item again.${outputs}${close}`;
    case "none":
      return `Finish your work item. Nothing is pushed: the hub runs the item's acceptance checks in your worktree and returns each result, and when all pass, your outputs are collected into the project's folder; the item is then done and your parent receives the results. Each output must be a file at its path in your workspace; a missing one comes back to you like a failing check, as does a failing check: fix the cause and call finish_item again.${close}`;
    default:
      return `Finish your work item. Commit your work first and do not push. The hub runs the item's acceptance checks in your worktree and returns each result. When all pass, the hub rebases your commits onto the base branch (running the checks again if it moved) and pushes to it; the item is then done and your parent receives the results. When a check fails or your commits conflict with the base branch, you get the details back: fix the cause and call finish_item again.${outputs}${close}`;
  }
};

/** Only a workflow step session gets these; they need its step and run. */
const STEP_TOOLS: ReadonlySet<string> = new Set([
  "submit_result",
  "workflow_state_read",
  "workflow_state_write",
]);

/** Hub-owned tool definitions; every harness discovers this same registry. */

export type { HandoffDeps } from "./delegation-actions";

/**
 * The name the SDK injects this server under, and so the prefix of every tool
 * it exposes: `mcp__cawco__handoff`, `…__start_session`, `…__delegate`.
 */
export const MCP_SERVER_NAME = "cawco";

/**
 * Called when a tool handler returns structured data the Claude SDK would
 * otherwise drop. The harness intercepts the result text and injects the
 * structured payload onto the `tool_result` content block it can match.
 */

/**
 * `delegate`'s `type` line: every fleet-configured preset, name and
 * description, so the calling model can route by what a type is FOR rather
 * than by a model string. Built once from `deps.delegateTypes` — the caller
 * fetched it once for this session — and never rebuilt, because the tool
 * description feeds the prompt cache and a description that could change
 * mid-session would invalidate it on every delegate call.
 */
const delegateTypeLine = (types: HandoffDeps["delegateTypes"]): string =>
  types?.length
    ? ` Available types: ${types.map((type) => `'${type.name}' (${type.description} Harness: ${type.harness}; model: ${type.model}; effort: ${type.effort ?? "harness default"}${type.skills?.length ? `; skills: ${type.skills.join(", ")}` : ""}${type.denyTools?.length ? `; denied tools: ${type.denyTools.join(", ")}` : ""}${type.canDelegate ? "; may delegate by default" : "; leaf by default"})`).join("; ")}.`
    : "";

/** The tools themselves, separated from the server so they can be exercised directly. */
export function handoffTools(deps: HandoffDeps) {
  const actions = handoffActions(deps);
  const all = [
    tool(
      "create_workflow",
      'Create a workflow from a TypeScript program: `import { z } from "zod"`, `export const inputs = z.object({…})`, and a default-exported async function taking the Workflow runtime (w.run, w.spawn, w.ask, w.exec, w.exists, w.jev, w.workflow, w.state, w.checkpoint, w.sleep, w.now, w.notify, w.notes, w.log). `w.jev({ state, questions: { id: { type: "noul" | "choice" | "score", instructions, criteria } } })` asks TypeSafe\'s Jev and returns typed `answers.<id>` (noul; choice + probabilities + confidence; score + legend + probabilities + confidence) and `usage`; put every question over one state in ONE call — they are evaluated in parallel for one price. `w.ask({ question, options, answer: z.object({…}) })` takes a typed answer: the answer\'s `value` is validated against that schema, which is how a supervisor fills in a decision. A `w.run`/`w.spawn` step that runs out of attempts in a supervised run is held for the supervisor to retry or fail; give it `onExhausted: "fail"` when the program handles its StepError itself. A step prompt or Jev state may name an earlier call\'s result as `{{ref:N.path}}` (N is the call\'s effect number); the hub fills it in when the step starts. Every call is a durable workflow-engine step and a run replays its program after a restart or resume, so zod is the only import allowed and the program must be deterministic. Returns the saved workflow, or line-numbered typecheck problems verbatim.',
      { name: z.string(), program: z.string() },
      async ({ name, program }) => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(await actions.createWorkflow(name, program)),
          },
        ],
      })
    ),
    tool(
      "update_workflow",
      "Replace a saved workflow by name, slug or id with a complete TypeScript program. Returns the saved workflow, or line-numbered typecheck problems verbatim.",
      { name: z.string(), program: z.string() },
      async ({ name, program }) => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(await actions.updateWorkflow(name, program)),
          },
        ],
      })
    ),
    tool(
      "workflow_state_read",
      "Read a named slot of this workflow run's shared state. Only slots the run's program declared with w.state(name, schema) exist.",
      { name: z.string() },
      async ({ name }) => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(await actions.readWorkflowState(name)),
          },
        ],
      })
    ),
    tool(
      "workflow_state_write",
      "Write a named slot of this workflow run's shared state. The value is validated against the schema the run's program declared with w.state(name, schema); the validator's message comes back verbatim on failure.",
      { name: z.string(), value: z.unknown() },
      async ({ name, value }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.writeWorkflowState(name, value),
          },
        ],
      })
    ),
    tool(
      "submit_result",
      "Call exactly once with an object matching the schema in your instructions, then end your turn. The hub's validation message is returned verbatim on failure.",
      { result: z.record(z.string(), z.unknown()) },
      async ({ result }) => ({
        content: [
          { type: "text" as const, text: await actions.submitResult(result) },
        ],
      })
    ),
    tool(
      "run_workflow",
      "Run a saved workflow by name or slug. You become its supervisor and receive a receipt, as a queued peer message, for each step, checkpoint and the run's end: status, attempt, time, a `ref`, the result's size and the names of its top-level keys, or the whole result when it is 1,000 characters or less. Read more of a result with workflow_read only when you need it. A step that runs out of attempts is held for your decision (steer_workflow retry or fail); a receipt sent while your session is not live is kept and sent when it next is.",
      {
        name: z.string(),
        inputs: z.record(z.string(), z.unknown()),
        workspace: z
          .object({ path: z.string(), machineId: z.string() })
          .optional(),
      },
      async ({ name, inputs, workspace }) => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              await actions.runWorkflow(name, inputs, { workspace })
            ),
          },
        ],
      })
    ),
    tool(
      "workflow_read",
      "Read part of a result from a workflow run you supervise, by the `ref` its receipt named (or `result` for the run's own result). `path` narrows it to one field, e.g. `results[0].url`. Returns up to `limit` characters from `offset` and where the next window starts. To hand a result to a later step without reading it, put `{{ref:N.path}}` in what you give the program instead.",
      {
        runId: z.string(),
        ref: z
          .union([z.number().int().min(0), z.literal("result")])
          .describe(
            "The effect number a receipt named, or `result` for the run's own result."
          ),
        path: z
          .string()
          .optional()
          .describe("A path into the result, e.g. `queries[2].query`."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Character to start at. Default 0."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20_000)
          .optional()
          .describe("Characters to return. Default 4,000, at most 20,000."),
      },
      async ({ runId, ref, path, offset, limit }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.readWorkflow(runId, {
              ref,
              path,
              offset,
              limit,
            }),
          },
        ],
      })
    ),
    tool(
      "steer_workflow",
      "Steer a workflow you supervise: note for the next step, decide on a held step, answer a question routed to you, or cancel. A step that runs out of attempts is held for you, up to an hour, and its receipt says so: `retry` runs another attempt on the same step and session, `fail` hands the program its StepError now; left undecided, it fails when the hold runs out. A step is held twice at most. An answer names the option label as `choice`; a question that declared a typed answer takes `value`, validated against the schema its question notice shows. The program controls routing. Answers one line saying what was done.",
      {
        runId: z.string(),
        action: z.discriminatedUnion("type", [
          z.object({ type: z.literal("note"), text: z.string() }),
          z.object({
            type: z.literal("retry"),
            stepId: z.string().describe("A held step."),
          }),
          z.object({
            type: z.literal("fail"),
            stepId: z.string().describe("A held step."),
          }),
          z.object({
            type: z.literal("answer"),
            stepId: z.string(),
            choice: z.string().optional(),
            value: z
              .unknown()
              .optional()
              .describe(
                "The typed answer, for a question that declared an answer schema."
              ),
            note: z.string().optional(),
          }),
          z.object({ type: z.literal("cancel") }),
        ]),
      },
      async ({ runId, action }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.steerWorkflow(runId, action),
          },
        ],
      })
    ),
    tool(
      "list_workflows",
      "List the fleet's saved workflows, their input definitions, and graphs before choosing one to run.",
      {},
      async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(await actions.listWorkflows()),
          },
        ],
      })
    ),
    tool(
      "generate_image",
      IMAGE_GENERATION_DESCRIPTION,
      {
        prompt: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Describe intended use, subject, framing/layout, style, lighting/materials, and exclusions. Quote exact text and specify its placement/typography. For complex briefs use Scene/Subject/Details/Constraints. For edits say 'Change only X; preserve Y' and name identity, geometry, lighting, and labels to retain. Number reference roles. Iterate one change at a time with the previous output as input. Set size/quality separately."
          ),
        output_path: z
          .string()
          .min(1)
          .describe(
            "New .png path on the calling session's machine. Relative paths resolve from its working directory; existing files are not overwritten."
          ),
        reference_images: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Ordered local PNG/JPEG/WebP/GIF paths. Assign each a role in the prompt, e.g. 'Image 1: person to preserve; Image 2: clothing to apply.' For follow-up edits, attach the previous output and restate preservation constraints. Limit: 50 MiB per image, 100 MiB combined."
          ),
        size: z
          .string()
          .optional()
          .describe(
            "Requested auto or WIDTHxHEIGHT (e.g. 1024x1536): multiples of 16, max edge 3840, max aspect 3:1, 655360–8294400 pixels. Actual dimensions may differ."
          ),
        quality: z
          .enum(["auto", "low", "medium", "high"])
          .optional()
          .describe(
            "Requested quality; defaults to auto. Use low for drafts; consider high for dense text, diagrams, or fine detail. Increase only when the result falls short; higher is not always better. This subscription tool exposes auto/low/medium/high, not xhigh/max."
          ),
      },
      async (request) => {
        const image = await actions.generateImage(request);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(image) }],
          structuredContent: image,
        };
      },
      {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      }
    ),
    tool(
      "list_delegate_types",
      "Read the live fleet delegate catalog: each type's task description, harness, model, effort, skills, denied tools, and permission to delegate further. " +
        "Use this to inspect current routing before choosing a delegate type or answering questions about model mappings. " +
        "This is a read-only tool, not an MCP resource; it does not spawn sessions. Returned settings are configuration, not confirmation of a served model. " +
        "Named delegate dispatch reads this same live catalog.",
      {},
      async () => {
        const catalog = await actions.listDelegateTypes();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(catalog) }],
          structuredContent: catalog,
        };
      }
    ),
    tool(
      "list_sessions",
      "List the other sessions running on the fleet, with the directory and machine each is working in, " +
        "then the machines online now by the names `machine` takes on delegate and start_session. " +
        "The listing shows where each session works, not what it is currently doing, how busy it " +
        "is, or how likely it is to pick up a handoff — and recency is not an ownership signal. " +
        "Use it to find a session that already owns the work, or to name a delegate. For configured delegate types and model mappings, use list_delegate_types. " +
        "A finished delegate still takes a handoff from its parent or the user: the message continues its own session.",
      {},
      async () => ({
        content: [
          { type: "text" as const, text: await actions.listSessions() },
        ],
      })
    ),
    tool(
      "handoff",
      "Send a message to another session on the fleet — to guide one of your delegates while " +
        "its work item runs, or to brief a session that already owns the work. An idle target wakes " +
        "and works on it immediately; a busy target finishes its current turn first, then " +
        "reads everything queued in one wake turn. Write the message as a brief " +
        "for another engineer who cannot see your conversation: what you found, where (file " +
        "and line), and what you are asking them to do. For new standalone work, use delegate instead. " +
        "To follow up on your own delegate after it reports (done, failed or cancelled), hand off to it: " +
        "the message reopens its work item in the same session, on its cached transcript. " +
        "Prefer a fresh delegate unless the existing session is warm and holds context this task needs. A cold target other than your own parent is refused once with the cost considerations, and a repeat of the call is delivered.",
      {
        target: z
          .string()
          .describe(
            'The session to hand to: its id, or its directory name, e.g. "keeboard". A name reaches your own parent when it is theirs; a name that more than one session answers to is refused with their ids.'
          ),
        message: z
          .string()
          .describe(
            "The brief. Include the finding, the paths involved, and the ask."
          ),
        urgent: z
          .boolean()
          .optional()
          .describe(
            "Force delivery to one of YOUR delegates: a busy claude delegate reads it mid-turn; " +
              "other harnesses interrupt their turn to read it now. Only valid toward your own delegates."
          ),
      },
      async ({ target, message, urgent }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.handoff(target, message, urgent),
          },
        ],
      })
    ),
    tool(
      "start_session",
      "Start a NEW session on the fleet and give it work. Unlike a subagent, this " +
        "is a full session of its own: it gets its own row in the sidebar, its own transcript " +
        "the user can open and read, and it survives after this turn ends. " +
        "It runs on the harness, model and effort of a delegate type — `type`, the same catalog delegate uses, " +
        "'medium' when omitted; a named type's denied tools apply too — and answers tool permissions in `permissionMode`, this session's own mode when omitted, " +
        "where its harness has permission modes (pi has none, and refuses one). " +
        "Nothing is left to the machine's defaults. " +
        "It runs on this session's machine unless `machine` names another one of the fleet. " +
        "Use it when the user asks you to spin something off, or when work " +
        "belongs in a different directory or on a different machine and no session is running there yet. Prefer " +
        "`handoff` when a session is ALREADY running in that directory. " +
        "Returns once the machine has the session in place; a spawn that fails there (a missing directory, a harness error, the machine gone) is returned as this tool's error, in the machine's words.",
      {
        cwd: z
          .string()
          .describe(
            "Absolute directory the new session works in, as a path on the machine it runs on " +
              "(e.g. /Users/<name>/... on a Mac, /home/<name>/... on Linux). Often a DIFFERENT project from this " +
              "one — if the user named another repository or folder, use that. Defaults to " +
              "this session's directory only when they did not."
          ),
        machine: z
          .string()
          .optional()
          .describe(
            'The machine the session runs on: its hostname as the fleet shows it (e.g. "Omars-MacBook-Pro", ' +
              '"obelisk-of-light"; list_sessions ends with the machines online now) or its machineId. ' +
              "Omit to run it on this session's machine. An unknown or offline machine is refused."
          ),
        prompt: z
          .string()
          .describe(
            "The opening instruction. Write it as a full brief: the new session cannot see this conversation."
          ),
        title: sessionTitle(),
        sideQuest: z
          .boolean()
          .optional()
          .describe(
            "A detour from this session's work. It appears nested under this session in the " +
              "sidebar and shares its directory. Default false."
          ),
        type: z
          .string()
          .optional()
          .describe(
            "A named delegate type (see list_delegate_types): sets harness, model, effort and denied tools. Omitted: 'medium' sets harness, model and effort, and no tools are denied. Match the type to the work, as with delegate."
          ),
        model: z
          .string()
          .optional()
          .describe(
            "Overrides the type's model. Omit to run the type's own model."
          ),
        // Never `fullSend`: only the owner puts a session in Full Send. A
        // session that is in it passes it on by leaving this out.
        permissionMode: z
          .enum([
            "default",
            "acceptEdits",
            "bypassPermissions",
            "plan",
            "dontAsk",
            "auto",
          ])
          .optional()
          .describe(
            "How the new session answers tool permissions. Default: this session's own mode. Omit it for a harness without permission modes (pi)."
          ),
      },
      async ({
        cwd,
        prompt,
        title,
        sideQuest,
        type,
        model,
        permissionMode,
        machine,
      }) => {
        const result = await actions.startSession(cwd, prompt, title, {
          sideQuest,
          type,
          model,
          permissionMode,
          machine,
        });
        const sc = { instanceId: result.id, title: result.title };
        return {
          content: [{ type: "text" as const, text: result.text }],
          structuredContent: sc,
        };
      }
    ),
    tool(
      "delegate",
      "Run a task as a SUB-AGENT: a new temporary fleet session with its own fresh context (or, with `fork`, a copy of this one), which reports back when the hub has run its acceptance checks and they pass.\n\n" +
        "Use this for SUBSTANTIAL bounded work that must report back: multi-file implementation, a sweep that would take dozens of reads across a codebase, builds or deploys with verification loops, browser audits, evidence you must interpret across many files or logs. A delegate answers those in its own fresh context and hands back conclusions.\n\n" +
        "Run menial work yourself: git status/log/diff, ls/grep/find, reading a file or a handful of files, port and process checks, tailing a log, a dev-server restart, and the reads needed to write a brief. Ten read-only commands in a row is normal prep; a delegate for that costs more than the task and its report costs more to read than the output.\n\n" +
        "Do NOT delegate: a single command or file read whose exact output you need; edits to files you are actively changing; anything the user asked to watch you do directly.\n\n" +
        "A delegate that is not a fork cannot see this conversation, so `prompt` must stand alone: intent, constraints, acceptance criteria, and what not to do. Keep the decisions yourself and ask for evidence and conclusions, not file dumps.\n\n" +
        "Prefer `type` over raw harness/model — it routes by what the work needs rather than a model string you must already know; use list_delegate_types for the live catalog. Prefer this over start_session when the work must report back, and over handoff for new standalone work (set cwd for another repository).\n\n" +
        "Each call starts one work item in a workspace: a shared clone of the repository on its own branch, with a boundary every shell command of the delegate runs inside. It writes only its clone, its own scratch folder and the package caches. On macOS it can also write the user's temp and cache folders, ~/Library/Caches, ~/Library/Developer/Xcode/DerivedData, ~/.swiftpm and ~/Library/org.swift.swiftpm. Harness sign-in files and the proxy auth directory remain unreadable, and service-manager control remains denied. On Linux it sees only its own processes; on macOS it can see other processes but cannot signal them. The workspace is cut on this session's machine unless `machine` names another one of the fleet. Without `workspace` the item gets a new one; with `workspace` it is the follow-up there: a new item, under its own title, in the workspace's last session, which reads the brief as its next message on its cached transcript. " +
        "A workspace runs one item at a time, and keeps its checkout while its session can be continued. To follow up on a delegate's work, handoff to that delegate, or delegate with its `workspace` to file the follow-up as its own item: either way it continues its own session and cached transcript. Prefer a fresh delegate unless the existing session is warm and holds context this task needs. A cold workspace session is refused once with the cost considerations, and a repeat of the call is delivered.\n\n" +
        "Set `fork: true` when the work needs what this conversation already holds: the delegate starts as a copy of this conversation (on this session's harness and model, so the prompt cache carries over) and reads the brief as its next turn, in a new workspace of its own." +
        delegateTypeLine(deps.delegateTypes),
      {
        prompt: z
          .string()
          .describe(
            "The full brief. Unless it is a fork, the delegate cannot see this conversation."
          ),
        title: sessionTitle(),
        type: z
          .string()
          .optional()
          .describe(
            "A named delegate type — see the types listed above. Sets harness/model/effort/skills " +
              "for you; an explicit harness/model/skills below still overrides what the type says. " +
              "Default 'medium'; with a harness other than medium's and no type, `model` is required. " +
              "The description below is a startup snapshot; execution reads the current hub definition. " +
              "Use list_delegate_types to see edits made since this session started."
          ),
        harness: z
          .enum(["claude", "opencode", "pi"])
          .optional()
          .describe(
            "Which runtime runs the delegate. 'opencode' with model 'opencode-go/deepseek-v4-pro' " +
              "delegates to DeepSeek. Default: the type's harness. Overrides `type`'s harness when both are set."
          ),
        model: z
          .string()
          .optional()
          .describe(
            "Model id for the harness, e.g. opencode-go/deepseek-v4-flash. Omit for the type's " +
              "own model. Overrides `type`'s model when both are set."
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "The repository a new workspace is cut from, on branch ws/<id> from the repository's " +
              "default branch, fetched from its remote as the workspace is cut. " +
              "With `machine`, this is an absolute path on that machine, and required when that machine is not this session's. " +
              "Defaults to this session's directory; unused with `workspace`."
          ),
        machine: z
          .string()
          .optional()
          .describe(
            'The machine the work item runs on: its hostname as the fleet shows it (e.g. "Omars-MacBook-Pro", ' +
              '"obelisk-of-light"; list_sessions ends with the machines online now) or its machineId. ' +
              "Omit to run it on this session's machine. An unknown or offline machine is refused."
          ),
        skills: z
          .array(z.string())
          .optional()
          .describe(
            "Skill names to load natively into the delegate session. Each skill is invoked " +
              "via the harness's own slash-command mechanism before the prompt — the same as " +
              "if the user typed /skill-name in that session. Works cross-harness. Overrides " +
              "`type`'s skills when both are set."
          ),
        workspace: z
          .string()
          .optional()
          .describe(
            "A workspace id from an earlier delegate's result or report. The new work item is its " +
              "follow-up: the brief goes to the session that workspace's last item ran, as its next message " +
              "on its cached transcript. Refused while an item there is still running, and with type, " +
              "model, harness, skills, fork or machine, which are that session's own; delegate without workspace for a different model or machine."
          ),
        fork: z
          .boolean()
          .optional()
          .describe(
            "Start the delegate as a fork of this conversation: every turn so far, then the brief. It runs " +
              "on this session's harness and model (an explicit different harness/model is refused, since " +
              "the prompt cache would not carry over); `type` still sets effort, skills and denied tools. " +
              "Always a new workspace, so not with `workspace`: a follow-up continues its own session instead."
          ),
        can_delegate: z
          .boolean()
          .optional()
          .describe(
            "Let the delegate spawn delegates and sessions of its own. Default false: a delegate is a " +
              "leaf and does the work itself, which keeps the tree one level deep and every report " +
              'visible here. A type marked "may delegate by default" flips that default; an explicit ' +
              "value here wins either way. Set true only for an orchestrator-style delegate that must fan out."
          ),
        checks: checksParameter().describe(
          "The item's acceptance checks. The hub runs each command in the item's worktree, inside its workspace boundary exactly as the delegate's own shell commands run (same mounts, same private /tmp), when the delegate calls finish_item; the item is done only when every command exits 0 and its stdout contains `expect` where one is given. Write the checks a reviewer would run: build, lint, type-check, a grep that proves a removal, one script run for a live assertion. The delegate runs nothing beyond these to prove the work."
        ),
        lands: z
          .enum(LANDS_MODES as [LandsMode, ...LandsMode[]])
          .optional()
          .describe(
            "Where the work goes once the checks pass. 'main' (default): the hub rebases the delegate's commits onto the repository's default branch and pushes. " +
              "'branch': the hub pushes them, as they are, to cawco/<task or item> on origin. " +
              "'pr': that, then a pull request against the default branch (or the one already open for that branch); the report carries its link. " +
              "'none': nothing is pushed, for work that is not commits (a report, a draft); name its files in `outputs`."
          ),
        outputs: z
          .array(z.string())
          .optional()
          .describe(
            "Files the work produces that are the deliverable rather than commits, as paths from the repository's root, e.g. ['report.md']. " +
              "When the checks pass, the hub copies each into the project's folder under assets/<task or item>/ and the report lists them; " +
              "a missing one goes back to the delegate like a failing check. Needs this session to be in a project."
          ),
      },
      async ({
        prompt,
        title,
        type,
        harness,
        model,
        cwd,
        skills,
        workspace,
        fork,
        can_delegate,
        checks,
        machine,
        lands,
        outputs,
      }) => {
        const result = await actions.delegate(prompt, {
          title,
          cwd,
          harness,
          model,
          skills,
          workspace,
          fork,
          type,
          canDelegate: can_delegate,
          checks,
          machine,
          lands,
          outputs,
        });
        const sc = {
          delegateInstanceId: result.id,
          title: result.title,
          workItemId: result.workItemId,
          workspaceId: result.workspaceId,
        };
        return {
          content: [{ type: "text" as const, text: result.text }],
          structuredContent: sc,
        };
      }
    ),
    tool(
      "wait_item",
      "Declare a bounded wait on a command you started, then end your turn. The hub keeps your item running without quiet-turn reminders, tells your parent what you are waiting for, and wakes you when the wait ends. Call again to replace the wait. finish_item, closing, stopping or interrupting the item cancels the wait.",
      {
        minutes: z
          .number({ error: WAIT_ITEM_LIMIT })
          .int({ error: WAIT_ITEM_LIMIT })
          .min(1, { error: WAIT_ITEM_LIMIT })
          .max(120, { error: WAIT_ITEM_LIMIT })
          .describe("Whole minutes to wait, from 1 to 120."),
        reason: z
          .string({ error: WAIT_ITEM_LIMIT })
          .trim()
          .min(1, { error: WAIT_ITEM_LIMIT })
          .describe("What you are waiting for from a command you started."),
      },
      async ({ minutes, reason }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.waitItem(minutes, reason),
          },
        ],
      }),
      undefined,
      WAIT_ITEM_LIMIT
    ),
    tool(
      "finish_item",
      finishItemDescription(deps.lands),
      {
        summary: z.string().describe("What was done, in plain words."),
        findings: z
          .array(z.object({ title: z.string(), detail: z.string() }))
          .optional()
          .describe("Things noticed outside the brief."),
        blocked: z
          .object({ command: z.string(), error: z.string() })
          .optional()
          .describe(
            "The exact command and error text of what stops the work, when it is outside your control."
          ),
      },
      async (request) => ({
        content: [
          { type: "text" as const, text: await actions.finishItem(request) },
        ],
      })
    ),
    tool(
      "continue_session",
      "Summarise a session with a model you choose, then start a new session on another model or " +
        "harness, seeded with that summary. The source session is untouched: it is only read. " +
        "Omit `session` to continue this session itself. Takes a few minutes on a long session.",
      {
        session: z
          .string()
          .optional()
          .describe(
            "The session to continue: its id, short id, or directory name. Defaults to this session."
          ),
        summarizer_harness: z
          .enum(["claude", "opencode", "pi"])
          .describe("The harness that writes the summary."),
        summarizer_model: z
          .string()
          .min(1)
          .describe(
            "The model that writes the summary, e.g. opencode-go/deepseek-v4-flash."
          ),
        target_harness: z
          .enum(["claude", "opencode", "pi"])
          .describe("The harness the new session runs on."),
        target_model: z
          .string()
          .min(1)
          .describe("The model the new session runs on."),
        note: z
          .string()
          .optional()
          .describe(
            "What to focus the summary on. Also added to the new session's opening message as its next step."
          ),
      },
      async (input) => {
        const result = await actions.continueSession(input);
        return {
          content: [{ type: "text" as const, text: result.text }],
          structuredContent: {
            targetInstanceId: result.targetInstanceId,
            summariserInstanceId: result.summariserInstanceId,
          },
        };
      }
    ),
    tool(
      "set_item_checks",
      "Replace the whole list of acceptance checks on one of YOUR delegates' running work items; the delegate is told, and finish_item runs the new list from then on. Use it when a check was written for a design that was then changed, instead of stopping the delegate.",
      {
        target: z
          .string()
          .describe(
            'The delegate whose item it is: its directory name, e.g. "keeboard", or its id.'
          ),
        checks: checksParameter().describe(
          "The item's new acceptance checks, replacing every one it had."
        ),
      },
      async ({ target, checks }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.setItemChecks(target, checks),
          },
        ],
      })
    ),
    tool(
      "stop_delegate",
      "Stop one of YOUR delegates (a session you spawned with delegate). Only your own delegates " +
        "can be stopped. Its work item is cancelled; a later handoff to it reopens the item in the same session.",
      {
        target: z
          .string()
          .describe(
            'The delegate to stop: its directory name, e.g. "keeboard", or its id.'
          ),
      },
      async ({ target }) => ({
        content: [
          { type: "text" as const, text: await actions.stopDelegate(target) },
        ],
      })
    ),
    tool(
      "interrupt_delegate",
      "Interrupt one of YOUR delegates mid-turn without ending it — the fleet's pause. It keeps " +
        "its state; resume it with handoff.",
      {
        target: z
          .string()
          .describe(
            'The delegate to interrupt: its directory name, e.g. "keeboard", or its id.'
          ),
      },
      async ({ target }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.interruptDelegate(target),
          },
        ],
      })
    ),
    tool(
      "answer_delegate",
      "Answer an ask your delegate parked and routed to you. Answers are keyed by the EXACT " +
        "question text and the value is the chosen option label — copy them from the " +
        '"[delegate-ask ...]" message the delegate sent you. Pass deny=true to refuse the ask ' +
        "instead. Leave answers empty and deny false to allow the ask unchanged.",
      {
        target: z
          .string()
          .describe(
            'The delegate to answer: its directory name, e.g. "keeboard", or its id.'
          ),
        requestId: z
          .string()
          .describe(
            'The requestId from the delegate\'s "[delegate-ask ...]" line.'
          ),
        answers: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Exact question text → chosen option label, for each question asked."
          ),
        deny: z
          .boolean()
          .optional()
          .describe("Refuse the ask instead of answering it. Default false."),
      },
      async ({ target, requestId, answers, deny }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.answerDelegate(
              target,
              requestId,
              answers,
              deny
            ),
          },
        ],
      })
    ),
    tool(
      "send_to_user",
      "Display a message directly to the user (delivered to their Telegram). Use this for " +
        "progress updates, partial results, or content the user must see exactly as written " +
        "before the task finishes. Attach images by absolute path — they are read off this " +
        "machine when sent; you do not need to read them yourself.",
      {
        message: z
          .string()
          .describe("The text to show the user, exactly as it should read."),
        attachments: z
          .array(z.string())
          .optional()
          .describe(
            "Absolute paths of image files on this machine to send with the message."
          ),
      },
      async ({ message, attachments }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.sendToUser(message, attachments),
          },
        ],
      })
    ),
    tool(
      "set_title",
      "Name this session in 3 to 6 plain words, verb first if it is a task (e.g. 'Fix tray chip overflow'). " +
        "Call it once the task is clear, and again only when the task changes.",
      {
        title: z
          .string()
          .trim()
          .min(1)
          .max(SESSION_TITLE_MAX)
          .describe(
            `The session's name, at most ${SESSION_TITLE_MAX} characters, e.g. 'Fix tray chip overflow'.`
          ),
      },
      async ({ title }) => ({
        content: [
          { type: "text" as const, text: await actions.setTitle(title) },
        ],
      }),
      {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    ),
    tool(
      "show_image",
      "Show an image file to the user inline in this session's transcript, by path. The " +
        "dashboard renders it from disk when the user looks; you do not read the image and " +
        "spend no tokens on its pixels. Use this for screenshots, renders, plots and diagrams " +
        "you produced or found — whenever the user should SEE the file rather than hear about it.",
      {
        path: z
          .string()
          .describe("Absolute path of the image file on this machine."),
        caption: z
          .string()
          .optional()
          .describe("One line under the image saying what it shows."),
      },
      ({ path }) =>
        Promise.resolve({
          content: [
            {
              type: "text" as const,
              text: `Shown in the transcript: ${path}. If the file is missing or later moves, the user sees that instead.`,
            },
          ],
        })
    ),
    tool(
      "show_preview",
      "Show a running page beside this session's transcript so the operator sees your work. " +
        "Call it when: you started or found a dev server; you wrote or changed an HTML/CSS/Svelte/React/Vue file " +
        'the user will look at; the user asked to "see", "look at", "show me", or "how does it look"; ' +
        "you are about to say a UI change is done. Pass `port` for a running dev server, or `dir` for a directory " +
        "with an index.html. The operator gets the page inline beside your transcript and can click any element " +
        "to send you exact file:line feedback with notes — use that to edit precisely what they pointed at.",
      {
        port: z.number().int().min(1).max(65_535).optional(),
        dir: z.string().startsWith("/").optional(),
      },
      async ({ port, dir }) => {
        if ((port === undefined) === (dir === undefined)) {
          throw new Error("Pass exactly one of port or dir.");
        }
        return {
          content: [
            {
              type: "text" as const,
              text: await actions.showPreview(
                port === undefined ? { dir: dir as string } : { port }
              ),
            },
          ],
        };
      }
    ),
  ];
  return all.filter(
    (entry) =>
      (!STEP_TOOLS.has(entry.name) || !!deps.workflowStepId) &&
      (deps.canDelegate !== false || !SPAWNING_TOOLS.has(entry.name)) &&
      (!["finish_item", "wait_item"].includes(entry.name) || !!deps.workItem)
  );
}

export function handoffInstructions(deps: HandoffDeps): string {
  const naming =
    "Name this session with set_title in 3 to 6 plain words once its task is clear; call it again only when the task changes.";
  const images =
    "CawCo can generate images regardless of your model: use generate_image (Claude: mcp__cawco__generate_image; OpenCode: cawco_generate_image). It uses the machine's ChatGPT subscription login only. Pass reference_images for edits or visual guidance, then show the returned path with show_image. Discover deferred tools before claiming image generation is unavailable. Do not delegate image generation to a different model.";
  if (deps.canDelegate === false) {
    return `This session is a leaf delegate. Do the assigned work yourself and call finish_item when it is done; delegate and start_session are unavailable. Use wait_item for a bounded wait on a command you started. Use mcp__cawco__handoff to reach your parent or a session that already owns related work.\n\n${naming}\n\n${images}`;
  }
  let catalog = deps.delegateTypes?.length
    ? delegateTypeLine(deps.delegateTypes).trim()
    : "Call mcp__cawco__list_delegate_types to discover the current routes rather than guessing a model.";
  if (deps.delegateTypesError) {
    catalog = `${deps.delegateTypesError}. The catalog is unavailable, not empty. A delegate call naming a known type retries the fetch; if no type is known, report the catalog blocker rather than guessing a model.`;
  }
  return [
    naming,
    images,
    "Use CawCo's delegate tool for bounded fleet work that must report back to its parent. Native harness subagents are a separate mechanism and do not resolve CawCo presets.",
    'Call list_delegate_types for current model/effort mappings. Claude names these tools mcp__cawco__list_delegate_types and mcp__cawco__delegate; if deferred, use ToolSearch(query="select:mcp__cawco__delegate"). OpenCode names them cawco_list_delegate_types and cawco_delegate. These are tools, not MCP resources. list_sessions lists running sessions, not configured types.',
    "Delegate substantial bounded work — multi-file implementation, wide sweeps, builds with verification, browser audits — with a brief that keeps intent, decisions, and acceptance with the parent and returns evidence and conclusions rather than file dumps. Menial reads and checks (git status, a grep, a file, a port) are the parent's own work, run inline.",
    "Prefer the configured type and omit model/harness overrides unless the user requested them. Give each delegate a concrete deliverable and bounded file ownership. Keep independent parent work moving; reports arrive automatically. Each delegate runs one work item in a workspace; use mcp__cawco__handoff to guide it while that item runs, and handoff again to follow up after it reports — that continues its own session on its cached transcript. Use start_session only for a separate persistent session.",
    "The catalog below is a session-start snapshot of configured routes, not confirmation of the model that will serve a request. If delegation fails or no suitable route is available, report the blocker; do not silently move bulk exploration onto the parent model.",
    catalog,
  ].join("\n\n");
}
