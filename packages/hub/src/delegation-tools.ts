import { DECIDES_RULE, type Kind } from "@cawco/core/decides";
import {
  type MayStart,
  spawningToolAllowed,
  startsAny,
} from "@cawco/core/delegate-types";
import type { ForgeWrite } from "@cawco/core/forge-post";
import {
  descriptorOf,
  HARNESSES,
  type HarnessKind,
} from "@cawco/core/harness/kinds";
import { SESSION_CHOSEN_MODES } from "@cawco/core/harness/modes";
import {
  DEFAULT_IMAGE_PROVIDER,
  IMAGE_GENERATION_DESCRIPTION,
  IMAGE_PROVIDER_MODELS,
  IMAGE_PROVIDERS,
  IMAGE_QUALITIES,
  MAX_REFERENCE_IMAGES,
} from "@cawco/core/image-generation";
import { LANDS_MODES } from "@cawco/core/injected";
import { NO_REPLY_OWED, NO_REPLY_TOOL } from "@cawco/core/no-reply";
import { REFERENCE_GUIDANCE } from "@cawco/core/references";
import { kindsLine } from "@cawco/core/words/decides-lines";
import { memoryRunWords } from "@cawco/core/words/memory-run";
import { ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import {
  artifactBrowse,
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
  designMap,
  questionClose,
  settle,
} from "./artifacts/tools";
import type {
  HandoffActions,
  HandoffDeps,
  ItemEnd,
} from "./delegation-actions";
import { decodeCursor } from "./find";
import { handedInputsListed } from "./handed-input";
import { type Presenter, sentence, toolOn } from "./mcp-tool";
import {
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
  commentReadWords,
  commentRepliedWords,
  commentResolvedWords,
  designMapWords,
  questionClosedWords,
  settledWords,
  type Updated,
} from "./presenters/artifacts";
import {
  delegateListWords,
  delegateTypesWords,
  delegateWords,
  imageWords,
  sessionListWords,
  startedWords,
} from "./presenters/sessions";
import type { AnyProblem } from "./refusal";
import {
  SESSION_LIST_LIMIT,
  SESSION_LIST_MAX,
  SESSION_ROLES,
  SESSION_SORTS,
} from "./session-list";
import {
  budgetParameter,
  groupParameter,
  ownsParameter,
  type TaskTool,
} from "./task-tools";
import { WAIT_ITEM_LIMIT, WAIT_ITEM_MAX_MINUTES } from "./work-item-state";
import { SESSION_TITLE_DESCRIPTION, SESSION_TITLE_MAX } from "./work-items";

/**
 * A tool whose answer the hub wrote already in the form asked for
 * (`open_items`, concise or detailed): it is given as written, and the
 * tool takes `response_format` (mcp-tool.ts lists it for any presenter but
 * {@link sentence}).
 */
const verbatim: Presenter<string, unknown> = (text) => text;

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
/** A day, as `find` and `list_sessions` take `since`. */
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** `list_sessions`'s `since`: its day's first ms in UTC, or the refusal with one call that works. */
const dayStart = (day: string): number => {
  const at = DAY.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  if (Number.isNaN(at)) {
    throw new Error(
      `since is "${day}": give a day as YYYY-MM-DD. Example: {"stopped": "limit", "since": "2026-11-05"}`
    );
  }
  return at;
};

/**
 * `list_sessions`, for the question an orchestrator asks of the fleet:
 * which sessions stopped (at a usage limit above all), whose, and in what
 * order they were touched. Told apart from `delegate_list` (the caller's
 * own delegates' work) and `find` (words said).
 */
const LIST_SESSIONS_DESCRIPTION =
  "Sessions on every machine, each with its state, stop reason, account, resume time and last activity, then the machines online. " +
  "Use it to find the session that owns some work or the ones stopped at a usage limit; your own delegates' work is delegate_list's, and what was said is find's.";

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
 * What `finish_item` says, the one place a report's content is told: the
 * report is all the parent reads; the commits are the evidence, so it holds
 * the work's loose ends and nothing else (the owner's rule, 2026-11-15); and
 * what the hub does with the work, the session's own work item's landing
 * (`lands`), so a delegate is never told the hub pushes to the base branch
 * when it does not; a host-scope item hands in its report and its
 * `$TMPDIR/outputs/`.
 */
const finishItemDescription = (lands: ItemEnd = "main"): string => {
  const report = "Your work item's report, which ends the item";
  const committed =
    " Use it once your work is committed and the checks your project's instructions name pass, or with `blocked` when something outside your control stops the work.";
  const done =
    " Use it once the work is done, or with `blocked` when something outside your control stops it.";
  switch (lands) {
    case "host":
      return `${report}; nothing is landed, as you ran on the machine itself.${done}`;
    case "branch":
      return `${report}; the hub then pushes your branch to origin, not to the base branch.${committed}`;
    case "pr":
      return `${report}; the hub then pushes your branch and opens a pull request against the base branch, or updates the open one.${committed}`;
    case "none":
      return `${report}; nothing is pushed.${done}`;
    case "main":
      return `${report}; the hub then rebases your commits onto the base branch and pushes them.${committed}`;
  }
};

/**
 * `finish_item`'s `summary`, the one place a report's content is told: the
 * report is all the parent reads; the commits are the evidence, so it holds
 * the work's loose ends and nothing else (the owner's rule, 2026-11-15); an
 * item that lands no commits carries its deliverable whole.
 */
const summaryDescription = (lands: ItemEnd = "main"): string => {
  // Prompting Claude Fable 5.2, "Make reports easy to follow": the parent
  // reads the report having seen none of the work behind it.
  const alone =
    "All your parent reads; chat messages reach no one. Write it for a reader who saw none of your tool calls or files: key points first, in plain full sentences, no term you coined during the work.";
  const ends =
    "the work's loose ends: each caveat, what is left undone, each defect found, what your boundary could not run. With none, one line saying so";
  switch (lands) {
    case "host":
      return `${alone} It carries the findings and changes whole, then ${ends}.`;
    case "none":
      return `${alone} It carries the deliverable whole, or names the file in $TMPDIR/outputs/ holding a long one, then ${ends}.`;
    case "branch":
    case "pr":
    case "main":
      return `${alone} Your commits are the evidence, so it holds ${ends}.`;
  }
};

/**
 * `handoff`'s description: a session that may start delegates is told how
 * one is guided and reopened; a leaf that starts none, which has no
 * delegate of its own, is told what it does have, its parent and the
 * sessions that own work. How the message reaches its target is said by
 * the answer, and a cold target's refusal says how to deliver it anyway
 * (delegation-actions.ts).
 */
const handoffDescription = (startsNone: boolean): string =>
  startsNone
    ? "Messages to another session: your parent, or a session that already owns the work. Use it to ask your parent while you work, or to tell the owner of some work what you found in it."
    : "Messages to another session: your delegate, while it works or after it reported, or a session that already owns the work. Use it to guide or reopen a delegate, or to brief a running session on its own work; new standalone work goes to delegate.";

/** `handoff`'s target and message, every session's; a delegate's reopening is said to a session that has delegates. */
const handoffShape = (startsNone: boolean) => ({
  target: z
    .string()
    .describe(
      startsNone
        ? "A handle (cockpit#5a167bde), a mention, an id, a directory or a title."
        : "A handle (cockpit#5a167bde), a mention, an id, a directory or a title. A delegate that reported reopens its item in the same session; a fresh delegate costs less unless delegate_list shows that session warm."
    ),
  message: z
    .string()
    .describe(
      "For an engineer who cannot see your conversation: what you found, where, and the ask."
    ),
});

/**
 * `inputs` of delegate and handoff (hub handed-input.ts): a path to a file
 * or a folder on the caller's machine, or what the hub holds by name,
 * landing in the receiver's inputs folder (its `$TMPDIR/inputs/`, or a
 * session with no work item's own, work-items.ts `handOff`), a folder
 * and an item's assets as their trees. Listed open and small
 * ({@link handedInputsListed}); the hub checks each entry strictly
 * (work-items.ts `readInputs`).
 */
const inputsParameter = () =>
  handedInputsListed
    .optional()
    .describe(
      "Files for its inputs folder: absolute paths to files or folders on your machine; what the hub holds, as {report|assets|artifact|pins|find|attachment: id or handle}; or {text, name} or {blob: base64, name}."
    );

/** `handoff`'s call: the message, with files for the receiver's inputs folder. */
const handed =
  (actions: HandoffActions) =>
  ({
    target,
    message,
    inputs,
  }: {
    inputs?: unknown[];
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

/** The tools themselves, separated from the server so they can be exercised directly. */
/**
 * What listing a session's tools reads of it: their words and which tools
 * it gets turn on these alone (delegation-mcp.ts lists them with nothing
 * else of the session).
 */
export interface ToolView {
  /**
   * The harness the tools are listed for and called from: what a tool's
   * words say can differ by it (its descriptor's `words.noReply`).
   */
  readonly harness: HarnessKind;
  /** Where this session's work item lands, which finish_item's description follows; `main` when unknown. */
  readonly lands?: ItemEnd;
  /** The delegate types THIS session may start (core `MayStart`): its row's list. */
  readonly mayStart: MayStart;
  /** Delegate role: the session runs a work item, so finish_item and wait_item are offered. */
  readonly workItem?: boolean;
}

/** What a session's tool acts through as it is called: its actions, and whether the person is owed an answer. */
interface HandoffOn {
  readonly actions: HandoffActions;
  readonly personOwed: HandoffDeps["personOwed"];
}

/** What `list_delegate_types` acts through: the catalog alone, which a call with no session reads too. */
interface CatalogOn {
  readonly actions: Pick<HandoffActions, "listDelegateTypes">;
}

const handoffTool = toolOn<HandoffOn>();
const catalogTool = toolOn<CatalogOn>();

/** `list_delegate_types`: the same for every session, and read by a call that names none. */

/** `artifact_update`'s fields a design graph's own route takes: a states file's, its spec's, a design folder's. */
const COMPONENT_FIELDS = [
  "args",
  "story",
  "edges",
  "group",
  "dials",
  "directions",
  "dir",
] as const;

/**
 * Whether an `artifact_update` goes by a design graph's own route: it
 * names a field of one ({@link COMPONENT_FIELDS}), or html for an artifact
 * that is a design folder (`isDesign`), whose page it is.
 */
const componentChange = (
  change: Partial<Record<(typeof COMPONENT_FIELDS)[number] | "html", unknown>>,
  isDesign: () => boolean
): boolean =>
  COMPONENT_FIELDS.some((key) => change[key] !== undefined) ||
  (change.html !== undefined && isDesign());

export const listDelegateTypesTool = catalogTool(
  "list_delegate_types",
  "Delegate types you can start, each with what it is for and what it runs. Use it once a session, before choosing a `type` for delegate or start_session.",
  {},
  (_asked, _format, bound) => bound.actions.listDelegateTypes(),
  delegateTypesWords
);

/** `artifact_update`'s `ask` then `title`, each through its own route; undefined when it names neither. */
const headWritten = async (
  actions: HandoffActions,
  id: string,
  ask: string | undefined,
  title: string | undefined
) => {
  if (ask === undefined && title === undefined) {
    return;
  }
  const asked =
    ask === undefined ? undefined : await actions.artifacts.askUpdate(id, ask);
  if (asked instanceof ElysiaStatus) {
    return asked;
  }
  const titled =
    title === undefined
      ? undefined
      : await actions.artifacts.titleUpdate(id, title);
  if (titled instanceof ElysiaStatus) {
    return titled;
  }
  return {
    id,
    ...(asked ? { ask: asked.ask } : {}),
    ...(titled ? { title: titled.title } : {}),
  };
};

export function handoffTools(view: ToolView) {
  const all = [
    handoffTool(
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
            "A new .png path, relative to your directory; in a workspace, in its clone or `$TMPDIR/`. A JPEG lands beside it as .jpg."
          ),
        reference_images: z
          .array(z.string().min(1))
          .max(MAX_REFERENCE_IMAGES)
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
        provider: z
          .enum(IMAGE_PROVIDERS)
          .optional()
          .describe(
            `Left out: the fleet's default (${DEFAULT_IMAGE_PROVIDER} unless changed). Another only when asked.`
          ),
        model: z
          .enum(IMAGE_PROVIDER_MODELS["gemini-api"])
          .optional()
          .describe(
            `gemini-api only; left out, ${IMAGE_PROVIDER_MODELS["gemini-api"][0]}.`
          ),
      },
      (request, _format, bound) => bound.actions.generateImage(request),
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
    handoffTool(
      "forge_post",
      "Issues, pull or merge requests and comments, opened on a repository's forge with your machine's own sign-in. Use it to post to the repository you work in, or one the person names.",
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
        head: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("The branch it opens from, pushed first."),
        base: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("The branch it merges into."),
        number: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("The issue or pull request the comment is on."),
        on: z
          .enum(FORGE_POST_ON)
          .optional()
          .describe("What number names; default issue."),
      },
      ({ kind, repo, title, body, head, base, number, on }, _format, bound) => {
        const write = forgeWriteOf({
          kind,
          body: body ?? "",
          ...(title ? { title } : {}),
          ...(head ? { head } : {}),
          ...(base ? { base } : {}),
          ...(number ? { number } : {}),
          ...(on ? { on } : {}),
        });
        return bound.actions.forgePost({
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
    listDelegateTypesTool,
    handoffTool(
      "list_sessions",
      LIST_SESSIONS_DESCRIPTION,
      {
        role: z
          .enum(SESSION_ROLES)
          .optional()
          .describe(
            "main: the person's own; delegate: another session started it. Default all."
          ),
        stopped: z
          .enum(["limit"])
          .optional()
          .describe(
            "limit: its latest turn ended at a usage limit and nothing carried it on, asleep too. Default: running ones."
          ),
        sort: z
          .enum(SESSION_SORTS)
          .optional()
          .describe(
            "Newest first by: active (default), interacted (the person's last message) or created."
          ),
        since: z
          .string()
          .optional()
          .describe("YYYY-MM-DD: active since; with stopped, stopped since."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(SESSION_LIST_MAX)
          .optional()
          .describe(`Default ${SESSION_LIST_LIMIT}, max ${SESSION_LIST_MAX}.`),
        cursor: z.string().optional().describe("next_cursor."),
      },
      async ({ role, stopped, sort, since, limit, cursor }, _format, bound) => {
        const offset = decodeCursor(cursor);
        if (offset instanceof ElysiaStatus) {
          return offset;
        }
        return await bound.actions.listSessions({
          role: role ?? "all",
          sort: sort ?? "active",
          limit: limit ?? SESSION_LIST_LIMIT,
          offset,
          ...(stopped ? { stopped } : {}),
          ...(since ? { since: dayStart(since) } : {}),
        });
      },
      sessionListWords,
      { annotations: READ_ONLY }
    ),
    handoffTool(
      "handoff",
      handoffDescription(view.mayStart.length === 0),
      {
        ...handoffShape(view.mayStart.length === 0),
        inputs: inputsParameter(),
      },
      (asked, _format, bound) => handed(bound.actions)(asked),
      sentence
    ),
    handoffTool(
      "start_session",
      "New sessions of their own, each with its own sidebar row and transcript, that outlive this turn and report nothing back. " +
        "Use it when the user asks to spin something off, or for work in a directory or machine where no session runs yet; a session already running there takes handoff.",
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
        harness: z
          .enum(HARNESSES)
          .optional()
          .describe(
            "Overrides the type's. Without a type, a harness other than the 'medium' type's needs a model."
          ),
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
      (
        {
          cwd,
          prompt,
          title,
          spinOff,
          type,
          harness,
          model,
          account,
          permissionMode,
          machine,
        },
        _format,
        bound
      ) =>
        bound.actions.startSession(cwd, prompt, title, {
          spinOff,
          type,
          harness,
          model,
          account,
          permissionMode,
          machine,
        }),
      startedWords
    ),
    handoffTool(
      "delegate",
      "Bounded work run by a new session in its own workspace with fresh context, which reports back once the hub has landed its commits. " +
        "Use it for substantial work worth a whole session (multi-file implementation, a sweep of dozens of reads, builds or deploys with verification loops, browser audits, independent pieces run at once); one command, a few reads, a restart or edits to files you are changing, you do yourself.",
      {
        prompt: z
          .string()
          .describe(
            "The full brief; unless forked, all the delegate sees. Write it for an engineer who cannot see this conversation: the goal and what done looks like, what you know and where, the person's constraints, the checks it must pass."
          ),
        title: sessionTitle(),
        type: z
          .string()
          .optional()
          .describe(
            "From list_delegate_types: sets harness, model, effort and skills. Default: CawCo's Jev model's pick, else 'medium'."
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
            "An ended delegate's workspace: the new one is cut at its branch head, its commits included. New or clean-slate work leaves it out."
          ),
        fork: z
          .boolean()
          .optional()
          .describe(
            "Start as a copy of this conversation, on this session's harness and model. Only the conversation is copied: its workspace is cut from the default branch, or where `from` says."
          ),
        clean: z
          .boolean()
          .optional()
          .describe(
            "Start without instruction files, memory, skills or hooks; not on OpenCode."
          ),
        may_start: z
          .array(z.string())
          .optional()
          .describe(
            'Types it may start; ["any"] for an orchestrator that fans out. Default its type\'s, else none.'
          ),
        inputs: inputsParameter(),
        lands: z
          .enum(LANDS_MODES)
          .optional()
          .describe(
            "main (default): rebased onto the default branch and pushed. branch: pushed to cawco/<item>. pr: that, with a pull request. none: nothing pushed; name its deliverables in outputs. Work on a machine rather than a repository: host instead."
          ),
        host: z
          .boolean()
          .optional()
          .describe(
            "Run on `machine` itself in `cwd`, outside any clone or boundary: its network, processes and the agent user's groups (docker). For work whose subject is the machine. Lands nothing; what it leaves in $TMPDIR/outputs/ comes back as assets/<item>/. Not with from, workspace, owns or outputs."
          ),
        outputs: z
          .array(z.string())
          .optional()
          .describe(
            "Deliverables that are not commits, from the repository's root; copied to the project folder's assets/<item>/, as is anything it leaves in $TMPDIR/outputs/."
          ),
        group: groupParameter().optional(),
        owns: ownsParameter().optional(),
        budget: budgetParameter().optional(),
        task: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "The task it does, like tsk-12: an attempt at it, your prompt above its task file, run where the task runs; landing moves it on. Not with workspace, host, cwd or machine."
          ),
      },
      (
        {
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
          clean,
          may_start,
          inputs,
          machine,
          lands,
          host,
          outputs,
          group,
          owns,
          budget,
          task,
        },
        _format,
        bound
      ) =>
        bound.actions.delegate(prompt, {
          title,
          cwd,
          harness,
          model,
          account,
          skills,
          workspace,
          from,
          fork,
          clean,
          type,
          mayStart: may_start,
          inputs,
          machine,
          lands,
          host,
          outputs,
          group,
          owns,
          budget,
          task,
        }),
      delegateWords
    ),
    handoffTool(
      "delegate_list",
      "Your delegates, newest first with theirs nested: each one's state, cache warmth and report, then the queued ones and the workspaces held with unlanded work. Use it when you need where one stands, and with `target` while one works and you need its progress or context before its report.",
      {
        target: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "A delegate's handle, directory or id, as handoff takes it: that one delegate in full, its step now, its last steps, its context against its model's window, what it has made so far and its last words."
          ),
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "With target and detailed: which 50 steps, newest first (default 1)."
          ),
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
      ({ include, since, before, target, page }, format, bound) => {
        const windowed = since !== undefined || before !== undefined;
        return bound.actions.delegateList({
          include: include ?? (windowed ? "all" : "live"),
          ...(target === undefined
            ? {}
            : {
                target: {
                  asked: target,
                  page: page ?? 1,
                  steps: format === "detailed" ? "all" : "recent",
                },
              }),
          ...(since === undefined ? {} : { since: new Date(since) }),
          ...(before === undefined ? {} : { before: new Date(before) }),
        });
      },
      delegateListWords,
      { annotations: READ_ONLY }
    ),
    handoffTool(
      "wait_item",
      "A bounded wait on a command you started or a check your parent runs for you, which your parent sees. Use it just before ending your turn to wait on one; the hub wakes you when its minutes run out or a message arrives.",
      {
        minutes: z
          .number({ error: WAIT_ITEM_LIMIT })
          .int({ error: WAIT_ITEM_LIMIT })
          .min(1, { error: WAIT_ITEM_LIMIT })
          .max(WAIT_ITEM_MAX_MINUTES, { error: WAIT_ITEM_LIMIT })
          .describe(
            `Whole minutes to wait, from 1 to ${WAIT_ITEM_MAX_MINUTES}.`
          ),
        reason: z
          .string({ error: WAIT_ITEM_LIMIT })
          .trim()
          .min(1, { error: WAIT_ITEM_LIMIT })
          .describe("What you are waiting for."),
      },
      ({ minutes, reason }, _format, bound) =>
        bound.actions.waitItem(minutes, reason),
      sentence,
      { inputError: WAIT_ITEM_LIMIT }
    ),
    handoffTool(
      "finish_item",
      finishItemDescription(view.lands),
      {
        headline: z
          .string()
          .trim()
          .min(1)
          .describe(
            "What is done, in one or two plain sentences. No ids or file names."
          ),
        summary: z.string().describe(summaryDescription(view.lands)),
        findings: z
          .array(z.object({ title: z.string(), detail: z.string() }))
          .optional()
          .describe("Noticed outside the brief."),
        blocked: z
          .object({ command: z.string(), error: z.string() })
          .optional()
          .describe(
            "Only when something outside your control stops the work: the exact command and error."
          ),
      },
      (request, _format, bound) => bound.actions.finishItem(request),
      sentence
    ),
    handoffTool(
      "continue_session",
      "Another session carried on in a fresh conversation, started from a summary of the old one by a model you pick; it stays one session. Use it when a delegate is stuck or its context is spent.",
      {
        session: z
          .string()
          .min(1)
          .describe(
            "Its id, short id, or directory name; another session than this one."
          ),
        from: z
          .enum(["summary", "asks"])
          .optional()
          .describe(
            '"asks": the messages it was asked alone (a delegate\'s brief and hand-offs), nothing summarised.'
          ),
        summarizer_harness: z
          .enum(HARNESSES)
          .optional()
          .describe(
            "The harness that writes the summary. Absent: the summariser its account's routing names."
          ),
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
      (input, _format, bound) => bound.actions.continueSession(input),
      startedWords
    ),
    handoffTool(
      "stop_delegate",
      "Stops one of your delegates and cancels its item, or withdraws a queued one from the queue. Use it when its work is no longer wanted; to cut a turn and keep the item, use interrupt_delegate.",
      {
        target: z
          .string()
          .describe("Its handle, directory or id; or a queued delegate's id."),
      },
      ({ target }, _format, bound) => bound.actions.stopDelegate(target),
      sentence
    ),
    handoffTool(
      "discard_workspace",
      "Lets go of a held workspace of your delegates': what it holds is saved to a carry in ~/.cawco/carries on its machine, then its clone goes. Use it for a workspace whose work you will not continue.",
      {
        workspace: z.string().describe("Its id, as the hub's notice names it."),
        ask: z
          .boolean()
          .optional()
          .describe(
            "true asks the person, for a workspace that serves what waits on them, which is refused without it."
          ),
        reason: z.string().max(300).optional().describe("With ask: why."),
      },
      ({ workspace, ask, reason }, _format, bound) =>
        bound.actions.discardWorkspace(workspace, {
          ...(ask ? { ask } : {}),
          ...(reason ? { reason } : {}),
        }),
      sentence
    ),
    handoffTool(
      "interrupt_delegate",
      "Interrupts one of your delegates mid-turn without ending it, its state kept. Use it to stop a turn going the wrong way before you redirect it with handoff.",
      {
        target: z.string().describe("Its handle, directory or id."),
      },
      ({ target }, _format, bound) =>
        Promise.resolve(bound.actions.interruptDelegate(target)),
      sentence
    ),
    handoffTool(
      "machine_pause",
      "Pauses a machine for some minutes: its turns stop and nothing starts there until then. Use it when work on a machine must stop for a while, and with `resume` to end the pause early.",
      {
        machine: z
          .string()
          .describe(
            "A hostname (list_sessions names those online) or machineId."
          ),
        minutes: z
          .number()
          .int()
          .min(1)
          .max(1440)
          .optional()
          .describe("How long to pause it; give this or resume."),
        resume: z
          .boolean()
          .optional()
          .describe("true ends its pause; give this or minutes."),
      },
      ({ machine, minutes, resume }, _format, bound) =>
        bound.actions.machinePause(machine, minutes, resume),
      sentence
    ),
    handoffTool(
      "answer_delegate",
      'Answers an ask your delegate routed to you. Use it when a "[delegate-ask ...]" message reaches you.',
      {
        target: z.string().describe("Its handle, directory or id."),
        requestId: z.string().describe("The message's request=."),
        answers: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Each question's exact text → the chosen option's label, both copied from the message."
          ),
        deny: z
          .boolean()
          .optional()
          .describe(
            "true refuses the ask; with neither deny nor answers, it is allowed as asked."
          ),
      },
      ({ target, requestId, answers, deny }, _format, bound) =>
        Promise.resolve(
          bound.actions.answerDelegate(target, requestId, answers, deny)
        ),
      sentence
    ),
    handoffTool(
      "send_to_user",
      "Messages shown to the user in this session's transcript and pushed to their phone. Use it for what they must see as written before the task finishes, like a result they asked to hear at once; a question goes by ask, a choice by a decision card, and progress by todo_write.",
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
      ({ message, attachments }, _format, bound) =>
        bound.actions.sendToUser(message, attachments),
      sentence
    ),
    handoffTool(
      "open_items",
      "Your open items: your plan, task to-dos, filed tasks, inbox notes, asks, and every question your tree put to the person, open or answered, yours first. Use it first after a compaction, and to see which questions were answered.",
      {
        cursor: z
          .string()
          .max(20)
          .optional()
          .describe("next_cursor, for more questions."),
      },
      ({ cursor }, format, bound) => bound.actions.openItems(cursor, format),
      verbatim,
      { annotations: { readOnlyHint: true }, detailed: verbatim }
    ),
    handoffTool(
      "set_title",
      "This session's title, shown wherever the session is listed. Use it once its task is clear, and again only when the task changes.",
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
      ({ title }, _format, bound) => bound.actions.setTitle(title),
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
    handoffTool(
      NO_REPLY_TOOL,
      descriptorOf(view.harness).words.noReply.description,
      {},
      (_asked, _format, bound) => {
        // Thrown, the result is an error with no end-of-turn mark: the model
        // takes its next step, on any harness (core no-reply.ts).
        if (bound.personOwed()) {
          throw new Error(NO_REPLY_OWED);
        }
        return Promise.resolve(descriptorOf(view.harness).words.noReply.result);
      },
      sentence,
      {
        endsTurn: true,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      }
    ),
    handoffTool(
      "show_image",
      "Image files shown to the user in this session's transcript, by path, without you reading their pixels. Use it whenever they should see a screenshot, render or diagram.",
      {
        path: z.string().describe("Absolute."),
        caption: z
          .string()
          .optional()
          .describe("One line under the image saying what it shows."),
      },
      ({ path }, _format, bound) =>
        Promise.resolve(bound.actions.showImage(path)),
      sentence
    ),
    handoffTool(
      artifactList.name,
      artifactList.description,
      artifactList.input,
      ({ cursor }, _format, bound) => bound.actions.artifacts.status(cursor),
      artifactListWords,
      { annotations: READ_ONLY }
    ),
    handoffTool(
      artifactCreate.name,
      artifactCreate.description,
      artifactCreate.input,
      (input, _format, bound) => bound.actions.artifacts.create(input),
      artifactCreatedWords,
      { detailed: artifactCreatedDetailed }
    ),
    handoffTool(
      artifactUpdate.name,
      artifactUpdate.description,
      artifactUpdate.input,
      async (
        { id, statements, ask, title, ...change },
        _format,
        bound
      ): Promise<Updated | AnyProblem> => {
        const changes = Object.values(change).some(
          (value) => value !== undefined
        );
        if (statements !== undefined && changes) {
          throw new Error(
            "statements revises a decision page alone: pass it without html, patch, elements, delete, mermaid, args or story."
          );
        }
        // A new ask and title are checked and written first, so a refused one changes nothing.
        const head = await headWritten(bound.actions, id, ask, title);
        if (head instanceof ElysiaStatus) {
          return head;
        }
        if (statements !== undefined) {
          const answer = await bound.actions.artifacts.revise(id, statements);
          return answer instanceof ElysiaStatus
            ? answer
            : { change: "statements", answer };
        }
        if (!changes && head) {
          return { change: "head", answer: head };
        }
        // A design graph's states file, its own spec and a design folder's pages have their own route; a page's html goes by the page's, which hands a design folder's on.
        const component = componentChange(change, () =>
          bound.actions.artifacts.isDesign(id)
        );
        if (component) {
          const answer = await bound.actions.artifacts.updateComponent(
            id,
            change
          );
          return answer instanceof ElysiaStatus
            ? answer
            : { change: "component", answer };
        }
        const answer = await bound.actions.artifacts.update(id, change);
        return answer instanceof ElysiaStatus
          ? answer
          : { change: "page", answer };
      },
      artifactUpdatedWords,
      { detailed: artifactUpdatedDetailed }
    ),
    handoffTool(
      settle.name,
      settle.description,
      settle.input,
      ({ card, ...picked }, _format, bound) => {
        const hash = card.lastIndexOf("#");
        if (hash <= 0 || hash === card.length - 1) {
          throw new Error(`“${card}” names no card: write <page>#<card>.`);
        }
        return bound.actions.artifacts.settle(card.slice(0, hash), {
          card: card.slice(hash + 1),
          ...picked,
        });
      },
      settledWords
    ),
    handoffTool(
      questionClose.name,
      questionClose.description,
      questionClose.input,
      (closing, _format, bound) =>
        bound.actions.artifacts.closeQuestion(closing),
      questionClosedWords
    ),
    handoffTool(
      artifactRead.name,
      artifactRead.description,
      artifactRead.input,
      async ({ id, state, ...asked }, _format, bound) => {
        let target = id;
        if (target === undefined) {
          const newest = bound.actions.artifacts.newest();
          if (newest instanceof ElysiaStatus || newest === undefined) {
            return (
              newest ??
              problem(404, {
                code: "artifact-none-made",
                detail: "This session has made no artifact yet.",
              })
            );
          }
          target = newest;
        }
        // A frame's `state` goes as its JSON, as the read takes it.
        return await bound.actions.artifacts.read(target, {
          ...asked,
          ...(state ? { state: JSON.stringify(state) } : {}),
        });
      },
      artifactReadWords,
      { annotations: READ_ONLY, detailed: artifactReadDetailed }
    ),
    handoffTool(
      designMap.name,
      designMap.description,
      designMap.input,
      ({ dir, query, component, limit, cursor }, format, bound) =>
        bound.actions.artifacts.designMap({
          ...(dir ? { dir } : {}),
          ...(query ? { query } : {}),
          ...(component ? { component } : {}),
          ...(limit ? { limit } : {}),
          ...(cursor ? { cursor } : {}),
          ...(format === "detailed" ? { detailed: true } : {}),
        }),
      designMapWords,
      { annotations: READ_ONLY }
    ),
    handoffTool(
      artifactShow.name,
      artifactShow.description,
      artifactShow.input,
      ({ id }, _format, bound) => bound.actions.artifacts.show(id),
      artifactShownWords
    ),
    handoffTool(
      artifactBrowse.name,
      artifactBrowse.description,
      artifactBrowse.input,
      ({ id }, _format, bound) => bound.actions.artifacts.browse(id),
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
    handoffTool(
      artifactPromote.name,
      artifactPromote.description,
      artifactPromote.input,
      ({ id }, _format, bound) => bound.actions.artifacts.promote(id),
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
    handoffTool(
      artifactDelete.name,
      artifactDelete.description,
      artifactDelete.input,
      ({ id }, _format, bound) => bound.actions.artifacts.remove(id),
      artifactRemovedWords
    ),
    handoffTool(
      commentRead.name,
      commentRead.description,
      commentRead.input,
      ({ artifact, filter, since }, _format, bound) =>
        bound.actions.artifacts.commentRead({
          filter,
          ...(artifact ? { artifact } : {}),
          ...(since ? { since } : {}),
        }),
      commentReadWords,
      { annotations: READ_ONLY }
    ),
    handoffTool(
      commentReply.name,
      commentReply.description,
      commentReply.input,
      ({ pin, ...reply }, _format, bound) =>
        bound.actions.artifacts.commentReply(pin, reply),
      commentRepliedWords
    ),
    handoffTool(
      commentResolve.name,
      commentResolve.description,
      commentResolve.input,
      ({ pin, ...resolve }, _format, bound) =>
        bound.actions.artifacts.commentResolve(pin, resolve),
      commentResolvedWords
    ),
  ];
  return all.filter(
    (entry) =>
      spawningToolAllowed(entry.name, view.mayStart) &&
      (!["finish_item", "wait_item"].includes(entry.name) || !!view.workItem)
  );
}

/**
 * The CawCo tools a Claude session loads upfront, where its toolset has them
 * (MCP `_meta` `"anthropic/alwaysLoad": true`, delegation-mcp.ts `listed`);
 * every other one is deferred behind ToolSearch. These are the calls a
 * session makes every turn or must not miss: in one orchestrator, handoff
 * 69 calls, delegate 32, artifact_create 11 (2026-10-15); a leaf's
 * finish_item and every session's set_title are asked for by name, and a
 * silent turn ends on no_reply_needed, which a ToolSearch call in front of it
 * would only delay. When delegate sat deferred, one name among 133, sessions ran work inline 79
 * times for each delegation. "Keep your 3–5 most frequently used tools
 * non-deferred so Claude can call them without searching first"
 * (platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool).
 */
const ALWAYS_LOAD: ReadonlySet<string> = new Set([
  "delegate",
  "handoff",
  "finish_item",
  "set_title",
  NO_REPLY_TOOL,
  "artifact_create",
]);

/** Which of the role-bound groups load upfront for one session ({@link loadsUpfront}). */
export interface UpfrontFor {
  /** Its role has task_link (roles.ts). */
  filesTasks: boolean;
  /** It may call memory_note: its role allows it and it is in a project, the inbox a note goes to (memory.ts `inboxOf`). */
  notes: boolean;
  /** An orchestrator or a project's Caw (roles.ts `memoryRoleOf`). */
  searcher: boolean;
}

/**
 * `find` (find-tool.ts) loads upfront too for the sessions that search most,
 * an orchestrator and a project's Caw (roles.ts `memoryRoleOf`): the owner
 * saw the orchestrator grep transcripts and query the hub's database for
 * what a session said, with the dashboard's own search a tool away
 * (2026-10-19). Every other session loads it through ToolSearch like any
 * deferred tool.
 *
 * `memory_note` loads upfront for every session that may call it: a session
 * orchestrating the marketing project saved four memories as files in
 * Claude Code's own auto memory and never once called memory_note, which
 * sat deferred and unnamed (2026-11-17).
 */
export const loadsUpfront = (name: string, upfront: UpfrontFor): boolean =>
  ALWAYS_LOAD.has(name) ||
  (upfront.searcher && name === "find") ||
  (upfront.filesTasks && CORE_TASK_TOOLS.has(name)) ||
  (upfront.notes && name === "memory_note");

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
 * What a session can be listed over its life: its role and whether it may
 * delegate are fixed at its start, its project is not (`project_from_session`
 * makes one). `names` is the union across both.
 */
export interface Listable {
  names: readonly string[];
  /** The names Claude loads upfront for this session ({@link loadsUpfront}). */
  upfront: ReadonlySet<string>;
}

/**
 * One sentence: which tools load upfront on Claude. The harness lists every
 * deferred tool's name itself and ToolSearch says how to load one, so the
 * line names only what it cannot: the upfront set and the server's prefix.
 */
const loadingLine = (listable: Listable): string =>
  `On Claude, ${listable.names.filter((name) => listable.upfront.has(name)).join(", ")} load upfront; every other one loads through ToolSearch by name or prefix.`;

/** How `response_format` answers (mcp-tool.ts), said once for every tool. */
const ANSWERS =
  'response_format: "detailed" returns the hub\'s whole record as JSON, for when the words leave out what you need.';

/**
 * How a leaf carries its brief to the end, from Prompting Claude Fable 5.2,
 * "Finish the whole task": a leaf runs unattended, most at the `medium` and
 * `low` types' effort, where that model ends turns early with work left. It
 * keeps the guide's line between an ordinary obstacle, worked through, and
 * a deliberate one (the workspace's boundary among them), left alone and
 * named in finish_item's `blocked`.
 */
const LEAF_FINISHING =
  "Keep working while the brief still owes work, and work that does not depend on an open question or card goes on while it waits. An error, a timeout, a busy or failing tool, a locked file or an empty result is an ordinary obstacle: diagnose it and work through it with the access you have (wait and retry, fix the call, use another tool or source). A deliberate block is different: the workspace's boundary, access that was withheld, a file the brief says not to touch, a guardrail. Leave it alone, look for another safe way to finish, and when there is none, name it in finish_item's `blocked`. None of this lifts a confirmation the harness asks for a risky or destructive action.";

/**
 * When a session draws a block in its reply (tsk-330), opened with the
 * medium it is drawn in. Every session hears it on every turn, so it holds
 * only when a block is the right form and the pointer to the inline-block
 * skill, which holds everything else (its fence, versions, keeping, sizes;
 * generated from the block library, core openui-views.ts).
 */
const BLOCKS =
  "Blocks: a block is a small UI drawn inline in this chat's transcript, between your reply's paragraphs, and read on a desk and on a phone. When a reply compares options, tracks many items, or shows figures, a chart or a diagram, draw it as a block in place of a markdown table. Prose stays prose, and a choice for the person goes through ask or a decision page. Load the inline-block skill before your first block.";

/**
 * Where a session that may call memory_note ({@link UpfrontFor} `notes`)
 * keeps what should outlast it: said once at its start, beside the tool
 * loaded upfront, so the project's memory is its first reach.
 */
const NOTES = memoryRunWords.noteLine;

/** The server's instructions for one session, from what it can be listed. */
export function handoffInstructions(
  view: Pick<ToolView, "mayStart">,
  listable: Listable,
  kinds: readonly Kind[]
): string {
  const { names } = listable;
  // How a session names another in its words (core references.ts): the
  // dashboard draws the link as that session's chip.
  // Who decides' kinds are the fleet's rows: the live list, read as the
  // session starts, so a kind added reaches the next session.
  const notes = listable.upfront.has("memory_note") ? `\n\n${NOTES}` : "";
  const naming = `${DECIDES_RULE} ${kindsLine(kinds)}${notes}\n\n${REFERENCE_GUIDANCE}\n\n${BLOCKS}\n\n${ANSWERS}`;
  // Sessions said image generation was unavailable on models without it:
  // the tool is the hub's, on every model, and stays the session's own.
  const images = names.includes("generate_image")
    ? `\n\ngenerate_image makes images on any model through this machine's own sign-in to an image provider (the fleet's default, ${DEFAULT_IMAGE_PROVIDER} unless changed, or the one provider names): this session makes its own.`
    : "";
  const loading = `\n\n${loadingLine(listable)}`;
  const { mayStart } = view;
  if (!startsAny(mayStart)) {
    // A leaf that may start a few types hands them the work they name and
    // waits on their reports like any parent.
    const starts =
      mayStart.length > 0
        ? ` It may delegate only to ${mayStart.join(", ")}, whose reports wake it: end the turn to wait for one.`
        : "";
    return `This session is a leaf delegate: do the assigned work yourself and call finish_item when it is done.${starts}\n\n${LEAF_FINISHING}\n\n${naming}${loading}${images}`;
  }
  // The orchestrator's seat, the same on every model: an Opus orchestrator
  // made 387 shell and about 50 browser calls in one day (killing dev
  // servers, probing sockets, reading journals) where a brief belonged.
  // Claude Code cuts a server's instructions at 4,096 characters
  // (code.claude.com/docs/en/mcp, "For MCP server authors"), so what the
  // seat must read comes first and the block stays well inside the cap.
  return [
    "This session orchestrates: it plans, briefs, reads reports and decides, and takes a delegate's report as the evidence for its work. Substantial execution goes to a delegate, so this session stays free for the person and the plan: implementation, builds, browser checks and probes. Give each delegate a concrete deliverable. `owns` keeps two items from overlapping; work on a screen owns the whole screen. Reports arrive by themselves, so independent parent work keeps moving. Finished work goes to the person as it is; a review runs when they ask for one. CawCo's delegate is not the harness's own subagents, which do not resolve CawCo's types.",
    "When a delegate call is refused, read the refusal and fix the call (another type, a missing field, a narrower brief), then call again. When no type fits or the refusal stands, tell the person with its error; bulk exploration still goes to a delegate once one can run.",
    `${naming}${loading}${images}`,
  ].join("\n\n");
}
