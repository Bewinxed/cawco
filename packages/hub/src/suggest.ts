import type { JevResult } from "@whiffle/core/workflow-program";
import type { DbShape } from "./db";
import { askJev } from "./jev";
import { usageScores } from "./usage-count";

/** Suggestions answer while the reader types, so they are asked briefly. */
const SUGGEST_TIMEOUT_MS = 10_000;

/**
 * Composer suggestions: which of the session's skills, tools and MCP servers
 * the prompt being typed would need, as Jev judges it. Text the operator may
 * add to the prompt — the harness's tool set is never touched.
 */

/** A noul at or above this is shown as a chip. Our own call, to be tuned. */
export const SUGGEST_THRESHOLD = 0.6;
/** The most chips shown at once. Our own call, to be tuned. */
export const SUGGEST_MAX = 4;
/** The most candidates Jev is asked about, ranked by the operator's usage. */
export const SUGGEST_CANDIDATE_LIMIT = 50;
/** A skill installed this recently is always asked about, so it can earn usage. */
const NEW_SKILL_DAYS = 7;
const DAY_MS = 86_400_000;

/** Tools every session has and never needs pointing at. */
export const NEVER_SUGGEST_TOOLS = new Set([
  "Read",
  "Edit",
  "Write",
  "Bash",
  "Grep",
  "Glob",
  "TodoWrite",
  "ToolSearch",
  "Skill",
]);

export interface SuggestCandidate {
  description: string;
  id: string;
  kind: "skill" | "tool" | "mcp";
  name: string;
}

/**
 * The name a candidate's usage is recorded under. MCP usage is keyed by the
 * `mcp__<server>__` tool-name prefix, which is the server's display name with
 * everything outside `[A-Za-z0-9_-]` replaced by `_` (`Exa.ai` → `Exa_ai`).
 */
function usageName(candidate: SuggestCandidate): string {
  return candidate.kind === "mcp"
    ? candidate.name.replace(/[^A-Za-z0-9_-]/g, "_")
    : candidate.name;
}

/**
 * The candidates worth asking about: the top {@link SUGGEST_CANDIDATE_LIMIT}
 * by each one's share of its own kind's usage, never-used ones dropped except
 * skills installed in the last {@link NEW_SKILL_DAYS} days. An MCP server's own
 * tools (`mcp__<server>__…`) are never candidates: the server's chip stands for
 * them, and its description already lists their names — asking about both
 * filled the chip row with one server three times.
 *
 * Share within kind, not raw score: tool calls outnumber skill invocations by
 * ~270× (measured on the owner's last 30 days), so raw decayed scores cannot
 * be compared across kinds — a combined top 50 by raw score was almost all
 * browser tools and dropped 37 of 47 used skills. Dividing each score by its
 * kind's total lets a skill that is 20% of skill use compete fairly with a
 * tool that is 20% of tool use.
 */
export function rankCandidates(
  db: DbShape,
  candidates: SuggestCandidate[]
): SuggestCandidate[] {
  const scores = usageScores(db);
  const fresh = new Set(
    db.skillsInstalledSince(new Date(Date.now() - NEW_SKILL_DAYS * DAY_MS))
  );
  const scored = candidates
    .filter(
      (candidate) =>
        !(
          candidate.kind === "tool" &&
          (NEVER_SUGGEST_TOOLS.has(candidate.name) ||
            candidate.name.startsWith("mcp__"))
        )
    )
    .map((candidate) => ({
      candidate,
      score: scores.get(`${candidate.kind}:${usageName(candidate)}`) ?? 0,
      fresh: candidate.kind === "skill" && fresh.has(candidate.name),
    }));
  const kindTotal = { skill: 0, tool: 0, mcp: 0 };
  for (const entry of scored) {
    kindTotal[entry.candidate.kind] += entry.score;
  }
  return scored
    .filter((entry) => entry.score > 0 || entry.fresh)
    .map((entry) => ({
      ...entry,
      share: entry.score / (kindTotal[entry.candidate.kind] || 1),
    }))
    .sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.share - a.share)
    .slice(0, SUGGEST_CANDIDATE_LIMIT)
    .map((entry) => entry.candidate);
}

/**
 * One systemone call, one noul per ranked candidate. Structured instructions
 * keep the question in one field and the candidate in the others
 * (https://docs.typesafe.ai/api.md).
 */
export async function suggest(
  db: DbShape,
  key: string,
  text: string,
  candidates: SuggestCandidate[]
): Promise<
  { suggestions: { id: string; noul: number }[] } | { error: string }
> {
  const asked = rankCandidates(db, candidates);
  if (asked.length === 0) {
    return { suggestions: [] };
  }
  const questions: Record<
    string,
    { type: "noul"; instructions: Record<string, unknown> }
  > = Object.fromEntries(
    asked.map((candidate) => [
      candidate.id,
      {
        type: "noul" as const,
        instructions: {
          candidate: {
            kind: candidate.kind,
            name: candidate.name,
            description: candidate.description,
          },
          // "Would the agent need to use" scored deep-research 0.39 for
          // "we should really research this"; this wording scored it 0.74
          // and kept typo/rename/commit prompts under the threshold.
          question: "Is `candidate` made for the task `prompt` describes?",
        },
      },
    ])
  );
  let result: JevResult<typeof questions>;
  try {
    result = await askJev(key, { prompt: text }, questions, {
      timeoutMs: SUGGEST_TIMEOUT_MS,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  console.debug(
    `[suggest] ${asked.length} of ${candidates.length} candidates asked, ${result.usage.inputTokens} input tokens, cost=$${result.usage.costUsd}`
  );
  // One chip per capability: a name offered as both an MCP server and a skill
  // (claude-in-chrome) keeps only its likelier entry.
  const named = new Set<string>();
  return {
    suggestions: asked
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name.toLowerCase(),
        noul: result.answers[candidate.id].noul,
      }))
      .filter((entry) => entry.noul >= SUGGEST_THRESHOLD)
      .sort((a, b) => b.noul - a.noul)
      .filter((entry) => {
        if (named.has(entry.name)) {
          return false;
        }
        named.add(entry.name);
        return true;
      })
      .slice(0, SUGGEST_MAX)
      .map(({ id, noul }) => ({ id, noul })),
  };
}
