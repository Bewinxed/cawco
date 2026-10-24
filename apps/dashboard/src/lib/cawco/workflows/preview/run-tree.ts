/**
 * Run 12 as its delegation tree: the orchestrator's root, then each planned
 * step joined to its work item by the `step` id (grey while none stands for
 * it), and, where the orchestrator went past the plan, an unplanned row.
 */
import { KIND_WORD, RUN_12, STEPS, WORKFLOW } from "./release";
import type { TreeNode } from "./WfTree.svelte";

const TONE = {
  done: "done",
  live: "live",
  attn: "attn",
  fail: "fail",
  idle: "idle",
  planned: "idle",
} as const;

export const ROOT_LINE = "v3 · 3 of 5 steps · $0.41";

export function runTree({
  phone = false,
  drift = false,
}: {
  phone?: boolean;
  /** Option D: the run against the kept tree, its unplanned step marked. */
  drift?: boolean;
} = {}): TreeNode {
  const kids: TreeNode[] = STEPS.map((step) => {
    const lit = RUN_12.find((one) => one.step === step.id);
    const planned = lit?.status === "planned";
    let line = lit?.line ?? "";
    if (lit?.harness && !phone) {
      line = `${lit.harness} · ${lit.model} · ${lit.line}`;
    }
    return {
      id: step.id,
      title: phone ? step.short : step.title,
      mark: step.kind === "agent" ? "session" : step.kind,
      status: !lit || lit.status === "planned" ? "idle" : lit.status,
      planned,
      tag: step.kind === "agent" ? step.who : KIND_WORD[step.kind],
      line,
      pill: lit
        ? {
            tone: TONE[lit.status],
            words: lit.took ? `${lit.phase} · ${lit.took}` : lit.phase,
          }
        : undefined,
      trail: lit?.took,
    };
  });
  if (drift) {
    kids.splice(2, 0, {
      id: "verify-tag",
      title: "Verify the tag",
      mark: "session",
      status: "live",
      unplanned: true,
      line: phone ? "Not in v3" : "Not in v3 · the orchestrator started it",
      pill: { tone: "live", words: "Working · 20s" },
      trail: "20s",
    });
  }
  return {
    id: "release-run-12",
    title: phone ? `${WORKFLOW} · run 12` : `Workflow · ${WORKFLOW} · run 12`,
    mark: "session",
    status: "live",
    line: ROOT_LINE,
    trail: "4m",
    kids,
  };
}

/** Run 10 as it ended: answered beta, and the smoke test failed. */
export function endedTree(phone = false): TreeNode {
  const ended: Record<string, { status: "done" | "fail"; line: string; took: string; phase: string }> = {
    notes: { status: "done", line: "Notes cover 2.2 → 2.3: 11 merged PRs", took: "58s", phase: "Done" },
    links: { status: "done", line: "Every link answers 200", took: "41s", phase: "Done" },
    post: { status: "done", line: "slack-brand · post · approved at start", took: "1s", phase: "Posted" },
    channel: { status: "done", line: "You answered beta", took: "3m", phase: "Answered" },
    smoke: { status: "fail", line: "2 of 41 failed: login, export", took: "2m", phase: "Failed" },
  };
  return {
    id: "release-run-10",
    title: phone ? `${WORKFLOW} · run 10` : `Workflow · ${WORKFLOW} · run 10`,
    mark: "session",
    status: "fail",
    line: "v2 · 4 of 5 steps · $0.63",
    trail: "7m",
    kids: STEPS.map((step) => {
      const one = ended[step.id];
      return {
        id: `r10-${step.id}`,
        title: phone ? step.short : step.title,
        mark: step.kind === "agent" ? "session" : step.kind,
        status: one?.status ?? "idle",
        tag: step.kind === "agent" ? step.who : KIND_WORD[step.kind],
        line: one?.line,
        pill: one
          ? { tone: one.status, words: `${one.phase} · ${one.took}` }
          : undefined,
        trail: one?.took,
      };
    }),
  };
}
