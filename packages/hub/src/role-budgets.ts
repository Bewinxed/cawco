/**
 * Each role's tool budget, measured (Projects spec §5.3: "Each role has a
 * tool budget measured in tokens"). A role's size is what its `tools/list`
 * answers a typical session in that role — the same `toolsFor` the MCP
 * server lists from — as JSON, in tokens by core's own estimate
 * (`estimateTokens`, the continuation's measure). `bun run roles:check`
 * prints each and fails over {@link ROLE_TOOL_BUDGET}.
 */
import { estimateTokens } from "@cawco/core/continuation";
import {
  ANY_TYPE,
  SESSION_ROLES,
  type SessionRole,
} from "@cawco/core/delegate-types";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  definedTools,
  listedFor,
  listedTools,
  toolViewOf,
} from "./delegation-mcp";

/**
 * Tokens a role's listed tool definitions may take: each is its size as
 * last measured when it was raised deliberately, plus a little room. A role
 * that outgrows it splits a tool or trims a description before it ships.
 * Every raise and what it bought is in this block's history (`git log -L`
 * on it), from slice 9's first measure on.
 * 2026-10-30: one kind of session. The project's own tools (view_draft,
 * view_query, folder_read, folder_write, project_setup, project_settings,
 * routine_result, memory_propose) are a worker's wherever its folder is in a
 * project, and the conversation tools of a separate role are gone (worker
 * 27,907 measured). The worker's budget is lowered to it.
 * 2026-10-31: a canvas's elements say that text wraps at its width and a
 * childless frame takes what it covers, which agents had worked out by hand
 * (worker 27,968 measured).
 * 2026-10-31: every role lists no_reply_needed, the one way Claude Code takes
 * a turn with no text (worker 28,065, curator 1,292 measured).
 * 2026-10-31: the prompt audit gave the bare parameters of task_read,
 * task_result, machine_pause, answer_delegate and forge_post their contracts,
 * and no_reply_needed and open_items theirs (worker 28,665, delegate 10,716,
 * curator 1,332 measured).
 * 2026-10-31: only a session that talks with the person lists no_reply_needed,
 * so no work item and no triage run does (worker 28,632, delegate 10,550,
 * curator 1,166 measured). The delegate's and curator's budgets are lowered to it.
 * 2026-10-31: admin_subagents_read and admin_subagents_write, so a fleet
 * subagent is changed with the owner's approval like every other kind of
 * fleet configuration (worker 29,065 measured).
 * 2026-11-02: delegate_list takes a `target` (and its steps' `page`): one
 * delegate in full, its steps, context, made so far and last words, in
 * place of reading its transcript by hand; 143 tokens (worker 29,221
 * measured, from 29,078). Only a session that may start delegates lists it,
 * so the delegate's role is unchanged.
 * 2026-11-02: a project's setup and a view's ask carry the person's words
 * alone; their procedures moved to the project-setup and project-view skills
 * and their facts to tools: project_setup answers data, project_name names a
 * project made from New project's words, view_guide answers how a view is
 * written (worker 29,365 measured).
 * 2026-11-04: generate_image takes a `provider` (ChatGPT by default, the
 * Antigravity CLI on asking), so an agent can make an image through the
 * owner's Gemini subscription too, and says a JPEG lands as .jpg (worker
 * 29,456 measured).
 * 2026-11-04: generate_image's provider may be the Gemini API on a held
 * key, which takes a `model` of its four, and its default is the fleet's
 * setting (worker 29,540, delegate 10,569 measured).
 * 2026-11-05: every session settles its own questions to the person:
 * open_items lists each question its tree put to him, open or answered,
 * paged (`cursor`, `response_format`), and question_close takes or
 * withdraws one (231 tokens); artifact_list loses `waiting`, the list it
 * overlapped (worker 29,514, delegate 10,821 measured). A delegate puts
 * pages and canvases to the person as a worker does, so it lists both; its
 * budget is raised to it.
 * 2026-11-05: artifact_create takes a required `title` and artifact_update
 * changes it: every surface names an artifact to the person by the title
 * its agent wrote, and its slug `name` stays for tools and URLs (worker
 * 29,588, delegate 10,896 measured).
 * 2026-11-05: list_sessions answers which sessions stopped at a usage limit,
 * whose, and in what order they were touched, across every machine, in one
 * call: `role`, `stopped`, `sort`, `since`, `limit` and `cursor`, and a
 * description that tells it from delegate_list and find, in place of the
 * hub's database and transcripts read by hand (300 tokens; worker 29,888,
 * delegate 11,196 measured).
 * 2026-11-06: artifact_create's kind, does, program, html, port and serve
 * each say what they take, its description now naming none of them, and
 * words cut from generate_image, artifact_read, todo_write, delegate and
 * artifact_create's `to`, so the room comes from words, not the budgets
 * (worker 29,820, delegate 11,142 measured).
 * 2026-11-08: delegate takes `clean`, which the owner asked for to compare
 * a delegate started without the instruction context against one started
 * with it, described in one line (worker 29,932, delegate 11,164 measured:
 * a leaf is listed no delegate).
 * 2026-11-09: fitted to Prompting Claude Fable 5.2. delegate's description
 * says what a delegate costs and how to brief one ("Set expectations for
 * subagents"), and finish_item's says who reads the report ("Make reports
 * easy to follow") (worker 30,040, delegate 11,206 measured).
 * 2026-11-11: calls_by_role, which skills and MCP servers each role's
 * sessions called (capability-calls.ts), so the routine that proposes
 * trimming each role's starting set reads a count, not transcripts
 * (worker 30,358 measured; a delegate is listed none).
 * 2026-11-11: project_settings takes set_starting_set and its
 * `starting_set`: the skills and servers a project's sessions start with
 * (tsk-336), changed as the project's other settings are (worker 30,465
 * measured).
 * 2026-11-11: trimmer, a run of the unused skills and servers routine
 * (unused-trim.ts): set_title, finish_item, calls_by_role and trim_propose.
 * 2026-11-11: project_settings' description says a starting set can be
 * proposed again at any time (tsk-348), the owner's "with the option to
 * change it later" on card `role-starting-set#own-sessions` (worker 30,502
 * measured).
 * 2026-11-11: Caw turns the hub's unused skills and servers routine on when
 * the person sends the empty Routines page's chip for it: routine_list names
 * it while the project has none, routine_update with enabled: true alone
 * turns it on, and routine_create points there instead of a second routine
 * (worker 30,579 measured).
 * 2026-11-13: artifact_create's `kind` says an agent looks at UI it builds
 * on the component canvas and that a preview's app holds no CawCo sign-in
 * (the rule lived only in the owner's private memory documents; worker
 * 30,613, delegate 11,278 measured).
 * 2026-11-13: admin_mcp_servers' `config` says how a connector secret reads
 * and is written (it reads as set and is never read back; the owner approved
 * write-only secrets that day), the one place an agent learns that a put keeps
 * what it leaves out (worker 30,641 measured).
 * 2026-11-13: call mechanics the owner's memory documents carried move into
 * the tools they are about: a fork's workspace is cut from the default
 * branch or where `from` says, the merge checks are the project's gate.md, a
 * wait may be on the parent's check and ends when its minutes run out or a
 * message arrives, everything else in $TMPDIR is deleted with a workspace,
 * ship notes tell the person updating what changed, delegate_list shows
 * which session is warm, find reaches unlanded work (worker 30,692, delegate
 * 11,331, curator 1,209 measured).
 * 2026-11-14: memory_propose takes `card` and `drop`, so a session carries
 * out the person's own pick on a card about memory notes without a second
 * ask (tsk-369, the owner's "A card's pick settles notes" on card
 * `note-settle`); its description says what they do and when they are
 * accepted (worker 30,799, curator 1,316 measured).
 * 2026-11-14: action_list and event_route_list take `skip`, so an agent reads
 * the older actions and events a page leaves out (their answers say how many
 * and which skip reads on) (worker 30,828 measured).
 */
const ROLE_TOOL_BUDGET: Record<SessionRole, number> = {
  worker: 30_840,
  delegate: 11_340,
  overseer: 770,
  "web-facing": 3400,
  curator: 1320,
  trimmer: 1400,
};

/**
 * A typical session of each role: a session you started, a leaf work item,
 * triage, a web-facing work item, a memory curator run. The worker and the
 * delegate are in a project: one in none is listed fewer tools
 * (delegation-mcp.ts `PROJECT_ONLY`, roles.ts `allows`), and the budget holds
 * the most a role is listed.
 */
const SAMPLES: Record<SessionRole, Partial<InstanceRow>> = {
  worker: { projectId: "project" },
  delegate: {
    parentInstanceId: "parent",
    workItemId: "item",
    mayStart: [],
    projectId: "project",
  },
  overseer: { role: "overseer" },
  "web-facing": {
    role: "web-facing",
    parentInstanceId: "parent",
    workItemId: "item",
    mayStart: [],
  },
  trimmer: {
    role: "trimmer",
    projectId: "project",
    parentInstanceId: "routine:trim",
    workItemId: "item",
    mayStart: [],
  },
  curator: {
    role: "curator",
    projectId: "project",
    parentInstanceId: "routine:curator",
    workItemId: "item",
    mayStart: [],
  },
};

export interface RoleSize {
  budget: number;
  /** Each listed tool's own tokens, by the same measure, largest first. */
  byTool: { name: string; tokens: number }[];
  role: SessionRole;
  tokens: number;
  tools: number;
}

/** One role's tools, as a session of it is listed them on Claude Code: their definitions, as the model reads them. */
export interface RoleTools {
  role: SessionRole;
  tools: { name: string; inputSchema: unknown }[];
}

/** Each role's listed tools, their count and size against its budget, on Claude Code. */
export const measureRoles = (): RoleSize[] =>
  listRoleTools().map(({ role, tools }) => ({
    role,
    tools: tools.length,
    tokens: estimateTokens(JSON.stringify(tools).length),
    budget: ROLE_TOOL_BUDGET[role],
    byTool: tools
      .map((tool) => ({
        name: tool.name,
        tokens: estimateTokens(JSON.stringify(tool).length),
      }))
      .toSorted((a, b) => b.tokens - a.tokens),
  }));

/**
 * Every role's tools as a session of it is listed them ({@link RoleTools}),
 * read from the tool definitions alone: the hub's own listing of a session
 * (delegation-mcp.ts `listedTools`), none of its tools called.
 */
export const listRoleTools = (): RoleTools[] =>
  SESSION_ROLES.map((role) => {
    const row = sampleOf(role);
    const listed = listedTools(
      row,
      definedTools(toolViewOf(row, undefined)),
      []
    );
    // What the model reads: a tool's `_meta` (its alwaysLoad mark) is
    // Claude Code's to act on, never part of the definition it sends.
    return {
      role,
      tools: listed.map(listedFor(row)).map(({ _meta, ...tool }) => tool),
    };
  });

/** The sample session of `role`: its id the role's name. */
const sampleOf = (role: SessionRole): InstanceRow => ({
  id: role,
  machineId: "machine",
  cwd: "/",
  harness: "claude",
  launchDir: "known",
  sessionId: null,
  status: "running",
  kind: "mainline",
  // A session nobody delegated work to, as a person's: a role's sample
  // that is a delegate says its own.
  mayStart: [ANY_TYPE],
  startingSet: null,
  ...SAMPLES[role],
});
