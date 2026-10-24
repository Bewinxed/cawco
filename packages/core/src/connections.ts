/**
 * Connections (Projects spec §3, §5.5): a signed-in outside service the hub
 * holds the key for. Each is one named row; two accounts of one service are
 * two rows (`x-brand`, `x-founder`). A session never holds a connection's
 * key: a delegate type (or a project) lists the connections its sessions may
 * use, and the hub calls their tools for them (`conn__<name>__<tool>`).
 */
import type { RelayProvider } from "./relays";

/**
 * The services that push their events and are never polled for them (§5.5:
 * "Caw offers the relay when you connect a push-only service"), each with
 * the relay provider that checks its deliveries' signature (hub relay.ts).
 * A project that gets one of these signed in hears nothing from it until it
 * has a relay, so Caw is woken to offer one. Stripe is the one service the
 * relay verifies by its own scheme (`Stripe-Signature`); GitHub is polled.
 */
export const PUSH_ONLY_SERVICES: Readonly<Record<string, RelayProvider>> = {
  stripe: "stripe",
};

/** The relay provider a connection's service needs, when it is push-only; the service as its row says it. */
export const pushOnlyProvider = (service: string): RelayProvider | undefined =>
  Object.hasOwn(PUSH_ONLY_SERVICES, service.trim().toLowerCase())
    ? PUSH_ONLY_SERVICES[service.trim().toLowerCase()]
    : undefined;

/**
 * How the hub reaches the service's MCP server: `http` (Streamable HTTP),
 * `sse` (the older HTTP+SSE transport), or `stdio` (a command the hub runs on
 * its own machine).
 */
export const CONNECTION_TRANSPORTS = ["http", "sse", "stdio"] as const;
export type ConnectionTransport = (typeof CONNECTION_TRANSPORTS)[number];

/**
 * How the hub signs in: `none`; `bearer` (`Authorization: Bearer <key>`);
 * `header` (the key as the value of the header `header` names, or for
 * `stdio` the environment variable it names); `oauth` (the MCP authorization
 * flow, run and refreshed by the hub); `app` (an app acting as itself: a
 * GitHub App the hub registered from a manifest and the person installed,
 * whose private key mints an hour's token, or a Linear OAuth app authorized
 * with `actor=app`, its 24-hour tokens refreshed by the hub); `gh` (GitHub as
 * the person, with the token a fleet machine's `gh` holds, read there each
 * time it is needed); `device` (GitHub as the person, signed in with a code
 * at github.com/login/device through CawCo's own OAuth app).
 */
export const CONNECTION_AUTHS = [
  "none",
  "bearer",
  "header",
  "oauth",
  "app",
  "gh",
  "device",
] as const;
export type ConnectionAuth = (typeof CONNECTION_AUTHS)[number];

/**
 * The ways a `github` connection reads GitHub's REST API with its own token,
 * so a project's poller, its tracker and the relay can sign in with it: a
 * token, a GitHub App's installation, a machine's gh, or a code sign-in. An
 * MCP OAuth sign-in's token is for GitHub's MCP server alone.
 */
export const GITHUB_API_AUTHS: readonly ConnectionAuth[] = [
  "bearer",
  "app",
  "gh",
  "device",
];

/** Whether a `github` connection signed in this way reads GitHub's REST API ({@link GITHUB_API_AUTHS}). */
export const readsGitHubApi = (auth: ConnectionAuth): boolean =>
  GITHUB_API_AUTHS.includes(auth);

/** The services an `app` connection is built for. */
export const APP_SERVICES = ["github", "linear"] as const;
export type AppService = (typeof APP_SERVICES)[number];

/**
 * An `app` connection's registration, as every route answers it: what names
 * the app, never its private key or client secret.
 * - GitHub: the app the manifest made ("The manifest flow creates the GitHub
 *   App registration and generates the app's webhook secret, private key
 *   (PEM file), client secret, and GitHub App ID", docs.github.com,
 *   registering a GitHub App from a manifest), named here once it is
 *   installed: its ID, its installation, and its slug.
 * - Linear: the OAuth app's client ID; "Resources are created as the
 *   application" with `actor=app` (linear.app/developers/oauth-2-0-authentication).
 */
export type ConnectionApp =
  | { appId: string; installationId: string; service: "github"; slug?: string }
  | { clientId: string; service: "linear" };

/**
 * One account a machine's `gh` is signed in to, as `gh auth status --json
 * hosts` lists it (cli/cli pkg/cmd/auth/status: `host`, `login`, `active`,
 * `scopes` "repo, read:org" as GitHub's `X-OAuth-Scopes` header gives them).
 */
export interface GhAccount {
  active: boolean;
  host: string;
  login: string;
  scopes: string[];
}

/** A machine's gh account the hub can make a connection from: Sign in to GitHub lists each. */
export interface GhSignIn extends GhAccount {
  /** The machine as a sentence names it. */
  machine: string;
  machineId: string;
}

/**
 * The machine control that lists its gh's signed-in accounts (agent
 * host-gh.ts `ghAccounts`): no args; answers {@link GhAccount}[], empty when
 * gh is not there or signed in to nothing.
 */
export const CONTROL_GH_ACCOUNTS = "ghAccounts";

/**
 * The machine control that reads its gh's token for one account (`gh auth
 * token --hostname <host> --user <login>`): args `[host, login]`; answers
 * `{ token }`, refused when gh has none for it. Only the hub asks it, and
 * only for a `gh` connection.
 */
export const CONTROL_GH_TOKEN = "ghToken";

/** `signed-in`: its tools answer. `needs-sign-in`: a key or a sign-in is owed. `error`: `reason` says what failed. */
export type ConnectionState = "signed-in" | "needs-sign-in" | "error";

/** A connection as every route and tool answers it: never its key. */
export interface ConnectionView {
  /** Which account of the service it is, in the owner's words (`@brand`). */
  account: string;
  /** For `app` auth, once its registration is held: what names the app. */
  app?: ConnectionApp;
  args?: string[];
  auth: ConnectionAuth;
  /** For `stdio`: the command the hub runs. */
  command?: string;
  createdAt: number;
  /**
   * For `device` auth, while its code sign-in can still finish: the code the
   * person enters, where, and when it lapses, epoch ms.
   */
  device?: { expiresAt: number; userCode: string; verificationUri: string };
  /** For `gh` auth: the machine whose gh it reads, and the account there. */
  gh?: { host: string; login: string; machine: string; machineId: string };
  /** Whether a key or OAuth tokens are held for it. */
  hasSecret: boolean;
  /** For `header` auth: the header (or, for `stdio`, the environment variable) the key goes in. */
  header?: string;
  id: string;
  name: string;
  /** Projects whose every session may use it, beside the delegate types that list it. */
  projects: string[];
  /** Why it is in `error` or `needs-sign-in`; absent when signed in. */
  reason?: string;
  /** Free text: github, x, linear… */
  service: string;
  /**
   * The sign-in under way, while it can still finish: the page it was sent
   * to and when it lapses, epoch ms. A press on the row opens that same
   * page again rather than starting another.
   */
  signIn?: { expiresAt: number; url: string };
  state: ConnectionState;
  /** Its tools' names, as the hub last listed them; absent before a first listing. */
  tools?: string[];
  transport: ConnectionTransport;
  updatedAt: number;
  /** For `http` and `sse`: the server's URL. */
  url?: string;
}
