/**
 * A session in its project's place (Caw among them: roles.ts `allows`)
 * changes that project's settings (`project_settings`). The owner's word:
 * "caw should be able to do whatever it wants", so the change applies at
 * once, through the same code the person's own change runs, and is noted in
 * the project's conversation with what changed. When the change is one the
 * session judges the person should decide, it asks with `ask: true`: the
 * change is recorded as the person's ask in that session (asks.ts) and
 * the call answers at once; Approve has the hub apply it
 * ({@link ProjectSettings.runApproved}) and Deny notes it declined, and the
 * session is told either way.
 *
 * A closed set of changes, each validated before anything applies:
 * - `grant_connection`: a connection that exists joins the project's
 *   connections, as Settings › Connections' `projects` does
 *   (connections.ts `update`): every session of the project may use it.
 * - `link_repo`: a link to a GitHub repository, `github.com/<owner>/<name>`,
 *   beside the ones its checkouts' origins give it (server.ts
 *   `learnRemote`): its GitHub events and pull requests reach the project.
 *   No file in any place of the project changes; a link it has, or one
 *   another project has, is refused.
 * - `set_lands`: where the project's attempts land when their task says
 *   nothing, through the person's own edit (project-edit.ts), which writes
 *   it with the dispatch settings (dispatch.ts `configure`).
 * - `set_runs_on`: where the project's attempts run when their task says
 *   nothing (runs-on.ts): a machine or a capability like `apple`, or null
 *   for any machine; through the same dispatch settings.
 * - `create_repo`: one of the project's folders (`folder`; its only one when
 *   left out) published to a new GitHub repository, then linked as that
 *   repository's copy (repo-publish.ts). Each repository is published once.
 *   It reaches outside, so it is always asked, `ask` or not.
 * - `rename`: the project's name, checked and written as the person's own
 *   edit is (project-edit.ts). A name is a label the person can change back
 *   in a click, so it applies at once like the others.
 * - `set_review`: Review before done on or off (project-edit.ts). Whether
 *   every task waits for the person before done is the person's choice
 *   either way (on routes work through them, off takes away a look they
 *   chose), so it is always asked, `ask` or not.
 * - `set_dispatch`, `set_max_attempts`, `set_review_limit`, `set_budget`:
 *   the rest of the project's dispatch settings, each checked by the rule
 *   the dashboard's own change is (dispatch.ts `dispatchProblem`) and
 *   written by the same `configure` (`PATCH /api/projects/:id/dispatch`).
 * - `set_events`: whether the project's events reach its conversation,
 *   through the switch the person flips (caw.ts `configure`,
 *   `PATCH /api/projects/:id/caw`). Off lets what it started finish.
 * - `set_hears_tasks`, `set_attempts_hear_comments`: whether the
 *   conversation reads what the person writes on tasks (task-input.ts), and
 *   whether their comment reaches the task's attempt (jev-tasks.ts), through
 *   the same `configure`.
 * - `set_account`: the account the project's sessions start on when a start
 *   names none (an account's id, nickname or email; null for the fleet's
 *   routing), checked and written as the person's own edit is
 *   (project-edit.ts), which moves its running conversation there too.
 * - `set_account_at_limit`: what the project's sessions on that account do
 *   at its limit (core `ProjectAtLimit`): wait for the reset, or move to an
 *   account with room; through the same edit.
 * - `set_area`: the area it sits in (core areas.ts), by its id or name, or
 *   null for none, through the person's own move (areas.ts `place`): it
 *   takes the area's settings wherever it sets none, and the note says what
 *   it takes and what falls back to the fleet's.
 * Called with no changes, it answers the project's settings as they stand,
 * each named by the change that sets it, every setting in effect with where
 * it came from (its own, its area's, the fleet's), and what dispatch would
 * do now.
 * Only the session's own project, named by its id or its name in any case:
 * naming another is refused. What its work's landing gate runs is the project's
 * gate.md (gate-file.ts), not a setting.
 */

import {
  type Account,
  accountNameAmong,
  PROJECT_AT_LIMIT,
} from "@cawco/core/accounts";
import type { SettingSource } from "@cawco/core/areas";
import { PROJECT_SETTINGS } from "@cawco/core/asks";
import { hubRepoSegment } from "@cawco/core/hub-repo";
import {
  PROJECT_LANDS,
  PROJECT_SETTING_KINDS,
  type ProjectSettingChange,
  projectSettingWords,
  publishedWords,
} from "@cawco/core/permission-presentation";
import type { ProjectNote } from "@cawco/core/project-conversation";
import type { InstanceRow } from "@cawco/core/protocol";
import { unhandled } from "@cawco/core/unhandled";
import { areaWords } from "@cawco/core/words/areas";
import { projectAccountWords } from "@cawco/core/words/project-account";
import { projectSettingsWords } from "@cawco/core/words/project-settings";
import { ElysiaStatus } from "elysia";
import { z } from "zod";
import type { Areas } from "./areas";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import {
  type DispatchChange,
  type Dispatcher,
  dispatchProblem,
} from "./dispatch";
import { boardTitle } from "./labels";
import { type McpTool, sentence, tool } from "./mcp-tool";
import type { createProjectEdits } from "./project-edit";
import { accountChange, projectName } from "./project-edit";
import { refusal } from "./refusal";
import type { RepoPublish } from "./repo-publish";
import { runsOnValue } from "./runs-on";
import { budgetParameter } from "./task-tools";

const GITHUB_REPO =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/u;
const REASON_LIMIT = 300;

/** A refusal in one sentence: the call's error. */
/** A rename, checked as the person's own is (project-edit.ts `projectName`). */
const renamed = (project: ProjectRow, asked: { name?: string }) => {
  const name = projectName(asked.name ?? "");
  if (name instanceof ElysiaStatus) {
    return name;
  }
  if (name === project.name) {
    return refusal(
      400,
      "project-called-already",
      `This project is called ${name} already.`
    );
  }
  return { kind: "rename", name } satisfies ProjectSettingChange;
};

/** Review before done turned on or off, refused when it is that already. */
const reviewSet = (project: ProjectRow, asked: { review?: boolean }) => {
  const { review } = asked;
  if (review === null || review === undefined) {
    return refusal(
      400,
      "set-review-says-true",
      "set_review says on (true) or off (false)."
    );
  }
  if (review === project.review) {
    return refusal(
      400,
      "review-before-done-project",
      `Review before done is ${review ? "on" : "off"} for this project already.`
    );
  }
  return { kind: "set_review", review } satisfies ProjectSettingChange;
};

/** What the tool takes: changes, flat, each read by its `kind`. */
const ASKED_CHANGE = z.object({
  kind: z.enum(PROJECT_SETTING_KINDS),
  connection: z.string().optional(),
  github: z.string().optional().describe("owner/name"),
  folder: z
    .string()
    .optional()
    .describe("create_repo: the folder's path, when the project has several"),
  lands: z.enum(PROJECT_LANDS).optional(),
  runs_on: z.string().nullable().optional(),
  name: z.string().optional(),
  private: z.boolean().optional(),
  review: z.boolean().optional(),
  dispatch: z.boolean().optional(),
  max_attempts: z.number().int().optional(),
  review_limit: z.number().int().optional(),
  budget: budgetParameter("Per attempt; null: no limit.").nullable().optional(),
  events: z.boolean().optional(),
  hears_tasks: z.boolean().optional(),
  attempts_hear_comments: z.boolean().optional(),
  account: z
    .string()
    .nullable()
    .optional()
    .describe("set_account: id, nickname or email; null: routing"),
  at_limit: z.enum(PROJECT_AT_LIMIT).optional(),
  area: z
    .string()
    .nullable()
    .optional()
    .describe("set_area: an area's id or name; null: none"),
});
type AskedChange = z.infer<typeof ASKED_CHANGE>;

const definition = z.object({
  changes: z.array(ASKED_CHANGE).min(1).max(6).optional(),
  reason: z.string().optional(),
  ask: z.boolean().optional(),
  project: z.string().optional(),
});

const DESCRIPTION =
  "Read your project's settings (no changes) or change them, noted in the project's conversation; ask: true asks the person first (create_repo and set_review always do).";

/** What a malformed call is told, after what it got wrong. */
const INPUT_HELP = `changes is a list of ${PROJECT_SETTING_KINDS.join(", ")}, and reason one sentence; leave changes out to read the settings.`;

/** A stored change as the tool takes it: an ask approved after a restart is checked again from it. */
const askedOf = (change: ProjectSettingChange): AskedChange => {
  switch (change.kind) {
    case "grant_connection":
      return { kind: change.kind, connection: change.connection };
    case "link_repo":
      return { kind: change.kind, github: change.github };
    case "set_lands":
      return { kind: change.kind, lands: change.lands };
    case "set_runs_on":
      return { kind: change.kind, runs_on: change.runsOn };
    case "create_repo":
      return {
        kind: change.kind,
        name: change.name,
        private: change.private,
        ...(change.folder ? { folder: change.folder } : {}),
      };
    case "rename":
      return { kind: change.kind, name: change.name };
    case "set_review":
      return { kind: change.kind, review: change.review };
    case "set_dispatch":
      return { kind: change.kind, dispatch: change.dispatch };
    case "set_max_attempts":
      return { kind: change.kind, max_attempts: change.maxAttempts };
    case "set_review_limit":
      return { kind: change.kind, review_limit: change.reviewLimit };
    case "set_budget":
      return { kind: change.kind, budget: change.budget };
    case "set_events":
      return { kind: change.kind, events: change.events };
    case "set_hears_tasks":
      return { kind: change.kind, hears_tasks: change.hearsTasks };
    case "set_attempts_hear_comments":
      return {
        kind: change.kind,
        attempts_hear_comments: change.attemptsHearComments,
      };
    case "set_account":
      return { kind: change.kind, account: change.account };
    case "set_account_at_limit":
      return { kind: change.kind, at_limit: change.atLimit };
    case "set_area":
      return { kind: change.kind, area: change.area };
    default:
      return unhandled("project setting", change);
  }
};

/** The changes the dispatch settings write (dispatch.ts `configure`). */
const DISPATCH_KINDS = [
  "set_runs_on",
  "set_dispatch",
  "set_max_attempts",
  "set_review_limit",
  "set_budget",
] as const satisfies readonly ProjectSettingChange["kind"][];
type DispatchSetting = Extract<
  ProjectSettingChange,
  { kind: (typeof DISPATCH_KINDS)[number] }
>;

/** The columns a dispatch change writes, as the dashboard's own change names them. */
const dispatchColumns = (change: DispatchSetting): DispatchChange => {
  switch (change.kind) {
    case "set_runs_on":
      return { runsOn: change.runsOn };
    case "set_dispatch":
      return { dispatch: change.dispatch };
    case "set_max_attempts":
      return { maxAttempts: change.maxAttempts };
    case "set_review_limit":
      return { reviewLimit: change.reviewLimit };
    case "set_budget":
      return { budget: change.budget };
    default:
      return unhandled("dispatch setting", change);
  }
};

/** A dispatch change as asked, its value named, else refused saying which field it takes. */
const dispatchAsked = (
  asked: AskedChange & {
    kind: Exclude<DispatchSetting["kind"], "set_runs_on">;
  }
) => {
  const { needs } = projectSettingsWords;
  switch (asked.kind) {
    case "set_dispatch":
      return asked.dispatch === undefined
        ? refusal(400, "dispatch-needed", needs.dispatch)
        : ({
            kind: asked.kind,
            dispatch: asked.dispatch,
          } satisfies DispatchSetting);
    case "set_max_attempts":
      return asked.max_attempts === undefined
        ? refusal(400, "max-attempts-needed", needs.maxAttempts)
        : ({
            kind: asked.kind,
            maxAttempts: asked.max_attempts,
          } satisfies DispatchSetting);
    case "set_review_limit":
      return asked.review_limit === undefined
        ? refusal(400, "review-limit-needed", needs.reviewLimit)
        : ({
            kind: asked.kind,
            reviewLimit: asked.review_limit,
          } satisfies DispatchSetting);
    case "set_budget": {
      if (asked.budget === undefined) {
        return refusal(400, "budget", needs.budget);
      }
      const { budget } = asked;
      // Empty clears it, as null does (dispatch.ts `columnsOf`).
      return {
        kind: asked.kind,
        budget: budget && Object.keys(budget).length > 0 ? budget : null,
      } satisfies DispatchSetting;
    }
    default:
      return unhandled("dispatch setting", asked.kind);
  }
};

/** A dispatch change the project has already, refused in its own words. */
const alreadyWords = (change: DispatchSetting): string => {
  const { already } = projectSettingsWords;
  switch (change.kind) {
    case "set_dispatch":
      return already.dispatch(change.dispatch);
    case "set_max_attempts":
      return already.maxAttempts(change.maxAttempts);
    case "set_review_limit":
      return already.reviewLimit(change.reviewLimit);
    case "set_budget":
      return already.budget;
    case "set_runs_on":
      return already.runsOn(change.runsOn);
    default:
      return unhandled("dispatch setting", change);
  }
};

export interface ProjectSettingsDeps {
  /** The fleet's accounts, every provider's. */
  readonly accounts: () => Account[];
  /** The areas, by id or name, and a project put in one (areas.ts). */
  readonly areas: Pick<Areas, "named" | "place"> & {
    /** Every area's name, in its order. */
    readonly names: () => string[];
  };
  /**
   * Records the change as the person's ask in the session that asked (asks.ts):
   * what the call answers; undefined in Full Send, when it applies now.
   */
  readonly ask: (
    actor: InstanceRow,
    input: Record<string, unknown>,
    toolUseId: string | undefined
  ) => Promise<string | undefined>;
  /**
   * Turns the project's Caw on or off, or one switch of the person's writing
   * on tasks, as his switches do (caw.ts `configure`).
   */
  readonly caw: (
    projectId: string,
    change:
      | { on: boolean }
      | { hearsTasks: boolean }
      | { attemptsHearComments: boolean }
  ) => unknown;
  readonly connections: Pick<Connections, "get" | "list" | "update">;
  readonly db: Pick<
    DbShape,
    "addProjectLink" | "listAgents" | "project" | "projectByRemote"
  >;
  /**
   * Changes the project's dispatch settings, and reads them with what the
   * dispatcher would do now: the dashboard's own path (dispatch.ts
   * `configure`, `view`).
   */
  readonly dispatch: Pick<Dispatcher, "configure" | "view">;
  /**
   * The project's name, Review before done, default landing and account,
   * through the person's own edit (project-edit.ts).
   */
  readonly edit: ReturnType<typeof createProjectEdits>["edit"];
  /**
   * Its Who decides and delegate types in effect (decides-file.ts,
   * project-delegate-types.ts): each kind's member and each type, with
   * where it came from.
   */
  readonly inEffect: (project: ProjectRow) => Promise<{
    decides: { kind: string; member: string; from: SettingSource }[];
    types: { name: string; from: SettingSource }[];
  }>;
  /** Notes what happened in the project's conversation (caw.ts `notice`). */
  readonly note: (actor: InstanceRow, note: ProjectNote) => void;
  /** A place published to a new GitHub repository (repo-publish.ts). */
  readonly publish: Pick<RepoPublish, "publish" | "read">;
}

export const createProjectSettings = ({
  accounts,
  areas,
  ask,
  caw,
  connections,
  db,
  dispatch,
  edit,
  inEffect,
  note,
  publish,
}: ProjectSettingsDeps) => {
  /**
   * The caller's own project, and nothing else: its scope already holds
   * (roles.ts `allows`), and `named` must be it, by its id or its name in
   * any case (`cawco-dev` is the project Cawco-Dev).
   */
  const ownProject = (actor: InstanceRow, named?: string) => {
    const project = actor.projectId ? db.project(actor.projectId) : undefined;
    if (!project) {
      return refusal(
        400,
        "project-settings-changes-sessions",
        "project_settings changes this session's project, and this session is in none."
      );
    }
    const asked = named?.trim().toLowerCase();
    if (
      asked &&
      asked !== project.id.toLowerCase() &&
      asked !== project.name.trim().toLowerCase()
    ) {
      return refusal(
        400,
        "not-yours",
        projectSettingsWords.notYours(named?.trim() ?? "", project.name)
      );
    }
    return project;
  };

  /** The connections the project is not granted yet, by name: what grant_connection takes. */
  const grantable = (project: ProjectRow): string[] =>
    connections
      .list()
      .filter((view) => !view.projects.includes(project.id))
      .map((view) => view.name);

  /** A repository link, checked against the project as it stands. */
  const linkable = (project: ProjectRow, remote: string) => {
    if (project.links.includes(remote)) {
      return refusal(
        400,
        "project-linked-already",
        `This project is linked to ${remote} already.`
      );
    }
    const other = db.projectByRemote(remote);
    if (other && other.id !== project.id) {
      return refusal(
        400,
        "project-repository",
        `${remote} is the project “${other.name}”'s repository.`
      );
    }
  };

  /** Where the project's attempts run, checked against the fleet (runs-on.ts); null or empty: any machine. */
  const runsOnChange = (
    project: ProjectRow,
    asked: string | null | undefined
  ) => {
    if (asked === undefined) {
      return refusal(
        400,
        "set-runs-names-runs",
        "set_runs_on names runs_on: apple, linux, a machine, or null."
      );
    }
    let to: string | null = null;
    if (asked?.trim()) {
      const value = runsOnValue(asked, db.listAgents());
      if (!("value" in value)) {
        return refusal(400, "runs-on-unknown", value.problem);
      }
      to = value.value;
    }
    const change: DispatchSetting = { kind: "set_runs_on", runsOn: to };
    return project.runsOn === to
      ? refusal(400, "already-words", alreadyWords(change))
      : change;
  };

  /**
   * A dispatch setting but where work lands or runs, checked by the
   * dashboard's own rule (dispatch.ts `dispatchProblem`) and refused when it
   * is that already.
   */
  const dispatchSet = (
    project: ProjectRow,
    asked: Parameters<typeof dispatchAsked>[0]
  ) => {
    const change = dispatchAsked(asked);
    if (change instanceof ElysiaStatus) {
      return change;
    }
    const columns = dispatchColumns(change);
    const same = Object.entries(columns).every(
      ([key, value]) =>
        JSON.stringify(project[key as keyof DispatchChange] ?? null) ===
        JSON.stringify(value ?? null)
    );
    const problem = same ? alreadyWords(change) : dispatchProblem(columns);
    return problem ? refusal(400, "dispatch-set-refused", problem) : change;
  };

  /** Caw on or off, refused when he is that already. */
  const eventsSet = (project: ProjectRow, asked: AskedChange) => {
    const on = asked.events;
    if (on === null || on === undefined) {
      return refusal(400, "events", projectSettingsWords.needs.events);
    }
    if (on === project.eventsOn) {
      return refusal(400, "events", projectSettingsWords.already.events(on));
    }
    return { kind: "set_events", events: on } satisfies ProjectSettingChange;
  };

  /** One switch of the person's writing on tasks, refused when it is that already. */
  const writingSet = (
    project: ProjectRow,
    asked: AskedChange & {
      kind: "set_hears_tasks" | "set_attempts_hear_comments";
    }
  ) => {
    const { needs, already } = projectSettingsWords;
    if (asked.kind === "set_hears_tasks") {
      const on = asked.hears_tasks;
      if (on === null || on === undefined) {
        return refusal(400, "hears-tasks", needs.hearsTasks);
      }
      if (on === project.hearsTasks) {
        return refusal(400, "hears-tasks", already.hearsTasks(on));
      }
      return {
        kind: asked.kind,
        hearsTasks: on,
      } satisfies ProjectSettingChange;
    }
    const on = asked.attempts_hear_comments;
    if (on === null || on === undefined) {
      return refusal(400, "attempts-hear-comments", needs.attemptsHearComments);
    }
    if (on === project.attemptsHearComments) {
      return refusal(
        400,
        "attempts-hear-comments",
        already.attemptsHearComments(on)
      );
    }
    return {
      kind: asked.kind,
      attemptsHearComments: on,
    } satisfies ProjectSettingChange;
  };

  /** An account by its name among the fleet's; null: none. */
  const accountName = (id: string | null): string | null => {
    const all = accounts();
    const account = id ? all.find((one) => one.id === id) : undefined;
    if (!account) {
      return id;
    }
    return accountNameAmong(account, all);
  };

  /** The account its sessions start on, checked as the person's own edit is, refused when it is that already. */
  const accountSet = (project: ProjectRow, asked: AskedChange) => {
    if (asked.account === undefined) {
      return refusal(400, "account-set-refused", projectAccountWords.needs);
    }
    const change = accountChange(project, asked.account, accounts());
    if (change instanceof ElysiaStatus) {
      return change;
    }
    if (!change) {
      return refusal(
        400,
        "already",
        projectAccountWords.already(accountName(project.account))
      );
    }
    return {
      kind: "set_account",
      account: change.account,
      name: accountName(change.account),
    } satisfies ProjectSettingChange;
  };

  /** What its sessions on its account do at that account's limit, refused when it is that already. */
  const atLimitSet = (project: ProjectRow, asked: AskedChange) => {
    const atLimit = asked.at_limit;
    if (atLimit === null || atLimit === undefined) {
      return refusal(
        400,
        "at-limit-set-refused",
        projectAccountWords.atLimit.needs
      );
    }
    if (atLimit === project.accountAtLimit) {
      return refusal(
        400,
        "already",
        projectAccountWords.atLimit.already(atLimit)
      );
    }
    return {
      kind: "set_account_at_limit",
      atLimit,
    } satisfies ProjectSettingChange;
  };

  /** The area it is put in, by id or name, or none; refused when it is there already. */
  const areaSet = (project: ProjectRow, asked: AskedChange) => {
    const { area: wanted } = asked;
    if (wanted === undefined) {
      return refusal(400, "area-set-refused", areaWords.needs);
    }
    const area = wanted === null ? null : areas.named(wanted);
    if (area === undefined && wanted !== null) {
      return refusal(
        400,
        "unknown-area",
        areaWords.unknown(wanted, areas.names())
      );
    }
    const id = area?.id ?? null;
    if (id === project.areaId) {
      return refusal(400, "already", areaWords.already(area?.name ?? null));
    }
    return {
      kind: "set_area",
      area: id,
      name: area?.name ?? null,
    } satisfies ProjectSettingChange;
  };

  /** One asked change, checked against the project as it stands, as the hub stores it. */
  const grantChange = (project: ProjectRow, asked: AskedChange) => {
    const name = asked.connection?.trim();
    if (!name) {
      return refusal(
        400,
        "grant-connection-names-connection",
        "grant_connection names the connection."
      );
    }
    let view: ReturnType<Connections["get"]>;
    try {
      view = connections.get(name);
    } catch {
      return refusal(
        400,
        "no-connection",
        projectSettingsWords.noConnection(name, grantable(project))
      );
    }
    if (view.projects.includes(project.id)) {
      return refusal(
        400,
        "granted-project-already",
        `${name} is granted to this project already.`
      );
    }
    return {
      kind: "grant_connection",
      connection: name,
      service: view.service,
      account: view.account,
    } satisfies ProjectSettingChange;
  };

  const linkChange = (project: ProjectRow, asked: AskedChange) => {
    const github = asked.github?.trim() ?? "";
    if (!GITHUB_REPO.test(github)) {
      return refusal(
        400,
        "link-repo-takes-github",
        "link_repo takes the GitHub repository as owner/name."
      );
    }
    const refused = linkable(project, `github.com/${github}`);
    if (refused instanceof ElysiaStatus) {
      return refused;
    }
    return { kind: "link_repo", github } satisfies ProjectSettingChange;
  };

  const checked = async (project: ProjectRow, asked: AskedChange) => {
    switch (asked.kind) {
      case "grant_connection":
        return grantChange(project, asked);
      case "link_repo":
        return linkChange(project, asked);
      case "create_repo":
        return await publish.read(project, asked);
      case "set_runs_on":
        return runsOnChange(project, asked.runs_on);
      case "rename":
        return renamed(project, asked);
      case "set_review":
        return reviewSet(project, asked);
      case "set_dispatch":
      case "set_max_attempts":
      case "set_review_limit":
      case "set_budget":
        return dispatchSet(project, { ...asked, kind: asked.kind });
      case "set_events":
        return eventsSet(project, asked);
      case "set_hears_tasks":
      case "set_attempts_hear_comments":
        return writingSet(project, { ...asked, kind: asked.kind });
      case "set_account":
        return accountSet(project, asked);
      case "set_account_at_limit":
        return atLimitSet(project, asked);
      case "set_area":
        return areaSet(project, asked);
      case "set_lands":
        break;
      default:
        return unhandled("project setting", asked.kind);
    }
    const to = asked.lands;
    if (to === null || to === undefined) {
      return refusal(
        400,
        "set-lands-names-main",
        "set_lands names main, branch or pr."
      );
    }
    if (project.lands === to) {
      return refusal(
        400,
        "projects-work-lands-already",
        `This project's work lands on ${to} already.`
      );
    }
    return { kind: "set_lands", lands: to } satisfies ProjectSettingChange;
  };

  /** Every change checked, else the first refusal; two changes of one kind are refused. */
  const checkAll = async (project: ProjectRow, asked: AskedChange[]) => {
    const kinds = new Set(
      asked.map((one) => `${one.kind}:${one.connection ?? ""}`)
    );
    if (kinds.size !== asked.length) {
      return refusal(400, "name-each-change-once", "Name each change once.");
    }
    const out: ProjectSettingChange[] = [];
    for (const one of asked) {
      const answered = await checked(project, one);
      if (answered instanceof ElysiaStatus) {
        return answered;
      }
      out.push(answered);
    }
    return out;
  };

  /** Applies one checked change through its setting's own code path; answers what the note says of it. */
  /** A change of the project's own fields (project-edit.ts), made: its note, or its refusal. */
  const editSaid = async (
    change: ProjectSettingChange,
    projectId: string,
    asked: Parameters<typeof edit>[1]
  ) => {
    const edited = await edit(projectId, asked);
    return edited instanceof ElysiaStatus
      ? edited
      : [projectSettingWords(change)];
  };

  const applyOne = async (
    project: ProjectRow,
    change: ProjectSettingChange
  ) => {
    switch (change.kind) {
      case "grant_connection": {
        const view = connections.get(change.connection);
        await connections.update(change.connection, {
          projects: [...view.projects, project.id],
        });
        break;
      }
      case "link_repo":
        db.addProjectLink(project.id, `github.com/${change.github}`);
        break;
      case "rename":
        return await editSaid(change, project.id, { name: change.name });
      case "set_review":
        return await editSaid(change, project.id, { review: change.review });
      case "create_repo": {
        // A publish links what it made, as its repository's copy.
        const published = await publish.publish(project, change);
        if (published instanceof ElysiaStatus) {
          return published;
        }
        const { full, from } = published;
        const refused2 = linkable(project, `github.com/${full}`);
        if (refused2 instanceof ElysiaStatus) {
          return refused2;
        }
        db.addProjectLink(
          project.id,
          `github.com/${full}`,
          hubRepoSegment(from)
        );
        return [
          projectSettingWords(change),
          projectSettingWords({ kind: "link_repo", github: full }),
        ] satisfies string[];
      }
      case "set_runs_on":
      case "set_dispatch":
      case "set_max_attempts":
      case "set_review_limit":
      case "set_budget": {
        const configured = await dispatch.configure(
          project.id,
          dispatchColumns(change)
        );
        if (configured instanceof ElysiaStatus) {
          return configured;
        }
        break;
      }
      case "set_events":
        caw(project.id, { on: change.events });
        break;
      case "set_hears_tasks":
        caw(project.id, { hearsTasks: change.hearsTasks });
        break;
      case "set_attempts_hear_comments":
        caw(project.id, { attemptsHearComments: change.attemptsHearComments });
        break;
      case "set_account": {
        const answered = await edit(project.id, {
          account: change.account,
        });
        if (answered instanceof ElysiaStatus) {
          return answered;
        }
        const { conversation } = answered;
        return [
          projectSettingWords(change),
          ...(conversation
            ? [projectAccountWords.conversation(conversation)]
            : []),
        ] satisfies string[];
      }
      case "set_account_at_limit":
        return await editSaid(change, project.id, {
          accountAtLimit: change.atLimit,
        });
      case "set_area": {
        const placed = await areas.place(project.id, change.area);
        return placed instanceof ElysiaStatus
          ? placed
          : [projectSettingWords(change), ...placed.said];
      }
      case "set_lands":
        return await editSaid(change, project.id, { lands: change.lands });
      default:
        unhandled("project setting", change);
    }
    return [projectSettingWords(change)] satisfies string[];
  };

  /** Applies checked changes, each before the next. */
  const apply = async (
    project: ProjectRow,
    changes: ProjectSettingChange[]
  ) => {
    const said: string[] = [];
    for (const change of changes) {
      const answered2 = await applyOne(project, change);
      if (answered2 instanceof ElysiaStatus) {
        return answered2;
      }
      said.push(...answered2);
    }
    console.log(`[project-settings] ${project.name}: ${said.join("; ")}`);
    return said;
  };

  const reasonOf = (raw: string | undefined) => {
    const reason = raw?.trim();
    if (!reason) {
      return refusal(400, "say-why-one-sentence", "Say why, in one sentence.");
    }
    if (reason.length > REASON_LIMIT) {
      return refusal(
        400,
        "say-why-one-sentence",
        `Say why in one sentence, under ${REASON_LIMIT} characters.`
      );
    }
    return reason;
  };

  /** What the note says of it: each change, what a publish took and left out, then why. */
  const noteBody = (
    lines: string[],
    changes: ProjectSettingChange[],
    reason: string
  ) => {
    const published = changes.flatMap((one) =>
      one.kind === "create_repo" ? [publishedWords(one)] : []
    );
    return `${lines.map((line) => `- ${line}`).join("\n")}${
      published.length > 0 ? `\n\n${published.join("\n")}` : ""
    }${reason ? `\n\nWhy: ${reason}` : ""}`;
  };

  /**
   * Asked and approved: checked again against the project as it is now,
   * then applied. A publish keeps what its card said it left out: the
   * place's first commit was made as the card was, so a read now finds
   * nothing left to leave out.
   */
  const approved = async (
    actor: InstanceRow,
    asked: AskedChange[],
    reason: string,
    card: readonly ProjectSettingChange[]
  ) => {
    const fresh = ownProject(actor);
    if (fresh instanceof ElysiaStatus) {
      return fresh;
    }
    const shown = card.find((one) => one.kind === "create_repo");
    const answered3 = await checkAll(fresh, asked);
    if (answered3 instanceof ElysiaStatus) {
      return answered3;
    }
    const changes = answered3.map((one) =>
      one.kind === "create_repo" && shown?.kind === "create_repo"
        ? { ...one, leftOut: shown.leftOut }
        : one
    );
    const said = await apply(fresh, changes);
    if (said instanceof ElysiaStatus) {
      return said;
    }
    note(actor, {
      title: "You approved a project setting",
      body: noteBody(said, changes, reason),
      event: { kind: "project", what: "settings-approved", name: fresh.name },
    });
    return said;
  };

  /** The project's settings as they stand, and what dispatch would do now. */
  const read = async (project: ProjectRow) => {
    const now = await dispatch.view(project.id);
    if (now instanceof ElysiaStatus) {
      return now;
    }
    const area = project.areaId
      ? (areas.named(project.areaId)?.name ?? null)
      : null;
    const from = (source: SettingSource) => areaWords.source(source, area);
    const { cap, cawMode, onCap } = project.inEffect;
    const folder = await inEffect(project);
    return projectSettingsWords.read({
      name: project.name,
      area,
      account: accountName(project.inEffect.account.value),
      accountAtLimit: project.inEffect.accountAtLimit.value,
      accountFrom: from(project.inEffect.account.from),
      cawMode: {
        value: cawMode.value ?? "the mode last chosen on its machine",
        from: from(cawMode.from),
      },
      cap: {
        value: cap.value ? `$${cap.value.usd} a ${cap.value.period}` : "none",
        from: from(cap.from),
      },
      onCap: { value: onCap.value, from: from(onCap.from) },
      decides: folder.decides.map(
        (one) => `${one.kind}: ${one.member} (${from(one.from)})`
      ),
      types: folder.types.map((one) => `${one.name} (${from(one.from)})`),
      events: project.eventsOn,
      hearsTasks: project.hearsTasks,
      attemptsHearComments: project.attemptsHearComments,
      dispatch: now.dispatch,
      maxAttempts: now.maxAttempts,
      reviewLimit: now.reviewLimit,
      budget: now.budget,
      lands: now.lands,
      runsOn: now.runsOn,
      review: project.review,
      links: project.links,
      connections: connections.list().flatMap((view) => {
        if (view.projects.includes(project.id)) {
          return [`${view.name} (${from("project")})`];
        }
        return project.areaId && view.areas.includes(project.areaId)
          ? [`${view.name} (${from("area")})`]
          : [];
      }),
      live: now.live,
      reviewing: now.review,
      paused: now.paused,
      frontier: now.frontier,
    });
  };

  /** The call: a read with no changes; else checked, then applied at once, or asked about first; answers what was done. */
  const changeSettings = async (
    actor: InstanceRow,
    input: z.infer<typeof definition>,
    toolUseId: string | undefined
  ) => {
    const project = ownProject(actor, input.project);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    if (!input.changes) {
      return await read(project);
    }
    const reason = reasonOf(input.reason);
    if (reason instanceof ElysiaStatus) {
      return reason;
    }
    const changes = await checkAll(project, input.changes);
    if (changes instanceof ElysiaStatus) {
      return changes;
    }
    // Creating a remote and pushing reach outside, and whether work waits
    // for the person's review is theirs to choose: always the person's.
    const asking =
      input.ask === true ||
      changes.some(
        (one) => one.kind === "create_repo" || one.kind === "set_review"
      );
    if (!asking) {
      const said = await apply(project, changes);
      if (said instanceof ElysiaStatus) {
        return said;
      }
      note(actor, {
        title: `${boardTitle(actor)} changed this project's settings`,
        body: noteBody(said, changes, reason),
        event: {
          kind: "project",
          what: "settings-changed",
          name: project.name,
        },
      });
      return `Applied: ${said.join("; ")}. It is noted in the project's conversation.`;
    }
    const recorded = await ask(
      actor,
      { changes, reason, project: project.name },
      toolUseId
    );
    if (recorded !== undefined) {
      return recorded;
    }
    const said = await approved(actor, input.changes, reason, changes);
    if (said instanceof ElysiaStatus) {
      return said;
    }
    return `The person approved it, and it applied: ${said.join("; ")}.`;
  };

  /** `project_settings`, bound to the calling session and its call; with none, its listing. */
  const definitionFor = (
    actor: InstanceRow | undefined,
    toolUseId?: string
  ): McpTool =>
    tool(
      PROJECT_SETTINGS,
      DESCRIPTION,
      definition.shape,
      (input) => {
        if (!actor) {
          return Promise.reject(new Error("Discovery cannot execute tools"));
        }
        return changeSettings(actor, input, toolUseId);
      },
      sentence,
      { inputHelp: INPUT_HELP }
    );

  /** The card's changes, as the ask's input holds them, checked then. */
  const cardOf = (input: Record<string, unknown>): ProjectSettingChange[] =>
    (Array.isArray(input.changes)
      ? input.changes
      : []) as ProjectSettingChange[];

  /** The asker's own words on why, as the ask's input holds them. */
  const reasonIn = (input: Record<string, unknown>): string =>
    typeof input.reason === "string" ? input.reason : "";

  /** An approved ask (asks.ts `carryOut`): applied for its asker now. */
  const runApproved = async (
    actor: InstanceRow,
    input: Record<string, unknown>
  ) => {
    // The ask's input carries the card's changes, as checked then: each
    // is checked again as the tool takes it.
    const card = cardOf(input);
    const said = await approved(
      actor,
      card.map(askedOf),
      reasonIn(input),
      card
    );
    if (said instanceof ElysiaStatus) {
      return said;
    }
    return `Applied: ${said.join("; ")}.`;
  };

  /** A declined ask (asks.ts `carryOut`): noted in the project's conversation, nothing applied. */
  const runDeclined = (
    actor: InstanceRow,
    input: Record<string, unknown>
  ): void => {
    const card = cardOf(input);
    note(actor, {
      title: "You declined a project setting",
      body: noteBody(card.map(projectSettingWords), card, reasonIn(input)),
      event: {
        kind: "project",
        what: "settings-declined",
        name: typeof input.project === "string" ? input.project : "",
      },
    });
  };

  return {
    tool: definitionFor,
    runApproved,
    runDeclined,
    definition: definitionFor(undefined),
  };
};

export type ProjectSettings = ReturnType<typeof createProjectSettings>;
