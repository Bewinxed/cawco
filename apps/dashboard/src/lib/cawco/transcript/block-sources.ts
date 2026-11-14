/**
 * Where a reply's blocks read their media (tsk-330, views/openui/
 * block-media.ts), for the session `session()` names:
 * - a file by its absolute path from the session's machine, through the
 *   route `show_image` and a tool row's gallery read it by (`GET
 *   /api/agents/:machineId/media`); a relative path from the session's
 *   project's folder (`GET /api/projects/:id/folder/raw`, `folderRawFile`,
 *   as a report's outputs are drawn); anything else none (core
 *   `blockFile`);
 * - a picture full size in the dashboard's Lightbox;
 * - a Preview's page among the session's artifacts as Files reads them,
 *   loaded from the origin that serves it (preview/page-source.ts), its
 *   still the thumbnail a pane last took of it.
 */

import { blockFile } from "@cawco/core/inline-blocks";
import { projectPagePlace } from "@cawco/core/preview/routes";
import { hub } from "#lib/platform/hub.js";
import { hubFile } from "#lib/platform/hub-file.js";
import { theme } from "#lib/theme.svelte.js";
import { thumbnailUrl } from "../artifact-api";
import { artifactsOf, readArtifacts } from "../files/files.svelte";
import { lightbox } from "../lightbox/lightbox-state.svelte";
import { pageSource } from "../preview/page-source";
import { folderRawFile } from "../project-tasks";
import type { BlockSources } from "../views/openui/block-media";

/** The session a reply's blocks stand in: its id, its machine and its project. */
export interface BlockSession {
  instanceId: string;
  machineId: string;
  projectId?: string | null;
}

export const transcriptSources = (
  session: () => BlockSession
): BlockSources => {
  let asked = false;
  return {
    src: (file) => {
      const named = blockFile(file);
      if (!named) {
        return null;
      }
      const { machineId, projectId } = session();
      if (named.on === "folder") {
        return projectId ? folderRawFile(projectId, named.path) : null;
      }
      return hubFile(hub.api.agents({ machineId }).media, {
        path: named.path,
      });
    },
    open: (shots, index) => {
      lightbox.open({ kind: "image", shots, index });
    },
    pages: {
      list: () => {
        const { instanceId } = session();
        const read = artifactsOf(instanceId);
        if (!(read || asked)) {
          asked = true;
          queueMicrotask(() => readArtifacts(instanceId));
        }
        return read?.list ?? undefined;
      },
      frame: (page) =>
        pageSource(
          page.project
            ? { project: page.project }
            : { instance: session().instanceId },
          projectPagePlace(page.id)
        ),
      still: (page) =>
        page.thumbnail
          ? thumbnailUrl(page.id, page.thumbnail, theme.resolved)
          : null,
    },
  };
};
