/**
 * The projects the hub knows (`GET /api/projects`): read on connect and
 * again on `projects.changed`, each one's cap kept by `project.cap` frames;
 * and the acts on a project, its places, its Caw, its routines and spend.
 */

import type { ProjectAtLimit } from "@cawco/core/accounts";
import type { OnCap, ProjectCap } from "@cawco/core/areas";
import { PRESENCE_HEADER } from "@cawco/core/browser-gate";
import type {
  ForgottenProject,
  ProjectRestored,
} from "@cawco/core/forgotten-project";
import type { ProjectStopFrame } from "@cawco/core/frames";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { hubRequest } from "@cawco/core/hub-request";
import type { LandsMode } from "@cawco/core/injected";
import type { PlaceProject } from "@cawco/core/place-nesting";
import {
  type CawInitiated,
  capHolds,
  type ProjectConversationView,
  type ProjectSpend,
} from "@cawco/core/project-conversation";
import type { StagesTemplate } from "@cawco/core/views";
import { projectWords } from "@cawco/core/words/project";
import { projectEndWords } from "@cawco/core/words/project-ends";
import { hub, hubPath } from "#lib/platform/hub.js";
import {
  hubData,
  hubDone,
  hubFetch,
  hubJson,
  hubRefusal,
  refusedOf,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";
import { heardFrame, heardSince, readLeaves } from "../heard";
import type { FrameOf } from "../hub/frames";
import { load } from "../hub/load";
import { rereadHub } from "../hub/socket.svelte";
import { presenceClientId } from "../presence";
import { minute } from "./clock.svelte";
import { reconcileRows } from "./same";

/**
 * Where a project's files are (place): a checkout on a machine, a
 * delegate's workspace while it lives or is held, or the project's folder on
 * the hub.
 */
export interface ProjectPlace {
  createdAt: string;
  id: string;
  /** The project's primary checkout: exactly one once it has any. */
  isPrimary: boolean;
  /** A `hub` place is the project's folder on the hub (machine `hub`, path `projects/<id>`). */
  kind: "checkout" | "hub";
  machineId: string;
  path: string;
  projectId: string;
  /** A checkout's live projects whose checkout holds it: a delete with its files takes their files there too (core place-nesting.ts). */
  within: PlaceProject[];
}

/**
 * A project the hub knows about (`GET /api/projects`). `places` holds every
 * place, its primary checkout first, then its folder on the hub; read the
 * primary with `checkoutOf` (projects.ts).
 */
export interface ProjectRow {
  /** The account its sessions start on when a start names none (hub project-edit.ts); null: the fleet's routing. */
  account: string | null;
  /** What its sessions on {@link account} do at that account's limit. */
  accountAtLimit: ProjectAtLimit;
  /** Its spend cap as it stands, kept by `project.cap` frames; null: none. */
  cap?: ProjectCap | null;
  /** The harness its Caw runs on. */
  cawHarness: HarnessKind;
  /** The model its Caw runs; null: its harness's default. */
  cawModel: string | null;
  /**
   * Its Caw's session, once the hub has started one; null before and after
   * one is retired. Read again on `projects.changed`, which the hub sends as
   * it changes (caw.ts `setLead`).
   */
  conversationInstanceId: string | null;
  createdAt: string;
  /** Its events reach its conversation (made with Caw: on). */
  eventsOn: boolean;
  id: string;
  /** Where its attempts land when their task says nothing. */
  lands: LandsMode;
  /** The connection that signs in to {@link lfsUrl}; null with it. */
  lfsConnection: string | null;
  /** Where its large files live, an LFS endpoint; null: each repository's origin's own LFS. */
  lfsUrl: string | null;
  /** Its links, one per repository, `host/owner/repo`, oldest first. */
  links: string[];
  name: string;
  places: ProjectPlace[];
  /** Its primary checkout's id; null while it has none (a New project before its place is picked). */
  primaryPlaceId: string | null;
  /** Review before done: only you move a task to done, and landed work waits in review. */
  review: boolean;
}

export const projectsState = $state({
  projects: [] as ProjectRow[],
  /** `/api/projects` has answered this page once: an empty list then means none (home FirstRun). */
  projectsRead: false,
});

export function takeProjectCap(frame: FrameOf<"project.cap">): void {
  heardFrame(`project.cap:${frame.projectId}`);
  const project = projectsState.projects.find(
    (row) => row.id === frame.projectId
  );
  if (project) {
    project.cap = frame.cap;
  }
}

export function takeProjectStop(frame: FrameOf<"project.stop">): void {
  for (const listener of projectStopListeners) {
    listener(frame);
  }
}

/**
 * The person's own edit of a project: its name, its Review before done,
 * where its work lands, or where its large files live
 * (`PATCH /api/projects/:id`). The answer lands in the
 * projects at once; the hub's `projects.changed` brings it to every other
 * dashboard and the app. Throws the refusal, in the hub's words.
 */
export async function editProject(
  projectId: string,
  change: {
    /** The account its sessions start on, by id; null: the fleet's routing. */
    account?: string | null;
    /** What its sessions on that account do at its limit. */
    accountAtLimit?: ProjectAtLimit;
    lands?: LandsMode;
    /** Where its large files live, and the connection that signs in there; null: each origin's own LFS. */
    lfs?: { connection: string; url: string } | null;
    name?: string;
    review?: boolean;
  }
): Promise<ProjectRow> {
  const asked = projectsLeave();
  const response = await hubFetch(
    hubRequest("PATCH /api/projects/:id", {
      path: { id: projectId },
      body: change,
    })
  );
  if (!response.ok) {
    throw await hubRefusal(response, projectWords.notChangedThen);
  }
  const row = (await response.json()) as ProjectRow;
  keepProject(row, asked);
  return row;
}

/** A project as the hub just answered it to the request `asked`, in the projects at once. */
function keepProject(row: ProjectRow, asked: ProjectsAsked): void {
  keepProjects(
    projectsState.projects.map((each) => (each.id === row.id ? row : each)),
    asked
  );
}

/**
 * Another checkout of the project's repository, named by hand: a machine
 * and an absolute folder on it (`POST /api/projects/:id/places`). Throws
 * the refusal in the hub's words; the project as it stands lands at once.
 */
export async function addProjectPlace(
  projectId: string,
  machineId: string,
  path: string
): Promise<ProjectRow> {
  const asked = projectsLeave();
  const response = await hubFetch(
    hubRequest("POST /api/projects/:id/places", {
      path: { id: projectId },
      body: { machineId, path },
    })
  );
  if (!response.ok) {
    throw await hubRefusal(response, projectWords.placeNotAddedThen);
  }
  const row = (await response.json()) as ProjectRow;
  keepProject(row, asked);
  return row;
}

/**
 * A place the project no longer counts (`DELETE /api/projects/:id/places/:placeId`).
 * Its folder stays on disk. The hub refuses the primary checkout and the
 * project's folder on the hub (409), in its words, thrown here.
 */
export async function removeProjectPlace(
  projectId: string,
  placeId: string
): Promise<void> {
  await hubDone(
    hub.api.projects({ id: projectId }).places({ placeId }).delete(),
    (refused) => hubRefusal(refused, projectWords.placeNotRemovedThen)
  );
  await readProjects();
}

/**
 * New project (`POST /api/projects`), made with Caw: its one place is its
 * folder on the hub until setup picks its checkout. `template` is the card
 * tapped, kept as tapped and written by nothing until the setup page is
 * sent; it carries no name (it holds the placeholder until Caw names it).
 * `prompt` starts its conversation, its first message (as the send
 * `promptId`), which sets it up. The hub answers once the project is made,
 * Caw's start carrying on: its page shows him starting and why he couldn't
 * (CawLead `starting`, `problem`). The hub's refusal is its own words.
 */
export async function createProject(project: {
  template?: StagesTemplate;
  prompt: string;
  promptId: string;
}): Promise<ProjectRow & { place: ProjectPlace }> {
  const response = await hubFetch(
    hubRequest("POST /api/projects", { body: { ...project, caw: true } })
  );
  if (!response.ok) {
    throw await hubRefusal(response, projectWords.notMadeThen);
  }
  const created = (await response.json()) as ProjectRow & {
    place: ProjectPlace;
  };
  await rereadHub();
  return created;
}

/**
 * A project from a folder on a machine (New Session's project chip): that
 * checkout its primary. A checkout of a repository a project already has
 * joins that project as a place instead; `place` is the folder asked about.
 */
export async function projectAtFolder(project: {
  name: string;
  cwd: string;
  machineId: string;
}): Promise<ProjectRow & { place: ProjectPlace; placeAdded: boolean }> {
  const response = await hubFetch(
    hubRequest("POST /api/projects", { body: project })
  );
  if (!response.ok) {
    throw await hubRefusal(response, projectWords.notSavedThen);
  }
  const created = (await response.json()) as ProjectRow & {
    place: ProjectPlace;
    placeAdded: boolean;
  };
  await rereadHub();
  return created;
}

// --- a project's conversation and views -------------------------------------

/** A project's conversation: on or off, its harness, its session, why it cannot start, its spend. */
export const cawOf = (projectId: string) =>
  hubData(hub.api.projects({ id: projectId }).caw.get(), refusedOrUnreached);

/** Turns a project's Caw on or off, or moves it to another harness or model (null: the harness's default). */
export const configureCaw = async (
  projectId: string,
  change: {
    harness?: HarnessKind;
    /** Turning him off with what he started still running: the ids that stop; the rest finish. */
    initiated?: CawInitiated;
    model?: string | null;
    on?: boolean;
  }
): Promise<ProjectConversationView> => {
  const view = await hubData(
    hub.api.projects({ id: projectId }).caw.patch(change),
    refusedOrUnreached
  );
  // The hub's answer is where he stands: the project's row says so now,
  // before the `projects.changed` it sent brings the row read again.
  const row = projectsState.projects.find(
    (project) => project.id === projectId
  );
  if (row) {
    row.eventsOn = view.on;
    row.cawHarness = view.harness;
    row.cawModel = view.model;
    row.conversationInstanceId = view.instanceId;
  }
  return view;
};

/**
 * Session `instanceId`, started in his panel, is the project's conversation
 * now (hub caw.ts `name`): the one the project's row names, which his panel
 * shows and his events reach. The answer's name stands on the row at once.
 */
/**
 * How the person's start of a project's conversation goes, as the hub says
 * every start of it goes (hub caw.ts `startOf`): where, on the project's
 * harness and model, in which mode; refused, in words, while no machine is
 * online.
 */
export const conversationStart = (projectId: string) =>
  hubData(
    hub.api.projects({ id: projectId }).caw.place.post(),
    refusedOrUnreached
  );

export const nameConversation = async (
  projectId: string,
  instanceId: string
): Promise<ProjectConversationView> => {
  const view = await hubData(
    hub.api.projects({ id: projectId }).caw.conversation.post({ instanceId }),
    refusedOrUnreached
  );
  const row = projectsState.projects.find(
    (project) => project.id === projectId
  );
  if (row) {
    row.conversationInstanceId = view.instanceId;
  }
  return view;
};

/**
 * What a routine's notice reads of it (hub routines.ts `RoutineView`): kept
 * or not, on or off.
 */
export interface RoutineState {
  enabled: boolean;
  id: string;
  keep: boolean;
  /** Null for a fleet routine. */
  projectId: string | null;
}

/** A routine as it stands now. */
export const readRoutine = (routineId: string) =>
  hubData(hub.api.routines({ id: routineId }).get(), refusedOrUnreached);

/** The fleet's connections, never their keys (`GET /api/connections`). */
export const readConnections = async () =>
  (await hubData(hub.api.connections.get(), refusedOrUnreached)).connections;

/** Keeps a routine past its 7 days, or turns it off: the routine as it stands after. */
export const changeRoutine = (
  routineId: string,
  change: { enabled?: boolean; keep?: boolean }
) =>
  hubData(
    hub.api.routines({ id: routineId }).patch(change),
    refusedOrUnreached
  );

/** "Ask Caw for a view": your words to the project's conversation, which drafts it; the session they went to. */
export const requestView = (projectId: string, text: string) =>
  hubData(
    hub.api.projects({ id: projectId })["view-requests"].post({ text }),
    refusedOrUnreached
  );

/** What a project has spent: today, this month, its conversations' share, each attempt. */
export const projectSpend = (projectId: string) =>
  hubData(hub.api.projects({ id: projectId }).spend.get(), refusedOrUnreached);

/** Sets what an attempt at the project's tasks may spend; null clears it. */
/**
 * Sets the project's spend cap — dollars a day or a month, or none — and what
 * reaching it does, its own or (null) the fleet's.
 */
export const setProjectCap = (
  projectId: string,
  change: {
    onCap: OnCap | null;
    period: "day" | "month" | null;
    usd: number | null;
  }
) =>
  hubData(
    hub.api.projects({ id: projectId }).cap.put(change),
    refusedOrUnreached
  );

/** What reaching a project's cap does where the project sets nothing. */
export const spendSettings = () =>
  hubData(hub.api["spend-settings"].get(), refusedOrUnreached);

export const setSpendSettings = (onCap: OnCap) =>
  hubData(hub.api["spend-settings"].put({ onCap }), refusedOrUnreached);

export const setProjectBudget = (
  projectId: string,
  budget: ProjectSpend["budget"]
) =>
  hubData(
    hub.api.projects({ id: projectId }).dispatch.patch({ budget }),
    refusedOrUnreached
  );

/**
 * Forgets a project: it waits in the hub's trash to be brought back
 * (`restoreProject`). The hub refuses while any of its sessions still runs
 * (409, saying how many); that answer is thrown as it is. The board's list
 * keeps the project until `readProjects`: the tray first takes the reader
 * off the project's page, so the page never stands on a project the list no
 * longer has.
 */
export async function forgetProject(id: string): Promise<void> {
  // Its tab's presence, which the hub's journal names the forget by.
  await hubDone(
    hub.api.projects({ id }).delete(undefined, {
      headers: { [PRESENCE_HEADER]: presenceClientId() },
    }),
    (refused) => hubRefusal(refused, projectWords.notForgottenThen)
  );
}

/**
 * Deletes a project for good, live or forgotten (hub project-delete.ts);
 * `fromDisk`: its checkouts on every machine and its sessions' transcripts
 * too. A refusal (a session running, a machine away, a place shared) is
 * thrown in the hub's words. Sent by `fetch` at its route's path: its
 * last segment, `delete`, is the key Eden's types give `DELETE
 * /api/projects/:id`, which hides this route from them.
 */
export async function deleteProjectForGood(
  id: string,
  fromDisk: boolean
): Promise<void> {
  const response = await fetch(hubPath(hub.api.projects({ id }).delete), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [PRESENCE_HEADER]: presenceClientId(),
    },
    body: JSON.stringify({ fromDisk }),
  });
  if (!response.ok) {
    throw hubRefusal(await refusedOf(response), projectEndWords.notDeletedThen);
  }
}

/** A refusal that asking again the same way can't change (a conflict, an entry gone): no Try again. */
export class StandingRefusal extends Error {}

/** Every forgotten project the hub can bring back, newest first. */
export async function readForgottenProjects(): Promise<ForgottenProject[]> {
  return await hubData(hub.api.projects.forgotten.get(), (refused) =>
    hubRefusal(refused, projectEndWords.unreadThen)
  );
}

/**
 * Brings a forgotten project back as it was (hub project-trash.ts): the
 * entry forgotten at `forgottenAt` (else its newest), and `name` for one forgotten before the
 * hub kept names. The projects are read again, so the rail has it.
 */
export async function restoreProject(
  id: string,
  asked: { forgottenAt?: number; name?: string }
): Promise<ProjectRestored> {
  const restored = await hubData(
    hub.api.projects({ id }).restore.post(asked, {
      headers: { [PRESENCE_HEADER]: presenceClientId() },
    }),
    (answer) => {
      const refused = hubRefusal(answer, projectEndWords.notBroughtBackThen);
      // A conflict or a gone entry stands until something else changes:
      // asking again the same way can't bring it back.
      return answer.response.status === 409 || answer.response.status === 404
        ? new StandingRefusal(refused.message)
        : refused;
    }
  );
  await readProjects();
  return restored;
}

/** Reads the projects again, as the hub has them now. */
export async function readProjects(): Promise<void> {
  const asked = projectsLeave();
  const projects = await load(
    hubJson<ProjectRow[]>(hubRequest("GET /api/projects"))
  );
  if (projects) {
    keepProjects(projects, asked);
  }
}

/** A request whose answer writes the projects: when it left, among frames and among those requests. */
interface ProjectsAsked {
  mark: number;
  ticket: number;
}

/** Requests that write the projects, as they left, and the newest whose answer was kept. */
let projectsAsked = 0;

let projectsKept = 0;

export const projectsLeave = (): ProjectsAsked => {
  projectsAsked += 1;
  return { mark: readLeaves(), ticket: projectsAsked };
};

/**
 * The projects as a request `asked` answered them. An answer to a request
 * that left before the one last kept is dropped: every change of a project
 * says `projects.changed`, so a read follows any change it missed. Each
 * project's cap is the `project.cap` frame's when one came for it since the
 * request left: the hub tells a cap only when it moves, so an older one put
 * back would stand.
 */
export function keepProjects(
  projects: ProjectRow[],
  asked: ProjectsAsked
): void {
  if (asked.ticket < projectsKept) {
    return;
  }
  projectsKept = asked.ticket;
  const held = new Map(projectsState.projects.map((row) => [row.id, row]));
  const answered = projects.map((row) => {
    const kept = held.get(row.id);
    return kept && heardSince(`project.cap:${row.id}`, asked.mark)
      ? { ...row, cap: kept.cap }
      : row;
  });
  projectsState.projects = reconcileRows(
    projectsState.projects,
    answered,
    (row) => row.id
  );
  projectsState.projectsRead = true;
}

/**
 * The hub said the projects changed (`projects.changed`: a place came or
 * went): one read at a time, and one more after it for whatever a burst of
 * workspaces opening said meanwhile.
 */
let projectsReading: Promise<void> | null = null;

let projectsAgain = false;

export function rereadProjects(): void {
  if (projectsReading) {
    projectsAgain = true;
    return;
  }
  projectsReading = readProjects()
    .catch(() => undefined)
    .finally(() => {
      projectsReading = null;
      if (projectsAgain) {
        projectsAgain = false;
        rereadProjects();
      }
    });
}

/** One running session of a project, in tree order (parents first). */
export interface RunningSession {
  cwd: string;
  id: string;
  machineId: string;
  /** Its machine is not connected: it stops when its machine is back. */
  offline: boolean;
  /** The nearest running session it is a delegate of; null for a top session. */
  parentId: string | null;
  title: string | null;
}

/** A project's running sessions as the hub lists them: what a forget stops first. */
export async function projectRunning(id: string): Promise<RunningSession[]> {
  const { sessions } = await hubData(
    hub.api.projects({ id }).running.get(),
    (refused) => hubRefusal(refused, projectWords.sessionsNotListedThen)
  );
  return sessions;
}

const projectStopListeners = new Set<(frame: ProjectStopFrame) => void>();

/**
 * Hears each `project.stop` frame: a session a forget asked to stop has
 * stopped (its machine confirmed), or could not be. Returns the unsubscribe.
 */
export function onProjectStop(
  listener: (frame: ProjectStopFrame) => void
): () => void {
  projectStopListeners.add(listener);
  return () => projectStopListeners.delete(listener);
}

/**
 * Stops the named sessions of a project in one request. Each one's outcome
 * arrives later, by `onProjectStop`, as its machine confirms the end.
 */
export async function stopProjectSessions(
  id: string,
  instanceIds: string[]
): Promise<void> {
  await hubDone(
    hub.api.projects({ id }).stop.post({ instanceIds }),
    (refused) => hubRefusal(refused, projectWords.sessionsNotStoppedThen)
  );
}

/** The projects the hub knows, and which of them a spend cap holds back now. */
export const projectsStore = {
  get projects() {
    return projectsState.projects;
  },
  /** The projects have been read once: an empty list is a fleet with none. */
  get projectsRead() {
    return projectsState.projectsRead;
  },
  project: (id: string): ProjectRow | null =>
    projectsState.projects.find((project) => project.id === id) ?? null,
  /** The project's spend cap while it holds the project back now; null otherwise. */
  capHolding: (id: string): ProjectCap | null => {
    const cap =
      projectsState.projects.find((project) => project.id === id)?.cap ?? null;
    return capHolds(cap, minute.now) ? cap : null;
  },
  /** The projects whose spend cap holds them back now. */
  get capped(): ProjectRow[] {
    return projectsState.projects.filter((project) =>
      capHolds(project.cap, minute.now)
    );
  },
};
