/**
 * The hub's artifact routes (Projects spec §5.10), as plain requests: the
 * session panel, the composer's canvas and an artifact's own tab call them
 * alike. Its own module, apart from the fleet store, so an artifact's tab
 * reaches them without loading the fleet.
 */
import type {
  ArtifactHit,
  ArtifactSummary,
  ArtifactThumbnail,
  SessionAttachments,
  ShownFailure,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import type { CanvasMap, SheetRead, StoryOp } from "@cawco/core/stage";
import { hubRefusal } from "#lib/cawco/hub-read.js";
import { currentClientId } from "./client-id";

const artifactsPath = (instanceId: string, id?: string) =>
  `/api/instances/${encodeURIComponent(instanceId)}/artifacts${id ? `/${encodeURIComponent(id)}` : ""}`;

/** The hub's refusal, in its own words. */
async function ok(response: Response): Promise<Response> {
  if (!response.ok) {
    throw await hubRefusal(response);
  }
  return response;
}

/** A session's artifacts, newest first (Projects spec §5.10): the panel's list. */
export async function listArtifacts(
  instanceId: string
): Promise<ArtifactSummary[]> {
  return (await ok(await fetch(artifactsPath(instanceId)))).json();
}

/**
 * A session's attachments, read off its whole transcript on the hub, newest
 * first (core `SessionAttachments`): Files' Attachments.
 */
export async function listAttachments(
  instanceId: string
): Promise<SessionAttachments> {
  return (
    await ok(
      await fetch(
        `/api/instances/${encodeURIComponent(instanceId)}/attachments`
      )
    )
  ).json();
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
  return (
    await ok(
      await fetch(
        `${artifactsPath(instanceId)}/search?q=${encodeURIComponent(q)}`,
        { signal }
      )
    )
  ).json();
}

/** Where an artifact's latest picture is served in `scheme`, named by when it was drawn. */
export const thumbnailUrl = (
  id: string,
  thumbnail: ArtifactThumbnail,
  scheme: "light" | "dark"
): string =>
  `/api/artifacts/${encodeURIComponent(id)}/thumbnail/${thumbnail.single ? "light" : scheme}?at=${encodeURIComponent(thumbnail.at)}`;

/**
 * The pane's thumbnail of the artifact it shows, kept by the hub as the
 * artifact's latest picture (Files' cards draw it).
 */
export async function keepThumbnail(
  instanceId: string,
  id: string,
  shot: { light: string | null; dark: string | null; single: boolean }
): Promise<void> {
  await ok(
    await fetch(`${artifactsPath(instanceId, id)}/thumbnail`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(shot),
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
 * Brings an artifact to the front of a session's panel (its own, or one of
 * its delegation tree's sessions'); the panel follows its frame.
 */
export async function showArtifact(
  instanceId: string,
  id: string
): Promise<void> {
  const response = await fetch(`${artifactsPath(instanceId, id)}/show`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new ArtifactRefused(
      response.status,
      (await hubRefusal(response)).message
    );
  }
}

/**
 * Removes one of a session's artifacts; a panel that showed it follows its
 * frame to the next newest, or closes.
 */
export async function removeArtifact(
  instanceId: string,
  id: string
): Promise<void> {
  await ok(await fetch(artifactsPath(instanceId, id), { method: "DELETE" }));
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
  await ok(
    await fetch(`${artifactsPath(instanceId, id)}/shown`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: currentClientId(), ...word }),
    })
  );
}

/**
 * A new canvas for the composer (a pen's swipe, Draw, ⌘⇧D, the panel's +):
 * empty, a draft until its first send, not shown in the panel by being made.
 */
export async function createDraftCanvas(
  instanceId: string
): Promise<{ id: string; name: string }> {
  const response = await ok(
    await fetch(artifactsPath(instanceId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "canvas", name: "canvas", draft: true }),
    })
  );
  const made = (await response.json()) as { id: string; name: string };
  return { id: made.id, name: made.name };
}

/** A canvas as a send carries it: its `.excalidraw` file, its outline, its picture (base64 PNG, null until drawn). */
export interface CanvasExport {
  file: { elements: { isDeleted?: boolean }[] } & Record<string, unknown>;
  outline: string;
  png: string | null;
}

const exportUrl = (id: string): string =>
  `/api/artifacts/${encodeURIComponent(id)}/export`;

/** A canvas's export, waited on for as long as the hub takes. */
export async function exportCanvas(id: string): Promise<CanvasExport> {
  return (await ok(await fetch(exportUrl(id)))).json();
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
    (await ok(await fetch(exportUrl(id), { signal }))).json()
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
  return (
    await ok(
      await fetch(`${artifactsPath(instanceId, id)}/sheet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      })
    )
  ).json();
}

/** A component canvas's map: its component, what renders it and what it renders, each with its states and frames in miniature. */
export async function fetchCanvasMap(
  instanceId: string,
  id: string
): Promise<CanvasMap> {
  return (await ok(await fetch(`${artifactsPath(instanceId, id)}/map`))).json();
}

/** The panel's Verify: a design system round on a component canvas, its verdict to the canvas's session. Answers what the hub did, one sentence. */
export async function verifyArtifact(
  instanceId: string,
  id: string
): Promise<string> {
  const answer = (await (
    await ok(
      await fetch(`${artifactsPath(instanceId, id)}/verify`, { method: "POST" })
    )
  ).json()) as { verify: string };
  return answer.verify;
}

/** The draft canvas went out with a send: the session holds it now. */
export async function canvasSent(
  instanceId: string,
  id: string
): Promise<void> {
  await ok(
    await fetch(`${artifactsPath(instanceId, id)}/sent`, { method: "POST" })
  );
}

/** An artifact by id with the session that made it, and whether its panel shows it now: what its own tab opens on. */
export async function findArtifact(
  id: string
): Promise<ArtifactSummary & { instanceId: string; shown: boolean }> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new ArtifactRefused(
      response.status,
      (await hubRefusal(response)).message
    );
  }
  return response.json();
}

/** Closes the session's panel; each store marks its own copy closed once the hub took it. */
export async function deletePreview(instanceId: string): Promise<void> {
  await ok(
    await fetch(`/api/instances/${encodeURIComponent(instanceId)}/preview`, {
      method: "DELETE",
    })
  );
}
