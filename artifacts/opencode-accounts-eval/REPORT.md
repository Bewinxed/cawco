# OpenCode sessions on several accounts of one provider: evaluation

Question: what is the established, least hand-rolled way for one machine to run
OpenCode sessions on several accounts of the same provider, choosing the account
per session and moving a session between accounts?

**Answer: (b) process isolation, i.e. one OpenCode server per account *slot*.**
In OpenCode, the account is a property of the process: the store it reads, and
the one active connection on 2.0. So each slot is its own process with its own
store. OpenCode's own provider code then runs unmodified, and on 1.x a session
moves between accounts through the database every server already shares. The
CawCo account plugin (363 lines that copy OpenCode internals) is deleted.

Everything below was read from source or run on a rig, with fake credentials and
a local mock provider only. Sources: OpenCode `dev` at 3884062 (2026-10-08,
version 1.18.35), OpenCode `v2` at 2f3ba04 (2026-10-09; npm `@opencode/cli`
latest 2.0.26), and CLIProxyAPI `main` at 6746588 (2026-10-09). CawCo runs
OpenCode 1.18.34; the installed binary answers `1.18.34`.

---

## 1. What CawCo does today, and why it drifts

`packages/agent/src/harnesses/opencode-account-plugin.ts` runs every request of
a provider CawCo serves inside one OpenCode server. It works like this:

- `chat.headers` stamps each request with its session id.
- One `auth` loader per provider returns `{ apiKey: "cawco-account", fetch }`.
  `syncOpencodeMarkers` keeps a marker entry in the user's own
  `~/.local/share/opencode/auth.json`, so that OpenCode runs those loaders at all.
- The fetch reads `opencode-accounts-<hub>.json` (session → account), loads the
  account's `credential.json`, asks the agent to refresh it near expiry, and then
  re-does what OpenCode's own plugin for that provider would do:
  - ChatGPT: a port of `plugin/openai/codex.ts` 350-435 (URL rewrite to
    `chatgpt.com/backend-api/codex/responses`, `ChatGPT-Account-Id`, residency
    header).
  - Copilot: a port of `copilot.ts` and `models.ts` (vision/initiator detection,
    the `/models` decoder, `build`, `usable`, the small-model choice).
  - xAI: its `User-Agent`.
  - Every other key: the key goes wherever the marker landed.
- The same fetch watches for usage-limit refusals (`noteLimit` → `POST
  /opencode/limit`).

**Why it cannot simply call OpenCode's own code instead (option (a)):**

- OpenCode's own provider plugins are compiled into the binary as internal
  plugins (`plugin/index.ts` 67-86, run first at 170-179). An external plugin
  receives only `PluginInput` (`client`, `project`, `directory`, `worktree`,
  `serverUrl`, `$`; `packages/plugin/src/index.ts` 56-66) and has no handle on
  other plugins' hooks.
- Each loader is handed `toPublicInfo(database[provider])` (`provider.ts` 1670-1673).
  That is the catalog entry, not the options an earlier loader produced. Its
  result is `mergeDeep`-ed in (1675-1677), so a later `fetch` *replaces*
  Codex's `fetch`. It cannot wrap it.
- The loader's `getAuth()` is `auth.get(providerID)` over one process-wide store
  (`auth/index.ts` 58-67: `OPENCODE_AUTH_CONTENT` or `<data>/auth.json`). It
  cannot return two accounts' credentials at the same moment.

So inside one server, per-session accounts require re-implementing each
provider's request logic. That logic changes in OpenCode's own releases:

- 1.18.19 "Forward ChatGPT workspace compute residency to Codex requests". CawCo
  had to port it by hand: the plugin's `extractResidency` block.
- 1.18.17 "Enabled PDF attachments for GitHub Copilot models…". This lives in
  `models.ts`, which CawCo copied.
- On `dev` today, Codex's loader sends `/responses` over a WebSocket pool when
  `experimentalWebSockets` is set. That flag is on by default in pre-release
  channels ("Temporary rollout: pre-release builds use WebSockets by default",
  `plugin/index.ts` 69-73; `codex.ts` 332-338, 434). CawCo's port has no
  WebSocket path. The day this ships on by default, CawCo sessions silently
  diverge.

Changelog source: https://opencode.ai/changelog ("v1.18.19 … Forward ChatGPT
workspace compute residency to Codex requests").

---

## 2. Options

### (a) Keep the plugin, delegating to OpenCode's own code

| | |
|---|---|
| Reimplements | Codex fetch, Copilot fetch, Copilot model listing (`models.ts` 4-259), xAI headers, SDK key placement per provider. |
| Breaks when | Any OpenCode release touches those files. Nothing fails loudly; requests just differ from OpenCode's (see the WebSocket case above). It also cannot serve the `OPENCODE_UNSERVED` providers (Azure, Cloudflare, Vertex, GitLab, Snowflake, DigitalOcean), whose credential reaches the request through server-wide options. |
| User setup | None. |
| Delegation possible? | **No.** There is no extension point for it on 1.x (see §1). The loader contract hands one `getAuth` per provider per process. |
| Prototype | Not needed: the source settles it. |

### (b) One OpenCode server per account slot (recommended)

A *slot* is one server process with its own `XDG_DATA_HOME`, i.e. its own
`auth.json`. Slot *k* holds the *k*-th CawCo account of each provider on the
machine, so the server count is the largest number of accounts of any one
provider (usually 1-2), not the total number of accounts.

**OpenCode seams it relies on:**

- **`auth.json` per data dir.** It sits at `Global.Path.data/auth.json`, where
  `data = xdgData/opencode` (`auth/index.ts` 10, `core/src/global.ts` 10). It is
  the file `opencode auth login` writes, through `Auth.set`.
- **`OPENCODE_DB` (absolute path).** One shared database:
  `if (Flag.OPENCODE_DB) { if (… isAbsolute(Flag.OPENCODE_DB)) return
  Flag.OPENCODE_DB` (`core/src/database/database.ts` 44-46).
  - OpenCode itself opens it with `journal_mode = WAL` and `busy_timeout = 5000`.
  - Several processes on one database is OpenCode's normal case: every
    `opencode` TUI runs its own server on the default database.
- **Plugin loaders re-read the store on every request.**
  - Codex: `const currentAuth = await getAuth()` inside `fetch` (`codex.ts` 363).
  - Copilot: `copilot.ts` 103.
  - xAI: `xai.ts` 225.
  - `Auth.all()` reads the file on every call (`auth/index.ts` 58-67). So the
    agent can write a freshly refreshed token into a slot's `auth.json` and
    the next request uses it, through OpenCode's own fetch.

**Rig results** (`rig/per-account-servers.sh`; output in `rig/run-plain.txt`
and `rig/run-probe.txt`). Two `opencode serve` 1.18.34 processes, A and B: own
`XDG_DATA_HOME`s holding `fake-key-A` and `fake-key-B`, one `OPENCODE_DB`, and a
mock OpenAI-compatible endpoint that logs `Authorization`.

```
server A (pid 1487) healthy after 1.056683 s, idle RSS 371 MiB
server B (pid 1507) healthy after 1.015872 s, idle RSS 369 MiB
turn 1 on A: answered with Bearer fake-key-A
B sees 2 messages before its turn
turn 2 on B: answered with Bearer fake-key-B
A sees 4 messages after B's turn
turn 3 back on A: answered with Bearer fake-key-A
-- auth.json rewritten under live server A (fake-key-A2):
turn 4 on A: answered with Bearer fake-key-A
/v1/chat/completions Bearer fake-key-A probe=fake-key-A2          ← loader getAuth() saw the new file
turn 5 on A after dispose: answered with Bearer fake-key-A2
first retry status event: {"type":"session.status",…"status":{"type":"retry","attempt":1,"message":"The usage limit has been reached",…}}
server A RSS after turns: 837 MiB / server B: 551 MiB (other runs: 685-965 / 550-780)
snapshot gitdirs (shared): 1
```

What the rig established:

1. **A session moves between accounts by sending its next turn to the other
   slot's server.** No export or import is needed, and history is intact both
   ways (A→B→A).
2. **A plugin loader's `getAuth()` returns the `auth.json` written moments
   earlier** (`probe=fake-key-A2`). This is the path Codex, Copilot and xAI use
   for OAuth. A plain API key (`type: "api"`) is read once into
   `provider.key` (`provider.ts` 1647-1656). A changed key takes effect after
   `POST /instance/dispose`, which returned 200 here, or after a slot restart.
3. **Undo history follows the session** once each slot's
   `<data>/opencode/snapshot` is a symlink to the shared snapshot dir.
   Snapshot gitdirs are `Global.Path.data/snapshot/<project>/<hash>`
   (`snapshot/index.ts` 71). Locking is per process (a semaphore, 55-62), the
   same as two upstream TUIs in one directory.
4. **Usage-limit refusals reach CawCo without a fetch wrapper.** OpenCode
   publishes the retry status with the provider's message:
   `"The usage limit has been reached"`. `PROVIDER_LIMIT`
   (`/usage_limit_reached|usage limit|…/i`, core `accounts.ts` 657) matches
   it. `opencode.ts` already handles `status.type === "retry"` (2988-3009).
5. **Cost:** about 1 s to healthy, about 370 MiB idle and 0.55-0.97 GiB after
   turns per server. That is per *extra* slot, only while a session runs on it.

| | |
|---|---|
| Reimplements | Nothing of OpenCode's provider code. CawCo writes OpenCode's documented `auth.json` shape and launches more processes of what it already launches. |
| Breaks when | (1) OpenCode moves credentials out of `auth.json`. That is 2.0 (see (d)), and CawCo's plugin must be rewritten for 2.0 anyway ("developers warn that v1 plugins are unsupported", https://aicrier.com/post/97ny47e0vp9alp2z5ofl). (2) A loader caches `getAuth()` instead of reading per request. That fails loudly: OpenCode then tries to refresh with the marker refresh token and the request errors. It does not silently diverge. |
| User setup | None. CawCo starts and retires slot servers. |
| Unlocks | Every `OPENCODE_UNSERVED` reason reads "the X is the server's". With a server per slot, that is per account. |
| Prototype | Done (above). |

**Who refreshes.** pi-ai stays the only refresher of every grant, as it is
today. The agent writes the access token, with `refresh` set to the marker for
rotating grants, into the slot's `auth.json` before expiry.

- OpenCode's Codex fetch refreshes only when `currentAuth.expires < Date.now()`
  (`codex.ts` 369), so it never refreshes a grant the agent keeps fresh. Giving
  OpenCode the real refresh token would put two refreshers on one rotating
  grant.
- Copilot's `refresh` is the GitHub token, which is the bearer
  (`copilot.ts` 164). It does not rotate, so it is written as is.

### (c) A multi-account proxy (CLIProxyAPI)

- **Pinning an account per request.**
  - There is no inbound header for it. `WithPinnedAuthID` is set only from
    `ModelExecutionRequest.AuthID`, i.e. internal plugin-host model execution
    (`sdk/api/handlers/model_execution.go` 117-118, 154-155).
  - `routing.session-affinity` sticks a session to an account the *proxy*
    chooses ("Automatic failover is always enabled when bound auth becomes
    unavailable", `internal/config/config_types.go` 357-362).
  - The only caller-chosen route is a per-credential model prefix plus
    `force-model-prefix` ("requires explicit model prefixes (e.g.,
    "teamA/gemini-3-pro-preview") to target prefixed credentials",
    `internal/config/sdk_config.go` 48-51; `Prefix` on the auth record,
    `sdk/cliproxy/auth/types.go` 61-62).
  - So OpenCode would run a custom `cliproxy` provider with model ids like
    `acct2/gpt-5.5`. That gives up OpenCode's own `openai` and
    `github-copilot` handling: Codex model filtering, Copilot model listing,
    title models, variants. Moving a session means changing its model id.
- **Refresh.** It refreshes grants itself (`sdk/cliproxy/auth/auto_refresh_loop.go`).
  With pi-ai also holding the same grant, that is two refreshers on a rotating
  refresh token. pi would have to move behind the proxy too.
- **Coverage.** Executors exist for Codex, Claude, Gemini/Antigravity, Grok,
  Kimi, Devin and Meta (`sdk/auth/`). There is **no GitHub Copilot**, which
  CawCo serves today.
- **Reimplements.** All of it, one layer down: CLIProxyAPI is itself a
  re-implementation of each vendor's client protocol, and it impersonates CLIs
  (`claude_executor_cloaking.go`). It is maintained by others (50k stars), but
  it is exactly the "copy the client" pattern, with a protocol translator added.
- **User setup.** Someone without it would get a Go binary that CawCo
  downloads, configures (auth files, prefixes, `force-model-prefix`) and
  supervises on every machine. The owner's earlier point ("for pi u need to
  think of what happens when people don't have cliproxy set up like right now")
  makes this a hard cost, not an option.

Rejected. A user's own CLIProxyAPI (like the owner's at `localhost:8317`) stays
usable the way it is today: as a plain custom provider with its own key.

### (d) Upstream

- **1.x:** nothing landed.
  - #5391 "multiple auth profiles per provider" is open, assigned to jlongster.
    A maintainer: "you can only have 1 profile at a time"
    (https://github.com/anomalyco/opencode/issues/5391).
  - The PRs that tried it (#8590, #9069, #11832: rotation pools,
    AsyncLocalStorage per request) are not in `dev`: `auth/index.ts` there
    holds one record per provider, and #8590 is closed.
- **2.0 (released: `@opencode/cli` 2.0.26; source on the `v2` branch):**
  - Several stored credentials per integration, with one **global** `active`
    flag: `Credential.create` "becomes the integration's selection unless
    `activate` is false"; `activate(id)` "Selects a stored credential for its
    integration" (`core/src/credential.ts` 44-56).
  - Switching reloads the provider for the whole server
    (`chatgpt.ts` 356-360, `Credential.Event.Switched`). The catalog refuses to
    mix accounts: "Never combine the previous account's discovered
    endpoints/models with a new connection" (`core/src/provider.ts` 406).
  - The session schema rules it out explicitly: "Exact producing
    model/deployment and route identity, never credentials or a connection ID"
    (`schema/src/session-provider-context.ts` 6).
  - Credentials move into the database (`credential` table), not `auth.json`.

  So upstream's 2.0 design is "one account per server at a time", which is
  option (b)'s premise. Per-session accounts would run against 2.0's catalog
  design, so no upstream change is worth waiting for.

  On 2.0, (b) carries over: each slot server gets its own database, and the
  agent sets the slot's credential through 2.0's credential API
  (`protocol/src/groups/credential.ts`) instead of a file. A session then moves
  with `session export` / `session import`
  (`cli/src/commands/handlers/session/{export,import}.ts`) instead of a shared
  database. That belongs to the 2.0 migration, not this one.

---

## 3. Recommendation and migration plan (cutover, no shims)

### Design

1. **Slots.**
   - Each CawCo account on the machine gets a stable slot number: the lowest
     slot free for its provider, recorded with the account (for example a
     `slot` field beside `credential.json`).
   - Slot 0 is the user's own default data dir, so that providers CawCo does not
     serve, such as the user's own OpenCode sign-ins, keep working there,
     refreshed by OpenCode as today.
   - Slot *k* ≥ 1 is `~/.cawco/opencode-slots/<k>/` as `XDG_DATA_HOME`. Like
     `sessionIdentityDir`, it is hidden from every workspace boundary.
2. **Launch.**
   - `serverSpec` (opencode.ts 426) gains `XDG_DATA_HOME` for slots ≥ 1, plus
     `OPENCODE_DB=<the user's existing opencode.db path>` for every slot. That
     path is `Global.Path.data/opencode.db` for the release channel, so
     session history needs no migration.
   - Each slot ≥ 1 data dir gets `snapshot` → the default data dir's
     `snapshot`.
   - `OpencodeServerOwner` is keyed by slot. It already models several live
     generations, and sessions are already bound to one
     (`existing?.identity ?? this.#serverOwner.active`, opencode.ts 6428).
     Slot servers start on first use and are retired when idle through the
     existing `#retire`.
3. **Credentials.**
   - The agent writes each slot's `auth.json` entries from the accounts in that
     slot, using OpenCode's own shapes:
     - ChatGPT: `openai: {type:"oauth", access, refresh:<marker>, expires,
       accountId}`.
     - Copilot: `github-copilot: {type:"oauth", refresh:<GitHub token>, access,
       expires, enterpriseUrl}`.
     - xAI: `{type:"oauth", access, refresh:<marker>, expires}`.
     - Keys: `{type:"api", key}`.
   - It refreshes through pi-ai (`freshen`) ahead of expiry and rewrites the
     entry.
   - A changed API key is applied with `POST /instance/dispose` per directory
     once that directory's sessions on the slot are idle.
4. **Per session.**
   - A session runs on the slot of its account.
   - Moving accounts means the turn ends (or is idle) on the old slot and the
     next prompt goes to the new slot's server URL. The `/event` stream is
     followed on that server.
   - One session never runs on two slots at once.
5. **Usage limits.**
   - Detected from the retry status the agent already reads (opencode.ts
     2993): `status.type === "retry" && PROVIDER_LIMIT.test(status.message)`
     ends the turn the way `limitSink` does now (`POST
     /session/:id/abort`).

### Deleted in the same change

- `packages/agent/src/harnesses/opencode-account-plugin.ts`: the whole file
  (Codex/Copilot/xAI ports, `noteLimit`, `CawcoAccountStamp`).
- In `buildHandoffPluginSource` (opencode.ts 872-891): the `served` parameter;
  the `cawcoAccountsOfSessions`, `cawcoAccountsRoot`, `cawcoGateway` and
  `cawcoServed` constants; the `CawcoAccount<n>` and `CawcoCopilot` exports;
  and the doc block at 854-870.
- `provider-accounts.ts`:
  - `OPENCODE_MARKER`'s role as an SDK key placeholder (it survives only as the
    refresh-token marker).
  - `opencodeMarker`, `servedOpencode`, `servedOpencodeProviders`,
    `syncOpencodeMarkers`, `opencodeAccountsFile`, `noteOpencodeAccount`
    (929-1035).
  - `moveHomeCredential` stops writing a marker back into the user's store
    (866-868): the moved entry is deleted.
- `mcp-oauth.ts`: `setOpencodeLimitSink`, `limitRoute` and the
  `/opencode/limit` branch of `accountRoute`. `/accounts/<id>/fresh` stays
  because pi uses it (`pi-accounts.ts` 84).
- `daemon.ts`: the `setOpencodeLimitSink(…)` and `syncOpencodeMarkers()` wiring
  (1633-1636).
- opencode.ts: `noteOpencodeAccount(...)` at 6626, and the marker sync before
  the plugin build (5480, 5502).
- `@cawco/core` `OPENCODE_UNSERVED` and its checks (`accounts.ts` 688-790;
  `provider-accounts.ts` 703, 960). Every reason in it is "the X is the
  server's", which a slot makes per account. The account store already carries
  what those providers need:
  - pi-ai 1.0.1's `OAuthCredential` takes open fields (`[key: string]:
    unknown`, `dist/auth/types.d.ts` 21-30). This is where `accountId`,
    `enterpriseUrl` and a sign-in's `metadata` ride into the slot's
    `auth.json`.
  - `ApiKeyCredential` has `env?: ProviderEnv` ("Provider-scoped environment
    overrides", `types.d.ts` 15-19, `dist/types.d.ts` 47-48). These go into
    the slot server's environment, which OpenCode reads for Azure
    (`AZURE_RESOURCE_NAME`), Cloudflare (`CLOUDFLARE_ACCOUNT_ID`,
    `CLOUDFLARE_GATEWAY_ID`, provider.ts 781-839) and SAP
    (`AICORE_SERVICE_KEY`, 623).
  - Two accounts of one provider are never in the same slot, so these
    server-wide values never clash.
  - The build checks each such provider's env names against provider.ts as it
    adds its sign-in.
- The user's `~/.local/share/opencode/auth.json` no longer holds `cawco-account`
  markers for slot ≥ 1 accounts. Slot 0's entries are the account's real
  (agent-refreshed) access tokens in place of today's markers.

### Verification (no unit tests)

- `bun run typecheck`, lint and build in `packages/agent` and `packages/core`.
- `grep -rn "OPENCODE_ACCOUNT_PLUGIN\|syncOpencodeMarkers\|noteOpencodeAccount\|/opencode/limit\|OPENCODE_UNSERVED" packages`
  → no matches.
- Live, once each on the deployed agent, with two real ChatGPT accounts of the
  owner's (the only step that touches real credentials): the four checks in
  §5.
- Rig regression: `artifacts/opencode-accounts-eval/rig/per-account-servers.sh`
  (`PROBE=1` for the loader check) reruns in about 15 s against any OpenCode
  version, to recheck the seams after an OpenCode upgrade.

---

## 4. Rig

`artifacts/opencode-accounts-eval/rig/`:

- `mock-provider.ts`: an OpenAI-compatible mock on a free port. It answers
  with the bearer it got and logs `Authorization` (and `x-probe-key`). A key
  containing `limited` gets ChatGPT's 429 `usage_limit_reached` body.
- `probe-plugin.js`: an auth loader whose fetch stamps `getAuth()`'s key on
  each request.
- `per-account-servers.sh`: two slot servers, a shared DB and snapshot dir; a
  session moved A→B→A; a live `auth.json` rewrite; instance dispose; the
  usage-limit retry event; RSS. Run with `./per-account-servers.sh` or
  `PROBE=1 ./per-account-servers.sh`. Everything lives in `/tmp/oc-rig`.
- `run-plain.txt` and `run-probe.txt`: the outputs quoted above.

---

## 5. The build: one OpenCode server per account

Built on `origin/main` at 1be8b64f, uncommitted in this clone. Invariant: CawCo
copies no OpenCode provider code. The account a session runs on is the server
it runs in, and that server's OpenCode runs its own auth, Codex, Copilot and xAI
code unmodified.

### What changed, by file

- **`harnesses/opencode-account-plugin.ts`: deleted** (363 lines).
- **`harnesses/opencode.ts`**
  - `ServerSlot`: one per server, the machine's (`#machine`) and one per
    account (`#accounts`), each with its own `OpencodeServerOwner`, client and
    `ready` promise. Every place that read "the" server now reads the session's
    slot or every slot: custody, migration, idle handoff, busy reporting, the
    event pump, abort, recovery, `hubRestarted`, `syncFleet` and `dispose`.
  - `accountServerSpec`: the machine's launch, plus:
    - `XDG_DATA_HOME` set to the account's data dir, so OpenCode's own
      `auth.json` there holds that account alone;
    - `OPENCODE_DB` set to the machine's database, the path `opencode db path`
      prints, so every server shares one history;
    - the key's provider `env` (below);
    - `CAWCO_XDG_DATA_HOME`, the machine's own data dir. The bridge plugin
      gives it back to everything the server starts (shells, MCP servers,
      LSPs), so they keep reading the user's data where they always have;
    - `CAWCO_ACCOUNT_CREDENTIAL`, a fingerprint of what OpenCode reads only
      at start.
  - `prepareAccountServer`: writes the account's store and links the
    account's `snapshot` dir to the machine's, so undo follows a session to
    any server.
  - `#ensureAccount` starts an account's server on demand. `#open`,
    `#dispatch` and recovery choose the session's slot; a session at rest
    opens in its account's server.
  - Idle stop: `#retireIdleAccounts` runs on the config watcher's tick. It
    retires an account's server once no session or subagent has been on it
    for `ACCOUNT_SERVER_IDLE_MS` = **5 minutes**. The server is then ended
    through the existing `#retire` once it reports nothing running.
    - Why 5 minutes: a session at rest stays attached for 30 minutes before it
      sleeps (`IDLE_SLEEP_MS`), so a server only becomes free once its
      sessions slept, ended or moved away.
    - Five more minutes covers a session woken or moved straight back; past
      that, the server's 0.7-0.8 GiB is held for nobody (measurements below).
  - `#convergeAccounts`: a running account's server whose config, binary or
    launch (the credential fingerprint, the provider env) no longer matches is
    replaced the way the machine's is: a verified candidate, with sessions
    handed over as they come to rest.
  - Usage limits: in the retry-status handler, a session on an account whose
    retry message matches `PROVIDER_LIMIT` calls `refuseAtLimit`. There is no
    fetch wrapper.
  - The model catalog: the machine's server lists its own providers. For each
    provider an account here is of, an account's server lists that provider's
    models (OpenCode's own code shapes the list: ChatGPT's models for a ChatGPT
    sign-in). The lists are kept in `cawco-account-catalogs.json`.
  - `buildHandoffPluginSource()` takes no `served` list. Every account-plugin
    constant and export is gone; it keeps the handoff tools and the session
    credential stamping.
- **`harnesses/opencode-server.ts`**
  - `OpencodeServerOwner` takes an optional account. Its record file is
    `opencode-server-<keeper>-account-<id>.json` and its proc id is
    `opencode-server-account-<id>-<uuid>`.
  - `recordedAccounts()` lets a restarted agent adopt account servers an
    earlier agent left running.
  - `retireActive()` handles the idle stop.
- **`provider-accounts.ts`**
  - Every write of an account's credential (sign-in, key, pi-ai refresh,
    sign-out) also writes the account's OpenCode store, in `writeHeld`. A
    removed account takes its OpenCode data dir with it.
  - `opencodeAuthOf` writes OpenCode's own `Auth.Info` shapes:
    - ChatGPT and xAI: the access token, its expiry and (ChatGPT) the
      `accountId`, with **`refresh: "cawco-account"`**, so OpenCode never
      refreshes a rotating grant. pi-ai's `freshen` (15 minutes ahead)
      rewrites the token long before OpenCode's own 2-minute skew would try.
    - Copilot: the GitHub token as both refresh and access, as Copilot's own
      sign-in stores it.
    - Keys: the key plus its `metadata`. OpenCode reads Azure's
      `resourceName`, Cloudflare's `accountId`/`gatewayId` and Snowflake's
      `account` from there (provider.ts 287, 781, 818-820, 961).
  - `opencodeAccountEnv` returns a key's pi-ai `env` ("provider-scoped
    environment/config values such as Cloudflare account/gateway ids",
    pi-ai 1.0.1 `dist/auth/types.d.ts`). It goes into the account server's
    environment, which is the only place OpenCode reads Vertex's project and
    location, Bedrock's region and SAP's deployment (provider.ts 343-369,
    550-598, 620-629).
  - `moveHomeCredential` deletes the moved entry from the user's store; it no
    longer writes a marker back.
  - `dropOpencodeMarkers` runs once at daemon start-up. It removes the
    `cawco-account` entries the old design left in the user's OpenCode
    `auth.json`. Without that, the machine's server would send `cawco-account`
    as a key. It also removes the old session→account file.
  - Deleted: `opencodeMarker`, `servedOpencode`, `servedOpencodeProviders`,
    `syncOpencodeMarkers`, `opencodeAccountsFile`, `noteOpencodeAccount`.
- **`mcp-oauth.ts`**: `setOpencodeLimitSink`, `limitRoute` and the
  `/opencode/limit` branch are deleted. `/accounts/<id>/fresh` stays for pi.
- **`daemon.ts`**: the limit sink and marker-sync wiring are deleted; the
  start-up cleanup is called instead.
- **`core/accounts.ts`**: `OPENCODE_UNSERVED` and its three checks are
  deleted. Every reason in it was "the X is the server's", and each account
  now has its own server.
- **`core/index.ts`**: the `SpawnPayload.accountDir` doc is updated, and the
  generated `apps/apple/.../openapi.json` regenerated from it
  (`bun run --filter @cawco/hub openapi`).
- **`scripts/probe-opencode-accounts.ts`** (new): the proof rig below.

Two places where the build departs from §3's plan:

- **One server per account, not numbered slots.** The brief's invariant is
  "each account … has its own OpenCode server", and keying by account id needs
  no slot allocation to keep in step with the accounts.
- **A changed key replaces the account's server at rest, not
  `/instance/dispose`.** The fingerprint in the launch env makes this the same
  verified replace-and-hand-over a config change already uses, rather than a
  second mechanism.

### Proof (fake credentials, mock provider, real `opencode` 1.18.34)

`bun scripts/probe-opencode-accounts.ts` runs the real agent harness, the
real `OpencodeServerOwner`, a private sessiond, pi-ai's real xAI refresh (its
token endpoint answered in-process), and a mock that speaks Chat Completions
and the Responses API. xAI requests go through OpenCode's own `@ai-sdk/xai`
and its own xAI sign-in plugin. Output: `run-probe.txt`. Result: **9/9 checks
passed**.

| Check | Evidence from the run |
|---|---|
| A → B → A: each server sends its own account's credential | `turn-1 on A → Bearer xai-A1`, `(tool result) → Bearer xai-A1`, `turn-2 on A → Bearer xai-A1`, `turn-3 on B → Bearer xai-B1`, `turn-4 back on A → Bearer xai-A1` |
| History kept on a move | B reads back 3 user entries |
| Undo kept on a move | a file written by a tool on A (`writtenOnA: true`) is reverted from B (`afterRevertOnB: false`) |
| A's store holds a marker, not the refresh token | `{"type":"oauth","access":"xai-A1","refresh":"cawco-account",…}` |
| A pi-ai refresh reaches A's server on its next request | `freshen("acct-a")` → next turn `Bearer xai-A2`, no server restart |
| A 429 on an account ends the turn | `errors: ["The usage limit has been reached"]` in 0.7 s, matched by `providerLimitRefused` |
| …and the session carries on on another account | moved as the hub's at-limit move does: `Bearer key-M`, **3.1 s** from the 429 to the answer |
| A model on no account runs on the machine's server | `Bearer machine-key` |
| Account servers stop when idle; the machine's keeps running | four account servers retired 5.1 min after their last session; only the machine's left |

Measured in the same run:

- First open on a cold machine (the machine's server plus account A's): 13.3 s.
- A move onto an account server started for it: **2.0 s**.
- RSS: the machine's server 407 MiB. An account server holding one session:
  775 MiB after start, 827 MiB after turns; a second account's 690 MiB. These
  are higher than §2(b)'s 370 MiB because §2 measured an idle server with no
  session.

One cold-cache rig run (the first after `bun install`) failed before any server
answered, with a bare `TimeoutError`. It happened while the machine's own server
was starting, on a code path this change doesn't touch, and it hasn't recurred
in four runs since. The probe now keeps its sandbox on failure, so a recurrence
can be read.

Checks run on the change: `bun run typecheck` at the root (every package,
`openapi:check`, `roles:check`, `a2ui:check`, `tools:check`, the binary
tsconfig): green. `bunx biome check packages/agent/src packages/core/src
scripts/probe-opencode-accounts.ts`: clean. And this grep returns nothing
outside this report:
`grep -rn "OPENCODE_UNSERVED\|syncOpencodeMarkers\|servedOpencodeProviders\|noteOpencodeAccount\|opencodeAccountsFile\|setOpencodeLimitSink\|opencode/limit\|OPENCODE_ACCOUNT_PLUGIN\|opencode-account-plugin\|limitRefused("`.

### Four live checks for the owner, after deploy (two real ChatGPT accounts)

1. **A session runs on its own account.** Start an OpenCode session on ChatGPT
   account 1 and send one prompt. Expect an answer, account 1's usage reading
   to move and account 2's to stay put. The agent log shows
   `[opencode] account <id1>: its server is opencode-server-account-<id1>-…`,
   and `~/.local/share/opencode/auth.json` holds no `cawco-account` entry.
2. **A move keeps history and undo.** In that session, have it edit a file,
   then move the session to account 2 and send a prompt that refers to the
   earlier turn. Expect an answer that knows the history, and account 2's
   reading to move. Then rewind the session to before the edit turn; the file
   change reverts (OpenCode's own undo history, kept across the move).
3. **A session from before the deploy.** One that was running on an account
   before the deploy keeps answering. Expect its next turn to start that
   account's server, and its earlier history to be there.
4. **Idle stop.** Once every session on account 2 has slept, ended or moved,
   expect the agent log to show `account <id2>: no session on its server for
   5 minutes` and then `retired opencode-server-account-<id2>-…: exit
   confirmed` within about a minute of each other (the watcher's tick).

---

## 6. Separate plan: porting CawCo's OpenCode harness to 2.0

Not part of this change, and OpenCode stays on 1.18.34. Sources: the `v2`
branch at 2f3ba04 (2026-10-09), npm `@opencode/cli` 2.0.26.

1. **The plugin.** 2.0 has a new plugin API (`@opencode/plugin`:
   `Plugin.define({ id, setup })` with domain hooks such as
   `ctx.tool.transform` and `ctx.integration.transform`;
   `packages/plugin/README.md`). "Developers warn that v1 plugins are
   unsupported" (https://aicrier.com/post/97ny47e0vp9alp2z5ofl). CawCo's
   bridge plugin (handoff tools, session credential stamping, the
   `XDG_DATA_HOME` give-back) is rewritten against it, and the
   `@opencode-ai/plugin` import goes.
2. **Credentials live in the database.** 2.0 stores them in the `credential`
   table, several per integration, with one `active`
   (`core/src/credential.ts` 44-56).
   - The agent writes a sign-in once through `POST /api/credential`
     (`protocol/src/groups/credential.ts` 19-21).
   - The HTTP `PATCH` changes only a `label` (`credential.ts` 33-36), so a
     refreshed token can't be written over HTTP. Instead, CawCo's 2.0 plugin
     replaces the integration's OAuth `refresh` with one that asks the agent
     (`POST /accounts/<id>/fresh`, the route pi uses) and returns pi-ai's
     fresh token. The seam is `IntegrationOAuthMethodRegistration.refresh`
     (`plugin/src/promise/integration.ts` 64-70). pi-ai stays the only
     refresher, and the marker refresh token goes away.
   - `opencodeAuthOf` / `writeOpencodeAuth` are deleted with the `auth.json`
     write.
3. **A database per account server.** The active credential is global to a
   database, so account servers can no longer share one.
   - Each server gets its own `XDG_DATA_HOME` and the default database there
     (`cli/src/database-path.ts`: `OPENCODE_DB` or `<data>/opencode.db`;
     `util/src/global-roots.ts` 5).
   - `opencodeDatabase()` and the `OPENCODE_DB` override are deleted.
4. **Moves by export and import.** A move at a turn boundary becomes:
   - `client.session.export({ sessionID })` on the old server, as
     `cli/.../session/export.ts` 74 does;
   - then `POST /api/experimental/session/import` on the new server
     (`import.ts` 41-50).
   - Import answers **409 when the session already exists**, so a move back
     to an account first deletes the copy that account's database still
     holds. Every move deletes the session from the old database once the
     import succeeds, so exactly one database holds it.
   - The endpoint is marked experimental: pin the 2.0 version and recheck it
     on each upgrade.
   - The shared snapshot dir carries over unchanged.
5. **Events and the catalog.** The event pump, the session status reads and
   `opencodeCatalog` move to the 2.0 client (`@opencode/client`). Each
   account's server lists its provider's models as now.
6. **Proof** is this rig ported to 2.0: the same checks, with "history kept on
   a move" now meaning export, import and delete.
