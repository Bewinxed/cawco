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
  type DispatchView,
  dispatchProblem,
} from "./dispatch";
import { boardTitle } from "./labels";
import { type McpTool, sentence, tool } from "./mcp-tool";
import {
  accountChange,
  type Edited,
  type ProjectEdit,
  projectName,
} from "./project-edit";
import type { RepoPublish } from "./repo-publish";
import { runsOnValue } from "./runs-on";
import { budgetParameter } from "./task-tools";

const GITHUB_REPO =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/u;
const REASON_LIMIT = 300;

/** A refusal in one sentence: the call's error. */
const refuse = (message: string): never => {
  throw new Error(message);
};

/** A rename, checked as the person's own is (project-edit.ts `projectName`). */
const renamed = (
  project: ProjectRow,
  asked: { name?: string }
): ProjectSettingChange => {
  const name = projectName(asked.name ?? "");
  if (name === project.name) {
    refuse(`This project is called ${name} already.`);
  }
  return { kind: "rename", name };
};

/** Review before done turned on or off, refused when it is that already. */
const reviewSet = (
  project: ProjectRow,
  asked: { review?: boolean }
): ProjectSettingChange => {
  const review =
    asked.review ?? refuse("set_review says on (true) or off (false).");
  if (review === project.review) {
    refuse(
      `Review before done is ${review ? "on" : "off"} for this project already.`
    );
  }
  return { kind: "set_review", review };
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
): DispatchSetting => {
  const { needs } = projectSettingsWords;
  switch (asked.kind) {
    case "set_dispatch":
      return {
        kind: asked.kind,
        dispatch: asked.dispatch ?? refuse(needs.dispatch),
      };
    case "set_max_attempts":
      return {
        kind: asked.kind,
        maxAttempts: asked.max_attempts ?? refuse(needs.maxAttempts),
      };
    case "set_review_limit":
      return {
        kind: asked.kind,
        reviewLimit: asked.review_limit ?? refuse(needs.reviewLimit),
      };
    case "set_budget": {
      const budget =
        asked.budget === undefined ? refuse(needs.budget) : asked.budget;
      // Empty clears it, as null does (dispatch.ts `columnsOf`).
      return {
        kind: asked.kind,
        budget: budget && Object.keys(budget).length > 0 ? budget : null,
      };
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
  readonly dispatch: {
    configure: (projectId: string, change: DispatchChange) => Promise<unknown>;
    view: (projectId: string) => Promise<DispatchView>;
  };
  /**
   * The project's name, Review before done, default landing and account,
   * through the person's own edit (project-edit.ts).
   */
  readonly edit: (
    projectId: string,
    change: ProjectEdit
  ) => Promise<Pick<Edited, "conversation">>;
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
  const ownProject = (actor: InstanceRow, named?: string): ProjectRow => {
    const project = actor.projectId ? db.project(actor.projectId) : undefined;
    if (!project) {
      return refuse(
        "project_settings changes this session's project, and this session is in none."
      );
    }
    const asked = named?.trim().toLowerCase();
    if (
      asked &&
      asked !== project.id.toLowerCase() &&
      asked !== project.name.trim().toLowerCase()
    ) {
      return refuse(
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
  const linkable = (project: ProjectRow, remote: string): void => {
    if (project.links.includes(remote)) {
      refuse(`This project is linked to ${remote} already.`);
    }
    const other = db.projectByRemote(remote);
    if (other && other.id !== project.id) {
      refuse(`${remote} is the project “${other.name}”'s repository.`);
    }
  };

  /** Where the project's attempts run, checked against the fleet (runs-on.ts); null or empty: any machine. */
  const runsOnChange = (
    project: ProjectRow,
    asked: string | null | undefined
  ): ProjectSettingChange => {
    if (asked === undefined) {
      refuse("set_runs_on names runs_on: apple, linux, a machine, or null.");
    }
    let to: string | null = null;
    if (asked?.trim()) {
      const value = runsOnValue(asked, db.listAgents());
      to = "value" in value ? value.value : refuse(value.problem);
    }
    const change: DispatchSetting = { kind: "set_runs_on", runsOn: to };
    return project.runsOn === to ? refuse(alreadyWords(change)) : change;
  };

  /**
   * A dispatch setting but where work lands or runs, checked by the
   * dashboard's own rule (dispatch.ts `dispatchProblem`) and refused when it
   * is that already.
   */
  const dispatchSet = (
    project: ProjectRow,
    asked: Parameters<typeof dispatchAsked>[0]
  ): ProjectSettingChange => {
    const change = dispatchAsked(asked);
    const columns = dispatchColumns(change);
    const same = Object.entries(columns).every(
      ([key, value]) =>
        JSON.stringify(project[key as keyof DispatchChange] ?? null) ===
        JSON.stringify(value ?? null)
    );
    const problem = same ? alreadyWords(change) : dispatchProblem(columns);
    return problem ? refuse(problem) : change;
  };

  /** Caw on or off, refused when he is that already. */
  const eventsSet = (
    project: ProjectRow,
    asked: AskedChange
  ): ProjectSettingChange => {
    const on = asked.events ?? refuse(projectSettingsWords.needs.events);
    if (on === project.eventsOn) {
      refuse(projectSettingsWords.already.events(on));
    }
    return { kind: "set_events", events: on };
  };

  /** One switch of the person's writing on tasks, refused when it is that already. */
  const writingSet = (
    project: ProjectRow,
    asked: AskedChange & {
      kind: "set_hears_tasks" | "set_attempts_hear_comments";
    }
  ): ProjectSettingChange => {
    const { needs, already } = projectSettingsWords;
    if (asked.kind === "set_hears_tasks") {
      const on = asked.hears_tasks ?? refuse(needs.hearsTasks);
      if (on === project.hearsTasks) {
        refuse(already.hearsTasks(on));
      }
      return { kind: asked.kind, hearsTasks: on };
    }
    const on =
      asked.attempts_hear_comments ?? refuse(needs.attemptsHearComments);
    if (on === project.attemptsHearComments) {
      refuse(already.attemptsHearComments(on));
    }
    return { kind: asked.kind, attemptsHearComments: on };
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
  const accountSet = (
    project: ProjectRow,
    asked: AskedChange
  ): ProjectSettingChange => {
    if (asked.account === undefined) {
      refuse(projectAccountWords.needs);
    }
    const change = accountChange(project, asked.account, accounts());
    if (!change) {
      return refuse(projectAccountWords.already(accountName(project.account)));
    }
    return {
      kind: "set_account",
      account: change.account,
      name: accountName(change.account),
    };
  };

  /** What its sessions on its account do at that account's limit, refused when it is that already. */
  const atLimitSet = (
    project: ProjectRow,
    asked: AskedChange
  ): ProjectSettingChange => {
    const atLimit = asked.at_limit ?? refuse(projectAccountWords.atLimit.needs);
    if (atLimit === project.accountAtLimit) {
      refuse(projectAccountWords.atLimit.already(atLimit));
    }
    return { kind: "set_account_at_limit", atLimit };
  };

  /** The area it is put in, by id or name, or none; refused when it is there already. */
  const areaSet = (
    project: ProjectRow,
    asked: AskedChange
  ): ProjectSettingChange => {
    const { area: wanted } = asked;
    if (wanted === undefined) {
      return refuse(areaWords.needs);
    }
    const area =
      wanted === null
        ? null
        : (areas.named(wanted) ??
          refuse(areaWords.unknown(wanted, areas.names())));
    const id = area?.id ?? null;
    if (id === project.areaId) {
      refuse(areaWords.already(area?.name ?? null));
    }
    return { kind: "set_area", area: id, name: area?.name ?? null };
  };

  /** One asked change, checked against the project as it stands, as the hub stores it. */
  const checked = async (
    project: ProjectRow,
    asked: AskedChange
  ): Promise<ProjectSettingChange> => {
    switch (asked.kind) {
      case "grant_connection": {
        const name =
          asked.connection?.trim() ||
          refuse("grant_connection names the connection.");
        let view: ReturnType<Connections["get"]>;
        try {
          view = connections.get(name);
        } catch {
          return refuse(
            projectSettingsWords.noConnection(name, grantable(project))
          );
        }
        if (view.projects.includes(project.id)) {
          refuse(`${name} is granted to this project already.`);
        }
        return {
          kind: "grant_connection",
          connection: name,
          service: view.service,
          account: view.account,
        };
      }
      case "link_repo": {
        const github = asked.github?.trim() ?? "";
        if (!GITHUB_REPO.test(github)) {
          refuse("link_repo takes the GitHub repository as owner/name.");
        }
        linkable(project, `github.com/${github}`);
        return { kind: "link_repo", github };
      }
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
    const to = asked.lands ?? refuse("set_lands names main, branch or pr.");
    if (project.lands === to) {
      refuse(`This project's work lands on ${to} already.`);
    }
    return { kind: "set_lands", lands: to };
  };

  /** Every change checked, else the first refusal; two changes of one kind are refused. */
  const checkAll = async (
    project: ProjectRow,
    asked: AskedChange[]
  ): Promise<ProjectSettingChange[]> => {
    const kinds = new Set(
      asked.map((one) => `${one.kind}:${one.connection ?? ""}`)
    );
    if (kinds.size !== asked.length) {
      refuse("Name each change once.");
    }
    const out: ProjectSettingChange[] = [];
    for (const one of asked) {
      out.push(await checked(project, one));
    }
    return out;
  };

  /** Applies one checked change through its setting's own code path; answers what the note says of it. */
  const applyOne = async (
    project: ProjectRow,
    change: ProjectSettingChange
  ): Promise<string[]> => {
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
        await edit(project.id, { name: change.name });
        break;
      case "set_review":
        await edit(project.id, { review: change.review });
        break;
      case "create_repo": {
        // A publish links what it made, as its repository's copy.
        const { full, from } = await publish.publish(project, change);
        linkable(project, `github.com/${full}`);
        db.addProjectLink(
          project.id,
          `github.com/${full}`,
          hubRepoSegment(from)
        );
        return [
          projectSettingWords(change),
          projectSettingWords({ kind: "link_repo", github: full }),
        ];
      }
      case "set_runs_on":
      case "set_dispatch":
      case "set_max_attempts":
      case "set_review_limit":
      case "set_budget":
        await dispatch.configure(project.id, dispatchColumns(change));
        break;
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
        const { conversation } = await edit(project.id, {
          account: change.account,
        });
        return [
          projectSettingWords(change),
          ...(conversation
            ? [projectAccountWords.conversation(conversation)]
            : []),
        ];
      }
      case "set_account_at_limit":
        await edit(project.id, { accountAtLimit: change.atLimit });
        break;
      case "set_area": {
        const placed = await areas.place(project.id, change.area);
        return placed instanceof ElysiaStatus
          ? refuse(placed.response.detail)
          : [projectSettingWords(change), ...placed.said];
      }
      case "set_lands":
        await edit(project.id, { lands: change.lands });
        break;
      default:
        unhandled("project setting", change);
    }
    return [projectSettingWords(change)];
  };

  /** Applies checked changes, each before the next. */
  const apply = async (
    project: ProjectRow,
    changes: ProjectSettingChange[]
  ): Promise<string[]> => {
    const said: string[] = [];
    for (const change of changes) {
      said.push(...(await applyOne(project, change)));
    }
    console.log(`[project-settings] ${project.name}: ${said.join("; ")}`);
    return said;
  };

  const reasonOf = (raw: string | undefined): string => {
    const reason = raw?.trim() || refuse("Say why, in one sentence.");
    if (reason.length > REASON_LIMIT) {
      refuse(`Say why in one sentence, under ${REASON_LIMIT} characters.`);
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
  ): Promise<string[]> => {
    const fresh = ownProject(actor);
    const shown = card.find((one) => one.kind === "create_repo");
    const changes = (await checkAll(fresh, asked)).map((one) =>
      one.kind === "create_repo" && shown?.kind === "create_repo"
        ? { ...one, leftOut: shown.leftOut }
        : one
    );
    const said = await apply(fresh, changes);
    note(actor, {
      title: "You approved a project setting",
      body: noteBody(said, changes, reason),
      event: { kind: "project", what: "settings-approved", name: fresh.name },
    });
    return said;
  };

  /** The project's settings as they stand, and what dispatch would do now. */
  const read = async (project: ProjectRow): Promise<string> => {
    const now = await dispatch.view(project.id);
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
  ): Promise<string> => {
    const project = ownProject(actor, input.project);
    if (!input.changes) {
      return await read(project);
    }
    const reason = reasonOf(input.reason);
    const changes = await checkAll(project, input.changes);
    // Creating a remote and pushing reach outside, and whether work waits
    // for the person's review is theirs to choose: always the person's.
    const asking =
      input.ask === true ||
      changes.some(
        (one) => one.kind === "create_repo" || one.kind === "set_review"
      );
    if (!asking) {
      const said = await apply(project, changes);
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
  ): Promise<string> => {
    // The ask's input carries the card's changes, as checked then: each
    // is checked again as the tool takes it.
    const card = cardOf(input);
    const said = await approved(
      actor,
      card.map(askedOf),
      reasonIn(input),
      card
    );
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
