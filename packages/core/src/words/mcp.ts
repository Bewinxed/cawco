import { commonWords } from "./common";

/**
 * What Configure › MCP says (routes/config/mcp, its editor McpEditor.svelte,
 * a row's sign-in McpSignIn.svelte), and the refusals a server's name meets
 * before the hub (fleet.ts `mcpNameProblem`). For the dashboard and the
 * native app alike.
 *
 * `bun run words` writes these into the app as `Words.Mcp`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const mcpWords = {
  /** The list. */
  list: "MCP servers",
  add: "Add server",
  syncAll: "Sync all",
  syncing: "Syncing…",
  emptyTitle: "No MCP servers yet",
  emptyLine:
    "Add a server and every machine gets it — the quick way is a package name.",
  remove: "Remove everywhere",
  /** A remote server's meta line leads with its transport. */
  transportOf: (transport: string, url: string) => `${transport} · ${url}`,

  /** A row's sign-in, for a server that signs in with OAuth. */
  signIn: "Sign in",
  signingIn: (name: string) => `Waiting for ${name}…`,
  signedIn: "Signed in for the fleet",
  signInClosed: "The sign-in tab closed before it finished.",
  /** The hub refuses to start a sign-in to a server switched off. */
  enableBeforeSignIn: "Enable this server before signing in.",
  /** The machines card's line for a server waiting on the fleet's sign-in, once however many machines report it. */
  needsSignIn: (name: string) =>
    `${name} needs a sign-in for the fleet. Until then, no session gets its tools.`,
  /**
   * The hub's sign-in ended without the person (hub fleet-mcp.ts `#end`):
   * Needs you's item and its push. `where` is Configure's page for the
   * servers (`configurePage("mcp")`).
   */
  signInAgain: (name: string) => `${name} needs you to sign in again`,
  signInEnded: (where: string) =>
    `Its tools are off in every session until you sign in again from ${where}. Sessions already running get them back within seconds.`,
  /** The reason line its Show details unfolds under: the provider's words. */
  signInEndedWhy: "The sign-in ended without you.",

  /** The editor. */
  what: "MCP server",
  save: commonWords.saveChanges,
  newTitle: "New MCP server",
  nameLabel: "Server name",
  namePlaceholder: "Name this server",
  renamed: (name: string) =>
    `A new name makes a new server; ${name} stays as it is.`,
  callsAs: (name: string) =>
    `What sessions call its tools — \`mcp__${name}__…\`. New sessions pick it up; a running session keeps the servers it started with.`,
  howItRuns: "How machines run it",
  kind: "Kind",
  kindBunx: "bunx package",
  kindCommand: "Command",
  kindRemote: "Remote",
  howBunx:
    "Every machine runs the package with bunx. Nothing to install first.",
  howCommand: "Runs a command the machines already have on their PATH.",
  howRemote: "Calls an endpoint. No process runs on the machines.",
  package: "Package",
  packagePlaceholder: "@modelcontextprotocol/server-filesystem",
  packageArgs: "Arguments (optional)",
  packageArgsPlaceholder: "/home/you/projects",
  command: "Command",
  commandPlaceholder: "uvx",
  args: "Arguments",
  argsHint: "Split on spaces. Quotes are not honoured.",
  argsPlaceholder: "mcp-server-git --repository /home/you/repo",
  url: "URL",
  urlPlaceholder: "https://mcp.example.com/sse",
  transport: "Transport",
  transportHttp: "HTTP",
  transportSse: "SSE · deprecated",
  headers: "Headers",
  environment: "Environment",
  /** Backticks mark what is set in the code face (Coded.svelte, `coded`). */
  expanded:
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the words show the machine's own `${VAR}` syntax, which each machine expands; not a placeholder of this string.
    "`${VAR}` is expanded on each machine, from that machine's own environment — secrets never pass through the hub.",
  headerKey: "Authorization",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: an example of the `${VAR}` a machine expands in a header.
  headerValue: "Bearer ${MY_TOKEN}",
  envKey: "API_KEY",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: an example of the `${VAR}` a machine expands in its environment.
  envValue: "${MY_API_KEY}",
  addPair: "Add",
  removePair: (key: string) => `Remove ${key}`,
  where: "Where it applies",
  whereNote:
    "Every machine in the fleet unless you narrow it to one project. A project's server reaches each of its checkouts and delegate workspaces.",
  scope: "Scope",
  everyMachine: "Every machine in the fleet",

  /** Why a name cannot be used. */
  problemEmpty: "Give the server a name.",
  problemCharacters: "Letters, digits, dashes and underscores only.",
  problemReserved: (name: string) => `Claude Code keeps “${name}” for itself.`,
  problemTaken: (name: string) => `There is already a server called “${name}”.`,
};
