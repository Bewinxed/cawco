# Should CawCo's workspace boundary be srt?

Evaluation of `@anthropic-ai/sandbox-runtime` (srt) as the engine behind CawCo's
workspace boundary, against CawCo at `11e90110` (= `origin/main` when this ran),
2026-10-09. Prototype config and scripts are beside this file; raw runs are in
`results/`.

## Answer

**Adopt, with named gaps closed in CawCo's config and executor, in one shape
only: one long-lived srt sandbox per workspace, fed commands through a FIFO
runner.** Do not adopt srt as a per-command wrapper. Linux can cut over now.
macOS cuts over once srt grows a `mach-register` allowance (srt #210); until
then Playwright/Chromium cannot start inside it there.

The evidence, in one table (every row is a measured run, both machines):

| | today's boundary | srt, per command | srt, runner (recommended) |
|---|---|---|---|
| bun install, build, git commit, Playwright (Linux) | pass | pass | pass |
| swift build, xcodebuild simulator build (Mac) | pass (code: shims) | not run | pass (with the same shims + `--scratch-path`) |
| Playwright (Mac) | pass | not run | **fails, srt #210**; passes with one added rule |
| dev server started by one command, used by the next | works | **broken**: own netns + pid ns per command | works |
| escapes the review found, Linux (15 rows that apply) | **11 open** | — | **0 open** |
| escapes, Mac (15 rows that apply) | **10 open** | — | **0 open** |
| host daemon sockets (tailscaled, system bus, snapd, sshd, mullvad), Linux | **5 connect** | — | 0 visible |
| overhead per command, `true`, median (Linux / Mac) | hook 15 ms + nsenter (not measurable from inside) | 280 ms / 316 ms | 32 ms / 121 ms |

Mac numbers were taken at load average 490–905; Linux at 2–8.

## 1. srt itself

Read in full: README (1016 lines), `sandbox-config.ts` (the schema), `sandbox-manager.ts`,
the Linux wrapper and mount plan (`linux-sandbox-utils.ts`), the macOS profile
generator (`macos-sandbox-utils.ts`), `cli.ts`, the seccomp helper source, and the
issue tracker (`gh issue list`, 152 issues; the relevant ones are cited below).
Source: `github.com/anthropic-experimental/sandbox-runtime` at `cdade68`.

- **Version and cadence.** 0.0.79 (2026-10-07). 75 releases since 0.0.1
  (2025-10-20); 2026: Mar 7, Apr 3, May 3, Jun 10, Jul 5, Aug 7, Sep 4. Still
  0.0.x. README: "Beta Research Preview … APIs and configuration formats may
  evolve." The config shape did change during 2026 (path entries became
  `string | {path, literal}`, README "For embedders"). Pin a version; read the
  changelog on every bump.
- **Shape.** `SandboxManager` is a module-level singleton
  (`sandbox-manager.ts:155 let config`): one config and one proxy per process.
  The CLI (`srt --settings F -c CMD`) starts its own proxy and exits with its
  command. Linux: bubblewrap, `--new-session --die-with-parent`
  (`linux-sandbox-utils.ts:3300`), `--unshare-pid` (3492), `--unshare-net` plus
  socat bridges to a host proxy whenever any network config is present (3385),
  read denies as tmpfs mounts (1792), and an `apply-seccomp` helper that blocks
  `socket(AF_UNIX)`. macOS: one generated Seatbelt profile per command,
  `(deny default)` (`macos-sandbox-utils.ts:1017`), fixed mach-lookup and
  sysctl allowlists, `(allow signal (target same-sandbox))` (1026), loopback-port
  proxy.
- **Writes are allow-only, reads deny-then-allow, network allowlist-only.**
  There is no allow-all: `*` and `*.com` are refused
  (`domain-pattern.ts:116`), and setting `network.allowedDomains` at all, which
  the schema requires, puts every command behind the proxy
  (`sandbox-manager.ts:2071`).
- **Built-in protections** CawCo gets for free: write denies on shell rc files,
  `.gitconfig`, `.gitmodules`, `.mcp.json`, `.vscode`, `.idea`,
  `.claude/{commands,agents}`, `**/.git/hooks`, `**/.git/config` (README
  "Mandatory Deny Paths"); credential masking with a proxy that substitutes the
  real value only towards named hosts (`credentials`, `sandbox-config.ts:636`);
  violation reporting for the model (`annotateStderrWithSandboxFailures`).
- **Runs on Bun.** CawCo's binary is Bun; srt declares `node >= 22`. The CLI ran
  unchanged under Bun 1.4.2 on obelisk, proxy included (`bun-hosted srt: github 200`).
- **Host dependencies.** Linux: `bwrap` (0.11.1 here), `socat`, `ripgrep`
  (absent on both machines; the prototype used a static `rg` 14.1.1). macOS:
  none (the code checks `rg` on Linux only, `sandbox-manager.ts:1227`, despite
  the README).

Open srt issues this evaluation hit, each reproduced here:

| issue | what it is | hit here |
|---|---|---|
| #429, #498 | `apply-seccomp` cannot start under Ubuntu's `bwrap-userns-restrict` AppArmor profile | yes: `apply-seccomp: write /proc/self/setgroups … Permission denied`; every command fails |
| #446 | an `allowWrite` nested in an `allowRead` under a `denyRead` comes out read-only | yes: the workspace's TMPDIR went read-only |
| #67 | Seatbelt does not nest (SwiftPM, xcodebuild sandboxes) | yes: `sandbox-exec: sandbox_apply: Operation not permitted` |
| #210 | no `mach-register` allowance; Chromium cannot start on macOS | yes: `bootstrap_check_in … MachPortRendezvousServer: Permission denied (1100)` |
| #432 | macOS mandatory-deny globs are anchored at srt's cwd | yes: they block SwiftPM checkouts inside the clone, not outside it |
| #654, #611 | `/tmp/claude` is always granted and shared by every sandbox of the user | yes: denied for writing in the config; reads remain |
| #602 | `srt` exits 0 when its command dies by a signal | not hit: the runner returns status over its FIFO |
| #287 | macOS `sysctl-read` allowlist is not configurable | not hit by any tool tried |

## 2. What today's boundary provides

From the code at `11e90110`. The brief mentions a Landlock layer; there is none
at this commit (`grep -rni landlock` finds nothing). It may be in the item
running in parallel.

| capability | how | where |
|---|---|---|
| Writes only to the clone, the scratch dir and the caches | Linux: everything remounted read-only with `mount_setattr(AT_RECURSIVE)`, then those paths bound back rw; macOS: `(deny file-write*)` + allow list | `boundary.ts:142-165` (cachesOf), `:834-863` (ANCHOR, 838-846), `:960-1017` (profileOf) |
| Scratch dir as `/tmp`, not removable from inside | bind of `~/.cawco/workspaces/<id>/tmp` on `/tmp`; macOS `deny file-write-unlink` | `:91-97`, `:847`, `:1009` |
| Service-manager bus and sessiond hidden | private runtime dir over `$XDG_RUNTIME_DIR`, tmpfs over sessiond's dir; macOS unix-socket outbound deny on `~/.cawco` | `:848-849`, `:910-911`, `:987-1014` |
| Harness sign-ins unreadable | empty-file binds over three sign-in files, tmpfs over `~/.cli-proxy-api`; macOS read denies plus `session-identity` | `:850-860`, `:966-1001` |
| ssh reads the host's includes | user-owned copy of `/etc/ssh/ssh_config.d` | `:102-133`, `:861` |
| Private `/dev/shm` (Chromium) | tmpfs | `:862` |
| Sees and signals only its own processes | Linux pid namespace with a PID-1 anchor; macOS `(deny signal)` + same-sandbox | `:887-916`, `:995-996` |
| No `launchctl` (macOS) | `deny process-exec` | `:1010` |
| Network | the host's, unrestricted | `:11-12` |
| `gh`/push credentials | executor reads `gh auth token` on the host, passes `GH_TOKEN` | `:1121-1124`, `:1143`, `:1170` |
| Apple builds | `swift` and `xcodebuild` shims that turn their own sandboxes off; `log` shim to a relay | `:298-373`, `log-relay.ts`, `boundary-log.ts` |
| One boundary per workspace, held by sessiond, survives agent restarts | `unshare … --kill-child` (Linux) / `sandbox-exec` FIFO runner (macOS) as a sessiond proc | `:22-24`, `:669-708`, `:1202-1262`, `:927-938` |
| Commands run through one executor; cwd follows `cd` | `exec [--cwd-out F] CMD`: nsenter (Linux) or FIFO request (macOS) | `:1129-1146`, `:1148-1186` |
| Fail closed | executor refuses a stopped boundary; hook turns every failure into exit 2, with a watchdog under Claude Code's own timeout; unsupported OS refuses the work | `:1137-1140`, `:1164-1167`, `:174-248`, `:670-675`, `boundary-hook.ts:31-61` |
| Claude Code commands | PreToolUse hook on `Bash|Monitor`, as flag settings; the hook is re-armed on every agent start; an adopted CLI whose hook fails open is stopped and relaunched | `:459-491`, `:424-457`, `:522-585`, `claude.ts:1275`, `claude.ts:1697`, `claude.ts:1746`, `session.ts:1794`, `daemon.ts:1526` |
| OpenCode commands | plugin `bash` tool replacing the built-in; no boundary record means the command does not run | `opencode.ts:895-956` |
| pi commands | bash tool operations wrapped with `boundaryCommand` | `pi-runtime.ts:53-61`, `:604` |
| Workflow `runCommand` | same executor | `workflow-command.ts:71-72` |
| Replacing an old-form macOS runner without cutting a command | form hash, gate file, replace when idle | `:716-807`, `:1028-1043` |
| Close | SIGKILL the anchor (Linux), kill by `CAWCO_WORKSPACE` marker (macOS) | `:1273-1318` |
| Proofs | no isolation proofs in the repo (test suites are deleted by rule); `scripts/binary/prove-stage2.sh:209-211, 887-891` proves a `boundary-*` proc survives updates | |

## 3. Each capability on srt

S = supported as is, C = supported by config or by CawCo's executor, G = gap.

| capability | srt | how / source |
|---|---|---|
| Write scope | S | `allowWrite` allow-only (`sandbox-config.ts:948`) |
| Read scope (new: today reads everything) | C | `denyRead: [$HOME, /run, /var/run, /tmp]` + `allowRead` carve-outs (`sandbox-config.ts:938-947`) |
| Scratch as `/tmp` | G→C | srt cannot mount a dir at another path. `TMPDIR` is the scratch dir via `CLAUDE_CODE_TMPDIR` (`sandbox-utils.ts:753`); the host's `/tmp` is denied. A tool that writes the literal `/tmp/x` writes the sandbox's own empty tmpfs: nothing reaches the host, and it is gone when the sandbox restarts (srt #294; §9) |
| Bus, sessiond, host daemon sockets | C (Linux), S (macOS) | Linux: path denies, because the seccomp `AF_UNIX` block cannot start under AppArmor (#429); abstract sockets are cut off by srt's netns. macOS: unix sockets refused unless listed (`macos-sandbox-utils.ts:1219-1249`) |
| Sign-ins, `~/.cawco/accounts`, other repos, `~/.ssh` | C | all under the `$HOME` deny |
| ssh includes copy | dropped | ssh needs keys and they are hidden; pushes are https with `GH_TOKEN` as today |
| `/dev/shm` | S | `--dev /dev` (`linux-sandbox-utils.ts:3483`); Chromium ran |
| Own processes only | S | `--unshare-pid` (3492); macOS `(allow signal (target same-sandbox))` (`macos-sandbox-utils.ts:1026`) |
| No `launchctl`, no `open` | S | deny-default mach-lookup; measured `launchctl` exit 1, `open` exit 1 |
| Network | C, **product change** | allowlist only, no allow-all (`domain-pattern.ts:116`); an owner decision (section 6) |
| `GH_TOKEN` | C | env passes through; optionally masked (`credentials.envVars`, injected only towards `github.com`, needs `tlsTerminate`) |
| Apple builds | C, shims stay | SwiftPM/xcodebuild sandboxes still cannot nest (#67). Plus `swift … --scratch-path` outside the clone (macOS mandatory denies, #432) and `GIT_TEMPLATE_DIR`=empty dir |
| `log` | G, relay stays | `log: Cannot run while sandboxed` inside srt too |
| Chromium on macOS | **G** | #210; one rule fixes it (measured) |
| One boundary per workspace, held by sessiond | C | the runner: sessiond holds `srt -c runner.sh`; a per-command srt cannot do this (section 4) |
| Executor, cwd follows `cd`, status | C | FIFO executor (today's macOS one, made platform-neutral) |
| Fail closed | C | executor refuses without a runner; srt itself refuses a bad or missing settings file (README "Basic Usage") |
| Harness routing (hook, OpenCode plugin, pi, workflow) | unchanged | srt does not route commands; every path keeps calling the workspace's executor |
| Close | C | SIGKILL the **outer bwrap**, not srt (section 5e); macOS marker kill as today |
| `.git/hooks`, `.git/config`, `.mcp.json`, rc files protected | S, with caveats | built in; `.git/config` loses protection on a host-side rename (5d) |
| Credential masking, violation reports | new | not used by today's boundary |

## 4. Prototype

Scratch only: obelisk `/tmp/proto` (this workspace's own scratch dir), Mac
`$TMPDIR/cawco-srt-eval`. Workspaces were real shared clones:
`git clone --shared /home/bewinxed/cockpit` on obelisk and `git clone --shared
~/anbar` on the Mac. srt 0.0.79 from npm.

| file | what it is |
|---|---|
| `srt-config.ts` | a workspace's srt settings, derived from today's grants with the review's escapes closed |
| `prepare-clone.sh` | the clone's `info/exclude` lines for srt's placeholders |
| `runner.sh` | the in-sandbox runner (today's `RUNNER`, unchanged in shape) |
| `runner-start.sh`, `runner-stop.sh` | stand-ins for sessiond starting and closing a boundary |
| `runner-exec.sh` | the executor: FIFO hand-off, per-workspace caches, empty git template, Linux mount check |
| `srt-exec.sh` | the rejected per-command executor, kept for the overhead comparison |
| `run-linux-checks.sh`, `run-mac-checks.sh` | the full runs |
| `escape-checks.sh`, `socket-checks.sh`, `race-check.sh`, `watch-protected.ts`, `overhead.sh`, `playwright-check.mjs`, `mac-mach-register-probe.mjs`, `today-mac-profile.sh` | the individual checks |
| `results/` | final configs (`linux.srt.json`, `macos.srt.json`), today's macOS profile as rebuilt, run logs |

The test workspace sat inside a denied tree (`/tmp/proto` under the denied
`/tmp`), the same shape as `~/.cawco/workspaces/<id>` under the denied `$HOME`.

To reproduce:
1. Linux:
   - `npm i @anthropic-ai/sandbox-runtime@0.0.79` in a scratch dir;
   - put a static `rg` at `~/.cache/srt-eval/bin/rg` (the path `srt-config.ts`
     names; this run used ripgrep 14.1.1 musl);
   - `git clone --shared <repo> <clone>`, `bun install` in it;
   - `SRT=<scratch>/node_modules/.bin/srt run-linux-checks.sh <clone> <state> <some other repo's .env>`.
2. Mac:
   - lay out `<scratch>/{node_modules,artifacts,ws}`;
   - `prepare-clone.sh` the clone;
   - `bun srt-config.ts <clone> <scratch>/state <scratch>/state/srt.json`;
   - `bash run-mac-checks.sh <scratch> <some other repo's .env>`.

The scratch dirs, clones and caches of this run are deleted.

### Works (final runs, `results/linux-run.txt`, `results/macos-run.txt`)

| check | obelisk | Mac |
|---|---|---|
| bun install (workspace's own cache, through the proxy) | 0.3s warm / 5.5s cold, exit 0 | 0.1s / 5.3s cold, exit 0 |
| build | dashboard `vite build` 43–46s (bare 44s) | `bun run build:core` exit 0 |
| `git add -A` + commit | exit 0, from the root and from a subdirectory | exit 0 |
| Playwright, Chromium from the shared browser cache | `{"text":"inside srt"}` ~330 ms | fails, #210 (see 5h) |
| server from one command, reached and killed by the next | `next command: 200`, `stopped by a later command` | not run (same runner) |
| swift build (AnbarKit) | — | 31.9s compile (bare 37.8s, load ~900) |
| xcodebuild, iOS Simulator | — | template app `BUILD SUCCEEDED` 8.7s (bare 9s). anbar: packages and plug-ins run, then fails on `Theme.swift:68` exactly as the bare control does |
| network allowlist | github 200, example.com refused | via proxy |

### Escapes (writes verified from the host, reads need content)

| check | today Linux | srt Linux | today macOS* | srt macOS |
|---|---|---|---|---|
| read `~/.cawco/accounts` | OPEN | blocked | OPEN | blocked |
| read a harness sign-in | blocked | blocked | blocked | blocked |
| read another repo's `.env` | OPEN | blocked | OPEN | blocked |
| read `~/.ssh` key | OPEN | blocked | OPEN | blocked |
| connect user bus / sessiond | blocked | blocked | blocked | blocked |
| signal a process outside | n/a | blocked | blocked | blocked |
| ssh to the Mac (obelisk → Mac) | **OPEN** | blocked | n/a | n/a |
| write `~/.bun/bin` | OPEN | blocked | OPEN | blocked |
| write `~/.cache` (host runs it) | OPEN | blocked | OPEN | blocked |
| plant `.git/hooks` | OPEN | blocked | OPEN | blocked |
| set `core.hooksPath` | OPEN | blocked | OPEN | blocked |
| write `.git/modules/*/config` | OPEN | blocked | OPEN | blocked |
| plant a hook in the source repo | blocked | blocked | blocked | blocked |
| write `.claude/settings.local.json` | OPEN | blocked | OPEN | blocked |
| write `opencode.jsonc` | OPEN | blocked | OPEN | blocked |
| host loopback services (hub API :3456) | open (host network) | 403 | open | open (5l) |
| tailscaled / system bus / snapd / sshd unix / mullvad sockets | **connect** | not visible | refused | refused |

\* today's macOS profile rebuilt rule for rule from `profileOf` by
`today-mac-profile.sh` and run with `sandbox-exec` on the same scratch clone.

## 5. What the prototype found, and what closed each

Each of these was hit live. Where CawCo can close it, the prototype does, and
the check above proves it.

**a. Per-command srt breaks the dev-server workflow.** Each `srt` invocation
gets its own network and pid namespace and kills its processes on exit
(`--die-with-parent`). Measured: `next-command 000`, `concurrent-command 000`,
`host 000`. → **Runner**: one srt sandbox per workspace, held like today's
anchor, commands handed in over a FIFO. That is today's macOS executor, already
in production, now on both platforms. It also cuts per-command cost from
~280 ms to ~32 ms (Linux) and from ~316 ms to ~121 ms (Mac). The cost of the
runner: srt computes its mount plan (mandatory-deny scan, glob expansion) once
per runner start, not per command.

**b. srt's seccomp layer cannot start on obelisk.** The host's
`/etc/apparmor.d/bwrap-userns-restrict` stacks every bwrap child under
`unpriv_bwrap` with `audit deny capability`, attached by binary path (inside
bwrap: `bwrap//&unpriv_bwrap (enforce)`, `CapBnd: 0`). → `allowAllUnixSockets: true`
and hide sockets by path: `denyRead` of `/run`, `/var/run`, `/tmp`, `$HOME`.
srt's netns cuts off abstract sockets. Result: every host socket "not visible".
The alternative is a local AppArmor override, a root-level host change; not
recommended.

**c. srt's placeholders break `git add -A`.** For a protected name that does not
exist, srt mounts a read-only empty file there for the sandbox's life, and git
says `.bash_profile: can only add regular files…`. → `prepare-clone.sh` writes
the names into the clone's `info/exclude`, as `checkout-exclude.ts` does today.

**d. `.git/config` protection detaches when the host renames the file.** srt's
deny is a read-only bind on the file. The kernel drops that mount in every other
namespace when the host renames over its target, and host `git config` writes by
lock-then-rename. Measured: `findmnt` inside goes from `.git/config` to `.git`;
the sandbox then sets `core.hooksPath=/tmp/evil-hooks`, and the host reads it.
- A host watch that kills the sandbox on the event loses the race: the
  in-sandbox writer won 3 of 4 trials (`race-check.sh`).
- The sandbox can also block host `git config` by holding `.git/config.lock`.
- The executor's mount check (`runner-exec.sh`) refuses the next command and
  kills the whole sandbox (measured: exit 126; sandbox, background process and
  srt gone). That limits the damage; it does not close the window.

The closing fixes are on the host side:
1. CawCo never writes a live clone's config. It writes `branch.*` only in
   `cloneInPlace`, before the boundary starts (`clone.ts:234`).
2. Host-side git treats a clone's config as untrusted (`-c core.hooksPath=/dev/null
   -c core.fsmonitor=false …`), which is the parallel item's work.

Today's boundary leaves `.git/config` plainly writable, so this is still
strictly better.

**e. Killing srt does not kill the sandbox.** SIGKILL to srt leaves its
`sh -c bwrap` child, so bwrap's parent lives and `--die-with-parent` never
fires; SIGTERM did not stop it either. → Close kills the **outer bwrap**; srt
then exits on its own and removes its proxy, socat bridge and mount points.
Measured: `bwrap left: 0, sleep left: 0, socat bridges left: 0`.

**f. srt #446 hit the scratch layout.** A writable `tmp/` inside an allowed-read
state dir came out read-only (`Read-only file system` on the request files). →
State layout `ro/` (read-only: runner, FIFO, empty git template) beside
writable `tmp/` and `cache/`, never nested. This would have broken production,
where state lives under the denied `$HOME`.

**g. macOS mandatory denies break nested repositories.** Each deny, in order:
- `**/.git/hooks/**` blocks git's template copy. → `GIT_TEMPLATE_DIR`=empty dir.
- `**/.git/config` blocks `git init` of a checkout. → `allowGitConfig: true`
  plus a literal deny of the clone's own `.git/config`.
- `**/.vscode/**` blocks checking out a dependency that ships one, and isn't
  configurable. → the `swift` shim adds `--scratch-path` in the workspace's
  cache (the denies are anchored at the clone, #432).

Nested checkouts' configs are then writable; on Linux srt's depth-3 scan never
reached `.build/checkouts/*/.git/config` anyway.

**h. Chromium cannot start inside srt on macOS** (#210). Adding
`(allow mach-register (global-name-prefix "org.chromium."))` to srt's own
profile makes it pass (`mac-mach-register-probe.mjs`: `{"text":"inside srt"}`,
exit 0). The fix belongs upstream as the `allowMachRegister` option #210
proposes. Patching srt's output inside CawCo would be a shim.

**i. Harness project config is a host-execution escape in both boundaries.**
- OpenCode loads `opencode.json(c)` from the session's directory
  (`opencode.ts:1270`), including plugins and MCP commands.
- Claude Code loads the project's `.claude/settings*.json`, including hooks.
- Both harness processes run on the host, outside the boundary. A command that
  writes these files runs code unbounded at the workspace's next session.

→ Literal write denies on those paths, plus placeholders excluded from git.
Trade-off: a delegate can no longer edit a repo's tracked harness config. The
root fix is harness-side (see 6).

**j. Host daemon sockets.** From today's Linux boundary a command connects to
`tailscaled.sock`, `/run/ssh-unix-local/socket`, the system bus, `snapd.socket`
and `mullvad-vpn`. → the `/run` deny (b).

**k. ssh from today's boundary.** `~/.ssh/id_ed25519` is readable inside today's
Linux boundary, and `ssh mac true` ran: a delegate on obelisk can run unbounded
commands on the Mac. This session reached the Mac that way for the brief's
own Mac work. → the `$HOME` deny.

**l. Loopback.** Allowlisting `localhost`/`127.0.0.1` let a command reach the
host's agent/hub API through srt's host-side proxy (`404` from the hub). →
removed; now `403`, while the workspace's own dev server answers `200` inside
its netns. macOS has no netns: `allowLocalBinding`, which dev servers need,
opens the host's loopback (`(remote ip "localhost:*")`,
`macos-sandbox-utils.ts:1217`), as today.

**m. Caches.** A shared writable `~/.cache`/`~/.bun` is the review's host-run
escape. → per-workspace caches (`XDG_CACHE_HOME`, `BUN_INSTALL_CACHE_DIR`,
`npm_config_cache` in the state dir); shared Playwright browsers read-only.
Cost measured on this repo: +1.9 GB per workspace on top of `node_modules`
(3.7 GB together), and a cold `bun install` of 5.5s against 0.3s warm. On macOS
DerivedData and the SwiftPM caches stay shared as today, unless the
`xcodebuild` shim always adds `-derivedDataPath` in the workspace's cache, which
the prototype did for its builds.

**n. `/tmp/claude`.** srt always grants it when it exists, shared by all of the
user's sandboxes (#654). → write-denied in the config; what is already there
stays readable (#611).

**o. srt leaves its sockets behind.** After this evaluation's ~200 srt
processes, srt's temp dir held 173 `srt-mux-<pid>-0.sock` and 124
`claude-http-*.sock` files. Which exit paths leak them was not traced (srt's
source was gone by the time they were counted). → The runner gives srt a
private temp dir per workspace (5b), removed with the workspace; with one srt
per runner start, that bounds them.

## 6. Recommendation, risks, and what needs the owner

Options, each with its risk:

1. **Adopt, runner shape, with the config above (recommended).**
   - Risks:
     - srt is 0.0.x with weekly releases and a config shape that has changed;
       mitigate by pinning and re-running `run-linux-checks.sh` /
       `run-mac-checks.sh` on every bump.
     - Two upstream bugs are worked around in CawCo's layout and config (#429,
       #446).
     - `.git/config` safety depends on host discipline (5d).
     - macOS needs #210 upstream before Playwright works there.
     - srt's mount plan is computed at runner start, so protected names created
       later (a nested repo cloned mid-session) are not covered until the runner
       restarts; on macOS the globs cover them.
   - Gains: every escape the review found closes, plus four classes it did not
     list (5i, 5j, 5k, 5l); a maintained policy engine; a network allowlist;
     credential masking available.
2. **Adopt per command.** Rejected on evidence: it breaks background servers
   (5a) and costs ~280 ms per command.
3. **Don't adopt; close the escapes in the hand-rolled code.**
   - Risk: CawCo keeps owning a mount namespace setup that already needed a
     direct `mount_setattr` syscall because util-linux lied about recursion
     (`boundary.ts:810-816`), plus a hand-written Seatbelt profile.
   - It must still add everything this report found: read denies, socket
     hiding, harness config, loopback, caches.
   - None of srt's mandatory protections, network filtering or credential
     masking.

**Owner decisions** (each changes product behaviour, so none is taken here):
- **Network policy.** srt has no allow-all. Today delegates reach any host. The
  prototype's list is in `srt-config.ts`. Options:
  - a fleet-level allowlist with per-workspace additions;
  - srt's ask callback, which needs the library hosted in a long-lived CawCo
    process rather than the CLI;
  - TLS termination to inspect and mask credentials.
- **Per-workspace caches** (5m): disk and cold-install cost against closing the
  host-run cache escape.
- **Harness project config** (5i): deny writes in the sandbox (prototype) or stop
  host-side harnesses loading project config for delegates (Claude Code's
  setting sources, OpenCode's project config) — the robust fix, but it changes
  what CLAUDE.md and project settings reach a delegate.

## 7. Migration (cutover; the hand-rolled policy code is deleted)

1. **Dependency.**
   - Add `@anthropic-ai/sandbox-runtime` pinned (0.0.79 or the next tested
     release), embedded in the binary build like the other boundary scripts
     (`scripts/build-binary.ts:232-236`); run its `dist/cli.js` with the
     binary's own runtime (`BUN_BE_BUN=1`, as the hook does).
   - Linux machines need `bwrap`, `socat` and `rg`. A machine without them
     refuses the work, as one that cannot hold a boundary does today
     (`boundary.ts:670-675`).
2. **Config.** Port `srt-config.ts` into the agent as the one place a
   workspace's policy is written (`~/.cawco/workspaces/<id>/srt.json`, read-only
   inside), with the state layout `ro/`, `tmp/`, `cache/`.
3. **Boundary start.**
   - sessiond holds `srt --settings srt.json -c ro/runner.sh ro/runner.fifo`,
     with cwd = the clone, `TMPDIR` = the short private dir, and
     `CLAUDE_CODE_TMPDIR` = `tmp/`.
   - Ready is the runner's ready line, as today (`boundary.ts:1077-1119`).
   - Record the outer bwrap pid (Linux) for close and for the mount check.
4. **Executor.** One FIFO executor for both platforms (today's `darwinExec`).
   It adds:
   - the per-workspace cache env and `GIT_TEMPLATE_DIR`;
   - the Linux mount check of `.git/config` and `.git/hooks`.

   The hook, the OpenCode plugin `bash`, pi's operations and workflow
   `runCommand` keep calling `exec` unchanged.
5. **Clone preparation.** `info/exclude` lines for srt's placeholders, written
   once at workspace creation (`checkout-exclude.ts`).
6. **Close.** SIGKILL the outer bwrap (Linux) or the marked processes (macOS),
   then the state dir.
7. **Form replacement.** Hash `srt.json`, the runner and the executor into the
   form, so a policy change replaces idle runners (`boundary.ts:716-807`, now
   on both platforms).
8. **Delete** from `boundary.ts`:
   - `ANCHOR`, `linuxSpec`, `linuxExec`, `copySshIncludes`/`SSH_INCLUDES`,
     `hideable`, `runOf`, `userNamespaceOf` identity checks;
   - `profileOf`, `secretRealpath`, `sbString`, `darwinSpec`'s profile writing;
   - the Linux/macOS split in `start`/`ensure`/`closeBoundary`.

   Keep `hookScript` and the fail-closed hook machinery, `claudeBoundaryOptions`,
   `launchedHook`, `rearmHooks`, the `swift`/`xcodebuild`/`log` shims (`swift`
   gains `--scratch-path`; `xcodebuild` gains `-derivedDataPath` in the
   workspace cache), `log-relay.ts`, `boundary-log*.ts`, and the FIFO runner.
9. **macOS** goes after #210 is released upstream; Linux does not wait for it.
10. **Proof** is `run-linux-checks.sh` and `run-mac-checks.sh` against a real
   delegate workspace on each machine after the deploy, plus one live delegate
   that starts a dev server and drives it with Playwright.

## 8. Unverified

- Today's executor overhead (nsenter) could not be measured: this session runs
  inside it. The hook's own rewrite costs 15 ms (bun, measured).
- The Linux runs ran srt inside this workspace's boundary (nested user
  namespace), not on the bare host. The AppArmor finding is host policy
  attached by binary path, so it holds on the host. Bare-host timings may be
  lower.
- Today's macOS column is a rebuilt profile under `sandbox-exec`, not a live
  CawCo workspace on the Mac.
- Not tried inside srt: `xcodebuild` device builds and signing,
  `simctl boot`/install, `xcodebuild test`, `ssh`/`scp` from inside (keys are
  hidden by design), Go TLS tools (`gh` via the proxy; srt's
  `enableWeakerNetworkIsolation` note), JVM tools.
- The harness-config escape (5i) is shown at the file level: the files can be
  written. No harness was launched against a planted file.

## 9. After the cutover

The product now runs §7 (packages/agent/src/boundary.ts, boundary-host.ts,
boundary-policy.ts, tool-door.ts). The prototype files beside this report stay
as the evaluation's evidence. Three scripts here check the product itself:
- `run-linux-checks.sh [OTHER_CLONE] [HOST_PID]`: run from inside a Linux
  workspace. It prints every escape row, and exits 1 if any is open.
- `run-linux-works.sh`: what must keep working, also from inside a Linux
  workspace.
- `run-mac-checks.sh`: run on the Mac from an unsandboxed shell. It cuts its
  own workspace through `rig-workspace.ts`.

Found while building it:
- **A read-denied dir is an empty writable tmpfs, not read-only.** srt masks
  `/tmp` and `$HOME` with `--tmpfs` (linux-sandbox-utils.js:1415: "inside the
  sandbox it is an EMPTY WRITABLE directory", README). A `denyWrite` outside
  `allowWrite` is skipped, so nothing makes the mask read-only.
  - A write to the literal `/tmp/x` or `~/x` succeeds into the sandbox's own
    memory. It reaches nothing on the host, and it is gone when the boundary
    is replaced.
  - So the checks judge a write by the filesystem it landed on (`stat -f`).
    `findmnt -T` is not enough: it also lists the host mounts the mask covers.
- **An allowed `localhost` reaches the host's loopback.** srt's address guard
  lets an allowed reserved loopback name resolve to loopback. So the ask
  callback refuses `localhost` and `*.localhost` by name: through the proxy
  they were the hub (`200`, then `403` after the fix).
- **`alternates` chain.** A clone of a clone borrows objects two levels down.
  The policy now reads the whole chain, without which git said "unable to
  normalize alternate object path".
- **The logs were readable through `adm`.** The user is in the `adm` group, so
  `/var/log/syslog`, `auth.log` and `kern.log` were readable, and rsyslog
  copies the journal there (3 lines matched the bot-token pattern; counted,
  never printed). `/var/crash` held the user's own crash dumps (a browser's,
  96 MB of its memory). The policy now denies `/var/log`, `/var/crash`,
  `/var/lib/apport` and `/var/lib/systemd/coredump`, and `journalctl` and
  `coredumpctl` do not run (they exit 0 when they can read nothing).
- **A host-side rename of `.git/config` detaches its deny** (a kernel rule for
  file binds; srt cannot prevent it). The srt host watches `.git` from the
  host. It kills the sandbox and everything in it 3.4–4.0 ms after the rename
  (3 runs), then starts a new one under the same host pid and FIFO. The
  executor checks the mount table too, before each command. A command in
  flight is cut off (exit 137, with a sentence). The next command runs in the
  new sandbox about 170 ms later, as its pid namespace shows, so a running
  session never sees the boundary gone.
- **An executor whose sandbox died waited forever** for a status that no one
  would write. It now follows the sandbox that took its request (the runner
  stamps it with its pid namespace), and is cut off when that one is gone.
- **The tool door cut a call at 10 s.** Bun applies its 10 s idle default to a
  unix-socket server too. bun-types 1.4.2, the latest, declares `idleTimeout`
  only for host:port servers, so the door passes it untyped. Through the door,
  a hub answering after 25 s now gives `200` after 25 s.
- **Per-command cost:** 27 ms median through the boundary (`bash -c true`
  alone: 4 ms). When the caller has no `GH_TOKEN`, the executor's
  `gh auth token` on the host adds 26 ms; that lookup has been on main since
  b1fe1c40.
