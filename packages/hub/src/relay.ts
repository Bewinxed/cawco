/**
 * The relay (Projects spec §5.5 Relay, P3): a push-only service delivers to
 * CawCo through one public path, `/hooks/<id>`, and nothing else of the hub
 * is reachable from the internet.
 *
 * THE INVARIANTS:
 * - **One path, its own listener.** The receiver is a listener of its own in
 *   the hub process, on 127.0.0.1 and a port of its own (never the hub API's,
 *   never the hub's router): `CAWCO_RELAY_PORT`, else one the OS picks free.
 *   It listens only while a relay is active and closes with the last one, and
 *   Funnel always points at the port it bound (re-pointed in place at each
 *   start). It answers `POST /hooks/<id>` and nothing else:
 *   any other method or path, an unknown id and a relay that is off all get
 *   the same empty 404. It is write-only: a delivery that lands gets 202 and
 *   an empty body, and nothing is ever read back through it.
 * - **Verified before it is stored.** In order, before the body is parsed:
 *   the id's rate limit (60 a minute, a token bucket; 429), a 1 MiB cap
 *   enforced while the body streams in (413, without reading the rest), and
 *   the provider's signature, compared in constant time (401): GitHub's
 *   `X-Hub-Signature-256` (HMAC-SHA256 of the raw body); Stripe's
 *   `Stripe-Signature` (`t=` and `v1=`, signed payload `t.body`, `t` within
 *   5 minutes); generic, a hex HMAC-SHA256 in a configured header, of the
 *   body, or of `<timestamp>.<body>` with a configured timestamp header and
 *   the same 5 minutes. The caller hears only the status; the reason goes to
 *   the hub log.
 * - **Lands once.** A delivery is handed to ingress.ts `ingest`, whose
 *   insert is the dedup on (source, natural key): GitHub through
 *   `normalizeGitHub` (the same keys the poller uses, so a webhook and a
 *   poll of one change are one row, in either order); Stripe and generic as
 *   source `hook:<id>`, keyed by the provider's event id (Stripe's `id`; a
 *   generic relay's configured JSON path, or the body's SHA-256 when it names
 *   none). GitHub's `ping` is the test delivery: recorded on the relay, not
 *   an event.
 * - **The hub stores the wanted state; the hub host applies it** (funnel.ts):
 *   at start, when a relay comes or goes, and every minute while one isn't
 *   live, so an owner step taken later (approving Funnel, setting the
 *   operator) is picked up without anyone asking. Not live, a relay says why
 *   in `reason`, and the GitHub poller keeps bringing events in.
 * - **Opening a path asks the owner.** A session's `relay_create` parks as
 *   the person's ask (admin-asks.ts), naming what goes public; it runs once
 *   approved. The hub route is the owner's own door; `cawco relay on` from
 *   the owner's terminal shows the same sentence and asks before calling it.
 * - **Secrets stay in the hub.** A relay's secret is a sealed column; no
 *   route, tool or log line carries it. One the hub mints goes only to
 *   GitHub, in the registration call; one the provider makes (Stripe) or the
 *   owner pastes is set from the owner's terminal (`cawco relay set-secret`),
 *   never through a session.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  CAWCO_ENV,
  type InstanceRow,
  RELAY_PROVIDERS,
  type RelayProvider,
  type RelayView,
  readEnv,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { machineId } from "@cawco/core/machine-id";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import { tool } from "./admin-tools";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { RelayPatch, RelayRow } from "./db/relays";
import { createFunnel, type Funnel, type FunnelState } from "./funnel";
import { type GitHubKind, githubRepoOf, normalizeGitHub } from "./github";
import type { Ingress } from "./ingress";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

/** The most a delivery's body holds: 1 MiB. */
export const RELAY_BODY_MAX = 1024 * 1024;
/** Deliveries one relay takes a minute: the token bucket's size and its refill. */
const PER_MINUTE = 60;
/** A signed timestamp's window either way: Stripe's own tolerance, 5 minutes. */
const WINDOW_S = 5 * 60;
/** How often the wanted state is applied again while a relay isn't live. */
const AGAIN_MS = 60_000;
/** A GitHub registration GitHub refused is tried again after this, unless asked. Our choice. */
const REFUSED_AGAIN_MS = 10 * 60_000;
/** How long creating a GitHub relay waits for GitHub's ping. Our choice. */
const PING_WAIT_MS = 30_000;
/** One GitHub API call. Our choice. */
const GITHUB_MS = 30_000;
/** The events a GitHub relay's webhook sends: what the poller reads, as webhooks. */
const GITHUB_EVENTS = ["pull_request", "issues", "issue_comment"] as const;
const ID = /^\/hooks\/([A-Za-z0-9_-]{22})$/;
const HEADER = /^[A-Za-z0-9-]{1,64}$/;
const HEX = /^[0-9a-f]{64}$/;
const SHA256_PREFIX = "sha256=";

/**
 * The port the receiver asks for: `CAWCO_RELAY_PORT`, else 0, so the OS
 * hands it a free one and it never takes a port anything else uses. Funnel
 * always points at the port it actually bound.
 */
const wantedPort = (): number => Number(readEnv(CAWCO_ENV.relayPort)) || 0;

/** What a route answers and a tool says when the relay refuses. */
export class RelayRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(code: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = code;
  }
}

const refuse = (code: 400 | 403 | 404 | 409, message: string): never => {
  throw new RelayRefusal(code, message);
};

const wordsOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A relay as asked for: the provider, and what its provider needs. */
export interface RelayInput {
  /** GitHub: the connection to register the webhook through; the project's poller's when left out. */
  connection?: string | null;
  /** generic: a dot path to the event's id in the body. */
  idPath?: string | null;
  projectId: string;
  provider: RelayProvider;
  /** generic: the header with the hex HMAC-SHA256. */
  signatureHeader?: string | null;
  /** generic: a header with the Unix time the signature covers. */
  timestampHeader?: string | null;
}

/** What creating a relay answers: the relay, and the routes a lead may propose for it. */
export interface RelayCreated {
  relay: RelayView;
  /** Event routes for the project's routines, to propose to the owner (event_route_create), never made here. */
  suggestedRoutes: {
    note: string;
    routines: { id: string; name: string }[];
    source: string;
  };
}

export interface RelayDeps {
  /** Parks a session's ask for the person and waits (admin-asks.ts). */
  readonly askPerson: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ) => Promise<void>;
  readonly connections: Pick<Connections, "get" | "githubToken">;
  readonly db: Pick<DbShape, "ingress" | "project" | "relays" | "routines">;
  /** Tailscale; the real CLI unless a probe names another. */
  readonly funnel?: Funnel;
  /** Ingress's one door (ingress.ts). */
  readonly ingest: Ingress["ingest"];
  readonly lifetime: HubLifetimeShape;
}

/** A value at a dot path. */
const valueAt = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (into, part) =>
        into !== null && typeof into === "object"
          ? (into as Record<string, unknown>)[part]
          : undefined,
      value
    );

const hmacHex = (secret: string, ...parts: (string | Uint8Array)[]) => {
  const mac = createHmac("sha256", secret);
  for (const part of parts) {
    mac.update(part);
  }
  return mac.digest("hex");
};

/** Two strings equal, compared in constant time for their length (a length says nothing secret). */
const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Whether a Unix time in seconds is within the window of now. */
const fresh = (seconds: number, now: number) =>
  Number.isFinite(seconds) && Math.abs(now / 1000 - seconds) <= WINDOW_S;

/**
 * Why a delivery's signature does not hold, or nothing when it does.
 * Every comparison is constant-time; the reason is for the hub log only.
 */
export const signatureProblem = (
  row: SignedBy,
  headers: Headers,
  body: Uint8Array,
  now: number = Date.now()
): string | undefined =>
  row.secret
    ? VERIFIERS[row.provider]({ row, secret: row.secret, headers, body, now })
    : "the relay has no secret yet";

/** What a relay's signature is checked against. */
type SignedBy = Pick<
  RelayRow,
  "provider" | "secret" | "signatureHeader" | "timestampHeader"
>;

interface Delivery {
  body: Uint8Array;
  headers: Headers;
  now: number;
  row: SignedBy;
  secret: string;
}

/** Each provider's check: why the signature does not hold, or nothing. */
const VERIFIERS: Record<
  RelayProvider,
  (delivery: Delivery) => string | undefined
> = {
  github: ({ secret, headers, body }) =>
    same(
      headers.get("x-hub-signature-256") ?? "",
      `${SHA256_PREFIX}${hmacHex(secret, body)}`
    )
      ? undefined
      : "X-Hub-Signature-256 does not match the body",
  stripe: ({ secret, headers, body, now }) => {
    // "t=…,v1=…,v1=…,v0=…": the timestamp, then one or more signatures.
    const pairs = (headers.get("stripe-signature") ?? "")
      .split(",")
      .map((part) => part.trim().split("="));
    const stamp = pairs.find(([key]) => key === "t")?.[1] ?? "";
    const expected = hmacHex(secret, `${stamp}.`, body);
    const signed = pairs
      .filter(([key]) => key === "v1")
      .some(([, value]) => same(value ?? "", expected));
    if (!(stamp && signed)) {
      return "Stripe-Signature does not match t and the body";
    }
    return fresh(Number(stamp), now)
      ? undefined
      : `Stripe-Signature's t=${stamp} is outside 5 minutes of now`;
  },
  generic: ({ row, secret, headers, body, now }) => {
    const header = row.signatureHeader ?? "";
    const raw = (headers.get(header) ?? "").trim().toLowerCase();
    const given = raw.startsWith(SHA256_PREFIX)
      ? raw.slice(SHA256_PREFIX.length)
      : raw;
    const stampHeader = row.timestampHeader;
    if (!stampHeader) {
      return HEX.test(given) && same(given, hmacHex(secret, body))
        ? undefined
        : `${header} does not match the body`;
    }
    const stamp = (headers.get(stampHeader) ?? "").trim();
    const expected = hmacHex(secret, `${stamp}.`, body);
    if (!(stamp && HEX.test(given) && same(given, expected))) {
      return `${header} does not match ${stampHeader} and the body`;
    }
    return fresh(Number(stamp), now)
      ? undefined
      : `${stampHeader} ${stamp} is outside 5 minutes of now`;
  },
};

/**
 * The body, read as it streams in and given up the moment it passes `max`
 * (a declared length over it is refused before a byte is read): undefined
 * when it is too large.
 */
const readCapped = async (
  request: Request,
  max: number
): Promise<Uint8Array | undefined> => {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > max) {
    return;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a stream is read chunk after chunk, and the cap is checked on each
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks);
    }
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return;
    }
    chunks.push(value);
  }
};

const empty = (code: number) => new Response(null, { status: code });

export const createRelay = ({
  askPerson,
  connections,
  db,
  funnel: givenFunnel,
  ingest,
  lifetime,
}: RelayDeps) => {
  const store = db.relays;
  const api = readEnv(CAWCO_ENV.githubApi) ?? "https://api.github.com";
  /** The hub's machine: the host whose Tailscale serves every relay. Read once, when first needed. */
  let hostId: Promise<string> | undefined;
  const hostOf = (): Promise<string> => {
    hostId ??= machineId();
    return hostId;
  };
  let funnel: Funnel | undefined = givenFunnel;
  const tailscale = (): Funnel => {
    funnel ??= createFunnel();
    return funnel;
  };
  /** Each relay's bucket: tokens left, and when it was last filled. */
  const buckets = new Map<string, { at: number; tokens: number }>();
  /** When GitHub last refused to register a relay's webhook. */
  const refusedAt = new Map<string, number>();
  /** The receiver, while at least one relay is active; nothing listens otherwise. */
  let listening: ReturnType<typeof Bun.serve> | undefined;
  /** Why the receiver couldn't listen, when its last try failed. */
  let receiverProblem: string | null = null;
  let timer: HubTimer | undefined;
  /** The pass under way, and the one asked for while it runs. */
  let applying: Promise<void> | undefined;
  let next: Promise<void> | undefined;
  let nextRegisters = false;

  // --- the receiver -------------------------------------------------------------

  /** One token from the relay's bucket, refilled at 60 a minute; false when it is empty. */
  const take = (id: string, now: number): boolean => {
    const bucket = buckets.get(id) ?? { at: now, tokens: PER_MINUTE };
    const tokens = Math.min(
      PER_MINUTE,
      bucket.tokens + ((now - bucket.at) / 60_000) * PER_MINUTE
    );
    const left = tokens >= 1 ? tokens - 1 : tokens;
    buckets.set(id, { at: now, tokens: left });
    return tokens >= 1;
  };

  /**
   * A verified GitHub delivery: `ping` is the test delivery; `pull_request`,
   * `issues` and `issue_comment` go through the poller's own normaliser, so
   * a webhook and a poll of one change share a key. Events of another
   * repository than the project's are not the project's, and land nowhere.
   */
  const deliverGitHub = (
    row: RelayRow,
    headers: Headers,
    text: string,
    now: Date
  ): number => {
    const event = headers.get("x-github-event") ?? "";
    if (event === "ping") {
      store.update(row.id, { testedAt: now });
      console.log(`[relay] ${row.id}: GitHub's test delivery (ping) arrived`);
      return 202;
    }
    if (!(GITHUB_EVENTS as readonly string[]).includes(event)) {
      return 202;
    }
    const repo = repoOf(row);
    const source = repo ? `github:${repo.toLowerCase()}` : "";
    const landed = normalizeGitHub(
      event as GitHubKind,
      JSON.parse(text) as unknown
    )
      .filter((one) => one.source === source)
      .filter((one) => ingest(one, "webhook", row.projectId)).length;
    console.log(`[relay] ${row.id}: GitHub ${event}, ${landed} new`);
    return 202;
  };

  /** A verified Stripe or generic delivery, as source `hook:<id>` under the provider's event id. */
  const deliverHook = (row: RelayRow, raw: Uint8Array, now: Date): number => {
    const text = Buffer.from(raw).toString("utf8");
    const body =
      row.provider === "stripe" ? (JSON.parse(text) as unknown) : jsonOr(text);
    const key = keyOf(row, body, raw);
    if (key === undefined) {
      console.warn(
        `[relay] ${row.id}: a delivery had no event id at ${row.provider === "stripe" ? "id" : row.idPath}; nothing stored`
      );
      return 400;
    }
    const type = valueAt(body, "type");
    const created = Number(valueAt(body, "created"));
    const named = typeof type === "string" ? type.slice(0, 100) : null;
    const landed = ingest(
      {
        source: `hook:${row.id}`,
        key,
        kind: named ?? "hook",
        actor: null,
        labels: [],
        branch: null,
        url: null,
        title: named,
        body: null,
        at:
          row.provider === "stripe" && Number.isFinite(created)
            ? created * 1000
            : now.getTime(),
        data: body,
      },
      "webhook",
      row.projectId
    );
    console.log(
      `[relay] ${row.id}: ${row.provider} ${key} ${landed ? "landed" : "was here already"}`
    );
    return 202;
  };

  /** A verified delivery handed to ingest: the status to answer. */
  const deliver = (
    row: RelayRow,
    headers: Headers,
    raw: Uint8Array
  ): number => {
    const now = new Date();
    store.update(row.id, { lastDeliveryAt: now });
    try {
      return row.provider === "github"
        ? deliverGitHub(row, headers, Buffer.from(raw).toString("utf8"), now)
        : deliverHook(row, raw, now);
    } catch (error) {
      console.warn(
        `[relay] ${row.id}: a verified delivery wasn't JSON: ${wordsOf(error)}`
      );
      return 400;
    }
  };

  /** A generic body: its JSON, or its text when it isn't JSON. */
  const jsonOr = (text: string): unknown => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { text };
    }
  };

  /** The event's natural key: Stripe's id, a generic relay's path, or the body's SHA-256. */
  const keyOf = (
    row: RelayRow,
    body: unknown,
    raw: Uint8Array
  ): string | undefined => {
    const path = row.provider === "stripe" ? "id" : row.idPath;
    if (!path) {
      return createHash("sha256").update(raw).digest("hex");
    }
    const found = valueAt(body, path);
    return typeof found === "string" || typeof found === "number"
      ? String(found).slice(0, 200)
      : undefined;
  };

  /** Every request the receiver gets. */
  const receive = async (request: Request): Promise<Response> => {
    const found =
      request.method === "POST"
        ? ID.exec(new URL(request.url).pathname)?.[1]
        : undefined;
    const row = found ? store.get(found) : undefined;
    if (!row || row.state === "off") {
      return empty(404);
    }
    if (!take(row.id, Date.now())) {
      console.warn(`[relay] ${row.id}: over 60 deliveries a minute (429)`);
      return empty(429);
    }
    const body = await readCapped(request, RELAY_BODY_MAX);
    if (!body) {
      console.warn(`[relay] ${row.id}: a delivery over 1 MiB (413)`);
      return empty(413);
    }
    const problem = signatureProblem(row, request.headers, body);
    if (problem) {
      console.warn(`[relay] ${row.id}: refused a delivery (401): ${problem}`);
      return empty(401);
    }
    return empty(deliver(row, request.headers, body));
  };

  /** The receiver opened when it isn't: the port it bound, or undefined with `receiverProblem` saying why. */
  const listen = (): number | undefined => {
    if (listening) {
      return listening.port;
    }
    const asked = wantedPort();
    try {
      listening = Bun.serve({
        hostname: "127.0.0.1",
        port: asked,
        // Bun refuses a body past this itself; readCapped is the cap that counts.
        maxRequestBodySize: RELAY_BODY_MAX,
        fetch: receive,
        error: () => empty(500),
      });
      receiverProblem = null;
      console.log(`[relay] receiver listening on 127.0.0.1:${listening.port}`);
      return listening.port;
    } catch (error) {
      receiverProblem = asked
        ? `The relay's receiver couldn't listen on 127.0.0.1:${asked} (${wordsOf(error)}); set ${CAWCO_ENV.relayPort} to a free port, or unset it to let the system pick one, and restart the hub.`
        : `The relay's receiver couldn't listen on 127.0.0.1 (${wordsOf(error)}); the hub tries again within a minute.`;
      console.error(`[relay] ${receiverProblem}`);
    }
  };

  /** The receiver closed once no relay is active: a hub with no relay holds no extra port. */
  const close = async (): Promise<void> => {
    const server = listening;
    if (!server) {
      return;
    }
    // Forgotten first, so a pass that runs while it stops finds no receiver.
    listening = undefined;
    receiverProblem = null;
    await server.stop(true);
    console.log(
      `[relay] receiver on 127.0.0.1:${server.port} closed: no relay is on`
    );
  };

  // --- GitHub ----------------------------------------------------------------------

  /** One GitHub request within {@link GITHUB_MS}, its body read inside the same time. */
  const github = (
    token: string,
    method: "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<Bounded<Response>> =>
    readWithin(GITHUB_MS, async (signal) => {
      const response = await fetch(`${new URL(api).origin}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "CawCo-hub",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal,
      });
      return new Response(
        [204, 205, 304].includes(response.status)
          ? null
          : await response.arrayBuffer(),
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }
      );
    });

  /** "GitHub did not answer within N s". */
  const githubSilent = (after: number): string =>
    `GitHub did not answer within ${Math.round(after / 1000)} s`;

  const saidBy = async (response: Response): Promise<string> => {
    const said = await response
      .json()
      .then((body: unknown) => (body as { message?: unknown } | null)?.message)
      .catch(() => undefined);
    return typeof said === "string" ? `: ${said.slice(0, 200)}` : "";
  };

  const repoOf = (row: RelayRow): string | undefined =>
    githubRepoOf(db.project(row.projectId)?.remote ?? null);

  /** The step when the hub can't register the webhook: what to paste where. */
  const pasteStep = (row: RelayRow, url: string, why: string): string =>
    `${why} Add it by hand at https://github.com/${repoOf(row)}/settings/hooks/new: Payload URL ${url}, Content type application/json, a secret you make up, and the events Issues, Issue comments and Pull requests. Then give the relay that secret from your own terminal: cawco relay set-secret ${row.id}`;

  /**
   * Registers a GitHub relay's webhook through its connection: answers the
   * patch (its hook id, live) or the step when GitHub or the connection
   * refuses.
   */
  const register = async (row: RelayRow, url: string): Promise<RelayPatch> => {
    const repo = repoOf(row);
    if (!(repo && row.connection && row.secret)) {
      return {
        state: "needs-owner",
        reason: pasteStep(
          row,
          url,
          "The hub can't register this webhook: the project has no GitHub repository, connection or secret."
        ),
      };
    }
    let token: string;
    try {
      token = connections.githubToken(row.connection);
    } catch (error) {
      refusedAt.set(row.id, Date.now());
      return {
        state: "needs-owner",
        reason: pasteStep(row, url, `${wordsOf(error)}`),
      };
    }
    try {
      const asked = await github(token, "POST", `/repos/${repo}/hooks`, {
        name: "web",
        active: true,
        events: GITHUB_EVENTS,
        config: {
          url,
          content_type: "json",
          secret: row.secret,
          insecure_ssl: "0",
        },
      });
      switch (asked.kind) {
        case "answered":
          break;
        case "unanswered":
          // Paces the next try, as a failure to reach it does.
          refusedAt.set(row.id, Date.now());
          return {
            state: "wanted",
            reason: `${githubSilent(asked.after)} to register the webhook, so it may or may not be there. The hub tries again.`,
          };
        default: {
          const unhandled: never = asked;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      const response = asked.value;
      if (response.ok) {
        const { id } = (await response.json()) as { id?: unknown };
        console.log(
          `[relay] ${row.id}: GitHub webhook ${String(id)} registered on ${repo} through ${row.connection}`
        );
        refusedAt.delete(row.id);
        return { hookId: String(id), state: "live", reason: null };
      }
      refusedAt.set(row.id, Date.now());
      return {
        state: "needs-owner",
        reason: pasteStep(
          row,
          url,
          `GitHub refused to make the webhook through ${row.connection} (${response.status}${await saidBy(response)}).`
        ),
      };
    } catch (error) {
      refusedAt.set(row.id, Date.now());
      return {
        state: "wanted",
        reason: `GitHub couldn't be reached to register the webhook: ${wordsOf(error)}. The hub tries again.`,
      };
    }
  };

  /** Deletes the webhook the hub registered; answers what came of it. */
  const unregister = async (row: RelayRow): Promise<string> => {
    const repo = repoOf(row);
    if (!(row.hookId && repo && row.connection)) {
      return "no webhook the hub registered";
    }
    try {
      const token = connections.githubToken(row.connection);
      const asked = await github(
        token,
        "DELETE",
        `/repos/${repo}/hooks/${row.hookId}`
      );
      switch (asked.kind) {
        case "answered":
          break;
        case "unanswered":
          return `${githubSilent(asked.after)} to delete webhook ${row.hookId}, so it may still be there; delete it at https://github.com/${repo}/settings/hooks`;
        default: {
          const unhandled: never = asked;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      const response = asked.value;
      if (response.ok || response.status === 404) {
        console.log(
          `[relay] ${row.id}: GitHub webhook ${row.hookId} on ${repo} deleted`
        );
        return `GitHub webhook ${row.hookId} deleted`;
      }
      return `GitHub refused to delete webhook ${row.hookId} (${response.status}${await saidBy(response)}); delete it at https://github.com/${repo}/settings/hooks`;
    } catch (error) {
      return `GitHub webhook ${row.hookId} wasn't deleted (${wordsOf(error)}); delete it at https://github.com/${repo}/settings/hooks`;
    }
  };

  // --- the wanted state, applied ------------------------------------------------------

  /** The step a live path still needs before deliveries can be verified, or nothing. */
  const secretStep = (row: RelayRow, url: string): string | undefined => {
    if (row.secret) {
      return;
    }
    if (row.provider === "stripe") {
      return `Add ${url} as an endpoint in Stripe (Developers, Webhooks), then give the relay its signing secret (whsec_…) from your own terminal: cawco relay set-secret ${row.id}`;
    }
    const stamp = row.timestampHeader
      ? `, and the Unix time in ${row.timestampHeader}, signing <timestamp>.<body>`
      : "";
    return `Have the service POST to ${url}, signing the raw body with HMAC-SHA256 (hex) in ${row.signatureHeader}${stamp}. Then give the relay the same secret from your own terminal: cawco relay set-secret ${row.id}`;
  };

  /** What one relay is, given what Funnel is: its patch. */
  const settle = async (
    row: RelayRow,
    state: FunnelState,
    registerNow: boolean
  ): Promise<RelayPatch> => {
    if (receiverProblem) {
      return { state: "wanted", reason: receiverProblem, publicUrl: null };
    }
    if (state.state !== "live") {
      return {
        state: state.state,
        reason: state.state === "wanted" ? state.reason : state.step,
        publicUrl: null,
      };
    }
    const publicUrl = `${state.base}${row.id}`;
    if (row.provider !== "github") {
      const step = secretStep(row, publicUrl);
      return step
        ? { state: "needs-owner", reason: step, publicUrl }
        : { state: "live", reason: null, publicUrl };
    }
    if (row.hookId || row.secretFrom === "owner") {
      return { state: "live", reason: null, publicUrl };
    }
    const refused = refusedAt.get(row.id);
    if (
      !registerNow &&
      refused !== undefined &&
      Date.now() - refused < REFUSED_AGAIN_MS
    ) {
      return { publicUrl };
    }
    return { ...(await register(row, publicUrl)), publicUrl };
  };

  /**
   * One pass, the receiver's one owner: with a relay active the receiver
   * listens and Funnel's mount points at the port it bound (re-pointed in
   * place when that port changed); with none, the receiver closes and the
   * mount comes down. Each relay's state kept.
   */
  const applyOnce = async (registerNow: boolean): Promise<void> => {
    const active = store.active();
    if (active.length === 0) {
      await close();
      await removeMount();
      return;
    }
    const bound = listen();
    const state =
      bound === undefined
        ? ({
            state: "wanted",
            reason: receiverProblem ?? "The relay's receiver isn't listening.",
          } as const)
        : await tailscale().apply(bound);
    for (const row of active) {
      // biome-ignore lint/performance/noAwaitInLoops: one relay at a time, each maybe one GitHub call
      keep(row.id, await settle(row, state, registerNow));
    }
  };

  /** Funnel's mount taken down once no relay wants it; only where a relay was ever made. */
  const removeMount = async (): Promise<void> => {
    if (!store.anyEver()) {
      return;
    }
    const problem = await tailscale().remove();
    if (problem) {
      console.warn(`[relay] Funnel's /hooks/ mount wasn't removed: ${problem}`);
    }
  };

  /** A relay's patch stored when it changes something (never on one turned off meanwhile); a new state logged. */
  const keep = (id: string, patch: RelayPatch): void => {
    const current = store.get(id);
    if (!current || current.state === "off") {
      return;
    }
    const changes = (key: keyof RelayPatch) =>
      key in patch && patch[key] !== current[key];
    if (!(Object.keys(patch) as (keyof RelayPatch)[]).some(changes)) {
      return;
    }
    store.update(id, patch);
    if (changes("state") || changes("reason")) {
      console.log(
        `[relay] ${id} is ${patch.state ?? current.state}${patch.reason ? `: ${patch.reason}` : ""}`
      );
    }
  };

  /**
   * Applies the wanted state, one pass at a time: calls while a pass runs
   * share one more pass after it, which sees everything they changed.
   */
  const apply = (registerNow = false): Promise<void> => {
    if (!applying) {
      applying = applyOnce(registerNow)
        .catch((error: unknown) =>
          console.error(`[relay] applying failed: ${wordsOf(error)}`)
        )
        .finally(() => {
          applying = undefined;
        });
      return applying;
    }
    nextRegisters ||= registerNow;
    next ??= applying.then(() => {
      const registers = nextRegisters;
      next = undefined;
      nextRegisters = false;
      return apply(registers);
    });
    return next;
  };

  const tickAgain = (): void => {
    if (lifetime.closed()) {
      return;
    }
    timer = lifetime.after(AGAIN_MS, () => {
      if (store.active().some((row) => row.state !== "live")) {
        detach(apply(), "relay apply");
      }
      tickAgain();
    });
  };

  /** Hub start: the wanted state applied, which opens the receiver only when a relay is active. */
  const start = (): void => {
    detach(apply(true), "relay apply at start");
    lifetime.cancel(timer);
    tickAgain();
  };

  // --- views ------------------------------------------------------------------------

  const inboundOf = (row: RelayRow): string => {
    const polled = db.ingress.githubPoller(row.projectId) !== undefined;
    if (row.state === "off") {
      return "Off: its path answers 404.";
    }
    if (row.provider === "github") {
      if (row.state === "live") {
        return polled
          ? "GitHub delivers here as things happen; the 60 s poll stays on beside it, and an event both bring lands once."
          : "GitHub delivers here as things happen.";
      }
      return polled
        ? "Not live yet, so events reach the project by the 60 s GitHub poll meanwhile."
        : "Not live yet, and the project's repository isn't polled: nothing arrives from GitHub until it is.";
    }
    return row.state === "live"
      ? "Deliveries land as they come."
      : `Not live yet: nothing arrives from ${row.provider} until it is.`;
  };

  const viewOf = (row: RelayRow): RelayView => ({
    id: row.id,
    projectId: row.projectId,
    provider: row.provider,
    connection: row.connection,
    host: row.host,
    publicUrl: row.publicUrl,
    state: row.state,
    reason: row.reason,
    hasSecret: row.secret !== null,
    registered: row.hookId !== null,
    inbound: inboundOf(row),
    testedAt: row.testedAt?.getTime() ?? null,
    lastDeliveryAt: row.lastDeliveryAt?.getTime() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
  });

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    refuse(404, `The hub keeps no project ${projectId}.`);

  const relayOf = (id: string) =>
    store.get(id) ?? refuse(404, `There is no relay ${id}.`);

  const list = (projectId: string): RelayView[] => {
    projectOf(projectId);
    return store.ofProject(projectId).map(viewOf);
  };

  // --- create, remove, secret ------------------------------------------------------------

  /** The input as it will be made, or the refusal: everything checked before anyone is asked. */
  /** A GitHub relay's connection: one that holds a token, for a project on github.com with no relay yet. */
  const githubConnection = (
    projectId: string,
    remote: string | null,
    named: string | null | undefined
  ): string => {
    const repo =
      githubRepoOf(remote) ??
      refuse(
        400,
        "The project's checkout has no origin on github.com, so there is no repository to register a webhook on."
      );
    const connection =
      named?.trim() ||
      db.ingress.githubPoller(projectId)?.connection ||
      refuse(
        400,
        "Name the GitHub connection to register the webhook through (connection), or name the project's GitHub poller's connection first."
      );
    try {
      connections.githubToken(connection);
    } catch (error) {
      refuse(409, wordsOf(error));
    }
    const live = store
      .ofProject(projectId)
      .find((row) => row.provider === "github" && row.state !== "off");
    if (live) {
      refuse(
        409,
        `${repo} already has relay ${live.id} (${live.state}); remove it first.`
      );
    }
    return connection;
  };

  /** A generic relay's headers, lower-cased as Headers reads them. */
  const genericHeaders = (input: RelayInput) => {
    const header = input.signatureHeader?.trim() ?? "";
    const stamp = input.timestampHeader?.trim() || null;
    if (!HEADER.test(header) || (stamp && !HEADER.test(stamp))) {
      refuse(
        400,
        "A generic relay names the header its HMAC-SHA256 comes in (signature_header, like X-Signature), and optionally a timestamp header: letters, digits and dashes."
      );
    }
    return {
      signatureHeader: header.toLowerCase(),
      timestampHeader: stamp?.toLowerCase() ?? null,
    };
  };

  /** The input as it will be made, or the refusal: everything checked before anyone is asked. */
  const checked = (input: RelayInput): Required<RelayInput> => {
    const project = projectOf(input.projectId);
    if (!RELAY_PROVIDERS.includes(input.provider)) {
      refuse(400, `provider is one of ${RELAY_PROVIDERS.join(", ")}.`);
    }
    return {
      projectId: project.id,
      provider: input.provider,
      connection:
        input.provider === "github"
          ? githubConnection(project.id, project.remote, input.connection)
          : null,
      ...(input.provider === "generic"
        ? genericHeaders(input)
        : { signatureHeader: null, timestampHeader: null }),
      idPath: input.idPath?.trim() || null,
    };
  };

  /** The sentence the owner approves: what goes public. */
  const publicText = (input: Required<RelayInput>): string => {
    const project = projectOf(input.projectId);
    const repo = githubRepoOf(project.remote);
    const registers =
      input.provider === "github"
        ? ` The hub then registers a webhook on ${repo} through ${input.connection}, with a secret it makes, for pull requests, issues and issue comments.`
        : "";
    return `Approving opens one public HTTPS path on the hub's machine (${tailscale().host}) through Tailscale Funnel, port 10000: https://<its tailnet name>:10000/hooks/<a new random id>. The internet can POST ${input.provider}-signed deliveries for project “${project.name}” there; it answers nothing back, and nothing else of the hub is reachable through it.${registers}`;
  };

  /** Waits for GitHub's ping, up to {@link PING_WAIT_MS}. */
  const pinged = async (id: string): Promise<boolean> => {
    const until = Date.now() + PING_WAIT_MS;
    while (Date.now() < until && !lifetime.closed()) {
      if (store.get(id)?.testedAt) {
        return true;
      }
      // biome-ignore lint/performance/noAwaitInLoops: waiting on the ping, a quarter second at a time
      await Bun.sleep(250);
    }
    return Boolean(store.get(id)?.testedAt);
  };

  /** The routes a lead may propose for the relay: its source, and the project's routines. */
  const suggested = (row: RelayRow): RelayCreated["suggestedRoutes"] => {
    const repo = repoOf(row);
    const source =
      row.provider === "github" && repo
        ? `github:${repo.toLowerCase()}`
        : `hook:${row.id}`;
    const routines = db.routines
      .list(row.projectId)
      .map((one) => ({ id: one.id, name: one.name }));
    return {
      source,
      routines,
      note:
        routines.length > 0
          ? `Propose to the owner which of these routines the relay's events should run, as event_route_create with source ${source} and the kinds each takes; nothing is routed until a route is made.`
          : `The project has no routines yet; its events go to the lead's inbox until a route (event_route_create, source ${source}) sends them to one.`,
    };
  };

  /** Makes a relay: the id and secret minted, Funnel applied, GitHub's webhook registered and its ping awaited. */
  const create = async (
    input: RelayInput,
    by: string
  ): Promise<RelayCreated> => {
    const made = checked(input);
    const minted = made.provider === "github";
    const row = store.create({
      id: randomBytes(16).toString("base64url"),
      projectId: made.projectId,
      provider: made.provider,
      secret: minted ? randomBytes(32).toString("hex") : null,
      secretFrom: minted ? "minted" : null,
      connection: made.connection,
      hookId: null,
      signatureHeader: made.signatureHeader,
      timestampHeader: made.timestampHeader,
      idPath: made.idPath,
      host: await hostOf(),
      publicUrl: null,
      state: "wanted",
      reason: "The hub is applying it.",
      testedAt: null,
      lastDeliveryAt: null,
      createdBy: by,
      createdAt: new Date(),
    });
    console.log(
      `[relay] ${row.id}: ${row.provider} relay for project ${row.projectId}, by ${by}`
    );
    await apply(true);
    const now = relayOf(row.id);
    if (now.provider === "github" && now.hookId) {
      const arrived = await pinged(now.id);
      if (!arrived) {
        console.warn(`[relay] ${now.id}: no ping from GitHub in 30 s`);
      }
    }
    const final = relayOf(row.id);
    return { relay: viewOf(final), suggestedRoutes: suggested(final) };
  };

  /** Who may touch a relay: the owner, or a session of its project. */
  const mayTouch = (by: "owner" | InstanceRow, row: RelayRow) => {
    if (by !== "owner" && by.projectId !== row.projectId) {
      refuse(403, "That relay is not one of this session's project's.");
    }
  };

  /** Turns a relay off: its path answers 404, the webhook the hub made is deleted, Funnel's mount goes with the last one. */
  const remove = async (
    id: string,
    by: "owner" | InstanceRow
  ): Promise<{ github: string; relay: RelayView }> => {
    const row = relayOf(id);
    mayTouch(by, row);
    if (row.state === "off") {
      return { relay: viewOf(row), github: "already off" };
    }
    store.update(id, { state: "off", reason: null, publicUrl: null });
    buckets.delete(id);
    refusedAt.delete(id);
    console.log(`[relay] ${id} is off, by ${by === "owner" ? "owner" : by.id}`);
    const githubSaid =
      row.provider === "github" ? await unregister(row) : "not a GitHub relay";
    if (row.hookId && githubSaid.endsWith("deleted")) {
      store.update(id, { hookId: null });
    }
    await apply();
    return { relay: viewOf(relayOf(id)), github: githubSaid };
  };

  /** The owner's secret for a relay (from their terminal): sealed, never answered back. */
  const setSecret = async (id: string, secret: string): Promise<RelayView> => {
    const row = relayOf(id);
    if (row.state === "off") {
      refuse(409, `Relay ${id} is off.`);
    }
    const trimmed = secret.trim();
    if (trimmed.length < 16 || trimmed.length > 512) {
      refuse(400, "A relay's secret is 16 to 512 characters.");
    }
    store.update(id, { secret: trimmed, secretFrom: "owner" });
    console.log(`[relay] ${id}: the owner set its secret`);
    await apply();
    return viewOf(relayOf(id));
  };

  // --- tools ---------------------------------------------------------------------------

  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });

  /** A tool's or an ask's words (snake case), as a relay's input. */
  const inputOf = (
    projectId: string,
    words: {
      connection?: string | null;
      id_path?: string | null;
      provider?: RelayProvider;
      signature_header?: string | null;
      timestamp_header?: string | null;
    }
  ): RelayInput => ({
    projectId,
    provider: words.provider ?? "github",
    connection: words.connection ?? null,
    signatureHeader: words.signature_header ?? null,
    timestampHeader: words.timestamp_header ?? null,
    idPath: words.id_path ?? null,
  });

  const approvedAsk = z.object({
    project: z.string(),
    provider: z.enum(RELAY_PROVIDERS),
    connection: z.string().nullish(),
    signature_header: z.string().nullish(),
    timestamp_header: z.string().nullish(),
    id_path: z.string().nullish(),
    requested_by: z.string(),
  });

  /** A `relay_create` the owner approved after a hub restart, run by the hub with the arguments shown. */
  const runApproved = async (
    input: Record<string, unknown>
  ): Promise<string> => {
    const asked = approvedAsk.parse(input);
    return JSON.stringify(
      await create(inputOf(asked.project, asked), asked.requested_by)
    );
  };

  /** Asks the person to approve opening a relay (admin-asks.ts), then makes it. */
  const askThenCreate = async (
    asker: InstanceRow,
    input: RelayInput
  ): Promise<RelayCreated> => {
    const made = checked(input);
    await askPerson(asker, "relay_create", {
      public: publicText(made),
      project: made.projectId,
      project_name: projectOf(made.projectId).name,
      provider: made.provider,
      connection: made.connection,
      signature_header: made.signatureHeader,
      timestamp_header: made.timestampHeader,
      id_path: made.idPath,
      requested_by: asker.id,
    });
    return create(made, asker.id);
  };

  /** The relay tools, bound to the calling session; with none, the definitions for discovery. */
  const tools = (actor: InstanceRow | undefined) => {
    const me = (): InstanceRow => {
      if (!actor) {
        throw new Error("Discovery cannot execute tools");
      }
      return actor;
    };
    const projectOfMe = () =>
      me().projectId ??
      refuse(403, "This session is in no project, so it has no relays.");
    const run = async (work: () => unknown) => {
      try {
        return ok(await work());
      } catch (error) {
        if (error instanceof RelayRefusal) {
          throw new Error(error.message, { cause: error });
        }
        throw error;
      }
    };
    return [
      tool(
        "relay_create",
        "Open a public webhook path for your project (Tailscale Funnel) once the owner approves; GitHub's webhook is registered for you. Answers its state, any step the owner must take, and routes to propose.",
        {
          provider: z.enum(RELAY_PROVIDERS).optional(),
          connection: z.string().optional().describe("github"),
          signature_header: z.string().optional().describe("generic"),
          timestamp_header: z.string().optional().describe("generic"),
          id_path: z.string().optional().describe("generic: event id path"),
        },
        (input) => run(() => askThenCreate(me(), inputOf(projectOfMe(), input)))
      ),
      tool(
        "relay_list",
        "Your project's relays: URL, state, the owner's step.",
        {},
        () => run(() => list(projectOfMe()))
      ),
      tool(
        "relay_remove",
        "Turn a relay off; the GitHub webhook the hub made goes with it.",
        { id: z.string().trim().min(1) },
        ({ id }) => run(() => remove(id, me()))
      ),
    ];
  };

  // A release is synchronous (lifetime.ts): the stop finishes on its own.
  lifetime.onClose(() => {
    lifetime.cancel(timer);
    if (listening) {
      detach(listening.stop(true), "relay receiver stop");
    }
  });

  return {
    checked,
    create,
    list,
    publicText,
    remove,
    runApproved,
    setSecret,
    start,
    tools,
  };
};

export type Relay = ReturnType<typeof createRelay>;

/** Every relay tool, by name. */
export const RELAY_TOOLS: ReadonlySet<string> = new Set([
  "relay_create",
  "relay_list",
  "relay_remove",
]);

const answer = (error: unknown) => {
  if (error instanceof RelayRefusal) {
    return status(error.status, error.message);
  }
  throw error;
};

const attempt = async <T>(work: () => T | Promise<T>) => {
  try {
    return await work();
  } catch (error) {
    return answer(error);
  }
};

/**
 * The owner's routes for relays, on the hub API (never the receiver). Making
 * one here is the owner's own act; `cawco relay on` shows what goes public
 * and asks before it calls this.
 */
export const relayRoutes = (relay: Relay) =>
  new Elysia()
    .get("/api/projects/:id/relays", ({ params }) =>
      attempt(() => relay.list(params.id))
    )
    .post(
      "/api/projects/:id/relays/preview",
      {
        body: t.Object({
          provider: t.Union(RELAY_PROVIDERS.map((one) => t.Literal(one))),
          connection: t.Optional(t.Nullable(t.String())),
          signatureHeader: t.Optional(t.Nullable(t.String())),
          timestampHeader: t.Optional(t.Nullable(t.String())),
          idPath: t.Optional(t.Nullable(t.String())),
        }),
      },
      ({ params, body }) =>
        attempt(() => ({
          public: relay.publicText(
            relay.checked({ ...body, projectId: params.id })
          ),
        }))
    )
    .post(
      "/api/projects/:id/relays",
      {
        body: t.Object({
          provider: t.Union(RELAY_PROVIDERS.map((one) => t.Literal(one))),
          connection: t.Optional(t.Nullable(t.String())),
          signatureHeader: t.Optional(t.Nullable(t.String())),
          timestampHeader: t.Optional(t.Nullable(t.String())),
          idPath: t.Optional(t.Nullable(t.String())),
        }),
      },
      ({ params, body }) =>
        attempt(() => relay.create({ ...body, projectId: params.id }, "owner"))
    )
    .delete("/api/relays/:id", ({ params }) =>
      attempt(() => relay.remove(params.id, "owner"))
    )
    .put(
      "/api/relays/:id/secret",
      { body: t.Object({ secret: t.String() }) },
      ({ params, body }) =>
        attempt(() => relay.setSecret(params.id, body.secret))
    );
