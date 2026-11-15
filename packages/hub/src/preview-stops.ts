import { unhandled } from "@cawco/core/unhandled";
import { problem } from "elysia";
import { awayProblem, silentProblem } from "./machine-answers";
import type { createPreviewPorts } from "./preview-ports";
import type { ProblemsOf } from "./refusal";

/**
 * What kept a machine's preview from being served, as its answer says it
 * ({@link stopProblem}): its machine away, named, or silent past its
 * deadline; paused, the hub's own hold on the machine; the preview closed,
 * its artifact's own state; or `failed`, the machine's failure (its start
 * or its listener's page answered one, or the way to its listener did not
 * open).
 */
export type PreviewStop =
  | { kind: "away"; machineId: string }
  | { kind: "silent" }
  | { kind: "paused" }
  | { kind: "closed" }
  | { kind: "failed" };

/**
 * A preview's stop answered at `code` in `detail`'s words, by the owner's
 * machine-status rule: its machine away is {@link awayProblem}, naming it;
 * silent, {@link silentProblem}; paused, the hub's own 409
 * `preview-machine-paused`; closed, 409; the machine's failure, 502.
 */
export const stopProblem = <Code extends string>(
  stop: PreviewStop,
  code: Code,
  detail: string
) => {
  switch (stop.kind) {
    case "away":
      return awayProblem(stop.machineId, detail);
    case "silent":
      return silentProblem(detail);
    case "paused":
      return problem(409, { code: "preview-machine-paused", detail });
    case "closed":
      return problem(409, { code, detail });
    case "failed":
      return problem(502, { code, detail });
    default:
      return unhandled("preview stop", stop);
  }
};

/** What the hub's own origin for a frame answers when it serves none: its listeners' problem (preview.ts `embed` and `address`, each its port's open), or the artifact gone. */
type OriginProblem =
  | ProblemsOf<ReturnType<ReturnType<typeof createPreviewPorts>["open"]>>
  | ReturnType<
      typeof problem<409, { code: "preview-artifact-gone"; detail: string }>
    >;

/**
 * What kept an open from showing its artifact: what stopped its machine's
 * preview ({@link PreviewStop}), or the hub's own origin for its frame not
 * served (`origin`, its problem).
 */
export type OpenStop = PreviewStop | { kind: "origin"; problem: OriginProblem };

/**
 * An open's stop answered at `code` in `detail`'s words: the hub's own
 * origin's problem as it is, a machine preview's stop by the machine-status
 * rule ({@link stopProblem}).
 */
export const openProblem = <Code extends string>(
  stop: OpenStop,
  code: Code,
  detail: string
) => (stop.kind === "origin" ? stop.problem : stopProblem(stop, code, detail));
