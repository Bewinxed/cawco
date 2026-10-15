/**
 * A project's mockups, as plain requests (hub mockups.ts): its library,
 * built from its `design/`, and the check a mockup passes before it is drawn.
 */
import type { ProjectMockups } from "@cawco/core/mockups";
import { json, send } from "#lib/cawco/project-tasks.js";

const at = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/mockups`;

/** The project's mockup library: its design, its fonts and assets, its specimens' templates. */
export const mockupsOf = (projectId: string): Promise<ProjectMockups> =>
  send(`${at(projectId)}/library`);

/** A mockup's program as a file of the project's folder (`design/mockups/board.oui`). */
export const mockupFile = (projectId: string, path: string): Promise<string> =>
  send<{ content: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/folder/file?path=${encodeURIComponent(path)}`
  ).then((file) => file.content);

/** `source` checked as one of the project's mockups; the hub's sentence when it is refused. */
export const checkMockup = (
  projectId: string,
  source: string
): Promise<{ components: string[]; source: string }> =>
  send(`${at(projectId)}/check`, json("POST", { source }));
