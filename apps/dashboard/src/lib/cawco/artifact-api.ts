/**
 * The hub's artifact routes (Projects spec §5.10), as plain requests: the
 * session panel, the composer's canvas and an artifact's own tab call them
 * alike. Its own module, apart from the fleet store, so an artifact's tab
 * reaches them without loading the fleet.
 */

import type { ArtifactPlace } from "@cawco/core/artifact-needs";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { hubRequest } from "@cawco/core/hub-request";
import type { ShownFailure } from "@cawco/core/preview/protocol";
import type {
  ArtifactHit,
  ArtifactSummary,
  ArtifactThumbnail,
  SessionAttachments,
} from "@cawco/core/protocol";
import type { CanvasMap, SheetRead, StoryOp } from "@cawco/core/stage";
import {
  hubFetch,
  hubJson,
  hubRefusal,
  hubSend,
} from "#lib/platform/hub-read.js";
import { goto } from "$app/navigation";
import { currentClientId } from "./client-id";

/** Every artifact a session holds, newest first (Projects spec §5.10): the panel's menu. */
export async function listArtifacts(
  instanceId: string
): Promise<ArtifactSummary[]> {
  return await hubJson(
    hubRequest("GET /api/instances/:id/artifacts", {
      path: { id: instanceId },
    })
  );
}

/**
 * A session's artifacts that reached the person, newest first: Files'
 * Artifacts. The hub keeps the rule (artifacts/service.ts `filesOf`): seen
 * in their view, waiting on them or made by them; never a browser, nor a
 * listed decision page's embedded media.
 */
export async function listFiles(
  instanceId: string
): Promise<ArtifactSummary[]> {
  return await hubJson(
    hubRequest("GET /api/instances/:id/artifacts/files", {
      path: { id: instanceId },
    })
  );
}

/**
 * A session's attachments, read off its whole transcript on the hub, newest
 * first (core `SessionAttachments`): Files' Attachments.
 */
export async function listAttachments(
  instanceId: string
): Promise<SessionAttachments> {
  return await hubJson(
    hubRequest("GET /api/instances/:id/attachments", {
      path: { id: instanceId },
    })
  );
}

/**
 * Files' search over a session's artifacts: those a query matches by name
 * or by the words on their page, best first (core `ArtifactHit`).
 */
export async function searchArtifacts(
  instanceId: string,
  q: string,
  signal?: AbortSignal
): Promise<ArtifactHit[]> {
  return await hubJson(
    hubRequest("GET /api/instances/:id/artifacts/search", {
      path: { id: instanceId },
      query: { q },
    }),
    { init: { signal } }
  );
}

/** Where an artifact's latest picture is served in `scheme`, named by when it was drawn. */
export const thumbnailUrl = (
  id: string,
  thumbnail: ArtifactThumbnail,
  scheme: "light" | "dark"
): string =>
  hubRequest("GET /api/artifacts/:artifact/thumbnail/:scheme", {
    path: { artifact: id, scheme: thumbnail.single ? "light" : scheme },
    query: { at: thumbnail.at },
  }).path;

/**
 * The pane's thumbnail of the artifact it shows, kept by the hub as the
 * artifact's latest picture (Files' cards draw it).
 */
export async function keepThumbnail(
  instanceId: string,
  id: string,
  shot: { light: string | null; dark: string | null; single: boolean }
): Promise<void> {
  await hubSend(
    hubRequest("PUT /api/instances/:id/artifacts/:artifact/thumbnail", {
      path: { id: instanceId, artifact: id },
      body: shot,
    })
  );
}

/** The hub's refusal of a read or a show of an artifact, in its own words, with its status: a 404 is an artifact no longer there, which no retry brings back. */
export class ArtifactRefused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Brings an artifact to the front of a session's panel, at `at`; the panel
 * follows its frame. The hub answers where the person goes instead (hub
 * artifacts/service.ts `show`), and they go there: a project's setup page
 * to where it lands (core `setupLanding`), and an artifact the session's
 * panel does not hold (not its own, made by it, or of its delegation tree)
 * to the session that holds it, opened as a tab beside the one on screen
 * with the artifact in front of its panel at `at` (core
 * `artifactStopHref`, workspace.svelte.ts `followUrl`). Answers where it
 * opened: this panel, or a page.
 */
export async function showArtifact(
  instanceId: string,
  id: string,
  at: ArtifactPlace = { top: true }
): Promise<"panel" | "page"> {
  const response = await hubFetch(
    hubRequest("POST /api/instances/:id/artifacts/:artifact/show", {
      path: { id: instanceId, artifact: id },
      body: "top" in at ? {} : { at },
    })
  );
  if (!response.ok) {
    throw new ArtifactRefused(
      response.status,
      (await hubRefusal(response)).message
    );
  }
  const shown = (await response.json().catch(() => null)) as {
    href?: unknown;
  } | null;
  if (typeof shown?.href === "string") {
    await goto(shown.href);
    return "page";
  }
  return "panel";
}

/**
 * Removes one of a session's artifacts; a panel that showed it follows its
 * frame to the next newest, or closes.
 */
export async function removeArtifact(
  instanceId: string,
  id: string
): Promise<void> {
  await hubSend(
    hubRequest("DELETE /api/instances/:id/artifacts/:artifact", {
      path: { id: instanceId, artifact: id },
    })
  );
}

/**
 * This tab's word to the hub that its pane has artifact `id` on screen at the
 * open frame's `revision`, or why it could not load it: the agent's
 * artifact_create and artifact_show answer from it.
 */
export async function artifactShown(
  instanceId: string,
  id: string,
  word: { revision: string } & (
    { ok: true } | { ok: false; error: ShownFailure }
  )
): Promise<void> {
  await hubSend(
    hubRequest("POST /api/instances/:id/artifacts/:artifact/shown", {
      path: { id: instanceId, artifact: id },
      body: { client: currentClientId(), ...word },
    })
  );
}

/**
 * A new canvas for the composer (a pen's swipe, Draw, ⌘⇧D):
 * empty, a draft until its first send, not shown in the panel by being made.
 */
export async function createDraftCanvas(
  instanceId: string
): Promise<{ id: string; name: string }> {
  const made = await hubJson<{ id: string; name: string }>(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: instanceId },
      body: { kind: "canvas", name: "canvas", draft: true },
    })
  );
  return { id: made.id, name: made.name };
}

/** A canvas as a send carries it: its `.excalidraw` file, its outline, its picture (base64 PNG, null until drawn). */
export interface CanvasExport {
  file: { elements: { isDeleted?: boolean }[] } & Record<string, unknown>;
  outline: string;
  png: string | null;
}

/** A canvas's export, waited on for as long as the hub takes. */
export async function exportCanvas(id: string): Promise<CanvasExport> {
  return await hubJson(
    hubRequest("GET /api/artifacts/:artifact/export", {
      path: { artifact: id },
    })
  );
}

/**
 * A canvas's export within `withinMs`, body and all: `unanswered` when the
 * hub did not answer in time, for the caller to say so, as the app's does
 * (ComposerView `readForSend`).
 */
export function exportCanvasWithin(
  id: string,
  withinMs: number
): Promise<Bounded<CanvasExport>> {
  return readWithin(withinMs, async (signal): Promise<CanvasExport> =>
    hubJson(
      hubRequest("GET /api/artifacts/:artifact/export", {
        path: { artifact: id },
      }),
      { init: { signal } }
    )
  );
}

/** A sheet's write from its inspector, as its Save and story buttons make it (core `SheetWrite` less its file). */
export type SheetChange =
  | {
      args: {
        story: string;
        unset?: string[];
        values: Record<string, unknown>;
      };
    }
  | { story: StoryOp };

/**
 * The person's write to a sheet's story file (live components spec §5):
 * the stage writes it in the session's workspace and the session is told.
 * Answers the sheet as it reads after; a refusal throws its sentence.
 */
export async function writeSheet(
  instanceId: string,
  id: string,
  change: SheetChange
): Promise<{
  edit?: { file: string; lines: { from: number; to: number } };
  sheet?: SheetRead;
}> {
  return await hubJson(
    hubRequest("POST /api/instances/:id/artifacts/:artifact/sheet", {
      path: { id: instanceId, artifact: id },
      body: change,
    })
  );
}

/** A component canvas's map: its component, what renders it and what it renders, each with its states and frames in miniature. */
export async function fetchCanvasMap(
  instanceId: string,
  id: string,
  component: string | null = null
): Promise<CanvasMap> {
  return await hubJson(
    hubRequest("GET /api/instances/:id/artifacts/:artifact/map", {
      path: { id: instanceId, artifact: id },
      ...(component ? { query: { component } } : {}),
    })
  );
}

/** The panel's Verify: a design system round on a component canvas, its verdict to the canvas's session. Answers what the hub did, one sentence. */
export async function verifyArtifact(
  instanceId: string,
  id: string
): Promise<string> {
  const answer = (await hubJson(
    hubRequest("POST /api/instances/:id/artifacts/:artifact/verify", {
      path: { id: instanceId, artifact: id },
    })
  )) as { verify: string };
  return answer.verify;
}

/** The draft canvas went out with a send: the session holds it now. */
export async function canvasSent(
  instanceId: string,
  id: string
): Promise<void> {
  await hubSend(
    hubRequest("POST /api/instances/:id/artifacts/:artifact/sent", {
      path: { id: instanceId, artifact: id },
    })
  );
}

/** An artifact by id with the session that made it, and whether its panel shows it now: what its own tab opens on. */
export async function findArtifact(
  id: string
): Promise<ArtifactSummary & { instanceId: string; shown: boolean }> {
  return await hubJson(
    hubRequest("GET /api/artifacts/:artifact", { path: { artifact: id } }),
    {
      failure: async (response) =>
        new ArtifactRefused(
          response.status,
          (await hubRefusal(response)).message
        ),
    }
  );
}

/** Closes the session's panel; each store marks its own copy closed once the hub took it. */
export async function deletePreview(instanceId: string): Promise<void> {
  await hubSend(
    hubRequest("DELETE /api/instances/:id/preview", {
      path: { id: instanceId },
    })
  );
}
