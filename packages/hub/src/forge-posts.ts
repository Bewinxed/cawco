/**
 * A session's `forge_post` (docs/forge-adapters.md): an issue, a pull or
 * merge request, or a comment on any forge, made on the session's machine by
 * that forge's adapter with the machine's own sign-in there (agent
 * forges/forge.ts, `CONTROL_FORGE_POST`). The hub hands the machine the
 * repository, the project's own when the session names none, and answers
 * what came of it.
 */

import type {
  ForgeAsk,
  ForgeVerdict,
  ForgeWrite,
} from "@cawco/core/forge-post";
import type { InstanceRow } from "@cawco/core/protocol";
import { unhandled } from "@cawco/core/unhandled";

/** What a machine's forge call came to: its verdict, or why there is none. */
type ForgeCall =
  { kind: "answered"; verdict: ForgeVerdict } | { kind: "failed"; why: string };

export interface ForgePostsDeps {
  /** Has `machineId` make the write (agent `CONTROL_FORGE_POST`). */
  readonly call: (machineId: string, ask: ForgeAsk) => Promise<ForgeCall>;
  /** The project's links, `host/owner/repo`, one per repository: none without a project. */
  readonly linksOf: (projectId: string | null) => readonly string[];
}

/** What the session reads, and whether the write went. */
export interface ForgeAnswer {
  readonly ok: boolean;
  readonly text: string;
}

export const createForgePosts = (deps: ForgePostsDeps) => ({
  /** `actor`'s write on `repo` (its project's only one when none), as the session hears it. */
  async post(
    actor: InstanceRow,
    asked: { repo?: string; write: ForgeWrite }
  ): Promise<ForgeAnswer> {
    const links = deps.linksOf(actor.projectId ?? null);
    const repo = asked.repo ?? (links.length === 1 ? links[0] : undefined);
    if (!repo) {
      return {
        ok: false,
        text:
          links.length === 0
            ? "cawco: nothing was posted: this session's project has no repository of its own, so name one with repo."
            : `cawco: nothing was posted. This session's project has several repositories, so pass one as repo: ${links.join(", ")}.`,
      };
    }
    const called = await deps.call(actor.machineId, {
      repo,
      write: asked.write,
    });
    if (called.kind === "failed") {
      return { ok: false, text: called.why };
    }
    const { verdict } = called;
    switch (verdict.kind) {
      case "made":
        return { ok: verdict.made.ok, text: verdict.made.said };
      case "refused":
        return { ok: false, text: verdict.why };
      default:
        unhandled("verdict", verdict);
    }
  },
});
