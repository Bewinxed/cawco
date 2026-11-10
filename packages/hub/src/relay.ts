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
 * - **Opening a path asks the owner.** A session's `relay_create` is the
 *   person's ask (asks.ts), naming what goes public; the hub opens it
 *   once approved. The hub route is the owner's own door; `cawco relay on` from
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
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { detach } from "@cawco/core/detach";
import { machineId } from "@cawco/core/machine-id";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  RELAY_PROVIDERS,
  type RelayProvider,
  type RelayView,
} from "@cawco/core/relays";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { z } from "zod";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import type { RelayPatch, RelayRow } from "./db/relays";
import { createFunnel, type Funnel, type FunnelState } from "./funnel";
import { type GitHubKind, githubReposOf, normalizeGitHub } from "./github";
import { byHandle } from "./handles";
import { type Ingress, valueAt } from "./ingress";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { tool } from "./mcp-tool";
import { octokitAnswer } from "./octokit-answer";
import {
  relayCreatedWords,
  relayListWords,
  relayRemovedWords,
} from "./presenters/project";

/** The most a delivery's body holds: 1 MiB. */
const RELAY_BODY_MAX = 1024 * 1024;
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
const GITHUB_EVENTS = [
  "pull_request",
  "issues",
  "issue_comment",
  "discussion",
  "discussion_comment",
] as const satisfies readonly GitHubKind[];
const ID = /^\/hooks\/([A-Za-z0-9_-]{22})$/u;
const HEADER = /^[A-Za-z0-9-]{1,64}$/u;
const HEX = /^[0-9a-f]{64}$/u;
const SHA256_PREFIX = "sha256=";

/**
 * The port the receiver asks for: `CAWCO_RELAY_PORT`, else 0, so the OS
 * hands it a free one and it never takes a port anything else uses. Funnel
 * always points at the port it actually bound.
 */
const wantedPort = (): number => Number(readEnv(CAWCO_ENV.relayPort)) || 0;

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
  /** GitHub: the repository, `owner/repo`, of the project's links; its only one when left out. */
  repo?: string | null;
  /** generic: the header with the hex HMAC-SHA256. */
  signatureHeader?: string | null;
  /** generic: a header with the Unix time the signature covers. */
  timestampHeader?: string | null;
}

/** What creating a relay answers: the relay, and the routes a conversation may propose for it. */
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
  /**
   * Records a session's ask for the person (asks.ts): what the call
   * answers; undefined in Full Send, when it runs now.
   */
  readonly askPerson: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ) => Promise<string | undefined>;
  readonly connections: Pick<Connections, "get" | "githubClient">;
  readonly db: Pick<DbShape, "ingress" | "project" | "relays" | "routines">;
  /** Tailscale; the real CLI unless a probe names another. */
  readonly funnel?: Funnel;
  /** Ingress's one door (ingress.ts). */
  readonly ingest: Ingress["ingest"];
  readonly lifetime: HubLifetimeShape;
}

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
const signatureProblem = (
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
   * `issues`, `issue_comment`, `discussion` and `discussion_comment` go
   * through the poller's own normaliser, so
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
    const misfit = signatureProblem(row, request.headers, body);
    if (misfit) {
      console.warn(`[relay] ${row.id}: refused a delivery (401): ${misfit}`);
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

  /**
   * One GitHub call through the connection's Octokit (connections.ts
   * `githubClient`) within {@link GITHUB_MS}: what GitHub answered, its
   * status and its data, whether it made the change or refused it, as
   * Octokit throws a refusal (@octokit/request-error `RequestError`: its
   * `status` and `response`). A redirect is refused. A failure to reach
   * GitHub is thrown.
   */
  const github = <T>(
    call: (request: {
      redirect: "error";
      signal: AbortSignal;
    }) => Promise<{ data: T; status: number }>
  ): Promise<Bounded<{ data: unknown; status: number }>> =>
    readWithin(GITHUB_MS, (signal) =>
      octokitAnswer(() => call({ redirect: "error", signal }))
    );

  /** "GitHub did not answer within N s". */
  const githubSilent = (after: number): string =>
    `GitHub did not answer within ${secondsOf(after)} s`;

  /** What GitHub said with a refusal, ": <message>", or nothing. */
  const saidBy = (data: unknown): string => {
    const said = (data as { message?: unknown } | null)?.message;
    return typeof said === "string" ? `: ${said.slice(0, 200)}` : "";
  };

  /** `owner/repo` as Octokit's two parameters. */
  const ownerRepo = (repo: string): { owner: string; repo: string } => {
    const [owner = "", name = ""] = repo.split("/");
    return { owner, repo: name };
  };

  const repoOf = (row: RelayRow): string | undefined => row.repo ?? undefined;

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
          "The hub can't register this webhook: no GitHub repository, connection or secret is set for it."
        ),
      };
    }
    let octokit: ReturnType<Connections["githubClient"]>;
    try {
      octokit = connections.githubClient(row.connection);
    } catch (error) {
      refusedAt.set(row.id, Date.now());
      return {
        state: "needs-owner",
        reason: pasteStep(row, url, `${wordsOf(error)}`),
      };
    }
    try {
      const asked = await github((request) =>
        octokit.rest.repos.createWebhook({
          ...ownerRepo(repo),
          name: "web",
          active: true,
          events: [...GITHUB_EVENTS],
          config: {
            url,
            content_type: "json",
            secret: row.secret ?? undefined,
            insecure_ssl: "0",
          },
          request,
        })
      );
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
        default:
          unhandled("read", asked);
      }
      const answer = asked.value;
      if (answer.status >= 200 && answer.status < 300) {
        const { id } = (answer.data ?? {}) as { id?: unknown };
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
          `GitHub refused to make the webhook through ${row.connection} (${answer.status}${saidBy(answer.data)}).`
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
      const octokit = connections.githubClient(row.connection);
      const hookId = Number(row.hookId);
      const asked = await github((request) =>
        octokit.rest.repos.deleteWebhook({
          ...ownerRepo(repo),
          hook_id: hookId,
          request,
        })
      );
      switch (asked.kind) {
        case "answered":
          break;
        case "unanswered":
          return `${githubSilent(asked.after)} to delete webhook ${row.hookId}, so it may still be there; delete it at https://github.com/${repo}/settings/hooks`;
        default:
          unhandled("read", asked);
      }
      const answer = asked.value;
      if (
        (answer.status >= 200 && answer.status < 300) ||
        answer.status === 404
      ) {
        console.log(
          `[relay] ${row.id}: GitHub webhook ${row.hookId} on ${repo} deleted`
        );
        return `GitHub webhook ${row.hookId} deleted`;
      }
      return `GitHub refused to delete webhook ${row.hookId} (${answer.status}${saidBy(answer.data)}); delete it at https://github.com/${repo}/settings/hooks`;
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
      keep(row.id, await settle(row, state, registerNow));
    }
  };

  /** Funnel's mount taken down once no relay wants it; only where a relay was ever made. */
  const removeMount = async (): Promise<void> => {
    if (!store.anyEver()) {
      return;
    }
    const misfit = await tailscale().remove();
    if (misfit) {
      console.warn(`[relay] Funnel's /hooks/ mount wasn't removed: ${misfit}`);
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
    repo: row.repo,
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
    problem(404, {
      code: "relay-project-unknown",
      detail: `The hub keeps no project ${projectId}.`,
    });

  const relayOf = (id: string) =>
    store.get(id) ??
    problem(404, { code: "relay-unknown", detail: `There is no relay ${id}.` });

  const list = (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const views: RelayView[] = store.ofProject(projectId).map(viewOf);
    return views;
  };

  // --- create, remove, secret ------------------------------------------------------------

  /** A GitHub relay's repository: the one named among the project's links, else its only one. */
  const githubRepoFor = (
    project: ProjectRow,
    named: string | null | undefined
  ) => {
    const repos = githubReposOf(project.links);
    const asked = named?.trim();
    if (asked) {
      return (
        repos.find((one) => one.toLowerCase() === asked.toLowerCase()) ??
        problem(400, {
          code: "relay-repo-unknown",
          detail:
            repos.length > 0
              ? `${asked} isn't one of the project's GitHub repositories. Pass one as repo: ${repos.join(", ")}.`
              : `${asked} isn't one of the project's GitHub repositories: it links none.`,
        })
      );
    }
    if (repos.length === 1 && repos[0]) {
      return repos[0];
    }
    return problem(400, {
      code: "relay-repo-unnamed",
      detail:
        repos.length === 0
          ? "The project links no repository on github.com, so there is none to register a webhook on."
          : `Name the repository to register the webhook on (repo): ${repos.join(", ")}.`,
    });
  };

  /** A GitHub relay's connection: one that holds a token, for a repository with no relay yet. */
  const githubConnection = (
    projectId: string,
    repo: string,
    named: string | null | undefined
  ) => {
    const connection =
      named?.trim() || db.ingress.githubPoller(projectId)?.connection;
    if (!connection) {
      return problem(400, {
        code: "relay-connection-unnamed",
        detail:
          "Name the GitHub connection to register the webhook through (connection), or name the project's GitHub poller's connection first.",
      });
    }
    try {
      connections.githubClient(connection);
    } catch (error) {
      return problem(409, {
        code: "relay-connection-unusable",
        detail: wordsOf(error),
      });
    }
    const live = store
      .ofProject(projectId)
      .find(
        (row) =>
          row.provider === "github" &&
          row.state !== "off" &&
          row.repo?.toLowerCase() === repo.toLowerCase()
      );
    if (live) {
      return problem(409, {
        code: "relay-repo-has-relay",
        detail: `${repo} already has relay ${live.id} (${live.state}); remove it first.`,
      });
    }
    return connection;
  };

  /** A generic relay's headers, lower-cased as Headers reads them. */
  const genericHeaders = (input: RelayInput) => {
    const header = input.signatureHeader?.trim() ?? "";
    const stamp = input.timestampHeader?.trim() || null;
    if (!HEADER.test(header) || (stamp && !HEADER.test(stamp))) {
      return problem(400, {
        code: "relay-headers-unfit",
        detail:
          "A generic relay names the header its HMAC-SHA256 comes in (signature_header, like X-Signature), and optionally a timestamp header: letters, digits and dashes.",
      });
    }
    return {
      signatureHeader: header.toLowerCase(),
      timestampHeader: stamp?.toLowerCase() ?? null,
    };
  };

  /** The input as it will be made, or the refusal: everything checked before anyone is asked. */
  const checked = (input: RelayInput) => {
    const project = projectOf(input.projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    if (!RELAY_PROVIDERS.includes(input.provider)) {
      return problem(400, {
        code: "relay-provider-unknown",
        detail: `provider is one of ${RELAY_PROVIDERS.join(", ")}.`,
      });
    }
    const repo =
      input.provider === "github" ? githubRepoFor(project, input.repo) : null;
    if (repo instanceof ElysiaStatus) {
      return repo;
    }
    const connection = repo
      ? githubConnection(project.id, repo, input.connection)
      : null;
    if (connection instanceof ElysiaStatus) {
      return connection;
    }
    const headers =
      input.provider === "generic"
        ? genericHeaders(input)
        : { signatureHeader: null, timestampHeader: null };
    if (headers instanceof ElysiaStatus) {
      return headers;
    }
    const made: Required<RelayInput> = {
      projectId: project.id,
      provider: input.provider,
      repo,
      connection,
      ...headers,
      idPath: input.idPath?.trim() || null,
    };
    return made;
  };

  /** The sentence the owner approves: what goes public. */
  const publicText = (input: Required<RelayInput>) => {
    const project = projectOf(input.projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const registers =
      input.provider === "github"
        ? ` The hub then registers a webhook on ${input.repo} through ${input.connection}, with a secret it makes, for pull requests, issues and issue comments.`
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
      await Bun.sleep(250);
    }
    return Boolean(store.get(id)?.testedAt);
  };

  /** The routes a conversation may propose for the relay: its source, and the project's routines. */
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
          : `The project has no routines yet; its events go to the conversation's inbox until a route (event_route_create, source ${source}) sends them to one.`,
    };
  };

  /** Makes a relay: the id and secret minted, Funnel applied, GitHub's webhook registered and its ping awaited. */
  const create = async (input: RelayInput, by: string) => {
    const made = checked(input);
    if (made instanceof ElysiaStatus) {
      return made;
    }
    const minted = made.provider === "github";
    const row = store.create({
      id: randomBytes(16).toString("base64url"),
      projectId: made.projectId,
      provider: made.provider,
      secret: minted ? randomBytes(32).toString("hex") : null,
      secretFrom: minted ? "minted" : null,
      connection: made.connection,
      repo: made.repo,
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
    if (now instanceof ElysiaStatus) {
      return now;
    }
    if (now.provider === "github" && now.hookId) {
      const arrived = await pinged(now.id);
      if (!arrived) {
        console.warn(`[relay] ${now.id}: no ping from GitHub in 30 s`);
      }
    }
    const final = relayOf(row.id);
    if (final instanceof ElysiaStatus) {
      return final;
    }
    const created: RelayCreated = {
      relay: viewOf(final),
      suggestedRoutes: suggested(final),
    };
    return created;
  };

  /** The relay `id` as `by` may touch it: the owner, or a session of its project. */
  const touchable = (id: string, by: "owner" | InstanceRow) => {
    const row = relayOf(id);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    if (by !== "owner" && by.projectId !== row.projectId) {
      return problem(403, {
        code: "relay-not-yours",
        detail: "That relay is not one of this session's project's.",
      });
    }
    return row;
  };

  /** Turns a relay off: its path answers 404, the webhook the hub made is deleted, Funnel's mount goes with the last one. */
  const remove = async (id: string, by: "owner" | InstanceRow) => {
    const row = touchable(id, by);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    if (row.state === "off") {
      const removed: { github: string; relay: RelayView } = {
        relay: viewOf(row),
        github: "already off",
      };
      return removed;
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
    const after = relayOf(id);
    if (after instanceof ElysiaStatus) {
      return after;
    }
    const removed: { github: string; relay: RelayView } = {
      relay: viewOf(after),
      github: githubSaid,
    };
    return removed;
  };

  /** The owner's secret for a relay (from their terminal): sealed, never answered back. */
  const setSecret = async (id: string, secret: string) => {
    const row = relayOf(id);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    if (row.state === "off") {
      return problem(409, { code: "relay-off", detail: `Relay ${id} is off.` });
    }
    const trimmed = secret.trim();
    if (trimmed.length < 16 || trimmed.length > 512) {
      return problem(400, {
        code: "relay-secret-unfit",
        detail: "A relay's secret is 16 to 512 characters.",
      });
    }
    store.update(id, { secret: trimmed, secretFrom: "owner" });
    console.log(`[relay] ${id}: the owner set its secret`);
    await apply();
    const after = relayOf(id);
    return after instanceof ElysiaStatus ? after : viewOf(after);
  };

  // --- tools ---------------------------------------------------------------------------

  /** A tool's or an ask's words (snake case), as a relay's input. */
  const inputOf = (
    projectId: string,
    words: {
      connection?: string | null;
      id_path?: string | null;
      provider?: RelayProvider;
      repo?: string | null;
      signature_header?: string | null;
      timestamp_header?: string | null;
    }
  ): RelayInput => ({
    projectId,
    provider: words.provider ?? "github",
    repo: words.repo ?? null,
    connection: words.connection ?? null,
    signatureHeader: words.signature_header ?? null,
    timestampHeader: words.timestamp_header ?? null,
    idPath: words.id_path ?? null,
  });

  const approvedAsk = z.object({
    project: z.string(),
    provider: z.enum(RELAY_PROVIDERS),
    repo: z.string().nullish(),
    connection: z.string().nullish(),
    signature_header: z.string().nullish(),
    timestamp_header: z.string().nullish(),
    id_path: z.string().nullish(),
    requested_by: z.string(),
  });

  /** A `relay_create` the owner approved, run by the hub with the arguments shown (asks.ts `carryOut`). */
  const runApproved = async (input: Record<string, unknown>) => {
    const asked = approvedAsk.parse(input);
    const created = await create(
      inputOf(asked.project, asked),
      asked.requested_by
    );
    return created instanceof ElysiaStatus ? created : JSON.stringify(created);
  };

  /**
   * Asks the person to approve opening a relay (asks.ts): the words
   * the session reads while it waits; made now in Full Send.
   */
  const askThenCreate = async (asker: InstanceRow, input: RelayInput) => {
    const made = checked(input);
    if (made instanceof ElysiaStatus) {
      return made;
    }
    const said = publicText(made);
    if (said instanceof ElysiaStatus) {
      return said;
    }
    const project = projectOf(made.projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const recorded = await askPerson(asker, "relay_create", {
      public: said,
      project: made.projectId,
      project_name: project.name,
      provider: made.provider,
      repo: made.repo,
      connection: made.connection,
      signature_header: made.signatureHeader,
      timestamp_header: made.timestampHeader,
      id_path: made.idPath,
      requested_by: asker.id,
    });
    return recorded ?? create(made, asker.id);
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
      problem(403, {
        code: "relay-no-project",
        detail: "This session is in no project, so it has no relays.",
      });
    return [
      tool(
        "relay_create",
        "Open a public webhook path for your project (Tailscale Funnel) once the owner approves; GitHub's webhook is registered for you.",
        {
          provider: z.enum(RELAY_PROVIDERS).optional(),
          repo: z
            .string()
            .optional()
            .describe("github: owner/name, when the project links several"),
          connection: z.string().optional().describe("github"),
          signature_header: z.string().optional().describe("generic"),
          timestamp_header: z.string().optional().describe("generic"),
          id_path: z.string().optional().describe("generic: event id path"),
        },
        async (input) => {
          const projectId = projectOfMe();
          return projectId instanceof ElysiaStatus
            ? projectId
            : await askThenCreate(me(), inputOf(projectId, input));
        },
        (answer) =>
          typeof answer === "string" ? answer : relayCreatedWords(answer)
      ),
      tool(
        "relay_list",
        "Your project's relays: URL, state, the owner's step.",
        {},
        () => {
          const projectId = projectOfMe();
          return Promise.resolve(
            projectId instanceof ElysiaStatus ? projectId : list(projectId)
          );
        },
        relayListWords
      ),
      tool(
        "relay_remove",
        "Turn a relay off; the GitHub webhook the hub made goes with it.",
        { id: z.string().trim().min(1) },
        async ({ id }) => {
          const projectId = projectOfMe();
          if (projectId instanceof ElysiaStatus) {
            return projectId;
          }
          const relays = list(projectId);
          if (relays instanceof ElysiaStatus) {
            return relays;
          }
          const named = byHandle(
            id,
            relays,
            {
              id: (relay) => relay.id,
              said: (relay) => `${relay.provider} ${relay.id.slice(0, 8)}`,
            },
            "relay"
          );
          return await remove(named.id, me());
        },
        relayRemovedWords
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

/** What a relay is made of, as the owner sends it to preview or make one. */
const RELAY_FIELDS = t.Object({
  provider: t.UnionEnum(RELAY_PROVIDERS),
  repo: t.Optional(t.Nullable(t.String())),
  connection: t.Optional(t.Nullable(t.String())),
  signatureHeader: t.Optional(t.Nullable(t.String())),
  timestampHeader: t.Optional(t.Nullable(t.String())),
  idPath: t.Optional(t.Nullable(t.String())),
});

/**
 * The owner's routes for relays, on the hub API (never the receiver). Making
 * one here is the owner's own act; `cawco relay on` shows what goes public
 * and asks before it calls this.
 */
export const relayRoutes = (relay: Relay) =>
  new Elysia()
    .get("/api/projects/:id/relays", ({ params }) => relay.list(params.id))
    .post(
      "/api/projects/:id/relays/preview",
      {
        body: RELAY_FIELDS,
      },
      ({ params, body }) => {
        const made = relay.checked({ ...body, projectId: params.id });
        if (made instanceof ElysiaStatus) {
          return made;
        }
        const said = relay.publicText(made);
        return said instanceof ElysiaStatus ? said : { public: said };
      }
    )
    .post(
      "/api/projects/:id/relays",
      {
        body: RELAY_FIELDS,
      },
      ({ params, body }) =>
        relay.create({ ...body, projectId: params.id }, "owner")
    )
    .delete("/api/relays/:id", ({ params }) => relay.remove(params.id, "owner"))
    .put(
      "/api/relays/:id/secret",
      { body: t.Object({ secret: t.String() }) },
      ({ params, body }) => relay.setSecret(params.id, body.secret)
    );
