/**
 * The one-time move of the canvases' picks into artifacts (drizzle 0144 set
 * the tables aside as `legacy_canvases` and `legacy_canvas_choices`). Each
 * canvas becomes its session's artifact: a decision page
 * (`decisions:<project>/<page>`) a page of that name, its published
 * `index.html` copied to the artifact's folder; a dev server or folder
 * (`port:<machine>:<port>`, `dir:<machine>:<path>`) a preview. Its picks
 * become the doc's `state`, already delivered. A canvas whose session is gone
 * is dropped with the tables.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactKind, ChoiceEntry, PreviewSource } from "@cawco/core";
import type { ArtifactsDb, LegacyCanvas } from "../db/artifacts";
import { legacyDoc, legacyName } from "./service";

const placeOf = (
  canvas: LegacyCanvas
): {
  kind: ArtifactKind;
  name: string;
  machineId: string | null;
  projectId: string | null;
  source: PreviewSource;
} => {
  if (canvas.id.startsWith("decisions:")) {
    const [project, page] = canvas.id.slice("decisions:".length).split("/");
    return {
      kind: "page",
      name: page,
      machineId: null,
      projectId: project,
      source: { page },
    };
  }
  const [kind, machineId, ...rest] = canvas.id.split(":");
  const place = rest.join(":");
  if (kind === "port") {
    return {
      kind: "preview",
      name: legacyName(`port-${place}`),
      machineId,
      projectId: null,
      source: { port: Number(place) },
    };
  }
  return {
    kind: "preview",
    name: legacyName(place.split("/").filter(Boolean).at(-1) ?? "folder"),
    machineId,
    projectId: null,
    source: { dir: place },
  };
};

const parsed = (json: string | null): unknown => {
  if (json === null) {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

interface ImportDeps {
  db: ArtifactsDb;
  /** Whether the session is still on the hub. */
  hasInstance: (id: string) => boolean;
  /** A project's folder on the hub's disk. */
  projectRoot: (projectId: string) => string;
  root: string;
}

/** Each canvas whose session is still here, as its artifact; then the tables go. */
export const importLegacyCanvases = (deps: ImportDeps): void => {
  const canvases = deps.db
    .legacy()
    .filter((canvas) => deps.hasInstance(canvas.instanceId));
  for (const canvas of canvases) {
    importCanvas(deps, canvas);
  }
  deps.db.dropLegacy();
  if (canvases.length > 0) {
    console.info(
      `[artifacts] moved ${canvases.length} canvases' picks into artifacts`
    );
  }
};

const importCanvas = (deps: ImportDeps, canvas: LegacyCanvas): void => {
  const place = placeOf(canvas);
  let { name } = place;
  for (let n = 2; deps.db.byName(canvas.instanceId, place.kind, name); n += 1) {
    name = `${place.name.slice(0, 60)}-${n}`;
  }
  const at = new Date(canvas.updatedAt);
  const row = deps.db.create({
    id: crypto.randomUUID(),
    instanceId: canvas.instanceId,
    projectId: place.projectId,
    kind: place.kind,
    name,
    machineId: place.machineId,
    source: place.kind === "page" ? { page: name } : place.source,
    revision: 1,
    seq: 0,
    changes: {},
    deliveredSeq: 0,
    createdAt: at,
    updatedAt: at,
    shownAt: null,
  });
  if (place.projectId) {
    const published = join(
      deps.projectRoot(place.projectId),
      "decisions",
      place.name,
      "index.html"
    );
    if (existsSync(published)) {
      mkdirSync(join(deps.root, row.id), { recursive: true });
      copyFileSync(published, join(deps.root, row.id, "index.html"));
    }
  }
  const entries: Record<string, ChoiceEntry> = Object.fromEntries(
    canvas.choices.map((choice) => [
      choice.choice,
      {
        options: (parsed(choice.options) as string[] | null) ?? [],
        note: choice.note,
        value: parsed(choice.value),
        pageHash: choice.pageHash,
        at: new Date(choice.updatedAt).toISOString(),
      },
    ])
  );
  const seq = deps.db.append(
    row.id,
    legacyDoc(
      {
        kind: place.kind,
        name,
        pageHash: canvas.pageHash,
        sentAt: canvas.sentAt ? new Date(canvas.sentAt).toISOString() : null,
      },
      entries
    ),
    { keys: Object.keys(entries), by: "person" }
  );
  deps.db.update(row.id, { deliveredSeq: seq });
};
