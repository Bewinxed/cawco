import snapshot from "./pricing-snapshot.json";
import type { UsageTokens } from "./types";

/**
 * Cost basis for one model on one provider, in USD per token. models.dev
 * publishes per-million rates; everything is divided by 1e6 on load. A cache
 * rate the source omits is one the provider does not bill, so none is
 * recorded, except where the provider documents one: Anthropic's 1-hour
 * cache write, "2x base input price"
 * (https://platform.claude.com/docs/en/about-claude/pricing), which
 * models.dev does not publish. A cache read the source omits is derived as
 * `input * 0.1` (ccusage pricing.rs:916-922).
 */
export interface ModelRates {
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  input: number;
  output: number;
}

interface SnapshotModel {
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  input: number;
  output: number;
}

export interface PricingSnapshot {
  generatedAt?: string;
  /** Rates by `provider/model`, per million tokens. */
  models: Record<string, SnapshotModel>;
  source?: string;
}

const PER_MILLION = 1_000_000;
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MODELS_DEV_URL = "https://models.dev/api.json";

/**
 * The providers whose models.dev catalogs price turns: Anthropic's (Claude
 * Code's models), OpenCode Zen's (`opencode`), OpenCode Go's, DeepSeek's own
 * API, and OpenAI's (ChatGPT's models, through OpenCode's `openai` and pi's
 * `openai-codex`). Each is kept under its own id: one model sold by two
 * providers costs what each charges. A turn on any other provider has no
 * price ({@link missingPricing}).
 */
const CATALOGS = ["anthropic", "opencode", "opencode-go", "deepseek", "openai"];

/** The provider a model id names when it names none: Claude Code's bare `claude-*`. */
const BARE_PROVIDER = "anthropic";

/**
 * Provider ids that are another's catalog under a harness's own name: pi's
 * `openai-codex` is ChatGPT's sign-in to OpenAI's models, OpenCode's `openai`
 * (agent provider-accounts.ts `opencodeProviderOf`).
 */
const PROVIDER_ALIASES: Record<string, string> = {
  "openai-codex": "openai",
};

/**
 * Alias table ported from ccusage `pricing_alias` (pricing.rs:2072-2078), the
 * only hardcoded aliases ccusage ships, applied within a provider.
 */
const MODEL_ALIASES: Record<string, string> = {
  "gpt-5.6": "gpt-5.6-sol",
  "gpt-5.3-spark": "gpt-5.3-codex-spark",
};

/** Claude Code's context-window suffix on a model id: `[1m]`. */
const CONTEXT_SUFFIX = /\[[^\]]*\]$/;

/**
 * DeepSeek's clock. Its models cost twice as much at peak, on DeepSeek's own
 * API and on OpenCode Go alike, and models.dev lists the off-peak rates:
 * - "Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00
 *   and 06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public
 *   holidays." (https://api-docs.deepseek.com/quick_start/pricing/)
 * - "DeepSeek V4.1 Flash / V4 Pro / V4 Flash / V4 Flash Vision Exp: Peak
 *   hours are 01:00-04:00 and 06:00-10:00 UTC, Monday through Friday; all
 *   other hours, including weekends, are Off-Peak." (https://opencode.ai/docs/go)
 * DeepSeek's own API keeps a Chinese public holiday off-peak all day
 * ({@link CHINESE_HOLIDAYS}); OpenCode Go names no such exception.
 */
const PEAK = {
  providers: new Set(["deepseek", "opencode-go"]),
  /** The providers whose peak skips Chinese public holidays. */
  holidaysOff: new Set(["deepseek"]),
  model: /^deepseek-/,
  /** UTC hours, start inclusive, end exclusive. */
  hours: [
    [1, 4],
    [6, 10],
  ] as const,
  factor: 2,
};

/**
 * China's public holidays, by China date, as the State Council sets them
 * each November for the year after. 2026: 国务院办公厅关于2026年部分节假日安排的通知
 * (国办发明电〔2025〕7号, https://www.gov.cn/zhengce/content/202511/content_7047090.htm):
 * "元旦：1月1日（周四）至3日（周六）… 春节：2月15日…至23日… 清明节：4月4日…至6日…
 * 劳动节：5月1日…至5日… 端午节：6月19日…至21日… 中秋节：9月25日…至27日…
 * 国庆节：10月1日…至7日". Each year's notice adds its dates here.
 */
const CHINESE_HOLIDAYS: readonly (readonly [string, string])[] = [
  ["2026-01-01", "2026-01-03"],
  ["2026-02-15", "2026-02-23"],
  ["2026-04-04", "2026-04-06"],
  ["2026-05-01", "2026-05-05"],
  ["2026-06-19", "2026-06-21"],
  ["2026-09-25", "2026-09-27"],
  ["2026-10-01", "2026-10-07"],
];

/** China's date (UTC+8) at `at`, `YYYY-MM-DD`. */
const chinaDate = (at: number): string =>
  new Date(at + 8 * 3_600_000).toISOString().slice(0, 10);

const chineseHoliday = (at: number): boolean => {
  const day = chinaDate(at);
  return CHINESE_HOLIDAYS.some(([first, last]) => day >= first && day <= last);
};

const RATES: Map<string, ModelRates> = new Map();
let lastRefreshAttempt = 0;

function loadFromSnapshot(json: PricingSnapshot): void {
  RATES.clear();
  for (const [id, m] of Object.entries(json.models)) {
    const input = m.input / PER_MILLION;
    const documented1h = id.startsWith(`${BARE_PROVIDER}/`) ? input * 2 : 0;
    RATES.set(id, {
      input,
      output: m.output / PER_MILLION,
      cacheWrite: (m.cacheWrite ?? 0) / PER_MILLION,
      cacheWrite1h:
        m.cacheWrite1h === undefined
          ? documented1h
          : m.cacheWrite1h / PER_MILLION,
      cacheRead:
        m.cacheRead === undefined ? input * 0.1 : m.cacheRead / PER_MILLION,
    });
  }
}

loadFromSnapshot(snapshot as PricingSnapshot);

/**
 * Model ids a pricing lookup could not resolve. A miss prices at 0 and records
 * the id here; the API surfaces it. Never invent a fallback rate.
 */
export const missingPricing = new Set<string>();

/** A model id's provider and model: `provider/model`, or a bare Claude id. */
const split = (id: string): { model: string; provider: string } => {
  const modelId = id.replace(CONTEXT_SUFFIX, "");
  const slash = modelId.indexOf("/");
  if (slash === -1) {
    return { provider: BARE_PROVIDER, model: modelId };
  }
  const provider = modelId.slice(0, slash);
  return {
    provider: PROVIDER_ALIASES[provider] ?? provider,
    model: modelId.slice(slash + 1),
  };
};

/** Whether `at` is in DeepSeek's peak hours (UTC, Monday through Friday). */
const inPeak = (at: number): boolean => {
  const when = new Date(at);
  const day = when.getUTCDay();
  if (day === 0 || day === 6) {
    return false;
  }
  const hour = when.getUTCHours();
  return PEAK.hours.some(([start, end]) => hour >= start && hour < end);
};

/**
 * What the provider's clock multiplies the model's listed rates by at `at`:
 * {@link PEAK}'s factor for a DeepSeek model in its peak hours, else 1.
 */
export function clockFactor(id: string, at: number): number {
  const { provider, model } = split(id);
  const peak =
    PEAK.providers.has(provider) &&
    PEAK.model.test(model) &&
    inPeak(at) &&
    !(PEAK.holidaysOff.has(provider) && chineseHoliday(at));
  return peak ? PEAK.factor : 1;
}

/** The provider's listed rates for the model: exact → alias → normalized (`claude-sonnet-4.5` → `claude-sonnet-4-5`). */
const listed = (provider: string, model: string): ModelRates | undefined => {
  const exact = RATES.get(`${provider}/${model}`);
  if (exact) {
    return exact;
  }
  const alias = MODEL_ALIASES[model];
  const aliased = alias ? RATES.get(`${provider}/${alias}`) : undefined;
  if (aliased) {
    return aliased;
  }
  const normalized = model.replace(/[.@]/g, "-");
  return normalized === model
    ? undefined
    : RATES.get(`${provider}/${normalized}`);
};

/**
 * What a model costs on its provider at `at` (epoch ms): `id` is
 * `provider/model`, or a bare Claude id, Anthropic's. Only that provider's
 * catalog prices it, with its clock applied ({@link clockFactor}); null when
 * the provider lists no price for it. Claude Code's context suffix
 * (`claude-opus-5-5[1m]`) is dropped first: "Claude 4.6 and later models …
 * include the full 1M token context window at standard pricing"
 * (https://platform.claude.com/docs/en/about-claude/pricing).
 */
export function resolveRates(id: string, at: number): ModelRates | null {
  const { provider, model } = split(id);
  const rates = listed(provider, model);
  if (!rates) {
    return null;
  }
  const factor = clockFactor(id, at);
  return factor === 1
    ? rates
    : {
        input: rates.input * factor,
        output: rates.output * factor,
        cacheRead: rates.cacheRead * factor,
        cacheWrite: rates.cacheWrite * factor,
        cacheWrite1h: rates.cacheWrite1h * factor,
      };
}

/**
 * `cost = input*rIn + output*rOut + cacheCreation*rCacheWrite + cacheRead*rCacheRead`
 * at the rates of `at`. No long-context tier. A miss returns 0 and records
 * the id in {@link missingPricing}.
 */
export function costForUsage(
  modelId: string,
  tokens: UsageTokens,
  at: number
): number {
  const rates = resolveRates(modelId, at);
  if (!rates) {
    missingPricing.add(modelId);
    return 0;
  }
  return (
    tokens.input * rates.input +
    tokens.output * rates.output +
    tokens.cacheCreation * rates.cacheWrite +
    tokens.cacheRead * rates.cacheRead
  );
}

/** One turn's tokens, cache writes split by their lifetime. */
export interface TurnTokens {
  cacheRead: number;
  cacheWrite1h: number;
  cacheWrite5m: number;
  input: number;
  output: number;
}

/** A turn at its provider's rates when it ran (`at`); null when the provider lists none for the model. */
export function costForTurn(
  modelId: string,
  tokens: TurnTokens,
  at: number
): number | null {
  const rates = resolveRates(modelId, at);
  if (!rates) {
    missingPricing.add(modelId);
    return null;
  }
  return (
    tokens.input * rates.input +
    tokens.output * rates.output +
    tokens.cacheRead * rates.cacheRead +
    tokens.cacheWrite5m * rates.cacheWrite +
    tokens.cacheWrite1h * rates.cacheWrite1h
  );
}

/**
 * Refresh the in-memory rates from models.dev, at most once per 24h. On failure
 * the bundled snapshot stays in place; never blocks a scan. Offline works.
 */
export async function refreshPricing(): Promise<number> {
  const now = Date.now();
  if (now - lastRefreshAttempt < REFRESH_INTERVAL_MS) {
    return RATES.size;
  }
  lastRefreshAttempt = now;

  let res: Response;
  try {
    res = await fetch(MODELS_DEV_URL);
  } catch {
    return RATES.size;
  }
  if (!res.ok) {
    return RATES.size;
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return RATES.size;
  }

  const filtered = filterModelsDev(raw);
  if (Object.keys(filtered.models).length === 0) {
    return RATES.size;
  }
  loadFromSnapshot(filtered);
  return RATES.size;
}

/**
 * models.dev's {@link CATALOGS} as rates keyed `provider/model`. The bundled
 * snapshot is this function's output (`bun run pricing` in packages/core).
 */
export function filterModelsDev(raw: unknown): PricingSnapshot {
  interface Provider {
    models?: Record<
      string,
      {
        cost?: {
          input?: number;
          output?: number;
          cache_write?: number;
          cache_write_1h?: number;
          cache_read?: number;
        };
      }
    >;
  }
  const models: Record<string, SnapshotModel> = {};
  for (const provider of CATALOGS) {
    const catalog = (raw as Record<string, Provider>)[provider];
    if (!catalog?.models) {
      continue;
    }
    for (const [id, m] of Object.entries(catalog.models)) {
      const { cost } = m;
      if (!cost || cost.input === undefined || cost.output === undefined) {
        continue;
      }
      const entry: SnapshotModel = { input: cost.input, output: cost.output };
      if (cost.cache_write_1h !== undefined) {
        entry.cacheWrite1h = cost.cache_write_1h;
      }
      if (cost.cache_write !== undefined) {
        entry.cacheWrite = cost.cache_write;
      }
      if (cost.cache_read !== undefined) {
        entry.cacheRead = cost.cache_read;
      }
      models[`${provider}/${id}`] = entry;
    }
  }
  return { source: MODELS_DEV_URL, models };
}
