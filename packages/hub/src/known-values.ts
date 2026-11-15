/**
 * THE KNOWN VALUES. The exact secret values the hub mints or holds are
 * replaced where text enters the hub, so what it stores holds none and every
 * exit, present and future, carries clean text without knowing about
 * redaction. This is where the established tools do it: GitHub Actions'
 * runner masks a registered secret by its exact value, and Buildkite's
 * agent redacts matching values "before uploading job logs". No other text
 * is cut: prose, briefs, reports, questions and failure words go whole.
 *
 * WHAT IT KNOWS
 *
 * - **Every live session credential** (session-identity.ts mints each; the
 *   hub keeps only its sha256, `session_identities.credential_hash` and
 *   `pending_hash`). A token of a credential's shape (43 base64url
 *   characters standing on their own) whose sha256 is one of those becomes
 *   {@link CREDENTIAL_MARK}, the word the machine's own exit writes
 *   (packages/agent redaction.ts `outbound`). A revoked credential leaves
 *   the table, and is matched no more.
 * - **Every value a sealed column holds** (db/sealed-columns.ts): a sealed
 *   text column's value whole, and the leaves a sealed JSON column names as
 *   secret (`sealedJson`'s second argument): an MCP server's `env` and
 *   `headers` values and its URL's password and secret query values (core
 *   fleet-secrets.ts `secretValuesOf`), a token set's tokens and a client's
 *   secret, a harness setting's credentials (core secret-shapes.ts
 *   `credentialsIn`). A `Bearer x` value lists `x` too. Each becomes
 *   {@link SECRET_MARK}.
 *
 * ITS LIMITS
 *
 * - Values of {@link SHORTEST} characters or more only, so an ordinary word
 *   is never replaced (GitLab masks a variable of eight or more).
 * - For `env` and headers, only values whose names read as credentials
 *   (core `isSecretConfigName`), or whose value is a known token format
 *   (core `looksSecret`); in any other JSON, only a value under a
 *   credential's name (core `isSecretName`) or of a known token format. A
 *   `CHROME_PATH=/usr/bin/google-chrome` is no secret and stays in every
 *   transcript that names it.
 * - No file's path, under whatever name ({@link PATH}): a `GH_TOKEN_FILE` or
 *   an `apiKeyHelper` names where a credential is, and is none itself.
 * - Exact values only: an encoded, split or reworded value is not found
 *   (GitHub: "automatic redaction is not guaranteed"). A streamed piece is
 *   replaced frame by frame, so a value split across two pieces shows in the
 *   live reply being written; the written message arrives whole afterwards.
 * - Only what the hub knows: a host's own environment, files on a machine
 *   and what the person types are not.
 *
 * WHEN IT LEARNS. A credential is matched by its hash as each token is met,
 * so one minted, replaced or revoked counts at once. The sealed values are
 * read from every sealed column on first use, again after any write to one
 * (db/sealed-columns.ts `sealedGeneration`, moved by the columns themselves),
 * and at least every {@link REREAD_MS}, so a row deleted leaves the list too.
 *
 * WHERE IT RUNS: the entrances.
 *
 * - Every envelope a machine sends, before it is decoded, stored or copied
 *   (server.ts `agentMessage`).
 * - Every tool call's arguments, by MCP or the REST door, and its answer,
 *   which can relay an upstream's answer to a call the hub made with a key
 *   it holds: a connection's tool, a forge's, a model's (delegation-mcp.ts
 *   `answer`).
 * - A fleet MCP server's answers, relayed to a session from a call made
 *   with the hub's sign-in (fleet-mcp.ts, {@link knownInResponse}).
 * - A session's work-item bodies (routes/work-items.ts).
 * - A problem's `detail` as the hub answers it (server.ts `mapResponse`,
 *   `onError`).
 *
 * THE COMPILER HOLDS IT. What it replaced is a {@link Replaced} value, a
 * class with a private field that only this module makes; a machine's
 * frame is decoded only from one ({@link frameOf}; core `decodeAgentFrame`
 * is called nowhere else in the hub, scripts/lint/known-values-door.grit),
 * and the tool runner takes only one (delegation-mcp.ts `run`).
 */
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { type AgentFrame, decodeAgentFrame } from "@cawco/core/agent-frame";
import type { Envelope } from "@cawco/core/protocol";
import { type SealedColumn, sealedGeneration } from "./db/sealed-columns";

/** What a session credential reads as once it is replaced: the machine's own exit writes the same. */
export const CREDENTIAL_MARK = "[cawco credential]";

/** What a secret the hub holds sealed reads as once it is replaced. */
export const SECRET_MARK = "[cawco secret]";

/** The shortest value replaced: a shorter one could be an ordinary word. */
const SHORTEST = 8;

/** How long the sealed values are read again after at the latest: a deleted row leaves the list in this time. Our choice. */
const REREAD_MS = 60_000;

/**
 * A token with a session credential's shape (32 random bytes, base64url:
 * session-identity.ts), standing on its own in the text around it.
 */
const CREDENTIAL_TOKEN =
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/gu;

/** A header value that carries its token after the scheme. */
const BEARER = /^bearer\s+(\S+)$/iu;

/** The regular expression's own characters, escaped. */
const SPECIAL = /[.*+?^${}()|[\]\\]/gu;

/** The one maker of a {@link Replaced} value; set by the class itself, called by this module alone. */
let made: <T>(value: T, count: number) => Replaced<T>;

/**
 * A value whose strings, at any depth, have had every known value replaced
 * (module). What the hub's entrances pass on: TypeScript reads a class with
 * a `#` field nominally, so no other value is one.
 */
export class Replaced<T> {
  readonly #value: T;
  /** How many values were replaced in it. */
  readonly count: number;

  private constructor(value: T, count: number) {
    this.#value = value;
    this.count = count;
  }

  static {
    made = <V>(value: V, count: number) => new Replaced<V>(value, count);
  }

  /** The value, with every known value replaced. */
  get value(): T {
    return this.#value;
  }
}

/** A machine's frame as the hub reads it, decoded from its envelope once its known values are replaced. */
export const frameOf = (message: Replaced<Envelope>): AgentFrame =>
  decodeAgentFrame(message.value.payload);

export interface KnownValues {
  /**
   * `value` with every known value replaced in each of its strings, at any
   * depth, in place: an entrance's own copy of what arrived (a parsed frame,
   * a call's arguments, a request's body). Object keys are left as they are.
   */
  readonly replaced: <T extends object>(value: T) => Replaced<T>;
  /** `text` with every known value replaced. */
  readonly text: (text: string) => string;
}

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/** A file's path: what a setting under a credential's name can hold (a `*_TOKEN_FILE`, an `apiKeyHelper`), and no credential itself. */
const PATH = /^(?:~|\.{0,2})\//u;

/** The values `secrets` lists, each as it is replaced: {@link SHORTEST} or longer and no path, a `Bearer x`'s `x` beside it. */
const listed = (secrets: readonly string[]): string[] =>
  secrets.flatMap((secret) => {
    const token = BEARER.exec(secret)?.[1];
    return [secret, ...(token ? [token] : [])].filter(
      (value) => value.length >= SHORTEST && !PATH.test(value)
    );
  });

/** How the sealed values are read: every sealed column (db/sealed-columns.ts `sealedColumns`), and the hub's key to open each (secret-box.ts). */
export interface SealedReader {
  readonly columns: readonly SealedColumn[];
  /** The plain text of `sealed`; throws when the key does not open it. */
  readonly open: (sealed: string) => string;
}

/** One pattern matching every value of `values`, the longest first so a value inside another is not replaced first; none for no values. */
const patternOf = (values: Iterable<string>): RegExp | undefined => {
  const sorted = [...values].sort((a, b) => b.length - a.length);
  return sorted.length > 0
    ? new RegExp(
        sorted.map((value) => value.replace(SPECIAL, "\\$&")).join("|"),
        "gu"
      )
    : undefined;
};

/**
 * The sealed values' pattern, as the sealed columns hold them now: read
 * again when a sealed column was written ({@link sealedGeneration}) or the last
 * read is {@link REREAD_MS} old. Each sealed text is opened once; one gone
 * from its column is forgotten.
 */
const sealedPattern = (
  client: Database,
  sealed: SealedReader | undefined
): (() => RegExp | undefined) => {
  if (!sealed) {
    return () => undefined;
  }
  const reads = sealed.columns.map((column) => ({
    column,
    query: client.query<{ sealed: string }, []>(
      `SELECT "${column.column}" AS sealed FROM "${column.table}" WHERE "${column.column}" IS NOT NULL`
    ),
  }));
  /** What each sealed value opened to, by its sealed text. */
  const opened = new Map<string, readonly string[]>();
  const secretsOf = (column: SealedColumn, text: string): readonly string[] => {
    try {
      return listed(column.secretsOf(sealed.open(text)));
    } catch {
      return [];
    }
  };
  let read: { at: number; generation: number; pattern: RegExp | undefined } = {
    at: Number.NEGATIVE_INFINITY,
    generation: -1,
    pattern: undefined,
  };
  return () => {
    const now = Date.now();
    if (read.generation === sealedGeneration() && now - read.at < REREAD_MS) {
      return read.pattern;
    }
    const current = new Map<string, readonly string[]>();
    for (const { column, query } of reads) {
      for (const row of query.all()) {
        current.set(
          row.sealed,
          opened.get(row.sealed) ?? secretsOf(column, row.sealed)
        );
      }
    }
    opened.clear();
    for (const [text, secrets] of current) {
      opened.set(text, secrets);
    }
    read = {
      at: now,
      generation: sealedGeneration(),
      pattern: patternOf([...opened.values()].flat()),
    };
    return read.pattern;
  };
};

/**
 * The known values of the hub whose database is `client`: its session
 * credentials, by their hashes in it, and, given `sealed`, every value its
 * sealed columns hold. A sealed value the key does not open is no secret
 * the hub can know, and is left out. Without `sealed` (a count read with
 * no key, scripts/known-values-count.ts) the sealed values are not known.
 */
export const createKnownValues = (
  client: Database,
  sealed?: SealedReader
): KnownValues => {
  const heldHash = client.query<{ held: number }, [string]>(
    "SELECT 1 AS held FROM session_identities WHERE credential_hash = ?1 OR pending_hash = ?1 LIMIT 1"
  );
  const pattern = sealedPattern(client, sealed);

  /** `text` replaced, and how many values were. */
  const replacedText = (text: string): { text: string; count: number } => {
    if (text.length < SHORTEST) {
      return { text, count: 0 };
    }
    let count = 0;
    const held = pattern();
    const unsealed = held
      ? text.replace(held, () => {
          count += 1;
          return SECRET_MARK;
        })
      : text;
    const out = unsealed.replace(CREDENTIAL_TOKEN, (token) => {
      if (!heldHash.get(sha256(token))) {
        return token;
      }
      count += 1;
      return CREDENTIAL_MARK;
    });
    return { text: count > 0 ? out : text, count };
  };

  /** Every string of `node`, at any depth, replaced in place; how many values were. */
  const walk = (node: object): number => {
    let count = 0;
    for (const key of Object.keys(node)) {
      const child: unknown = Reflect.get(node, key);
      if (typeof child === "string") {
        const done = replacedText(child);
        if (done.count > 0) {
          count += done.count;
          Reflect.set(node, key, done.text);
        }
      } else if (typeof child === "object" && child !== null) {
        count += walk(child);
      }
    }
    return count;
  };

  return {
    replaced: <T extends object>(value: T): Replaced<T> =>
      made(value, walk(value)),
    text: (text) => replacedText(text).text,
  };
};

/** A body's types that carry words: JSON, an event stream, any text. */
const WORDS = /^(?:text\/|application\/(?:[\w.+-]*\+)?json)/iu;

/**
 * `response` with every known value replaced in its body, line by line as
 * it streams (an event stream's lines arrive whole, each replaced as it
 * ends), when its body is words: an upstream's answer to a call the hub
 * made with a key it holds, relayed to a session (fleet-mcp.ts). Its length
 * is no longer the upstream's, so `Content-Length` goes. Any other answer is
 * left as it is.
 */
export const knownInResponse = (
  known: KnownValues,
  response: Response
): Response => {
  const type = response.headers.get("Content-Type") ?? "";
  if (!(response.body && WORDS.test(type))) {
    return response;
  }
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        buffer += decoder.decode(chunk, { stream: true });
        const end = buffer.lastIndexOf("\n");
        if (end === -1) {
          return;
        }
        controller.enqueue(
          encoder.encode(known.text(buffer.slice(0, end + 1)))
        );
        buffer = buffer.slice(end + 1);
      },
      flush: (controller) => {
        buffer += decoder.decode();
        if (buffer) {
          controller.enqueue(encoder.encode(known.text(buffer)));
        }
      },
    })
  );
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
