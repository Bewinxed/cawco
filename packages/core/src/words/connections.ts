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
  signInClosed: "The sign-in tab closed before it finished.",
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
  /** A row's own button for an app not yet set. */
  setAppNow: "Set app",
  saveApp: "Save app",
  appOf: (row: string) => `${row} app`,
  appId: "App ID",
  appIdHint: "On the GitHub App's settings page: its App ID, or its client ID.",
  installationId: "Installation ID",
  installationIdHint:
    "The number at the end of the installation's settings URL.",
  privateKey: "Private key",
  privateKeyHint:
    "The .pem file's text, from Generate a private key. The hub keeps it sealed.",
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
  auth: "oauth" | "bearer" | "app";
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
 * - GitHub: "To access resources on behalf of an organization, or for
 *   long-lived integrations, you should use a GitHub App"
 *   (docs.github.com, managing your personal access tokens); its remote
 *   MCP server takes the app's `ghs_` token or a token as
 *   `Authorization: Bearer` (github/github-mcp-server#696). A project's
 *   tracker needs "Issues" (write) (docs.github.com, create an issue).
 * - Linear: an app acting as itself ("This option should be used for
 *   agents and service accounts", linear.app/developers/oauth-2-0-authentication),
 *   or an API key, both of which its MCP server takes as a bearer
 *   (linear.app/docs/mcp); or its MCP server's own sign-in, "OAuth 2.1 with
 *   dynamic client registration", whose token is for its MCP server alone.
 * - Slack: "We do not support SSE-based connections or Dynamic Client
 *   Registration at this time" (docs.slack.dev/ai/slack-mcp-server), so a
 *   user token, as Bearer.
 */
export interface ConnectionService {
  label: string;
  service: string;
  url: string;
  ways: readonly ConnectionWay[];
}

export const CONNECTION_SERVICES: readonly ConnectionService[] = [
  {
    service: "github",
    label: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    ways: [
      {
        auth: "app",
        label: "GitHub App",
        says: "An app you register and install on the projects' repositories, with Issues: read and write. It acts as itself.",
      },
      {
        auth: "bearer",
        label: "Token",
        says: "A fine-grained personal access token limited to the projects' repositories, with Issues: read and write.",
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
