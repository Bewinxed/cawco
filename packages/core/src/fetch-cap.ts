/**
 * How many requests a CawCo process's `fetch` has under way at once. Every
 * CawCo Bun process starts with it at Bun's ceiling, however it is started:
 * each service unit (cli service.ts `environment`), each update helper's job
 * (agent helper-jobs.ts, the wrapper's resume, binary-wrapper.ts), each
 * process a rig starts (scripts/binary/smoke-stack.ts).
 * The hub and the agent say at start when they find it lower
 * ({@link sayFetchCap}): one started by hand, without it.
 *
 * Bun takes it from its environment as the process starts and nowhere else:
 * "`BUN_CONFIG_MAX_HTTP_REQUESTS` Sets the maximum number of concurrent HTTP
 * requests sent by `fetch` and `bun install`. `fetch` defaults to `256`"
 * (bun.com/docs/runtime/environment-variables); "When the limit is exceeded,
 * Bun queues requests and sends them as soon as the next request ends. … The
 * max value for this limit is 65,535" (bun.com/docs/runtime/networking/fetch).
 * Its source reads it once, from the start's environment (src/http/
 * AsyncHTTP.rs `load_env`: `env.get(b"BUN_CONFIG_MAX_HTTP_REQUESTS")` into
 * the static `MAX_SIMULTANEOUS_REQUESTS`), which nothing in JavaScript sets;
 * no bunfig key and no runtime flag a compiled binary can carry
 * (`--compile-exec-argv`) sets it. Measured on Bun 1.4.4: `process.env` set
 * before the first fetch leaves 256; with 256 answers open the next fetch
 * was not sent in 3 s; at 65535, 1000 open and the next answered in 0 ms; a
 * `Bun.FetchSession` counts against the same cap.
 *
 * The hub and the agent relay streams that stay open for as long as what
 * they serve: the agent's gateway each session's MCP streams to the hub
 * (agent mcp-oauth.ts `relayMcp`), the hub its dashboard, previews and
 * fleet servers. At 256 their own short requests waited behind them: a
 * workspace create's ask where its project's large files live (agent
 * host-lfs.ts `askHub`) ran out its 15 s unsent (obelisk, 2026-11-01). What
 * bounds the relays now is the process's open files.
 *
 * No process CawCo hands its environment to gets it (session-env.ts): in a
 * `bun install` it would replace the install's own 64.
 */
import { fetchCapWords } from "./words/fetch-cap";

export const FETCH_CAP = {
  name: "BUN_CONFIG_MAX_HTTP_REQUESTS",
  value: "65535",
} as const;

/** `env` with the cap set: the environment a CawCo Bun process is started with. */
export const withFetchCap = <T extends Record<string, string | undefined>>(
  env: T
): T & Record<typeof FETCH_CAP.name, string> => ({
  ...env,
  [FETCH_CAP.name]: FETCH_CAP.value,
});

/**
 * Says, once, as `who` starts, that this process runs below the cap: it was
 * started without {@link FETCH_CAP}, and Bun read its environment already.
 * Nothing when it has it.
 */
export const sayFetchCap = (
  who: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): void => {
  const set = env[FETCH_CAP.name];
  if (set !== FETCH_CAP.value) {
    console.warn(
      fetchCapWords.capped(who, FETCH_CAP.name, FETCH_CAP.value, set)
    );
  }
};
