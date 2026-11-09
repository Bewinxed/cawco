# Forge adapters

The invariant: an agent in a CawCo workspace can do on any git forge (GitHub,
GitLab, Gitea/Forgejo) what it can do on GitHub: push, open issues and pull or
merge requests, and comment, with the credential held on the host and never
in the workspace.

This document is the audit of every place CawCo talks to a forge or git host,
the choice of library or MCP server per forge with its source, and the one
interface every forge plugs in through.

## 1. Audit

"Hand-rolled" means CawCo builds the HTTP requests or parses the protocol
itself where an established library or server exists.

| # | Place (file:line) | What it does | Hand-rolled? | Replacement | Source |
|---|---|---|---|---|---|
| 1 | `packages/agent/src/hub-git.ts` `doorTarget`, `hostBackend`, `pipeHubHelper` | The git door: speaks git's remote-helper protocol for a workspace's clone, and runs the host's own `git` (ls-remote, fetch, push --porcelain) with the host's credential, for the clone's origin and for a push to any other repository. | No: the protocol is git's own, and every byte to a remote is the host's `git`. | Keep. | git-scm.com/docs/gitremote-helpers: "the remote helper protocol … git-remote-<transport> is invoked" |
| 2 | `hub-git.ts:241` `pushLfs` | Sends a push's LFS objects with `git lfs push`, to the origin's LFS or another repository's own endpoint. | No: git-lfs itself. | Keep. | github.com/git-lfs/git-lfs docs/api/server-discovery.md: "Git LFS will append `.git/info/lfs` to the end of a Git remote url" |
| 3 | `packages/agent/src/github-door.ts` `forward` | Every workspace's `gh` reaches GitHub's API through this unix-socket door, which forwards each request with the host's gh token. | No: `forward` is a byte-for-byte proxy, gh's transport, not a client of its own; a client would parse and re-encode gh's requests and answers. | Keep. | cli/go-gh pkg/api/client_options.go: "if opts.UnixDomainSocket == "" … cfg.Get([]string{"http_unix_socket"})" |
| 4 | `packages/hub/src/projects.ts` `normaliseRemote`; `packages/agent/src/forges/forge.ts` `forgeLocation` | A project's repository identity from a remote URL, and where a forge write lands. | Yes: no library parses every forge's URL forms. | Keep. | git-scm.com/docs/git-clone "GIT URLS" |
| 5 | `packages/hub/src/connections.ts` `callAs` | Sessions call a connection's MCP tools as the hub, with the connection's credential. | No: MCP SDK client to GitHub's / Linear's MCP servers. | Keep. | github.com/github/github-mcp-server README: "you can use the `--read-only` flag. This will only offer read-only tools" |
| 6 | `connections.ts` `githubClient` | Hands the tracker, the GitHub poller, the relay's webhooks and `create_repo` an Octokit signed in as the connection. `githubToken`, which handed the poller and the relay a raw token, is gone. | No: Octokit. | Keep. | github.com/octokit/octokit.js: "The all-batteries-included GitHub SDK for Browsers, Node.js, and Deno." |
| 7 | `packages/hub/src/tracker-adapter.ts:100` `TrackerAdapter`, `tracker-github.ts:327`, `tracker-linear.ts:282` | Tracker sync: a project's tasks kept as GitHub Issues or Linear issues, through each service's SDK. | No: Octokit and @linear/sdk. | Keep apart (see §3.4). | — |
| 8 | `packages/hub/src/landing.ts:819` `openPullRequest`, called at `work-items.ts:5984` | `lands: pr`: runs `gh pr view` and `gh pr create` inside the workspace. | No (gh), but GitHub-only, and it put gh's token inside the workspace. | Goes. The hub asks the workspace's machine to open the pull or merge request through the origin's forge adapter. | — |
| 9 | `packages/hub/src/repo-publish.ts:218` | `create_repo`: `POST /user/repos` by hand with `fetch`, then a hub `git push`. | Yes (fetch). | Octokit `repos.createForAuthenticatedUser`. | octokit.js as row 6 |
| 10 | `packages/hub/src/github.ts` `pollRepo` (run by `ingress.ts`) | The GitHub poller's REST reads (pulls, issues, comments, issue events) with their ETags. | Was `fetch` with a hand-read `link` header. | Octokit signed in as the connection (`githubClient`): each list through `octokit.paginate.iterator`, one page at a time within the read's deadline, the ETag on the first page, a 304 read as Octokit throws it, no redirect followed and no page off the API's origin. | github.com/octokit/plugin-paginate-rest.js |
| 11 | `packages/agent/src/boundary/exec.ts` `commandEnv`; `packages/agent/src/boundary/shims.ts` `writeGuardedGhConfig`; `packages/agent/src/host-gh.ts` `hostGhToken` | Every workspace's commands get no forge token, the caller's included, and a gh config whose `http_unix_socket` is the GitHub door, which makes gh's posts with the host's token. `ghToken`, the executor's copy of gh's token (`<state>/gh-token`) and its `GH_TOKEN`, are gone, and so is git's `gh auth git-credential` helper in the workspace's system gitconfig. | n/a | — | — |
| 12 | `packages/hub/src/relay.ts` `register`, `unregister` | A GitHub relay's webhook, made and deleted through its connection. | Was `fetch`. | Octokit (`repos.createWebhook`, `repos.deleteWebhook`) signed in as the connection. | octokit.js as row 6 |
| 13 | `packages/hub/src/source-facts.ts` `githubFacts` | A public repository's stars and age. | Was `fetch`. | Octokit (`repos.get`), signed in as no one. | octokit.js as row 6 |
| 14 | `packages/core/src/binary-distribution.ts` `newestNightly`, `discoverRelease` | CawCo's own release lookups (tags, a release by tag, the latest release). | Was `fetch`. | Octokit (`git.listMatchingRefs`, `repos.getReleaseByTag`, `repos.getLatestRelease`), signed in as no one. The release's assets are files at their download URLs, read as files. | octokit.js as row 6 |
| 15 | `packages/core/src/install-script.ts` | The shell installer's release lookup with `curl`. | Yes, and stays: it is a POSIX shell script run before CawCo is installed, where no library is. | Keep. | (own call) |

## 2. Library or MCP server, per forge

The criteria: the token stays on the host; it works with no service beyond
the forge itself; it is maintained.

**GitHub: Octokit (library).** Already the hub's client for the tracker and
the GitHub App sign-in (`@octokit/rest` 22.0.1). GitHub's MCP server
(github.com/github/github-mcp-server) stays the transport of a GitHub
*connection's* session tools, as today. For the adapter, a library call
needs no second process.

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
   so each door would terminate TLS and parse that forge's REST shapes, three
   times.
2. **Connections only** (GitLab's MCP server, gitea-mcp as hub
   connections). Covers agents' tools where the person adds a connection, but
   not the host's own sign-ins, not `lands: pr`, and not GitLab before 19.2.
3. **One adapter interface on the machine, one tool for agents.** Agents
   call `forge_post` (issue, pull or merge request, comment); the hub sends
   it to the session's machine, which finds the forge and its sign-in for
   the repository's host and makes it through that forge's adapter.

Chosen: 3. It keeps every credential where the forge's own CLI keeps it, and
gives `lands: pr` the same path.

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

Where a write lands is read from the repository's URL or `host/path`
(`forgeLocation`: its host with its port, and its path); the forge of a host
is the one adapter whose CLI keeps a login for it (`forgeOn`, §3.3), so a
self-managed GitLab or a Gitea on any domain is found by its CLI's own
login. Where more than one CLI keeps a login that could be the host's, CawCo
names none: the write is refused in words that ask for the repository's URL,
its port included. The machine-side entry point is `forgePost(ask)`: location → adapter and sign-in → made once,
or refused in words that say why (no repository named, no sign-in there).

### 3.3 Credentials, each where its forge's CLI keeps it

| Forge | Where | Source |
|---|---|---|
| GitHub | `gh auth token --hostname <host>`; the API at `api.github.com`, or `<host>/api/v3`; gh's own `http_unix_socket` honoured as go-gh does | cli.github.com/manual/gh_auth_token |
| GitLab | glab's `config.yml` (`$GLAB_CONFIG_DIR`, else `$XDG_CONFIG_HOME/glab-cli`, else `~/.config/glab-cli`), `hosts.<host>.token`, its `api_protocol` and `api_host` | docs.gitlab.com/cli/config: "`token`: Your GitLab access token … Scoped per host"; "`api_protocol` … Supported values: `http`, `https`" |
| Gitea | tea's `config.yml` (`$XDG_CONFIG_HOME/tea`, else `~/.config/tea`), the login whose `url` is on the host, its `token` | gitea.com/gitea/tea: "Configuration is persisted in $XDG_CONFIG_HOME/tea" |

A login is found by the repository's host with its port (`gitea.local:3000`,
as each CLI names a self-hosted forge), or, for a project's remote, which
names no port (hub projects.ts `normaliseRemote`), by its hostname alone. Every forge's
CLI is asked; the host is the forge whose CLI alone keeps a login that could
be it. When two or more do (gh at `127.0.0.1:3000` and glab at
`127.0.0.1:8080`, a port-less remote naming `127.0.0.1`), `forge_post` and a
landing's pull request name no forge by any order: the write is refused,
asking for the repository's URL with its port. A glab
login kept in the OS keyring (`use_keyring: true`) has no token in the
file; the write says so and names `glab auth login` without the keyring.
gitea-mcp, like gh, runs only from where no workspace writes
(`host-gh.ts` `hostProgram`). A
token the person adds in Configure → Connections is the hub's and stays
there: it serves that connection's MCP tools (§3.5), not the machine's
adapter. Nothing is ever exported into a workspace.

### 3.4 Tracker sync

Tracker sync (`TrackerAdapter`) reads and writes a project's own issues on
a schedule, with states, cursors and ETags; forge posts are one-shot writes
an agent asks for. Folding them into one interface
would give every forge adapter eleven methods it mostly does not need for
posting, and the tracker's Linear side is no forge. They stay two
interfaces; GitLab and Gitea tracker backends are a separate item.

### 3.5 Configure → Connections

GitLab joins `CONNECTION_SERVICES` with its MCP server
(`https://gitlab.com/api/v4/mcp`), signed in with GitLab's own OAuth or a
fine-grained token ("A fine-grained personal access token with the MCP tool
resource and the Execute permission", docs.gitlab.com/user/model_context_protocol/mcp_server).
Gitea has no hosted MCP server, so a Gitea connection needs the address of the
person's own gitea-mcp, which is new markup on the page and waits on the
Tailwind conductor's yes (cockpit-6fd4033f#eee38793).

**Which connection tools write.** CawCo reads what the connection's server
sends in its `tools/list` (`listed` in connections.ts), never a list kept in
CawCo: a tool reads only when it says `readOnlyHint: true` and does not say
`destructiveHint: true` (hub `connection-writes.ts` `readsOnly`, the one
reading read-only sessions and connector polls go by). That is
GitLab's own reading of its server's tools: "Each tool is sorted into an
action category based on the annotations it declares … `destructiveHint:
true` Delete, `readOnlyHint: true` Read, `readOnlyHint: false` Write, Neither
annotation Delete … the most restrictive declaration wins"
(docs.gitlab.com/user/ai-governance/tool-governance).

GitLab's server sends a tool's annotations when it has any
(app/services/mcp/tools/base/base_service.rb: "result[:annotations] =
tool_annotations if tool_annotations.present?"); a tool made from a REST
route takes its route's own, else `readOnlyHint: true` for a GET
(app/services/mcp/tools/base/api_tool.rb: "return settings[:annotations] if
settings[:annotations].present? … auto_annotations[:readOnlyHint] = true if
route.request_method == 'GET'"). Every tool GitLab documents
(docs.gitlab.com/user/model_context_protocol/mcp_server_tools), read against
gitlab-org/gitlab at fbca10d4 (2026-10-19), paths under `app/services/mcp/tools/`
unless named:

| Tool | Declared (source) | Reads or writes |
|---|---|---|
| `get_mcp_server_version` | `readOnlyHint: true` (get_server_version_service.rb:20) | read |
| `get_project` | `readOnlyHint: true` (projects/get_project_service.rb:27) | read |
| `add_commit` | `readOnlyHint: false, destructiveHint: true` (repositories/add_commit_service.rb:30) | write |
| `create_issue` | `readOnlyHint: false, destructiveHint: false` (lib/api/issues.rb:360) | write |
| `get_issue` | none, a GET: `readOnlyHint: true` (lib/api/issues.rb:329, api_tool.rb:115) | read |
| `save_merge_request` | `readOnlyHint: false, destructiveHint: false` (merge_requests/save_merge_request_service.rb:29) | write |
| `get_merge_request` | `readOnlyHint: true` (merge_requests/get_merge_request_service.rb:78) | read |
| `list_duo_agents_and_flows` | `readOnlyHint: true` (ee/…/duo_workflows/list_duo_agents_and_flows_service.rb:61) | read |
| `start_duo_session` | `readOnlyHint: false, destructiveHint: true` (ee/…/duo_workflows/start_duo_session_service.rb:67) | write |
| `list_duo_sessions` | `readOnlyHint: true` (ee/…/duo_workflows/list_duo_sessions_service.rb:48) | read |
| `get_duo_session` | `readOnlyHint: true` (ee/…/duo_workflows/get_duo_session_service.rb:29) | read |
| `send_duo_session_input` | `readOnlyHint: false, destructiveHint: false` (ee/…/duo_workflows/send_duo_session_input_service.rb:38) | write |
| `list_merge_requests` | `readOnlyHint: true` (merge_requests/list_merge_requests_service.rb:75) | read |
| `get_merge_request_commits` | none, a GET: `readOnlyHint: true` (lib/api/merge_requests.rb:559) | read |
| `get_merge_request_diffs` | none, a GET: `readOnlyHint: true` (lib/api/merge_requests.rb:711) | read |
| `get_merge_request_pipelines` | none, a GET: `readOnlyHint: true` (lib/api/merge_requests.rb:760) | read |
| `get_merge_request_conflicts` | `readOnlyHint: true` (merge_requests/get_merge_request_conflicts_service.rb:36) | read |
| `save_note` | `readOnlyHint: false, destructiveHint: false` (notes/save_note_service.rb:15) | write |
| `get_merge_request_notes` | `readOnlyHint: true` (merge_requests/get_merge_request_notes_service.rb:46) | read |
| `save_merge_request_review` | `readOnlyHint: false, destructiveHint: false` (merge_requests/save_merge_request_review_service.rb:37) | write |
| `list_project_members` | `readOnlyHint: true` (projects/list_project_members_service.rb:31) | read |
| `get_user` | `readOnlyHint: true` (users/get_user_service.rb:35) | read |
| `accept_merge_request` | `readOnlyHint: false, destructiveHint: true` (merge_requests/accept_merge_request_service.rb:15) | write |
| `add_branch` | `readOnlyHint: false, destructiveHint: false` (repositories/branches/add_branch_service.rb:19) | write |
| `fork_repository` | `readOnlyHint: false, destructiveHint: false` (lib/api/projects.rb:660) | write |
| `list_branches` | none, a GET: `readOnlyHint: true` (lib/api/branches.rb:74) | read |
| `get_repository_file` | `readOnlyHint: true` (repositories/get_repository_file_service.rb:55) | read |
| `list_repository_tree` | `readOnlyHint: true` (repositories/list_repository_tree_service.rb:46) | read |
| `get_commit` | `readOnlyHint: true` (commits/get_commit_service.rb:54) | read |
| `list_commits` | `readOnlyHint: true` (commits/list_commits_service.rb:75) | read |
| `list_releases` | `readOnlyHint: true` (releases/list_releases_service.rb:25) | read |
| `list_tags` | `readOnlyHint: true` (repositories/tags/list_tags_service.rb:25) | read |
| `get_pipeline` | `readOnlyHint: true` (pipelines/get_pipeline_service.rb:19) | read |
| `get_pipeline_jobs` | none, a GET: `readOnlyHint: true` (lib/api/ci/pipelines.rb:198) | read |
| `get_job` | `readOnlyHint: true` (jobs/get_job_service.rb:26) | read |
| `get_artifact_file` | `readOnlyHint: true` (jobs/get_artifact_file_service.rb:35) | read |
| `list_pipelines` | none, a GET: `readOnlyHint: true` (lib/api/ci/pipelines.rb:74) | read |
| `save_pipeline` | `readOnlyHint: false, destructiveHint: true` (pipelines/save_pipeline_service.rb:16) | write |
| `manage_pipeline` | `readOnlyHint: false, destructiveHint: true` (pipelines/pipeline_service.rb:34) | write |
| `get_work_item` | `readOnlyHint: true` (work_items/get_work_item_service.rb:89) | read |
| `get_workitem_notes` | `readOnlyHint: true` (work_items/get_work_item_notes_service.rb:51) | read |
| `link_work_items` | `readOnlyHint: false, destructiveHint: false` (work_items/link_work_items_service.rb:24) | write |
| `get_saved_view_work_items` | `readOnlyHint: true` (work_items/get_saved_view_work_items_service.rb:43) | read |
| `list_vulnerabilities` | `readOnlyHint: true` (ee/…/security/list_vulnerabilities_service.rb:58) | read |
| `get_vulnerability` | `readOnlyHint: true` (ee/…/security/get_vulnerability_service.rb:29) | read |
| `save_vulnerability` | `readOnlyHint: false, destructiveHint: false` (ee/…/security/save_vulnerability_service.rb:77) | write |
| `save_work_item` | `readOnlyHint: false, destructiveHint: false` (work_items/save_work_item_service.rb:24) | write |
| `list_work_items` | `readOnlyHint: true` (work_items/list_work_items_service.rb:113) | read |
| `get_work_item_types` | `readOnlyHint: true` (work_items/get_work_item_types_service.rb:32) | read |
| `list_projects` | `readOnlyHint: true` (projects/list_projects_service.rb:48) | read |
| `list_groups` | `readOnlyHint: true` (groups/list_groups_service.rb:42) | read |
| `search` | `readOnlyHint: true` (search/search_service.rb:16) | read |
| `search_labels` | `readOnlyHint: true` (labels/search_service.rb:38) | read |
| `list_wiki_pages` | `readOnlyHint: true` (wikis/list_wiki_pages_service.rb:11) | read |
| `semantic_search` | `readOnlyHint: true` (ee/…/semantic_search/semantic_search_service.rb:12) | read |
| `attach_scan_profile` | `readOnlyHint: false, destructiveHint: false` (ee/…/security/attach_scan_profile_service.rb:51) | write |

Not verified: what gitlab.com's own server sends today (a `tools/list`
needs a GitLab sign-in this item had none of; gitlab.com may run an older
build than fbca10d4), what a self-managed GitLab of another version sends,
and the route tools GitLab lists for its aggregate ones alone
(`update_merge_request`, `delete_pipeline`, `update_pipeline`,
`gitlab_search_in_*`, `create_duo_workflow`, `resume_duo_workflow`). None of
it changes the reading, which is what the connected server sends.

### 3.6 `lands: pr`

The hub pushes the branch as before, then asks the workspace's machine to
make `{ repo: <origin>, write: pull_request }` through
`CONTROL_FORGE_POST`: the adapter for the origin's host finds the open
pull or merge request from that branch or opens one. On GitLab it is a merge
request, on Gitea a pull request.

## 4. What is deleted

| Gone | Replaced by |
|---|---|
| `landing.ts` `openPullRequest`, `PullRequestOutcome`, `PR_URL`, the `gh pr view`/`gh pr create` commands | the origin's adapter, made on the machine (§3.6) |
| The landing refusal's `pull request` step | the forge's own words on the landing line |
| `repo-publish.ts`'s hand-made `POST /user/repos` | Octokit |
| boundary/ `ghToken`, the executor's `gh-token` copy, `ghConfigOf` (gh's empty config dir), `guardedEnv` and the executor's `posts` read, git's `gh auth git-credential` helper in a workspace's system gitconfig | one environment for every workspace's commands: no forge token, gh through the GitHub door (row 11) |
| connections.ts `githubToken`; the poller's, the relay's, `source-facts`' and `binary-distribution`'s hand-made GitHub `fetch` | Octokit, signed in as the connection or as no one (rows 10, 12 to 14) |
| `forge_post`'s first-forge-in-order match | `forgeOn`: the one forge whose CLI signs in to the host, or a refusal asking for the URL |

## 5. What runs where, and its proof

- `forge_post` (hub `delegation-tools.ts`, granted to delegates and
  workers, `roles.ts`) → `/api/instances/:id/forge-post` → `forge-posts.ts`
  → the session's machine (`CONTROL_FORGE_POST`) → `forges/forge.ts`
  `forgePost`.
