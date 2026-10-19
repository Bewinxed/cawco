/**
 * A session's `forge_post` (docs/forge-adapters.md): an issue, a pull or
 * merge request, or a comment on any forge, made on the session's machine by
 * that forge's adapter with the machine's own sign-in there (agent
 * forges/forge.ts, `CONTROL_FORGE_POST`). The hub hands the machine the
 * project's rule and the repository, the project's own when the session
 * names none; the machine decides by core `decideWrite` as every door does,
 * and answers what came of it. A write held under "Ask me first" becomes the
 * person's ask here (upstream-asks.ts), the forge named on its card, and is
 * made once, by the same machine, when they approve it.
 */
import type { InstanceRow } from "@cawco/core";
import type { UpstreamRule } from "@cawco/core/upstream-guard";
import type {
  ForgeAsk,
  ForgeVerdict,
  ForgeWrite,
} from "@cawco/core/upstream-post";
import type { UpstreamAsks } from "./upstream-asks";

/** What a machine's forge call came to: its verdict, or why there is none. */
export type ForgeCall =
  { kind: "answered"; verdict: ForgeVerdict } | { kind: "failed"; why: string };

export interface ForgePostsDeps {
  /** Raises a held post as the person's ask (upstream-asks.ts). */
  readonly ask: UpstreamAsks["ask"];
  /** Has `machineId` decide and make the write (agent `CONTROL_FORGE_POST`). */
  readonly call: (
    machineId: string,
    rule: UpstreamRule,
    ask: ForgeAsk
  ) => Promise<ForgeCall>;
  /** The project's own repository, `host/owner/repo`, when it has one. */
  readonly remoteOf: (projectId: string | null) => string | undefined;
  /** The rule the session's project goes by (upstream.ts). */
  readonly ruleOf: (projectId: string | null) => UpstreamRule;
}

/** What the session reads, and whether the write went or waits. */
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
    const called = await deps.call(
      actor.machineId,
      deps.ruleOf(actor.projectId ?? null),
      { repo, write: asked.write }
    );
    if (called.kind === "failed") {
      return { ok: false, text: called.why };
    }
    const { verdict } = called;
    switch (verdict.kind) {
      case "made":
        return { ok: verdict.made.ok, text: verdict.made.said };
      case "refused":
        return { ok: false, text: verdict.why };
      case "held":
        return {
          ok: true,
          text: deps.ask(
            actor,
            {
              post: verdict.post,
              repo: verdict.post.repo,
              what: verdict.what,
              machineId: actor.machineId,
            },
            verdict.account
          ),
        };
      default: {
        const unhandled: never = verdict;
        throw new Error(`unhandled verdict: ${JSON.stringify(unhandled)}`);
      }
    }
  },
});

export type ForgePosts = ReturnType<typeof createForgePosts>;
