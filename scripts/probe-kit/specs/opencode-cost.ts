/**
 * One OpenCode turn costs the same wherever CawCo reads it, read per commit
 * on a scratch fleet with OpenCode 2.0 on the mock, on a model CawCo prices
 * (`PRICED_OPENCODE_MODEL`, Claude Haiku 5.5 in OpenCode Zen's catalog).
 *
 * The turn's one request sends a 150,000-token prompt (120,000 of it a cache
 * read) and answers 1,000 tokens, so it is priced at Haiku 5.5's over-100k
 * tier. Two paths price it:
 *
 * (a) the agent's OpenCode adapter, per request, into the result frame's
 *     `turnUsage[].costUsd`, which the hub stores in `turn_usage.cost_usd`;
 * (b) the agent's usage scanner, reading the same message from OpenCode's
 *     database into the usage buckets the hub stores (`usage_buckets`).
 *
 * Both equal each other and the tier's price, and the result frame's
 * `total_cost_usd` (read off the session's transcript) is the same figure.
 *
 *   bun scripts/probe-kit/run.ts opencode-cost
 */
import { PRICED_OPENCODE_MODEL, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

/** The turn's prompt: the mock answers it, and only it, with {@link SPENT}. */
const PROMPT = "Price this turn.";

/**
 * OpenCode sends Zen's Claude models Anthropic messages, so the mock answers
 * in Anthropic's usage: 30,000 uncached input, 120,000 read from the cache,
 * 1,000 out.
 */
const SPENT = { prompt: 150_000, cached: 120_000, completion: 1000 };

/**
 * Haiku 5.5 over 100k, per million (https://platform.claude.com/docs/en/about-claude/pricing):
 * $0.50 input, $2.50 output, $0.05 cache read.
 */
const EXPECTED =
  ((SPENT.prompt - SPENT.cached) * 0.5 +
    SPENT.cached * 0.05 +
    SPENT.completion * 2.5) /
  1_000_000;

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const spec: Spec = {
  name: "opencode-cost",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet((request) =>
      request.last.includes(PROMPT)
        ? { everyMs: 5, words: ["priced"], usage: SPENT }
        : { everyMs: 5, words: ["Title"] }
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    const instanceId = await fleet.spawn("opencode", "Priced", fleet.workdir, {
      model: PRICED_OPENCODE_MODEL,
    });
    await fleet.send(instanceId, PROMPT);

    // (a) The hub's row for the turn, as the agent priced it.
    const [turn] = await until(
      "the turn's row in turn_usage",
      () =>
        fleet.query<{
          cache_read_tokens: number;
          cost_usd: number | null;
          input_tokens: number;
          model: string;
          output_tokens: number;
        }>(
          "SELECT model, input_tokens, output_tokens, cache_read_tokens, cost_usd FROM turn_usage WHERE instance_id = ?",
          instanceId
        ),
      (rows) => rows.length > 0,
      180_000
    );
    kit.note(`turn_usage: ${JSON.stringify(turn)}`);
    check(
      "(a) the hub stores the turn at Haiku 5.5's over-100k price, as the agent summed it per request",
      turn?.model === PRICED_OPENCODE_MODEL &&
        turn.cost_usd !== null &&
        close(turn.cost_usd, EXPECTED),
      `cost_usd ${turn?.cost_usd}, expected ${EXPECTED}`
    );

    // (b) The usage scanner's buckets for the same message (it runs a minute apart).
    const buckets = await until(
      "the scanner's bucket for the turn",
      () =>
        fleet.query<{
          cost_usd: number;
          messages: number;
          model: string;
          provider: string | null;
          reasoning_tokens: number;
        }>(
          "SELECT model, provider, messages, reasoning_tokens, cost_usd FROM usage_buckets WHERE harness = 'opencode' AND model = 'claude-haiku-5-5'"
        ),
      (rows) => rows.length > 0,
      180_000
    );
    kit.note(`usage_buckets: ${JSON.stringify(buckets)}`);
    const scanned = buckets.reduce((sum, row) => sum + row.cost_usd, 0);
    check(
      "(b) the usage scanner prices the same message to the same figure",
      turn?.cost_usd !== null &&
        turn?.cost_usd !== undefined &&
        close(scanned, turn.cost_usd),
      `scanner ${scanned}, turn_usage ${turn?.cost_usd}`
    );

    // The result frame's `total_cost_usd`, as the session's transcript keeps
    // it (`facts.totalCost`): cumulative, so the one turn's cost.
    const page = await fleet.api<{ facts?: { totalCost?: number | null } }>(
      `/api/instances/${instanceId}/transcript`
    );
    const total = page.facts?.totalCost;
    kit.note(`transcript facts.totalCost: ${total}`);
    check(
      "the turn's total_cost_usd is the sum of its turnUsage costs",
      typeof total === "number" &&
        turn?.cost_usd !== null &&
        turn?.cost_usd !== undefined &&
        close(total, turn.cost_usd),
      `total_cost_usd ${total}, turn_usage ${turn?.cost_usd}`
    );
  },
};

export default spec;
