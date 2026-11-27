import type { BackoffPolicy } from "@cawco/core/backoff";
import { readWithin } from "@cawco/core/bounded";
import {
  type BackoffTries,
  backoffSchedule,
} from "@cawco/core/effect/backoff-schedule";
import { boundedRead } from "@cawco/core/effect/bounded";
import { makeJoin } from "@cawco/core/effect/join";
import {
  CAWCO_OAUTH_URL,
  type FleetMcpServer,
  type MachineFleetConfig,
} from "@cawco/core/fleet";
import type { ConnectAccess, ConnectAccessSet } from "@cawco/core/frames";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { DAY_MS, HOUR_MS, MINUTE_MS, secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { configurePage } from "@cawco/core/words/configure";
import { mcpWords } from "@cawco/core/words/mcp";
import { quote } from "@cawco/providers/quote";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  extractWWWAuthenticateParams,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { OAuthError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import {
  Clock,
  Duration,
  Effect,
  type Exit,
  Fiber,
  Pull,
  Ref,
  Schedule,
  Schema,
} from "effect";
import { problem } from "elysia";
import { z } from "zod";
import type { DbShape } from "./db";
import { SIGN_IN_TAKEN } from "./db/mcp-servers";
import { type Exchange, FleetMcpRelay, wholeResponse } from "./fleet-mcp-relay";
import type { HubLifetimeShape } from "./lifetime";

const SHARED_CLIENT_ID = `${CAWCO_OAUTH_URL}/client.json`;
/**
 * Every provider redirects to CawCo's hand-back page, which forwards the code
 * to the hub origin the starting browser recorded on CawCo's start page. One
 * https redirect is accepted by providers that refuse plain http off loopback,
 * and it is the same whichever address a browser reached the dashboard by.
 */
const SHARED_REDIRECT = `${CAWCO_OAUTH_URL}/callback`;
export interface SignInStart {
  authorizationUrl: string;
  /** When the provider's page stops taking this sign-in's answer, epoch ms. */
  expiresAt: number;
}

/** How long a started sign-in's answer is taken: the provider's page is good for minutes. */
const SIGN_IN_TTL_MS = 10 * 60_000;

/**
 * A scope that reads and does no more: one ending in a read word (`read`,
 * `readonly`, `read_only`, `ro`, `view`) after a separator, or that word
 * alone (`docs.read`, `files:read`, `repo_readonly`). CawCo's own call: no
 * standard names an OAuth scope's reach, so the name is all there is.
 */
const READ_SCOPE = /(?:^|[.:_/-])(?:read(?:[._-]?only)?|ro|view)$/iu;

/**
 * The access a server's scopes offer (core `ConnectAccessSet`): read-only
 * (its read scopes) and read and write (all of them) when it names both
 * kinds; else the one set it has, or none when it names no scopes.
 */
const accessOffers = (scopes: readonly string[]): ConnectAccessSet[] => {
  const all = [...new Set(scopes)];
  const read = all.filter((scope) => READ_SCOPE.test(scope));
  if (all.length === 0) {
    return [];
  }
  if (read.length > 0 && read.length < all.length) {
    return [
      { access: "read", scopes: read },
      { access: "write", scopes: all },
    ];
  }
  return [{ access: read.length > 0 ? "read" : "write", scopes: all }];
};

/** What a connect ask for a server says before anything opens (connect-asks.ts). */
export interface AskFacts {
  /** As whom the hub is signed in there, while it is. */
  as: string | null;
  /** Its sign-in ended without the person: a reconnect. */
  ended: boolean;
  /** The access the last sign-in asked for, kept past its end. */
  held: ConnectAccess | null;
  offers: ConnectAccessSet[];
  signedIn: boolean;
  /** The provider's authorization page. */
  url: string;
}

/** Where an ID token's claims are: its middle part, base64url JSON. */
const claimsOf = (idToken: unknown): Record<string, unknown> => {
  if (typeof idToken !== "string") {
    return {};
  }
  const [, body] = idToken.split(".");
  try {
    return z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(Buffer.from(body ?? "", "base64url").toString("utf8")));
  } catch {
    return {};
  }
};

/**
 * As whom the provider signed the hub in: its ID token's email, else its
 * preferred username, else its name (OpenID Connect Core §5.1). Read for
 * the person's eyes only, never to decide anything, so it is not verified.
 * None when the provider sent no ID token.
 */
const identityOf = (tokens: { id_token?: unknown }): string | null => {
  const claims = claimsOf(tokens.id_token);
  const said = [claims.email, claims.preferred_username, claims.name].find(
    (one): one is string => typeof one === "string" && one.trim() !== ""
  );
  return said?.trim() ?? null;
};
const DISCOVERY_TIMEOUT_MS = 15_000;
/**
 * Re-probes of a server the hub could not reach: from 30 s, doubling to 15
 * min, for a day; then it waits for the server to be saved again.
 */
const REPROBES: BackoffPolicy = {
  firstMs: 30_000,
  mostMs: 15 * MINUTE_MS,
  giveUp: { afterMs: DAY_MS },
};
/**
 * A token request's own deadline, far past what a request waiting on it
 * waits ({@link REFRESH_WAIT_MS}). A public client's refresh token is
 * rotated by the provider the moment it answers (MCP authorization spec:
 * "For public clients, authorization servers MUST rotate refresh tokens"),
 * so an answer let go at a short deadline loses the only refresh token
 * that still works, and the next refresh spends the old one and is refused.
 */
const TOKEN_DEADLINE_MS = 120_000;
/** How long a request waits on a refresh before it is answered 502 to retry; the refresh itself goes on. */
const REFRESH_WAIT_MS = 20_000;
/** One renewal's token requests: six, from 0.5 s apart, doubling to 8 s (CawCo's own call). */
const RENEW_TRIES: BackoffPolicy = {
  firstMs: 500,
  mostMs: 8000,
  giveUp: { afterTries: 6 },
};
/**
 * After a renewal that landed on none of its tries, the next waits from 30
 * s, doubling to 15 min; renewals that have failed for a day end the
 * sign-in, and the person is asked to sign in again ({@link FleetMcp.#end}).
 */
const RENEW_COOLING: BackoffPolicy = {
  firstMs: 30_000,
  mostMs: 15 * MINUTE_MS,
  giveUp: { afterMs: DAY_MS },
};
/** A refresh starts this long before its access token expires, behind requests still using it. */
const REFRESH_AHEAD_MS = 60_000;
/** An access token with less than this left is not sent: the request waits for the refresh. */
const EXPIRY_MARGIN_MS = 5000;
/**
 * An access token the upstream refuses this soon after it was issued is not
 * refreshed again: the refusal is the upstream's, not the token's age, and
 * a refresh per request would spend refresh tokens as fast as calls come.
 */
const FRESH_TOKEN_MS = 10_000;
/** The token endpoint's errors that end a sign-in (RFC 6749 §5.2, RFC 6750 §3.1). */
const ENDING = new Set(["invalid_grant", "invalid_token"]);
type OAuthRow = NonNullable<ReturnType<DbShape["getMcpOauth"]>>;
type McpServerRow = NonNullable<ReturnType<DbShape["getMcpServer"]>>;

/**
 * No answer from the server: the network, DNS, none within the deadline, or
 * a 5xx. Thrown, not returned: {@link reach} is the MCP SDK's `fetchFn`, whose
 * callers take a Response or an error.
 */
class Unreachable extends Schema.TaggedError<Unreachable>()("Unreachable", {
  message: Schema.String,
  /** What the fetch threw, when it threw. */
  cause: Schema.optional(Schema.Unknown),
}) {}

const unreachable = (error: unknown): boolean => error instanceof Unreachable;

/** A fetch that threw before any answer came: {@link Unreachable}, what it threw its cause. */
const noResponse = (error: unknown): Unreachable =>
  new Unreachable({
    message: `No response (${error instanceof Error ? error.message : String(error)}).`,
    cause: error,
  });

/** The hub holds no sign-in for the server: answered as the 503 `mcp-signed-out`. */
class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {
  message: Schema.String,
}) {}

/** A request the sign-in could not serve now, the sign-in kept: answered 502, to retry. */
class NotNow extends Schema.TaggedError<NotNow>()("NotNow", {
  message: Schema.String,
}) {}

/** The hub's words for a sign-in it no longer holds. */
const signedOut = (): SignedOut => new SignedOut({ message: "Signed out." });

/** A server's sign-in changed under a renewal: whatever it got is not this sign-in's. */
const changedMeanwhile = (): NotNow =>
  new NotNow({
    message:
      "This server changed while its sign-in was renewed. Retry the request.",
  });

/**
 * One token request that left the sign-in standing, in the provider's
 * words: tried again ({@link RENEW_TRIES}). `unanswered`: no answer came,
 * so the provider may have rotated the refresh token then.
 */
class RenewFailed extends Schema.TaggedError<RenewFailed>()("RenewFailed", {
  unanswered: Schema.Boolean,
  words: Schema.String,
}) {}

/** A renewal's way out of its tries: the tokens kept, or why it stops with the sign-in as it is now. */
type Renewed = { kept: OAuthRow } | { stopped: SignedOut | NotNow };

/** What one token request came to: {@link Renewed}, a refusal that ends the sign-in, or a failure to try again. */
type Tried = Renewed | { ended: string } | { failed: RenewFailed };

/** How a probe went: the server did not answer (its re-probes go on), or anything else. */
type Probed = "unanswered" | "done";

/** A server the hub could not reach: the config it tried, and the fiber probing it again ({@link REPROBES}). */
interface Reprobing {
  config: McpServerRow["config"];
  fiber?: Fiber.Fiber<unknown, unknown>;
  /** Its own probe is running: what that probe settles ends it from within. */
  probing: boolean;
}

/**
 * A server whose last renewal landed on none of its tries: no renewal before
 * `until`. `next` is the step of its {@link RENEW_COOLING} schedule, whose
 * state is the cool-down's series: it starts over once a renewal lands.
 */
interface Cooling {
  next: (
    now: number,
    input: unknown
  ) => Pull.Pull<[BackoffTries, Duration.Duration], never, BackoffTries>;
  until: number;
  why: string;
}
/** A sign-in that ended without the person: when, which server, and why. */
interface SignInEnded {
  at: Date;
  name: string;
  why: string;
}

/** What the hub tells the person about its sign-ins (push.ts): one ended, or one signed in again. */
export interface SignInPorts {
  ended: (ended: SignInEnded) => void;
  signedIn: (name: string) => void;
}

const TRAILING_STOP = /\.$/u;

/** A provider's words, cut to what a log line and a Show details carry. */
const cut = (words: string): string => quote(words);

/**
 * A token endpoint's refusal in its own words: the OAuth error code and its
 * description, with the HTTP status. Only an {@link OAuthError} is read:
 * anything else the SDK throws (a token response it could not parse) may
 * carry the tokens themselves, and is named by its kind alone.
 */
const refusalWords = (error: unknown, status: number | null): string => {
  const at = status ? ` (HTTP ${status})` : "";
  if (error instanceof OAuthError) {
    return cut(
      `${error.errorCode}${error.message ? `: ${error.message}` : ""}${at}`
    );
  }
  if (error instanceof Unreachable) {
    return `no answer (${error.message.replace(TRAILING_STOP, "")})`;
  }
  return `an answer the hub could not read${at}`;
};

/**
 * Why a sign-in ended at the token endpoint: its refusal, and the tries of
 * the same renewal that got no answer before it.
 */
const endedWords = (said: string, unanswered: number): string => {
  const earlier =
    unanswered > 0
      ? ` ${unanswered} earlier ${unanswered === 1 ? "try" : "tries"} of this renewal got no answer, so the provider may have rotated the refresh token then.`
      : "";
  return `The token endpoint refused to renew it: ${said}.${earlier}`;
};

const BEARER_ERROR = /\berror="([^"]*)"/u;
const BEARER_DESCRIPTION = /\berror_description="([^"]*)"/u;

/** The upstream's own words on a 401: its `WWW-Authenticate` error and description (RFC 6750 §3). */
const bearerWords = (response: Response): string => {
  const challenge = response.headers.get("WWW-Authenticate") ?? "";
  const error = BEARER_ERROR.exec(challenge)?.[1];
  const description = BEARER_DESCRIPTION.exec(challenge)?.[1];
  return cut(
    [error, description].filter(Boolean).join(": ") || "no reason given"
  );
};

/**
 * A fetch whose failure to get the server's own answer is told apart from what
 * that answer said. A 5xx is no answer either: it is what an edge or a proxy in
 * front of the server says while the server cannot be reached, and taking it
 * for "direct" would delete a signed-in server's OAuth row. `take` reads what
 * is wanted of the response inside the same deadline, so a body cut off by
 * it is as unanswered as a connection that never opened.
 */
const reachWithin = async (
  input: string | URL,
  init: RequestInit | undefined,
  take: (response: Response) => Promise<Response>,
  deadline = DISCOVERY_TIMEOUT_MS
): Promise<Response> => {
  const reached = await readWithin(deadline, async (signal) => {
    let response: Response;
    try {
      response = await fetch(input, { ...init, signal });
    } catch (error) {
      throw noResponse(error);
    }
    if (response.status >= 500) {
      await response.body?.cancel();
      throw new Unreachable({ message: `HTTP ${response.status}.` });
    }
    return await take(response);
  });
  switch (reached.kind) {
    case "answered":
      return reached.value;
    case "unanswered":
      throw new Unreachable({
        message: `No answer within ${secondsOf(reached.after)} s.`,
      });
    default:
      unhandled("read", reached);
  }
};

/** {@link reachWithin} with the whole body read: the SDK's discovery fetches. */
const reach = (input: string | URL, init?: RequestInit): Promise<Response> =>
  reachWithin(input, init, wholeResponse);

/**
 * An OAuth error nested under `detail`, as a FastAPI server answers one
 * (ElevenLabs: `{"detail":{"error":"invalid_grant"}}`), where RFC 6749 §5.2
 * puts `error` at the top.
 */
const NESTED_OAUTH_ERROR = z.object({
  detail: z.object({
    error: z.string(),
    error_description: z.string().optional(),
    message: z.string().optional(),
  }),
});

/**
 * A token endpoint's refusal in RFC 6749 §5.2's own shape. The MCP SDK reads
 * a refusal only as `{ "error": … }` at the top: anything else it fails as
 * "Invalid OAuth error response", a `server_error`, so a provider that
 * nests its error under `detail` (ElevenLabs) never said `invalid_grant`,
 * {@link ENDING} never saw it, and a dead sign-in was renewed for ever
 * while the person was never asked to sign in again (tsk-399). Such a body
 * is moved to the top; any other answer is left as it came.
 */
const oauthShaped = async (response: Response): Promise<Response> => {
  const whole = await wholeResponse(response);
  if (whole.status < 400) {
    return whole;
  }
  let body: unknown;
  try {
    body = await whole.clone().json();
  } catch {
    return whole;
  }
  const nested = NESTED_OAUTH_ERROR.safeParse(body);
  if (!nested.success) {
    return whole;
  }
  const { error, error_description, message } = nested.data.detail;
  const description = error_description ?? message;
  const headers = new Headers(whole.headers);
  headers.delete("Content-Length");
  return Response.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status: whole.status, statusText: whole.statusText, headers }
  );
};

/**
 * {@link reach} for the token endpoint: its own long deadline
 * ({@link TOKEN_DEADLINE_MS}), and a 429 or 408 is no answer either, tried
 * again, never a refusal. A refusal reaches the SDK in RFC 6749's shape
 * ({@link oauthShaped}). `heard` is told the status of each answer taken.
 */
const reachToken =
  (heard: (status: number) => void) =>
  (input: string | URL, init?: RequestInit): Promise<Response> =>
    reachWithin(
      input,
      init,
      async (response) => {
        if (response.status === 429 || response.status === 408) {
          await response.body?.cancel();
          throw new Unreachable({ message: `HTTP ${response.status}.` });
        }
        heard(response.status);
        return await oauthShaped(response);
      },
      TOKEN_DEADLINE_MS
    );

/** {@link reachWithin} for the status and headers only: the body (perhaps a stream that stays open) is let go. */
const reachHead = (
  input: string | URL,
  init?: RequestInit
): Promise<Response> =>
  reachWithin(input, init, async (response) => {
    await response.body?.cancel();
    return response;
  });

export class FleetMcp {
  readonly #db: DbShape;
  readonly #changed: () => void;
  readonly #lifetime: HubLifetimeShape;
  /** One probe at a time per server, each after the one before it: a save is probed as it is now. */
  readonly #probing = makeKeyedLock<string>();
  /** One per server the hub could not reach ({@link Reprobing}). */
  readonly #reprobes = new Map<string, Reprobing>();
  /**
   * The one refresh under way per server, on a fiber of its own: every
   * request that needs one waits on it, and one that stops waiting leaves it
   * running. Its exit is its value, so its failure is no fiber's failure.
   */
  readonly #refreshing = new Map<
    string,
    Fiber.Fiber<Exit.Exit<OAuthRow, SignedOut | NotNow>>
  >();
  /** A server whose last refresh landed on none of its tries ({@link Cooling}). */
  readonly #cooling = new Map<string, Cooling>();
  /** When each server's access token was issued here, to tell a fresh token's refusal from an old one's. */
  readonly #issued = new Map<string, number>();
  /** A sign-in's start shared by every ask for the same server and access while it runs. */
  readonly #signingIn = makeJoin<string, SignInStart, unknown>();
  /** Every session's requests to a signed-in server, through the hub's one identity there. */
  readonly #relay: FleetMcpRelay;
  readonly #ports: SignInPorts;

  constructor(
    db: DbShape,
    changed: () => void,
    lifetime: HubLifetimeShape,
    ports: SignInPorts
  ) {
    this.#db = db;
    this.#changed = changed;
    this.#lifetime = lifetime;
    this.#ports = ports;
    this.#relay = new FleetMcpRelay(
      {
        get: (id, server) => db.getMcpSession(id, server),
        put: (id, server, init) => db.putMcpSession({ id, server, init }),
        touch: (id) => db.touchMcpSession(id),
        delete: (id) => db.deleteMcpSession(id),
        prune: (before) => db.pruneMcpSessions(before),
      },
      lifetime
    );
  }

  /** The promise edge of every probe under way: settles once each server's turn that holds or waits now has ended. */
  ready(): Promise<void> {
    return this.#lifetime.run(
      Effect.forEach(this.#probing.busy(), (name) => this.#probed(name), {
        concurrency: "unbounded",
        discard: true,
      })
    );
  }

  /** Waits out `name`'s probes under way and asked for, whatever they come to. */
  #probed(name: string): Effect.Effect<void> {
    return this.#probing.withLock(name, Effect.void);
  }

  /** The promise edge of {@link #probed}: nothing to wait for (no probe under way) settles on this step's end, as an await of none did. */
  async #probesDone(name: string): Promise<void> {
    if (this.#probing.isBusy(name)) {
      await this.#lifetime.run(this.#probed(name));
    }
  }

  #server(name: string) {
    const server = this.#db.getMcpServer(name);
    if (!server) {
      throw new Error("This MCP server no longer exists.");
    }
    return server;
  }

  #current(row: OAuthRow): boolean {
    const config = this.#db.getMcpServer(row.name)?.config;
    return Boolean(
      config &&
      "url" in config &&
      config.url === row.upstream &&
      this.#db.getMcpOauth(row.name)?.generation === row.generation
    );
  }

  /** The promise edge of {@link #probeNow}. */
  probe(name: string): Promise<void> {
    return this.#lifetime.run(this.#probeNow(name)).then(() => undefined);
  }

  /**
   * Probes `name` in its turn: at once when no probe of it runs, else after
   * those asked for before. A put (its config, or its switch) starts the
   * relay over as its probe begins: sessions that take the server again
   * read it as it is now, not a list kept before. A server re-probed on its
   * own ({@link #reprobe}) goes on with its series whatever this probe
   * finds: one that answers ends it, one that does not leaves its next try
   * where it was.
   */
  #probeNow(name: string): Effect.Effect<Probed, unknown> {
    return this.#probing.withLock(
      name,
      Effect.suspend(() => {
        this.#relay.reset(name);
        return Effect.tryPromise({
          try: () => this.#probe(name),
          catch: (error) => error,
        });
      })
    );
  }

  /** A removed server is probed no more. */
  forget(name: string): void {
    this.#relay.reset(name);
    this.#cooling.delete(name);
    this.#issued.delete(name);
    this.#reprobed(name);
  }

  /** What a probe can change, to tell the fleet only when a re-probe changed it. */
  #auth(name: string): readonly unknown[] {
    const server = this.#db.getMcpServer(name);
    return [
      server?.authMode,
      server?.authError,
      this.#db.getMcpOauth(name)?.generation,
    ];
  }

  /**
   * `name` is re-probed no more: it settled, it left, or another config
   * starts over. Its fiber stops, unless it is the one probing: that probe
   * ends its series from within, once its run ends.
   */
  #reprobed(name: string): void {
    const held = this.#reprobes.get(name);
    this.#reprobes.delete(name);
    if (held && !held.probing) {
      held.fiber?.interruptUnsafe();
    }
  }

  /**
   * Backs off per server while the same config stays unreachable
   * ({@link REPROBES}): one fiber per server probes it again after each
   * wait, the probe that found it unreachable its series' first failure;
   * another config starts over. Past a day it stops: a server never
   * settled says so, and saving it again probes it again.
   */
  #reprobe(name: string, config: McpServerRow["config"]): void {
    const held = this.#reprobes.get(name);
    if (held && Bun.deepEquals(held.config, config)) {
      return;
    }
    this.#reprobed(name);
    const series: Reprobing = { config, probing: false };
    this.#reprobes.set(name, series);
    let found = true;
    const again = Effect.suspend(() => {
      if (found) {
        found = false;
        return Effect.fail(new Unreachable({ message: "Not reached." }));
      }
      return this.#probeAgain(name, series);
    });
    const waits = backoffSchedule(REPROBES).pipe(
      Schedule.modifyDelay(({ duration }) =>
        Effect.sync(() => {
          console.info(
            `[fleet-mcp] ${name} did not answer; probing again in ${Math.round(Duration.toMillis(duration) / 1000)} s`
          );
          return duration;
        })
      )
    );
    const fiber = this.#lifetime.fork(
      "fleet MCP server probed again",
      Effect.retryOrElse(again, waits, (_unreached, tries) =>
        Effect.sync(() => this.#gaveUp(name, series, tries))
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (this.#reprobes.get(name) === series) {
              this.#reprobes.delete(name);
            }
          })
        )
      )
    );
    series.fiber = fiber;
  }

  /**
   * One re-probe of `name` by its `series`: none once another probe settled
   * it or another config took its place, none for a server that left. The
   * fleet is told when it changed what a probe can change. Fails, to try
   * again, while it stays unreachable.
   */
  #probeAgain(
    name: string,
    series: Reprobing
  ): Effect.Effect<void, Unreachable> {
    return Effect.gen({ self: this }, function* () {
      if (this.#reprobes.get(name) !== series) {
        return;
      }
      if (!this.#db.getMcpServer(name)) {
        this.#reprobes.delete(name);
        this.forget(name);
        return;
      }
      const before = this.#auth(name);
      series.probing = true;
      const probed = yield* this.#probeNow(name).pipe(
        Effect.catch((error) =>
          Effect.sync((): Probed => {
            // Its words only: a fetch error carries the address, which may hold a key.
            console.warn(
              `[fleet-mcp] ${name} re-probe failed:`,
              error instanceof Error ? error.message : "not an Error"
            );
            return "done";
          })
        ),
        Effect.ensuring(
          Effect.sync(() => {
            series.probing = false;
          })
        )
      );
      if (!Bun.deepEquals(this.#auth(name), before)) {
        this.#changed();
      }
      if (probed === "unanswered" && this.#reprobes.get(name) === series) {
        return yield* new Unreachable({ message: "Not reached." });
      }
    });
  }

  /** `name`'s re-probes gave up ({@link REPROBES}): held no more, so the next probe (its save) starts over. */
  #gaveUp(name: string, series: Reprobing, tries: BackoffTries): void {
    if (this.#reprobes.get(name) !== series) {
      return;
    }
    this.#reprobes.delete(name);
    console.warn(
      `[fleet-mcp] ${name} has not answered for ${Math.round(tries.failingMs / HOUR_MS)} h over ${tries.tries} probes; the hub stops probing it until it is saved again`
    );
    const server = this.#db.getMcpServer(name);
    if (server?.authError) {
      this.#db.setMcpAuth(
        name,
        server.authMode,
        "The hub could not reach this server for a day and stopped trying. Check its URL, then save it again."
      );
    }
  }

  /**
   * Silence is no answer: a server the hub had settled stays as it was, synced
   * and usable. Its detail is untouched, since any detail reads as failed and
   * takes it off every machine. Only one never settled (no answer since this
   * config was saved, or OAuth without discovered metadata) says why it is
   * still off. Either way the hub asks again.
   */
  #unanswered(server: McpServerRow, config: McpServerRow["config"]): void {
    const settled =
      server.authError === null &&
      (server.authMode === "direct" ||
        this.#db.getMcpOauth(server.name) !== undefined);
    if (!settled) {
      this.#db.setMcpAuth(
        server.name,
        server.authMode,
        "The hub could not reach this server. It keeps trying on its own; check the URL if this stays."
      );
    }
    this.#reprobe(server.name, config);
  }

  async #probe(name: string): Promise<Probed> {
    const { config } = this.#server(name);
    // A stdio server runs on each machine and has nothing for the hub to
    // reach: settled at once, or the "not reached yet" a put leaves on it
    // (db `putMcpServer`) keeps it off every machine.
    if (!("url" in config)) {
      this.#db.setMcpAuth(name, "direct");
      return "done";
    }
    const fresh = () => {
      const latest = this.#db.getMcpServer(name);
      return latest && Bun.deepEquals(latest.config, config)
        ? latest
        : undefined;
    };
    try {
      const response = await reachHead(config.url, {
        method: "POST",
        headers: {
          ...config.headers,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "CawCo fleet", version: "1" },
          },
        }),
        // A redirect is an answer: it fails discovery below, as it always has.
        redirect: "manual",
      });
      const { resourceMetadataUrl } = extractWWWAuthenticateParams(response);
      if (!fresh()) {
        return "done";
      }
      if (response.status >= 300 && response.status < 400) {
        throw new Error("The server redirected the initialize request.");
      }
      if (response.status !== 401 || !resourceMetadataUrl) {
        this.#direct(name, response.status);
        return "done";
      }
      // Mark OAuth before discovery: a metadata failure must never sync the upstream to a harness.
      this.#db.setMcpAuth(name, "oauth");
      const resource = await discoverOAuthProtectedResourceMetadata(
        config.url,
        { resourceMetadataUrl },
        reach
      );
      const [issuer] = resource.authorization_servers ?? [];
      if (!issuer) {
        throw new Error("No authorization server in resource metadata.");
      }
      const metadata = await discoverAuthorizationServerMetadata(issuer, {
        fetchFn: reach,
      });
      if (!metadata) {
        throw new Error("Authorization server metadata is unavailable.");
      }
      if (!fresh()) {
        return "done";
      }
      this.#discovered(name, config.url, resource, issuer, metadata);
    } catch (error) {
      const latest = fresh();
      if (!latest) {
        return "done";
      }
      if (unreachable(error)) {
        this.#unanswered(latest, config);
        return "unanswered";
      }
      this.#reprobed(name);
      this.#db.setMcpAuth(
        name,
        latest.authMode,
        "The hub could not discover this server’s authorization. Check its URL and retry saving the server."
      );
    }
    return "done";
  }

  /** The server answered without asking for a sign-in: it is called directly, and a sign-in it had goes. */
  #direct(name: string, status: number): void {
    if (this.#db.getMcpOauth(name)?.tokens) {
      console.warn(
        `[fleet-mcp] ${name}: the server answered without asking for a sign-in (HTTP ${status}), so the hub calls it directly now and lets its sign-in go`
      );
    }
    this.#db.setMcpAuth(name, "direct");
    this.#db.deleteMcpOauth(name);
    this.#reprobed(name);
  }

  /**
   * A probe's discovered authorization, kept. The same server, issuer and
   * resource keep their sign-in; another's ends it, and the person is told.
   */
  #discovered(
    name: string,
    url: string,
    resource: OAuthRow["resource"],
    issuer: string,
    metadata: OAuthRow["metadata"]
  ): void {
    const previous = this.#db.getMcpOauth(name);
    const same =
      previous?.upstream === url &&
      previous.issuer === issuer &&
      previous.resource.resource === resource.resource;
    // A sign-in for another authorization server or resource is no
    // sign-in here: it ends, and the person is told why.
    const lost =
      !same && previous?.tokens
        ? {
            at: new Date(),
            why: `The server now names ${previous.issuer === issuer ? `another resource (${resource.resource}, was ${previous.resource.resource})` : `another authorization server (${issuer}, was ${previous.issuer})`}, so the sign-in made with the old one no longer applies.`,
          }
        : undefined;
    this.#db.putMcpOauth({
      ...(same ? previous : {}),
      name,
      generation: same ? previous.generation : crypto.randomUUID(),
      upstream: url,
      resource,
      issuer,
      metadata,
      ...(lost ? { endedAt: lost.at, endedWhy: lost.why } : {}),
    });
    this.#db.setMcpAuth(name, "oauth");
    this.#reprobed(name);
    if (lost) {
      this.#told(name, lost.at, lost.why);
    }
  }

  /**
   * Every machine's sync passes here: the fleet's servers and each
   * project's alike.
   */
  syncConfig(config: MachineFleetConfig, hub: string): MachineFleetConfig {
    const outbound = (server: FleetMcpServer): FleetMcpServer => {
      if (server.auth?.state === "failed") {
        return { ...server, enabled: false };
      }
      if (server.auth?.mode !== "oauth") {
        return server;
      }
      // Why a sign-in ended, and as whom, are the person's to read, on the dashboard.
      const { ended: _ended, as: _as, ...auth } = server.auth;
      return {
        ...server,
        auth,
        proxied: true,
        config: {
          type: "http",
          url: `${hub}/mcp/fleet/${encodeURIComponent(server.name)}`,
          ...("timeout" in server.config
            ? { timeout: server.config.timeout }
            : {}),
        },
      };
    };
    return {
      ...config,
      mcp: config.mcp.map(outbound),
      projects: Object.fromEntries(
        Object.entries(config.projects).map(([projectId, rows]) => [
          projectId,
          { ...rows, mcp: rows.mcp.map(outbound) },
        ])
      ),
    };
  }

  /**
   * What a connect ask for `name` says: the provider's page, the access its
   * scopes offer and the one held from the last sign-in, and whether the
   * hub is signed in there now. Throws the sentence an agent reads when it
   * is no server a person can sign in to.
   */
  askFacts(name: string): AskFacts {
    const server = this.#db.getMcpServer(name);
    const row = this.#db.getMcpOauth(name);
    if (!(server && server.authMode === "oauth" && row)) {
      throw new Error(
        `${name} is no MCP server of the fleet's that signs in with OAuth.`
      );
    }
    if (!server.enabled) {
      throw new Error(
        `${name} is switched off on the MCP page; the person turns it on there before anyone signs in to it.`
      );
    }
    return {
      held: row.access ?? null,
      as: row.tokens ? (row.identity ?? null) : null,
      ended: !row.tokens && row.endedAt !== null && row.endedAt !== undefined,
      offers: accessOffers(scopesOf(row)),
      signedIn: Boolean(row.tokens),
      url: row.metadata.authorization_endpoint,
    };
  }

  /**
   * Starts a sign-in to `name`, asking for `access` of its scopes; none
   * asks for the access the last sign-in did, else every scope it names.
   */
  start(name: string, access?: ConnectAccess): Promise<SignInStart> {
    // The promise edge of a sign-in's start, joined by every ask for the same access while it runs.
    return this.#lifetime.run(
      this.#signingIn.run(
        `${name}\u0000${access ?? ""}`,
        Effect.tryPromise({
          try: () => this.#start(name, access),
          catch: (error) => error,
        })
      )
    );
  }

  async #start(name: string, asked?: ConnectAccess): Promise<SignInStart> {
    await this.#probesDone(name);
    const server = this.#server(name);
    if (!server.enabled) {
      throw new Error(mcpWords.enableBeforeSignIn);
    }
    const row = this.#db.getMcpOauth(name);
    if (!row || server.authMode !== "oauth") {
      throw new Error(
        "This server has no discovered OAuth authorization server. Check its URL and save it again."
      );
    }
    // A provider that names clients by a published document and has no
    // registration is signed in to as CawCo's shared client; any other
    // registers this install's own client once, kept for every later sign-in.
    const shared =
      !row.metadata.registration_endpoint &&
      row.metadata.client_id_metadata_document_supported === true;
    let { client } = row;
    if (shared) {
      client = {
        client_id: SHARED_CLIENT_ID,
        redirect_uris: [SHARED_REDIRECT],
      };
      // A client registered for another redirect cannot be sent to this one.
    } else if (!client?.redirect_uris.includes(SHARED_REDIRECT)) {
      try {
        client = await registerClient(row.issuer, {
          metadata: row.metadata,
          clientMetadata: {
            client_name: "CawCo fleet",
            redirect_uris: [SHARED_REDIRECT],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          },
        });
      } catch {
        // biome-ignore lint/style/useErrorCause: upstream OAuth exceptions may contain token responses; they must stay out of logs
        throw new Error(
          "This server refused client registration. Check its authorization settings, then sign in again."
        );
      }
    }
    const state = crypto.randomUUID();
    const offers = accessOffers(scopesOf(row));
    const access = asked ?? row.access ?? null;
    const scopes =
      offers.find((offer) => offer.access === access)?.scopes ??
      offers.at(-1)?.scopes;
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      row.issuer,
      {
        metadata: row.metadata,
        clientInformation: client,
        redirectUrl: SHARED_REDIRECT,
        state,
        scope: scopes?.join(" "),
        resource: new URL(row.resource.resource),
      }
    );
    console.info(
      `[fleet-mcp] ${name} authorize parameter names: ${[...authorizationUrl.searchParams.keys()].join(", ")}`
    );
    if (!this.#current(row)) {
      throw new Error(
        "This server changed during sign-in. Start sign-in again."
      );
    }
    const expiresAt = Date.now() + SIGN_IN_TTL_MS;
    // The code is exchanged by `client`, kept in this same write.
    this.#db.putMcpOauth({
      ...row,
      client,
      lastOpenedAt: new Date(),
      pendingState: state,
      pendingRedirectUri: SHARED_REDIRECT,
      pendingExpiresAt: new Date(expiresAt),
      pendingAccess: offers.some((offer) => offer.access === access)
        ? access
        : (offers.at(-1)?.access ?? null),
      pendingVerifier: codeVerifier,
      pendingUnread: null,
    });
    return { authorizationUrl: authorizationUrl.toString(), expiresAt };
  }

  async complete(
    code: string,
    state: string,
    iss?: string
  ): Promise<{ name: string }> {
    // Consumed synchronously before the exchange, so concurrent callbacks cannot spend a code twice.
    const row = this.#db.takeMcpAuthorization(state);
    if (!(row?.client && row.pendingVerifier && row.pendingRedirectUri)) {
      throw new Error(
        "This sign-in expired or was already completed. Start sign-in again."
      );
    }
    // RFC 9207: a server that says it names itself on the redirect must be heard
    // doing so, and as the one this sign-in started with.
    if (
      "authorization_response_iss_parameter_supported" in row.metadata &&
      row.metadata.authorization_response_iss_parameter_supported === true &&
      iss !== row.metadata.issuer
    ) {
      throw new Error(
        "This sign-in came back from a different authorization server than it started with. Start sign-in again."
      );
    }
    let tokens: OAuthRow["tokens"];
    try {
      tokens = await exchangeAuthorization(row.issuer, {
        metadata: row.metadata,
        clientInformation: row.client,
        authorizationCode: code,
        codeVerifier: row.pendingVerifier,
        redirectUri: row.pendingRedirectUri,
        resource: new URL(row.resource.resource),
      });
    } catch {
      // biome-ignore lint/style/useErrorCause: upstream OAuth exceptions may contain token responses; they must stay out of logs
      throw new Error(
        "The authorization server refused this sign-in. Start sign-in again."
      );
    }
    if (!this.#current(row)) {
      throw new Error(
        "This server changed during sign-in. Start sign-in again."
      );
    }
    this.#db.putMcpOauth({
      ...row,
      tokens,
      tokenClient: row.client,
      expiresAt:
        tokens.expires_in === undefined
          ? null
          : new Date(Date.now() + tokens.expires_in * 1000),
      ...SIGN_IN_TAKEN,
      endedAt: null,
      endedWhy: null,
      access: row.pendingAccess,
      identity: identityOf(tokens),
    });
    this.#issued.set(row.name, Date.now());
    this.#cooling.delete(row.name);
    this.#db.setMcpAuth(row.name, "oauth");
    this.#relay.reset(row.name);
    console.info(
      `[fleet-mcp] ${row.name}: signed in${tokens.refresh_token ? "" : "; the provider issued no refresh token, so the sign-in lasts as long as its access token"}`
    );
    this.#changed();
    this.#ports.signedIn(row.name);
    return { name: row.name };
  }

  /**
   * The one refresh per server: a request that needs one joins the one under
   * way, so two never spend one rotating refresh token. It runs on a fiber
   * of its own, started here, and goes on whoever stops waiting; its
   * outcome is logged by the refresh itself. A server whose last refresh
   * landed on none of its tries waits out its cool-down first. Answers the
   * wait for it.
   */
  #refresh(
    name: string,
    because: string
  ): Effect.Effect<Effect.Effect<OAuthRow, SignedOut | NotNow>> {
    return Effect.sync(() => {
      const running = this.#refreshing.get(name);
      if (running !== undefined) {
        return joinRenewal(running);
      }
      const cooling = this.#cooling.get(name);
      if (cooling && cooling.until > Date.now()) {
        return Effect.fail(
          new NotNow({
            message: `This server's sign-in stands, but renewing it got ${cooling.why}; the hub tries again in ${Math.ceil((cooling.until - Date.now()) / 1000)} s. Retry the request then.`,
          })
        );
      }
      const flight = this.#lifetime.fork(
        "fleet MCP sign-in renewed",
        Effect.exit(this.#renew(name, because))
      );
      if (flight.pollUnsafe() === undefined) {
        this.#refreshing.set(name, flight);
        flight.addObserver(() => {
          if (this.#refreshing.get(name) === flight) {
            this.#refreshing.delete(name);
          }
        });
      }
      return joinRenewal(flight);
    });
  }

  /**
   * Renews the sign-in with its refresh token. No answer (the network, a 5xx,
   * a 429, the deadline) and any refusal but the two that end a sign-in are
   * tried again ({@link RENEW_TRIES}), the sign-in kept whatever
   * comes back. Only `invalid_grant` or `invalid_token` from the token
   * endpoint ends it ({@link #end}), in the provider's words.
   */
  #renew(
    name: string,
    because: string
  ): Effect.Effect<OAuthRow, SignedOut | NotNow> {
    return Effect.gen({ self: this }, function* () {
      const row = this.#db.getMcpOauth(name);
      const held = row?.tokens;
      if (!(row && held)) {
        return yield* signedOut();
      }
      const spent = held.refresh_token;
      const client = row.tokenClient;
      if (!(spent && client)) {
        this.#end(
          name,
          held,
          `The provider issued no refresh token, and ${because}.`
        );
        return yield* signedOut();
      }
      /** Tries that got no answer: a rotation the provider may have made then. */
      const unanswered = yield* Ref.make(0);
      /** Tries that left the sign-in standing. */
      const failed = yield* Ref.make(0);
      const once = Effect.gen({ self: this }, function* () {
        const tried = yield* this.#try(row, client, spent);
        if ("ended" in tried) {
          this.#end(
            name,
            held,
            endedWords(tried.ended, yield* Ref.get(unanswered))
          );
          return { stopped: signedOut() } satisfies Renewed;
        }
        if (!("failed" in tried)) {
          return tried;
        }
        yield* Ref.update(failed, (n) => n + 1);
        if (tried.failed.unanswered) {
          yield* Ref.update(unanswered, (n) => n + 1);
        }
        if (!this.#current(row)) {
          return { stopped: changedMeanwhile() } satisfies Renewed;
        }
        return yield* tried.failed;
      });
      const waits = backoffSchedule(RENEW_TRIES).pipe(
        Schedule.modifyDelay(({ duration, input }) =>
          Effect.sync(() => {
            console.warn(
              `[fleet-mcp] ${name}: renewing the sign-in got ${input instanceof RenewFailed ? input.words : "a failure"}; the sign-in stands, and the hub tries again in ${(Duration.toMillis(duration) / 1000).toFixed(1)} s`
            );
            return duration;
          })
        )
      );
      const renewed: Renewed = yield* Effect.retry(once, waits).pipe(
        Effect.catchTag("RenewFailed", (last) =>
          Effect.flatMap(Ref.get(failed), (tries) =>
            this.#coolDown(name, held, last.words, tries)
          )
        )
      );
      if ("kept" in renewed) {
        return renewed.kept;
      }
      return yield* renewed.stopped;
    });
  }

  /**
   * A renewal that landed on none of its `tried` tries: the next waits,
   * longer each time ({@link RENEW_COOLING}), the sign-in kept. Renewals
   * that have failed for a day end it, as a refusal does, so the person is
   * asked to sign in again.
   */
  #coolDown(
    name: string,
    held: NonNullable<OAuthRow["tokens"]>,
    why: string,
    tried: number
  ): Effect.Effect<Renewed> {
    return Effect.gen({ self: this }, function* () {
      const next =
        this.#cooling.get(name)?.next ??
        (yield* Schedule.toStep(backoffSchedule(RENEW_COOLING)));
      const now = yield* Clock.currentTimeMillis;
      const step = yield* next(now, why).pipe(
        Effect.map(([, delay]) => ({ ms: Duration.toMillis(delay) })),
        Pull.catchDone((tries) => Effect.succeed({ gaveUp: tries }))
      );
      if ("gaveUp" in step) {
        this.#end(
          name,
          held,
          `Renewing it failed for ${Math.round(step.gaveUp.failingMs / HOUR_MS)} h, ${step.gaveUp.tries} times in a row, the last with ${why}.`
        );
        return { stopped: signedOut() } satisfies Renewed;
      }
      this.#cooling.set(name, { next, until: Date.now() + step.ms, why });
      console.warn(
        `[fleet-mcp] ${name}: renewing the sign-in got ${why} on all ${tried} tries; the sign-in stands, requests that need it are answered 502 to retry, and the hub tries again in ${Math.round(step.ms / 1000)} s`
      );
      return {
        stopped: new NotNow({
          message: `This server's sign-in stands, but renewing it got ${why}. Retry the request.`,
        }),
      } satisfies Renewed;
    });
  }

  /**
   * One token request: the tokens kept, the refusal that ends the sign-in
   * in the provider's words, or a failure that leaves it standing.
   */
  #try(
    row: OAuthRow,
    client: NonNullable<OAuthRow["tokenClient"]>,
    spent: string
  ): Effect.Effect<Tried> {
    const heard: { status: number | null } = { status: null };
    return Effect.tryPromise({
      try: () =>
        refreshAuthorization(row.issuer, {
          metadata: row.metadata,
          clientInformation: client,
          refreshToken: spent,
          resource: new URL(row.resource.resource),
          fetchFn: reachToken((status) => {
            heard.status = status;
          }),
        }),
      catch: (error) => error,
    }).pipe(
      Effect.match({
        onFailure: (error): Tried => {
          const words = refusalWords(error, heard.status);
          return error instanceof OAuthError && ENDING.has(error.errorCode)
            ? { ended: words }
            : {
                failed: new RenewFailed({
                  words,
                  unanswered: error instanceof Unreachable,
                }),
              };
        },
        onSuccess: (tokens): Tried => this.#keep(row, spent, tokens),
      })
    );
  }

  /**
   * A renewal's tokens, kept in one write: the new access token and the
   * refresh token that replaced the one spent, together, before any request
   * is handed either. A sign-in the person made meanwhile is the one kept.
   */
  #keep(
    row: OAuthRow,
    spent: string,
    tokens: NonNullable<OAuthRow["tokens"]>
  ): Renewed {
    const latest = this.#db.getMcpOauth(row.name);
    if (!(latest && this.#current(row))) {
      return { stopped: changedMeanwhile() };
    }
    if (latest.tokens?.refresh_token !== spent) {
      return latest.tokens ? { kept: latest } : { stopped: signedOut() };
    }
    const kept: OAuthRow = {
      ...latest,
      tokens,
      expiresAt:
        tokens.expires_in === undefined
          ? null
          : new Date(Date.now() + tokens.expires_in * 1000),
      endedAt: null,
      endedWhy: null,
    };
    this.#db.putMcpOauth(kept);
    this.#issued.set(row.name, Date.now());
    this.#cooling.delete(row.name);
    console.info(
      `[fleet-mcp] ${row.name}: sign-in renewed${tokens.refresh_token === spent ? "" : ", its refresh token rotated"}${tokens.expires_in === undefined ? "" : `; the access token is good for ${tokens.expires_in} s`}`
    );
    return { kept };
  }

  /**
   * Ends the sign-in `held` names, never one made since: its tokens go,
   * and why is kept for the person ({@link #told}).
   */
  #end(name: string, held: NonNullable<OAuthRow["tokens"]>, why: string): void {
    const latest = this.#db.getMcpOauth(name);
    if (
      !latest?.tokens ||
      latest.tokens.access_token !== held.access_token ||
      latest.tokens.refresh_token !== held.refresh_token
    ) {
      return;
    }
    const at = new Date();
    this.#db.putMcpOauth({
      ...latest,
      tokens: null,
      expiresAt: null,
      endedAt: at,
      endedWhy: why,
    });
    this.#relay.reset(name);
    this.#told(name, at, why);
  }

  /**
   * A sign-in ended without the person: said in the hub's log with why,
   * every machine's sessions told (the fleet's change), and the person
   * told (a Needs you item from `auth.ended`, and a push).
   */
  #told(name: string, at: Date, why: string): void {
    this.#issued.delete(name);
    this.#cooling.delete(name);
    console.warn(
      `[fleet-mcp] ${name}: the sign-in ended: ${why} Its tools are off in every session until someone signs in again from ${configurePage("mcp")}.`
    );
    this.#changed();
    this.#ports.ended({ name, at, why });
  }

  /**
   * The row whose access token a request sends: as it stands while it has
   * more than {@link REFRESH_AHEAD_MS} left; renewed behind the request
   * while it still has {@link EXPIRY_MARGIN_MS}; else after the renewal.
   */
  #usable(name: string): Effect.Effect<OAuthRow, SignedOut | NotNow> {
    return Effect.gen({ self: this }, function* () {
      const row = this.#db.getMcpOauth(name);
      if (!row?.tokens) {
        return yield* signedOut();
      }
      const left = row.expiresAt
        ? row.expiresAt.getTime() - Date.now()
        : Number.POSITIVE_INFINITY;
      if (left > REFRESH_AHEAD_MS) {
        return row;
      }
      const renewed = yield* this.#refresh(name, "its access token expired");
      if (left > EXPIRY_MARGIN_MS) {
        return row;
      }
      return yield* renewalWithin(renewed);
    });
  }

  /**
   * The upstream refused `token` (`words`, its own): the token renewed since
   * is sent instead; else the refresh, one per server. A token issued
   * moments ago is not renewed again ({@link FRESH_TOKEN_MS}).
   */
  #refused(
    name: string,
    token: string,
    words: string
  ): Effect.Effect<OAuthRow, SignedOut | NotNow> {
    return Effect.gen({ self: this }, function* () {
      const latest = this.#db.getMcpOauth(name);
      if (!latest?.tokens) {
        return yield* signedOut();
      }
      if (latest.tokens.access_token !== token) {
        return latest;
      }
      const issued = this.#issued.get(name);
      if (
        !this.#refreshing.has(name) &&
        issued !== undefined &&
        Date.now() - issued < FRESH_TOKEN_MS
      ) {
        console.warn(
          `[fleet-mcp] ${name}: the server refused an access token issued ${Math.round((Date.now() - issued) / 1000)} s ago (${words}); the sign-in stands, and the request is answered 502 to retry`
        );
        return yield* new NotNow({
          message: `The server refused the sign-in's new access token (${words}). Retry the request.`,
        });
      }
      return yield* renewalWithin(
        yield* this.#refresh(
          name,
          `the server refused its access token (${words})`
        )
      );
    });
  }

  /**
   * One request to the upstream as the hub's sign-in: its bearer, renewed
   * near expiry or once refused. A second refusal fails the request, never
   * the sign-in. The relay's gate stands in front of every call here.
   */
  async #upstream(name: string, exchange: Exchange): Promise<Response> {
    const server = this.#server(name);
    const call = (using: OAuthRow) => {
      const upstream = new URL(using.upstream);
      upstream.search = exchange.search || upstream.search;
      const headers = new Headers(
        "url" in server.config ? server.config.headers : undefined
      );
      for (const [header, value] of exchange.headers) {
        headers.set(header, value);
      }
      headers.set(
        "Authorization",
        `Bearer ${using.tokens?.access_token ?? ""}`
      );
      return fetch(upstream, {
        method: exchange.method,
        body: exchange.body,
        headers,
        signal: exchange.signal,
        redirect: "error",
      });
    };
    // The promise edges of the sign-in's token and its renewal: the relay calls upstream with promises.
    let row = await this.#lifetime.run(this.#usable(name));
    let response = await call(row);
    if (response.status !== 401) {
      return response;
    }
    const said = bearerWords(response);
    await response.body?.cancel();
    row = await this.#lifetime.run(
      this.#refused(name, row.tokens?.access_token ?? "", said)
    );
    response = await call(row);
    if (response.status === 401) {
      const again = bearerWords(response);
      await response.body?.cancel();
      console.warn(
        `[fleet-mcp] ${name}: the server refused the sign-in's renewed access token too (${again}); the sign-in stands, and the request is answered 502 to retry`
      );
      throw new NotNow({
        message: `The server refused the sign-in's access token (${again}). Retry the request.`,
      });
    }
    return response;
  }

  async forward(name: string, request: Request) {
    await this.#probesDone(name);
    const server = this.#db.getMcpServer(name);
    if (!server) {
      return problem(404, {
        code: "no-mcp-server",
        detail: "This MCP server no longer exists.",
      });
    }
    if (!server.enabled) {
      return problem(403, {
        code: "mcp-server-disabled",
        detail: "This server is disabled.",
      });
    }
    const row = this.#db.getMcpOauth(name);
    // The hub's sign-in is missing: 503, never 401. The proxy is the
    // upstream's OAuth client and asks its own callers for no authorization,
    // so a harness is never told to authorize. A 401 sends every harness's
    // MCP client into discovery and Dynamic Client Registration against the
    // proxy's origin (the machine's gateway or the hub), where no `/register`
    // exists; Claude Code then reports "Dynamic Client Registration rejected
    // (HTTP 404)" and keeps the server in its needs-auth cache for 15
    // minutes, past the hub's sign-in. Its words are what a session reads in
    // its harness's notice of a server that failed to connect, so they say
    // the sign-in reaches it where it runs: the hub hands every live session
    // the change (`sendMcpChanges` in server.ts).
    if (!(row?.tokens && server.authMode === "oauth")) {
      return problem(503, {
        code: "mcp-signed-out",
        detail: `Sign in to this server from ${configurePage("mcp")}. Its tools then arrive in sessions already running, within seconds; no new session is needed.`,
      });
    }
    try {
      return await this.#relay.handle(
        name,
        row.generation,
        request,
        (exchange) => this.#upstream(name, exchange)
      );
    } catch (error) {
      if (!this.#db.getMcpOauth(name)?.tokens) {
        return problem(503, {
          code: "mcp-signed-out",
          detail: `Sign in to this server from ${configurePage("mcp")}. Its tools then arrive in sessions already running, within seconds; no new session is needed.`,
        });
      }
      return problem(502, {
        code: "mcp-upstream-failed",
        detail:
          error instanceof NotNow
            ? error.message
            : "The upstream MCP server could not be reached. Retry the request.",
      });
    }
  }
}

/** The scopes a server names: its resource's, else its authorization server's. */
function scopesOf(row: OAuthRow): string[] {
  return row.resource.scopes_supported ?? row.metadata.scopes_supported ?? [];
}

/** A refresh's outcome, from its fiber's exit. */
const joinRenewal = (
  flight: Fiber.Fiber<Exit.Exit<OAuthRow, SignedOut | NotNow>>
): Effect.Effect<OAuthRow, SignedOut | NotNow> =>
  Effect.flatMap(Fiber.join(flight), (exit) => exit);

/** A refresh, waited on for at most {@link REFRESH_WAIT_MS}; it goes on past that. */
const renewalWithin = (
  renewal: Effect.Effect<OAuthRow, SignedOut | NotNow>
): Effect.Effect<OAuthRow, SignedOut | NotNow> =>
  boundedRead(REFRESH_WAIT_MS, renewal).pipe(
    Effect.catchTag("Unanswered", () =>
      Effect.fail(
        new NotNow({
          message:
            "This server's sign-in is being renewed and the provider has not answered yet. Retry the request.",
        })
      )
    )
  );
