import {
  DECIDES_RULE,
  HARNESSES,
  IMAGE_GENERATION_DESCRIPTION,
  IMAGE_QUALITIES,
  type Kind,
  kindsLine,
  LANDS_MODES,
  REFERENCE_GUIDANCE,
  SESSION_CHOSEN_MODES,
  SPAWNING_TOOLS,
} from "@cawco/core";
import { type HandedInput, handedInputSchema } from "@cawco/core/handed-input";
import type { DesignMap } from "@cawco/core/stage";
import type { ForgeWrite } from "@cawco/core/upstream-post";
import { z } from "zod";
import type {
  ArtifactRead,
  ArtifactStatus,
  Browsed,
  CommentRead,
  Created,
  Promoted,
  Removed,
  Revised,
  Settled,
  Shown,
} from "./artifacts/service";
import {
  artifactBrowse,
  artifactCreate,
  artifactCreateToParent,
  artifactDelete,
  artifactList,
  artifactPromote,
  artifactRead,
  artifactShow,
  artifactUpdate,
  commentRead,
  commentReply,
  commentResolve,
  designMap,
  settle,
} from "./artifacts/tools";
import {
  type HandoffDeps,
  handoffActions,
  type ItemEnd,
} from "./delegation-actions";
import { sentence, tool } from "./mcp-tool";
import {
  type AskChanged,
  artifactBrowsedWords,
  artifactCreatedDetailed,
  artifactCreatedWords,
  artifactListWords,
  artifactPromotedWords,
  artifactReadDetailed,
  artifactReadWords,
  artifactRemovedWords,
  artifactShownWords,
  artifactUpdatedDetailed,
  artifactUpdatedWords,
  type CommentReplied,
  type CommentResolved,
  type ComponentChanged,
  commentReadWords,
  commentRepliedWords,
  commentResolvedWords,
  designMapWords,
  settledWords,
  type Updated,
} from "./presenters/artifacts";
import {
  delegateListWords,
  delegateTypesWords,
  delegateWords,
  imageWords,
  startedWords,
} from "./presenters/sessions";
import {
  budgetParameter,
  groupParameter,
  ownsParameter,
  type TaskTool,
} from "./task-tools";
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

const ISO_TIME =
  "an ISO date or datetime, like 2026-10-20 or 2026-10-20T14:00Z";
/** An ISO time opens on its date; `Date.parse` alone takes "Oct 20" too. */
const ISO_DATE_FIRST = /^\d{4}-\d{2}-\d{2}/u;

/** A bound of `delegate_list`'s window: an ISO date or datetime the hub's clock reads. */
const isoTime = () =>
  z
    .string()
    .refine(
      (text) => ISO_DATE_FIRST.test(text) && !Number.isNaN(Date.parse(text)),
      { error: `Give ${ISO_TIME}.` }
    )
    .optional();

/** The account a session runs on, for `delegate` and `start_session`. */
const accountParameter = () =>
  z
    .string()
    .optional()
    .describe(
      "The account the session runs on, by its label or id. Name one only when the user asks for that account; omitted, the hub places it by the fleet's routing."
    );

/** What `forge_post` opens: an issue, a pull or merge request, or a comment. */
const FORGE_POST_KINDS = ["issue", "pull_request", "comment"] as const;
/** What a comment's `number` names. */
const FORGE_POST_ON = ["issue", "pull_request"] as const;

/** `forge_post`'s arguments as the one write they name, or a refusal saying what the kind needs. */
const forgeWriteOf = (asked: {
  base?: string;
  body: string;
  head?: string;
  kind: (typeof FORGE_POST_KINDS)[number];
  number?: number;
  on?: (typeof FORGE_POST_ON)[number];
  title?: string;
}): ForgeWrite => {
  const { kind, body, title, head, base, number } = asked;
  if (kind === "issue" && title) {
    return { op: "issue", title, body };
  }
  if (kind === "pull_request" && title && head && base) {
    return { op: "pull_request", title, body, head, base };
  }
  if (kind === "comment" && number && body.trim()) {
    return { op: "comment", body, number, on: asked.on ?? "issue" };
  }
  throw new Error(
    {
      issue: "An issue needs its title.",
      pull_request:
        "A pull or merge request needs its title, head (the pushed branch) and base.",
      comment:
        "A comment needs its body and the number of the issue or pull request it is on.",
    }[kind]
  );
};

/**
 * What `finish_item` says: the report is all the parent reads, carrying the
 * deliverable and its proof, and what the hub does
 * with the work: the session's own work item's landing (`lands`), so a
 * delegate is never told the hub pushes to the base branch when it does not;
 * a host-scope item's report is all it hands in.
 */
const finishItemDescription = (lands: ItemEnd = "main"): string => {
  const reads =
    " Your parent reads this report alone; chat messages reach no one. A report pointing at a chat message is refused.";
  const proof =
    " Your parent reads this report alone; chat messages reach no one. `summary` carries the deliverable whole, or names the file (committed, or in $TMPDIR/outputs/) holding a long one, then the proof: each command's real output, and what your boundary could not run. A report pointing at a chat message is refused.";
  const gate =
    "the merge checks your project's gate.md names (for CawCo: the dependency install, `bun run check --all`, and the iOS build when the app changed)";
  const back =
    " A failed check or a conflict comes back with its output: fix, commit, call again.";
  const outputs =
    " In a project, $TMPDIR/outputs/ and your declared outputs are copied to its folder's assets/; the report names each path.";
  const close =
    " `blocked` only when something outside your control stops the work. A task attempt's first call lists its open to-dos once: tick the done ones with todo_write, explain the rest, call again.";
  switch (lands) {
    case "host":
      return `Finish your work item. Nothing is landed: you ran on the machine itself.${reads} \`summary\` carries the findings and changes whole, then the proof: each command's real output, and what you could not run.${close}`;
    case "branch":
      return `Finish your work item. Commit and do not push.${proof} Then ${gate} runs on your commits and the hub pushes your branch to origin, not the base branch.${back}${outputs}${close}`;
    case "pr":
      return `Finish your work item. Commit and do not push.${proof} Then ${gate} runs on your commits, the hub pushes your branch and opens a pull request against the base branch (or updates the open one).${back}${outputs}${close}`;
    case "none":
      return `Finish your work item. Nothing is pushed.${proof}${outputs} A missing declared one comes back to you.${close}`;
    case "main":
      return `Finish your work item. Commit and do not push.${proof} Then the hub rebases your commits onto the base branch, runs ${gate} on the result and pushes.${back}${outputs}${close}`;
  }
};

const HANDOFF_DESCRIPTION =
  "Message another session: guide your delegate while it works, or brief a session that already owns the work; for new standalone work, delegate. " +
  "An idle target starts on it at once; a busy one reads it at its next step, its running command kept going. " +
  "To your delegate after it reported, it reopens its item in the same session; prefer a fresh delegate unless that session is warm. " +
  "A cold target (cache expired; never your parent) with uncommitted changes gets it; one with only unpushed commits is refused once, naming delegate's `from`; otherwise Jev decides when the hub has it, and that is final. " +
  "Repeat a call any other cold refusal answered to deliver it.";

/** `handoff`'s target and message, every session's. */
const handoffShape = () => ({
  target: z
    .string()
    .describe(
      "A handle (cockpit#5a167bde), a mention, an id, a directory or a title."
    ),
  message: z
    .string()
    .describe(
      "For an engineer who cannot see your conversation: what you found, where, and the ask."
    ),
});

/**
 * `inputs` of delegate and handoff (core handed-input.ts): a path to a file
 * or a folder, or what the hub holds by name, landing in the receiver's
 * `$TMPDIR/inputs/`, a folder and an item's assets as their trees. Shown
 * open; the hub checks each entry strictly (work-items.ts `readInputs`).
 */
const inputsParameter = () =>
  z
    .array(handedInputSchema(false))
    .optional()
    .describe(
      'Files for its $TMPDIR/inputs/: a path to a file, or to a folder (copied as inputs/<folder>/…, every file counted). Or what the hub holds, named by full id, short id or handle like cockpit#5a167bde: report or assets (an item\'s outputs with their folders) by item or session; an artifact as its files and picture; attachment by id, a name like "Picture 2", or the name an "Attached picture:" line gives a picture you were sent; blob: base64.'
    );

/** `handoff`'s call: the message, with the inputs of a session that may delegate. */
const handed =
  (actions: ReturnType<typeof handoffActions>) =>
  ({
    target,
    message,
    inputs,
  }: {
    inputs?: HandedInput[];
    message: string;
    target: string;
  }) =>
    actions.handoff(target, message, inputs);

/** A read the harness may run without asking: it changes nothing. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Hub-owned tool definitions; every harness discovers this same registry. */

export type { HandoffDeps } from "./delegation-actions";

/**
 * The name the SDK injects this server under, and so the prefix of every tool
 * it exposes: `mcp__cawco__handoff`, `…__start_session`, `…__delegate`.
 */
export const MCP_SERVER_NAME = "cawco";

/** The tools themselves, separated from the server so they can be exercised directly. */
export function handoffTools(deps: HandoffDeps) {
  const actions = handoffActions(deps);
  const all = [
    tool(
      "generate_image",
      IMAGE_GENERATION_DESCRIPTION,
      {
        prompt: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Use, subject, framing, style, lighting and exclusions; exact text quoted with its placement. An edit: 'Change only X; preserve Y'."
          ),
        output_path: z
          .string()
          .min(1)
          .describe(
            "A new .png path, relative to your directory; in a workspace, in its clone or `$TMPDIR/`."
          ),
        reference_images: z
          .array(z.string().min(1))
          .max(5)
          .optional()
          .describe(
            "Local image paths, each given its role in the prompt ('Image 1: person to preserve')."
          ),
        size: z
          .string()
          .optional()
          .describe(
            "auto or WIDTHxHEIGHT, multiples of 16, edge at most 3840."
          ),
        quality: z
          .enum(IMAGE_QUALITIES)
          .optional()
          .describe("low for drafts; high for dense text or fine detail."),
      },
      (request) => actions.generateImage(request),
      imageWords,
      {
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      }
    ),
    tool(
      "forge_post",
      "Open an issue, a pull/merge request or a comment on a repository's forge, with your machine's own sign-in. Default: this project's repository. Push the head branch first.",
      {
        kind: z
          .enum(FORGE_POST_KINDS)
          .describe(
            "issue: title, body. pull_request: title, body, head, base. comment: body, number, on."
          ),
        repo: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Git URL or host/path; omitted, this project's."),
        title: z.string().trim().min(1).optional(),
        body: z.string().optional(),
        head: z.string().trim().min(1).optional(),
        base: z.string().trim().min(1).optional(),
        number: z.number().int().positive().optional(),
        on: z
          .enum(FORGE_POST_ON)
          .optional()
          .describe("What number names; default issue."),
      },
      ({ kind, repo, title, body, head, base, number, on }) => {
        const write = forgeWriteOf({
          kind,
          body: body ?? "",
          ...(title ? { title } : {}),
          ...(head ? { head } : {}),
          ...(base ? { base } : {}),
          ...(number ? { number } : {}),
          ...(on ? { on } : {}),
        });
        return actions.forgePost({
          write,
          ...(repo ? { repo } : {}),
        });
      },
      sentence,
      {
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      }
    ),
    tool(
      "list_delegate_types",
      "The live delegate types: what each is for and what it runs. Read it before choosing a type; a project's own types replace the fleet's of the same name.",
      {},
      () => actions.listDelegateTypes(),
      delegateTypesWords
    ),
    tool(
      "list_sessions",
      "The other sessions on the fleet, each with its directory and machine, then the machines online now. Use it to find a session that already owns the work; it says where each works, not what it does.",
      {},
      () => Promise.resolve(actions.listSessions()),
      sentence
    ),
    // A leaf has no delegate of its own to hand inputs to: only a session
    // that may delegate is listed `inputs`.
    deps.canDelegate === false
      ? tool(
          "handoff",
          HANDOFF_DESCRIPTION,
          handoffShape(),
          handed(actions),
          sentence
        )
      : tool(
          "handoff",
          HANDOFF_DESCRIPTION,
          { ...handoffShape(), inputs: inputsParameter() },
          handed(actions),
          sentence
        ),
    tool(
      "start_session",
      "Start a NEW session of its own and give it work: its own sidebar row under this session and its own transcript, outliving this turn. " +
        "Unlike a delegate it reports nothing back. Use it when the user asks to spin something off, or for work in another directory or machine where no session runs yet; " +
        "prefer handoff to a session already running there. It runs on a delegate type ('medium' by default).",
      {
        cwd: z
          .string()
          .describe(
            "An absolute path on its machine: the repository or folder the user named, else this session's."
          ),
        machine: z
          .string()
          .optional()
          .describe(
            "A hostname (list_sessions names those online) or machineId; default this session's."
          ),
        prompt: z
          .string()
          .describe("A full brief: it cannot see this conversation."),
        title: sessionTitle(),
        spinOff: z
          .boolean()
          .optional()
          .describe("Throwaway: its transcript goes when it is discarded."),
        type: z
          .string()
          .optional()
          .describe("From list_delegate_types; default 'medium'."),
        model: z.string().optional().describe("Overrides the type's model."),
        account: accountParameter(),
        // Never `fullSend`: only the owner puts a session in Full Send. A
        // session that is in it passes it on by leaving this out.
        permissionMode: z
          .enum(SESSION_CHOSEN_MODES)
          .optional()
          .describe(
            "Default this session's; a pi session must name one for a harness that has modes. Omit for pi."
          ),
      },
      ({
        cwd,
        prompt,
        title,
        spinOff,
        type,
        model,
        account,
        permissionMode,
        machine,
      }) =>
        actions.startSession(cwd, prompt, title, {
          spinOff,
          type,
          model,
          account,
          permissionMode,
          machine,
        }),
      startedWords
    ),
    tool(
      "delegate",
      "Run bounded work as a delegate: a new session with fresh context (with `fork`, a copy of this one) in a workspace of its own, a clone on its own branch. It reports back once its work passes the hub's merge checks, quoting the output of the commands that prove it.\n\n" +
        "Delegate SUBSTANTIAL work that must report back: multi-file implementation, a sweep of dozens of reads, builds or deploys with verification loops, browser audits, evidence across many files or logs. " +
        "Do menial work yourself: git status/log/diff, grep, reading a few files, port checks, a log tail, a restart, the reads a brief needs. " +
        "Never delegate a single command whose exact output you need, edits to files you are changing, or what the user wants to watch.\n\n" +
        "Unless forked it cannot see this conversation: `prompt` stands alone with intent, constraints, acceptance criteria, the commands whose output proves the work, and what not to do. Ask for evidence and conclusions, not file dumps.\n\n" +
        "Prefer `type` (list_delegate_types) over harness and model. Prefer this over start_session when the work must report back, and over handoff for new standalone work (set cwd for another repository).\n\n" +
        "Its commands run in a boundary: they write only its clone, its scratch dir and the workspaces' cache; no credential store, SSH key, key agent or service manager; another machine only through a delegate there. " +
        "When the machine itself is the subject (an audit, containment, ops on its services, containers or network), set `host`: the delegate runs on that machine with no clone and no boundary, as a session started there does, lands nothing, and still reports back. " +
        "To follow up, handoff to the delegate or delegate with its `workspace`; to finish an ended delegate's commits in a fresh session, delegate with `from`. Prefer a fresh delegate unless the old session is warm and holds context the task needs.",
      {
        prompt: z
          .string()
          .describe("The full brief; unless forked, all the delegate sees."),
        title: sessionTitle(),
        type: z
          .string()
          .optional()
          .describe(
            "From list_delegate_types: sets harness, model, effort and skills. Default: Jev's pick, else 'medium'."
          ),
        harness: z
          .enum(HARNESSES)
          .optional()
          .describe(
            "Overrides the type's. opencode with model opencode-go/deepseek-v4-pro runs DeepSeek."
          ),
        model: z.string().optional().describe("Overrides the type's model."),
        account: accountParameter(),
        cwd: z
          .string()
          .optional()
          .describe(
            "The repository a new workspace is cut from, an absolute path on `machine`. Default: this session's. With host: the folder it runs in; default the agent user's home."
          ),
        machine: z
          .string()
          .optional()
          .describe(
            "A hostname (list_sessions names those online) or machineId; default this session's."
          ),
        skills: z
          .array(z.string())
          .optional()
          .describe("Loaded before the prompt; overrides the type's."),
        workspace: z
          .string()
          .optional()
          .describe(
            "An earlier delegate's workspace: the brief goes to its last session as a follow-up. Not with type, model, harness, skills, fork or machine."
          ),
        from: z
          .string()
          .optional()
          .describe(
            "An ended delegate's workspace: the new one is cut at its branch head, its commits included."
          ),
        fork: z
          .boolean()
          .optional()
          .describe(
            "Start as a copy of this conversation, on this session's harness and model."
          ),
        can_delegate: z
          .boolean()
          .optional()
          .describe(
            "Let it start delegates of its own; default its type's, else false. Only for an orchestrator that fans out."
          ),
        inputs: inputsParameter(),
        lands: z
          .enum(LANDS_MODES)
          .optional()
          .describe(
            "main (default): rebased onto the default branch after its merge checks pass. branch: pushed to cawco/<item>. pr: that, with a pull request. none: nothing pushed; name its deliverables in outputs. Work on a machine rather than a repository: host instead."
          ),
        host: z
          .boolean()
          .optional()
          .describe(
            "Run on `machine` itself in `cwd`, outside any clone or boundary: its network, processes and the agent user's groups (docker). For work whose subject is the machine. Lands nothing; not with from, workspace, owns, inputs or outputs."
          ),
        outputs: z
          .array(z.string())
          .optional()
          .describe(
            "Deliverables that are not commits, from the repository's root; copied into the project's folder under assets/<item>/, as is whatever the delegate leaves in its $TMPDIR/outputs/ without being named here."
          ),
        group: groupParameter().optional(),
        owns: ownsParameter().optional(),
        budget: budgetParameter().optional(),
      },
      ({
        prompt,
        title,
        type,
        harness,
        model,
        account,
        cwd,
        skills,
        workspace,
        from,
        fork,
        can_delegate,
        inputs,
        machine,
        lands,
        host,
        outputs,
        group,
        owns,
        budget,
      }) =>
        actions.delegate(prompt, {
          title,
          cwd,
          harness,
          model,
          account,
          skills,
          workspace,
          from,
          fork,
          type,
          canDelegate: can_delegate,
          inputs,
          machine,
          lands,
          host,
          outputs,
          group,
          owns,
          budget,
        }),
      delegateWords
    ),
    tool(
      "delegate_list",
      "Your delegates, newest first, theirs nested: each one's state, cache warmth and report; then those queued for owned files and the workspaces held with unlanded work. Read it before handing off, calling one stuck, or recapping a span.",
      {
        include: z
          .enum(["live", "all"])
          .optional()
          .describe(
            "live (default): not ended over an hour ago. all: every one, the default with since or before."
          ),
        since: isoTime().describe(
          "ISO time: only items ended after it, or live."
        ),
        before: isoTime().describe("ISO time: only items started before it."),
      },
      ({ include, since, before }) => {
        const windowed = since !== undefined || before !== undefined;
        return actions.delegateList({
          include: include ?? (windowed ? "all" : "live"),
          ...(since === undefined ? {} : { since: new Date(since) }),
          ...(before === undefined ? {} : { before: new Date(before) }),
        });
      },
      delegateListWords,
      { annotations: READ_ONLY }
    ),
    tool(
      "wait_item",
      "Declare a bounded wait on a command you started, then end your turn: the hub shows your parent what you wait for and wakes you when it ends. Any tool call but a CawCo read ends it.",
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
      ({ minutes, reason }) => actions.waitItem(minutes, reason),
      sentence,
      { inputError: WAIT_ITEM_LIMIT }
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
            "One or two plain sentences: what changed and whether it passed. No ids or file names."
          ),
        summary: z
          .string()
          .describe(
            "All your parent reads: the deliverable or its file's path, then the proof."
          ),
        findings: z
          .array(z.object({ title: z.string(), detail: z.string() }))
          .optional()
          .describe("Noticed outside the brief."),
        blocked: z
          .object({ command: z.string(), error: z.string() })
          .optional()
          .describe("The exact command and error."),
        ship: z
          .object({ notes: z.string().trim().min(1) })
          .optional()
          .describe(
            "Release it once it lands on main, with end-user notes: the project's gate.md Ship: command runs it. Your call."
          ),
      },
      (request) => actions.finishItem(request),
      sentence
    ),
    tool(
      "continue_session",
      "Continue another session (a stuck delegate) in a fresh conversation, summarised by a model you pick; it stays one session. Never this session.",
      {
        session: z
          .string()
          .min(1)
          .describe("Its id, short id, or directory name."),
        from: z
          .enum(["summary", "asks"])
          .optional()
          .describe(
            '"asks": the messages it was asked alone (a delegate\'s brief and hand-offs), nothing summarised.'
          ),
        summarizer_harness: z
          .enum(HARNESSES)
          .optional()
          .describe("The harness that writes the summary."),
        summarizer_model: z
          .string()
          .min(1)
          .optional()
          .describe("Like opencode-go/deepseek-v4.1-flash."),
        target_harness: z
          .enum(HARNESSES)
          .describe("The harness the new session runs on."),
        target_model: z
          .string()
          .min(1)
          .describe("The model the new session runs on."),
        // Never `fullSend`: only the owner puts a session in Full Send.
        target_permission_mode: z
          .enum(SESSION_CHOSEN_MODES)
          .optional()
          .describe(
            "Default this session's; a pi session must name one for a harness that has modes."
          ),
        note: z
          .string()
          .optional()
          .describe("What the summary focuses on, and its next step."),
      },
      (input) => actions.continueSession(input),
      startedWords
    ),
    tool(
      "stop_delegate",
      "Stop one of YOUR delegates: its item is cancelled; a later handoff reopens it. A queued delegate's id withdraws it from the queue.",
      {
        target: z
          .string()
          .describe("Its handle, directory or id; or a queued delegate's id."),
      },
      ({ target }) => actions.stopDelegate(target),
      sentence
    ),
    tool(
      "discard_workspace",
      "Let go of a held workspace of YOUR delegates' whose work you will not continue: what it holds is saved to a carry in ~/.cawco/carries on its machine, then its clone goes.",
      {
        workspace: z.string().describe("Its id, as the hub's notice names it."),
      },
      ({ workspace }) => actions.discardWorkspace(workspace),
      sentence
    ),
    tool(
      "interrupt_delegate",
      "Interrupt one of YOUR delegates mid-turn without ending it. It keeps its state and stays idle: " +
        "nothing automatic wakes it, only your handoff or the person's message.",
      {
        target: z.string().describe("Its handle, directory or id."),
      },
      ({ target }) => Promise.resolve(actions.interruptDelegate(target)),
      sentence
    ),
    tool(
      "machine_pause",
      "Pause a machine for some minutes: its turns stop and nothing starts there until then; work for it waits. resume: true ends it.",
      {
        machine: z.string(),
        minutes: z.number().int().min(1).max(1440).optional(),
        resume: z.boolean().optional(),
      },
      ({ machine, minutes, resume }) =>
        actions.machinePause(machine, minutes, resume),
      sentence
    ),
    tool(
      "answer_delegate",
      'Answer an ask your delegate routed to you: answers keyed by the EXACT question text, each the chosen option label, copied from its "[delegate-ask ...]" message; deny refuses it; neither allows it as asked.',
      {
        target: z.string().describe("Its handle, directory or id."),
        requestId: z.string(),
        answers: z.record(z.string(), z.string()).optional(),
        deny: z.boolean().optional(),
      },
      ({ target, requestId, answers, deny }) =>
        Promise.resolve(
          actions.answerDelegate(target, requestId, answers, deny)
        ),
      sentence
    ),
    tool(
      "send_to_user",
      "Show the user a message in this session's transcript, pushed to their phone: what they must see as written before the task finishes.",
      {
        message: z
          .string()
          .describe("The text to show the user, exactly as it should read."),
        attachments: z
          .array(z.string())
          .optional()
          .describe(
            "Absolute paths of images or videos (50 MB each), shown under it."
          ),
      },
      ({ message, attachments }) => actions.sendToUser(message, attachments),
      sentence
    ),
    tool(
      "open_items",
      "Your open items, word for word, as every compaction lists them.",
      {},
      () => actions.openItems(),
      sentence,
      { annotations: { readOnlyHint: true } }
    ),
    tool(
      "set_title",
      "Name this session once its task is clear, and again only when the task changes.",
      {
        title: z
          .string()
          .trim()
          .min(1)
          .max(SESSION_TITLE_MAX)
          .describe(
            "3–6 plain words, verb first, like 'Fix tray chip overflow'."
          ),
      },
      ({ title }) => actions.setTitle(title),
      sentence,
      {
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      }
    ),
    tool(
      "show_image",
      "Show an image file to the user in this session's transcript, by path, without reading its pixels: whenever they should SEE a screenshot, render or diagram.",
      {
        path: z.string().describe("Absolute."),
        caption: z
          .string()
          .optional()
          .describe("One line under the image saying what it shows."),
      },
      ({ path }) => Promise.resolve(actions.showImage(path)),
      sentence
    ),
    tool(
      artifactList.name,
      artifactList.description,
      artifactList.input,
      ({ waiting }) =>
        actions.artifactCall(
          "GET",
          `/status${waiting ? "?waiting=true" : ""}`
        ) as Promise<ArtifactStatus[]>,
      artifactListWords,
      { annotations: READ_ONLY }
    ),
    // A delegate may hand it to its parent instead (`to`), unopened.
    deps.hasParent
      ? tool(
          artifactCreate.name,
          artifactCreate.description + artifactCreateToParent.description,
          { ...artifactCreate.input, ...artifactCreateToParent.input },
          (input) =>
            actions.artifactCall("POST", "", input) as Promise<Created>,
          artifactCreatedWords,
          { detailed: artifactCreatedDetailed }
        )
      : tool(
          artifactCreate.name,
          artifactCreate.description,
          artifactCreate.input,
          (input) =>
            actions.artifactCall("POST", "", input) as Promise<Created>,
          artifactCreatedWords,
          { detailed: artifactCreatedDetailed }
        ),
    tool(
      artifactUpdate.name,
      artifactUpdate.description,
      artifactUpdate.input,
      async ({ id, statements, ask, ...change }): Promise<Updated> => {
        const at = `/${encodeURIComponent(id)}`;
        const changes = Object.values(change).some(
          (value) => value !== undefined
        );
        if (statements !== undefined && changes) {
          throw new Error(
            "statements revises a decision page alone: pass it without html, patch, elements, delete, mermaid, args or story."
          );
        }
        // A new ask is checked and written first, so a refused one changes nothing.
        const asked =
          ask === undefined
            ? undefined
            : ((await actions.artifactCall("POST", `${at}/ask`, {
                ask,
              })) as AskChanged);
        if (statements !== undefined) {
          return {
            change: "statements",
            answer: (await actions.artifactCall("POST", `${at}/statements`, {
              statements,
            })) as Revised,
          };
        }
        if (!changes && asked !== undefined) {
          return { change: "ask", answer: asked };
        }
        // A component canvas's states file and its own spec have their own route.
        const component = (
          ["args", "story", "edges", "group", "dials"] as const
        ).some((key) => change[key] !== undefined);
        return component
          ? {
              change: "component",
              answer: (await actions.artifactCall(
                "PATCH",
                `${at}/component`,
                change
              )) as ComponentChanged,
            }
          : {
              change: "page",
              answer: (await actions.artifactCall(
                "PATCH",
                at,
                change
              )) as ArtifactRead,
            };
      },
      artifactUpdatedWords,
      { detailed: artifactUpdatedDetailed }
    ),
    tool(
      settle.name,
      settle.description,
      settle.input,
      ({ card, ...picked }) => {
        const hash = card.lastIndexOf("#");
        if (hash <= 0 || hash === card.length - 1) {
          throw new Error(`“${card}” names no card: write <page>#<card>.`);
        }
        return actions.artifactCall(
          "POST",
          `/${encodeURIComponent(card.slice(0, hash))}/settle`,
          { card: card.slice(hash + 1), ...picked }
        ) as Promise<Settled>;
      },
      settledWords
    ),
    tool(
      artifactRead.name,
      artifactRead.description,
      artifactRead.input,
      async ({ id, state, ...asked }) => {
        // Each read field given into the query, a frame's `state` as JSON; a flag left off stays out.
        const query = new URLSearchParams(
          Object.entries({
            ...asked,
            ...(state ? { state: JSON.stringify(state) } : {}),
          }).flatMap(([key, value]): [string, string][] =>
            value === undefined || value === false ? [] : [[key, String(value)]]
          )
        ).toString();
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
        return (await actions.artifactCall(
          "GET",
          `/${encodeURIComponent(target)}${query ? `?${query}` : ""}`
        )) as ArtifactRead;
      },
      artifactReadWords,
      { annotations: READ_ONLY, detailed: artifactReadDetailed }
    ),
    tool(
      designMap.name,
      designMap.description,
      designMap.input,
      (ask, format) => {
        const query = new URLSearchParams([
          ...Object.entries(ask)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]): [string, string] => [key, String(value)]),
          ["response_format", format],
        ]).toString();
        return actions.artifactCall(
          "GET",
          `/design-map${query ? `?${query}` : ""}`
        ) as Promise<DesignMap>;
      },
      designMapWords,
      { annotations: READ_ONLY }
    ),
    tool(
      artifactShow.name,
      artifactShow.description,
      artifactShow.input,
      ({ id }) =>
        actions.artifactCall(
          "POST",
          `/${encodeURIComponent(id)}/show?by=agent`
        ) as Promise<Shown>,
      artifactShownWords
    ),
    tool(
      artifactBrowse.name,
      artifactBrowse.description,
      artifactBrowse.input,
      ({ id }) =>
        actions.artifactCall(
          "POST",
          `/${encodeURIComponent(id)}/browse`
        ) as Promise<Browsed & { link: string }>,
      artifactBrowsedWords,
      {
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      }
    ),
    tool(
      artifactPromote.name,
      artifactPromote.description,
      artifactPromote.input,
      ({ id }) =>
        actions.artifactCall(
          "POST",
          `/${encodeURIComponent(id)}/promote`
        ) as Promise<Promoted>,
      artifactPromotedWords,
      {
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      }
    ),
    tool(
      artifactDelete.name,
      artifactDelete.description,
      artifactDelete.input,
      ({ id }) =>
        actions.artifactCall(
          "DELETE",
          `/${encodeURIComponent(id)}?by=agent`
        ) as Promise<Removed>,
      artifactRemovedWords
    ),
    tool(
      commentRead.name,
      commentRead.description,
      commentRead.input,
      ({ artifact, filter, since }) => {
        // The session reads them itself: what it reads counts as heard.
        const query = new URLSearchParams({
          filter,
          reader: "session",
          ...(artifact ? { artifact } : {}),
          ...(since ? { since } : {}),
        }).toString();
        return actions.artifactCall(
          "GET",
          `/comments?${query}`
        ) as Promise<CommentRead>;
      },
      commentReadWords,
      { annotations: READ_ONLY }
    ),
    tool(
      commentReply.name,
      commentReply.description,
      commentReply.input,
      ({ pin, ...reply }) =>
        actions.artifactCall(
          "POST",
          `/comments/${encodeURIComponent(pin)}/reply`,
          reply
        ) as Promise<CommentReplied>,
      commentRepliedWords
    ),
    tool(
      commentResolve.name,
      commentResolve.description,
      commentResolve.input,
      ({ pin, ...resolve }) =>
        actions.artifactCall(
          "POST",
          `/comments/${encodeURIComponent(pin)}/resolve`,
          resolve
        ) as Promise<CommentResolved>,
      commentResolvedWords
    ),
  ];
  return all.filter(
    (entry) =>
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
const ALWAYS_LOAD: ReadonlySet<string> = new Set([
  "delegate",
  "handoff",
  "finish_item",
  "set_title",
  "artifact_create",
]);

/**
 * `find` (find-tool.ts) loads upfront too for the sessions that search most,
 * an orchestrator and a project's Caw (roles.ts `memoryRoleOf`): the owner
 * saw the orchestrator grep transcripts and query the hub's database for
 * what a session said, with the dashboard's own search a tool away
 * (2026-10-19). Every other session finds it by the deferred groups' first
 * line ({@link DEFERRED_GROUPS}).
 */
export const loadsUpfront = (
  name: string,
  searcher: boolean,
  filesTasks = false
): boolean =>
  ALWAYS_LOAD.has(name) ||
  (searcher && name === "find") ||
  (filesTasks && CORE_TASK_TOOLS.has(name));

/**
 * The core task tools load upfront together for a session that files tasks
 * (its role has task_link, roles.ts): filing, reading and linking are one
 * act, and linking sat a separate ToolSearch away while agents wrote 32 of
 * 91 open tasks' waits as prose and none as links (2026-10-26).
 */
const CORE_TASK_TOOLS: ReadonlySet<string> = new Set([
  "task_create",
  "task_read",
  "task_link",
] satisfies readonly TaskTool[]);

/**
 * The deferred groups by prefix, as the server's instructions name them:
 * "Use consistent namespacing … so one search matches the whole group" and
 * "Add a system prompt section describing available tool categories"
 * (tool-search-tool docs).
 */
const DEFERRED_GROUPS: readonly { prefixes: string[]; what: string }[] = [
  {
    prefixes: ["find"],
    what: "anything said or made, as the dashboard's Find finds it; search it before reading transcripts, files or the database",
  },
  { prefixes: ["admin_"], what: "fleet configuration" },
  { prefixes: ["task_"], what: "project tasks" },
  {
    prefixes: ["todo_write", "open_items"],
    what: "your plan, your task's to-dos, your open items",
  },
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
  {
    prefixes: ["artifact_", "comment_", "design_map", "settle"],
    what: "what you open in the person's panel for them to pick, judge, try or draw on (show skill first), their pins on it; design_map the component library; settle a card Who decides gives you",
  },
  { prefixes: ["memory_"], what: "project memory" },
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
  /** The names Claude loads upfront for this session ({@link loadsUpfront}). */
  upfront: ReadonlySet<string>;
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
  const upfront = names.filter((name) => listable.upfront.has(name));
  const deferred = names.filter((name) => !listable.upfront.has(name));
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

/** How CawCo's tools answer (mcp-tool.ts), said once for every tool's `response_format`. */
const ANSWERS =
  "CawCo's tools answer in words, each thing by the name or handle they take back. response_format: \"detailed\" answers the hub's whole record as JSON instead, every id and time: ask for it only when the words leave out what you need.";

/** The server's instructions for one session, from what it can be listed. */
export function handoffInstructions(
  deps: HandoffDeps,
  listable: Listable,
  kinds: readonly Kind[]
): string {
  const { names } = listable;
  // How a session names another in its words (core references.ts): the
  // dashboard draws the link as that session's chip.
  // Who decides' kinds are the fleet's rows: the live list, read as the
  // session starts, so a kind added reaches the next session.
  const naming = `Name this session with set_title in 3 to 6 plain words once its task is clear; call it again only when the task changes.\n\n${DECIDES_RULE} ${kindsLine(kinds)}\n\n${REFERENCE_GUIDANCE}\n\n${ANSWERS}`;
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
    "This session orchestrates: it plans, briefs, reads reports and decides. Run reads yourself: git status, log or diff, a grep, a file, a log tail, a port check, a curl for a status. Hand substantial execution to a delegate: implementation, builds, browser checks, probes, and any diagnosis that takes more than a few steps. The brief keeps intent, decisions and acceptance here, names the commands whose output proves the work, and asks for evidence and conclusions, not file dumps. CawCo's delegate is not the harness's own subagents, which do not resolve CawCo's types.",
    `${naming}${loading}${images}`,
    "Call list_delegate_types for the live catalog of delegate types (model, effort and harness each routes to) rather than guessing a model. Claude names these tools mcp__cawco__list_delegate_types and mcp__cawco__delegate; OpenCode names them cawco_list_delegate_types and cawco_delegate. These are tools, not MCP resources. list_sessions lists running sessions, not configured types.",
    "Prefer the configured type and omit model/harness overrides unless the user requested them. Give each delegate a concrete deliverable and bounded file ownership. Keep independent parent work moving; reports arrive automatically. Each delegate runs one work item in a workspace; use mcp__cawco__handoff to guide it while that item runs, and handoff again to follow up after it reports — that continues its own session on its cached transcript. Use start_session only for a separate persistent session.",
    "If delegation fails or no suitable type is available, report the blocker; do not silently move bulk exploration onto this session.",
  ].join("\n\n");
}
