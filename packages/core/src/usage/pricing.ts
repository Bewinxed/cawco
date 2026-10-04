import snapshot from "./pricing-snapshot.json";
import type { UsageTokens } from "./types";

/**
 * Cost basis for one model, in USD per token. models.dev publishes per-million
 * rates; everything is divided by 1e6 on load. Cache rates omitted by the source
 * are derived: cacheWrite = input * 1.25, cacheRead = input * 0.1 (ccusage
 * pricing.rs:916-922).
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

interface PricingSnapshot {
  generatedAt?: string;
  models: Record<string, SnapshotModel>;
  source?: string;
}

const PER_MILLION = 1_000_000;
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MODELS_DEV_URL = "https://models.dev/api.json";

/**
 * Alias table ported from ccusage `pricing_alias` (pricing.rs:2072-2078), the
 * only hardcoded aliases ccusage ships. The local corpora carry no aliased ids
 * today; this stays ready for them.
 */
const MODEL_ALIASES: Record<string, string> = {
  "gpt-5.6": "gpt-5.6-sol",
  "gpt-5.3-spark": "gpt-5.3-codex-spark",
};

const RATES: Map<string, ModelRates> = new Map();
let lastRefreshAttempt = 0;

function loadFromSnapshot(json: PricingSnapshot): void {
  RATES.clear();
  for (const [id, m] of Object.entries(json.models)) {
    const input = m.input / PER_MILLION;
    const output = m.output / PER_MILLION;
    RATES.set(id, {
      input,
      output,
      cacheWrite1h:
        m.cacheWrite1h === undefined ? input * 2 : m.cacheWrite1h / PER_MILLION,
      cacheWrite:
        m.cacheWrite === undefined ? input * 1.25 : m.cacheWrite / PER_MILLION,
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

/**
 * Resolution order (USAGE-SPEC.md §4.3): exact → alias table → normalized
 * (`claude-sonnet-4.5` → `claude-sonnet-4-5`) → `provider/model` → give up.
 */
export function resolveRates(modelId: string): ModelRates | null {
  const exact = RATES.get(modelId);
  if (exact) {
    return exact;
  }

  const alias = MODEL_ALIASES[modelId];
  if (alias) {
    const aliased = RATES.get(alias);
    if (aliased) {
      return aliased;
    }
  }

  const normalized = modelId.replace(/[.@]/g, "-");
  if (normalized !== modelId) {
    const match = RATES.get(normalized);
    if (match) {
      return match;
    }
  }

  const slash = modelId.lastIndexOf("/");
  if (slash !== -1) {
    const bare = RATES.get(modelId.slice(slash + 1));
    if (bare) {
      return bare;
    }
  }

  return null;
}

/**
 * `cost = input*rIn + output*rOut + cacheCreation*rCacheWrite + cacheRead*rCacheRead`
 * (USAGE-SPEC.md §4.3). No long-context tier in v1 (§8). A miss returns 0 and
 * records the id in {@link missingPricing}.
 */
export function costForUsage(modelId: string, tokens: UsageTokens): number {
  const rates = resolveRates(modelId);
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

/** Same providers and key scheme the bundled snapshot generator used. */
function filterModelsDev(raw: unknown): PricingSnapshot {
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
  const providers = ["anthropic", "opencode", "opencode-go"];
  const models: Record<string, SnapshotModel> = {};
  for (const provider of providers) {
    const catalog = (raw as Record<string, Provider>)[provider];
    if (!catalog?.models) {
      continue;
    }
    const prefix = provider === "opencode-go" ? "opencode-go/" : "";
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
      models[prefix + id] = entry;
    }
  }
  return { source: MODELS_DEV_URL, models };
}
