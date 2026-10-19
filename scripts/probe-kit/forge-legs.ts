/**
 * One forge's legs, for the forge-adapters specs: the git door and the forge
 * adapters (agent hub-git.ts, forges/) against a stand-in of that forge on
 * the loopback (forge-stubs.ts): its git repositories through git's own
 * http-backend and its API as the forge documents it, signed in the way the
 * forge's own CLI keeps its sign-in (gh's hosts.yml read by the real gh,
 * glab's config.yml, tea's config.yml) under a scratch HOME. Held writes
 * become the person's ask through the hub's own upstream-asks.ts and
 * forge-posts.ts, made in process; a git door's held push goes to a
 * stand-in hub. No boundary: git runs with exactly the helper, door socket,
 * ssh and config a guarded workspace's commands get.
 *
 * Per forge:
 * (a) a push to the project's own repository lands, once;
 * (b) under "Keep agents off", a push to someone else's is refused in the
 *     guard's words and lands nothing;
 * (c) under "Ask me first", it is held: one ask for that repository, and
 *     nothing lands;
 * (d) under "Let agents post upstream", forge_post opens an issue and a pull
 *     or merge request on someone else's repository, signed with the CLI's
 *     token; asking for the same pull or merge request again answers the
 *     open one and makes none;
 * (e) under "Keep agents off", forge_post there is refused and the forge
 *     takes nothing; to the project's own repository, named by no one, it
 *     goes;
 * (f) under "Ask me first", forge_post there is held as one ask whose card
 *     names the forge and the account; nothing is made until it is
 *     approved, then it is made once, and a second answer makes nothing.
 * Without `made` (Gitea where gitea-mcp is not on the host's own PATH), (d)
 * and the making in (e) and (f) are left out.
 *
 * And with GitHub and GitLab on one host, each CLI signed in there at its
 * own port ({@link ambiguousLeg}):
 * (g) under "Let agents post upstream", forge_post naming no repository, the
 *     project's remote naming the host and no port, is refused in words that
 *     ask for the repository's URL; neither forge takes anything. Named by
 *     its URL, port and all, it is made on that forge.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../packages/core/src/bounded";
import {
  type ForgeStub,
  giteaStub,
  githubStub,
  gitlabStub,
} from "./forge-stubs";
import { type GitHttp, serveGitHttp } from "./git-http";
import type { Kit } from "./kit";

export type ProbeForge = "github" | "gitlab" | "gitea";

const IDENTITY = ["-c", "user.name=Probe", "-c", "user.email=probe@probe.test"];
const NAMES: Record<ProbeForge, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
};
const CHANGE: Record<ProbeForge, string> = {
  github: "pull request",
  gitlab: "merge request",
  gitea: "pull request",
};

/** What a git door's held push sent the stand-in hub. */
interface DoorAsk {
  post?: { url?: string; via?: string };
  repo?: string;
}

/** The scratch every forge's legs share: its HOME and the stand-in hub. */
export interface ForgeScratch {
  readonly config: string;
  readonly doorAsks: DoorAsk[];
  readonly root: string;
  readonly stop: () => void;
}

/**
 * The scratch HOME and config home, the runtime dir, a stand-in hub taking
 * the git door's held pushes, and a PATH with no workspace's shims on it, so
 * the host's own gh is found. Set before any agent module is read.
 */
export const forgeScratch = async (): Promise<ForgeScratch> => {
  const root = join(
    process.env.TMPDIR ?? "/tmp",
    `fa-${crypto.randomUUID().slice(0, 6)}`
  );
  process.env.HOME = join(root, "h");
  process.env.XDG_CONFIG_HOME = join(root, "h", ".config");
  process.env.XDG_RUNTIME_DIR = join(root, "r");
  process.env.GH_CONFIG_DIR = join(root, "h", ".config", "gh");
  // glab's own dir under the config home, as glab finds it with this unset.
  process.env.GLAB_CONFIG_DIR = "";
  process.env.PATH = (process.env.PATH ?? "")
    .split(":")
    .filter((dir) => !dir.includes("/.cawco/workspaces/"))
    .join(":");
  await mkdir(process.env.XDG_CONFIG_HOME, { recursive: true });
  await mkdir(process.env.XDG_RUNTIME_DIR, { recursive: true, mode: 0o700 });
  const doorAsks: DoorAsk[] = [];
  const hub = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== "/api/upstream/asks") {
        return new Response("not here\n", { status: 404 });
      }
      doorAsks.push((await request.json()) as DoorAsk);
      return new Response("PROBE-HUB-HELD: it waits in the owner's Needs you");
    },
  });
  process.env.CAWCO_HUB_URL = `http://127.0.0.1:${hub.port}`;
  return {
    root,
    config: process.env.XDG_CONFIG_HOME,
    doorAsks,
    stop: () => hub.stop(true),
  };
};

/** One forge's stand-in, staged: its host, repositories, door and the hub's side. */
interface Stage {
  readonly actor: Parameters<ForgePosts["post"]>[0];
  readonly asks: UpstreamAsks;
  readonly clone: string;
  readonly elseUrl: string;
  readonly forge: ProbeForge;
  readonly http: GitHttp;
  readonly inside: (
    args: string[]
  ) => ReturnType<ReturnType<typeof Bun.$>["nothrow"]>;
  readonly login: string;
  /** Resolves once the session is told how an answered ask went. */
  readonly nextTold: () => Promise<void>;
  readonly parked: Map<string, { payload?: unknown; requestId?: string }>;
  readonly posts: ForgePosts;
  readonly setRule: (posts: "off" | "ask" | "on") => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly stub: ForgeStub;
  readonly token: string;
  readonly told: string[];
  readonly web: string;
}

type ForgePosts = ReturnType<
  (typeof import("../../packages/hub/src/forge-posts"))["createForgePosts"]
>;
type UpstreamAsks = ReturnType<
  (typeof import("../../packages/hub/src/upstream-asks"))["createUpstreamAsks"]
>;

/**
 * The forge CLI's own sign-in for `host`, where that CLI keeps it: gh's
 * hosts.yml and its `http_unix_socket` (GitHub's stand-in answers there),
 * glab's config.yml, or tea's. Answers the GitHub socket's server.
 */
const signIn = async (
  scratch: ForgeScratch,
  forge: ProbeForge,
  host: string,
  token: string,
  login: string,
  stub: ForgeStub
): Promise<ReturnType<typeof Bun.serve> | undefined> => {
  if (forge === "gitlab") {
    await mkdir(join(scratch.config, "glab-cli"), { recursive: true });
    await writeFile(
      join(scratch.config, "glab-cli", "config.yml"),
      `hosts:\n  ${host}:\n    token: ${token}\n    api_protocol: http\n    api_host: ${host}\n    user: ${login}\n`
    );
    return;
  }
  if (forge === "gitea") {
    await mkdir(join(scratch.config, "tea"), { recursive: true });
    await writeFile(
      join(scratch.config, "tea", "config.yml"),
      `logins:\n  - name: probe\n    url: http://${host}\n    token: ${token}\n    default: true\n    user: ${login}\n`
    );
    return;
  }
  const socket = join(scratch.root, "gh-api.sock");
  const api = Bun.serve({
    unix: socket,
    fetch: async (request) =>
      (await stub.handle(request, new URL(request.url))) ??
      new Response("not here\n", { status: 404 }),
  });
  await mkdir(join(scratch.config, "gh"), { recursive: true });
  await writeFile(
    join(scratch.config, "gh", "hosts.yml"),
    `${host}:\n    oauth_token: ${token}\n    user: ${login}\n    git_protocol: https\n`
  );
  await writeFile(
    join(scratch.config, "gh", "config.yml"),
    `version: "1"\nhttp_unix_socket: ${socket}\n`
  );
  return api;
};

/** Stages forge `forge`'s stand-in, the project's clone behind its door, and the hub's side. */
const stage = async (
  scratch: ForgeScratch,
  forge: ProbeForge
): Promise<Stage> => {
  const token = `${forge}-probe-token`;
  const login = `${forge}-probe-login`;
  const where = { web: "", login };
  const stubOf: Record<ProbeForge, () => ForgeStub> = {
    github: () => githubStub(where),
    gitlab: () => gitlabStub(where),
    gitea: () => giteaStub(where),
  };
  const stub = stubOf[forge]();
  const http = serveGitHttp(
    join(scratch.root, forge),
    { user: "git", password: "git" },
    forge === "github" ? undefined : stub.handle
  );
  const ownUrl = await http.bare(`${forge}-probe/own.git`);
  const elseUrl = await http.bare(`someone/else-${forge}.git`);
  const { host } = new URL(ownUrl);
  where.web = `http://${host}`;
  const api = await signIn(scratch, forge, host, token, login, stub);

  const hubGit = await import("../../packages/agent/src/hub-git");
  const { forgePost } = await import("../../packages/agent/src/forges/forge");
  const { makeUpstreamPost } =
    await import("../../packages/agent/src/upstream-posts");
  const { workspaceUpstreamRuleFile } =
    await import("../../packages/core/src/paths");
  const { normaliseRemote } =
    await import("../../packages/core/src/upstream-guard");
  const { createUpstreamAsks } =
    await import("../../packages/hub/src/upstream-asks");
  const { createForgePosts } =
    await import("../../packages/hub/src/forge-posts");

  const seed = join(scratch.root, `${forge}-seed`);
  await Bun.$`git init -q -b main ${seed} && git -C ${seed} ${IDENTITY} commit -q --allow-empty -m seed && git -C ${seed} push -q ${ownUrl} main`.quiet();
  const clone = join(scratch.root, `${forge}-clone`);
  await Bun.$`git clone -q ${ownUrl} ${clone}`.quiet();
  const id = `fa${forge}${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`;
  const own = normaliseRemote(ownUrl) as string;
  let posts: "off" | "ask" | "on" = "off";
  const setRule = async (now: typeof posts) => {
    posts = now;
    await mkdir(join(workspaceUpstreamRuleFile(id), ".."), { recursive: true });
    await writeFile(
      workspaceUpstreamRuleFile(id),
      JSON.stringify({ posts, remotes: [own] })
    );
  };
  await setRule("off");
  await hubGit.openGitDoor({ id, path: clone });
  const door = hubGit.gitDoorEnv(id, clone);
  const inside = (args: string[]) =>
    Bun.$`git ${args}`
      .cwd(clone)
      .env({
        ...process.env,
        ...door,
        PATH: `${hubGit.gitHelperDirOf(id)}:${process.env.PATH}`,
        GIT_CONFIG_PARAMETERS: [
          door.CAWCO_GIT_PARAMETERS,
          hubGit.guardedPushParameters(),
        ].join(" "),
        GIT_TERMINAL_PROMPT: "0",
      })
      .quiet()
      .nothrow();

  // The hub's side, in process: the person's asks and forge_post.
  const parked = new Map<string, { payload?: unknown; requestId?: string }>();
  const told: string[] = [];
  let heard: (() => void) | undefined;
  const asks = createUpstreamAsks({
    park: (envelope) => parked.set(envelope.requestId as string, envelope),
    parked: (requestId) => parked.get(requestId) as never,
    pending: () => [...parked.values()] as never,
    settle: (requestId) => {
      parked.delete(requestId);
    },
    make: (_machine, workspaceId, post) => makeUpstreamPost(workspaceId, post),
    callConnection: () => Promise.resolve({ ok: false, said: "no connection" }),
    tell: (_instance, text) => {
      told.push(text);
      heard?.();
    },
    threadOf: () => undefined,
  });
  const forgePosts = createForgePosts({
    ask: asks.ask,
    remoteOf: () => own,
    ruleOf: () => ({ posts, remotes: [own] }),
    call: async (_machine, rule, ask) => ({
      kind: "answered",
      verdict: await forgePost(rule, ask),
    }),
  });
  return {
    forge,
    token,
    login,
    web: where.web,
    stub,
    http,
    clone,
    elseUrl,
    inside,
    setRule,
    parked,
    told,
    asks,
    posts: forgePosts,
    nextTold: () =>
      new Promise<void>((resolve) => {
        heard = resolve;
      }),
    actor: {
      id: `${forge}-actor`,
      machineId: "probe-machine",
      harness: "claude",
      projectId: "probe",
    } as Parameters<ForgePosts["post"]>[0],
    stop: async () => {
      await hubGit.closeGitDoor(id);
      http.stop();
      await api?.stop(true);
    },
  };
};

const said = (run: { stderr: Buffer; stdout: Buffer }) =>
  `${run.stdout.toString()}${run.stderr.toString()}`.trim();

/** (a) to (c): pushes through the git door. */
const pushLegs = async (kit: Kit, at: Stage): Promise<void> => {
  const { forge, http, clone, elseUrl } = at;
  const label = (leg: string) => `[${forge}] ${leg}`;
  const own = `${forge}-probe/own`;
  const other = `someone/else-${forge}`;
  const tip = async (repo: string, branch: string) =>
    (
      await Bun.$`git -C ${http.dir(`${repo}.git`)} rev-parse --verify --quiet refs/heads/${branch}`
        .quiet()
        .nothrow()
        .text()
    ).trim();

  await Bun.$`git -C ${clone} ${IDENTITY} commit -q --allow-empty -m own`.quiet();
  const head = (await Bun.$`git -C ${clone} rev-parse HEAD`.text()).trim();
  const before = http.pushes(`${own}.git`);
  const pushedOwn = await at.inside([
    "push",
    "origin",
    `HEAD:refs/heads/${forge}-own`,
  ]);
  kit.check(
    label(
      `(a) a push to the project's own repository on ${NAMES[forge]} lands, once`
    ),
    pushedOwn.exitCode === 0 &&
      (await tip(own, `${forge}-own`)) === head &&
      http.pushes(`${own}.git`) === before + 1,
    `exit ${pushedOwn.exitCode}; ${said(pushedOwn)}`
  );

  const refused = await at.inside(["push", elseUrl, "HEAD:refs/heads/else"]);
  kit.check(
    label(
      `(b) under Keep agents off, a push to ${other} is refused in the guard's words and lands nothing`
    ),
    refused.exitCode !== 0 &&
      said(refused).includes(
        `cawco: \`git push ${elseUrl}\` did not run: it writes to 127.0.0.1/${other}`
      ) &&
      http.pushes(`${other}.git`) === 0,
    `exit ${refused.exitCode}; pushes ${http.pushes(`${other}.git`)}; ${said(refused)}`
  );
};

/** (c): the push held under Ask, at the stand-in hub. */
const heldPushLeg = async (
  kit: Kit,
  scratch: ForgeScratch,
  at: Stage
): Promise<void> => {
  const other = `someone/else-${at.forge}`;
  await at.setRule("ask");
  const before = scratch.doorAsks.length;
  const held = await at.inside(["push", at.elseUrl, "HEAD:refs/heads/held"]);
  const ask = scratch.doorAsks[before];
  kit.check(
    `[${at.forge}] (c) under Ask me first, that push is held: one ask for 127.0.0.1/${other}, nothing lands`,
    held.exitCode !== 0 &&
      said(held).includes("PROBE-HUB-HELD") &&
      scratch.doorAsks.length === before + 1 &&
      ask?.repo === `127.0.0.1/${other}` &&
      ask.post?.url === at.elseUrl &&
      at.http.pushes(`${other}.git`) === 0,
    `exit ${held.exitCode}; asks ${JSON.stringify(scratch.doorAsks.slice(before))}; ${said(held)}`
  );
};

const issue = (title: string) => ({
  op: "issue" as const,
  title,
  body: `${title}, from the probe`,
});

/** The stand-in's writes on `repo`, of `kind` when named. */
const writesOn = (at: Stage, repo: string, kind?: string) =>
  at.stub.writes.filter(
    (each) => each.repo === repo && (!kind || each.kind === kind)
  );

/** (d): forge_post under Let agents post upstream. */
const madeLeg = async (kit: Kit, at: Stage): Promise<void> => {
  const { forge } = at;
  const name = NAMES[forge];
  const other = `someone/else-${forge}`;
  const change = {
    op: "pull_request" as const,
    title: "Probe change",
    body: "From the probe",
    head: "probe-change",
    base: "main",
  };
  await at.setRule("on");
  const opened = await at.posts.post(at.actor, {
    repo: at.elseUrl,
    write: issue("On issue"),
  });
  const first = await at.posts.post(at.actor, {
    repo: at.elseUrl,
    write: change,
  });
  const again = await at.posts.post(at.actor, {
    repo: at.elseUrl,
    write: change,
  });
  const issues = writesOn(at, other, "issue");
  const changes = writesOn(at, other, "pull_request");
  kit.check(
    `[${forge}] (d) under Let agents post upstream, forge_post opens an issue and a ${CHANGE[forge]} on ${other} with the CLI's token; the same ${CHANGE[forge]} again answers the open one`,
    opened.ok &&
      first.ok &&
      again.ok &&
      issues.length === 1 &&
      issues[0]?.title === "On issue" &&
      changes.length === 1 &&
      [...issues, ...changes].every((each) => each.token === at.token) &&
      opened.text.includes(`${name} opened the issue: ${at.web}`) &&
      first.text.includes(`${name} opened the ${CHANGE[forge]}`) &&
      again.text.includes("already"),
    `issue: ${opened.text} | change: ${first.text} | again: ${again.text} | writes ${JSON.stringify(at.stub.writes)} | unknown ${JSON.stringify(at.stub.unknown)}`
  );
};

/** (e): forge_post under Keep agents off. */
const offLeg = async (kit: Kit, at: Stage, made: boolean): Promise<void> => {
  const { forge } = at;
  const other = `someone/else-${forge}`;
  await at.setRule("off");
  const before = at.stub.writes.length;
  const refused = await at.posts.post(at.actor, {
    repo: at.elseUrl,
    write: issue("Off issue"),
  });
  const own = made
    ? await at.posts.post(at.actor, { write: issue("Own issue") })
    : undefined;
  kit.check(
    `[${forge}] (e) under Keep agents off, forge_post to ${other} is refused and ${NAMES[forge]} takes nothing${made ? "; to the project's own, named by no one, it goes" : ""}`,
    !refused.ok &&
      refused.text.includes(
        `\`open an issue on 127.0.0.1/${other}\` did not run`
      ) &&
      at.stub.writes.slice(before).every((each) => each.repo !== other) &&
      (!own ||
        (own.ok && writesOn(at, `${forge}-probe/own`, "issue").length === 1)),
    `refused: ${refused.text} | own: ${own?.text ?? "not asked"}`
  );
};

/** (f): forge_post under Ask me first, held, then approved. */
const askLeg = async (kit: Kit, at: Stage, made: boolean): Promise<void> => {
  const { forge } = at;
  const name = NAMES[forge];
  const other = `someone/else-${forge}`;
  await at.setRule("ask");
  const before = writesOn(at, other).length;
  const held = await at.posts.post(at.actor, {
    repo: at.elseUrl,
    write: issue("Held issue"),
  });
  const waiting = [...at.parked.values()];
  const card = (waiting[0]?.payload ?? {}) as {
    input?: { account?: string; kind?: string };
  };
  const heldOk =
    held.ok &&
    held.text.includes("waits in the owner's Needs you") &&
    waiting.length === 1 &&
    card.input?.kind === `${name} issue` &&
    (!made || card.input.account === `@${at.login}`) &&
    writesOn(at, other).length === before;
  if (!made) {
    kit.check(
      `[${forge}] (f) under Ask me first, forge_post to ${other} is held as one ask whose card names ${name}; nothing is made`,
      heldOk,
      `held: ${held.text} | card ${JSON.stringify(card.input)}`
    );
    return;
  }
  const requestId = waiting[0]?.requestId as string;
  // The post is made after the answer returns: the session is told then.
  const told = at.nextTold();
  const first = at.asks.answer(requestId, {
    behavior: "allow",
    updatedInput: {},
  } as never);
  await readWithin(60_000, () => told);
  const second = at.asks.answer(requestId, {
    behavior: "allow",
    updatedInput: {},
  } as never);
  const heldWrites = writesOn(at, other, "issue").filter(
    (each) => each.title === "Held issue"
  );
  kit.check(
    `[${forge}] (f) under Ask me first, forge_post to ${other} is held as one ask whose card names ${name} and @${at.login}; approved, it is made once; a second answer makes nothing`,
    heldOk &&
      first &&
      !second &&
      heldWrites.length === 1 &&
      at.told.length === 1 &&
      (at.told[0] ?? "").includes(`${name} said`),
    `held: ${held.text} | card ${JSON.stringify(card.input)} | first ${first} second ${second} | told ${JSON.stringify(at.told)} | writes ${JSON.stringify(heldWrites)}`
  );
};

/** Runs forge `forge`'s legs in `scratch`; without `made`, those that make nothing. */
export const forgeLegs = async (
  kit: Kit,
  scratch: ForgeScratch,
  forge: ProbeForge,
  made: boolean
): Promise<void> => {
  const at = await stage(scratch, forge);
  try {
    await pushLegs(kit, at);
    await heldPushLeg(kit, scratch, at);
    if (made) {
      await madeLeg(kit, at);
    }
    await offLeg(kit, at, made);
    await askLeg(kit, at, made);
  } finally {
    await at.stop();
  }
};

/**
 * (g): GitHub's and GitLab's stand-ins on one host, gh and glab each signed
 * in at its own port, and the project's remote naming the host alone.
 */
export const ambiguousLeg = async (
  kit: Kit,
  scratch: ForgeScratch
): Promise<void> => {
  const github = await stage(scratch, "github");
  const gitlab = await stage(scratch, "gitlab");
  try {
    await github.setRule("on");
    const asked = await github.posts.post(github.actor, {
      write: issue("Ambiguous issue"),
    });
    const taken = [...github.stub.writes, ...gitlab.stub.writes].filter(
      (each) => each.title === "Ambiguous issue"
    );
    kit.check(
      "(g) forge_post with no repository, on a host gh and glab both sign in to, is refused in words that ask for the repository's URL; neither forge takes anything",
      !asked.ok &&
        asked.text.includes("more than one forge") &&
        asked.text.includes("Name the repository by its URL") &&
        taken.length === 0,
      `answered: ${asked.text} | taken ${JSON.stringify(taken)}`
    );
    const named = await github.posts.post(github.actor, {
      repo: `${github.web}/github-probe/own`,
      write: issue("Named issue"),
    });
    kit.check(
      "(g) named by its URL, port and all, the same post is made on that forge alone",
      named.ok &&
        github.stub.writes.filter((each) => each.title === "Named issue")
          .length === 1 &&
        !gitlab.stub.writes.some((each) => each.title === "Named issue"),
      `answered: ${named.text} | github ${JSON.stringify(github.stub.writes)} | gitlab ${JSON.stringify(gitlab.stub.writes)}`
    );
  } finally {
    await github.stop();
    await gitlab.stop();
  }
};
