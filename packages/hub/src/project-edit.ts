/**
 * A project's name, its Review before done, where its work lands and the
 * account its sessions start on, changed by the person (`PATCH
 * /api/projects/:id`, the project head's details tray, the setup page's
 * `account`) or by its Caw (`project_settings` `rename`, `set_review`,
 * `set_lands`, `set_account`): one check and one write for all. Where work lands is a dispatch
 * setting, written by the dispatcher's own `configure` (`lands`), so the
 * dispatcher looks at the project again as it changes. Where its large
 * files live (`lfs`) is the person's alone: an LFS endpoint bound to a
 * fleet connection, which every git-lfs run on a machine for the project is
 * held to with that connection's key (agent host-lfs.ts). The change reaches
 * every dashboard and the app at once: `projects.changed` makes each read
 * the projects again, and a review change is a change to the stages the hub
 * applies, so the project's boards read its tasks and stages again too.
 *
 * Names are not unique: a project is known by its id, and the hub makes two
 * projects of one name as readily (`POST /api/projects`).
 */

import {
  type Account,
  accountNameAmong,
  PROJECT_AT_LIMIT,
  type ProjectAtLimit,
} from "@cawco/core/accounts";
import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
import { projectAccountWords } from "@cawco/core/words/project-account";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import { StatusRefusal } from "./refusal";

/** As long as a name `POST /api/projects` takes. */
const PROJECT_NAME_LIMIT = 200;
// biome-ignore lint/suspicious/noControlCharactersInRegex: a name is one line of text, so control characters are what it refuses
const CONTROL = /[\u0000-\u001f\u007f]/u;

export interface ProjectEdit {
  /**
   * The account the sessions it starts run on when a start names none, by
   * id, nickname or email (placement.ts `projectAccount`); null: the
   * fleet's routing.
   */
  account?: string | null;
  /** What its sessions on that account do at its limit (placement.ts `runningAccounts`). */
  accountAtLimit?: ProjectAtLimit;
  /** Where its attempts land when their task says nothing. */
  lands?: LandsMode;
  /**
   * Where its large files live: an LFS endpoint (or the clone URL of the
   * repository whose LFS it is) and the connection whose key signs in
   * there; null: each repository's own origin's LFS.
   */
  lfs?: { connection: string; url: string } | null;
  name?: string;
  review?: boolean;
}

/** A change the hub refuses, in a sentence the person reads under the field. */
export class ProjectEditRefusal extends StatusRefusal<400 | 404> {}

/** A name as the hub keeps it: trimmed, one line, not empty, at most 200 characters. */
export const projectName = (raw: string): string => {
  const name = raw.trim();
  if (!name) {
    throw new ProjectEditRefusal(400, "A project needs a name.");
  }
  if (CONTROL.test(name)) {
    throw new ProjectEditRefusal(400, "A project's name is one line of text.");
  }
  if (name.length > PROJECT_NAME_LIMIT) {
    throw new ProjectEditRefusal(
      400,
      `A project's name is at most ${PROJECT_NAME_LIMIT} characters; this one is ${name.length}.`
    );
  }
  return name;
};

const LFS_PATH = /\/info\/lfs\/*$/u;
const TRAILING_SLASH = /\/+$/u;

/**
 * An LFS endpoint as a project declares it: an https URL with no credential
 * in it, taken as the endpoint when it ends in `/info/lfs`, else read as a
 * repository's clone URL and given the endpoint git-lfs derives from one
 * (`<url>.git/info/lfs`, lfsapi/endpoint_finder.go
 * `NewEndpointFromCloneURL`).
 */
const lfsEndpoint = (raw: string): string => {
  if (!URL.canParse(raw.trim())) {
    throw new ProjectEditRefusal(
      400,
      "Large files live at a URL: the repository's, or its LFS endpoint (…/info/lfs)."
    );
  }
  const url = new URL(raw.trim());
  if (url.protocol !== "https:") {
    throw new ProjectEditRefusal(
      400,
      "Large files live at an https URL: a connection's key never goes over plain http."
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ProjectEditRefusal(
      400,
      "Give the URL alone: the connection signs in, so it carries no name, key or query."
    );
  }
  const plain = url.toString().replace(TRAILING_SLASH, "");
  if (LFS_PATH.test(url.pathname)) {
    return plain;
  }
  return plain.endsWith(".git") ? `${plain}/info/lfs` : `${plain}.git/info/lfs`;
};

export interface ProjectEditsDeps {
  /** The fleet's accounts, every provider's. */
  readonly accounts: () => Account[];
  /**
   * Its running conversation moved onto the account it starts its sessions
   * on now, as a person's move of a session is (limit-moves.ts `moveByHand`):
   * what became of it in a sentence; undefined when it has none to move.
   */
  readonly conversationTo: (project: ProjectRow) => Promise<string | undefined>;
  readonly db: Pick<DbShape, "project" | "setProjectDetails">;
  /** Where its work lands, through the dispatch settings' own path (dispatch.ts `configure`). */
  readonly lands: (projectId: string, lands: LandsMode) => Promise<unknown>;
  /** Why a connection cannot sign in to a declared LFS endpoint; none when it can (connections.ts `lfsProblem`). */
  readonly lfsProblem: (connection: string) => string | undefined;
  /** Every dashboard and the app read the projects again. */
  readonly projectsChanged: () => void;
  /** The project's boards read its tasks and stages again (tasks.ts `touched`). */
  readonly stagesChanged: (projectId: string) => void;
}

/** The Large files setting as the row keeps it, checked; undefined when not asked or not changed. */
const lfsChange = (
  project: ProjectRow,
  asked: ProjectEdit["lfs"],
  lfsProblem: ProjectEditsDeps["lfsProblem"]
): Pick<ProjectRow, "lfsConnection" | "lfsUrl"> | undefined => {
  if (asked === undefined) {
    return;
  }
  if (asked === null) {
    return project.lfsUrl === null && project.lfsConnection === null
      ? undefined
      : { lfsUrl: null, lfsConnection: null };
  }
  const lfsUrl = lfsEndpoint(asked.url);
  const lfsConnection = asked.connection.trim();
  const why = lfsConnection
    ? lfsProblem(lfsConnection)
    : "Name the connection that signs in there.";
  if (why) {
    throw new ProjectEditRefusal(400, why);
  }
  return lfsUrl === project.lfsUrl && lfsConnection === project.lfsConnection
    ? undefined
    : { lfsUrl, lfsConnection };
};

/** The accounts `asked` names: the one of that id, else those of that nickname, else of that email. */
const accountsAsked = (accounts: Account[], asked: string): Account[] => {
  const byId = accounts.find((one) => one.id === asked);
  if (byId) {
    return [byId];
  }
  const lower = asked.toLowerCase();
  const byLabel = accounts.filter((one) => one.label?.toLowerCase() === lower);
  return byLabel.length > 0
    ? byLabel
    : accounts.filter((one) => one.email?.toLowerCase() === lower);
};

/**
 * The account asked, by id, nickname or email among every provider's, as a
 * spawn's `account` names one (placement.ts `picked`), or refused
 * naming the fleet's accounts; one the project's own account list leaves
 * out is refused too.
 */
export const accountChange = (
  project: ProjectRow,
  asked: ProjectEdit["account"],
  accounts: Account[]
): Pick<ProjectRow, "account"> | undefined => {
  if (asked === undefined) {
    return;
  }
  const raw = asked?.trim() ?? "";
  if (!raw) {
    return project.account === null ? undefined : { account: null };
  }
  const matches = accountsAsked(accounts, raw);
  const [account] = matches;
  if (!account) {
    throw new ProjectEditRefusal(
      400,
      projectAccountWords.noAccount(
        raw,
        accounts.map((one) => accountNameAmong(one, accounts))
      )
    );
  }
  if (matches.length > 1) {
    throw new ProjectEditRefusal(
      400,
      projectAccountWords.ambiguous(
        raw,
        matches.map((one) => one.id)
      )
    );
  }
  // The project's list holds its providers' sessions alone (placement.ts `ofProvider`).
  const listed = project.accounts?.filter(
    (id) =>
      accounts.find((each) => each.id === id)?.provider === account.provider
  );
  if (listed?.length && !listed.includes(account.id)) {
    const named = (id: string) => {
      const one = accounts.find((each) => each.id === id);
      return one ? accountNameAmong(one, accounts) : id;
    };
    throw new ProjectEditRefusal(
      400,
      projectAccountWords.notAllowed(
        accountNameAmong(account, accounts),
        listed.map(named)
      )
    );
  }
  return account.id === project.account ? undefined : { account: account.id };
};

/** What `asked` changes of `project`: each field asked that differs, the name checked. */
const changeOf = (project: ProjectRow, asked: ProjectEdit): ProjectEdit => {
  const change: ProjectEdit = {};
  if (asked.name !== undefined) {
    const name = projectName(asked.name);
    if (name !== project.name) {
      change.name = name;
    }
  }
  if (asked.review !== undefined && asked.review !== project.review) {
    change.review = asked.review;
  }
  if (asked.accountAtLimit !== undefined) {
    if (!PROJECT_AT_LIMIT.includes(asked.accountAtLimit)) {
      throw new ProjectEditRefusal(400, projectAccountWords.atLimit.needs);
    }
    if (asked.accountAtLimit !== project.accountAtLimit) {
      change.accountAtLimit = asked.accountAtLimit;
    }
  }
  if (asked.lands !== undefined) {
    if (!LANDS_MODES.includes(asked.lands)) {
      throw new ProjectEditRefusal(
        400,
        `Work lands on ${LANDS_MODES.join(", ")}; ${String(asked.lands)} is none of them.`
      );
    }
    if (asked.lands !== project.lands) {
      change.lands = asked.lands;
    }
  }
  return change;
};

/** A project as an edit left it, and what became of its running conversation when its account changed. */
export interface Edited {
  /** In a sentence; absent when the account did not change, or it has no conversation to move. */
  conversation?: string;
  project: ProjectRow;
}

export const createProjectEdits = ({
  accounts,
  conversationTo,
  db,
  lands,
  lfsProblem,
  projectsChanged,
  stagesChanged,
}: ProjectEditsDeps) => ({
  /**
   * Checks and applies a change to a project's name, Review before done,
   * landing, large files and account; answers the project as it is now,
   * and, when its account changed, what became of its running
   * conversation. Nothing asked is refused.
   */
  async edit(projectId: string, asked: ProjectEdit): Promise<Edited> {
    const project = db.project(projectId);
    if (!project) {
      throw new ProjectEditRefusal(
        404,
        "This project is no longer recorded. Refresh."
      );
    }
    if (
      asked.name === undefined &&
      asked.review === undefined &&
      asked.lands === undefined &&
      asked.lfs === undefined &&
      asked.account === undefined &&
      asked.accountAtLimit === undefined
    ) {
      throw new ProjectEditRefusal(
        400,
        "Name what changes: the project's name, whether it reviews before done, where its work lands, where its large files live, the account its sessions start on, or what they do at its limit."
      );
    }
    const {
      lands: landsTo,
      lfs: _lfs,
      account: _account,
      ...asks
    } = changeOf(project, asked);
    const details = {
      ...asks,
      ...lfsChange(project, asked.lfs, lfsProblem),
      ...accountChange(project, asked.account, accounts()),
    };
    if (Object.keys(details).length === 0 && landsTo === undefined) {
      return { project };
    }
    if (Object.keys(details).length > 0) {
      db.setProjectDetails(projectId, details);
    }
    if (landsTo !== undefined) {
      await lands(projectId, landsTo);
    }
    projectsChanged();
    if (details.review !== undefined) {
      stagesChanged(projectId);
    }
    const now = db.project(projectId) ?? project;
    // Sessions started from now start on it; its conversation, the one
    // session that lives on, moves to it as a person's move would.
    const conversation =
      details.account === undefined ? undefined : await conversationTo(now);
    return { project: now, ...(conversation ? { conversation } : {}) };
  },
});
