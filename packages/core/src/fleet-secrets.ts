/**
 * A connector's secret is written and replaced, never read back. Every read of
 * the fleet's MCP servers (the hub's `GET /api/fleet`, the `fleet_mcp` socket
 * frame, the `admin_mcp_servers` tool, a machine's inspection) says a secret
 * as {@link SECRET_SET}: that it is set, and nothing of its value. The one
 * channel that carries the real values is the hub's sync to a machine
 * (hub `machineFleetItems`), which starts the connector.
 *
 * What is secret in a server's config:
 *
 * - every value under `env` and `headers`;
 * - the secret parts of `url`: a query parameter whose name reads as a
 *   credential ({@link SECRET_KEY}) or whose value looks like one
 *   ({@link looksSecret}), and the password of `user:password@host`.
 *   The read's `url` has those parts cut, and its `urlSecret` is
 *   {@link SECRET_SET} when any were.
 *
 * A write says what changed, and a secret it does not name stays
 * ({@link mergeMcpSecrets}):
 *
 * - a key left out of `env` or `headers` (or the whole map left out), or
 *   written as {@link SECRET_SET}, is not sent: the server keeps its value;
 * - a string replaces it (an empty string for a held key keeps it: a form's "not retyped";
 *   for any other key it is refused, as is any value that is no string);
 * - `null` clears it;
 * - a secret part written into `url` replaces its own, the others stay, and
 *   `urlSecret: null` clears every one.
 *
 * Nothing the server holds is carried to another host: a write that moves
 * `url` to another origin keeps none of its secrets, so a replaced address
 * never receives the old address's keys. Such a write that leaves a held
 * secret unnamed is refused, not trimmed.
 */
import type {
  ConfigInspection,
  DiscoveredMcp,
  FleetMcpConfig,
  FleetMcpServer,
} from "./fleet";
import { looksSecret, SECRET_KEY } from "./secret-shapes";
import type {
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from "./session-messages";

/** A secret as a read says it: set. Never a string, so it is never a value that could be saved back as one. */
interface SecretSet {
  readonly secret: "set";
}

const SECRET_SET: SecretSet = Object.freeze({ secret: "set" });

const isSecretSet = (value: unknown): value is SecretSet =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (value as { secret?: unknown }).secret === "set" &&
  Object.keys(value).length === 1;

/** A server's config as every read but a machine's sync says it. */
export type FleetMcpConfigView =
  | (Omit<McpStdioServerConfig, "env"> & {
      env?: Record<string, SecretSet>;
    })
  | (Omit<McpSSEServerConfig, "headers"> & {
      headers?: Record<string, SecretSet>;
      urlSecret?: SecretSet;
    })
  | (Omit<McpHttpServerConfig, "headers"> & {
      headers?: Record<string, SecretSet>;
      urlSecret?: SecretSet;
    });

/** What a write says of one secret: a string sets or replaces it, null clears it, {@link SECRET_SET} (or nothing) keeps it. */
type McpSecretWrite = string | null | SecretSet;

/** A server's config as a write says it (the hub's `PUT /api/fleet/mcp/:name`). */
export type FleetMcpConfigWrite =
  | (Omit<McpStdioServerConfig, "env"> & {
      env?: Record<string, McpSecretWrite>;
    })
  | (Omit<McpSSEServerConfig, "headers"> & {
      headers?: Record<string, McpSecretWrite>;
      urlSecret?: SecretSet | null;
    })
  | (Omit<McpHttpServerConfig, "headers"> & {
      headers?: Record<string, McpSecretWrite>;
      urlSecret?: SecretSet | null;
    });

/** A server as every read but a machine's sync says it. */
export type FleetMcpServerView = Omit<FleetMcpServer, "config"> & {
  config: FleetMcpConfigView;
};

const BARE_USERINFO = /^([a-z][a-z\d+.-]*:\/\/)([^/?#@:]+)@/iu;
const USERINFO = /^([a-z][a-z\d+.-]*:\/\/)([^/?#@:]*):([^/?#@]*)@/iu;

interface UrlParts {
  /** The URL with its secret parts cut. */
  open: string;
  /** The password of `user:password@`, when it has one. */
  password?: string;
  /** Each secret query part, as written (`name=value`). */
  query: string[];
}

const decoded = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const secretQueryPart = (part: string): boolean => {
  const at = part.indexOf("=");
  if (at < 1 || at === part.length - 1) {
    return false;
  }
  return (
    SECRET_KEY.test(decoded(part.slice(0, at))) ||
    looksSecret(decoded(part.slice(at + 1)))
  );
};

/** A URL split into what may be read and what may not. Taken as written: nothing is normalised. */
const splitUrl = (url: string): UrlParts => {
  const userinfo = USERINFO.exec(url);
  const bare = userinfo
    ? url.replace(USERINFO, `${userinfo[1]}${userinfo[2]}@`)
    : url;
  const hashAt = bare.indexOf("#");
  const beforeHash = hashAt === -1 ? bare : bare.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : bare.slice(hashAt);
  const queryAt = beforeHash.indexOf("?");
  if (queryAt === -1) {
    return {
      open: bare,
      query: [],
      ...(userinfo?.[3] ? { password: userinfo[3] } : {}),
    };
  }
  const parts = beforeHash.slice(queryAt + 1).split("&");
  const query = parts.filter(secretQueryPart);
  const kept = parts.filter((part) => !secretQueryPart(part));
  return {
    open: `${beforeHash.slice(0, queryAt)}${kept.length > 0 ? `?${kept.join("&")}` : ""}${hash}`,
    query,
    ...(userinfo?.[3] ? { password: userinfo[3] } : {}),
  };
};

/** A URL as a read says it: its secret parts cut. */
export const openUrl = (url: string): string => splitUrl(url).open;

const hasSecretParts = (parts: UrlParts): boolean =>
  parts.query.length > 0 || parts.password !== undefined;

/** Every secret value a server's config holds: each `env` and `headers` value, a URL's password and its secret query values. */
export const secretValuesOf = (config: FleetMcpConfig): string[] => {
  const record: Record<string, unknown> = { ...config };
  const values: string[] = [];
  for (const field of ["env", "headers"]) {
    for (const value of Object.values(mapOf(record[field]) ?? {})) {
      if (typeof value === "string") {
        values.push(value);
      }
    }
  }
  if (typeof record.url === "string") {
    const parts = splitUrl(record.url);
    if (parts.password) {
      values.push(parts.password, decoded(parts.password));
    }
    for (const part of parts.query) {
      const value = part.slice(part.indexOf("=") + 1);
      values.push(value, decoded(value));
    }
  }
  return values.filter((value) => value !== "");
};

/** `text` with every one of `secrets` cut out, so a status line never carries a server's value. */
export const withoutSecrets = (
  text: string,
  secrets: readonly string[]
): string =>
  [...new Set(secrets)]
    .sort((a, b) => b.length - a.length)
    .reduce((said, secret) => said.split(secret).join("(hidden)"), text);

const allSet = (record: Record<string, unknown>): Record<string, SecretSet> =>
  Object.fromEntries(Object.keys(record).map((key) => [key, SECRET_SET]));

/** A config as a read says it: every secret as set, none of its value. */
export const maskMcpConfig = (config: FleetMcpConfig): FleetMcpConfigView => {
  if ("url" in config && typeof config.url === "string") {
    const { headers, url, ...rest } = config;
    const parts = splitUrl(url);
    return {
      ...rest,
      url: parts.open,
      ...(headers ? { headers: allSet(headers) } : {}),
      ...(hasSecretParts(parts) ? { urlSecret: SECRET_SET } : {}),
    };
  }
  const { env, ...rest } = config as McpStdioServerConfig;
  return { ...rest, ...(env ? { env: allSet(env) } : {}) };
};

/** A machine's own server as a read says it. */
export type DiscoveredMcpView = Omit<DiscoveredMcp, "config"> & {
  config: FleetMcpConfigView;
};

/** What a machine has, as a read says it ({@link ConfigInspection}). */
export type ConfigInspectionView = Omit<ConfigInspection, "mcp"> & {
  mcp: DiscoveredMcpView[];
};

export const maskInspection = (
  inspection: ConfigInspection
): ConfigInspectionView => ({
  ...inspection,
  mcp: inspection.mcp.map((row) => ({
    ...row,
    config: maskMcpConfig(row.config),
  })),
});

/** A server as a read says it. */
export const maskMcpServer = (server: FleetMcpServer): FleetMcpServerView => ({
  ...server,
  config: maskMcpConfig(server.config),
});

/** The origin of a URL as written, or the text itself when it is none. */
const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};

/** The URL a write names, with the secret parts the server holds put back where the write did not name them. */
const restoredUrl = (sent: string, held: string): string => {
  const kept = splitUrl(held);
  if (!hasSecretParts(kept)) {
    return sent;
  }
  const own = splitUrl(sent);
  const nameOf = (part: string): string =>
    decoded(part.slice(0, part.indexOf("=")));
  const named = new Set(own.query.map(nameOf));
  const back = kept.query.filter((part) => !named.has(nameOf(part)));
  let url = sent;
  if (back.length > 0) {
    const hashAt = url.indexOf("#");
    const head = hashAt === -1 ? url : url.slice(0, hashAt);
    const tail = hashAt === -1 ? "" : url.slice(hashAt);
    url = `${head}${head.includes("?") ? "&" : "?"}${back.join("&")}${tail}`;
  }
  const bareUser = BARE_USERINFO.exec(url);
  if (kept.password !== undefined && bareUser) {
    url = url.replace(
      bareUser[0],
      `${bareUser[1]}${bareUser[2]}:${kept.password}@`
    );
  }
  return url;
};

/** A write's config with its secrets settled, as written (the route checks it names what starts it), or why not. */
export type KeptMcpSecrets =
  | { config: Record<string, unknown>; ok: true }
  | { ok: false; problem: string };

const mapOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** The map a write's secrets are in: a remote server's headers, else a command's env. */
const secretFieldOf = (sent: Record<string, unknown>): "env" | "headers" =>
  typeof sent.url === "string" ? "headers" : "env";

/** The secrets map a write names, and whether it writes one (it names a map, or none at all). */
const namesOf = (
  sent: Record<string, unknown>
): {
  field: "env" | "headers";
  named: Record<string, unknown> | undefined;
  writes: boolean;
} => {
  const field = secretFieldOf(sent);
  const named = mapOf(sent[field]);
  return {
    field,
    named,
    writes: named !== undefined || sent[field] === undefined,
  };
};

/**
 * What a write names of a field's secrets laid over what is held: `null`
 * clears a key, {@link SECRET_SET} keeps it (a key held nowhere is `missing`),
 * and any other value is `written`.
 */
const applyNamed = (
  held: Record<string, unknown>,
  named: Record<string, unknown>,
  written: (value: unknown) => unknown
):
  | { values: Record<string, unknown> }
  | { key: string; refused: "empty" | "missing" | "notText" } => {
  const values = { ...held };
  for (const [key, value] of Object.entries(named)) {
    if (value === null) {
      delete values[key];
    } else if (isSecretSet(value) || (value === "" && key in values)) {
      // The mark, or an empty value for a held key, keeps what is held: an
      // empty string is how a form says "not retyped", never a new secret.
      if (!(key in values)) {
        return { key, refused: "missing" };
      }
    } else if (value === "") {
      return { key, refused: "empty" };
    } else if (typeof value === "string") {
      values[key] = written(value);
    } else {
      return { key, refused: "notText" };
    }
  }
  return { values };
};

/** `out` with `field` set to `values`, or left out when none is left. */
const withField = (
  out: Record<string, unknown>,
  field: string,
  values: Record<string, unknown>
): void => {
  if (Object.keys(values).length > 0) {
    out[field] = values;
  } else {
    delete out[field];
  }
};

/** Whether what a server holds goes along with a write: only to where it was held for. */
const carriesHeld = (
  sentUrl: string | undefined,
  held: Record<string, unknown> | undefined
): boolean => {
  if (held === undefined) {
    return false;
  }
  if (sentUrl === undefined) {
    return true;
  }
  return (
    typeof held.url === "string" && originOf(sentUrl) === originOf(held.url)
  );
};

/**
 * The config a write names, carrying every secret it does not name from
 * `held` (the config the server has now). A secret said to be set that the
 * server holds none of, a value that is no string and an empty one are
 * problems, in the words `refusals` gives.
 */
export const mergeMcpSecrets = (
  sent: Record<string, unknown>,
  held: FleetMcpConfig | undefined,
  refusals: {
    dropped: (field: string, keys: string[]) => string;
    empty: (field: string, key: string) => string;
    missing: (field: string, key: string) => string;
    notText: (field: string, key: string) => string;
  }
): KeptMcpSecrets => {
  const heldRecord = held as Record<string, unknown> | undefined;
  const sentUrl = typeof sent.url === "string" ? sent.url : undefined;
  const carries = carriesHeld(sentUrl, heldRecord);
  const out: Record<string, unknown> = { ...sent };
  const { field, named, writes } = namesOf(sent);
  const { urlSecret } = out;
  // The other kind's secrets map is no field of this config: never stored.
  delete out[field === "headers" ? "env" : "headers"];
  const heldKeys = Object.keys(mapOf(heldRecord?.[field]) ?? {});
  if (!carries && sentUrl !== undefined) {
    // Another host receives none of the old secrets: a key not named anew
    // would be lost without a word, so the write is refused.
    const lost = heldKeys.filter((key) => {
      const value = named?.[key];
      return value === undefined || isSecretSet(value) || value === "";
    });
    const heldUrl = heldRecord?.url;
    if (
      typeof heldUrl === "string" &&
      urlSecret !== null &&
      hasSecretParts(splitUrl(heldUrl)) &&
      !hasSecretParts(splitUrl(sentUrl))
    ) {
      lost.push("url");
    }
    if (lost.length > 0) {
      return { ok: false, problem: refusals.dropped(field, lost) };
    }
  }
  if (writes) {
    const applied = applyNamed(
      (carries ? mapOf(heldRecord?.[field]) : undefined) ?? {},
      named ?? {},
      (value) => value
    );
    if ("refused" in applied) {
      return {
        ok: false,
        problem: refusals[applied.refused](field, applied.key),
      };
    }
    withField(out, field, applied.values);
  }
  const { urlSecret: _cut, ...rest } = out;
  const heldUrl = heldRecord?.url;
  if (
    sentUrl !== undefined &&
    urlSecret !== null &&
    carries &&
    typeof heldUrl === "string"
  ) {
    rest.url = restoredUrl(sentUrl, heldUrl);
  }
  return { ok: true, config: rest };
};

/** What an approval card says a secret's write did: a value in its place. */
const CARD_NEW = "(new value)";

/**
 * A write as an approval card reads it, beside the server as a read says it
 * (`held`): the config the write would leave, in the shape of
 * {@link FleetMcpConfigView}, a secret the write names standing as
 * {@link CARD_NEW} so a replaced one differs from the one it replaces and no
 * value the write carries is shown.
 */
export const cardOfMcpWrite = (
  sent: Record<string, unknown>,
  held: Record<string, unknown> | undefined
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...sent };
  const { field, named, writes } = namesOf(sent);
  if (writes) {
    // A key the card cannot see held is still said: the hub refuses it.
    const applied = applyNamed(
      mapOf(held?.[field]) ?? {},
      named ?? {},
      () => CARD_NEW
    );
    withField(
      out,
      field,
      "values" in applied ? applied.values : (mapOf(held?.[field]) ?? {})
    );
  }
  const { urlSecret, ...rest } = out;
  if (typeof rest.url === "string") {
    const parts = splitUrl(rest.url);
    rest.url = parts.open;
    if (hasSecretParts(parts)) {
      rest.urlSecret = CARD_NEW;
    } else if (urlSecret !== null && held?.urlSecret !== undefined) {
      rest.urlSecret = held.urlSecret;
    }
  }
  return rest;
};
