/**
 * A project's Caw changes his own project's settings (`project_settings`).
 * The owner's word: "caw should be able to do whatever it wants", so the
 * lead's change applies at once, through the same code the person's own
 * change runs, and is noted in his thread with what changed. When the
 * change is one Caw judges the person should decide, he asks with `ask:
 * true`: the change parks as the person's ask in that thread (admin-asks.ts,
 * the one park-and-wait path), Approve applies it and Deny declines it, and
 * the call answers Caw either way.
 *
 * A closed set of changes, each validated before anything applies:
 * - `grant_connection`: a connection that exists joins the project's
 *   connections, as Settings › Connections' `projects` does
 *   (connections.ts `update`): every session of the project may use it.
 * - `link_repo`: the project's repository, the `remote` a checkout's
 *   `origin` would give it (server.ts `learnRemote`), set to
 *   `github.com/<owner>/<name>`: what GitHub events and pull requests read.
 *   No file in any place of the project changes; a project with a
 *   repository already, or one another project has, is refused.
 * - `set_lands`: where the project's attempts land when their task says
 *   nothing, through the person's own edit (project-edit.ts), which writes
 *   it with the dispatch settings (dispatch.ts `configure`).
 * - `set_runs_on`: where the project's attempts run when their task says
 *   nothing (runs-on.ts): a machine or a capability like `apple`, or null
 *   for any machine; through the same dispatch settings.
 * - `create_repo`: the project's place published to a new GitHub
 *   repository, then linked (repo-publish.ts). It reaches outside, so it is
 *   always asked, `ask` or not.
 * - `rename`: the project's name, checked and written as the person's own
 *   edit is (project-edit.ts). A name is a label the person can change back
 *   in a click, so it applies at once like the others.
 * - `set_review`: Review before done on or off (project-edit.ts). Whether
 *   every task waits for the person before done is the person's choice
 *   either way (on routes work through them, off takes away a look they
 *   chose), so it is always asked, `ask` or not.
 * Only Caw's own project: naming another is refused. What its work's
 * landing gate runs is the project's gate.md (gate-file.ts), not a setting.
 */
import {
  type InstanceRow,
  type ProjectLands,
  type ProjectSettingChange,
  projectSettingWords,
  publishedWords,
  type ThreadNote,
} from "@cawco/core";
import { PROJECT_SETTINGS } from "@cawco/core/long-calls";
import { z } from "zod";
import type { Connections } from "./connections";
import type { DbShape, ProjectRow } from "./db";
import { type McpTool, sentence, tool } from "./mcp-tool";
import { type ProjectEdit, projectName } from "./project-edit";
import type { RepoPublish } from "./repo-publish";
import { roleOf } from "./roles";
import { runsOnValue } from "./runs-on";

const GITHUB_REPO =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const REASON_LIMIT = 300;
const LANDS: readonly ProjectLands[] = ["main", "branch", "pr"];

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
  kind: z.enum([
    "grant_connection",
    "link_repo",
    "set_lands",
    "set_runs_on",
    "create_repo",
    "rename",
    "set_review",
  ]),
  connection: z.string().optional(),
  github: z.string().optional().describe("owner/name"),
  lands: z.enum(LANDS as [ProjectLands, ...ProjectLands[]]).optional(),
  runs_on: z.string().nullable().optional(),
  name: z.string().optional(),
  private: z.boolean().optional(),
  review: z.boolean().optional(),
});
type AskedChange = z.infer<typeof ASKED_CHANGE>;

const definition = z.object({
  changes: z.array(ASKED_CHANGE).min(1).max(3),
  reason: z.string(),
  ask: z.boolean().optional(),
  project: z.string().optional(),
});

const DESCRIPTION =
  "Change your project's settings, noted in the thread; ask: true asks the person first (create_repo and set_review always do).";

/** What a malformed call is told, after what it got wrong. */
const INPUT_HELP =
  "changes is a list of grant_connection, link_repo, set_lands, set_runs_on, create_repo, rename or set_review, and reason one sentence.";

export interface ProjectSettingsDeps {
  /** Parks the change as the person's ask in Caw's thread and waits; rejects with their refusal (admin-asks.ts). */
  readonly ask: (
    actor: InstanceRow,
    input: Record<string, unknown>,
    toolUseId: string | undefined
  ) => Promise<void>;
  readonly connections: Pick<Connections, "get" | "update">;
  readonly db: Pick<
    DbShape,
    "listAgents" | "project" | "projectByRemote" | "setProjectRemote"
  >;
  /**
   * The project's name, Review before done, Apple build gate and default
   * landing, through the person's own edit (project-edit.ts).
   */
  readonly edit: (projectId: string, change: ProjectEdit) => Promise<unknown>;
  /** Notes what happened in the thread Caw's turn answers (caw.ts `askThread`, `notice`). */
  readonly note: (actor: InstanceRow, note: ThreadNote) => void;
  /** A place published to a new GitHub repository (repo-publish.ts). */
  readonly publish: Pick<RepoPublish, "publish" | "read">;
  /** Where the project's attempts run, through the dispatch settings' own path. */
  readonly runsOn: (
    projectId: string,
    runsOn: string | null
  ) => Promise<unknown>;
}

export const createProjectSettings = ({
  ask,
  connections,
  db,
  edit,
  note,
  publish,
  runsOn,
}: ProjectSettingsDeps) => {
  /** Caw's own project, and nothing else: the caller must be its lead, and `named` (id or name) must be it. */
  const ownProject = (actor: InstanceRow, named?: string): ProjectRow => {
    const project =
      roleOf(actor) === "lead" && actor.projectId
        ? db.project(actor.projectId)
        : undefined;
    if (!project) {
      return refuse(
        "project_settings changes the project you lead, and this session leads none."
      );
    }
    const asked = named?.trim();
    if (asked && asked !== project.id && asked !== project.name) {
      return refuse(
        `${asked} is not your project: project_settings changes only “${project.name}”.`
      );
    }
    return project;
  };

  /** A repository link, checked against the project as it stands. */
  const linkable = (project: ProjectRow, remote: string): void => {
    if (project.remote === remote) {
      refuse(`This project is linked to ${remote} already.`);
    }
    if (project.remote) {
      refuse(
        `This project's repository is ${project.remote}, read from its checkout; it is not changed here.`
      );
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
    if (project.runsOn === to) {
      refuse(`This project's attempts run on ${to ?? "any machine"} already.`);
    }
    return { kind: "set_runs_on", runsOn: to };
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
          return refuse(`There is no connection ${name}.`);
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
      case "set_lands":
        break;
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
      // biome-ignore lint/performance/noAwaitInLoops: at most three changes, a publish's read on its machine among them
      out.push(await checked(project, one));
    }
    return out;
  };

  /** Applies one checked change through its setting's own code path; answers what the thread says of it. */
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
        db.setProjectRemote(project.id, `github.com/${change.github}`);
        break;
      case "rename":
        await edit(project.id, { name: change.name });
        break;
      case "set_review":
        await edit(project.id, { review: change.review });
        break;
      case "create_repo": {
        // A publish links what it made.
        const full = await publish.publish(project, change);
        linkable(project, `github.com/${full}`);
        db.setProjectRemote(project.id, `github.com/${full}`);
        return [
          projectSettingWords(change),
          `Link this project to github.com/${full}`,
        ];
      }
      case "set_runs_on":
        await runsOn(project.id, change.runsOn);
        break;
      case "set_lands":
        await edit(project.id, { lands: change.lands });
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
      // biome-ignore lint/performance/noAwaitInLoops: at most three changes, each applied before the next
      said.push(...(await applyOne(project, change)));
    }
    console.log(`[project-settings] ${project.name}: ${said.join("; ")}`);
    return said;
  };

  const reasonOf = (raw: string): string => {
    const reason = raw.trim() || refuse("Say why, in one sentence.");
    if (reason.length > REASON_LIMIT) {
      refuse(`Say why in one sentence, under ${REASON_LIMIT} characters.`);
    }
    return reason;
  };

  /** What the thread says of it: each change, what a publish took and left out, then why. */
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

  /** The call: checked, then applied at once, or asked about first; answers what was done. */
  const changeSettings = async (
    actor: InstanceRow,
    input: z.infer<typeof definition>,
    toolUseId: string | undefined
  ): Promise<string> => {
    const project = ownProject(actor, input.project);
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
        title: "Caw changed this project's settings",
        body: noteBody(said, changes, reason),
        event: {
          kind: "project",
          what: "settings-changed",
          name: project.name,
        },
      });
      return `Applied: ${said.join("; ")}. It is noted in the thread.`;
    }
    try {
      await ask(actor, { changes, reason, project: project.name }, toolUseId);
    } catch (declined) {
      note(actor, {
        title: "You declined a project setting",
        body: noteBody(changes.map(projectSettingWords), changes, reason),
        event: {
          kind: "project",
          what: "settings-declined",
          name: project.name,
        },
      });
      throw declined;
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

  /** An ask approved after a hub restart (admin-asks.ts `carryOut`): applied for its asker now. */
  const runApproved = async (
    actor: InstanceRow,
    input: Record<string, unknown>
  ): Promise<string> => {
    // The parked input carries the card's changes, as checked then.
    const card = (
      Array.isArray(input.changes) ? input.changes : []
    ) as ProjectSettingChange[];
    const said = await approved(
      actor,
      z.array(ASKED_CHANGE).parse(input.changes),
      typeof input.reason === "string" ? input.reason : "",
      card
    );
    return `Applied: ${said.join("; ")}.`;
  };

  return {
    tool: definitionFor,
    runApproved,
    definition: definitionFor(undefined),
  };
};

export type ProjectSettings = ReturnType<typeof createProjectSettings>;
