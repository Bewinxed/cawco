/**
 * Every git-lfs run on the host for a project's repository is held to one
 * endpoint and one credential; nothing a repository carries (its committed
 * `.lfsconfig`) redirects one, or has it ask for a credential for another
 * host. The endpoint is the project's declared one when it has one (its
 * Large files setting: where its large files live, bound to a fleet
 * connection, whose credential the hub hands this machine,
 * {@link declaredLfs}), else its origin's own (`<clone-url>/info/lfs`,
 * move.ts `lfsEndpointOf`), pinned env-only (move.ts `lfsPins`,
 * `declaredPins`). Nothing is written to the clone's `.git/config`.
 *
 * A `.lfsconfig` that names an endpoint that is neither the origin's nor the
 * declared one names a server CawCo was never told of: the files it holds
 * stay pointers (`GIT_LFS_SKIP_SMUDGE=1`, git-lfs's documented pointer-only
 * mode) and nothing is fetched from it, and the project's conversation is
 * told the endpoint and how to declare it ({@link noteRefused}). It is a refusal
 * to fetch from an undeclared server, not a way round one.
 */
import { spawn } from "node:child_process";
import { CAWCO_ENV } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { machineId } from "@cawco/core/machine-id";
import { workspaceProjectFile } from "@cawco/core/paths";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { isDamagedRecord, readRecord } from "@cawco/core/state-file";
import { z } from "zod";
import { toHttpBase } from "./discovery";
import { provenFetch } from "./hub-proof";
import { type DeclaredLfs, holdDeclaredSecret, sameEndpoint } from "./move";

/** How long the hub may take to say where a project's large files live. Our choice. */
const HUB_MS = 15_000;
/** How long the host's credential helpers may take to answer for a host. Our choice. */
const HELPER_MS = 15_000;

/** Every key a `.lfsconfig` may name an endpoint by (git-lfs-config(5)). */
const ENDPOINT_KEYS =
  "^(lfs\\.url|lfs\\.pushurl|remote\\..+\\.lfsurl|remote\\..+\\.lfspushurl)$";

/**
 * Where project `projectId` declared its large files live, and its
 * connection's credential, as the hub answers this machine; none for no
 * project, a project that declared none, or a machine with no hub. The
 * credential is taken out of all git says from then on. Throws the hub's
 * words when it could not say: a run whose endpoint is unknown does not
 * start.
 */
export const declaredLfs = async (
  projectId: unknown
): Promise<DeclaredLfs | undefined> => {
  const hub = toHttpBase(process.env[CAWCO_ENV.hubUrl] ?? "");
  if (!(hub && typeof projectId === "string" && projectId)) {
    return;
  }
  const { declared } = (await askHub(
    `${hub}/api/lfs/projects/${encodeURIComponent(projectId)}`,
    {},
    `where project ${projectId}'s large files live`
  ).catch((error: Error) => {
    throw new Error(`${error.message}, so git-lfs did not run`, {
      cause: error,
    });
  })) as { declared: DeclaredLfs | null };
  if (declared) {
    holdDeclaredSecret(declared.basic);
  }
  return declared ?? undefined;
};

/**
 * The hub's JSON answer to `url`, within {@link HUB_MS}; throws, saying
 * `what` it did not say, when it answers otherwise or not at all.
 */
const askHub = async (
  url: string,
  init: RequestInit,
  what: string
): Promise<unknown> => {
  const read = await readWithin(HUB_MS, async (signal) => {
    const answer = await provenFetch(url, { ...init, signal });
    return { status: answer.status, ok: answer.ok, text: await answer.text() };
  });
  if (read.kind === "unanswered") {
    throw new Error(`the hub did not say ${what} within ${HUB_MS / 1000}s`);
  }
  const { ok, status, text } = read.value;
  if (!ok) {
    throw new Error(`the hub did not say ${what} (${status}: ${text.trim()})`);
  }
  return JSON.parse(text) as unknown;
};

/** The project workspace `id` belongs to, as the hub named it at its cut (boundary.ts `setProject`); none for none. */
export const workspaceProjectOf = async (
  id: string
): Promise<string | undefined> => {
  const kept = await readRecord(workspaceProjectFile(id), z.string()).catch(
    (error: unknown) => {
      if (!isDamagedRecord(error)) {
        throw error;
      }
    }
  );
  return kept || undefined;
};

/** The endpoint values `git config <source> --get-regexp` reads from one `.lfsconfig`; none when it names none or is not there. */
const endpointsIn = (clone: string, source: string[]): string[] => {
  const read = Bun.spawnSync(
    safeGitArgv(["config", ...source, "--get-regexp", ENDPOINT_KEYS]),
    {
      cwd: clone,
      env: { ...hostEnvironment(), ...SAFE_GIT_ENV },
      stdout: "pipe",
      stderr: "ignore",
    }
  );
  if (read.exitCode !== 0) {
    return [];
  }
  return read.stdout
    .toString()
    .split("\n")
    .map((line) => line.slice(line.indexOf(" ") + 1).trim())
    .filter(Boolean);
};

/**
 * The LFS endpoints the `.lfsconfig` of clone `clone` names: at each of
 * `treeishes` (a commit a checkout or rebase moves to), and in its working
 * tree, which git-lfs reads first.
 */
const lfsconfigEndpoints = async (
  clone: string,
  treeishes: readonly string[]
): Promise<string[]> => {
  const file = `${clone}/.lfsconfig`;
  return [
    ...new Set([
      ...treeishes.flatMap((treeish) =>
        endpointsIn(clone, ["--blob", `${treeish}:.lfsconfig`])
      ),
      ...((await Bun.file(file).exists())
        ? endpointsIn(clone, ["--file", file])
        : []),
    ]),
  ];
};

/**
 * The first endpoint the clone's `.lfsconfig` names, at `treeishes` or in
 * its working tree, that is none of `allowed` (the origin's, the declared
 * one); none when every one it names is.
 */
export const undeclaredEndpoint = async (
  clone: string,
  treeishes: readonly string[],
  allowed: readonly (string | undefined)[]
): Promise<string | undefined> =>
  (await lfsconfigEndpoints(clone, treeishes)).find(
    (named) => !allowed.some((one) => one && sameEndpoint(one, named))
  );

/**
 * Whether the host's own credential helpers hold a credential for
 * `endpoint`'s host (`git credential fill`, no prompt): git-lfs is then
 * given its access as `basic` (move.ts `lfsPins`), so a private origin's
 * first request carries it and no 401 has git-lfs write the access into
 * the clone's config; a public one, with none to give, is left to ask
 * nothing.
 */
export const hostSigns = async (endpoint: string): Promise<boolean> => {
  const url = new URL(endpoint);
  // A helper that does not answer in time holds nothing to give. git runs
  // in a group of its own, and the whole group is stopped then: the helper
  // git waits on is git's child, and stopping git alone left it running (on
  // macOS, an osxkeychain waiting on another's lock, one per door
  // connection, hub-git.ts `HOST_RUN_SILENCE_MS`).
  const read = await readWithin(
    HELPER_MS,
    (signal) =>
      new Promise<boolean>((resolve) => {
        const [file = "git", ...args] = safeGitArgv(["credential", "fill"]);
        const child = spawn(file, args, {
          env: { ...hostEnvironment(), ...SAFE_GIT_ENV },
          detached: true,
          stdio: ["pipe", "pipe", "ignore"],
        });
        const stop = () => {
          const leader = spawnedPid(child);
          if (leader !== undefined && child.exitCode === null) {
            try {
              signalGroup(leader, "SIGKILL");
            } catch {
              // Gone between the look and the signal.
            }
          }
        };
        signal.addEventListener("abort", stop, { once: true });
        let out = "";
        child.stdout.on("data", (chunk: Buffer) => {
          out += chunk.toString();
        });
        child.on("error", () => resolve(false));
        child.on("close", (code) => {
          signal.removeEventListener("abort", stop);
          resolve(code === 0 && PASSWORD.test(out));
        });
        child.stdin.on("error", () => undefined);
        child.stdin.end(
          `protocol=${url.protocol.slice(0, -1)}\nhost=${url.host}\n\n`
        );
      })
  );
  return read.kind === "answered" && read.value;
};

const PASSWORD = /^password=./mu;

/**
 * The project's conversation told that the `.lfsconfig` in `root` named
 * `endpoint`, which it was never told of, so its large files stayed
 * pointers there (hub `POST /api/lfs/projects/:id/refused`). A note the
 * hub cannot be reached for is said in this agent's log alone.
 */
export const noteRefused = async (
  projectId: string | undefined,
  root: string,
  endpoint: string
): Promise<void> => {
  console.warn(
    `[host-lfs] ${root}: its .lfsconfig names ${endpoint}, which is neither its origin's LFS nor its project's declared one: its large files stay pointers, and nothing is fetched from there`
  );
  const hub = toHttpBase(process.env[CAWCO_ENV.hubUrl] ?? "");
  if (!(hub && projectId)) {
    return;
  }
  await askHub(
    `${hub}/api/lfs/projects/${encodeURIComponent(projectId)}/refused`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, endpoint, machineId: await machineId() }),
    },
    "it told the project's conversation"
  ).catch((error: unknown) =>
    console.warn(
      `[host-lfs] ${root}: the project's conversation was not told: ${error instanceof Error ? error.message : String(error)}`
    )
  );
};
