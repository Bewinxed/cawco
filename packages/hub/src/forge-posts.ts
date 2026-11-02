/**
 * A session's `forge_post` (docs/forge-adapters.md): an issue, a pull or
 * merge request, or a comment on any forge, made on the session's machine by
 * that forge's adapter with the machine's own sign-in there (agent
 * forges/forge.ts, `CONTROL_FORGE_POST`). The hub hands the machine the
 * repository, the project's own when the session names none, and answers
 * what came of it.
 */
import type { InstanceRow } from "@cawco/core";
import type {
  ForgeAsk,
  ForgeVerdict,
  ForgeWrite,
} from "@cawco/core/forge-post";
import { unhandled } from "@cawco/core/unhandled";

/** What a machine's forge call came to: its verdict, or why there is none. */
type ForgeCall =
  { kind: "answered"; verdict: ForgeVerdict } | { kind: "failed"; why: string };

export interface ForgePostsDeps {
  /** Has `machineId` make the write (agent `CONTROL_FORGE_POST`). */
  readonly call: (machineId: string, ask: ForgeAsk) => Promise<ForgeCall>;
  /** The project's own repository, `host/owner/repo`, when it has one. */
  readonly remoteOf: (projectId: string | null) => string | undefined;
}

/** What the session reads, and whether the write went. */
export interface ForgeAnswer {
  readonly ok: boolean;
  readonly text: string;
}

export const createForgePosts = (deps: ForgePostsDeps) => ({
  /** `actor`'s write on `repo` (its project's own when none), as the session hears it. */
  async post(
    actor: InstanceRow,
    asked: { repo?: string; write: ForgeWrite }
  ): Promise<ForgeAnswer> {
    const repo = asked.repo ?? deps.remoteOf(actor.projectId ?? null);
    if (!repo) {
      return {
        ok: false,
        text: "cawco: nothing was posted: this session's project has no repository of its own, so name one with repo.",
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
