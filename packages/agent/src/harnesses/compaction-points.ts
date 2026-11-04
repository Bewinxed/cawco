/**
 * Where each harness compacts a session on its own, in tokens of context:
 * what its result frame says as `compactsAt` (core harness.ts
 * `NeutralResultMessage`), which the hub files the session's open items
 * short of (hub at-limit.ts `fileDue`). Each is the harness's own rule, read
 * from the version CawCo installs; undefined when it compacts at no point it
 * says.
 */

/**
 * Claude Code 2.1.318 (bundled with `@anthropic-ai/claude-agent-sdk`
 * 0.3.318) compacts once a request's context reaches its auto-compact window
 * less the output it reserves, less 13,000: `var r9r=20000`, `function
 * Rne(e,n){let r=Math.min(e.maxOutputTokens,r9r),…,{window:h}=xb(e,s);return
 * h-r}`, `function Nee(e,n){let r=e-13000,…return r}`, and `if(r.enabled&&
 * e>=y)return{level:"compact",…}` with `y` that `Nee(Rne(…))`. Its window is
 * the model's context window unless the person set another
 * (`autoCompactWindow`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`), which this does
 * not read: 1M → 967,000, 200K → 167,000.
 */
const CLAUDE_OUTPUT_RESERVE_CAP = 20_000;
const CLAUDE_AUTO_COMPACT_MARGIN = 13_000;

export const claudeCompactsAt = (model: {
  contextWindow: number;
  maxOutputTokens: number;
}): number | undefined =>
  model.contextWindow > 0
    ? model.contextWindow -
      Math.min(model.maxOutputTokens, CLAUDE_OUTPUT_RESERVE_CAP) -
      CLAUDE_AUTO_COMPACT_MARGIN
    : undefined;

/**
 * pi 1.4.0 compacts once a session's context passes its model's window less
 * its compaction setting's reserve, when compaction is on
 * (`dist/core/compaction/compaction.js:173-176`: `if (!settings.enabled)
 * return false; return contextTokens > contextWindow -
 * settings.reserveTokens;`), the reserve the session's own setting, 16,384
 * by default (`dist/core/settings-defaults.js:10`).
 */
export const piCompactsAt = (
  contextWindow: number | undefined,
  settings: { enabled: boolean; reserveTokens: number }
): number | undefined =>
  settings.enabled && contextWindow && contextWindow > 0
    ? contextWindow - settings.reserveTokens
    : undefined;

/** OpenCode's own floor under its default buffer (`y5=16000` beside its compaction service). */
const OPENCODE_BUFFER_FLOOR = 16_000;

/**
 * OpenCode 2.0.29 compacts once a session's context reaches its model's
 * input limit (else its context limit) less its config's
 * `compaction.buffer` (1.x's `reserved` read as it), or by default less a
 * tenth of it, at least 16,000 on a window of 32,000 or more, when
 * `compaction.auto` is not false. Read from its binary
 * (`@opencode/cli-linux-x64` 2.0.29): `W0=(e,i)=>{let r=e.input||e.context;
 * if(r<=0)return Number.POSITIVE_INFINITY;if(i!==void 0)return r-i;return
 * r-Math.max(Math.floor(r*0.1),r>=2*y5?y5:0)}`, tested as
 * `if(te.reason==="auto"&&!k(le,W0(le.model.limit,oe.buffer)))return
 * {status:"skipped"}`, its buffer and `auto` each config document's in turn
 * (`l.configure({…auto…,…buffer…})` of `opencode.config.compaction`).
 */
export const opencodeCompactsAt = (
  limit: { context: number; input?: number },
  config: { auto?: boolean; buffer?: number }
): number | undefined => {
  if (config.auto === false) {
    return;
  }
  const usable = limit.input || limit.context;
  if (usable <= 0) {
    return;
  }
  if (config.buffer !== undefined) {
    return usable - config.buffer;
  }
  return (
    usable -
    Math.max(
      Math.floor(usable * 0.1),
      usable >= 2 * OPENCODE_BUFFER_FLOOR ? OPENCODE_BUFFER_FLOOR : 0
    )
  );
};
