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
 * e>=y)return{level:"compact",…}` with `y` that `Nee(Rne(…))`.
 *
 * `configured` is the auto-compact window the session was handed: CawCo
 * sets `autoCompactWindow` on every session (claude.ts `SESSION_DEFAULTS`,
 * a fleet row's own over it), and `CLAUDE_CODE_AUTO_COMPACT_WINDOW` in its
 * env wins over that. The window is then the model's context window capped
 * at it, its source "settings" (or "env"), in `xb`'s order:
 * `let h=vtn(i.CLAUDE_CODE_AUTO_COMPACT_WINDOW);if(h!==void 0)return{window:
 * Math.min(s,h),configured:h,source:"env"}`, then
 * `if(y!==void 0&&y!=="auto")return{window:Math.min(s,y),configured:y,source:
 * "settings"}`. A window of either source is one Claude Code enforces on
 * every model: it skips the threshold only on a window of source "auto"
 * (`if(J$()&&!DEe(n,r)&&!S)return!1` with `function DEe(e,n){return
 * xb(e,n).source!=="auto"}`). A 1M window handed 1,000,000 compacts at
 * 967,000, a 200K one at 167,000.
 */
const CLAUDE_OUTPUT_RESERVE_CAP = 20_000;
const CLAUDE_AUTO_COMPACT_MARGIN = 13_000;

export const claudeCompactsAt = (
  model: { contextWindow: number; maxOutputTokens: number },
  configured: number
): number | undefined =>
  model.contextWindow > 0
    ? Math.min(model.contextWindow, configured) -
      Math.min(model.maxOutputTokens, CLAUDE_OUTPUT_RESERVE_CAP) -
      CLAUDE_AUTO_COMPACT_MARGIN
    : undefined;

/** The least and most auto-compact window Claude Code takes (`cI=1e5`, `FN=1e6`). */
const CLAUDE_WINDOW_MIN = 100_000;
const CLAUDE_WINDOW_MAX = 1_000_000;
/** What a `k` or an `m` at the end of a window's count multiplies it by. */
const CLAUDE_WINDOW_SUFFIX: Partial<Record<string, number>> = {
  k: 1000,
  m: 1_000_000,
};

/**
 * The window `CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets, as Claude Code 2.1.318
 * reads it: a count with an optional `k` or `m`, held to 100,000–1,000,000,
 * none when it is not a count (`function vtn(e){…let n=p9e(e);switch(n.kind)
 * {case"in_range":return n.tokens;case"below_minimum":return cI;case
 * "above_maximum":return FN;case"unusable":return}}`, `p9e` being `Jwe(e,
 * {bareThousands:!1})`: `let r=e.trim(),s=r.slice(-1).toLowerCase(),h=s==="m"
 * ?1e6:s==="k"?1000:void 0,y=h===void 0?Bf(r):parseFloat(r)*h,…
 * if(Number.isNaN(w)||w<1)return{kind:"unusable"}`).
 */
export const claudeEnvWindow = (
  value: string | undefined
): number | undefined => {
  if (value === undefined) {
    return;
  }
  const trimmed = value.trim();
  const scale = CLAUDE_WINDOW_SUFFIX[trimmed.slice(-1).toLowerCase()];
  const tokens =
    scale === undefined
      ? Number.parseInt(trimmed, 10)
      : Number.parseFloat(trimmed) * scale;
  if (Number.isNaN(tokens) || tokens < 1) {
    return;
  }
  return Math.min(
    CLAUDE_WINDOW_MAX,
    Math.max(CLAUDE_WINDOW_MIN, Math.round(tokens))
  );
};

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

/** OpenCode's own floor under its default buffer (`mm=16000` beside its compaction service). */
const OPENCODE_BUFFER_FLOOR = 16_000;

/** The share of the window OpenCode keeps free by default (`AR=0.15` beside it). */
const OPENCODE_BUFFER_SHARE = 0.15;

/**
 * OpenCode 2.3.0 compacts once a session's context reaches its model's
 * usable window (the smaller of its input and context limits when it has
 * both, else whichever it has) less its config's `compaction.buffer`: a
 * token count, or a share of the window such as "20%" (2.3.0's schema,
 * `Config.Compaction.Percent`). A buffer of the whole window or more, or
 * none, leaves the default: less 15% of it, at least 16,000 on a window of
 * 32,000 or more. Nothing when `compaction.auto` is false. Read from its
 * binary (`@opencode/cli-linux-x64` 2.3.0): `lm=(e,a)=>{let s=Gw(e);
 * if(s<=0)return Number.POSITIVE_INFINITY;let r=typeof a==="string"?
 * Math.round(s*Number.parseFloat(a)/100):a;if(r!==void 0&&r<s)return s-r;
 * return s-Math.max(Math.floor(s*AR),s>=2*mm?mm:0)}` with `Gw=(e)=>e.input&&
 * e.context?Math.min(e.input,e.context):e.input||e.context`, tested as
 * `if(Ge.reason==="auto"&&!L(Te,lm(Te.model.limit,Se.buffer),Ge.estimate))
 * return{status:"skipped"}`, its buffer and `auto` each config document's in
 * turn (`m.configure({…auto…,…buffer…})` of `y.info.compaction`).
 */
export const opencodeCompactsAt = (
  limit: { context: number; input?: number },
  config: { auto?: boolean; buffer?: string | number }
): number | undefined => {
  if (config.auto === false) {
    return;
  }
  const usable =
    limit.input && limit.context
      ? Math.min(limit.input, limit.context)
      : limit.input || limit.context;
  if (usable <= 0) {
    return;
  }
  const buffer =
    typeof config.buffer === "string"
      ? Math.round((usable * Number.parseFloat(config.buffer)) / 100)
      : config.buffer;
  if (buffer !== undefined && buffer < usable) {
    return usable - buffer;
  }
  return (
    usable -
    Math.max(
      Math.floor(usable * OPENCODE_BUFFER_SHARE),
      usable >= 2 * OPENCODE_BUFFER_FLOOR ? OPENCODE_BUFFER_FLOOR : 0
    )
  );
};
