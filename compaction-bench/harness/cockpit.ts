/**
 * The bench's one door into a cockpit checkout (`--cockpit-root`): the
 * product's own code, imported by path, never copied. One verb per call, the
 * input as JSON on stdin, the answer as JSON on stdout.
 *
 *   price     each request priced on its own: `costForUsage` (pricing.ts) on
 *             its tokens with every cache write at the 5-minute rate, plus the
 *             1-hour part's difference at `resolveRates(...).cacheWrite1h`. A
 *             model the product has no price for is an error, never 0.
 *   forecast  `tokensPerPercent` and `weightedTokens` (hub forecast.ts).
 *   classify  what each text is as a stored user turn (`sentRow`, core
 *             transcript-rules.ts): "user" is the person's words, "user.peer"
 *             a hand-off (a parent's words); anything else is cawco's own.
 *   focus     `COMPACT_FOCUS` (hub open-items.ts) without its last sentence,
 *             the focus §A1 of the design sends with `/compact`.
 *   tokens    core continuation.ts `estimateTokens` of each character count.
 *
 * Usage: bun run cockpit.ts <verb> <cockpit-root> < input.json
 */
const [verb, root] = process.argv.slice(2);
if (!(verb && root)) {
  console.error("usage: bun run cockpit.ts <price|forecast|classify|focus> <cockpit-root>");
  process.exit(2);
}
const input = verb === "focus" ? null : JSON.parse(await Bun.stdin.text());

interface PriceRequest {
  at: number;
  cacheCreation: number;
  cacheRead: number;
  cacheWrite1h: number;
  input: number;
  model: string;
  output: number;
}

switch (verb) {
  case "price": {
    const { costForUsage, resolveRates } = await import(
      `${root}/packages/core/src/usage/pricing.ts`
    );
    const priced = (input.requests as PriceRequest[]).map((r) => {
      const rates = resolveRates(r.model, r.at);
      if (!rates) {
        return { error: `the product has no price for ${r.model}` };
      }
      const usd =
        costForUsage(
          r.model,
          {
            input: r.input,
            output: r.output,
            cacheCreation: r.cacheCreation,
            cacheRead: r.cacheRead,
            reasoning: 0,
          },
          r.at
        ) +
        r.cacheWrite1h * (rates.cacheWrite1h - rates.cacheWrite);
      return { usd, rates };
    });
    console.log(JSON.stringify({ priced }));
    break;
  }
  case "forecast": {
    const { tokensPerPercent, weightedTokens } = await import(
      `${root}/packages/hub/src/forecast.ts`
    );
    const turns = (input.turns as Record<string, unknown>[]).map((t) => ({
      ...t,
      at: new Date(t.at as number),
    }));
    const windows = (input.windows as { kind: string; scopeLabel: string | null }[]).map(
      (window) => ({
        ...window,
        tokensPerPct: tokensPerPercent(window, input.history, turns, input.accountId),
      })
    );
    const weighted = (input.weigh as Record<string, number>[]).map((t) =>
      weightedTokens({ at: new Date(0), ...t })
    );
    console.log(JSON.stringify({ windows, weighted }));
    break;
  }
  case "classify": {
    // The message carries the harness's typed notice as the agent's normaliser puts it there (agent
    // claude-transcript.ts `harnessNoteOf`): a `<task-notification>` is typed off the message, never off its
    // words, so a bare { role, content } would let it pass as the person's. Claude Code's interrupt line is
    // its own word too (core `interruptLine`), reported as "interrupt".
    const { sentRow, interruptLine } = await import(`${root}/packages/core/src/transcript-rules.ts`);
    const { harnessNoteOf } = await import(`${root}/packages/agent/src/harnesses/claude-transcript.ts`);
    const types = (input.texts as string[]).map((text) => {
      if (interruptLine(text)) {
        return "interrupt";
      }
      const harnessNote = harnessNoteOf(text);
      return sentRow(text, { role: "user", content: text, ...(harnessNote ? { harnessNote } : {}) }, {
        id: "",
        instanceId: "",
      }).type;
    });
    console.log(JSON.stringify({ types }));
    break;
  }
  case "tokens": {
    // core continuation.ts `estimateTokens`: the product's own count of a text's tokens from its characters
    const { estimateTokens } = await import(`${root}/packages/core/src/continuation.ts`);
    console.log(JSON.stringify({ tokens: (input.chars as number[]).map((n) => estimateTokens(n)) }));
    break;
  }
  case "focus": {
    const { COMPACT_FOCUS } = await import(`${root}/packages/hub/src/open-items.ts`);
    const sentences = (COMPACT_FOCUS as string).match(/[^.]+\./g) ?? [];
    if (sentences.length < 2) {
      throw new Error("COMPACT_FOCUS no longer has the sentence the design drops");
    }
    console.log(JSON.stringify({ focus: sentences.slice(0, -1).join("").trim() }));
    break;
  }
  default:
    console.error(`unknown verb ${verb}`);
    process.exit(2);
}
