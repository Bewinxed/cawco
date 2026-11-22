/**
 * A design or served preview opened after its workspace went comes back:
 * its machine answered the open that the workspace is not there (agent
 * preview.ts `staged`, `gone`), the preview server asked the hub
 * (preview-server/wire.ts `REVIVE_PATH`), and the workspace it is served
 * from is cut again at its last version (workspaces.ts `revive`), or the
 * artifact moves to the later workspace that workspace's work went on in
 * (artifacts service `moveServed`). The answer is what the open does next:
 * go on to the listener, or stand on the proxy's page naming why it can't
 * (core preview.ts `goneWhy`). The owner's pick on 2026-11-22, "Comes back
 * when you open it". A design folder's tree (core stage.ts `designOf`),
 * whose folder the hub keeps, comes back by its stage started on the hub's
 * machine again, which records it there anew.
 */

import { designOf } from "@cawco/core/stage";
import { previewWords } from "@cawco/core/words/preview";
import { ElysiaStatus } from "elysia";
import { servedOf, sheetOf } from "./artifacts/served";
import type { Artifacts } from "./artifacts/service";
import type { ArtifactRow } from "./db/artifacts";
import type { RevivedAnswer } from "./preview-server/wire";
import type { GoneWhy, Workspaces } from "./workspaces";

/** What a revive reads of the hub. */
export interface DesignReviveDeps {
  /** Design tree `tree`'s stage started on the hub's machine over its folder, its pages `files`: why not, in words, or nothing. */
  design: (tree: string, files: string[]) => Promise<string | undefined>;
  moveServed: Artifacts["moveServed"];
  revive: Workspaces["revive"];
}

/**
 * The down state of a design that can't come back, by why: `machine` while
 * its machine is away, whose cover says so and loads the frame again once
 * it answers (the owner's word on 2026-11-22: "If its machine is off, it
 * waits for the machine"); `gone` with the reason's line for the rest. The
 * proxy's page after an open (design-revive's answer) and the hub's read
 * before any (preview-unavailable.ts) say it alike.
 */
export const goneDownOf = (
  why: GoneWhy
): { down: "gone" | "machine"; why: string | null } => {
  switch (why.kind) {
    case "offline":
      return { down: "machine", why: null };
    case "commit":
      return { down: "gone", why: previewWords.goneWhy.commit(why.branch) };
    case "discarded":
      return { down: "gone", why: previewWords.goneWhy.discarded };
    case "unrecorded":
      return { down: "gone", why: previewWords.goneWhy.unrecorded };
    case "failed":
      return { down: "gone", why: previewWords.goneWhy.failed(why.why) };
    default:
      return why satisfies never;
  }
};

/** The proxy's page for a design that can't come back ({@link goneDownOf}). */
const goneAnswer = (why: GoneWhy): RevivedAnswer => ({
  ok: false,
  ...goneDownOf(why),
});

export const createDesignRevive =
  (deps: DesignReviveDeps) =>
  /** Artifact `row`'s workspace, which its machine said is gone, back on its machine, or why it can't be. */
  async (row: ArtifactRow): Promise<RevivedAnswer> => {
    const design = designOf(row);
    if (design) {
      const why = await deps.design(design.tree, design.files);
      return why === undefined
        ? { ok: true }
        : goneAnswer({ kind: "failed", why });
    }
    const workspace = sheetOf(row)?.workspace ?? servedOf(row)?.workspace;
    if (!workspace) {
      return { ok: false, down: "gone", why: null };
    }
    const revived = await deps.revive(workspace);
    if (revived.kind === "gone") {
      return goneAnswer(revived.why);
    }
    if (revived.moved) {
      const moved = await deps.moveServed(row.id, revived.workspace);
      if (moved instanceof ElysiaStatus) {
        return goneAnswer({
          kind: "failed",
          why: String(moved.response.detail),
        });
      }
    }
    return { ok: true };
  };
