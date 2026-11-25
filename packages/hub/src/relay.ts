/**
 * The relay (Projects spec §5.5 Relay, P3): a push-only service delivers to
 * CawCo through one public path, `/hooks/<id>`, and nothing else of the hub
 * is reachable from the internet. A relay belongs to a watch (provider spec
 * §2.4): a webhook is a faster way into that watch, never a second source.
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
 *   the signature, checked by the relay's watch's provider (401; its
 *   `webhook.verify`: GitHub's with `@octokit/webhooks-methods`, Linear's
 *   with `LinearWebhookClient`, a sender's by its scheme, providers
 *   connection/webhook.ts). The caller hears only the status; the reason
 *   goes to the hub log.
 * - **Lands once.** The provider reads the verified delivery
 *   (`webhook.read`) into revisions and events under the keys its poll
 *   uses, and the receiver hands them to the door (intake.ts `take`) with
 *   the relay's watch, whose store is the dedup on (project, source,
 *   natural key): a webhook and a poll of one change land once, in either
 *   order. It answers 202 as soon as `take` returns, before the subscribers
 *   run. GitHub's `ping` is the test delivery: recorded on the relay, not
 *   an event. A body that does not read as what its service sends is 400.
 * - **The hub stores the wanted state; the hub host applies it** (funnel.ts):
 *   at start, when a relay comes or goes, and every minute while one isn't
 *   live, so an owner step taken later (approving Funnel, setting the
 *   operator) is picked up without anyone asking. Not live, a relay says why
 *   in `reason`, and the watch's poll keeps bringing events in.
 * - **The hub registers what it can.** A provider with a webhook lifecycle
 *   (GitHub; Linear, where the sign-in may make webhooks) has its webhook
 *   made through the watch's connection, checked for at start and made
 *   again when it is gone, and deleted with the relay; where the service
 *   refuses, the relay says the provider's manual step.
 * - **Opening a path asks the owner.** A session's `relay_create` is the
 *   person's ask (asks.ts), naming what goes public; the hub opens it
 *   once approved. The hub route is the owner's own door; `cawco relay on` from
 *   the owner's terminal shows the same sentence and asks before calling it.
 * - **Secrets stay in the hub.** A relay's secret is a sealed column; no
 *   route, tool or log line carries it. One the hub mints goes only to the
 *   service, in the registration call; one the provider makes (Stripe,
 *   Linear's own) or the owner pastes is set from the owner's terminal
 *   (`cawco relay set-secret`), never through a session.
 */

import { randomBytes } from "node:crypto";
import { Backoff, type BackoffPolicy } from "@cawco/core/backoff";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { detach } from "@cawco/core/detach";
import { machineId } from "@cawco/core/machine-id";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  RELAY_PROVIDERS,
  type RelayProvider,
  type RelayView,
} from "@cawco/core/relays";
import { DAY_MS, HOUR_MS, MINUTE_MS, secondsOf } from "@cawco/core/time";
import type { HookScheme } from "@cawco/providers/connection/descriptor";
import {
  connectionWebhook,
  hookSigningOf,
  hookSource,
} from "@cawco/providers/connection/webhook";
import { giteaSource } from "@cawco/providers/gitea/client";
import { giteaWebhook } from "@cawco/providers/gitea/webhook";
import { githubSource } from "@cawco/providers/github/ingest";
import { githubWebhook } from "@cawco/providers/github/webhook";
import { gitlabSource } from "@cawco/providers/gitlab/client";
import { gitlabWebhook } from "@cawco/providers/gitlab/webhook";
import { linearWebhook } from "@cawco/providers/linear/webhook";
import type {
  HookAt,
  Ingested,
  MirrorProvider,
  RawDelivery,
  WatchView,
  Webhook,
} from "@cawco/providers/provider";
import { type ProviderFailure, refusedWith } from "@cawco/providers/read-stop";
import { Effect, Schedule } from "effect";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { z } from "zod";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import type { RelayHeld, RelayPatch, RelayWatch } from "./db/relays";
import { GITHUB_HOST, githubReposOf, type WatchRow } from "./db/watches";
import { createFunnel, type Funnel, type FunnelState } from "./funnel";
import { byHandle } from "./handles";
import type { Intake } from "./intake";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { defineTool } from "./mcp-tool";
import {
  relayCreatedWords,
  relayListWords,
  relayRemovedWords,
} from "./presenters/project";
import type { RelayCreated } from "./relay-created";

/** The most a delivery's body holds: 1 MiB. */
const RELAY_BODY_MAX = 1024 * 1024;
/** Deliveries one relay takes a minute: the token bucket's size and its refill. */
const PER_MINUTE = 60;
/**
 * The wanted state applied again while a relay isn't live: from a minute,
 * doubling to half an hour, for a day; then the look goes on at its
 * longest wait without applying, until every relay is live again or the
 * person's own change applies it.
 */
const RELOOKS: BackoffPolicy = {
  firstMs: 60_000,
  mostMs: 30 * MINUTE_MS,
  giveUp: { afterMs: DAY_MS },
};
/** A registration the service refused is tried again after this, unless asked. Our choice. */
const REFUSED_AGAIN_MS = 10 * 60_000;
/** How long creating a relay waits for the service's test delivery (GitHub's ping). Our choice. */
const PING_WAIT_MS = 30_000;
/** How often that wait looks. Our choice. */
const PING_LOOK_MS = 250;
/** One request to a service's API. Our choice. */
const SERVICE_MS = 30_000;
const ID = /^\/hooks\/([A-Za-z0-9_-]{22})$/u;
const HEADER = /^[A-Za-z0-9-]{1,64}$/u;

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

/** A relay as it will be made: the input checked, and the watch it goes into. */
interface RelayPlan extends Required<RelayInput> {
  /** The team's name, for a Linear relay's sentence. */
  teamName: string | null;
  watch: RelayWatch;
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
  readonly connections: Pick<
    Connections,
    "get" | "giteaClient" | "githubClient" | "gitlabClient" | "linearClient"
  >;
  readonly db: Pick<DbShape, "ingress" | "project" | "relays" | "routines">;
  /** Tailscale; the real CLI unless a probe names another. */
  readonly funnel?: Funnel;
  /** The door (intake.ts). */
  readonly intake: Pick<Intake, "take">;
  readonly lifetime: HubLifetimeShape;
}

/** A provider's webhook with its client bound: what the receiver and the lifecycle ask, by watch. */
interface BoundHook {
  /** What a delivery cannot say by itself, read through the watch's connection before the door takes it. */
  complete?: (
    watch: WatchView,
    read: Ingested
  ) => Effect.Effect<Ingested, ProviderFailure>;
  lifecycle?: {
    exists: (
      watch: WatchView,
      hookId: string
    ) => Effect.Effect<boolean, ProviderFailure>;
    register: (
      watch: WatchView,
      hook: { secret: string; url: string }
    ) => Effect.Effect<{ hookId: string }, ProviderFailure>;
    unregister: (
      watch: WatchView,
      hookId: string
    ) => Effect.Effect<void, ProviderFailure>;
  };
  /** The service's name, for sentences. */
  service: string;
  webhook: Pick<
    Webhook<unknown>,
    "deliveryId" | "manualStep" | "mintSecret" | "read" | "verify"
  >;
}

/**
 * A provider's webhook, its lifecycle given a client opened through the
 * watch's connection; a connection that cannot sign in is a refusal of
 * kind `sign-in`, in its words.
 */
const bound = <Client>(
  service: string,
  webhook: Webhook<Client>,
  open?: (watch: WatchView) => Client | Promise<Client>
): BoundHook => {
  const { lifecycle, complete } = webhook;
  const client = (watch: WatchView) =>
    Effect.tryPromise({
      try: async () => {
        if (!open) {
          throw new Error(`${service} has no client`);
        }
        return await open(watch);
      },
      catch: (error) => refusedWith(wordsOf(error), "sign-in"),
    });
  return {
    service,
    webhook: {
      verify: webhook.verify,
      read: webhook.read,
      manualStep: webhook.manualStep,
      ...(webhook.deliveryId ? { deliveryId: webhook.deliveryId } : {}),
      ...(webhook.mintSecret ? { mintSecret: webhook.mintSecret } : {}),
    },
    ...(complete && open
      ? {
          complete: (watch: WatchView, read: Ingested) =>
            client(watch).pipe(
              Effect.flatMap((made) => complete(made, watch, read, SERVICE_MS))
            ),
        }
      : {}),
    ...(lifecycle && open
      ? {
          lifecycle: {
            exists: (watch, hookId) =>
              client(watch).pipe(
                Effect.flatMap((made) =>
                  lifecycle.exists(made, watch, hookId, SERVICE_MS)
                )
              ),
            register: (watch, hook) =>
              client(watch).pipe(
                Effect.flatMap((made) =>
                  lifecycle.register(made, watch, hook, SERVICE_MS)
                )
              ),
            unregister: (watch, hookId) =>
              client(watch).pipe(
                Effect.flatMap((made) =>
                  lifecycle.unregister(made, watch, hookId, SERVICE_MS)
                )
              ),
          },
        }
      : {}),
  };
};

/** The providers whose watches a relay goes into, as a watch row names them. */
const HOOKED: Readonly<Record<string, MirrorProvider>> = {
  github: "github",
  gitlab: "gitlab",
  gitea: "gitea",
  linear: "linear",
  connection: "connection",
};

/** The forges a relay's watch is a repository of: GitHub's, a GitLab's, a Gitea's. */
const FORGES: ReadonlySet<RelayProvider> = new Set([
  "github",
  "gitlab",
  "gitea",
]);

/** The services whose relay has a watch that a connection reads. */
const SERVICES: ReadonlySet<RelayProvider> = new Set([
  "github",
  "gitlab",
  "gitea",
  "linear",
]);

/** How long a delivery's own id is kept, so a sender's retry of it is dropped: past Standard Webhooks' five minutes of a timestamp's tolerance. Our choice. */
const DELIVERY_IDS_MS = HOUR_MS;

/** A watch as its provider reads it. */
const viewOf = (watch: WatchRow): WatchView => ({
  id: watch.id,
  projectId: watch.projectId,
  provider: HOOKED[watch.provider] ?? "connection",
  host: watch.host,
  container: watch.container,
  containerName: watch.containerName,
  connection: watch.connection,
  settings: watch.settings,
  sync: watch.sync,
});

/** What a relay is to the person, read off its watch: its provider's name, a sender's by how it signs. */
const providerOf = (watch: WatchRow): RelayProvider => {
  if (
    watch.provider === "github" ||
    watch.provider === "gitlab" ||
    watch.provider === "gitea" ||
    watch.provider === "linear"
  ) {
    return watch.provider;
  }
  const scheme = hookSigningOf(watch.settings)?.scheme;
  return scheme ? PROVIDER_OF_SCHEME[scheme] : "generic";
};

/** A sender's relay, as the person names it, by how it signs. */
const PROVIDER_OF_SCHEME: Readonly<Record<HookScheme, RelayProvider>> = {
  stripe: "stripe",
  "hmac-header": "generic",
  "standard-webhooks": "standard-webhooks",
};

/** How a relay's sender signs, by the provider it was asked for. */
const SCHEME_OF: Partial<Record<RelayProvider, HookScheme>> = {
  stripe: "stripe",
  generic: "hmac-header",
  "standard-webhooks": "standard-webhooks",
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
  intake,
  lifetime,
}: RelayDeps) => {
  const store = db.relays;
  /** Each provider's webhook, its client opened through the watch's connection. */
  const hooks: Readonly<Record<MirrorProvider, BoundHook | undefined>> = {
    github: bound("GitHub", githubWebhook, (watch) =>
      connections.githubClient(watch.connection)
    ),
    linear: bound("Linear", linearWebhook, (watch) =>
      connections.linearClient(watch.connection)
    ),
    gitlab: bound("GitLab", gitlabWebhook, (watch) =>
      connections.gitlabClient(watch.connection)
    ),
    gitea: bound("Gitea", giteaWebhook, (watch) =>
      connections.giteaClient(watch.connection)
    ),
    connection: bound("the sender", connectionWebhook),
  };
  const hookOf = (watch: WatchRow): BoundHook | undefined =>
    hooks[viewOf(watch).provider];
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
  /** Each relay's deliveries' own ids it took in the last {@link DELIVERY_IDS_MS}, with when (a sender's retry of one is dropped). */
  const deliveryIds = new Map<string, Map<string, number>>();
  /** Whether delivery `id` came to relay `relay` already; it is kept as seen from now. */
  const seenBefore = (relay: string, id: string, now: number): boolean => {
    const seen = deliveryIds.get(relay) ?? new Map<string, number>();
    for (const [one, at] of seen) {
      if (now - at > DELIVERY_IDS_MS) {
        seen.delete(one);
      }
    }
    deliveryIds.set(relay, seen);
    if (seen.has(id)) {
      return true;
    }
    seen.set(id, now);
    return false;
  };
  /** When the service last refused to register a relay's webhook. */
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
   * A delivery the relay's bucket and the body cap let in: verified by its
   * watch's provider before the body is parsed, read by it, and handed to
   * the door; the status to answer, once the door has stored it.
   */
  const deliver = Effect.fnUntraced(function* (
    { relay, watch }: RelayHeld,
    delivery: RawDelivery
  ): Effect.fn.Return<number> {
    const hook = hookOf(watch);
    if (!hook) {
      return 404;
    }
    if (!relay.secret) {
      console.warn(
        `[relay] ${relay.id}: refused a delivery (401): the relay has no secret yet`
      );
      return 401;
    }
    const view = viewOf(watch);
    const verified = yield* Effect.result(
      hook.webhook.verify(delivery, relay.secret, view)
    );
    if (verified._tag === "Failure") {
      console.warn(
        `[relay] ${relay.id}: refused a delivery (401): ${verified.failure.words}`
      );
      return 401;
    }
    const now = new Date(delivery.now);
    store.update(relay.id, { lastDeliveryAt: now });
    const id = hook.webhook.deliveryId?.(delivery);
    if (id !== undefined && seenBefore(relay.id, id, delivery.now)) {
      console.log(
        `[relay] ${relay.id}: delivery ${id} came again; it was taken in already`
      );
      return 202;
    }
    const read = yield* Effect.result(hook.webhook.read(delivery, view));
    if (read._tag === "Failure") {
      console.warn(
        `[relay] ${relay.id}: a verified delivery did not read (400): ${read.failure.words}`
      );
      return 400;
    }
    const said = read.success;
    if (said === "ping") {
      store.update(relay.id, { testedAt: now });
      console.log(
        `[relay] ${relay.id}: ${hook.service}'s test delivery (ping) arrived`
      );
      return 202;
    }
    return said === "ignored"
      ? 202
      : yield* land({ relay, watch }, hook, said, id);
  });

  /**
   * A verified delivery's read, read whole through the watch's connection
   * where its provider asks ({@link BoundHook.complete}), handed to the
   * door: the status to answer. One not read whole stores nothing, and its
   * id is let go so the sender's retry is read again; the poll brings the
   * change in meanwhile.
   */
  const land = Effect.fnUntraced(function* (
    { relay, watch }: RelayHeld,
    hook: BoundHook,
    said: Ingested,
    id: string | undefined
  ): Effect.fn.Return<number> {
    const view = viewOf(watch);
    const whole = hook.complete
      ? yield* Effect.result(hook.complete(view, said))
      : undefined;
    if (whole?._tag === "Failure") {
      if (id !== undefined) {
        deliveryIds.get(relay.id)?.delete(id);
      }
      const { failure } = whole;
      console.warn(
        `[relay] ${relay.id}: a verified delivery was not read whole through ${watch.connection}, so nothing of it is stored (503): ${failure._tag === "ProviderUnanswered" ? `${hook.service} did not answer within ${secondsOf(failure.after)} s` : failure.words}`
      );
      return 503;
    }
    const landed = yield* intake.take(
      {
        projectId: relay.projectId,
        provider: view.provider,
        watchId: watch.id,
      },
      whole?.success ?? said,
      "webhook",
      false
    );
    console.log(
      `[relay] ${relay.id}: ${providerOf(watch)} delivery, ${landed} new`
    );
    return 202;
  });

  /** Every request the receiver gets. */
  const receive = Effect.fnUntraced(function* (
    request: Request
  ): Effect.fn.Return<Response> {
    const found =
      request.method === "POST"
        ? ID.exec(new URL(request.url).pathname)?.[1]
        : undefined;
    const held = found ? store.get(found) : undefined;
    if (!held || held.relay.state === "off") {
      return empty(404);
    }
    const { relay } = held;
    if (!take(relay.id, Date.now())) {
      console.warn(`[relay] ${relay.id}: over 60 deliveries a minute (429)`);
      return empty(429);
    }
    const body = yield* Effect.promise(() =>
      readCapped(request, RELAY_BODY_MAX)
    );
    if (!body) {
      console.warn(`[relay] ${relay.id}: a delivery over 1 MiB (413)`);
      return empty(413);
    }
    return empty(
      yield* deliver(held, { headers: request.headers, body, now: Date.now() })
    );
  });

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
        fetch: (request) => Effect.runPromise(receive(request)),
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

  // --- the webhook's lifecycle --------------------------------------------------------

  /** What the person pastes where, when the hub does not register the webhook. */
  const manualStep = (
    { relay, watch }: RelayHeld,
    url: string,
    why: string
  ): string =>
    hookOf(watch)?.webhook.manualStep(
      viewOf(watch),
      { relay: relay.id, url } satisfies HookAt,
      why
    ) ?? why;

  /** A failure to register said as the relay's patch: a refusal leaves the manual step; no answer, or the service out of reach, is tried again. */
  const notRegistered = (
    held: RelayHeld,
    url: string,
    service: string,
    failure: ProviderFailure
  ): RelayPatch => {
    refusedAt.set(held.relay.id, Date.now());
    if (failure._tag === "ProviderUnanswered") {
      return {
        state: "wanted",
        reason: `${service} did not answer within ${secondsOf(failure.after)} s to register the webhook, so it may or may not be there. The hub tries again.`,
      };
    }
    if (failure.kind === "unreachable" || failure.kind === "rate") {
      return {
        state: "wanted",
        reason: `${failure.words} The hub tries again.`,
      };
    }
    return {
      state: "needs-owner",
      reason: manualStep(held, url, failure.words),
    };
  };

  /**
   * Registers a relay's webhook through its watch's connection: answers the
   * patch (its hook id, live) or the step when the service or the
   * connection refuses.
   */
  const registerWebhook = async (
    held: RelayHeld,
    url: string
  ): Promise<RelayPatch> => {
    const { relay, watch } = held;
    const hook = hookOf(watch);
    if (!(hook?.lifecycle && relay.secret)) {
      return {
        state: "needs-owner",
        reason: manualStep(
          held,
          url,
          `The hub can't register this webhook: no ${hook?.service ?? "service"} connection or secret is set for it.`
        ),
      };
    }
    const made = await Effect.runPromise(
      Effect.result(
        hook.lifecycle.register(viewOf(watch), { url, secret: relay.secret })
      )
    );
    if (made._tag === "Failure") {
      return notRegistered(held, url, hook.service, made.failure);
    }
    console.log(
      `[relay] ${relay.id}: ${hook.service} webhook ${made.success.hookId} registered on ${watch.containerName} through ${watch.connection}`
    );
    refusedAt.delete(relay.id);
    return { hookId: made.success.hookId, state: "live", reason: null };
  };

  /**
   * Whether the webhook the hub registered is still there; one deleted at
   * the service is made again. Not answered, it is taken as there.
   */
  const stillThere = async (held: RelayHeld): Promise<boolean> => {
    const { relay, watch } = held;
    const hook = hookOf(watch);
    if (!(hook?.lifecycle && relay.hookId)) {
      return true;
    }
    const there = await Effect.runPromise(
      Effect.result(hook.lifecycle.exists(viewOf(watch), relay.hookId))
    );
    if (there._tag === "Failure" || there.success) {
      return true;
    }
    console.log(
      `[relay] ${relay.id}: ${hook.service} webhook ${relay.hookId} is gone; the hub registers it again`
    );
    store.update(relay.id, { hookId: null });
    return false;
  };

  /** Deletes the webhook the hub registered; answers what came of it. */
  const deleteWebhook = async ({
    relay,
    watch,
  }: RelayHeld): Promise<string> => {
    const hook = hookOf(watch);
    if (!hook?.lifecycle) {
      return "not a relay whose webhook the hub registers";
    }
    if (!relay.hookId) {
      return "no webhook the hub registered";
    }
    const hooksAt: Partial<Record<string, string>> = {
      github: `https://github.com/${watch.container}/settings/hooks`,
      gitlab: `https://${watch.host}/${watch.container}/-/hooks`,
    };
    const page = hooksAt[watch.provider];
    const where = page ? `; delete it at ${page}` : "";
    const gone = await Effect.runPromise(
      Effect.result(hook.lifecycle.unregister(viewOf(watch), relay.hookId))
    );
    if (gone._tag === "Failure") {
      const { failure } = gone;
      return failure._tag === "ProviderUnanswered"
        ? `${hook.service} did not answer within ${secondsOf(failure.after)} s to delete webhook ${relay.hookId}, so it may still be there${where}`
        : `${hook.service} webhook ${relay.hookId} wasn't deleted (${failure.words})${where}`;
    }
    console.log(
      `[relay] ${relay.id}: ${hook.service} webhook ${relay.hookId} on ${watch.containerName} deleted`
    );
    return `${hook.service} webhook ${relay.hookId} deleted`;
  };

  // --- the wanted state, applied ------------------------------------------------------

  /** A relay whose service the hub registers with, once Funnel is live: its patch. */
  const settleRegistered = async (
    held: RelayHeld,
    publicUrl: string,
    registerNow: boolean
  ): Promise<RelayPatch> => {
    const { relay } = held;
    if (relay.secretFrom === "owner") {
      return { state: "live", reason: null, publicUrl };
    }
    if (relay.hookId && !(registerNow && !(await stillThere(held)))) {
      return { state: "live", reason: null, publicUrl };
    }
    const refused = refusedAt.get(relay.id);
    if (
      !registerNow &&
      refused !== undefined &&
      Date.now() - refused < REFUSED_AGAIN_MS
    ) {
      return { publicUrl };
    }
    const now = store.get(relay.id) ?? held;
    return { ...(await registerWebhook(now, publicUrl)), publicUrl };
  };

  /** What one relay is, given what Funnel is: its patch. */
  const settle = async (
    held: RelayHeld,
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
    const { relay, watch } = held;
    const publicUrl = `${state.base}${relay.id}`;
    if (hookOf(watch)?.lifecycle) {
      return await settleRegistered(held, publicUrl, registerNow);
    }
    return relay.secret
      ? { state: "live", reason: null, publicUrl }
      : {
          state: "needs-owner",
          reason: manualStep(held, publicUrl, ""),
          publicUrl,
        };
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
    const port = listen();
    const state =
      port === undefined
        ? ({
            state: "wanted",
            reason: receiverProblem ?? "The relay's receiver isn't listening.",
          } as const)
        : await tailscale().apply(port);
    for (const held of active) {
      keep(held.relay.id, await settle(held, state, registerNow));
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
    const current = store.get(id)?.relay;
    if (!current || current.state === "off") {
      return;
    }
    const changes = (key: keyof RelayPatch) =>
      key in patch && patch[key] !== current[key];
    const was = new Map(Object.entries<unknown>(current));
    if (
      !Object.entries<unknown>(patch).some(
        ([key, value]) => value !== was.get(key)
      )
    ) {
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

  const relooks = new Backoff(RELOOKS);
  let saidGaveUp = false;
  const tickAgain = (wait: number = RELOOKS.firstMs): void => {
    if (lifetime.closed()) {
      return;
    }
    timer = lifetime.after("relay look again", wait, () => {
      if (!store.active().some(({ relay }) => relay.state !== "live")) {
        relooks.succeeded();
        saidGaveUp = false;
        tickAgain();
        return;
      }
      const step = relooks.failed();
      if (step.kind === "gave-up") {
        if (!saidGaveUp) {
          saidGaveUp = true;
          console.warn(
            `[relay] a relay has not been live for ${Math.round(step.failingMs / HOUR_MS)} h; the hub stops applying it on its own until a change applies it`
          );
        }
        tickAgain(RELOOKS.mostMs);
        return;
      }
      saidGaveUp = false;
      detach(apply(), "relay apply");
      tickAgain(step.ms);
    });
  };

  /** Hub start: the wanted state applied, which opens the receiver only when a relay is active. */
  const start = (): void => {
    detach(apply(true), "relay apply at start");
    lifetime.cancel(timer);
    tickAgain();
  };

  // --- views ------------------------------------------------------------------------

  /** A service's relay's sentence (GitHub's, a GitLab's, a Gitea's, Linear's): none while live, its state says it; else whether its watch is polled meanwhile. */
  const serviceInbound = (
    service: string,
    live: boolean,
    polled: boolean
  ): string => {
    if (live) {
      return "";
    }
    return polled
      ? `Not live yet. Polling ${service} every 60 s.`
      : `Not live yet. Not polling ${service}, so nothing arrives.`;
  };

  const inboundOf = ({ relay, watch }: RelayHeld): string => {
    if (relay.state === "off") {
      return "Off: its path answers 404.";
    }
    const live = relay.state === "live";
    const hook = hookOf(watch);
    if (SERVICES.has(providerOf(watch)) && hook) {
      return serviceInbound(hook.service, live, watch.enabled);
    }
    return live
      ? "Deliveries land as they come."
      : `Not live yet: nothing arrives from ${providerOf(watch)} until it is.`;
  };

  const viewOfRelay = (held: RelayHeld): RelayView => {
    const { relay, watch } = held;
    const provider = providerOf(watch);
    return {
      id: relay.id,
      projectId: relay.projectId,
      provider,
      connection: SERVICES.has(provider) ? watch.connection : null,
      repo: FORGES.has(provider) ? watch.container : null,
      host: relay.host,
      publicUrl: relay.publicUrl,
      state: relay.state,
      reason: relay.reason,
      hasSecret: relay.secret !== null,
      registered: relay.hookId !== null,
      inbound: inboundOf(held),
      testedAt: relay.testedAt?.getTime() ?? null,
      lastDeliveryAt: relay.lastDeliveryAt?.getTime() ?? null,
      createdBy: relay.createdBy,
      createdAt: relay.createdAt.getTime(),
    };
  };

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
    const views: RelayView[] = store.ofProject(projectId).map(viewOfRelay);
    return views;
  };

  /** Whether project `projectId` has a relay that is not off of `provider`. */
  const hasRelay = (projectId: string, provider: RelayProvider): boolean =>
    store
      .ofProject(projectId)
      .some(
        (held) =>
          held.relay.state !== "off" && providerOf(held.watch) === provider
      );

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

  /** A live relay already in `watchId`, as the refusal that says so. */
  const liveIn = (projectId: string, watchId: string, named: string) => {
    const live = store
      .ofProject(projectId)
      .find((held) => held.watch.id === watchId && held.relay.state !== "off");
    return live
      ? problem(409, {
          code: "relay-repo-has-relay",
          detail: `${named} already has relay ${live.relay.id} (${live.relay.state}); remove it first.`,
        })
      : undefined;
  };

  /**
   * A GitHub relay's watch: the project's watch of the repository, through
   * its connection; else a new one through the connection named or the one
   * the project follows GitHub by, not polled (the project's poll follows
   * by its own rules), which the relay alone holds.
   */
  const githubPlan = (
    projectId: string,
    repo: string,
    named: string | null | undefined
  ) => {
    const watch = store
      .watchesOf(projectId)
      .find(
        (one) =>
          one.provider === "github" &&
          one.host === GITHUB_HOST &&
          one.container.toLowerCase() === repo.toLowerCase()
      );
    const asked = named?.trim() || undefined;
    if (watch && asked && asked !== watch.connection) {
      return problem(409, {
        code: "relay-connection-unusable",
        detail: `${repo} is read through ${watch.connection}, and its relay registers the webhook through it; leave connection out, or name ${watch.connection}.`,
      });
    }
    const connection =
      watch?.connection ?? asked ?? db.ingress.followedBy(projectId);
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
    if (watch) {
      const taken = liveIn(projectId, watch.id, repo);
      return (
        taken ?? {
          connection,
          watch: { kind: "existing", id: watch.id } satisfies RelayWatch,
        }
      );
    }
    const now = new Date();
    const made: RelayWatch = {
      kind: "new",
      row: {
        id: crypto.randomUUID(),
        projectId,
        provider: "github",
        host: GITHUB_HOST,
        container: repo,
        containerName: repo,
        containerUrl: `https://${GITHUB_HOST}/${repo}`,
        connection,
        sync: "off",
        syncSince: null,
        syncDirectionAt: null,
        settings: {},
        enabled: false,
        state: null,
        reason: null,
        resumeAt: null,
        polledAt: null,
        createdBy: "owner",
        createdAt: now,
      },
    };
    return { connection, watch: made };
  };

  /** A Linear relay's watch: the team the project's tracker syncs. */
  const linearPlan = (projectId: string) => {
    const watch = store
      .watchesOf(projectId)
      .find((one) => one.provider === "linear" && one.sync !== "off");
    if (!watch) {
      return problem(400, {
        code: "relay-connection-unnamed",
        detail:
          "This project doesn't sync a Linear team. Bind one as its tracker first.",
      });
    }
    const taken = liveIn(projectId, watch.id, watch.containerName);
    return (
      taken ?? {
        connection: watch.connection,
        teamName: watch.containerName,
        watch: { kind: "existing", id: watch.id } satisfies RelayWatch,
      }
    );
  };

  /** A sender's relay's own watch: how it signs, its id the relay's. */
  const senderWatch = (
    projectId: string,
    id: string,
    scheme: HookScheme,
    headers: {
      idPath: string | null;
      signatureHeader: string | null;
      timestampHeader: string | null;
    }
  ): RelayWatch => ({
    kind: "new",
    row: {
      id,
      projectId,
      provider: "connection",
      host: "",
      container: id,
      containerName: hookSource(id),
      containerUrl: "",
      connection: "",
      sync: "off",
      syncSince: null,
      syncDirectionAt: null,
      settings: {
        idPath: headers.idPath,
        scheme,
        signatureHeader: headers.signatureHeader,
        timestampHeader: headers.timestampHeader,
      },
      enabled: true,
      state: null,
      reason: null,
      resumeAt: null,
      polledAt: null,
      createdBy: "owner",
      createdAt: new Date(),
    },
  });

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

  /** A GitHub relay as it will be made, or the refusal. */
  const githubChecked = (project: ProjectRow, input: RelayInput) => {
    const repo = githubRepoFor(project, input.repo);
    if (repo instanceof ElysiaStatus) {
      return repo;
    }
    const plan = githubPlan(project.id, repo, input.connection);
    if (plan instanceof ElysiaStatus) {
      return plan;
    }
    const made: RelayPlan = {
      projectId: project.id,
      provider: "github",
      repo,
      connection: plan.connection,
      signatureHeader: null,
      timestampHeader: null,
      idPath: null,
      teamName: null,
      watch: plan.watch,
    };
    return made;
  };

  /** A Linear relay as it will be made, or the refusal. */
  const linearChecked = (project: ProjectRow) => {
    const plan = linearPlan(project.id);
    if (plan instanceof ElysiaStatus) {
      return plan;
    }
    const made: RelayPlan = {
      projectId: project.id,
      provider: "linear",
      repo: null,
      connection: plan.connection,
      signatureHeader: null,
      timestampHeader: null,
      idPath: null,
      teamName: plan.teamName,
      watch: plan.watch,
    };
    return made;
  };

  /**
   * A GitLab's or Gitea's relay as it will be made, or the refusal: the
   * project's watch of the repository named (its only one when left out),
   * read through its connection. The project follows that forge first: a
   * delivery is read whole through the watch's connection.
   */
  const forgeChecked = (
    project: ProjectRow,
    input: RelayInput,
    provider: "gitlab" | "gitea"
  ) => {
    const service = provider === "gitlab" ? "GitLab" : "Gitea";
    const followed = store
      .watchesOf(project.id)
      .filter((one) => one.provider === provider && one.enabled);
    const asked = input.repo?.trim().toLowerCase();
    const named = asked
      ? followed.filter(
          (one) =>
            one.container.toLowerCase() === asked ||
            `${one.host}/${one.container}`.toLowerCase() === asked
        )
      : followed;
    const repos = followed.map((one) => `${one.host}/${one.container}`);
    const [watch] = named;
    const detail =
      followed.length === 0
        ? `This project doesn't follow a ${service} repository. Connect ${service} and link one first.`
        : `Name the ${service} repository to relay (repo): ${repos.join(", ")}.`;
    if (asked && named.length !== 1) {
      return problem(400, { code: "relay-repo-unknown", detail });
    }
    if (!watch || named.length > 1) {
      return problem(400, { code: "relay-repo-unnamed", detail });
    }
    const asksConnection = input.connection?.trim();
    if (asksConnection && asksConnection !== watch.connection) {
      return problem(409, {
        code: "relay-connection-unusable",
        detail: `${watch.container} uses ${watch.connection}. Leave connection out or name ${watch.connection}.`,
      });
    }
    const taken = liveIn(project.id, watch.id, watch.container);
    if (taken) {
      return taken;
    }
    const made: RelayPlan = {
      projectId: project.id,
      provider,
      repo: watch.container,
      connection: watch.connection,
      signatureHeader: null,
      timestampHeader: null,
      idPath: null,
      teamName: null,
      watch: { kind: "existing", id: watch.id },
    };
    return made;
  };

  /** A sender's relay (Stripe, generic, Standard Webhooks) as it will be made, or the refusal. */
  const senderChecked = (
    project: ProjectRow,
    input: RelayInput,
    id: string
  ) => {
    const scheme = SCHEME_OF[input.provider] ?? "hmac-header";
    const headers =
      scheme === "hmac-header"
        ? genericHeaders(input)
        : { signatureHeader: null, timestampHeader: null };
    if (headers instanceof ElysiaStatus) {
      return headers;
    }
    const idPath = scheme === "stripe" ? null : input.idPath?.trim() || null;
    const kept = { ...headers, idPath };
    const made: RelayPlan = {
      projectId: project.id,
      provider: input.provider,
      repo: null,
      connection: null,
      ...kept,
      teamName: null,
      watch: senderWatch(project.id, id, scheme, kept),
    };
    return made;
  };

  /** A new relay's id: 128 random bits, base64url. */
  const newId = (): string => randomBytes(16).toString("base64url");

  /** The input as it will be made, or the refusal: everything checked before anyone is asked. */
  const checked = (input: RelayInput, id: string = newId()) => {
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
    if (input.provider === "github") {
      return githubChecked(project, input);
    }
    if (input.provider === "gitlab" || input.provider === "gitea") {
      return forgeChecked(project, input, input.provider);
    }
    return input.provider === "linear"
      ? linearChecked(project)
      : senderChecked(project, input, id);
  };

  /** The sentence the owner approves: what goes public. */
  const publicText = (input: RelayPlan) => {
    const project = projectOf(input.projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    let registers = "";
    if (input.provider === "github") {
      registers = ` The hub then registers a webhook on ${input.repo} through ${input.connection}, with a secret it makes, for pull requests, issues and issue comments.`;
    } else if (input.provider === "linear") {
      registers = ` Approving also registers a webhook for issues and comments on Linear team ${input.teamName} through ${input.connection}.`;
    } else if (input.provider === "gitlab") {
      registers = ` Approving also registers a webhook for issues, merge requests and comments on ${input.repo} through ${input.connection}.`;
    } else if (input.provider === "gitea") {
      registers = ` After approving, add a webhook on ${input.repo} in Gitea.`;
    }
    return `Approving opens one public HTTPS path on the hub's machine (${tailscale().host}) through Tailscale Funnel, port 10000: https://<its tailnet name>:10000/hooks/<a new random id>. The internet can POST ${input.provider}-signed deliveries for project “${project.name}” there; it answers nothing back, and nothing else of the hub is reachable through it.${registers}`;
  };

  /** Whether the service's test delivery arrived, looked for every {@link PING_LOOK_MS} up to {@link PING_WAIT_MS}. */
  const pinged = (id: string): Promise<boolean> =>
    Effect.runPromise(
      Effect.sync(
        () => Boolean(store.get(id)?.relay.testedAt) || lifetime.closed()
      ).pipe(
        Effect.repeat({
          schedule: Schedule.spaced(PING_LOOK_MS),
          until: (seen) => seen,
        }),
        Effect.timeoutOption(PING_WAIT_MS),
        Effect.map(() => Boolean(store.get(id)?.relay.testedAt))
      )
    );

  /** What an event route's source pattern matches of what the relay brings. */
  const routeSourceOf = (relayId: string, watch: WatchRow): string => {
    if (watch.provider === "github") {
      return githubSource(watch.container);
    }
    if (watch.provider === "gitlab") {
      return gitlabSource(watch.host, watch.container);
    }
    if (watch.provider === "gitea") {
      return giteaSource(watch.host, watch.container);
    }
    if (watch.provider === "linear") {
      // Linear's source is `linear:<workspace>/<team key>`; the key leads the team's name.
      const key = watch.containerName.split(" · ")[0]?.trim().toLowerCase();
      return `linear:*/${key || "*"}`;
    }
    return hookSource(relayId);
  };

  /** The routes a conversation may propose for the relay: its source, and the project's routines. */
  const suggested = ({
    relay,
    watch,
  }: RelayHeld): RelayCreated["suggestedRoutes"] => {
    const source = routeSourceOf(relay.id, watch);
    const routines = db.routines
      .list(relay.projectId)
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

  /** Makes a relay: the id and secret minted, Funnel applied, the service's webhook registered and its ping awaited. */
  const create = async (
    input: RelayInput,
    by: string,
    id: string = newId()
  ) => {
    const made = checked(input, id);
    if (made instanceof ElysiaStatus) {
      return made;
    }
    // The hub mints the secret of a webhook it registers (GitHub's, a
    // GitLab's in its own form, Linear's where it may), and of no other.
    const hook = hooks[HOOKED[made.provider] ?? "connection"];
    const minted =
      made.provider === "github" ||
      made.provider === "linear" ||
      (made.provider === "gitlab" && hook?.lifecycle !== undefined);
    const held = store.create(
      {
        id,
        projectId: made.projectId,
        secret: minted
          ? (hook?.webhook.mintSecret?.() ?? randomBytes(32).toString("hex"))
          : null,
        secretFrom: minted ? "minted" : null,
        hookId: null,
        host: await hostOf(),
        publicUrl: null,
        state: "wanted",
        reason: "The hub is applying it.",
        testedAt: null,
        lastDeliveryAt: null,
        createdBy: by,
        createdAt: new Date(),
      },
      made.watch
    );
    console.log(
      `[relay] ${held.relay.id}: ${made.provider} relay for project ${held.relay.projectId} into watch ${held.watch.id}, by ${by}`
    );
    await apply(true);
    const now = relayOf(id);
    if (now instanceof ElysiaStatus) {
      return now;
    }
    if (now.watch.provider === "github" && now.relay.hookId) {
      const arrived = await pinged(id);
      if (!arrived) {
        console.warn(`[relay] ${id}: no ping from GitHub in 30 s`);
      }
    }
    const final = relayOf(id);
    if (final instanceof ElysiaStatus) {
      return final;
    }
    const created: RelayCreated = {
      relay: viewOfRelay(final),
      suggestedRoutes: suggested(final),
    };
    return created;
  };

  /** The relay `id` as `by` may touch it: the owner, or a session of its project. */
  const touchable = (id: string, by: "owner" | InstanceRow) => {
    const held = relayOf(id);
    if (held instanceof ElysiaStatus) {
      return held;
    }
    if (by !== "owner" && by.projectId !== held.relay.projectId) {
      return problem(403, {
        code: "relay-not-yours",
        detail: "That relay is not one of this session's project's.",
      });
    }
    return held;
  };

  /** Turns a relay off: its path answers 404, the webhook the hub made is deleted, Funnel's mount goes with the last one. */
  const remove = async (id: string, by: "owner" | InstanceRow) => {
    const held = touchable(id, by);
    if (held instanceof ElysiaStatus) {
      return held;
    }
    if (held.relay.state === "off") {
      const removed: { github: string; relay: RelayView } = {
        relay: viewOfRelay(held),
        github: "already off",
      };
      return removed;
    }
    store.update(id, { state: "off", reason: null, publicUrl: null });
    buckets.delete(id);
    refusedAt.delete(id);
    console.log(`[relay] ${id} is off, by ${by === "owner" ? "owner" : by.id}`);
    const said = await deleteWebhook(held);
    if (held.relay.hookId && said.endsWith("deleted")) {
      store.update(id, { hookId: null });
    }
    await apply();
    const after = relayOf(id);
    if (after instanceof ElysiaStatus) {
      return after;
    }
    const removed: { github: string; relay: RelayView } = {
      relay: viewOfRelay(after),
      github: said,
    };
    return removed;
  };

  /** The owner's secret for a relay (from their terminal): sealed, never answered back. */
  const setSecret = async (id: string, secret: string) => {
    const held = relayOf(id);
    if (held instanceof ElysiaStatus) {
      return held;
    }
    if (held.relay.state === "off") {
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
    return after instanceof ElysiaStatus ? after : viewOfRelay(after);
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
    const id = newId();
    const made = checked(input, id);
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
    return recorded ?? create(input, asker.id, id);
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
      RELAY_CREATE_DEFINITION.run(async (input) => {
        const projectId = projectOfMe();
        return projectId instanceof ElysiaStatus
          ? projectId
          : await askThenCreate(me(), inputOf(projectId, input));
      }),
      RELAY_LIST_DEFINITION.run(() => {
        const projectId = projectOfMe();
        return Promise.resolve(
          projectId instanceof ElysiaStatus ? projectId : list(projectId)
        );
      }),
      RELAY_REMOVE_DEFINITION.run(async ({ id }) => {
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
      }),
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
    hasRelay,
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

const RELAY_CREATE_DEFINITION = defineTool(
  "relay_create",
  "Relays: public webhook paths over Tailscale Funnel, opened once the owner approves. Use it when a service must push events to your project's routes.",
  {
    provider: z.enum(RELAY_PROVIDERS).optional(),
    repo: z
      .string()
      .optional()
      .describe("owner/name or group/project, when several"),
    connection: z.string().optional().describe("github"),
    signature_header: z.string().optional().describe("generic"),
    timestamp_header: z.string().optional().describe("generic"),
    id_path: z.string().optional().describe("generic: event id path"),
  },
  (answer: string | RelayCreated) =>
    typeof answer === "string" ? answer : relayCreatedWords(answer)
);

const RELAY_LIST_DEFINITION = defineTool(
  "relay_list",
  "Your project's relays, each with its URL, state and the owner's step. Use it to see whether a relay is open and what it waits on.",
  {},
  relayListWords
);

const RELAY_REMOVE_DEFINITION = defineTool(
  "relay_remove",
  "Turns a relay off, with the webhook the hub made for it. Use it for a relay no longer wanted.",
  { id: z.string().trim().min(1) },
  relayRemovedWords
);

/** The tools as a listing reads them, before any session's handlers are bound. */
export const RELAY_DEFINITIONS = [
  RELAY_CREATE_DEFINITION.listed(),
  RELAY_LIST_DEFINITION.listed(),
  RELAY_REMOVE_DEFINITION.listed(),
];
