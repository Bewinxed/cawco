/**
 * The files a boundary's commands find in its read-only dir: the plain Bun
 * scripts it runs, and the shims for `xcodebuild`, git, Chromium and `gh` that
 * keep them working inside.
 */

import {
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { makeFolder } from "@cawco/core/folders";
import { workspaceCacheDir } from "@cawco/core/paths/workspace";
import { embeddedFile, standalone } from "@cawco/core/runtime";
import { shellQuote } from "@cawco/core/shell-quote";
import { systemProgram } from "@cawco/core/workspace-needs";
import { browserExecutable } from "../capabilities";
import { githubDoorOf } from "../github-door";
import { gitHelperDirOf } from "../hub-git";
import { logRelay } from "../log-relay";
import { GIT_MOVE, gitShim, shimPaths } from "../worktree-guard";
import { roOf, writeWhole } from "./state";

/** One of the plain Bun scripts the boundary runs: as the binary install embedded it (scripts/build-binary.ts), or the checkout's `source`. */
export const scriptText = (embedded: string, source: string): Promise<string> =>
  Bun.file(standalone ? embeddedFile(embedded) : source).text();

/**
 * Writes one of the plain Bun scripts the boundary runs into `dir`, under its
 * source name: from this checkout (`source`, by default in the agent's src, beside boundary/),
 * or as the binary install embedded it.
 */
const writeScript = async (
  dir: string,
  name: string,
  embedded: string,
  source = join(import.meta.dir, "..", name)
): Promise<string> => {
  const path = join(dir, name);
  await writeWhole(path, await scriptText(embedded, source), 0o644);
  return path;
};

/**
 * The tools a macOS boundary runs in its own way, each a shim on its PATH.
 * macOS sandboxes do not nest: the boundary is Seatbelt's sandbox, so a tool
 * that makes one of its own inside it fails (srt #67).
 *
 * - `swift build|test|run|package` gets `--disable-sandbox`: SwiftPM's
 *   "Disable using the sandbox when executing subprocesses"
 *   (docs.swift.org/…/packagemanagerdocs/swiftbuild), which also hands the
 *   compiler `-disable-sandbox` for macro servers
 *   (github.com/swiftlang/swift-package-manager/pull/7167). Its
 *   `--cache-path` and `--security-path` go in the workspaces' cache
 *   (SwiftPM's own, in `~/Library`, are the host's and read-only here), and
 *   so does its build dir, `--scratch-path`, one per package dir, unless the
 *   command names its own (REPORT.md §5m).
 * - `xcodebuild` gets the IDE defaults that turn off its package manifest and
 *   plugin sandboxes, as nixpkgs builds Xcode projects under its own sandbox,
 *   and `-disable-sandbox` in OTHER_SWIFT_FLAGS for macro plugin servers. Its
 *   DerivedData goes in the workspaces' cache, `DerivedData.noindex` (a
 *   name Spotlight never indexes), through the
 *   `IDECustomDerivedDataLocation` default, which every action takes, where
 *   `-derivedDataPath` is refused by some (`-showsdks`, exit 64); its
 *   package cache through `-packageCachePath`, which only a build or a
 *   package resolution takes. A build skips Xcode's macro and package
 *   plugin trust checks (`-skipMacroValidation`,
 *   `-skipPackagePluginValidation`), as the boundary's evaluation built with
 *   (REPORT.md, results/macos-run.txt): they ask whether the owner trusts a
 *   macro or plugin before it runs on the host, read from the host's
 *   `~/Library/org.swift.swiftpm/security`, which the boundary hides, and a
 *   workspace's build runs them inside the boundary. It runs with a home of its own
 *   ({@link writeXcodeHome}), so what Foundation puts under `~/Library/Caches`
 *   (SwiftPM's manifest cache among it) lands in the workspaces' cache.
 * - `log`, which Seatbelt refuses outright, asks the agent to run `log show`
 *   or `log stream` outside the boundary (`log-relay.ts`).
 *
 * Each finds the real tool with `xcrun --find`, so it follows the selected
 * Xcode. Nothing is set globally: the owner's own Xcode is untouched.
 */
/**
 * The entries of `~/Library` an xcodebuild inside a macOS boundary writes,
 * each its own in the workspaces' cache ({@link writeXcodeHome}): Foundation's
 * caches dir, where SwiftPM keeps its shared cache and manifest database
 * (`swiftPMCacheDirectory`, FileManager's caches dir + `org.swift.swiftpm`,
 * Sources/Basics/FileSystem/FileSystem+Extensions.swift), the logs, and
 * SwiftPM's configuration and security dir.
 */
const XCODE_OWN_LIBRARY = ["Caches", "Logs", "org.swift.swiftpm"];

/** The home a macOS workspace's xcodebuild runs with (`CFFIXED_USER_HOME`): in the part of its state dir a command reads. */
const xcodeHomeOf = (id: string): string => join(roOf(id), "xcode-home");

/** Where {@link XCODE_OWN_LIBRARY}'s entries live, in the workspaces' cache. */
const xcodeLibraryCache = (): string =>
  join(workspaceCacheDir(), "xcode-library");

/**
 * The home xcodebuild runs with inside a macOS boundary. Seatbelt lets it
 * write nothing under the host's `~/Library`, and xcodebuild keeps SwiftPM's
 * manifest database under `~/Library/Caches/org.swift.swiftpm/manifests`
 * whatever `-packageCachePath` says, so package resolution failed ("The file
 * “ManifestLoading” couldn’t be saved in the folder “manifests”", Nightly C,
 * 2026-10-10). Opening the host's would let a workspace plant manifest
 * results the owner's own Xcode then trusts. `CFFIXED_USER_HOME` is the home
 * CoreFoundation, and Foundation through it, hands the process instead of
 * the account's; this one's `Library` holds a link to each entry of the
 * host's `~/Library`, which Seatbelt judges where it lands (the policy reads
 * `Developer` and `Preferences`: the simulators, Xcode's settings), and, for
 * {@link XCODE_OWN_LIBRARY}, a link into the workspaces' cache, which the
 * shim makes inside. Written here, on the host, only in the read-only part
 * of the state dir: nothing the workspace writes is followed. Each link is
 * replaced by a rename, so an xcodebuild running meanwhile never finds one
 * missing.
 */
const writeXcodeHome = async (id: string): Promise<void> => {
  const library = join(xcodeHomeOf(id), "Library");
  await makeFolder(library);
  const hostLibrary = join(homedir(), "Library");
  const names = await readdir(hostLibrary).catch(() => []);
  const links = new Map<string, string>([
    ...names.map((name): [string, string] => [name, join(hostLibrary, name)]),
    ...XCODE_OWN_LIBRARY.map((name): [string, string] => [
      name,
      join(xcodeLibraryCache(), name),
    ]),
  ]);
  await Promise.all(
    [...links].map(async ([name, target]) => {
      const link = join(library, name);
      if ((await readlink(link).catch(() => undefined)) === target) {
        return;
      }
      const temporary = `${link}.${process.pid}.tmp`;
      await rm(temporary, { force: true });
      await symlink(target, temporary);
      await rename(temporary, link);
    })
  );
};

/**
 * The `git` first on workspace `id`'s commands' PATH and its judge, in its
 * read-only bin (worktree-guard.ts `gitShim`), on both OSes: a session's
 * move of the worktree never ends 0 with a path the boundary keeps dropped
 * or stale, whichever harness runs it.
 */
export const writeGitShim = async (id: string, path: string): Promise<void> => {
  const bin = gitHelperDirOf(id);
  await makeFolder(bin);
  const shim = gitShim(
    id,
    bin,
    await realpath(path),
    await shimPaths({ id, path })
  );
  await Promise.all([
    writeWhole(join(bin, "git"), shim.git, 0o755),
    writeWhole(join(bin, GIT_MOVE), shim.move, 0o755),
  ]);
};

/** The Chromium a workspace's commands launch by name, in its read-only bin ({@link writeChromiumShim}). */
const CHROMIUM_SHIM = "cawco-chromium";

/** Workspace `id`'s {@link CHROMIUM_SHIM}, which `IMPECCABLE_BROWSER` names (exec.ts `commandEnv`). */
export const chromiumShimOf = (id: string): string =>
  join(gitHelperDirOf(id), CHROMIUM_SHIM);

/**
 * The machine's Chromium (capabilities.ts `browserExecutable`: Chrome or
 * Chromium on PATH, else Playwright's newest) with `--no-sandbox`, as
 * {@link CHROMIUM_SHIM}, on both OSes. Chromium's own sandbox cannot start
 * inside the boundary: on Linux the boundary's bwrap runs with
 * `--disable-userns`, so `unshare -Ur` there says "No space left on
 * device" and Chromium's namespace sandbox has none to make, and its setuid
 * helper lies on a nosuid mount (Brave: "The SUID sandbox helper binary was
 * found, but is not configured correctly … Aborted"; Playwright's Chromium:
 * "No usable sandbox!"); macOS's Seatbelt does not nest (core
 * boundary-nesting.ts). That is the rule capabilities.ts
 * `chromiumSandboxed` keeps for the daemon's own browsers, and the probe
 * kit's Chromium launches with `--no-sandbox` for it (kit.ts `browser`).
 * The boundary still holds the browser.
 *
 * A tool that launches a Chromium of its own finds this one by name:
 * impeccable's URL scans (`impeccable detect --viewport WxH <url>`) take
 * `IMPECCABLE_BROWSER` before any browser on the machine ("point
 * IMPECCABLE_BROWSER at a Chromium-based browser executable", its error
 * when it finds none). Playwright's own launches pass `--no-sandbox`
 * already (its `chromiumSandbox` defaults to false), and its WebKit builds
 * carry no sandbox of their own.
 */
export const writeChromiumShim = async (id: string): Promise<void> => {
  const bin = gitHelperDirOf(id);
  await makeFolder(bin);
  const chromium = browserExecutable();
  await writeWhole(
    chromiumShimOf(id),
    chromium
      ? `#!${systemProgram("sh")}
# CawCo workspace ${id}: the machine's Chromium, without its own sandbox inside the boundary's.
exec ${shellQuote(chromium)} --no-sandbox "$@"
`
      : `#!${systemProgram("sh")}
echo "${CHROMIUM_SHIM}: no Chrome or Chromium on this machine, nor Playwright's (bunx playwright install chromium)" >&2
exit 1
`,
    0o755
  );
};

export const writeShims = async (
  id: string,
  runtime: string
): Promise<void> => {
  const bin = gitHelperDirOf(id);
  await makeFolder(bin);
  await writeXcodeHome(id);
  await writeScript(
    roOf(id),
    "boundary-log-protocol.ts",
    "boundary/log-protocol.ts"
  );
  const client = await writeScript(
    roOf(id),
    "boundary-log.ts",
    "boundary/log.ts"
  );
  const { port, token } = logRelay();
  const cache = workspaceCacheDir();
  const swiftpm = shellQuote(join(cache, "swiftpm"));
  await Promise.all([
    writeWhole(
      join(bin, "swift"),
      `#!${systemProgram("bash")}
# CawCo workspace ${id}: swift, with SwiftPM's own sandbox off inside the boundary's
# and its caches and build dir in the workspaces' cache.
swift=$(${systemProgram("xcrun")} --find swift) || exit 1
case "\${1:-}" in
  build | test | run | package)
    command=$1
    shift
    scratch=()
    case " $* " in
      *" --scratch-path"* | *" --build-path"*) ;;
      *) scratch=(--scratch-path ${swiftpm}/build/"$(${systemProgram("md5")} -q -s "$PWD")") ;;
    esac
    exec "$swift" "$command" --disable-sandbox --cache-path ${swiftpm}/cache --security-path ${swiftpm}/security "\${scratch[@]}" "$@"
    ;;
esac
exec "$swift" "$@"
`,
      0o755
    ),
    writeWhole(
      join(bin, "xcodebuild"),
      `#!${systemProgram("bash")}
# CawCo workspace ${id}: xcodebuild, with its package and macro sandboxes off inside the boundary's
# and its DerivedData and package cache in the workspaces' cache.
xcodebuild=$(${systemProgram("xcrun")} --find xcodebuild) || exit 1
flags=
builds=
packages=
args=()
for arg in "$@"; do
  case $arg in
    OTHER_SWIFT_FLAGS=*)
      args+=("$arg -disable-sandbox")
      flags=1
      ;;
    build | build-for-testing | test | archive | analyze | install)
      args+=("$arg")
      builds=1
      ;;
    test-without-building | clean | installsrc | -resolvePackageDependencies)
      args+=("$arg")
      builds=1
      ;;
    -packageCachePath)
      args+=("$arg")
      packages=1
      ;;
    *) args+=("$arg") ;;
  esac
done
[ -n "$flags" ] || args+=('OTHER_SWIFT_FLAGS=$(inherited) -disable-sandbox')
[ -z "$builds" ] || [ -n "$packages" ] || args+=(-packageCachePath ${swiftpm}/xcode)
[ -z "$builds" ] || args+=(-skipMacroValidation -skipPackagePluginValidation)
# A home of its own, whose Caches, Logs and org.swift.swiftpm are the workspaces' cache.
mkdir -p ${XCODE_OWN_LIBRARY.map((name) => shellQuote(join(xcodeLibraryCache(), name))).join(" ")} || exit 1
export CFFIXED_USER_HOME=${shellQuote(xcodeHomeOf(id))}
exec "$xcodebuild" -IDEPackageSupportDisableManifestSandbox=YES -IDEPackageSupportDisablePluginExecutionSandbox=YES -IDECustomDerivedDataLocation=${shellQuote(join(cache, "DerivedData.noindex"))} "\${args[@]}"
`,
      0o755
    ),
    // The xcrun a build before this one wrote, which waited on a heavy-run
    // slot through a `cawco heavy-run` that no longer exists.
    rm(join(bin, "xcrun"), { force: true }),
    writeWhole(
      join(bin, "log"),
      `#!${systemProgram("sh")}
# CawCo workspace ${id}: log show and log stream, run by the agent outside the boundary.
${standalone ? "export BUN_BE_BUN=1\n" : ""}exec ${[runtime, client, String(port), token].map(shellQuote).join(" ")} "$@"
`,
      0o755
    ),
  ]);
};

/**
 * The gh config dir every workspace's commands run with (`GH_CONFIG_DIR`,
 * exec.ts `commandEnv`), read-only inside: `http_unix_socket`
 * names the workspace's GitHub door, so gh sends every request there in the
 * clear (go-gh pkg/api/client_options.go `resolveOptions`: "if
 * opts.UnixDomainSocket == \"\" … cfg.Get([]string{\"http_unix_socket\"})"),
 * and its login is a placeholder the door replaces with the host's token.
 * `version: "1"` is the config gh would migrate to, so it writes nothing
 * here.
 */
export const guardedGhConfigOf = (id: string): string =>
  join(roOf(id), "gh-guarded");

/** The placeholder gh signs in with in a workspace: no token at all. */
const GH_PLACEHOLDER = "cawco-github-door";

export const writeGuardedGhConfig = async (id: string): Promise<void> => {
  const dir = guardedGhConfigOf(id);
  await makeFolder(dir);
  await Promise.all([
    writeWhole(
      join(dir, "config.yml"),
      `# CawCo workspace ${id}: gh reaches GitHub through the workspace's GitHub door.\nversion: "1"\nhttp_unix_socket: ${JSON.stringify(githubDoorOf(id))}\n`,
      0o644
    ),
    writeWhole(
      join(dir, "hosts.yml"),
      `github.com:\n    git_protocol: https\n    user: cawco\n    oauth_token: ${GH_PLACEHOLDER}\n    users:\n        cawco:\n            oauth_token: ${GH_PLACEHOLDER}\n`,
      0o644
    ),
  ]);
};
