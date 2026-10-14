/**
 * THE MODEL CATALOG EVERY OPENCODE SERVER CAWCO STARTS RUNS ON, held by the
 * agent: OpenCode's models.dev catalog (`<source>/api.json`), fetched here
 * and written to one file each server is launched on (`OPENCODE_MODELS_PATH`,
 * with the server's own fetch off), so a server runs exactly the catalog
 * CawCo read and nothing older.
 *
 * Why the agent holds it. OpenCode 2.0.28 (and 2.0.29) keeps the catalog it
 * loaded in memory and reloads it only when its own five-minute refresh finds
 * the copy cached in its database changed; one that finds the copy already
 * fresh (another process sharing that database fetched first) keeps what it
 * had. Two generations of a CawCo server share their database while one
 * replaces the other, and the machine's shares the owner's own `opencode`'s:
 * a server kept a catalog sending Zen's free models to
 * `https://opencode.ai/zen/v1` after the catalog moved them to
 * `/inference/v1` (models.dev 6f8c48ffc, 2026-10-12), where Zen refuses them
 * ("OpenCode's free tier can only be used from within OpenCode"; observed on
 * 2026-10-14, reproduced with two servers on one data dir). A server with no
 * cached copy whose first fetch fails (10 s, no retry) runs the catalog
 * bundled in the binary, which still names `/zen/v1`. Upstream's fix
 * (anomalyco/opencode#45363) was closed unmerged.
 *
 * OpenCode's own switches are honoured as OpenCode reads them: with
 * `OPENCODE_DISABLE_MODELS_FETCH` set, or a catalog file of the owner's
 * (`OPENCODE_MODELS_PATH`), the agent holds none and the servers run on what
 * those say; `OPENCODE_MODELS_URL` names the source, as it does for OpenCode.
 */
import { createHash } from "node:crypto";
import { readFile, stat, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeStateFile } from "@cawco/core/state-file";
import { delegationHubUrl } from "../delegation";

/** Where OpenCode 2.0.28 reads its catalog from (`models.url`, else its own `https://models.opencode.ai`). */
export const OPENCODE_MODELS_SOURCE =
  process.env.OPENCODE_MODELS_URL || "https://models.opencode.ai";

/** How often the held catalog is read again: OpenCode's own refresh period (2.0.28's `ModelsDev` ttl, five minutes). */
const REFRESH_MS = 5 * 60_000;

/**
 * One read's limit. Ours: OpenCode's own is 10 s, which the 5.6 MB catalog
 * missed on obelisk several times a day (its log, 2026-10-13/14); a minute
 * outlasts a slow link without holding a session's start for long.
 */
const FETCH_TIMEOUT_MS = 60_000;

/** Pauses before each read of one refresh: three reads, the later ones after a moment. Ours. */
const ATTEMPT_DELAYS_MS = [0, 2000, 8000];

/** One provider of the catalog, as far as CawCo reads it. */
interface CatalogProvider {
  env?: unknown;
  models?: Record<string, unknown>;
}

type Catalog = Record<string, CatalogProvider>;

/** The file every server is launched on, beside the plugin it loads: one per hub this agent serves. */
export const opencodeModelsFile = (): string =>
  join(
    homedir(),
    ".cawco",
    "hub-opencode",
    new URL(delegationHubUrl()).host.replaceAll(":", "_"),
    "models.json"
  );

/** Whether the agent holds the catalog: not when OpenCode's own switches say where it comes from. */
export const holdsCatalog = (): boolean =>
  !(
    process.env.OPENCODE_DISABLE_MODELS_FETCH ||
    process.env.OPENCODE_MODELS_PATH
  );

/** What a server is launched with for its catalog: the held file, its own fetch off; nothing when the agent holds none. */
export const catalogLaunchEnv = (): Record<string, string> =>
  holdsCatalog()
    ? {
        OPENCODE_MODELS_PATH: opencodeModelsFile(),
        OPENCODE_DISABLE_MODELS_FETCH: "1",
      }
    : {};

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Deterministic JSON: object keys sorted at every level. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
};

class OpencodeModels {
  #catalog: Catalog | undefined;
  /** The source's tag for the held copy, for a read that asks only whether it changed. */
  #etag: string | undefined;
  /** When the held copy was last confirmed the source's, epoch ms. */
  #confirmedAt = 0;
  #loaded: Promise<void> | null = null;
  #reading: Promise<void> | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  /** The file as the last agent left it. */
  #load(): Promise<void> {
    this.#loaded ??= (async () => {
      const file = opencodeModelsFile();
      const text = await readFile(file, "utf8").catch(() => undefined);
      if (text === undefined) {
        return;
      }
      try {
        this.#catalog = this.#parse(text);
        this.#confirmedAt = (await stat(file)).mtimeMs;
      } catch (error) {
        console.warn(
          `[opencode] the held model catalog ${file} is not one (${said(error)}); it is read again from ${OPENCODE_MODELS_SOURCE}`
        );
      }
    })();
    return this.#loaded;
  }

  #parse(text: string): Catalog {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !("opencode" in parsed)
    ) {
      throw new Error("it names no `opencode` provider");
    }
    return parsed as Catalog;
  }

  /** One read of the source: unchanged (`304`), or the new copy written. */
  async #readOnce(): Promise<void> {
    const response = await fetch(`${OPENCODE_MODELS_SOURCE}/api.json`, {
      headers:
        this.#etag && this.#catalog ? { "if-none-match": this.#etag } : {},
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const file = opencodeModelsFile();
    if (response.status === 304 && this.#catalog) {
      const now = new Date();
      await utimes(file, now, now).catch(() => undefined);
      this.#confirmedAt = now.getTime();
      return;
    }
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const catalog = this.#parse(text);
    await writeStateFile(file, text);
    this.#catalog = catalog;
    this.#etag = response.headers.get("etag") ?? undefined;
    this.#confirmedAt = Date.now();
  }

  /** The source read again (one read at a time), {@link ATTEMPT_DELAYS_MS} apart; throws the last failure. */
  refresh(): Promise<void> {
    this.#reading ??= (async () => {
      await this.#load();
      let last: unknown;
      for (const delay of ATTEMPT_DELAYS_MS) {
        if (delay) {
          // biome-ignore lint/performance/noAwaitInLoops: each read waits out the one before it
          await Bun.sleep(delay);
        }
        try {
          await this.#readOnce();
          return;
        } catch (error) {
          last = error;
        }
      }
      throw new Error(
        `OpenCode's model catalog could not be read from ${OPENCODE_MODELS_SOURCE}/api.json (${said(last)}, ${ATTEMPT_DELAYS_MS.length} tries)`
      );
    })().finally(() => {
      this.#reading = null;
    });
    return this.#reading;
  }

  /** The held copy, read from the source first when there is none: what a server starts on. */
  async ready(): Promise<void> {
    await this.#load();
    if (!this.#catalog) {
      await this.refresh();
    }
    this.#start();
  }

  /**
   * The held copy confirmed the source's now: what a session's first turn
   * runs on. Its refusal says what could not be read and how old the held
   * copy is: a session does not run on a catalog it cannot confirm.
   */
  async current(): Promise<void> {
    await this.#load();
    try {
      await this.refresh();
    } catch (error) {
      const held = this.#catalog
        ? `the copy CawCo holds was last confirmed ${new Date(this.#confirmedAt).toISOString()}`
        : "CawCo holds no copy";
      throw new Error(
        `${said(error)}, and ${held}. A new OpenCode session runs only on the catalog as it is now, since that decides where each model's requests go; nothing was started.`,
        { cause: error }
      );
    }
    this.#start();
  }

  /**
   * A fingerprint of `providers`' entries in the held copy: what a server's
   * launch carries, so a server is replaced when a provider it serves
   * changed and not for the rest of the catalog, which changes many times a
   * day (models.dev's hourly syncs).
   */
  digest(providers: Iterable<string>): string {
    const catalog = this.#catalog ?? {};
    const entries = Object.fromEntries(
      [...new Set(providers)].sort().map((id) => [id, catalog[id] ?? null])
    );
    return createHash("sha256")
      .update(canonical(entries))
      .digest("hex")
      .slice(0, 16);
  }

  /** The providers whose key OpenCode takes from an environment variable set in `env`. */
  providersKeyedIn(env: NodeJS.ProcessEnv): string[] {
    return Object.entries(this.#catalog ?? {}).flatMap(([id, provider]) =>
      Array.isArray(provider.env) &&
      provider.env.some((name) => typeof name === "string" && env[name])
        ? [id]
        : []
    );
  }

  /** The held copy read again every {@link REFRESH_MS}, once started; a failure is said and the copy kept. */
  #start(): void {
    if (this.#timer) {
      return;
    }
    this.#timer = setInterval(() => {
      this.refresh().catch((error: unknown) =>
        console.warn(`[opencode] ${said(error)}; the held copy stays`)
      );
    }, REFRESH_MS);
    this.#timer.unref();
  }
}

/** The agent's one catalog. */
export const opencodeModels = new OpencodeModels();
