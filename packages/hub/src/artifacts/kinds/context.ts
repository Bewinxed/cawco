/**
 * What a kind of artifact (canvas, component, page, preview) reads of the
 * artifact service: its deps, and the service's parts it calls, each read
 * when called. Each kind picks what it reads.
 */

import type { ArtifactDoes } from "@cawco/core/artifact-kinds";
import type { ArtifactPending } from "@cawco/core/artifact-needs";
import type { ChoiceEntry } from "@cawco/core/choices";
import type { DecisionCard } from "@cawco/core/decisions";
import type { ChangedItem, MetaMap } from "@cawco/core/doc-meta";
import type { InstanceRow } from "@cawco/core/protocol";
import type { problem } from "elysia";
import type { ArtifactRow } from "../../db/artifacts";
import type { BuiltProgram } from "../../decision-program";

import type { createAccess } from "../access";
import type { ArtifactServiceDeps } from "../deps";
import type { createMarks } from "../marks";
import type { createPageStore } from "../page-store";
import type {
  ArtifactInput,
  ArtifactRead,
  Opened,
  PageBroken,
} from "../shapes";
import type { createVersions } from "../versions";

export interface KindContext {
  above: ReturnType<typeof createAccess>["above"];
  actsNoMore: (instance: InstanceRow) => boolean;
  answersHad: (
    instance: InstanceRow,
    row: ArtifactRow,
    change: {
      after: Record<string, unknown>;
      before: Record<string, unknown>;
      tested: ReadonlySet<string>;
    }
  ) =>
    | ReturnType<
        typeof problem<409, { code: "artifact-answers-stand"; detail: string }>
      >
    | undefined;
  askedOf: (
    input: Pick<ArtifactInput, "does" | "ask" | "title">
  ) =>
    | { ask: string; does: ArtifactDoes; title: string }
    | ReturnType<
        typeof problem<422, { code: "artifact-create-shape"; detail: string }>
      >;
  brokenBy: (
    page: { id: string | undefined; name: string; projectId: string | null },
    cards: DecisionCard[]
  ) => Promise<
    | PageBroken
    | undefined
    | Awaited<ReturnType<ArtifactServiceDeps["afterLinks"]>>
  >;
  cardLinks: (
    id: string,
    cards: readonly DecisionCard[]
  ) => Record<string, string>;
  choicesAsked: (row: ArtifactRow) => { card?: DecisionCard; id: string }[];
  db: ArtifactServiceDeps["db"];
  deps: ArtifactServiceDeps;
  discard: (row: ArtifactRow) => void;
  docs: ArtifactServiceDeps["docs"];
  handing: ReturnType<typeof createVersions>["handing"];
  handOver: ReturnType<typeof createVersions>["handOver"];
  heldId: ReturnType<typeof createVersions>["heldId"];
  holder: ReturnType<typeof createAccess>["holder"];
  holdNext: ReturnType<typeof createVersions>["holdNext"];
  holdsChange: ReturnType<typeof createVersions>["holdsChange"];
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
  mediaHeld: (
    owner: InstanceRow,
    program: BuiltProgram
  ) =>
    | ReturnType<
        typeof problem<422, { code: "artifact-media-unfit"; detail: string }>
      >
    | undefined;
  mediaSeen: (page: ArtifactRow, id: string) => ArtifactRow | undefined;
  namedFor: ReturnType<typeof createAccess>["namedFor"];
  ofTree: ReturnType<typeof createAccess>["ofTree"];
  openedOf: (shown: Opened) => Opened;
  openNextFirst: ReturnType<typeof createVersions>["openNextFirst"];
  ownerFor: (
    maker: InstanceRow,
    input: ArtifactInput
  ) =>
    | InstanceRow
    | ReturnType<
        typeof problem<
          400,
          { code: "artifact-draft-to-parent"; detail: string }
        >
      >
    | ReturnType<
        typeof problem<409, { code: "artifact-no-parent"; detail: string }>
      >
    | ReturnType<
        typeof problem<404, { code: "artifact-parent-gone"; detail: string }>
      >;
  pagesShowing: () => Map<string, ArtifactRow[]>;
  pendingFor: (row: ArtifactRow) => ArtifactPending | null;
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
  routedOn: (
    asker: InstanceRow,
    id: string,
    cards: DecisionCard[],
    all: DecisionCard[]
  ) => ReturnType<ArtifactServiceDeps["decides"]["routed"]>;
  stampMeta: (row: ArtifactRow, given: string | null) => void;
  store: ReturnType<typeof createPageStore>;
  waitsOnPerson: (row: ArtifactRow) => boolean;
  whole: ReturnType<typeof createAccess>["whole"];
}
