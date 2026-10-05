# CawCo standalone binary spike

## Verdict

**No, all of today's CawCo cannot run unchanged, with all its features, on a machine with no Bun, Node or Git. Yes, the actual control plane can run from one compiled executable:** the CLI, hub, real embedded SvelteKit dashboard, websocket relay, agent registration and sessiond passed in stock Ubuntu 24.04 with only ca-certificates added and no Bun, Node or Git installed. The linux-x64 executable is **156,542,432 bytes (149.3 MiB)**. This is a viable foundation for a binary release, not a complete production cutover.

The proof substitutes credential-free harnesses, relocates migrations, substitutes build metadata, bypasses the CLI's source/package layout assumption and excludes the browser launcher. It does not prove Claude/OpenCode/pi turns, workflow execution, delegated Git workspaces, service installation, socket activation, updater/rollback or macOS. A single distributed executable can extract embedded native child executables/resources into its own versioned cache. It will still run several processes; sessiond must retain custody independently of the agent.

One important correction to the brief: the locked Claude SDK is **0.3.289**, which ships a **native platform CLI**, not the older JavaScript CLI needing Node. Its own published README explicitly supports Bun compilation with an embedded file, extraction, and `pathToClaudeCodeExecutable`. This substantially reduces the Claude packaging work; it does not fix CawCo's existing runtime resolver automatically.

Audited/tested source baseline: `364db9da72936a6418871525b57122900cd42c1b`. Main advanced during this item; the spike changes only `.context/binary/`. The existing tag-triggered npm workflow and registry updater already represent some release work in the baseline; they are not yet standalone binaries. No product source, live installer, site or poller is modified by this spike.

## Blockers

Line numbers below refer to the audited baseline. Compilation failures are distinguished from features absent from the credential-free proof.

1. **CLI startup assumes a real source/npm tree, even for `--version`.** `packages/cli/src/service.ts:195-247` walks package manifests and calls `realpathSync(Bun.main)`. In a compiled app, `Bun.main` is a virtual bundled entry, not an executable path. Actual failure: `ENOENT: no such file or directory, lstat '/$bunfs/root/cawco'`. Introduce one standalone layout based on `process.execPath`; commands become `[execPath, "hub"|"up"|"sessiond"]`, not `[bun, script, verb]`. Do not perform source-layout discovery at module initialization. The spike overrides `HERE` only and refuses service/deploy/update verbs.

2. **Dashboard production server requires Node and inherited sockets.** `apps/dashboard/serve.js:18-24,40,56-65,190,348-430`; `packages/cli/src/service.ts:87-93,176-192,629-665`. It imports adapter-node output/assets from disk, depends on socket-activation and serves only on an inherited fd. The spike bundles the real generated SvelteKit server and client files, directly binds a Bun listener and relays `/ws/dashboard`; both HTML and a websocket frame passed. Production needs the full preview HTTP/websocket/Referer routing, public-origin/CSRF handling, running-version route, MIME/cache semantics and drain behavior ported together. **Socket activation remains unproven**: existing code records Bun's inherited-fd failure. Keep the protection against refused connections during restarts by proving a Bun/native fd handoff or designing a stable listener; do not quietly discard it. The spike's direct binding is a proof seam, not an authorized production replacement.

3. **Migrations are sibling disk files.** `packages/hub/src/db/index.ts:118-126,1205` expects `./drizzle`. Bundle the journal and SQL tree and give the migrator an embedded/readable location or materialize a versioned read-only cache. The spike embeds all migration files and extracts them under scratch HOME; real migrations and the persistent SQLite hub worked. `bun:sqlite` is built into Bun, not an extra installed runtime/addon.

4. **Build identity reads manifests and shells out to Git.** `packages/agent/src/build.ts:11-46`; `packages/hub/src/build.ts:13-33`; `packages/hub/src/config.ts:4`; `packages/cli/src/cli.ts:36-38`. Agent startup needs a package.json next to the bundle. Inject one version, full commit, protocol and build metadata at release time into hub/agent/CLI. The proof replaces both build readers. Its `/health` still says `version:0.1.0` outside `build.version:0.1.0-spike`, visibly proving the need to unify version constants.

5. **Claude native executable is discovered through optional packages.** `packages/agent/src/auth.ts:30-60,94`; `packages/agent/src/harnesses/claude.ts:761,1670`; `packages/agent/src/sessiond-client.ts:645-789`. Both query paths must receive the exact extracted native CLI path; the auth probe must use the same path. Bundle the target's `@anthropic-ai/claude-agent-sdk-<platform>-<arch>[/musl]/claude` as a file and use the SDK's extractor (with a loud failure if extraction fails). The SDK README at 0.3.289:23-42 and `extractFromBunfs.js:98-155` document the mechanism. Keep launch through sessiond. No authenticated run was made. Node is not intrinsically needed for this current native CLI.

6. **OpenCode is an independently installed executable/server.** `packages/agent/src/harnesses/opencode.ts:479-609,4115,4469`; `packages/agent/src/harnesses/opencode-server.ts:197-220,240-285`. CawCo resolves `opencode` and starts `opencode serve` under sessiond with generation ownership and a loopback port. The SDK is only a client. Embed/extract a pinned target OpenCode executable or declare OpenCode a separately managed optional harness. Preserve generation-specific custody/idle replacement. Its configured plugins can themselves require runtimes/packages. The stub proof does not establish these can be absorbed into one CawCo binary.

7. **pi is a separately spawned JS host plus runtime assets.** `packages/agent/src/harnesses/pi-sessiond.ts:249-266` runs `[process.execPath, sibling pi-host.js]`; `pi-host.ts:5,102-143` loads pi's SDK. In standalone mode that execPath runs CawCo's own entrypoint instead of the sibling script. Add an internal `pi-host` verb to the executable and launch that verb through sessiond. The locked SDK's `dist/config.js:315-359,394-436` uses adjacent package.json/themes, QuickJS wasm and a separately embedded codemode worker; its package.json:43-45 builds explicit workers and copies resource trees. Bundle these resources, route package paths to a cache, include image/codemode workers and validate dynamic extensions/provider dependencies. Its existing Bun build is evidence of feasibility, not proof our headless integration is complete.

8. **Ad-hoc sessiond re-exec also supplies a JS path.** `packages/agent/src/sessiond-client.ts:138-153,175-180`; `packages/cli/src/cli.ts:653-659`. Standalone re-exec must use `[execPath, "sessiond"]` (or the intended CLI args), with no `Bun.main`/module URL argument. Under service management, retain the refusal to ad-hoc spawn sessiond: doing so puts harness children in the agent cgroup and kills them at agent restart. The proof starts sessiond explicitly, then verifies its welcome and agent custody.

9. **Workflow sandbox needs a writable package tree, type libraries and an explicit worker.** `packages/core/src/workflow-sandbox.ts:21-43,49-52,116-137,157`; `packages/hub/src/workflows/engine.ts:502`. It writes programs into package node_modules and relies on disk-resolved zod/TypeScript declaration files. Move programs to the data/cache directory, embed/extract ambient and TS/zod declaration libraries, provide a deliberate module/type resolver and include the worker as a compile entrypoint. Dynamic program import must resolve the bundled allowed zod implementation without expecting an installed npm tree. Boot does not exercise this.

10. **Transcript parsing has another worker path not in the current release builder.** `packages/jsonl-parser/src/pool.ts:70-71`; `packages/jsonl-parser/src/worker.ts:61-69`. Add the transcript worker as an explicit entrypoint with a compiled-mode specifier. Two bundled workers named `worker` must not collide. An empty scratch transcript catalog did not exercise this path. Preserve parallel parsing; do not mistake the existing per-shard in-process recovery for evidence the compiled worker ran.

11. **Workspace boundaries launch a sibling hook script.** `packages/agent/src/boundary.ts:168-169`. Embed that hook behind an internal executable verb and generate its command accordingly, preserving shell quoting. Git/bootstrap/workspace operations in `packages/agent/src/clone.ts:20-39,88-120,167` and `packages/agent/src/workspace.ts:32-56` still invoke Git. **Literal all-features/no-Git operation remains false** unless Git is embedded with its target dependencies or these operations are reimplemented. Recommended release scope: no Git to install/start/update CawCo; require Git on machines doing Git workspaces and advertise that capability explicitly.

12. **Preview overlay is built/read from the source tree.** `packages/agent/src/preview.ts:36-52`; `scripts/build-release.mjs:124-141`. Build the overlay once and embed its resulting browser script. Native `Bun.build` inside the compiled runtime does not recreate source files or install its dependencies. The proof excludes preview interactions.

13. **Browser/MCP launchers need external runtimes and browser resources.** Initial raw CLI compile fails at `node_modules/.bun/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:43408-43409`: unresolved `chromium-bidi/lib/cjs/bidiMapper/BidiMapper` and `chromium-bidi/lib/cjs/cdp/CdpConnection`. `packages/agent/src/mcp-launcher.ts:44-107` intentionally requires real Node/npm for npx; `:112-137` runs a disk Playwright CLI under Node and `:153-169` expects a Chromium installation. Resolve the bundled browser dependency graph and embed installers/resources or retain explicit optional capabilities. Arbitrary user-configured MCP commands cannot be made self-contained just by compiling CawCo. No fake npx/Bun-as-Node substitution is recommended. The spike marks browser usage unavailable and stubs playwright-core; it is not included in the verdict's feature proof.

14. **Native addon/WASM/platform resource audit is required per target.** Current hub DB and search use `bun:sqlite` and passed without addon deployment. `@libsql/client` in `packages/hub/package.json:36` has native platform packages on disk but has no source import in this baseline, so it is not a demonstrated runtime blocker. Dashboard socket-activation (`apps/dashboard/package.json:44`) has a Darwin native binding (`src/launchd.cc`), and pi-tui carries platform `.node` prebuilds while pi carries photon/QuickJS wasm. Build-time Tailwind/LightningCSS/Rolldown/oxlint addons are not customer runtime dependencies. For actual reachable runtime addons, statically select the correct target file and embed it, or remove the unused dependency; check shared-library requirements on each target. `find node_modules -name '*.node'` by itself does not prove an addon belongs in the release.

15. **Installer, join, service layout and both updater paths are checkout/package-oriented.** `packages/core/src/install-script.ts:32-101,119`; `packages/hub/src/join.ts:109-111,288-301`; `packages/cli/src/cli.ts:630-674`; `packages/agent/src/deploy.ts:166-184,239`; `packages/agent/src/registry.ts:151-183`; `scripts/build-release.mjs:30-47,63-117,209-255`. Replace clone/build/global-package installation with binary download/verification and native executable service commands. The hub's generated join script must name a release distribution, not discover its Git remote. Preserve idle gating, readiness checks and deployment isolation. The existing CLI only starts the Git watcher with `CAWCO_DEPLOY_POLL=1` (`cli.ts:451`), but `join`/install still create deployment clones; these paths need one coordinated cutover.

16. **Fleet content is not generally sourced from CawCo's checkout, but its resolvers have external tools.** `packages/hub/src/skills.ts:175-241` uses `tar`, `unzip`, and `gh api` for repository downloads; `packages/hub/src/plugins.ts:69-79,88-121,208-243` reads explicitly chosen local directories or downloaded marketplace trees. `packages/agent/src/fleet.ts:413,514,1693` starts tool/Claude/plugin and shell commands; fleet sync writes desired bytes into the user's harness configuration. Keep hub DB as content truth, not an embedded copy of the owner's settings. For fully self-contained resolution, replace archive subprocesses with an in-process extractor and design explicit GitHub credentials. Alternatively expose these as optional capabilities. Local user-specified marketplace paths and project repositories remain user data, not build assets to embed. No owner data is included in this binary.

17. **OS services and tools remain platform capabilities.** `packages/cli/src/service.ts:994-1007,1193-1219,1285-1325` invokes systemctl/loginctl/launchctl; `packages/hub/src/join.ts:256-270` invokes SSH; auth/browser integration uses `security`, `open` or `xdg-open`; boundary management uses `ps`, `getconf`, `mkfifo` (`boundary.ts:289,470,520`). A standalone executable removes the JS/build prerequisites, not the operating system's service manager or every tool launched for a coding task. Windows compile targets exist in Bun, but CawCo's current service installer refuses Windows; do not publish a claimed supported Windows service until that work is done.

## Proof

### Build and local iteration

Commands executed in the workspace:

```sh
bun install --frozen-lockfile
bun build --compile --target=bun-linux-x64 packages/cli/src/cli.ts \
  --define '__CAWCO_VERSION__="0.1.0-spike"' --define __CAWCO_RELEASE__=true \
  --outfile .context/binary/cawco-raw
bun run --filter @cawco/dashboard build
bun .context/binary/build.ts
env -i PATH=/usr/bin:/bin bash .context/binary/local-smoke.sh
bun run typecheck
bun run lint
bash -n .context/binary/prove.sh
stat --printf='%s bytes\n' .context/binary/output/cawco
```

The first raw compile exited 1 on the two chromium-bidi imports listed above. The first compiled spike then failed at CLI import with the virtual `Bun.main` realpath error. The spike fixes that seam at build time. The final compile succeeds, embeds **2,113 assets**, and the local scratch smoke passes health, real dashboard HTML, an embedded script, one online machine, websocket frame and sessiond welcome. `stat` reports **156542432 bytes**; Bun's build output `.size` reports the bundled payload size, not the full executable size, so `stat` is the release size measurement.

`bun run typecheck` exited 0 for all eight workspaces; dashboard: `svelte-check found 0 errors and 0 warnings`; hub: `openapi.json is up to date`. `bun run lint` exited 0: `Checked 1095 files ... Found 5 warnings` (existing unused suppressions in hub server, unrelated to this spike). Repository checks exclude `.context`; the spike has compiled and run but has no separate strict TS/lint certification. No unit tests were written or run.

Build-time-only substitutions are explicit in `build.ts`. The executable bundles the actual CLI, hub, daemon and sessiond, plus actual generated dashboard server/client files. It does not serve a dummy HTML fixture or simulate the agent register packet. Native SQLite migrations populate the real hub schema. The agent uses the actual supervisor/daemon websocket registration/custody path with three stub harness adapters.

### Clean container proof, run by the parent

The workspace cannot start containers. The parent ran the supplied script **once**, from 07:08:47 to 07:09:05, exit **0**, with no host sudo. It ran a frozen sibling copy, `prove-frozen.sh`, identical except it removed explicit setup `--network bridge` to use Podman's default rootless network. `prove.sh` is now aligned to that correction. Setup has no prototype binary or host mounts; after ca-certificates installation the proof container is network-none, read-only rootfs, no-new-privileges, capabilities dropped, and only output rw + executable ro bind mounts. All created containers and custom image are `cawco-binary-*` named and trapped for removal; the stock base image is cleaned from the isolated store too.

Evidence directory: `/home/bewinxed/.cache/cawco-orchestrator/binary/run-1`; console log: `/home/bewinxed/.cache/cawco-orchestrator/binary/run-1.log`. I read that log. The parent deleted only Podman storage/runroot afterward to free space; remaining evidence is 3.7 MB. It also reports the live hub listed **two machines both before and after**.

Actual console output:

```text
live hub unreachable: TypeError: Was there a typo in the url or port?
no bun, node or git; standalone runtime 1.4.2
health {"ok":true,"version":"0.1.0","build":{"version":"0.1.0-spike","startedAt":1791173344413}}
dashboard served: 55733 characters
embedded JS served: 600 characters
agents [{"machineId":"318775046750809f","hostname":"282cbbfcb7b2","os":"linux-x64","status":"online",...}]
dashboard websocket frame: {"verb":"frames","machineId":"","payload":{"kind":"instances","instances":[],"agents":[...]
sessiond welcome: 940b2416-bcc8-43d1-9ca3-1673c7742ba5, 0 children
PASS
```

The `agents` line above is abbreviated for readability; the evidence log contains its complete JSON, including stubbed/uninstalled harnesses, Node marked missing and available sessiond custody. `proof-check` runs before any service and fails if Bun/Node/Git are discoverable or the live hub is reachable. No-network namespace is the hard isolation; the logged failed request is its observable proof. This is materially stronger than hiding binaries on PATH on the host, though the tool check itself is PATH-based. `packages.txt` records the container's actual installed packages, and `container-config.json` records mounts/network.

Reproduce after building, on a host with rootless Podman:

```sh
bash .context/binary/prove.sh /absolute/fresh/output-directory
```

Local checks used a new scratch HOME, `env -i`, explicit loopback ports 43456 (hub), 43457 (hub preview), 43458 (dashboard), 43459 (gateway), an explicit sessiond Unix socket and no harness credentials. The entry refuses live/default ports and discovery. It forces mDNS off. Both local and container proof processes are cleaned up; no live service restart was performed.

## Release design

All implementation choices in this section are **our design recommendations**, not claims that the spike implemented them. External facts and the decision they drive are cited below.

### Source facts

- Bun executable docs: https://bun.com/docs/bundler/executables — “Bun bundles all imported files and packages into the executable, along with a copy of the Bun runtime.” This supports compiling the control plane without installing a JS runtime.
- Same Bun page — “Use `--asset` ... to embed a file or directory tree”; “When you add multiple entrypoints ... Bun bundles each one separately into the executable.” Embed resources and explicitly list workflow/transcript/pi workers; subprocesses need actual executable paths, not virtual source paths.
- Same Bun page — “Set the `BUN_BE_BUN=1` environment variable to run a standalone executable as if it were the `bun` CLI itself.” An internal runtime bridge is technically available if a vetted JS helper needs it; prefer internal verbs for owned code and do not treat this as npx/Node compatibility.
- Same Bun page lists linux x64/arm64 (glibc and musl), Darwin x64/arm64 and Windows targets. Its x64 note says “a single binary that targets Nehalem (SSE4.2) and selects AVX2/AVX-512 code paths at runtime.” There is no need for a separate modern/baseline artifact for this Bun version.
- Bun installer: https://bun.sh/install — `bun_uri=$github_repo/releases/latest/download/bun-$target.zip` and the named-tag branch `.../releases/download/$1/...`. Adopt platform detection plus a tag-pinned download; do not copy its missing checksum verification.
- uv release: https://github.com/astral-sh/uv/releases/tag/0.5.22 — “Install prebuilt binaries via shell script” and its “Download uv 0.5.22” table lists per-platform archives with checksum links. Adopt immutable per-version archives/checksums and a version-specific installer.
- GitHub releases API: https://docs.github.com/en/rest/releases/releases#get-the-latest-release — “The latest release is the most recent non-prerelease, non-draft release”; list releases “does not include regular Git tags that have not been associated with a release.” A tag must have a published GitHub Release; stable discovery must exclude drafts/prereleases, and release creation should explicitly set `make_latest` rather than assume tag creation establishes ordering.
- Claude SDK at the locked version: https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.289/README.md — “Embed the platform-specific binary as a file asset, extract it to a real path, and pass it explicitly.” Its example sets `pathToClaudeCodeExecutable`. Use this documented approach; the GitHub main README fetched separately is older and lacks this section.
- pi at the locked version: https://unpkg.com/@earendil-works/pi-coding-agent@1.0.1/package.json — `build:binary` runs `bun build --compile` with image-resize/codemode worker entrypoints and then `copy-binary-assets`. Its binary distribution carries assets beside the executable today, so embedding CawCo's pi integration needs explicit resource work.
- Apple signing: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution — “Enable the Hardened Runtime capability for your app and command line targets”; “Include a secure timestamp”; “Use a ‘Developer ID’ ... certificate.” Build/sign Mac binaries on a Mac runner using Developer ID Application, hardened runtime, timestamp and verified Bun JIT entitlements.
- Apple distribution: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow — “The notary service accepts ... ZIP archives”; “Although tickets are created for standalone binaries, it’s not currently possible to staple tickets to them.” Submit a ZIP containing the signed executable with `notarytool --wait`, check its log, then publish the signed binary archive; online Gatekeeper ticket lookup is needed for a bare CLI. If offline first-launch approval is required, distribute a notarized/stapled pkg or dmg too, not an invented staple operation on a raw executable.

### One release is one version tag

Publish `vX.Y.Z` tags as stable releases. Enforce tag == injected version across CLI/hub/agent/dashboard metadata. Pin the Bun builder to the tested version (currently 1.4.2) and install from the frozen lockfile. Main pushes produce CI results, never user updates. Build all assets once from the tagged commit, then compile each target with that target's native child/addon assets. Record source SHA, Bun version, dependency versions, native minimum OS/libc and protocol range in `release.json`.

Initial supported matrix: `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`. Linux targets must pass the isolated control-plane smoke and a stub sessiond-child/restart-custody integration flow on native runners; Mac targets need native smoke, launchd/custody and downloaded/quarantined Gatekeeper checks after signing/notarization. Add Linux musl only after the reachable native harness/addon/shared-library graph is proven there. Defer Windows rather than advertise service support based on Bun's compile target alone.

Artifacts per target: `cawco-X.Y.Z-<target>.tar.gz` containing `cawco`, license notices and a small manifest; `<archive>.sha256`; one `SHA256SUMS`; signed `release.json` containing exact archive/binary hash, size, version, commit, target and protocol metadata. A bare binary downloadable asset can also be provided for the updater, avoiding archive tooling there. Bundle all **CawCo-owned** code/dashboard/migrations/overlay/workers into the executable; embed/extract selected native harnesses/resources if that is the owner-selected scope. Never publish an artifact with externals expecting npm packages to be installed at runtime. Publish only after all required matrix jobs and signing pass; draft Release during assembly, promote once complete. No artifacts are overwritten for an existing stable tag.

### Installer: detect, download, verify, place, register

Replace `generateInstallScript` and the hub/site callers together in the future production item. The shell bootstrap needs only ordinary shell/download/archive/hash tools, not Git/Bun/Node: detect `uname` OS/arch, detect libc only for an explicitly supported musl build, reject unsupported targets, resolve a version once, download the tag-specific installer/manifest/archive, verify SHA-256 before unpacking or execution, and verify the executable's own version. Embed expected per-target digests in the version-specific installer, like a versioned distribution contract; a mutable latest redirect only chooses which pinned installer to download. Require `sha256sum` on Linux or `shasum -a 256` on macOS and fail clearly if absent. No “skip verify” branch.

Install owner-only version directories at `~/.local/share/cawco/versions/X.Y.Z/`, with stable `~/.local/bin/cawco` -> `current/cawco`. Keep data/config separate from executable resources, so uninstall/update cannot erase the database. Call the installed executable's native `service install`/`join --hub ...`; units/plists invoke only the real executable and verb. Register sessiond separately before agent; first hub installs dashboard/hub services as the chosen socket design dictates. Retain systemd lingering and GUI-domain launchd behavior and the full hub/sessiond/agent/dashboard readiness check. The installed binary performs joining; it must not make a deployment clone or discover a Git remote. Extracted resources live under their release/hash directory with owner checks and atomic writes, never writable virtual `/$bunfs` paths.

### Updater: immutable artifact, idle transaction, observable rollback

Replace both the npm registry installer and production Git reconciliation with one artifact updater. Learn stable latest from the configured GitHub Releases API (or an explicitly configured mirror with the same signed contract), cache with ETag and jittered polling; pin a machine with `--to X.Y.Z` and disable automatic advancement when pinned. `--check` only reports. Validate exact platform/version/protocol metadata and checksum; verify the signed release manifest using a release public key embedded in CawCo. A checksum obtained from the same server is corruption detection, not independent publisher authentication; the signed manifest supplies that identity for automatic updates. Shell first installation remains rooted in HTTPS and the downloaded bootstrap.

Download to a sibling temporary version directory, fsync/chmod/verify and run candidate `--version` plus an isolated startup check before activation. Only one updater owns a per-install lock. Persist a transaction journal `{from,to,phase,previousPath}`. **Before activation**, ask the actual supervisor/custody barrier for `ready:true` and `busy:0`; an unavailable/unknown report is held, never read as idle. Stop admitting new sessions/turns while draining, recheck idle, and atomically rename a `current.new` symlink to `current` on the same filesystem. This closes the race between an idle snapshot and a newly admitted turn. No code path restarts mid-turn without explicit `--force`.

Start a detached updater-helper verb or service-manager-owned one-shot from a versioned path so restarting the agent cannot kill the updater. Restart hub/dashboard/agent and **sessiond only after all of its owned work is safe**, preserving independent session custody. If sessiond must remain on the previous version to retain a parked child, record it as pending and keep old resource directories until it drains; compare protocol capabilities before reconnecting. New startup verifies `/health`, sessiond capabilities, agent registration and dashboard/version, then commits the journal and releases admission. Report downloaded/held/activating/healthy/failed/rolled-back state to the dashboard, with installed versus available versions kept distinct.

Retain the previous executable/resources. On failed readiness, the updater-helper explicitly restores the previous pointer and restarts the affected services, recording rollback and suppressing automatic retry of that bad version. Rollback is an explicit release feature requested in this brief, not a silent runtime fallback. Database changes need their own protection: make a SQLite online backup and preserve WAL consistency before migration; a code rollback alone cannot undo an incompatible schema. Either ship migrations usable by the retained version or stop the stack and restore the recorded DB snapshot as part of rollback, with the transaction excluding user writes until healthy. A later manual rollback after accepted new writes requires a compatible schema or an explicit data-restoration decision; do not silently erase new history.

### Stable and development channels

Stable = published non-prerelease semver tag, built/tested once. Keep the developer checkout/watch mode for editor work. Recommendation: add an opt-in **nightly binary channel**, built from green main CI with immutable `X.Y.Z-dev.<build>+<sha>` artifacts and identical signatures/checks/idle gating, only if the owner needs fleet-wide development rollout. Do not keep a production Git puller as a second update implementation. Stable never follows main or switches channels implicitly. Development users consciously select nightly; working-tree sessions still use the source workflow independently.

### Mixed hub and agent versions

Introduce a register/health handshake `{version, commit, protocolMin, protocolMax, capabilities, sessiondProtocol}`. Choose the intersection before restoring custody, syncing fleet content, sending spawns or processing state transitions. No common protocol means a clear incompatible/upgrade-required machine state and no mutation dispatch; the agent remains alive with its children and retries only the pinned hub. Do not auto-downgrade/route to another hub. The hub can still show reported versions and incompatibility. New features require an explicitly advertised capability; absent features are disabled, not guessed. Release manifests declare the supported peer range and CI runs one old/new pair in each direction plus custody continuity. This is deliberate bounded version interoperability, not legacy installation shims. Breaking wire changes require a protocol epoch and a coordinated rollout; recommend hub first for additive changes, then idle agents/sessiond. Stable release promotion should refuse a rollout plan with incompatible surviving children.

### Size of production work

The spike itself adds **six files** (build.ts, entry.ts, stub-harnesses.ts, prove.sh, local-smoke.sh, REPORT.md), with zero product files touched. Generated assets/binary/logs are build outputs. A production binary release is roughly **20–30 source/build/config files**, not a one-flag change: standalone entry/resources/version readers; dashboard/runtime/socket service design; both harness launch paths and workers; install/join/service/update cutover; release workflow/signing/manifests; protocol negotiation. Full arbitrary MCP/browser tooling and zero-Git workspace support are separate expansions. File count is an engineering estimate, not a completed implementation claim.

## Choices for the owner

- Distribution scope: recommend one self-contained **CawCo control-plane executable**, with optional independently managed coding/browser/MCP capabilities; literal every-feature/no-Git requires a materially larger bundled toolchain.
- Native harnesses: recommend embed the current Claude native CLI and CawCo pi-host/resources; decide whether OpenCode should be embedded/pinned or a separately managed optional executable.
- Dashboard restart continuity: recommend preserve the current held-listener guarantee and prove native Bun socket handoff before cutover; direct bind requires explicit acceptance of restart connection refusal or a stable listener design.
- Update policy: recommend notify/download automatically and activate at a persistent idle barrier, with pin/disable controls; choose whether stable auto-activation is enabled by default.
- Development fleet: recommend opt-in green-main nightly binaries if automatic developer rollout is still needed, replacing the Git poller rather than retaining two updater implementations.
- macOS offline first launch: recommend signed/notarized raw CLI archives initially; choose a stapled pkg/dmg too if offline Gatekeeper approval is a required supported experience.
