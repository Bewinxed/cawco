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
 * when you open it".
 */

import { previewWords } from "@cawco/core/words/preview";
import { ElysiaStatus } from "elysia";
import { servedOf, sheetOf } from "./artifacts/served";
import type { Artifacts } from "./artifacts/service";
import type { ArtifactRow } from "./db/artifacts";
import type { RevivedAnswer } from "./preview-server/wire";
import type { GoneWhy, Workspaces } from "./workspaces";

/** What a revive reads of the hub. */
export interface DesignReviveDeps {
  moveServed: Artifacts["moveServed"];
  revive: Workspaces["revive"];
}

/**
 * The proxy's page for a design that can't come back, by why: `machine`
 * while its machine is away, whose cover says so and loads the frame again
 * once it answers (the owner's word on 2026-11-22: "If its machine is off,
 * it waits for the machine"); `gone` with the reason's line for the rest.
 */
const goneAnswer = (why: GoneWhy): RevivedAnswer => {
  switch (why.kind) {
    case "offline":
      return { ok: false, down: "machine", why: null };
    case "commit":
      return {
        ok: false,
        down: "gone",
        why: previewWords.goneWhy.commit(why.branch),
      };
    case "discarded":
      return { ok: false, down: "gone", why: previewWords.goneWhy.discarded };
    case "unrecorded":
      return { ok: false, down: "gone", why: previewWords.goneWhy.unrecorded };
    case "failed":
      return {
        ok: false,
        down: "gone",
        why: previewWords.goneWhy.failed(why.why),
      };
    default:
      return why satisfies never;
  }
};

export const createDesignRevive =
  (deps: DesignReviveDeps) =>
  /** Artifact `row`'s workspace, which its machine said is gone, back on its machine, or why it can't be. */
  async (row: ArtifactRow): Promise<RevivedAnswer> => {
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
