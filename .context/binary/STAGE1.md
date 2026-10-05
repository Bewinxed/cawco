# Standalone runtime and local release pipeline: stage one

## On main

The implementation is on main in these commits:

- `b35eeed79c935e98c6de47575647ddee95c5b5f1`: standalone runtime, embedded resources and native Claude CLI, owned workers/internal helpers, inherited dashboard relay, optional capability reports, local release pipeline and integration proof.
- `c56e294d38593f9e3c17f1d2ee678635e3528798`: CLI verbs, build information/manifest verification and executable-based service layout.
- `3db234707763ea2f76cb4ac76b0f370dd9799bea`: capability migration/snapshot aligned with main's concurrent lifecycle migration. Capability SQL is `0074_machine_capabilities.sql`; main's `0073_session_end_intent.sql` remains intact.

The earlier spike/report is retained on main as `3f174ea83852608370397a3d76db7fc15ccd88f4`. No GitHub workflow was added or edited. `packages/core/src/install-script.ts`, the site, `packages/agent/src/deploy.ts`, and `packages/agent/src/registry.ts` were not changed. No tag, release, upload, production key, installed optional tool, or live service restart was performed by this item.

## Runtime blocker states

These numbers refer to REPORT.md. Source checkout operation remains supported; the standalone entry is another entry into the same CLI/hub/agent/sessiond implementation.

1. **Executable layout: implemented.** `packages/core/src/runtime.ts` identifies standalone mode and `packages/cli/src/service.ts` derives commands from the real `process.execPath`. The CLI no longer tries to resolve virtual `Bun.main` as a physical executable. Source/npm layouts retain their existing behavior.
2. **Embedded dashboard and held listener: implemented and locally exercised.** The entire existing production server remains responsible for HTTP, REST, CSRF/public origin, preview/Referer routing, upgrade relay, static/range/compression/cache handling, running-version and draining. In a binary, the public inherited `node:net` listener pipes to that process's private Unix HTTP listener. There is no public direct-bind branch. The generated SvelteKit handler and client files are embedded; static assets are materialized into a versioned cache. Source Node production serving takes its original inherited-fd path and does not import Bun/TypeScript helpers at runtime.
3. **Migrations: implemented.** The SQL/journal tree is embedded and materialized before Drizzle runs. A real existing-database fixture excludes the newest migration, retains sentinel history, and the hub applies the capability migration without losing it.
4. **Build identity: implemented.** CLI, hub and agent share injected version/full commit and protocol range `{min:1,max:1}`. `cawco build-info` and `/health` expose it. Source checkouts retain their current build readers.
5. **Claude native CLI: implemented.** Each target downloads the exact locked platform SDK package, verifies its registry SHA-512 integrity, embeds its native CLI and uses the SDK's `extractFromBunfs`. Both query paths select it in standalone mode; the auth probe selects the same executable. Source caller overrides remain intact. No authenticated/model turn was run.
6. **OpenCode: intentionally external.** Detection remains real; it is not bundled or simulated in release builds. Its explicit install command is reported.
7. **pi owned host/resources: implemented.** `pi-host` is an internal CLI verb launched by sessiond. The SDK's metadata/themes/export assets are embedded. Bun provider/QuickJS setup is owned by CawCo and does not apply pi CLI's process-title or warning overrides. Image/codemode workers, Photon/QuickJS WASM and the target clipboard addon are selected by the builder. External `pi` remains a detected optional capability as ruled by the owner; arbitrary user extensions are not bundled.
8. **Owned re-exec: implemented.** Standalone sessiond is `[execPath,"sessiond"]`, not `[execPath,virtual JS path]`. The service-managed refusal to ad-hoc spawn sessiond remains intact.
9. **Workflow sandbox: implemented and exercised.** Programs live in the versioned data directory. TypeScript standard declarations, zod declarations/runtime and workflow ambient definitions are embedded. The worker is an explicit compile entry. The proof rejects an invalid input-property type, saves/launches an actual hub workflow through its API, and checks the persisted checkpoint/result.
10. **Transcript worker: implemented and exercised.** It is an explicit separate entry with a compiled path. Standalone worker failure is a refusal, rather than the source package's in-process recovery. Two transcript files were parsed by workers in the local compiled proof.
11. **Boundary hook: implemented.** The hook is an internal verb and handles the extra verb argument. Its command still runs the same hook code. Git-based workspace operations remain optional external capabilities; they are not reimplemented or faked.
12. **Overlay: implemented.** Built once as browser code and embedded; standalone preview never attempts to rebuild TypeScript source at runtime.
13. **Browser/MCP tooling: intentionally external.** Node/npm remain real prerequisites. Standalone resolves an installed Chrome/Chromium or Playwright browser cache and reports absence. The source-only Playwright installer import is never evaluated in a standalone runtime. No npx/Node shim or browser installation is introduced.
14. **Native/WASM resources: implemented for reachable runtime paths.** Target-specific pi clipboard addons and Photon/QuickJS WASM are selected explicitly. macOS activation calls the operating system's documented `launch_activate_socket` through Bun FFI, rather than depending on runtime npm binding discovery. The unused `@libsql/client` dependency and its lock entries were removed. Build-only toolchain addons are not embedded.
15. **Installer/updater/cutover: intentionally deferred to the next items.** Those protected files and the site were not changed. The binary service layout/commands exist; the current installed fleet still uses its existing installer/updater.
16. **Fleet resolvers/tools: optional external capabilities remain.** User-specified tools, archives, private GitHub access and repositories remain user data/tools. No owner configuration, token or credential is an embedded asset.
17. **OS capabilities: reported, not installed.** `cawco capabilities` and machine registration report Git, OpenCode, pi, Node, browser and service manager, with platform commands/reasons. The agent also exposes an on-demand `probeCapabilities` control. No capability probe installs anything.

## Socket evidence and real peer identity

Upstream evidence was checked before selecting the transport. Bun 1.4.2 is the latest stable reported by `npm view bun@latest version`. Its HTTP inherited-fd failure is still reproducible; actual source and compiled `node:http` report the private control port instead of the held port and the request times out. Its `node:net` layer adopts the actual listening descriptor in source and compiled mode. A supervisor held the descriptor, sent a request while the worker was absent, launched the replacement, and received 200.

Sources: https://github.com/oven-sh/bun/pull/44013 — “Bun.listen({ fd }) and net.Server.listen({ fd }) serve on main since #31829”; https://github.com/oven-sh/bun/issues/22559 — “Node works, bun hangs the connection.” The decisive evidence is our real 1.4.2 run, recorded in `.context/binary/socket-handoff-result.json`. The runtime was not downgraded to direct binding and no external proxy was added.

Peer address matters: `apps/dashboard/src/routes/api/[...path]/+server.ts:105-109` calls `getClientAddress`, `:45` sends it to the hub, and `packages/hub/src/server.ts`'s `sign-in-machines` route uses that address to select a matching machine. Agent socket addresses are also used by the registry and preview routing. Therefore the relay carries a per-connection random nonce in the first HTTP header, strips caller-supplied nonce headers, and binds the Unix HTTP socket to the original accepted TCP peer in a private map. Subsequent requests use that same socket binding. A caller's `x-cawco-peer-address` is overwritten before SvelteKit handles the request. The private Unix directory/socket are owner-only. Explicit operator reverse-proxy ADDRESS_HEADER/XFF_DEPTH configuration is preserved; default client-address resolution uses the trusted relay peer.

The compiled relay proof printed:

```text
real peer 127.0.0.1 arrives on repeated keep-alive requests; forged relay/address headers ignored
2 MiB request survives relay backpressure
2 MiB response survives a paused client and relay backpressure
client write-half close preserves full HTTP response
```

The actual dashboard stack additionally printed a held websocket before worker replacement, a request queued on the held socket and answered after replacement, and an old websocket drained followed by a frame from the replacement websocket. An individual worker's websocket is drained/reconnected, as today's server does; it is not falsely claimed to survive the death of the process holding it. Source shutdown retains its bounded request drain.

The expanded container script includes **real systemd socket/service units**, rootless Podman `--systemd=always`, a deliberate restart interval, a request initiated during that interval and a websocket drain/reconnect check. That part must be run by the parent: this workspace cannot create the required namespace. Until the parent returns that output, real-service-manager activation is **not claimed as proven**. The stand-in supervisor and actual relay are locally proven.

## Local release pipeline

`scripts/release.ts` is a trigger-free local pipeline. Inputs are an explicit commit/channel/output; stable additionally requires a matching `vX.Y.Z` tag and nonempty `docs/releases/<version>.md`. Nightly version is `<package-version>-nightly.<first-parent-count>+<sha>`, with commit subjects touching runtime paths since the preceding nightly as notes. No trigger is wired and `.github/workflows/release.yml` is untouched.

It checks pinned Bun 1.4.2, creates a clean detached checkout of the input commit, installs the frozen lockfile, runs typecheck/lint, builds the proof binary and runs the container smoke when Podman exists. It uses one machine/user cache lease at `~/.cache/cawco/release-pipeline/build.lock`, records a latest pending commit, refuses an older queued ancestor, and refuses builds below 4 GiB free memory. Builds/signing/archives are serialized. Superseded completed builds are not promoted.

Outputs are `cawco-<version>-<target>.tar.gz`, per-archive `.sha256`, `SHA256SUMS`, and `release.json` plus its detached signature. The manifest carries version, commit, channel, target, archive/binary sizes and hashes, protocol range, notes and the `testSigned` policy bit. Darwin is cross-compiled on Linux, then sent only to a named Mac scratch directory for ad-hoc signing/verification before its archive is produced. Neither unsigned Darwin archives nor incomplete/superseded builds are promoted to the caller's output. Nothing is uploaded/published and no tag is created.

The actual clean-commit invocation was:

```sh
bun scripts/release.ts --commit 3db23470 --channel nightly \
  --output "$PWD/.context/local-release-binary" --mac-host mac
```

Its clean frozen install, repository typecheck, script typecheck and lint passed; it built a **414,225,888-byte** proof binary from clean main. It then stopped, correctly, at the container gate:

```text
newuidmap: write to uid_map failed: Operation not permitted
Error: cannot set up namespace using "/usr/bin/newuidmap": exit status 1
Release command failed: bash scripts/binary/prove-stage1.sh ...
```

No gate was bypassed or artifact promoted. The clean-main proof binary remains at `/home/bewinxed/.cache/cawco/release-pipeline/staging-3db234707763/cawco-proof`. The clean worktree was removed by the pipeline's cleanup; its logs/staging remain. This is why the parent must run the container proof/pipeline from the unrestricted host.

## Four builds and what ran

All four production binaries were cross-compiled sequentially with the same prepared dashboard/resources. These are internal verification artifacts from the stage-one implementation build, with injected development metadata, not a published/signed production release manifest:

| Target | Executable bytes | Evidence |
|---|---:|---|
| linux-x64 | 415,598,048 | Built; clean-environment CLI `--version` ran locally |
| linux-arm64 | 415,025,448 | Built; no ARM Linux runtime available in this workspace |
| darwin-arm64 | 380,302,864 | Built; ad-hoc signed and codesign-verified on the Mac; scratch CLI printed `0.1.0-dev` |
| darwin-x64 | 398,118,608 | Built; ad-hoc signed and codesign-verified; ARM Mac refused execution with `Bad CPU type in executable` because Rosetta is absent |

Files are under `.context/binary-build/targets/<target>/cawco`. The Mac signing scratch directories were removed. No Rosetta/tool installation was attempted. The final production pipeline must complete its smoke gate and key step before promoting release archives; these internal executable builds do not waive those gates.

Local compiled stack evidence in `.context/binary/stage1-stack-v3.log` and its scratch child logs includes:

```text
real hub workflow API run completed and persisted its checkpoint/result
embedded dashboard served 55869 characters
dashboard websocket is held open before worker restart
cross-origin form refused with 403
held supervisor socket: queued request answered after worker replacement
old websocket drained; replacement websocket delivers a frame
PASS
transcript worker parsed two files
workflow typecheck, input worker, effect and result passed
same child 8698 survived agent restart
existing database preserved; embedded capability migration applied
```

The source/compiled HTTP-versus-net fd probe, separate relay/backpressure/peer probe, signing probe and isolated full stack used only scratch directories, explicit loopback ports and stub harnesses. No owner credential was passed. Repository typecheck and strict `scripts/tsconfig.binary.json` passed; lint passed with five pre-existing hub suppression warnings. No unit tests were written or run.

## Proof script and signing key boundary

Run the expanded proof on the unrestricted host:

```sh
bash scripts/binary/prove-stage1.sh /ABSOLUTE/FRESH/OUTPUT \
  /home/bewinxed/.cache/cawco/release-pipeline/staging-3db234707763/cawco-proof
```

The script is 51 lines of plain Bash. It confines Podman storage/runroot and host output to the output directory, names/traps its objects `cawco-binary-*`, mounts only output and the binary, uses no host sudo/network or privileged mode, and checks live hub unreachable before the clean stack starts. First image is stock Ubuntu24 with only ca-certificates added. A separate real-init image adds systemd/dbus/Git for the requested activation and Git-present scenario. Missing/present capability JSON is retained separately. The script is ready; this workspace's namespace refusal prevents running it here.

No real release key exists, per the owner. The production pipeline accepts only explicit `--signing-key /absolute/path/outside/repository`, has no default key location and never generates a production key. Once it reaches signing without that key, it stops and leaves the build unpromoted.

Algorithm: **Ed25519**, private **PKCS8 PEM**, public **SPKI PEM**. `packages/core/src/release-key.ts` is the single embedded public-key location; it deliberately contains no key until the owner chooses one when publishing is enabled. The verifier is included in the binary through `cawco verify-release`; the updater item can reuse it. Losing the private half prevents signing new updates that installed binaries trust. Replacing it without an authorized public-key transition makes existing clients reject new manifests; do not silently swap it or trust a manifest-supplied replacement.

The proof alone generates a throwaway pair under scratch `test-release-signing/TEST-private.pem` and `TEST-public.pem`, creates a manifest marked `testSigned:true`, signs, demonstrates default refusal, verifies only with the explicitly supplied test public key, and deletes the keys/manifest in `finally`. Its actual local output was:

```text
test-signed manifest refused by default; explicit test public key verifies
throwaway TEST keys and manifest deleted
```

No test-signed output leaves that scratch directory. Developer ID signing/notarization remains intentionally pending the owner's certificate; this stage used ad-hoc signatures only.
