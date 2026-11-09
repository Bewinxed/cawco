/**
 * What a kind of artifact (canvas, component, page, preview) reads of the
 * artifact service: its deps, and the service's parts it calls, each read
 * when called. Each kind picks what it reads.
 */

import type { ArtifactDoes } from "@cawco/core/artifact-kinds";
import type { ChoiceEntry } from "@cawco/core/choices";
import type { ChangedItem, MetaMap } from "@cawco/core/doc-meta";
import type { ArtifactRow } from "../../db/artifacts";
import type { ArtifactServiceDeps } from "../deps";
import type { createMarks } from "../marks";
import type { ArtifactInput, ArtifactRead, Opened } from "../shapes";
import type { createVersions } from "../versions";

export interface KindContext {
  askedOf: (input: Pick<ArtifactInput, "does" | "ask" | "title">) => {
    ask: string;
    does: ArtifactDoes;
    title: string;
  };
  db: ArtifactServiceDeps["db"];
  deps: ArtifactServiceDeps;
  discard: (row: ArtifactRow) => void;
  docs: ArtifactServiceDeps["docs"];
  handing: ReturnType<typeof createVersions>["handing"];
  handOver: ReturnType<typeof createVersions>["handOver"];
  heldId: ReturnType<typeof createVersions>["heldId"];
  holdNext: ReturnType<typeof createVersions>["holdNext"];
  inPanel: (row: ArtifactRow) => boolean;
  marked: ReturnType<typeof createMarks>["marked"];
  markedLinks: (
    id: string,
    items: readonly ChangedItem[]
  ) => { marked?: string[] };
  markRevision: (
    row: ArtifactRow,
    items: ChangedItem[],
    revision: (meta: MetaMap) => number
  ) => ChangedItem[];
  openedOf: (shown: Opened) => Opened;
  openNextFirst: ReturnType<typeof createVersions>["openNextFirst"];
  personChangedAfter: (
    row: ArtifactRow,
    since: number,
    present: Set<string>
  ) => string[];
  pictureOf: (id: string) => string | null;
  read: (
    row: ArtifactRow,
    since?: number,
    ownersRead?: boolean
  ) => ArtifactRead;
  readTo: (
    row: ArtifactRow,
    state: Record<string, ChoiceEntry>,
    returned: (key: string) => boolean
  ) => number;
  relistOf: (row: ArtifactRow) => void;
  stampMeta: (row: ArtifactRow, given: string | null) => void;
}
