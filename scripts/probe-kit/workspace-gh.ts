/**
 * The git-door spec's leg (s): a workspace whose project lets agents post
 * upstream holds no forge token, and its `gh` posts through the
 * workspace's GitHub door (agent github-door.ts), decided there by the
 * project's rule as every door decides (core `decideWrite`).
 *
 * It runs the workspace's real executor and runner on the host
 * (workspace-executor.ts): every command goes in through the executor, its
 * environment built as a boundary's is, and runs through the runner. The
 * host's own gh is signed in under the scratch HOME (`hosts.yml`, a token
 * the probe made); GitHub's API is the forge stand-in (forge-stubs.ts),
 * reached by the door's own requests to api.github.com, which this process
 * hands it.
 *
 * (s) Under "Let agents post upstream":
 *     - with no token in the caller's environment, and with the caller's
 *       `GH_TOKEN`, a command's environment carries no forge's token
 *       variable, and its gh's config is the door's;
 *     - no file in the workspace's dirs (its state dir, the part a command
 *       reads, its scratch dir, its clone) holds the host's gh token;
 *     - the real gh's `api repos/someone/else/issues` inside is made by the
 *       door: the stand-in takes the issue once, signed with the host's token.
 *     Under "Ask me first", the same post is held by the door: the hub is
 *     asked once, for github.com/someone/else, and GitHub takes nothing.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { githubStub } from "./forge-stubs";
import type { Kit } from "./kit";
import { standExecutor } from "./workspace-executor";

/** What the git-door spec hands the leg. */
export interface WorkspaceGhAt {
  /** What the stand-in hub was asked, in order. */
  readonly asks: readonly { post?: { via?: string }; repo?: string }[];
  readonly clone: string;
  readonly id: string;
  readonly root: string;
  readonly writeRule: (posts: "off" | "ask" | "on") => Promise<void>;
}

const HOST_TOKEN = "probe-host-gh-token";
const CALLER_TOKEN = "probe-caller-gh-token";
/** Every forge's token variable a command could carry (boundary.ts `FORGE_TOKEN_ENV`). */
const FORGE_VARS =
  /^(GH_[A-Z_]*TOKEN|GITHUB_[A-Z_]*TOKEN|GITLAB_[A-Z_]*TOKEN|OAUTH_TOKEN|CI_JOB_TOKEN|GITEA_[A-Z_]*TOKEN|FORGEJO_[A-Z_]*TOKEN|CODEBERG_[A-Z_]*TOKEN|BITBUCKET_[A-Z_]*)=/m;

/** Every file under `dir`, through no link; none when it is not there. */
const filesUnder = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
};

/** The files under `dirs` that hold `secret`. */
const holding = async (
  dirs: readonly string[],
  secret: string
): Promise<string[]> => {
  const files = (await Promise.all(dirs.map(filesUnder))).flat();
  const texts = await Promise.all(
    files.map((file) => readFile(file, "utf8").catch(() => ""))
  );
  return files.filter((_, at) => texts[at]?.includes(secret));
};

export const workspaceGhLeg = async (
  kit: Kit,
  at: WorkspaceGhAt
): Promise<void> => {
  // The host's gh, signed in under the scratch HOME; the real gh by its
  // path, never a workspace's shim.
  process.env.PATH = (process.env.PATH ?? "")
    .split(":")
    .filter((dir) => !dir.includes("/.cawco/workspaces/"))
    .join(":");
  const ghConfig = join(at.root, "h", ".config", "gh");
  await mkdir(ghConfig, { recursive: true });
  await writeFile(
    join(ghConfig, "hosts.yml"),
    `github.com:\n    oauth_token: ${HOST_TOKEN}\n    user: probe-host\n    git_protocol: https\n`
  );
  process.env.GH_CONFIG_DIR = ghConfig;
  for (const name of Object.keys(process.env)) {
    if (FORGE_VARS.test(`${name}=`)) {
      delete process.env[name];
    }
  }

  // GitHub's API: the door's requests to api.github.com, handed to the
  // stand-in under its `/api/v3`.
  const stub = githubStub({ web: "https://github.com", login: "probe-host" });
  const realFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.hostname !== "api.github.com") {
        return realFetch(request);
      }
      const staged = new URL(`http://stub/api/v3${url.pathname}${url.search}`);
      return (
        (await stub.handle(new Request(staged, request), staged)) ??
        new Response("not here\n", { status: 404 })
      );
    },
    { preconnect: realFetch.preconnect }
  ) as typeof fetch;

  const { openGithubDoor, closeGithubDoor } =
    await import("../../packages/agent/src/github-door");
  const { workspaceStateDir, workspaceReadOnlyDir } =
    await import("../../packages/core/src/paths");
  const stood = await standExecutor(kit, "s", at);
  if (!stood) {
    globalThis.fetch = realFetch;
    return;
  }
  const { run } = stood;
  await openGithubDoor(at.id);

  const SHOW_ENV = `env | grep -E '^(GH_|GITHUB_|GITLAB_|OAUTH_TOKEN|CI_JOB_TOKEN|GITEA_|FORGEJO_|CODEBERG_|BITBUCKET_)' ; echo "GHCONFIG=$(cat "$GH_CONFIG_DIR/config.yml" 2>/dev/null | tr '\\n' ' ')"`;
  const POST = (title: string) =>
    `gh api repos/someone/else/issues -f title='${title}' -f body='from the probe' 2>&1; echo "GHEXIT=$?"`;

  try {
    await at.writeRule("on");
    const bare = await run(SHOW_ENV);
    const withCaller = await run(SHOW_ENV, { GH_TOKEN: CALLER_TOKEN });
    const door = (said: string) =>
      said.includes("GHCONFIG=") && said.includes("http_unix_socket");
    kit.check(
      "(s) under Let agents post upstream, a command's environment carries no forge token, the caller's GH_TOKEN included, and its gh's config is the door's",
      !(
        FORGE_VARS.test(bare) ||
        FORGE_VARS.test(withCaller) ||
        withCaller.includes(CALLER_TOKEN)
      ) &&
        door(bare) &&
        door(withCaller),
      `no caller token: ${bare.trim()} | caller's GH_TOKEN: ${withCaller.trim()}`
    );

    const made = await run(POST("Probe made"));
    const files = await holding(
      [
        workspaceStateDir(at.id),
        workspaceReadOnlyDir(at.id),
        stood.scratch,
        at.clone,
      ],
      HOST_TOKEN
    );
    kit.check(
      "(s) no file in the workspace's dirs holds the host's gh token",
      files.length === 0,
      `holding it: ${files.join(", ") || "none"}`
    );
    const issues = stub.writes.filter(
      (each) => each.repo === "someone/else" && each.title === "Probe made"
    );
    kit.check(
      "(s) under Let agents post upstream, gh's issue on someone/else is made by the door: the stand-in takes it once, signed with the host's token",
      made.includes("GHEXIT=0") &&
        issues.length === 1 &&
        issues[0]?.token === HOST_TOKEN,
      `gh said: ${made.trim()} | writes ${JSON.stringify(stub.writes)} | unknown ${JSON.stringify(stub.unknown)}`
    );

    await at.writeRule("ask");
    const asked = at.asks.length;
    const held = await run(POST("Probe held"));
    const ask = at.asks[asked];
    kit.check(
      "(s) under Ask me first, the same post is held by the door: one ask for github.com/someone/else, and GitHub takes nothing",
      at.asks.length === asked + 1 &&
        ask?.repo === "github.com/someone/else" &&
        ask.post?.via === "http" &&
        held.includes("PROBE-HUB-HELD") &&
        !stub.writes.some((each) => each.title === "Probe held"),
      `gh said: ${held.trim()} | asks ${JSON.stringify(at.asks.slice(asked))}`
    );
  } finally {
    globalThis.fetch = realFetch;
    await closeGithubDoor(at.id);
    stood.stop();
  }
};
