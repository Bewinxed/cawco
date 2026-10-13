/**
 * What reading the web is, for a memory note's taint (memory.ts): content
 * fetched from outside the fleet. A local target never taints; an outside
 * one, a target the hub cannot read, and every search do.
 *
 * - **Local** ({@link localHost}): loopback (127/8, ::1, localhost), private
 *   (10/8, 172.16/12, 192.168/16, fc00::/7), link-local (169.254/16,
 *   fe80::/10), CGNAT and tailnet (100.64/10, `*.ts.net`), mDNS (`*.local`),
 *   and the fleet's own machines by hostname or id.
 * - **A shell command** reads the web when it names a URL whose host is not
 *   local (`git clone https://…`, `curl https://…`), or runs a fetcher
 *   (curl, wget, …) at a target that is not local: a bare host argument is
 *   read as one, and a target in a variable, or one that does not parse, is
 *   the web.
 * - **A tool with a URL argument** (WebFetch, a browser's navigate, a
 *   scraper's url) reads the web when a URL it names is not local. A search
 *   (WebSearch, any MCP tool named for searching) always does, and so does a
 *   connection's tool (connections.ts): an outside service's words.
 * - **An outside service's MCP server**: every tool of a claude.ai connector
 *   (Gmail, Drive, Slack…), and of a fleet MCP server reached at a URL that
 *   is not local, reads the web. A server run as a command is judged by its
 *   tools' names and URL arguments, as above.
 */

/** The harnesses' own fetch tools: their `url` decides. */
const FETCH_TOOLS: ReadonlySet<string> = new Set(["WebFetch", "webfetch"]);
/** The harnesses' own search tools: always the web. */
const SEARCH_TOOLS: ReadonlySet<string> = new Set(["WebSearch", "websearch"]);
/** An MCP tool, by its server or its name, that reaches pages. */
const WEB_NAME =
  /fetch|scrape|crawl|search|browser|chrome|playwright|puppeteer|navigate|firecrawl|exa|web/i;
const SEARCH_NAME = /search/i;
/** CawCo's own tools as a harness names them: `mcp__cawco__<tool>` (Claude, pi), `cawco_<tool>` (OpenCode). */
const CAWCO_TOOL = /^(?:mcp__cawco__|cawco_)/;
/** A claude.ai connector's tool (Gmail, Drive, Slack, Notion…): an outside service. */
const CONNECTOR = /^mcp__claude_ai_/;
/** Claude's name for an MCP tool: `mcp__<server>__<tool>`. */
const CLAUDE_MCP = /^mcp__(.+?)__/;
const SHELLS: ReadonlySet<string> = new Set(["Bash", "bash"]);

/** A URL anywhere in a command, of a scheme that fetches. */
const URL_IN_TEXT = /\b(?:https?|ftps?|wss?|git):\/\/[^\s'"`<>|;()]+/gi;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const USERINFO = /^[^@/?#]*@/;
const HOST_END = /[:/?#]/;
const TRAILING_DOT = /\.$/;
/** An IPv6 host as a URL writes it: `[::1]`. */
const BRACKETS = /^\[(.*)\]$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;
const LINK_LOCAL_V6 = /^fe[89ab][0-9a-f]:/;
const PRIVATE_V6 = /^f[cd][0-9a-f]{2}:/;
const QUOTES = /^(["'])(.*)\1$/s;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHORT_FLAGS = /^-[A-Za-z]+$/;
const DURATION = /^\d/;
const HTTP_METHOD = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
/** Where one command of a shell line ends and the next begins. */
const SEGMENT = /\|\||&&|[|;&\n()`]|\$\(/;
const TOKEN = /"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g;

/** Words that run the command after them. */
const WRAPPERS: ReadonlySet<string> = new Set([
  "sudo",
  "env",
  "time",
  "nohup",
  "nice",
  "command",
  "exec",
  "stdbuf",
  "xargs",
  "timeout",
]);

/** Each fetcher, and the flags of it that take a value (the next word is no target). */
const FETCHERS: Readonly<
  Record<string, { long: ReadonlySet<string>; short: string; urlOnce: boolean }>
> = {
  curl: {
    short: "oHdXuAeFTwmbcKxrCEDyYzUPQ",
    long: new Set([
      "--output",
      "--header",
      "--data",
      "--data-raw",
      "--data-binary",
      "--data-urlencode",
      "--data-ascii",
      "--json",
      "--request",
      "--user",
      "--user-agent",
      "--referer",
      "--form",
      "--form-string",
      "--upload-file",
      "--write-out",
      "--max-time",
      "--connect-timeout",
      "--cookie",
      "--cookie-jar",
      "--config",
      "--proxy",
      "--range",
      "--continue-at",
      "--cert",
      "--key",
      "--cacert",
      "--capath",
      "--dump-header",
      "--retry",
      "--retry-delay",
      "--retry-max-time",
      "--resolve",
      "--connect-to",
      "--interface",
      "--limit-rate",
      "--proxy-user",
      "--time-cond",
      "--unix-socket",
      "--abstract-unix-socket",
      "--output-dir",
      "--stderr",
      "--trace",
      "--trace-ascii",
      "--variable",
    ]),
    urlOnce: false,
  },
  wget: {
    short: "OoaPtTUeiBwQlDARY",
    long: new Set([
      "--output-document",
      "--output-file",
      "--append-output",
      "--directory-prefix",
      "--tries",
      "--timeout",
      "--user-agent",
      "--header",
      "--post-data",
      "--post-file",
      "--user",
      "--password",
      "--execute",
      "--input-file",
      "--base",
      "--wait",
      "--quota",
      "--level",
      "--limit-rate",
      "--domains",
      "--exclude-domains",
      "--accept",
      "--reject",
      "--method",
      "--body-data",
    ]),
    urlOnce: false,
  },
  aria2c: { short: "doxs", long: new Set(["--dir", "--out"]), urlOnce: false },
  lynx: { short: "", long: new Set(), urlOnce: true },
  w3m: { short: "", long: new Set(), urlOnce: true },
  http: { short: "", long: new Set(), urlOnce: true },
  https: { short: "", long: new Set(), urlOnce: true },
  xh: { short: "", long: new Set(), urlOnce: true },
};

/** A fetcher run only to say what it is: no target. */
const INFO_FLAGS: ReadonlySet<string> = new Set([
  "--version",
  "-V",
  "--help",
  "-h",
  "--manual",
  "-M",
]);

const inRange = (value: number, from: number, to: number): boolean =>
  value >= from && value <= to;

/** Whether an IPv4 address is loopback, private, link-local, CGNAT (tailnet) or unspecified. */
const localV4 = (address: string): boolean => {
  const parts = IPV4.exec(address)?.slice(1).map(Number);
  if (!parts || parts.some((part) => part > 255)) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 127 ||
    a === 10 ||
    a === 0 ||
    (a === 172 && inRange(b, 16, 31)) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && inRange(b, 64, 127))
  );
};

/** Whether a host is inside the fleet (the module header's list); `fleet` holds its machines' hostnames and ids, lower case. */
export const localHost = (raw: string, fleet: ReadonlySet<string>): boolean => {
  const host = raw
    .toLowerCase()
    .replace(TRAILING_DOT, "")
    .replace(BRACKETS, "$1");
  if (!host) {
    return false;
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".ts.net") ||
    fleet.has(host)
  ) {
    return true;
  }
  if (IPV4.test(host)) {
    return localV4(host);
  }
  if (host.includes(":")) {
    const mapped = MAPPED_V4.exec(host)?.[1];
    return (
      host === "::1" ||
      host === "::" ||
      LINK_LOCAL_V6.test(host) ||
      PRIVATE_V6.test(host) ||
      (mapped !== undefined && localV4(mapped))
    );
  }
  return false;
};

/** A target's host: its scheme and user taken off, up to its port or path; undefined when there is none. */
const hostOf = (target: string): string | undefined => {
  const rest = target.replace(SCHEME, "").replace(USERINFO, "");
  if (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    return end > 1 ? rest.slice(0, end + 1) : undefined;
  }
  // httpie's `:3000/path` is localhost.
  if (rest.startsWith(":")) {
    return "localhost";
  }
  const [host] = rest.split(HOST_END);
  return host || undefined;
};

/** Whether a target is local: a host the hub reads, inside the fleet; a variable or an unreadable one is not. */
const localTarget = (target: string, fleet: ReadonlySet<string>): boolean => {
  if (target.includes("$") || target.includes("`")) {
    return false;
  }
  const host = hostOf(target);
  return host !== undefined && localHost(host, fleet);
};

const unquoted = (token: string): string => QUOTES.exec(token)?.[2] ?? token;

/** The command a segment runs, after its variable assignments and wrappers, with the words after it. */
const commandOf = (words: string[]): { args: string[]; name: string } => {
  let at = 0;
  while (at < words.length) {
    const word = words[at] ?? "";
    if (ENV_ASSIGNMENT.test(word)) {
      at += 1;
      continue;
    }
    const base = word.split("/").at(-1) ?? word;
    if (!WRAPPERS.has(base)) {
      return { name: base, args: words.slice(at + 1) };
    }
    at += 1;
    // A wrapper's own flags, and timeout's duration.
    while (
      at < words.length &&
      ((words[at] ?? "").startsWith("-") ||
        (base === "timeout" && DURATION.test(words[at] ?? "")))
    ) {
      at += 1;
    }
  }
  return { name: "", args: [] };
};

/** Whether a fetcher's flag takes the next word as its value. */
const takesValue = (
  word: string,
  flags: (typeof FETCHERS)[string]
): boolean => {
  if (word.startsWith("--")) {
    return !word.includes("=") && flags.long.has(word);
  }
  return SHORT_FLAGS.test(word) && flags.short.includes(word.at(-1) ?? "");
};

/** A fetcher's targets: its words that are no flag and no flag's value. */
const targetsOf = (
  args: string[],
  flags: (typeof FETCHERS)[string]
): { info: boolean; targets: string[] } => {
  const targets: string[] = [];
  let info = false;
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? "";
    if (word === "--") {
      targets.push(...args.slice(at + 1));
      break;
    }
    if (INFO_FLAGS.has(word)) {
      info = true;
      continue;
    }
    if (word === "--url") {
      targets.push(args[at + 1] ?? "");
      at += 1;
      continue;
    }
    if (word.startsWith("-")) {
      at += takesValue(word, flags) ? 1 : 0;
      continue;
    }
    if (HTTP_METHOD.test(word)) {
      continue;
    }
    targets.push(word);
    if (flags.urlOnce) {
      break;
    }
  }
  return { info, targets };
};

/** Whether a shell command fetches from outside the fleet (module header). */
export const commandReadsWeb = (
  command: string,
  fleet: ReadonlySet<string>
): boolean => {
  for (const url of command.match(URL_IN_TEXT) ?? []) {
    if (!localTarget(url, fleet)) {
      return true;
    }
  }
  for (const segment of command.split(SEGMENT)) {
    const words = (segment.match(TOKEN) ?? []).map(unquoted);
    const { name, args } = commandOf(words);
    const flags = FETCHERS[name];
    if (!flags) {
      continue;
    }
    const { info, targets } = targetsOf(args, flags);
    if (
      targets.length === 0
        ? !info
        : targets.some((one) => !localTarget(one, fleet))
    ) {
      return true;
    }
  }
  return false;
};

/** The URLs a tool's input names: `url`, `urls`, `uri`, `href`. */
const urlsOf = (input: Record<string, unknown>): string[] =>
  ["url", "urls", "uri", "href"].flatMap((key) => {
    const value = input[key];
    if (typeof value === "string") {
      return [value];
    }
    return Array.isArray(value)
      ? value.filter((one): one is string => typeof one === "string")
      : [];
  });

/** What the web test reads of the fleet. */
export interface WebContext {
  /** The fleet's machines, by hostname and id, lower case. */
  fleet: ReadonlySet<string>;
  /** The URL the fleet's MCP server of that name is reached at; undefined for one run as a command, or no server by that name. */
  mcpUrl: (server: string) => string | undefined;
}

/** The MCP servers a tool name could be of: Claude's `mcp__<server>__<tool>`, or each `_` prefix of OpenCode's `<server>_<tool>`. */
const serversOf = (name: string): string[] => {
  const claude = CLAUDE_MCP.exec(name)?.[1];
  if (claude) {
    return [claude];
  }
  const parts = name.split("_");
  return parts.slice(1).map((_, at) => parts.slice(0, at + 1).join("_"));
};

/** Whether an MCP tool's server is reached outside the fleet: a claude.ai connector, or a fleet server at a URL that is not local. */
const outsideServer = (name: string, context: WebContext): boolean =>
  CONNECTOR.test(name) ||
  serversOf(name).some((server) => {
    const url = context.mcpUrl(server);
    return url !== undefined && !localTarget(url, context.fleet);
  });

/** Whether one tool call read content from outside the fleet (module header). */
export const readsWeb = (
  name: string,
  input: Record<string, unknown>,
  context: WebContext
): boolean => {
  const { fleet } = context;
  if (SEARCH_TOOLS.has(name)) {
    return true;
  }
  if (FETCH_TOOLS.has(name)) {
    const urls = urlsOf(input);
    return urls.length === 0 || urls.some((url) => !localTarget(url, fleet));
  }
  if (name.replace(CAWCO_TOOL, "").startsWith("conn__")) {
    return true;
  }
  if (CAWCO_TOOL.test(name)) {
    return false;
  }
  if (SHELLS.has(name)) {
    return (
      typeof input.command === "string" && commandReadsWeb(input.command, fleet)
    );
  }
  // An MCP tool: Claude names it `mcp__<server>__<tool>`, OpenCode `<server>_<tool>`.
  if (!(name.startsWith("mcp__") || name.includes("_"))) {
    return false;
  }
  if (outsideServer(name, context)) {
    return true;
  }
  if (!WEB_NAME.test(name)) {
    return false;
  }
  if (SEARCH_NAME.test(name)) {
    return true;
  }
  return urlsOf(input).some((url) => !localTarget(url, fleet));
};
