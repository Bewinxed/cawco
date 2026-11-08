/** The environment every command a workspace runs starts with. */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { xdgDataHome } from "@cawco/core/paths/cawco";
import { hostPlaywrightBrowsers } from "@cawco/core/paths/host-policy";
import {
  workspaceCacheDir,
  workspaceScratchDir,
  workspaceTmpDir,
} from "@cawco/core/paths/workspace";
import { hostJavaHome } from "@cawco/core/workspace-needs";

/**
 * Where the host's operating system keeps its trusted CA certificates: the
 * bundles and dirs Go's crypto/x509 looks for, in its order
 * (src/crypto/x509/root_linux.go: "Possible certificate files; stop after
 * finding one"), on macOS the bundle the system ships at /etc/ssl/cert.pem.
 */
const HOST_CA_FILES: Record<string, readonly string[]> = {
  linux: [
    "/etc/ssl/certs/ca-certificates.crt", // Debian, Ubuntu, Gentoo
    "/etc/pki/tls/certs/ca-bundle.crt", // Fedora, RHEL 6
    "/etc/ssl/ca-bundle.pem", // openSUSE
    "/etc/pki/tls/cacert.pem", // OpenELEC
    "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem", // CentOS, RHEL 7
    "/etc/ssl/cert.pem", // Alpine
  ],
  darwin: ["/etc/ssl/cert.pem"],
};
const HOST_CA_DIRS: Record<string, readonly string[]> = {
  linux: ["/etc/ssl/certs", "/etc/pki/tls/certs"],
  darwin: [],
};

/**
 * `SSL_CERT_FILE` and `SSL_CERT_DIR` naming the host's own CA store (the
 * first bundle and dir of {@link HOST_CA_FILES} and {@link HOST_CA_DIRS}
 * this host has), for every command a workspace runs: OpenSSL reads them
 * before the CA paths it was built with, so whatever binary is first on
 * PATH verifies TLS against the host's store. A curl from a relocated
 * package prefix was built with one that does not exist (zerobrew's,
 * `/home/linuxbrew/.linuxbrew/etc/openssl@3`) and verified no certificate.
 * Empty on a host that has neither.
 */
export const hostCaEnv = (): Record<string, string> => {
  const isFile = (path: string): boolean =>
    existsSync(path) && statSync(path).isFile();
  const isDir = (path: string): boolean =>
    existsSync(path) && statSync(path).isDirectory();
  const file = (HOST_CA_FILES[process.platform] ?? []).find(isFile);
  const dir = (HOST_CA_DIRS[process.platform] ?? []).find(isDir);
  return {
    ...(file ? { SSL_CERT_FILE: file } : {}),
    ...(dir ? { SSL_CERT_DIR: dir } : {}),
  };
};

/**
 * A workspace's own XDG config, data and state homes, in its scratch dir: so
 * made with it and gone with it (boundary.ts `makeDirs`, `closeBoundary`). A
 * CLI that writes its own state there as it starts (OpenCode makes
 * `$XDG_DATA_HOME/opencode/log` at boot) runs inside the boundary, and the
 * person's real ones (OpenCode's `auth.json`, its `opencode.json`, its
 * database) stay hidden: the boundary refuses every write under home, which
 * on macOS failed that start with EEXIST.
 */
export const workspaceXdgDirs = (
  id: string
): { config: string; data: string; state: string } => {
  const root = join(workspaceScratchDir(id), "xdg");
  return {
    config: join(root, "config"),
    data: join(root, "data"),
    state: join(root, "state"),
  };
};

/**
 * The environment every command of workspace `id` runs with for its XDG base
 * dirs: its own config, data and state homes ({@link workspaceXdgDirs}). The
 * cache home stays the workspaces' shared one ({@link workspaceCacheEnv}),
 * where the Apple build root and every tool's cache already are. Two readers
 * of the host's data home keep reading it, read-only as before: uv's managed
 * Pythons and its tools (`uv python dir`, `uv tool dir` follow
 * `XDG_DATA_HOME`), so `uv` finds the interpreters it found before and never
 * downloads one per workspace. Git's own config dir goes on being read
 * through a link in the config home (boundary.ts `makeDirs`).
 */
export const workspaceXdgEnv = (id: string): Record<string, string> => {
  const own = workspaceXdgDirs(id);
  return {
    XDG_CONFIG_HOME: own.config,
    XDG_DATA_HOME: own.data,
    XDG_STATE_HOME: own.state,
    UV_PYTHON_INSTALL_DIR: join(xdgDataHome(), "uv", "python"),
    UV_TOOL_DIR: join(xdgDataHome(), "uv", "tools"),
  };
};

/**
 * A workspace's own home for Maestro, in its scratch dir: Maestro's JVM takes
 * it as `user.home` ({@link workspaceMaestroEnv}).
 */
export const workspaceMaestroHome = (id: string): string =>
  join(workspaceScratchDir(id), "maestro");

/**
 * Maestro's JVM options for every command of workspace `id`: its home in the
 * workspace ({@link workspaceMaestroHome}) and its temp dir the workspace's
 * `TMPDIR`. Maestro has no home setting of its own: its deps go to
 * `Paths.get(System.getProperty("user.home"), ".maestro", "deps", name)`
 * (maestro-cli Unpacker.kt `binaryDependency`), its logs and sessions under
 * that home too, and its iOS driver and xcodebuild's output to
 * `java.io.tmpdir` (on macOS the per-user temp dir, every app's). Its
 * launcher passes `MAESTRO_OPTS` to `java` ("You can also use JAVA_OPTS and
 * MAESTRO_OPTS to pass JVM options to this script"), each word through
 * `xargs`, so a quoted path keeps its spaces. Its state already follows
 * `XDG_STATE_HOME` (EnvUtils.kt `xdgStateHome`). A caller that sets
 * `MAESTRO_OPTS` itself appends to this one.
 *
 * And `JAVA_HOME`, the machine's JDK ({@link hostJavaHome}), which the
 * workspace reads (workspace-policy.ts `workspacePolicy`): the launcher runs
 * `$JAVA_HOME/bin/java`, else the PATH's `java`, and on macOS that is
 * /usr/bin/java, a stub that finds only JDKs installed for java_home(1)
 * ("Unable to locate a Java Runtime" with Homebrew's alone). None when the
 * machine has no JDK; the launcher then says so.
 */
export const workspaceMaestroEnv = (id: string): Record<string, string> => {
  const java = hostJavaHome();
  return {
    MAESTRO_OPTS: `"-Duser.home=${workspaceMaestroHome(id)}" "-Djava.io.tmpdir=${workspaceTmpDir(id)}"`,
    ...(java && { JAVA_HOME: java }),
  };
};

/** The environment every workspace command runs with, pointing each tool at {@link workspaceCacheDir}. */
export const workspaceCacheEnv = (): Record<string, string> => {
  const cache = workspaceCacheDir();
  return {
    BUN_INSTALL_CACHE_DIR: join(cache, "bun"),
    npm_config_cache: join(cache, "npm"),
    // node-gyp's headers. Its default is env-paths' cache dir (bin/node-gyp.js:
    // `prog.devDir = envPaths('node-gyp', { suffix: '' }).cache`): on Linux
    // `$XDG_CACHE_HOME/node-gyp`, on macOS `~/Library/Caches/node-gyp`, a host
    // cache, whatever XDG_CACHE_HOME says, and outside the boundary. node-gyp
    // reads its options from two env prefixes (lib/node-gyp.js), and each
    // package manager forwards only one of them to an install script:
    // - `npm_config_<key>`: `bun install` passes inherited `npm_config_*` to a
    //   dependency's install script and drops every inherited `npm_package_*`
    //   (it fills those from the package being installed), so this is the one
    //   a native dependency's node-gyp sees under bun (socket-activation on a
    //   Node with no prebuilt). npm 11 warns of it ("Unknown env config").
    // - `npm_package_config_node_gyp_<key>`: "the preferred way to set options
    //   for node-gyp since npm v11", which npm passes through (run-script
    //   make-spawn-args.js: `...process.env`) and keeps once it drops the other.
    npm_config_devdir: join(cache, "node-gyp"),
    npm_package_config_node_gyp_devdir: join(cache, "node-gyp"),
    XDG_CACHE_HOME: join(cache, "xdg"),
    XDG_RUNTIME_DIR: workspaceRuntimeDir(),
    UV_CACHE_DIR: join(cache, "uv"),
    // The impeccable skill's engines, one folder per version. Its launcher
    // runs `$IMPECCABLE_HOME/bin/<version>/impeccable` for the version its
    // skill pins, and else downloads it there, checked against the release's
    // .sha256 (skills/impeccable/scripts/impeccable: `cache_root=
    // "${IMPECCABLE_HOME:-${HOME:-/nonexistent}/.impeccable}"`). Its default,
    // `~/.impeccable`, is read-only inside a boundary ("cannot create cache
    // directory: …/.impeccable/bin/0.1.17"), so every workspace fetches each
    // version once, here, and the next runs it from here.
    IMPECCABLE_HOME: join(cache, "impeccable"),
    // impeccable's hook state (`hook.cache.json`, `hook.pending.json`), which
    // its hook otherwise writes into the clone's `.impeccable/`, hidden only
    // by the clone's own excludes, so every finished item found a file in no
    // commit. With this root set the hook keeps it in a folder per project
    // path here instead (crates/hook/src/hook_lib.rs `hook_state_dir`: "When
    // IMPECCABLE_CACHE_ROOT is set, state relocates to a per-project
    // subdirectory of that root instead, so project roots stay free of tool
    // artifacts"). The hook runs through the CLI's shell prefix, so with this
    // environment.
    IMPECCABLE_CACHE_ROOT: join(cache, "impeccable", "hook"),
    PLAYWRIGHT_BROWSERS_PATH: hostPlaywrightBrowsers(),
  };
};

/**
 * Every workspace command's `XDG_RUNTIME_DIR`: `run/` in the workspaces'
 * cache, mode 0700 (boundary.ts `makeDirs`), one for all workspaces. pnpm 12
 * keeps the locks that coordinate processes sharing a store outside the
 * store, in `$XDG_RUNTIME_DIR/pnpm-store-operation-locks-<uid>`, else under
 * `/tmp` ("A sandbox that blocks writes to `/tmp` can set `XDG_RUNTIME_DIR` to
 * a directory it allows. Processes that use the same store should see the
 * same `XDG_RUNTIME_DIR`", pnpm/docs/settings/store.md at v12.14.0). It takes
 * the runtime dir only when the user owns it and other users cannot write to
 * it (crates/fs/src/secure_temp_lock.rs `xdg_runtime_dir`), so it is never
 * made group-writable. Without it a boundary had no lock dir it shared: on
 * Linux `/run` and `/tmp` are each an empty read-only tmpfs of the
 * boundary's own (boundary-policy.ts `srtSettings`); a runtime dir the boundary
 * shows read-only (the scratch fleet's, under home) failed every install
 * ("Failed to open the store operation lock at \"pnpm-store-operation-locks\":
 * Read-only file system"); and on macOS Seatbelt refuses writes to `/tmp`.
 * Here every workspace takes its locks beside the others', for the store they
 * share (boundary.ts `writePnpmConfig`). Like everything else in the cache, a
 * socket one workspace binds here another can reach.
 */
export const workspaceRuntimeDir = (): string =>
  join(workspaceCacheDir(), "run");

/**
 * The variables that name a key agent's socket: ssh-agent's, GPG's, the
 * desktop keyring's. Every workspace command runs without them, so nothing
 * inside signs or logs in with the host's keys, wherever the socket lies.
 */
export const AGENT_SOCKET_ENV = [
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "GPG_AGENT_INFO",
  "GNOME_KEYRING_CONTROL",
] as const;
