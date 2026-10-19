# Forge adapters

The invariant: an agent in a CawCo workspace can do on any git forge (GitHub,
GitLab, Gitea/Forgejo) what it can do on GitHub: push, open issues and pull or
merge requests, and comment, all under one upstream setting (Off / Ask me
first / On), held for the person under Ask exactly as GitHub's are, with the
credential held on the host and never in the workspace.

This document is the audit of every place CawCo talks to a forge or git host,
the choice of library or MCP server per forge with its source, and the one
interface every forge plugs in through.

## 1. Audit

"Hand-rolled" means CawCo builds the HTTP requests or parses the protocol
itself where an established library or server exists.

| # | Place (file:line) | What it does | Hand-rolled? | Replacement | Source |
|---|---|---|---|---|---|
| 1 | `packages/agent/src/hub-git.ts:621` `doorTarget`, `:714` `hostBackend`, `:1006` `pipeHubHelper` | The git door: speaks git's remote-helper protocol for a workspace's clone, runs the host's own `git` (ls-remote, fetch, push --porcelain) with the host's credential, holds or refuses pushes to other repositories. | No: the protocol is git's own, and every byte to a remote is the host's `git`. | Keep. The permission decision moves to core `decideWrite`. | git-scm.com/docs/gitremote-helpers: "the remote helper protocol … git-remote-<transport> is invoked" |
| 2 | `hub-git.ts:241` `pushLfs` | Sends a push's LFS objects with `git lfs push`, to the origin's LFS or another repository's own endpoint. | No: git-lfs itself. | Keep. | github.com/git-lfs/git-lfs docs/api/server-discovery.md: "Git LFS will append `.git/info/lfs` to the end of a Git remote url" |
| 3 | `packages/agent/src/github-door.ts:193` `judged`, `:104` `resolveNodes`, `:275` `forward` | A guarded workspace's `gh` reaches GitHub's API through this unix-socket door, which judges each write and forwards it with the host's gh token. | Partly: it reads gh's raw requests and resolves node ids with a hand-written GraphQL query. It is a transport for the `gh` CLI agents already use, not a forge client. | Keep as gh's transport (today's GitHub behaviour). Its decision goes through `decideWrite`. | cli/go-gh pkg/api/client_options.go: "if opts.UnixDomainSocket == "" … cfg.Get([]string{"http_unix_socket"})" |
| 4 | `packages/agent/src/upstream-posts.ts:165` `makeHttp` | Replays a held GitHub API request with the host's token on approval. | Yes (fetch), but it replays bytes the person approved: a client library would re-encode them. | Keep for `via: "http"` posts. | (own call: an approved request is sent as the person saw it) |
| 5 | `upstream-posts.ts:236` `makeHeldPush` | Makes an approved held push with the host's git, its LFS first. | No: host `git` and `git lfs`. | Keep. | as 1 and 2 |
| 6 | `upstream-posts.ts:98` `hostAccount` | Names the GitHub login for an ask card with `gh api user`. | No: gh. | Moves into each adapter (`account`). | — |
| 7 | `packages/core/src/upstream-guard.ts:300` `writeRefusal`, `:407` `upstreamHttpWrite`, `:123` `normaliseRemote` | The guard's words, GitHub API write shapes, and repository identity from a remote URL. | Identity parsing is CawCo's own (no library parses every forge's URL forms). | Gains `decideWrite`, the one decision. | git-scm.com/docs/git-clone "GIT URLS" |
| 8 | `packages/core/src/upstream-post.ts:52` `UpstreamPost`, `:194` `describePost` | The held post kinds (http, git, mcp) and the ask card's words. | n/a | Gains `via: "forge"`, a forge write named by its forge on the card. | — |
| 9 | `packages/hub/src/upstream-asks.ts:87` `carryOut` | Parks the ask, makes the post once on approval through the machine or the connection. | n/a | Keep; forge posts are made by the machine that holds the sign-in. | — |
| 10 | `packages/hub/src/connections.ts:1344` `callAs`; guard at `packages/hub/src/server.ts:19875` | Sessions call a connection's MCP tools as the hub; a GitHub connection's write tool naming another `owner`/`repo` is refused or held. | No: MCP SDK client to GitHub's / Linear's MCP servers. The guard knew GitHub's argument names alone. | Keep. The guard reads the repository per forge (GitHub and Gitea `owner`/`repo`, GitLab `project_id`/`id` path) and decides through `decideWrite`. | github.com/github/github-mcp-server README: "you can use the `--read-only` flag. This will only offer read-only tools" |
| 11 | `connections.ts:1282` `githubToken`, `:1792` `githubClient` | Hands the GitHub poller a token and the tracker an Octokit signed in as the connection. | No: Octokit. | Keep. | github.com/octokit/octokit.js: "The all-batteries-included GitHub SDK for Browsers, Node.js, and Deno." |
| 12 | `packages/hub/src/tracker-adapter.ts:100` `TrackerAdapter`, `tracker-github.ts:327`, `tracker-linear.ts:282` | Tracker sync: a project's tasks kept as GitHub Issues or Linear issues, through each service's SDK. | No: Octokit and @linear/sdk. | Keep apart (see §3.5). | — |
| 13 | `packages/hub/src/landing.ts:819` `openPullRequest`, called at `work-items.ts:5984` | `lands: pr`: runs `gh pr view` and `gh pr create` inside the workspace. | No (gh), but GitHub-only, and it put gh's token inside the workspace under On. | Goes. The hub asks the workspace's machine to open the pull or merge request through the origin's forge adapter. | — |
| 14 | `packages/hub/src/repo-publish.ts:218` | `create_repo`: `POST /user/repos` by hand with `fetch`, then a hub `git push`. | Yes (fetch). | Octokit `repos.createForAuthenticatedUser`. | octokit.js as row 11 |
| 15 | `packages/hub/src/ingress.ts:472` (`const api = GITHUB_API`) | The GitHub poller's REST reads (events) by hand with `fetch`. | Yes (fetch). | Octokit; not moved in this item (it is a read path with its own ETag cursor, outside posting). | octokit.js as row 11 |
| 16 | `packages/agent/src/boundary.ts:4100` `ghToken`, `:4189` `guardedEnv`, `:1065` `writeGuardedGhConfig`; `packages/agent/src/host-gh.ts:46` `hostGhToken` | Under On a workspace's commands get `GH_TOKEN` from the host's gh; guarded ones get a gh config whose `http_unix_socket` is the GitHub door. | n/a | Unchanged in this item: forge writes other than `gh`'s now go through `forge_post`, which never enters the workspace (see §4, last row). | — |

## 2. Library or MCP server, per forge

The criteria: the token stays on the host; the Ask hold happens before the
write; it works with no service beyond the forge itself; it is maintained.

**GitHub: Octokit (library).** Already the hub's client for the tracker and
the GitHub App sign-in (`@octokit/rest` 22.0.1). GitHub's MCP server
(github.com/github/github-mcp-server) stays the transport of a GitHub
*connection's* session tools, as today. For the adapter, a library call is
judged before it is made and needs no second process.

**GitLab: @gitbeaker/rest (library).** "A Typed GitLab SDK for Browsers,
Node.js, and Deno … `host` … Gitlab Instance Host URL … `token` Personal
Token" (github.com/jdalrymple/gitbeaker, packages/rest/README.md; npm 43.8.0,
modified 2026-08-13). GitLab's own MCP server
(docs.gitlab.com/user/model_context_protocol/mcp_server) is not usable with
the credential glab keeps: "These tokens cannot have the `mcp` scope, so the
GitLab MCP server rejects them, even with scopes such as `api`: Legacy personal
access tokens", and it needs an administrator to "Allow access to the MCP
server" and GitLab 19.2+ on the Free tier. `glab mcp serve` is "an experiment
and is not ready for production use" (docs.gitlab.com/cli/mcp/serve). So the
adapter speaks REST through gitbeaker with glab's token. The MCP server is what
a GitLab *connection* reaches for agents' GitLab tools, signed in with
GitLab's own OAuth ("OAuth 2.0 Dynamic Client Registration").

**Gitea / Forgejo: gitea-mcp (MCP server, over stdio, on the host).**
"Gitea's official MCP Server … Pass the Gitea host and access token as
command-line flags or environment variables" (gitea.com/gitea/gitea-mcp,
v1.9.0, commits to 2026-10-19), built on Gitea's official Go SDK
(code.gitea.io/sdk), which TypeScript cannot call. The only TypeScript client,
gitea-js, "is mapped to the version of the Gitea api" and stops at 1.23
(npm 1.23.0, last published 2025-01-13). The adapter starts `gitea-mcp -t
stdio` on the host per write with the token in that process's environment,
and calls its `issue_write`, `pull_request_write` and `pull_request_read`
tools through the MCP SDK the hub already uses. The token never leaves the
host. A host without `gitea-mcp` on its PATH has no Gitea adapter, and a write
there says so. Forgejo's API is Gitea's for these calls; that gitea-mcp works
against Forgejo is my own call, not proven here.

**git itself: the host's `git` through git's remote-helper protocol, as
now.** isomorphic-git has no ssh ("Is 'ssh protocol' supported by
isomorphic-git? Not at the moment, no", isomorphic-git#231) and no LFS
(isomorphic-git#1375), and simple-git only wraps the `git` binary the door
already runs. Nothing changes here.

## 3. Design

### 3.1 Approaches considered

1. **A door per forge CLI** (gh through the GitHub door, glab and tea
   through doors of their own). glab and tea have no unix-socket transport,
   so each door would terminate TLS and parse that forge's REST shapes: the
   hand-rolled judge the owner asked to avoid, three times.
2. **Connections only** (GitLab's MCP server, gitea-mcp as hub
   connections). Covers agents' tools where the person adds a connection, but
   not the host's own sign-ins, not `lands: pr`, and not GitLab before 19.2.
3. **One adapter interface on the machine, one decision in core, one tool
   for agents.** Agents call `forge_post` (issue, pull or merge request,
   comment); the hub sends it to the session's machine, which finds the
   forge and its sign-in for the repository's host, decides through
   `decideWrite`, and makes it through that forge's adapter, or answers the
   hold the hub raises as the existing ask card.

Chosen: 3. It keeps every credential where the forge's own CLI keeps it,
puts the permission decision in one function every door and adapter calls,
and gives `lands: pr` the same path.

### 3.2 The interface

`packages/agent/src/forges/forge.ts`:

```ts
interface ForgeAdapter {
  readonly forge: Forge;                 // "github" | "gitlab" | "gitea"
  readonly name: string;                 // "GitHub", "GitLab", "Gitea"
  /** The host's own sign-in for `host`, as this forge's CLI keeps it; none when it keeps none. */
  signIn(host: string): Promise<ForgeSignIn | undefined>;
  /** A client signed in as `signIn`, for the repository `path` on its host. */
  client(signIn: ForgeSignIn, path: string): ForgeClient;
}

interface ForgeClient {
  account(): Promise<string>;                                   // the login it posts as
  issue(write: { title; body }): Promise<ForgeMade>;
  pullRequest(write: { base; head; title; body }): Promise<ForgeMade>;  // the open one for head→base when there is one
  comment(write: { on: "issue" | "pull_request"; number; body }): Promise<ForgeMade>;
}
```

Repository identity from a remote URL is core's `normaliseRemote`
(`host/path`); the forge of a host is the first adapter that holds a sign-in
for it (§3.4), so a self-managed GitLab or a Gitea on any domain is found by
its CLI's own login. The machine-side entry points are two:

- `forgePost(rule, post)`: identity → adapter and sign-in → `decideWrite` →
  made now, held (answering what the card says, with the forge named and the
  account it posts as), or refused in the guard's words;
- `makeUpstreamPost(id, post)` for `via: "forge"`: an approved post made
  once, with no decision (the person made it).

### 3.3 Where the permission check sits

`decideWrite(rule, write)` in `packages/core/src/upstream-guard.ts`:

```ts
type WriteDecision =
  | { kind: "go" }
  | { kind: "hold"; repo: string }
  | { kind: "refuse"; why: string };
```

No rule, On, or the project's own repository: `go`. Ask: `hold` for a write
that names its repository, else `refuse` in `askRefusal`'s words. Off:
`refuse` in `writeRefusal`'s words. Every door and adapter calls it and none
judges own-vs-other or Off/Ask/On itself:

| Caller | Write it decides |
|---|---|
| git door, `hub-git.ts` `doorTarget` | a push to a URL that is not the clone's origin |
| GitHub door, `github-door.ts` `serve` | a gh request against `/repos/<owner>/<repo>` or a GraphQL mutation |
| forge posts, `forges/forge.ts` `forgePost` | an issue, pull or merge request, or comment through an adapter |
| a connection's write tool, hub `server.ts` | GitHub's and Gitea's `owner`/`repo`, GitLab's project path |

### 3.4 Credentials, each where its forge's CLI keeps it

| Forge | Where | Source |
|---|---|---|
| GitHub | `gh auth token --hostname <host>`; the API at `api.github.com`, or `<host>/api/v3`; gh's own `http_unix_socket` honoured as go-gh does | cli.github.com/manual/gh_auth_token |
| GitLab | glab's `config.yml` (`$GLAB_CONFIG_DIR`, else `$XDG_CONFIG_HOME/glab-cli`, else `~/.config/glab-cli`), `hosts.<host>.token`, its `api_protocol` and `api_host` | docs.gitlab.com/cli/config: "`token`: Your GitLab access token … Scoped per host"; "`api_protocol` … Supported values: `http`, `https`" |
| Gitea | tea's `config.yml` (`$XDG_CONFIG_HOME/tea`, else `~/.config/tea`), the login whose `url` is on the host, its `token` | gitea.com/gitea/tea: "Configuration is persisted in $XDG_CONFIG_HOME/tea" |

A glab login kept in the OS keyring (`use_keyring: true`) has no token in the
file; the write says so and names `glab auth login` without the keyring. A
token the person adds in Configure → Connections is the hub's and stays
there: it serves that connection's MCP tools (§3.6), not the machine's
adapter. Nothing is ever exported into a workspace.

### 3.5 Tracker sync

Tracker sync (`TrackerAdapter`) reads and writes a project's own issues on
a schedule, with states, cursors and ETags; forge posts are one-shot writes
an agent asks for and the person may hold. Folding them into one interface
would give every forge adapter eleven methods it mostly does not need for
posting, and the tracker's Linear side is no forge. They stay two
interfaces; GitLab and Gitea tracker backends are a separate item.

### 3.6 Configure → Connections

GitLab joins `CONNECTION_SERVICES` with its MCP server
(`https://gitlab.com/api/v4/mcp`), signed in with GitLab's own OAuth or a
fine-grained token ("A fine-grained personal access token with the MCP tool
resource and the Execute permission", docs.gitlab.com/user/model_context_protocol/mcp_server).
Gitea has no hosted MCP server, so a Gitea connection needs the address of the
person's own gitea-mcp, which is new markup on the page and waits on the
Tailwind conductor's yes (cockpit-6fd4033f#eee38793).

### 3.7 `lands: pr`

The hub pushes the branch as before, then asks the workspace's machine to
make `{ via: "forge", repo: <origin>, write: pull_request }` through
`CONTROL_UPSTREAM_POST`: the adapter for the origin's host finds the open
pull or merge request from that branch or opens one. On GitLab it is a merge
request, on Gitea a pull request.

## 4. What is deleted

| Gone | Replaced by |
|---|---|
| `landing.ts` `openPullRequest`, `PullRequestOutcome`, `PR_URL`, the `gh pr view`/`gh pr create` commands | the origin's adapter, made on the machine (§3.7) |
| The own-vs-other and Off/Ask/On branches in `hub-git.ts` `doorTarget`, `github-door.ts` `serve`, and the hub's connection guard | `decideWrite` |
| `upstream-posts.ts` `hostAccount`'s GitHub-only login | each adapter's `account()` |
| `repo-publish.ts`'s hand-made `POST /user/repos` | Octokit |
| The connection guard's GitHub-only `service === "github"` test | the forge of the connection's service |

`GH_TOKEN` under On (row 16) is not removed here: `gh` inside a workspace
under On is today's GitHub behaviour, which this item keeps. Removing it is a
one-line proposal for the owner, as it changes what an unguarded workspace's
`gh` can do.
