import {
  IMAGE_GENERATION_DESCRIPTION,
  LANDS_MODES,
  type LandsMode,
} from "@cawco/core";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  artifactCreate,
  artifactDelete,
  artifactList,
  artifactPromote,
  artifactRead,
  artifactShow,
  artifactUpdate,
  commentRead,
  commentReply,
  commentResolve,
  componentsList,
} from "./artifacts/tools";
import {
  type HandoffDeps,
  handoffActions,
  SPAWNING_TOOLS,
} from "./delegation-actions";
import { budgetParameter, groupParameter, ownsParameter } from "./task-tools";
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

/** The account a session runs on, for `delegate` and `start_session`. */
const accountParameter = () =>
  z
    .string()
    .optional()
    .describe(
      "The account the session runs on, by its label or id. Name one only when the user asks for that account; omitted, the hub places it by the fleet's routing."
    );

/** A work item's acceptance checks: `delegate` files them, `set_item_checks` replaces them. */
const checksParameter = () =>
  z
    .array(
      z.object({
        name: z.string().describe("2 to 6 plain words."),
        command: z
          .string()
          .describe("A shell command, run at the repository's root."),
        expect: z
          .string()
          .optional()
          .describe(
            "A literal string the last 4,000 characters of stdout must contain."
          ),
        machine: z
          .string()
          .optional()
          .describe(
            "Run it on this machine (hostname or machineId) at the item's last commit, like an Xcode build on the Mac."
          ),
        host: z
          .boolean()
          .optional()
          .describe(
            "Run it unsandboxed on a fresh checkout of the last commit: a probe whose scratch fleet delegates, podman. Only you set it."
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
    " Call it once done: the hub runs the checks itself. Pass `blocked` with the exact command and error text only when something outside your control stops the work; the item then fails with that reason. Anything you noticed outside your brief goes in `findings`, not in the work. When your item is an attempt at a task, the first call lists the task's open to-dos once, before any check runs: tick each one you finished with todo_write, say in your summary why each other one stays open, and call again.";
  switch (lands) {
    case "branch":
      return `Finish your work item. Commit your work first and do not push. The hub runs the item's acceptance checks in your worktree and returns each result. When all pass, the hub pushes your branch to origin (nothing goes onto the base branch); the item is then done and your parent receives the results. When a check fails or work is left uncommitted, you get the details back: fix the cause and call finish_item again.${outputs}${close}`;
    case "pr":
      return `Finish your work item. Commit your work first and do not push. The hub runs the item's acceptance checks in your worktree and returns each result. When all pass, the hub pushes your branch to origin and opens a pull request against the base branch (or updates the one already open for it); the item is then done and your parent receives the results with the pull request's link. When a check fails or work is left uncommitted, you get the details back: fix the cause and call finish_item again.${outputs}${close}`;
    case "none":
      return `Finish your work item. Nothing is pushed: the hub runs the item's acceptance checks in your worktree and returns each result, and when all pass, your outputs are collected into the project's folder; the item is then done and your parent receives the results. Each output must be a file at its path in your workspace; a missing one comes back to you like a failing check, as does a failing check: fix the cause and call finish_item again.${close}`;
    default:
      return `Finish your work item. Commit your work first and do not push. The hub runs the item's acceptance checks in your worktree and returns each result. When all pass, the hub rebases your commits onto the base branch (running the checks again if that changed your tree) and pushes to it; the item is then done and your parent receives the results. When a check fails or your commits conflict with the base branch, you get the details back: fix the cause and call finish_item again.${outputs}${close}`;
  }
};

const HANDOFF_DESCRIPTION =
  "Send a message to another session on the fleet: guide one of your delegates while its work item runs, or brief a session that already owns the work. " +
  "An idle target starts on it at once; a busy one reads it at its next step, a command it is running moved to the background and kept going. " +
  "For new standalone work, delegate instead. " +
  "A message to your own delegate after it reports (done, failed or cancelled) reopens its work item in the same session, on its cached transcript; prefer a fresh delegate unless that session is warm and holds context the task needs. " +
  "A cold target other than your own parent is refused once with the cost considerations; a repeat of the call is delivered.";

/** `handoff`'s target and message, every session's. */
const handoffShape = () => ({
  target: z
    .string()
    .describe(
      'The session or thread: a mention copied whole ("@Title <cockpit#5a167bde>"), an id, a directory or a title. A name reaches your parent when theirs; one several sessions answer to is refused.'
    ),
  message: z
    .string()
    .describe(
      "The brief, for an engineer who cannot see your conversation: what you found, where (file and line), and the ask."
    ),
});

/** `handoff`'s call: the message, with the inputs of a session that may delegate. */
const handed =
  (actions: ReturnType<typeof handoffActions>) =>
  async ({
    target,
    message,
    inputs,
  }: {
    inputs?: string[];
    message: string;
    target: string;
  }) => ({
    content: [
      {
        type: "text" as const,
        text: await actions.handoff(target, message, inputs),
      },
    ],
  });

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

/** The tools themselves, separated from the server so they can be exercised directly. */
/** A tool's answer: the hub's JSON, as text. */
const json = (answer: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(answer) }],
});

export function handoffTools(deps: HandoffDeps) {
  const actions = handoffActions(deps);
  const all = [
    tool(
      "workflow_create",
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
      "workflow_update",
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
      "workflow_run",
      "Run a saved workflow by name or slug. You become its supervisor and receive a receipt, as a queued peer message, for each step, checkpoint and the run's end: status, attempt, time, a `ref`, the result's size and the names of its top-level keys, or the whole result when it is 1,000 characters or less. Read more of a result with workflow_read only when you need it. A step that runs out of attempts is held for your decision (workflow_steer retry or fail); a receipt sent while your session is not live is kept and sent when it next is.",
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
      "workflow_steer",
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
      "workflow_list",
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
            "Intended use, subject, framing, style, lighting, materials and exclusions; exact text quoted, with its placement and typography. A complex brief as Scene/Subject/Details/Constraints. An edit: 'Change only X; preserve Y', naming the identity, geometry, lighting and labels to keep. One change per iteration, the previous output as its input."
          ),
        output_path: z
          .string()
          .min(1)
          .describe(
            "New .png path on the calling session's machine. Relative paths resolve from its working directory; existing files are not overwritten."
          ),
        reference_images: z
          .array(z.string().min(1))
          .max(5)
          .optional()
          .describe(
            "Ordered local PNG/JPEG/WebP/GIF paths, each given its role in the prompt ('Image 1: person to preserve; Image 2: clothing to apply'); for a follow-up edit, the previous output, with what to preserve restated. 50 MiB each, 100 MiB in all."
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
            "Defaults to auto. low for drafts; high for dense text, diagrams or fine detail, raised only when a result falls short: higher is not always better."
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
      "The live delegate catalog, the one a named delegate's dispatch reads: each type's task description, harness, model, effort, skills, denied tools and whether it may delegate. " +
        "In a project its own types (source 'project') come first and replace fleet types of the same name. " +
        "Read it before choosing a type or answering what a type runs; it spawns nothing, and a setting is configuration, not proof of the model served.",
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
      "The other sessions on the fleet, each with the directory and machine it works in, then the machines online now by the names `machine` takes on delegate and start_session. " +
        "It shows where each session works, not what it is doing, how busy it is or whether it will take a handoff, and recency is not ownership. " +
        "Use it to find a session that already owns the work, or to name a delegate; delegate types are list_delegate_types'. " +
        "A finished delegate still takes a handoff from its parent or the user, in its own session.",
      {},
      async () => ({
        content: [{ type: "text" as const, text: actions.listSessions() }],
      })
    ),
    // A leaf has no delegate of its own to hand inputs to: only a session
    // that may delegate is listed `inputs`.
    deps.canDelegate === false
      ? tool("handoff", HANDOFF_DESCRIPTION, handoffShape(), handed(actions))
      : tool(
          "handoff",
          HANDOFF_DESCRIPTION,
          {
            ...handoffShape(),
            inputs: z
              .array(z.string())
              .optional()
              .describe(
                "For your delegate: files on your machine, by absolute path, copied to its $TMPDIR/inputs/ first."
              ),
          },
          handed(actions)
        ),
    tool(
      "start_session",
      "Start a NEW session on the fleet and give it work. Unlike a subagent, this " +
        "is a full session of its own: its own row in the sidebar, nested under this session, " +
        "its own transcript the user can open, and it survives after this turn ends. " +
        "Unlike a delegate it is no work item: nothing waits on it or reports back. " +
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
        spinOff: z
          .boolean()
          .optional()
          .describe(
            "A spin-off: throwaway work, its transcript deleted when the session is discarded. " +
              "Default false: kept."
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
        account: accountParameter(),
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
        spinOff,
        type,
        model,
        account,
        permissionMode,
        machine,
      }) => {
        const result = await actions.startSession(cwd, prompt, title, {
          spinOff,
          type,
          model,
          account,
          permissionMode,
          machine,
        });
        // The sentence rides in the structured result: Claude Code hands the
        // model `structuredContent` when a tool returns one, not `content`.
        const sc = {
          instanceId: result.id,
          title: result.title,
          text: result.text,
        };
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
        "Each call starts one work item in a workspace: a shared clone of the repository on its own branch, every shell command of the delegate inside its boundary. It writes only its clone, its scratch folder and the workspaces' own cache (host caches are read-only), reads no credential store, SSH key or key agent, has no service manager, and reaches another machine only by a check's `machine` or a delegate there; it signals only its own processes, and on Linux sees only them. The workspace is cut on this session's machine unless `machine` names another. Without `workspace` the item gets a new one; with it, the item is the follow-up there: under its own title, in the workspace's last session, which reads the brief as its next message on its cached transcript. " +
        "A workspace runs one item at a time, and keeps its checkout while its session can be continued. To follow up on a delegate's work, handoff to that delegate, or delegate with its `workspace` to file the follow-up as its own item: either way it continues its own session and cached transcript. Prefer a fresh delegate unless the existing session is warm and holds context this task needs. A cold workspace session is refused once with the cost considerations, and a repeat of the call is delivered.\n\n" +
        "Set `fork: true` when the work needs what this conversation already holds: the delegate starts as a copy of this conversation (on this session's harness and model, so the prompt cache carries over) and reads the brief as its next turn, in a new workspace of its own.",
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
            "A named delegate type, from list_delegate_types (the live catalog the call uses). Sets harness/model/effort/skills " +
              "for you; an explicit harness/model/skills below still overrides what the type says. " +
              "Default: Jev's pick when the hub has Jev, else 'medium'; with a harness other than medium's and no type, `model` is required."
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
            "Model id for the harness, e.g. opencode-go/deepseek-v4.1-flash. Omit for the type's " +
              "own model. Overrides `type`'s model when both are set."
          ),
        account: accountParameter(),
        cwd: z
          .string()
          .optional()
          .describe(
            "The repository a new workspace is cut from, on branch ws/<id> off its default branch as fetched then. " +
              "With `machine`, an absolute path there, required when not this session's machine. " +
              "Default: this session's directory; unused with `workspace`."
          ),
        machine: z
          .string()
          .optional()
          .describe(
            "The machine the work item runs on: its hostname as the fleet shows it (list_sessions ends with those online) or machineId; " +
              "this session's when omitted. An unknown or offline machine is refused."
          ),
        skills: z
          .array(z.string())
          .optional()
          .describe(
            "Skills the delegate loads before the prompt, as if /skill-name were typed there, on any harness. Overrides `type`'s skills."
          ),
        workspace: z
          .string()
          .optional()
          .describe(
            "A workspace id from an earlier delegate's result or report: the item is its follow-up, the brief " +
              "going to that workspace's last session on its cached transcript. Refused while an item there runs, " +
              "and with type, model, harness, skills, fork or machine, which are that session's own."
          ),
        fork: z
          .boolean()
          .optional()
          .describe(
            "Start the delegate as a fork of this conversation: every turn so far, then the brief, on this " +
              "session's harness and model so the prompt cache carries over (another is refused); `type` still " +
              "sets effort, skills and denied tools. Always a new workspace, never with `workspace`."
          ),
        can_delegate: z
          .boolean()
          .optional()
          .describe(
            "Let the delegate spawn delegates and sessions of its own. Default false, a leaf that does the work itself and reports here, " +
              'unless its type is marked "may delegate by default"; a value here wins. Set true only for an orchestrator that must fan out.'
          ),
        checks: checksParameter().describe(
          "The item's acceptance checks. When the delegate calls finish_item, the hub runs each in the item's worktree, inside its boundary as the delegate's own commands run (same $TMPDIR), but a `host` one; the item is done only when every command exits 0 and its stdout contains `expect` where given. Write what a reviewer would run: build, lint, type-check, a grep proving a removal, one script for a live assertion; a probe that delegates is a `host` check."
        ),
        inputs: z
          .array(z.string())
          .optional()
          .describe(
            "Files on this machine its sandbox can't read (a log excerpt), by absolute path: copied to its $TMPDIR/inputs/ before its first turn. No secrets; 64 MiB in all."
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
            "Deliverable files that are not commits, as paths from the repository's root, e.g. ['report.md']. " +
              "Once the checks pass, the hub copies each into the project's folder under assets/<task or item>/ and the report lists them; " +
              "a missing one fails like a check. Needs this session to be in a project."
          ),
        group: groupParameter().optional(),
        owns: ownsParameter().optional(),
        budget: budgetParameter().optional(),
      },
      async ({
        prompt,
        title,
        type,
        harness,
        model,
        account,
        cwd,
        skills,
        workspace,
        fork,
        can_delegate,
        checks,
        inputs,
        machine,
        lands,
        outputs,
        group,
        owns,
        budget,
      }) => {
        const result = await actions.delegate(prompt, {
          title,
          cwd,
          harness,
          model,
          account,
          skills,
          workspace,
          fork,
          type,
          canDelegate: can_delegate,
          checks,
          inputs,
          machine,
          lands,
          outputs,
          group,
          owns,
          budget,
        });
        const sc = {
          delegateInstanceId: result.id,
          title: result.title,
          workItemId: result.workItemId,
          workspaceId: result.workspaceId,
          ...(result.workspaceTmp ? { workspaceTmp: result.workspaceTmp } : {}),
          ...(result.queued ? { queued: result.queued } : {}),
          text: result.text,
        };
        return {
          content: [{ type: "text" as const, text: result.text }],
          structuredContent: sc,
        };
      }
    ),
    tool(
      "delegate_list",
      "Your delegation tree: each delegate you started, theirs nested, with its work item's state, last activity, cache warmth, queued messages, what it waits on, and plan progress; and under queued, your delegates still waiting for owned files (state queued), each with when it was queued and the live item and globs holding it; and under held, workspaces whose items ended with unlanded work. Read it before handing off to a delegate or calling one stuck.",
      {
        include: z
          .enum(["live", "all"])
          .optional()
          .describe(
            "live (default): items not dismissed that are not ended, or ended in the last hour. all: every item."
          ),
      },
      async ({ include }) => {
        const tree = await actions.delegateList(include ?? "live");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(tree) }],
          structuredContent: tree,
        };
      },
      {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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
        headline: z
          .string()
          .trim()
          .min(1)
          .describe(
            "The outcome in one or two plain sentences that stand alone, shown whole at a glance: what changed and whether it passed. No ids or file names."
          ),
        summary: z
          .string()
          .describe("The full report: what was done and how it was proven."),
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
      "Go on from a summary of a session, written by a model you choose. Name another `session`: a new " +
        "session starts on the model and harness you choose; the named one is only read. Omit it: this " +
        "session goes on itself once this turn ends, in a fresh conversation on `target_model` (its own " +
        "harness), keeping its id, parent, delegates and work item.",
      {
        session: z
          .string()
          .optional()
          .describe(
            "Another session to continue in a new session: its id, short id, or directory name. Omit it to continue this session itself, in place."
          ),
        from: z
          .enum(["summary", "asks"])
          .optional()
          .describe(
            '"asks": open on the person\'s own messages alone, verbatim, in order; nothing is summarised.'
          ),
        summarizer_harness: z
          .enum(["claude", "opencode", "pi"])
          .optional()
          .describe("The harness that writes the summary."),
        summarizer_model: z
          .string()
          .min(1)
          .optional()
          .describe(
            "The model that writes the summary, e.g. opencode-go/deepseek-v4.1-flash."
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
            text: result.text,
          },
        };
      }
    ),
    tool(
      "set_item_checks",
      "Replace the whole list of acceptance checks on one of YOUR delegates' running work items; the delegate is told, and finish_item runs the new list. Use it when a check was written for a design that then changed, instead of stopping the delegate.",
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
        "can be stopped. Its work item is cancelled; a later handoff to it reopens the item in the same session. " +
        "Given a queued delegate's id (one delegate queued behind owned files, listed under queued by delegate_list), " +
        "it withdraws it from the queue: it never started, so it has no session or workspace.",
      {
        target: z
          .string()
          .describe(
            'The delegate to stop: its directory name, e.g. "keeboard", or its id; for a queued delegate, its queued id or its first 8 characters.'
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
      "Interrupt one of YOUR delegates mid-turn without ending it. It keeps its state and stays idle: " +
        "nothing automatic wakes it, only your handoff or the person's message.",
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
            text: actions.interruptDelegate(target),
          },
        ],
      })
    ),
    tool(
      "machine_pause",
      "Pause a machine for some minutes: its turns stop and nothing starts there until then; work for it waits. resume: true ends it.",
      {
        machine: z.string(),
        minutes: z.number().int().min(1).max(1440).optional(),
        resume: z.boolean().optional(),
      },
      async ({ machine, minutes, resume }) => ({
        content: [
          {
            type: "text" as const,
            text: await actions.machinePause(machine, minutes, resume),
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
            text: actions.answerDelegate(target, requestId, answers, deny),
          },
        ],
      })
    ),
    tool(
      "send_to_user",
      "Show the user a message on their Telegram: progress, partial results, or content they must see exactly as written before the task finishes. " +
        "The call fails, naming each one, when anything did not reach the user.",
      {
        message: z
          .string()
          .describe("The text to show the user, exactly as it should read."),
        attachments: z
          .array(z.string())
          .optional()
          .describe(
            "Absolute paths of image or video files on this machine (png, jpg, gif, webp, avif, bmp, mp4, mov, webm; up to 50 MB each, Telegram's limit), read off it as the message is sent: you need not read them yourself."
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
          content: [{ type: "text" as const, text: actions.showImage(path) }],
        })
    ),
    tool(
      artifactList.name,
      artifactList.description,
      artifactList.input,
      async ({ waiting }) =>
        json(
          await actions.artifactCall(
            "GET",
            `/status${waiting ? "?waiting=true" : ""}`
          )
        ),
      {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    ),
    tool(
      artifactCreate.name,
      artifactCreate.description,
      artifactCreate.input,
      async (input) => json(await actions.artifactCall("POST", "", input))
    ),
    tool(
      artifactUpdate.name,
      artifactUpdate.description,
      artifactUpdate.input,
      async ({ id, ...change }) =>
        json(
          await actions.artifactCall(
            "PATCH",
            `/${encodeURIComponent(id)}`,
            change
          )
        )
    ),
    tool(
      artifactRead.name,
      artifactRead.description,
      artifactRead.input,
      async ({ id, since, png }) => {
        const query = new URLSearchParams({
          ...(since === undefined ? {} : { since: String(since) }),
          ...(png ? { png: "true" } : {}),
        }).toString();
        let target = id;
        if (target === undefined) {
          const [newest] = (await actions.artifactCall("GET", "")) as {
            id: string;
          }[];
          if (!newest) {
            throw new Error("This session has made no artifact yet.");
          }
          target = newest.id;
        }
        const answer = (await actions.artifactCall(
          "GET",
          `/${encodeURIComponent(target)}${query ? `?${query}` : ""}`
        )) as { png?: string | null };
        // A canvas's picture is an image the model sees, beside the outline.
        const { png: picture, ...rest } = answer;
        return picture
          ? {
              content: [
                { type: "text" as const, text: JSON.stringify(rest) },
                {
                  type: "image" as const,
                  data: picture,
                  mimeType: "image/png",
                },
              ],
            }
          : json(png ? { ...rest, png: null } : rest);
      },
      {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    ),
    tool(
      componentsList.name,
      componentsList.description,
      componentsList.input,
      async ({ dir }) =>
        json(
          await actions.artifactCall(
            "GET",
            `/components${dir ? `?dir=${encodeURIComponent(dir)}` : ""}`
          )
        ),
      {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    ),
    tool(
      artifactShow.name,
      artifactShow.description,
      artifactShow.input,
      async ({ id }) =>
        json(
          await actions.artifactCall("POST", `/${encodeURIComponent(id)}/show`)
        )
    ),
    tool(
      artifactPromote.name,
      artifactPromote.description,
      artifactPromote.input,
      async ({ id }) =>
        json(
          await actions.artifactCall(
            "POST",
            `/${encodeURIComponent(id)}/promote`
          )
        ),
      {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      }
    ),
    tool(
      artifactDelete.name,
      artifactDelete.description,
      artifactDelete.input,
      async ({ id }) =>
        json(await actions.artifactCall("DELETE", `/${encodeURIComponent(id)}`))
    ),
    tool(
      commentRead.name,
      commentRead.description,
      commentRead.input,
      async ({ artifact, filter, since }) => {
        // The session reads them itself: what it reads counts as heard.
        const query = new URLSearchParams({
          filter,
          reader: "session",
          ...(artifact ? { artifact } : {}),
          ...(since ? { since } : {}),
        }).toString();
        return json(await actions.artifactCall("GET", `/comments?${query}`));
      },
      {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    ),
    tool(
      commentReply.name,
      commentReply.description,
      commentReply.input,
      async ({ pin, ...reply }) =>
        json(
          await actions.artifactCall(
            "POST",
            `/comments/${encodeURIComponent(pin)}/reply`,
            reply
          )
        )
    ),
    tool(
      commentResolve.name,
      commentResolve.description,
      commentResolve.input,
      async ({ pin, ...resolve }) =>
        json(
          await actions.artifactCall(
            "POST",
            `/comments/${encodeURIComponent(pin)}/resolve`,
            resolve
          )
        )
    ),
  ];
  return all.filter(
    (entry) =>
      (!STEP_TOOLS.has(entry.name) || !!deps.workflowStepId) &&
      (deps.canDelegate !== false || !SPAWNING_TOOLS.has(entry.name)) &&
      (!["finish_item", "wait_item"].includes(entry.name) || !!deps.workItem)
  );
}

/**
 * The CawCo tools a Claude session loads upfront, where its toolset has them
 * (MCP `_meta` `"anthropic/alwaysLoad": true`, delegation-mcp.ts `listed`);
 * every other one is deferred behind ToolSearch. These are the calls a
 * session makes every turn or must not miss: in one orchestrator, handoff
 * 69 calls, delegate 32, artifact_create 11 (2026-10-15); a leaf's
 * finish_item and every session's set_title are asked for by name. When
 * delegate sat deferred, one name among 133, sessions ran work inline 79
 * times for each delegation. "Keep your 3–5 most frequently used tools
 * non-deferred so Claude can call them without searching first"
 * (platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool).
 */
export const ALWAYS_LOAD: ReadonlySet<string> = new Set([
  "delegate",
  "handoff",
  "finish_item",
  "set_title",
  "artifact_create",
]);

/**
 * The deferred groups by prefix, as the server's instructions name them:
 * "Use consistent namespacing … so one search matches the whole group" and
 * "Add a system prompt section describing available tool categories"
 * (tool-search-tool docs).
 */
const DEFERRED_GROUPS: readonly { prefixes: string[]; what: string }[] = [
  { prefixes: ["admin_"], what: "fleet configuration" },
  { prefixes: ["task_"], what: "project tasks" },
  { prefixes: ["todo_write"], what: "your plan, and your task's to-dos" },
  {
    prefixes: [
      "routine_",
      "event_route_",
      "connector_poll_",
      "relay_",
      "action_",
    ],
    what: "project automation",
  },
  { prefixes: ["workflow_", "submit_result"], what: "workflows" },
  {
    prefixes: ["artifact_", "comment_", "components_list"],
    what: "artifacts you show, the person's pins on them, the components a sheet shows",
  },
  { prefixes: ["memory_"], what: "project memory" },
  { prefixes: ["thread_"], what: "your threads with the person" },
  { prefixes: ["view_"], what: "the project's views" },
  { prefixes: ["folder_"], what: "the project's folder on the hub" },
  { prefixes: ["conn__"], what: "connections granted to this session" },
];

/**
 * What a session can be listed over its life: its role and whether it may
 * delegate are fixed at its start, its project is not (`project_from_session`
 * makes one). `names` is the union across both; `inProject` and
 * `outsideProject` the ones listed only in a project or only outside one.
 * Claude Code reads a server's instructions once and its tool list again on
 * every `list_changed`, so the instructions name both sides.
 */
export interface Listable {
  inProject: ReadonlySet<string>;
  names: readonly string[];
  outsideProject: ReadonlySet<string>;
}

/** Where a name, or a group of them, is listed, when only on one side. */
const sideOf = (members: readonly string[], listable: Listable): string => {
  if (members.every((name) => listable.inProject.has(name))) {
    return " (in a project)";
  }
  return members.every((name) => listable.outsideProject.has(name))
    ? " (outside a project)"
    : "";
};

/**
 * One paragraph: which tools load upfront on Claude, and the rest by group
 * prefix, each group only when the session can have one of its tools, then
 * the ungrouped ones by name; a group or name listed on one side of a
 * project only says which.
 */
const loadingLine = (listable: Listable): string => {
  const { names } = listable;
  const upfront = names.filter((name) => ALWAYS_LOAD.has(name));
  const deferred = names.filter((name) => !ALWAYS_LOAD.has(name));
  const grouped = new Set<string>();
  const groups = DEFERRED_GROUPS.flatMap(({ prefixes, what }) => {
    const members = deferred.filter((name) =>
      prefixes.some((prefix) => name.startsWith(prefix))
    );
    for (const name of members) {
      grouped.add(name);
    }
    const present = prefixes.filter((prefix) =>
      members.some((name) => name.startsWith(prefix))
    );
    return present.length > 0
      ? [
          `${present.map((prefix) => (prefix.endsWith("_") ? `${prefix}*` : prefix)).join(", ")}: ${what}${sideOf(members, listable)}`,
        ]
      : [];
  });
  const rest = deferred
    .filter((name) => !grouped.has(name))
    .map((name) => `${name}${sideOf([name], listable)}`);
  return `On Claude, ${upfront.join(", ")} load upfront; every other CawCo tool is deferred: load it with ToolSearch by its name (select:mcp__cawco__<name>) or its group's prefix before saying it is unavailable. ${[...groups, ...(rest.length > 0 ? [`also ${rest.join(", ")}`] : [])].join("; ")}.`;
};

/** The server's instructions for one session, from what it can be listed. */
export function handoffInstructions(
  deps: HandoffDeps,
  listable: Listable
): string {
  const { names } = listable;
  const naming =
    "Name this session with set_title in 3 to 6 plain words once its task is clear; call it again only when the task changes.";
  // Sessions said image generation was unavailable on models without it:
  // the tool is the hub's, on every model, and stays the session's own.
  const images = names.includes("generate_image")
    ? "\n\ngenerate_image makes images on any model, through the machine's ChatGPT login; never hand image generation to another model."
    : "";
  const loading = `\n\n${loadingLine(listable)}`;
  if (deps.canDelegate === false) {
    return `This session is a leaf delegate. Do the assigned work yourself and call finish_item when it is done; delegate and start_session are unavailable. Use wait_item for a bounded wait on a command you started. Use mcp__cawco__handoff to reach your parent or a session that already owns related work.\n\n${naming}${loading}${images}`;
  }
  // The orchestrator's seat, the same on every model: an Opus orchestrator
  // made 387 shell and about 50 browser calls in one day (killing dev
  // servers, probing sockets, reading journals) where a brief belonged.
  return [
    "This session orchestrates: it plans, briefs, reads reports and decides. Run reads yourself: git status, log or diff, a grep, a file, a log tail, a port check, a curl for a status. Hand substantial execution to a delegate with acceptance checks: implementation, builds, browser checks, probes, and any diagnosis that takes more than a few steps. The brief keeps intent, decisions and acceptance here and asks for evidence and conclusions, not file dumps. CawCo's delegate is not the harness's own subagents, which do not resolve CawCo's types.",
    `${naming}${loading}${images}`,
    "Call list_delegate_types for the live catalog of delegate types (model, effort and harness each routes to) rather than guessing a model. Claude names these tools mcp__cawco__list_delegate_types and mcp__cawco__delegate; OpenCode names them cawco_list_delegate_types and cawco_delegate. These are tools, not MCP resources. list_sessions lists running sessions, not configured types.",
    "Prefer the configured type and omit model/harness overrides unless the user requested them. Give each delegate a concrete deliverable and bounded file ownership. Keep independent parent work moving; reports arrive automatically. Each delegate runs one work item in a workspace; use mcp__cawco__handoff to guide it while that item runs, and handoff again to follow up after it reports — that continues its own session on its cached transcript. Use start_session only for a separate persistent session.",
    "If delegation fails or no suitable type is available, report the blocker; do not silently move bulk exploration onto this session.",
  ].join("\n\n");
}
