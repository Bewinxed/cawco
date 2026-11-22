/**
 * `project_create`: a session makes a new project when the person asks for
 * one in chat, and it comes out as New project makes it.
 *
 * - **Who**: every worker, in a project or in none (roles.ts lists a worker
 *   every tool); a delegate files nothing lasting and hands the ask to its
 *   parent. It loads through ToolSearch, as every tool but the few
 *   delegation-tools.ts `loadsUpfront` names.
 * - **Description**: what (a new project, made as New project makes it)
 *   and when (the person asks for one, whichever project the session is
 *   in: project_settings and the project tools act on the caller's own
 *   project, project_from_session makes the caller itself a project).
 *   Each parameter says its own default; the answer says what to do next.
 * - **Input**: `name`, the project's name; `words`, what the person asked
 *   of it, its conversation's first message; `folder`, an absolute folder
 *   to be its checkout, on `machine` (a hostname or id, the caller's own by
 *   default). With no folder its one place is its folder on the hub until
 *   setup picks one, as New project leaves it.
 * - **One path**: the call is `POST /api/projects`'s own ask, made with Caw
 *   (project-joining.ts `newProject`): the same name rule, the same
 *   project row, nightly memory run and setup conversation, started with the
 *   words as the person's own (caw.ts `setup`, the project-setup skill).
 * - **Answer**: the project's link, and its conversation's once it has
 *   started (the call waits for that start, as `start_session` waits for
 *   its machine), or that it did not, which the project's page explains;
 *   then that the person gets both links and the project's conversation
 *   does what they asked of the project.
 * - **Refusals**, in the hub's words, each with what to do: a name that is
 *   empty, more than one line or too long; `machine` without `folder`; a
 *   folder that is no absolute path on its machine, in its scratch root,
 *   on a paused, offline or unknown machine, or one a project holds
 *   already, by place or by its repository (`newOnly`: one folder or
 *   repository is one project, and this tool makes a new one, never joins).
 *   Names are not unique, as on New project.
 * - **No approval card**: the person's own message asked for it, the
 *   project is theirs alone (nothing outside the fleet sees it) and Forget
 *   project takes it back, and every lasting choice in it (stages, rules,
 *   delegates, routines) waits on the setup page the person sends. An
 *   approve ask is for what reaches the whole fleet or the outside world
 *   (asks.ts). A retried call makes one project (call-keys.ts).
 */

import { PROJECT_NAME_LENGTH } from "@cawco/core/forgotten-project";
import type { InstanceRow } from "@cawco/core/protocol";
import { projectLink, sessionLink } from "@cawco/core/references";
import { ElysiaStatus } from "elysia";
import { z } from "zod";
import type { PlaceRow } from "./db/projects";
import { resolveMachine } from "./delegation-actions";
import { boardTitle } from "./labels";
import { defineTool } from "./mcp-tool";
import { lines } from "./presenters/words";
import type { NewProject } from "./project-making";

/** The tool's name, which roles.ts lists every worker and call-keys.ts runs once per call. */
export const PROJECT_CREATE = "project_create";

/** As long as the words New project's composer sends (`POST /api/projects` `prompt`). */
const WORDS_MAX = 20_000;

/** A project `project_create` made, and its conversation once started. */
export interface ProjectCreated {
  /** The conversation setting it up, by its session; null when it did not start. */
  conversation: { id: string; title: string } | null;
  /** Where it works now: its checkout, or its folder on the hub. */
  place: string;
  project: { id: string; name: string };
}

export interface ProjectCreateDeps {
  /** A session's row, for its conversation's title. */
  instance: (id: string) => InstanceRow | undefined;
  machineName: (machineId: string) => string;
  /** The fleet's machines, which `machine` names one of (delegation-actions.ts `resolveMachine`). */
  machines: () => Parameters<typeof resolveMachine>[0];
  /** `POST /api/projects`'s ask (project-joining.ts `newProject`). */
  newProject: NewProject;
}

/** Where a project's place is, in words. */
const placeWords = (
  place: PlaceRow,
  machineName: (machineId: string) => string
): string =>
  place.kind === "hub"
    ? "its folder on the hub"
    : `${place.path} on ${machineName(place.machineId)}`;

/** What the session reads: the links to give the person, and where setup goes on. */
const createdWords = (made: ProjectCreated): string =>
  lines(
    `Made ${projectLink(made.project.id, made.project.name)}, in ${made.place}.`,
    made.conversation
      ? `Its conversation ${sessionLink(made.conversation.id, made.conversation.title)} sets it up with the person from their words.`
      : "Its conversation did not start; the project's page says why, and the person sets it up from there.",
    "Give the person these links. What they asked of the project is its conversation's to do."
  );

export const PROJECT_CREATE_DEFINITION = defineTool(
  PROJECT_CREATE,
  "A new project, made as New project makes it: its conversation starts on the person's words and sets it up. Use it when the person asks for a new project, whichever project this session is in.",
  {
    name: z
      .string()
      .min(1)
      .max(PROJECT_NAME_LENGTH)
      .describe("The person's name for it, else a short one from their words."),
    words: z
      .string()
      .min(1)
      .max(WORDS_MAX)
      .describe(
        "What the person asked of the project, in their words: its conversation's first message."
      ),
    folder: z
      .string()
      .min(1)
      .optional()
      .describe(
        "An absolute folder to be its checkout. Default: none; setup picks one."
      ),
    machine: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The hostname or id of the machine `folder` is on. Default: yours."
      ),
  },
  createdWords,
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }
);

/** `project_create` for the calling session: `POST /api/projects`'s ask, made with Caw, new only. */
export const createProjectCreate =
  (deps: ProjectCreateDeps) =>
  async (
    actor: InstanceRow,
    asked: { folder?: string; machine?: string; name: string; words: string }
  ) => {
    if (asked.machine !== undefined && asked.folder === undefined) {
      throw new Error(
        'machine names where folder is, and no folder was given: send both, or neither. Example: {"name": "Homelab", "words": "…", "folder": "/srv/homelab", "machine": "build-box"}'
      );
    }
    const machineId =
      asked.machine === undefined
        ? actor.machineId
        : resolveMachine(deps.machines(), asked.machine).machineId;
    const made = await deps.newProject({
      name: asked.name,
      prompt: asked.words,
      caw: true,
      newOnly: true,
      ...(asked.folder === undefined ? {} : { machineId, cwd: asked.folder }),
    });
    if (made instanceof ElysiaStatus) {
      return made;
    }
    const conversationId = await made.conversation;
    const row = conversationId ? deps.instance(conversationId) : undefined;
    const created: ProjectCreated = {
      project: { id: made.project.id, name: made.project.name },
      place: placeWords(made.place, deps.machineName),
      conversation: conversationId
        ? {
            id: conversationId,
            title: row
              ? boardTitle(row)
              : `${made.project.name}'s conversation`,
          }
        : null,
    };
    return created;
  };
