/**
 * What Configure › Connections says (routes/config/connections): the
 * outside services the hub holds a key for, each row's state and way in,
 * the services a connection can be started to, and Projects…. For the
 * dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Connections`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
import type { ConnectionAuth } from "../connections";

export const connectionsWords = {
  list: "Connections",
  /** The header's menu, and the sign-in form it opens. */
  signInTo: "Sign in to a service",
  signInService: (service: string) => `Sign in to ${service}`,
  account: (service: string) => `Which ${service} account`,
  accountHint: "Two accounts of one service are two connections.",
  accountPlaceholder: "brand, or your handle",
  key: (service: string) => `${service} key`,
  rowKey: (service: string, account: string) => `${service} key for ${account}`,
  cancel: "Cancel",
  signIn: "Sign in",
  signingIn: "Signing in…",
  setKey: "Set key",
  saveKey: "Save key",
  saving: "Saving…",
  /** The empty state: signing in is the person's, so the line says so. */
  emptyLine:
    "Each service asks you, not Caw, to let the hub in, so signing in is yours. The projects you allow then read from it and act through it.",
  /** The empty state's cards, as a screen reader names the list. */
  servicesLabel: "Services",
  /** A row's state, the hub's word. */
  stateSignedIn: "Signed in",
  stateNeedsSignIn: "Not signed in",
  stateError: "Failing",
  /** A row's line while its sign-in is open, and when it stops. */
  signingInTab: (service: string) =>
    `${service}'s sign-in is open in a new tab; this row turns signed in when you finish there.`,
  signInClosed:
    "The sign-in tab closed before it finished. Open sign-in to go on where it was, until it lapses.",
  /** The row's own button while its sign-in can still finish: the same page again, never another sign-in. */
  openSignIn: "Open sign-in",
  /** The hub still says a sign-in is under way, but it ran past its time. */
  signInLapsed:
    "The last sign-in ran out of time before it finished. Sign in to start another.",
  /** A secret is never kept through a reload: the form asks for it again and says why. */
  secretNotKept:
    "Keys and secrets are never kept when the page reloads, so paste it again to sign in.",
  blocked:
    "The browser blocked the sign-in tab. Allow pop-ups for this page, then try again.",
  /** The hub's reasons a row's own button already says. */
  saidSignIn: "Sign in.",
  saidSetKey: "Set its key.",
  saidSetApp: "Set its app.",
  saidUnderWay: "A sign-in is under way.",
  /** The way a service signs in with, picked when it has more than one. */
  signsInWith: "Signs in with",
  /** An app connection's registration: a GitHub App's ids and key, or a Linear app's client. */
  setApp: "Set app…",
  /** The address of a server the person runs, asked when a service has one (`serverExample`). */
  serverAddress: "Server address",
  serverAddressProblem:
    "A server address starts with https:// or http://, like the example.",
  /** A row's own button for an app not yet set. */
  setAppNow: "Set app",
  saveApp: "Save app",
  appOf: (row: string) => `${row} app`,
  /** Sign in to GitHub's first way: a fleet machine's gh, one row per account it is signed in to. */
  ghLooking: "Looking for gh on your machines…",
  ghNone:
    "No machine's gh is signed in. Run gh auth login on one, or sign in with a code.",
  ghUnread: (clause: string) =>
    `Could not ask the machines about gh — ${clause}.`,
  /** The list of gh accounts, as a screen reader names it. */
  ghList: "gh on your machines",
  /** Machines that didn't answer, as one list ("obelisk and mini"). */
  ghUnanswered: (machines: string) => `${machines} didn't answer about gh.`,
  ghScopes: "Scopes:",
  ghScopesNone: "no scopes",
  ghConnect: "Connect",
  ghConnecting: "Connecting…",
  ghConnected: "Connected",
  /** A gh account's row: the account and where it is signed in. */
  ghAccountOn: (login: string, machine: string) => `${login} on ${machine}`,
  /** Where a gh account is: its machine, and its host when that is a GitHub Enterprise. */
  ghWhere: (machine: string, host: string) =>
    host === "github.com" ? machine : `${machine} · ${host}`,
  ghConnectOne: (login: string, machine: string) =>
    `Connect ${login} on ${machine}`,
  /** The line on a gh connection's row: whose it acts as, and where it follows the sign-in. */
  ghActsAs: (login: string, machine: string) =>
    `Acts as ${login}, with gh's sign-in on ${machine}. It follows gh there when you sign in again.`,
  /** The hub's reason when the machine's gh is no longer signed in for the account. */
  ghSignInAgain: (login: string, machine: string) =>
    `gh on ${machine} has no sign-in for ${login}. Run gh auth login there; the next read picks it up.`,
  /** A code sign-in's line while it can still finish: the code, and where it goes. */
  deviceEnter: "Enter this code at github.com/login/device:",
  deviceCopy: "Copy code",
  deviceCopied: "Copied",
  deviceOpen: "Open github.com/login/device",
  /** The line on a code sign-in's row once signed in. */
  deviceActsAs: (account: string) =>
    `Acts as ${account}, through CawCo's GitHub sign-in.`,
  /** A GitHub App's old registration (an App ID, Installation ID and private key), refused: the hub registers it now. */
  githubAppRegisters: (name: string) =>
    `${name} is a GitHub App, which the hub registers for you: sign in to it from Connections.`,
  /** A tracker bound through a GitHub App that may only read issues: what it takes on GitHub. */
  appReadsIssuesOnly: (slug: string) =>
    `The GitHub App ${slug} may only read issues, so it can't file this project's tasks. Give it Issues: read and write in its settings on GitHub, accept the change on its installation, then bind again.`,
  /** A GitHub App's way: the organization it is registered under, or none for your own account. */
  appOrganization: "Organization",
  appOrganizationHint:
    "Leave empty to register the app under your own account.",
  /** The line on a GitHub App's row while it waits for its installation. */
  appInstall: (service: string) =>
    `${service}'s page is open in a new tab: name the app, then install it on the repositories this hub reads.`,
  /** The line on an installed GitHub App's row. */
  appActsAsItself: (slug: string) =>
    `Acts as the app ${slug}, on the repositories you installed it on.`,
  callbackLine: "Add this callback URL to the app in Linear:",
  clientId: "Client ID",
  clientIdHint: "On the app's page in Linear's settings.",
  clientSecret: "Client secret",
  clientSecretHint: "The hub keeps it sealed.",
  /** A secret field's eye, named for what it shows or hides (its label, lower-cased). */
  showSecret: (what: string) => `Show the ${what}`,
  hideSecret: (what: string) => `Hide the ${what}`,
  /** The row's ⋯, and Projects…'s checklist. */
  projects: "Projects…",
  remove: "Remove",
  projectsMayUse: "Projects that may use it:",
  projectsFor: (service: string) => `Projects that may use ${service}`,
  more: (count: number) => `+${count}`,
  unread: (clause: string) => `Could not read the connections — ${clause}.`,
};

/**
 * One way the hub signs in to a service: how (`auth`), what it is called
 * where it is picked, and what it takes, said under the pick.
 */
export interface ConnectionWay {
  auth: Exclude<ConnectionAuth, "none" | "header">;
  /** What the key is, said under its field. */
  key?: string;
  label: string;
  /** What the way is for, under the pick. */
  says: string;
}

/**
 * A service the page can start a connection to: its MCP server and the
 * ways the hub signs in there, the first the one offered first. For the
 * dashboard's Connections page and the app's alike.
 * - GitHub: first the gh a fleet machine is signed in with, whose token the
 *   hub reads there each time (`gh auth token`, cli.github.com/manual);
 *   where no machine has gh, a code at github.com/login/device through
 *   CawCo's own OAuth app ("The `client_secret` is not needed for the device
 *   flow", docs.github.com, authorizing OAuth apps); or a GitHub App the hub
 *   registers from a manifest ("they only need to follow a URL and name the
 *   app", docs.github.com, registering a GitHub App from a manifest); or a
 *   token, for a GitHub Enterprise the machines' gh doesn't reach. Its remote
 *   MCP server takes each of their tokens as `Authorization: Bearer`
 *   (github/github-mcp-server#696). A project's tracker needs "Issues"
 *   (write) (docs.github.com, create an issue).
 * - Linear: an app acting as itself ("This option should be used for
 *   agents and service accounts", linear.app/developers/oauth-2-0-authentication),
 *   or an API key, both of which its MCP server takes as a bearer
 *   (linear.app/docs/mcp); or its MCP server's own sign-in, "OAuth 2.1 with
 *   dynamic client registration", whose token is for its MCP server alone.
 * - Slack: "We do not support SSE-based connections or Dynamic Client
 *   Registration at this time" (docs.slack.dev/ai/slack-mcp-server), so a
 *   user token, as Bearer.
 * - Gitea: no hosted MCP server; the person's own gitea-mcp in http mode,
 *   where "`Authorization: Bearer <token>` … pass a Gitea credential per
 *   request" (gitea.com/gitea/gitea-mcp), at the address they give.
 * - GitLab: its MCP server "supports OAuth 2.0 Dynamic Client Registration"
 *   and takes "A fine-grained personal access token with the MCP tool
 *   resource and the Execute permission"; legacy personal access tokens "cannot
 *   have the `mcp` scope, so the GitLab MCP server rejects them"
 *   (docs.gitlab.com/user/model_context_protocol/mcp_server). A session's
 *   write through it to another person's project is judged by the hub
 *   (connection-writes.ts). Pushes, issues and merge requests through
 *   `forge_post` sign in with the machine's glab instead.
 */
export interface ConnectionService {
  label: string;
  /**
   * The person runs the service's MCP server, or may (a Gitea's gitea-mcp, a
   * self-managed GitLab): the sign-in form asks its address, prefilled with
   * {@link url} when the service has a hosted one, this the field's example.
   * Absent, the hosted server's address is the connection's, unasked.
   */
  serverExample?: string;
  service: string;
  /** The service's hosted MCP server; absent when only the person's own runs it. */
  url?: string;
  ways: readonly ConnectionWay[];
}

export const CONNECTION_SERVICES: readonly ConnectionService[] = [
  {
    service: "github",
    label: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    ways: [
      {
        auth: "gh",
        label: "gh on a machine",
        says: "The gh login on one of your machines. It acts as you, and follows gh when you sign in again there.",
      },
      {
        auth: "device",
        label: "Sign in with a code",
        says: "Enter a short code at github.com/login/device. It acts as you.",
      },
      {
        auth: "app",
        label: "GitHub App",
        says: "The hub registers an app for you on GitHub; you name it and install it on the repositories it reads. It acts as itself.",
      },
      {
        auth: "bearer",
        label: "Token",
        says: "A fine-grained personal access token limited to the projects' repositories, for a GitHub Enterprise your machines' gh doesn't reach.",
        key: "It acts as you.",
      },
    ],
  },
  {
    service: "linear",
    label: "Linear",
    url: "https://mcp.linear.app/mcp",
    ways: [
      {
        auth: "app",
        label: "Linear app",
        says: "An OAuth app you create in Linear's settings. It acts as itself, with read and write.",
      },
      {
        auth: "bearer",
        label: "API key",
        says: "A personal API key limited to the projects' teams.",
        key: "It acts as you.",
      },
      {
        auth: "oauth",
        label: "Sign in",
        says: "Linear's own sign-in, for agents' Linear tools. A project's tasks need a Linear app or an API key.",
      },
    ],
  },
  {
    service: "gitlab",
    label: "GitLab",
    url: "https://gitlab.com/api/v4/mcp",
    serverExample: "https://gitlab.example.com/api/v4/mcp",
    ways: [
      {
        auth: "oauth",
        label: "Sign in",
        says: "GitLab's own sign-in, for agents' GitLab tools.",
      },
      {
        auth: "bearer",
        label: "Token",
        says: "A fine-grained personal access token with the MCP tool resource's Execute permission, limited to the projects' groups.",
        key: "It acts as you.",
      },
    ],
  },
  {
    service: "gitea",
    label: "Gitea",
    serverExample: "https://gitea.example.com/mcp",
    ways: [
      {
        auth: "bearer",
        label: "Token",
        says: "A Gitea access token, which your gitea-mcp passes to Gitea.",
        key: "A Gitea access token. gitea-mcp, run in http mode at the address above, passes it to Gitea; it acts as you.",
      },
    ],
  },
  {
    service: "slack",
    label: "Slack",
    url: "https://mcp.slack.com/mcp",
    ways: [
      {
        auth: "bearer",
        label: "User token",
        says: "A Slack user token from your Slack app.",
        key: "A Slack user token (xoxp-…) from your Slack app.",
      },
    ],
  },
];
