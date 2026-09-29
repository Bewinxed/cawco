import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { IMAGE_GENERATION_DESCRIPTION } from "@whiffle/core";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  type HandoffDeps,
  handoffActions,
  SPAWNING_TOOLS,
} from "./delegation-actions";
import { SESSION_TITLE_DESCRIPTION, SESSION_TITLE_MAX } from "./work-items";

/** The name the caller gives a session it starts or delegates to; never cut from the brief. */
const sessionTitle = () =>
  z
    .string()
    .trim()
    .min(1)
    .max(SESSION_TITLE_MAX)
    .describe(SESSION_TITLE_DESCRIPTION);

function tool<T extends z.ZodRawShape>(
  name: string,
  description: string,
  input: T,
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>,
  annotations?: ToolAnnotations
) {
  const schema = z.object(input);
  return {
    name,
    description,
    inputSchema: zodToJsonSchema(schema),
    ...(annotations ? { annotations } : {}),
    handler: (args: unknown) => handler(schema.parse(args)),
  };
}

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
 * it exposes: `mcp__whiffle__handoff`, `…__start_session`, `…__delegate`.
 */
export const MCP_SERVER_NAME = "whiffle";

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
      'Create a workflow from a TypeScript program: `import { z } from "zod"`, `export const inputs = z.object({…})`, and a default-exported async function taking the Workflow runtime (w.run, w.spawn, w.ask, w.exec, w.exists, w.workflow, w.state, w.checkpoint, w.sleep, w.now, w.notify, w.notes, w.log). zod is the only import allowed; the program must be deterministic. Returns the saved workflow, or line-numbered typecheck problems verbatim.',
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
      { result: z.record(z.unknown()) },
      async ({ result }) => ({
        content: [
          { type: "text" as const, text: await actions.submitResult(result) },
        ],
      })
    ),
    tool(
      "run_workflow",
      "Run a saved workflow by name or slug. You become its supervisor and receive step reports and its final outcome as queued peer messages.",
      {
        name: z.string(),
        inputs: z.record(z.unknown()),
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
      "steer_workflow",
      "Steer a workflow you supervise: note for the next step, retry a failed step, answer a supervisor question, or cancel. Routing remains controlled by the saved graph.",
      {
        runId: z.string(),
        action: z.discriminatedUnion("type", [
          z.object({ type: z.literal("note"), text: z.string() }),
          z.object({ type: z.literal("retry"), stepId: z.string() }),
          z.object({
            type: z.literal("answer"),
            stepId: z.string(),
            choice: z.string(),
            note: z.string().optional(),
          }),
          z.object({ type: z.literal("cancel") }),
        ]),
      },
      async ({ runId, action }) => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(await actions.steerWorkflow(runId, action)),
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
      "List the other sessions running on the fleet, with the directory each is working in. " +
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
        "the message reopens its work item in the same session, on its cached transcript.",
      {
        target: z
          .string()
          .describe(
            'The session to hand to: its directory name, e.g. "keeboard", or its id.'
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
      "Start a NEW session on the fleet using the caller's harness and give it work. Unlike a subagent, this " +
        "is a full session of its own: it gets its own row in the sidebar, its own transcript " +
        "the user can open and read, its own model and permission mode, and it survives after " +
        "this turn ends. Use it when the user asks you to spin something off, or when work " +
        "belongs in a different directory and no session is running there yet. Prefer " +
        "`handoff` when a session is ALREADY running in that directory.",
      {
        cwd: z
          .string()
          .describe(
            "Absolute directory the new session works in. Often a DIFFERENT project from this " +
              "one — if the user named another repository or folder, use that. Defaults to " +
              "this session's directory only when they did not."
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
        model: z
          .string()
          .optional()
          .describe("Model id. Omit to let the SDK choose."),
      },
      async ({ cwd, prompt, title, sideQuest, model }) => {
        const result = await actions.startSession(
          cwd,
          prompt,
          title,
          sideQuest,
          model
        );
        const sc = { instanceId: result.id, title: result.title };
        return {
          content: [{ type: "text" as const, text: result.text }],
          structuredContent: sc,
        };
      }
    ),
    tool(
      "delegate",
      "Run a task as a SUB-AGENT: a new temporary fleet session with its own fresh context (or, with `fork`, a copy of this one), which reports back here automatically when its turn completes.\n\n" +
        "Use this for SUBSTANTIAL bounded work that must report back: multi-file implementation, a sweep that would take dozens of reads across a codebase, builds or deploys with verification loops, browser audits, evidence you must interpret across many files or logs. A delegate answers those in its own fresh context and hands back conclusions.\n\n" +
        "Run menial work yourself: git status/log/diff, ls/grep/find, reading a file or a handful of files, port and process checks, tailing a log, a dev-server restart, and the reads needed to write a brief. Ten read-only commands in a row is normal prep; a delegate for that costs more than the task and its report costs more to read than the output.\n\n" +
        "Do NOT delegate: a single command or file read whose exact output you need; edits to files you are actively changing; anything the user asked to watch you do directly.\n\n" +
        "A delegate that is not a fork cannot see this conversation, so `prompt` must stand alone: intent, constraints, acceptance criteria, and what not to do. Keep the decisions yourself and ask for evidence and conclusions, not file dumps.\n\n" +
        "Prefer `type` over raw harness/model — it routes by what the work needs rather than a model string you must already know; use list_delegate_types for the live catalog. Prefer this over start_session when the work must report back, and over handoff for new standalone work (set cwd for another repository).\n\n" +
        "Each call starts one work item in a workspace: a git worktree on its own branch. Without `workspace` the item gets a new one; with `workspace` it is the follow-up there: a new item, under its own title, in the workspace's last session, which reads the brief as its next message on its cached transcript. " +
        "A workspace runs one item at a time, and keeps its checkout while its session can be continued. To follow up on a delegate's work, handoff to that delegate, or delegate with its `workspace` to file the follow-up as its own item: either way it continues its own session and cached transcript.\n\n" +
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
              "The description below is a startup snapshot; execution reads the current hub definition. " +
              "Use list_delegate_types to see edits made since this session started."
          ),
        harness: z
          .enum(["claude", "opencode", "pi"])
          .optional()
          .describe(
            "Which runtime runs the delegate. 'opencode' with model 'opencode-go/deepseek-v4-pro' " +
              "delegates to DeepSeek. Default claude. Overrides `type`'s harness when both are set."
          ),
        model: z
          .string()
          .optional()
          .describe(
            "Model id for the harness, e.g. opencode-go/deepseek-v4-flash. Omit for the harness " +
              "default, or for `type`'s own model. Overrides `type`'s model when both are set."
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "The repository a new workspace is cut from, on branch ws/<id> from origin/main. " +
              "Defaults to this session's directory; unused with `workspace`."
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
              "model, harness, skills or fork, which are that session's own; delegate without workspace for a different model."
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
          .record(z.string())
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
      (deps.canDelegate !== false || !SPAWNING_TOOLS.has(entry.name))
  );
}

export function handoffInstructions(deps: HandoffDeps): string {
  const images =
    "Whiffle can generate images regardless of your model: use generate_image (Claude: mcp__whiffle__generate_image; OpenCode: whiffle_generate_image). It uses the machine's ChatGPT subscription login only. Pass reference_images for edits or visual guidance, then show the returned path with show_image. Discover deferred tools before claiming image generation is unavailable. Do not delegate image generation to a different model.";
  if (deps.canDelegate === false) {
    return `This session is a leaf delegate. Do the assigned work yourself; delegate and start_session are unavailable. Use mcp__whiffle__handoff to reach your parent or a session that already owns related work.\n\n${images}`;
  }
  let catalog = deps.delegateTypes?.length
    ? delegateTypeLine(deps.delegateTypes).trim()
    : "Call mcp__whiffle__list_delegate_types to discover the current routes rather than guessing a model.";
  if (deps.delegateTypesError) {
    catalog = `${deps.delegateTypesError}. The catalog is unavailable, not empty. A delegate call naming a known type retries the fetch; if no type is known, report the catalog blocker rather than guessing a model.`;
  }
  return [
    images,
    "Use Whiffle's delegate tool for bounded fleet work that must report back to its parent. Native harness subagents are a separate mechanism and do not resolve Whiffle presets.",
    'Call list_delegate_types for current model/effort mappings. Claude names these tools mcp__whiffle__list_delegate_types and mcp__whiffle__delegate; if deferred, use ToolSearch(query="select:mcp__whiffle__delegate"). OpenCode names them whiffle_list_delegate_types and whiffle_delegate. These are tools, not MCP resources. list_sessions lists running sessions, not configured types.',
    "Delegate substantial bounded work — multi-file implementation, wide sweeps, builds with verification, browser audits — with a brief that keeps intent, decisions, and acceptance with the parent and returns evidence and conclusions rather than file dumps. Menial reads and checks (git status, a grep, a file, a port) are the parent's own work, run inline.",
    "Prefer the configured type and omit model/harness overrides unless the user requested them. Give each delegate a concrete deliverable and bounded file ownership. Keep independent parent work moving; reports arrive automatically. Each delegate runs one work item in a workspace; use mcp__whiffle__handoff to guide it while that item runs, and handoff again to follow up after it reports — that continues its own session on its cached transcript. Use start_session only for a separate persistent session.",
    "The catalog below is a session-start snapshot of configured routes, not confirmation of the model that will serve a request. If delegation fails or no suitable route is available, report the blocker; do not silently move bulk exploration onto the parent model.",
    catalog,
  ].join("\n\n");
}
