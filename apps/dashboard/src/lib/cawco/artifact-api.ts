/**
 * The hub's artifact routes (Projects spec §5.10), as plain requests: the
 * session panel, the composer's canvas and an artifact's own tab call them
 * alike. Its own module, apart from the fleet store, so an artifact's tab
 * reaches them without loading the fleet.
 */
import type { ArtifactSummary, ShownFailure } from "@cawco/core";
import type { SheetRead, StoryOp } from "@cawco/core/stage";
import { currentClientId } from "./client-id";

const artifactsPath = (instanceId: string, id?: string) =>
  `/api/instances/${encodeURIComponent(instanceId)}/artifacts${id ? `/${encodeURIComponent(id)}` : ""}`;

/** The hub's refusal, in its own words. */
async function ok(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response;
}

/** A session's artifacts, newest first (Projects spec §5.10): the panel's list. */
export async function listArtifacts(
  instanceId: string
): Promise<ArtifactSummary[]> {
  return (await ok(await fetch(artifactsPath(instanceId)))).json();
}

/** Brings one of a session's artifacts to the front of its panel; the panel follows its frame. */
export async function showArtifact(
  instanceId: string,
  id: string
): Promise<void> {
  await ok(
    await fetch(`${artifactsPath(instanceId, id)}/show`, { method: "POST" })
  );
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

/**
 * A canvas's export. `withinMs` bounds the wait for the hub's answer, body
 * and all: past it the read is called off and says so, as the app's does
 * (ComposerView `readForSend`).
 */
export async function exportCanvas(
  id: string,
  withinMs?: number
): Promise<CanvasExport> {
  const url = `/api/artifacts/${encodeURIComponent(id)}/export`;
  if (withinMs === undefined) {
    return (await ok(await fetch(url))).json();
  }
  try {
    const signal = AbortSignal.timeout(withinMs);
    return await (await ok(await fetch(url, { signal }))).json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `the hub didn't answer for it within ${Math.ceil(withinMs / 1000)} s`,
        { cause: error }
      );
    }
    throw error;
  }
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
  return (
    await ok(await fetch(`/api/artifacts/${encodeURIComponent(id)}`))
  ).json();
}

/** Closes the session's panel; each store marks its own copy closed once the hub took it. */
export async function deletePreview(instanceId: string): Promise<void> {
  await ok(
    await fetch(`/api/instances/${encodeURIComponent(instanceId)}/preview`, {
      method: "DELETE",
    })
  );
}
