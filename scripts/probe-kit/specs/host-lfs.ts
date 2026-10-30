/**
 * Every git-lfs run on the host for a project's repository is held to one
 * endpoint and one credential (agent host-lfs.ts), and a plain folder's
 * first commit offers its large files to Git LFS by pattern (agent and hub
 * place-repo.ts, hub lfs-offers.ts). Real git and git-lfs in scratch
 * repositories, against an LFS server in this process that records every
 * request (path and credential) and keeps each repository's objects apart,
 * and a stand-in hub for the thread's note. No fleet: it runs inside a
 * workspace's boundary as well as on the host.
 *
 * - A, a committed `.lfsconfig` cannot move a host push: its `lfs.pushurl`
 *   names another repository; `git lfs push origin main` under the git
 *   door's environment for a clone's origin outside the hub (hub-git.ts
 *   `hostOriginGitEnv`) uploads to the origin's own LFS with the host's
 *   credential, and the other repository is asked nothing.
 * - B, an undeclared third-party endpoint: the branch's `.lfsconfig` names
 *   one; a workspace's creation checkout (workspace.ts `lfsCheckout`) leaves
 *   the large file a pointer, the third party is asked nothing, and the hub
 *   is told the endpoint, for the project's thread.
 * - C, a declared endpoint: the project's large files live there (its
 *   objects nowhere else); the creation checkout fetches them from it with
 *   the connection's credential, and asks the origin's LFS nothing.
 * - D, a plain folder with a 60 MiB file: its first commit leaves it out,
 *   the note carries an offer of `*.bin` (1 file); Track with LFS commits
 *   it as an LFS pointer in a second commit, `.gitignore` no longer names
 *   it, the folder's `git status` is clean with no global git config (its
 *   own names git-lfs's filters), and its own git runs git-lfs's pre-push.
 * - E, the hub's side, a real hub in this process: the person declares the
 *   project's Large files (plain http refused); a machine with a place of
 *   the project, by its proof, is answered the endpoint and the
 *   connection's key; a machine with none, and a session, are refused; a
 *   machine's word of a refused `.lfsconfig` lands in the project's thread.
 *
 * On a tree from before them, A, D and E run that tree's own code for
 * those steps (A's `hostGitEnv()`, D's first commit, E's routes), so each
 * fails there; B and C import `lfsCheckout`, which every tree has had since.
 *
 *   bun scripts/probe-kit/run.ts host-lfs
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each leg's steps are read in order.
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitUntil, lfsCheckout } from "../../../packages/agent/src/workspace";
import type { Kit, Spec } from "../kit";

const FILTERS = [
  "-c",
  "filter.lfs.clean=git-lfs clean -- %f",
  "-c",
  "filter.lfs.smudge=git-lfs smudge -- %f",
  "-c",
  "filter.lfs.process=git-lfs filter-process",
  "-c",
  "filter.lfs.required=true",
];
const POINTER = "version https://git-lfs.github.com/spec/v1";
/** An LFS API path's tail, after its repository. */
const LFS_TAIL = /\/info\/lfs\/.*$/u;
/** An object's own path on the server. */
const OBJECT_PATH = /\/obj\/([0-9a-f]{64})$/u;
/** A `.gitconfig` section of git-lfs's. */
const LFS_SECTION = /\[lfs "/u;

interface Asked {
  auth: string | null;
  method: string;
  path: string;
}

/** An LFS server keeping each repository's objects apart, and every request it was asked. */
const lfsServer = () => {
  const asked: Asked[] = [];
  const store = new Map<string, Uint8Array>();
  const refused: { body: unknown; path: string }[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const auth = request.headers.get("authorization");
      asked.push({
        method: request.method,
        path: url.pathname,
        auth: auth?.startsWith("Basic ") ? atob(auth.slice(6)) : auth,
      });
      // The stand-in hub: the agent's word that a `.lfsconfig` was refused.
      if (url.pathname.endsWith("/refused")) {
        refused.push({ path: url.pathname, body: await request.json() });
        return Response.json({ ok: true });
      }
      const repo = url.pathname.replace(LFS_TAIL, "");
      if (url.pathname.endsWith("/objects/batch")) {
        const body = (await request.json()) as {
          objects: { oid: string; size: number }[];
          operation: string;
        };
        const at = `${url.origin}${repo}/info/lfs`;
        return Response.json(
          {
            transfer: "basic",
            objects: body.objects.map((each) => {
              const kept = store.has(`${repo}:${each.oid}`);
              if (body.operation === "upload") {
                return kept
                  ? each
                  : {
                      ...each,
                      actions: { upload: { href: `${at}/obj/${each.oid}` } },
                    };
              }
              return kept
                ? {
                    ...each,
                    actions: { download: { href: `${at}/obj/${each.oid}` } },
                  }
                : { ...each, error: { code: 404, message: "not here" } };
            }),
          },
          { headers: { "content-type": "application/vnd.git-lfs+json" } }
        );
      }
      const oid = OBJECT_PATH.exec(url.pathname)?.[1];
      if (oid && request.method === "PUT") {
        store.set(
          `${repo}:${oid}`,
          new Uint8Array(await request.arrayBuffer())
        );
        return new Response(null, { status: 200 });
      }
      const object = oid ? store.get(`${repo}:${oid}`) : undefined;
      if (object) {
        return new Response(new Blob([object as Uint8Array<ArrayBuffer>]));
      }
      // locks/verify and anything else: not offered.
      return new Response("not here", { status: 404 });
    },
  });
  return {
    asked,
    origin: `http://127.0.0.1:${server.port}`,
    refused,
    /** `bytes` as an object of the repository at `repo` (`/own/repo.git`). */
    keep: (repo: string, bytes: Uint8Array) =>
      store.set(
        `${repo}:${createHash("sha256").update(bytes).digest("hex")}`,
        bytes
      ),
    stop: () => server.stop(true),
  };
};

/** git in `cwd`, with git-lfs's filters; throws its stderr. */
const git = (cwd: string, ...args: string[]): string => {
  const ran = Bun.spawnSync(["git", ...FILTERS, ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (ran.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${ran.stderr.toString().trim()}`);
  }
  return ran.stdout.toString().trim();
};

/** A repository at `dir` on `main` with `big.bin` (`bytes`) tracked by LFS, and `extra` files. */
const lfsRepo = async (
  dir: string,
  bytes: Uint8Array,
  extra: Record<string, string> = {}
): Promise<void> => {
  git(tmpdir(), "init", "-q", "-b", "main", dir);
  git(dir, "config", "user.email", "probe@cawco.invalid");
  git(dir, "config", "user.name", "probe");
  await writeFile(
    join(dir, ".gitattributes"),
    "*.bin filter=lfs diff=lfs merge=lfs -text\n"
  );
  await writeFile(join(dir, "big.bin"), bytes);
  for (const [name, text] of Object.entries(extra)) {
    await writeFile(join(dir, name), text);
  }
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "one");
};

/** A clone of `source`'s main at `dir` with no checkout, its origin named `origin`. */
const unchecked = (source: string, dir: string, origin: string): void => {
  git(tmpdir(), "init", "-q", dir);
  git(dir, "fetch", "-q", source, "main:refs/remotes/origin/main");
  git(dir, "remote", "add", "origin", origin);
};

const random = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes.subarray(0, Math.min(size, 65_536)));
  return bytes;
};

const agent = (file: string) => `../../../packages/agent/src/${file}`;
const hubSource = (file: string) => `../../../packages/hub/src/${file}`;

/** A: a committed `.lfsconfig`'s `lfs.pushurl` cannot move a host push. */
const pushLeg = async (kit: Kit, root: string): Promise<void> => {
  const lfs = lfsServer();
  try {
    const dir = join(root, "a");
    await lfsRepo(dir, random(4096), {
      ".lfsconfig": `[lfs]\n\tpushurl = ${lfs.origin}/other/x.git/info/lfs\n`,
    });
    const origin = `${lfs.origin}/own/repo.git`;
    git(dir, "remote", "add", "origin", origin);
    // The host's own credential helper for the stand-in server's host, as a
    // person's git holds one for their forge: the door's environment reads
    // it (host-lfs.ts `hostSigns`), so git-lfs sends it up front. Made in a
    // child, whose environment is the host agent's: run inside a workspace,
    // the workspace's own git config (`GIT_CONFIG_PARAMETERS`: its door's
    // `url.cawco::….insteadOf` and `pushInsteadOf` rewrites, hub-git.ts
    // `gitDoorEnv`) is no part of it.
    const { GIT_CONFIG_PARAMETERS: _workspace, ...host } = process.env;
    const made = Bun.spawnSync(
      ["bun", join(import.meta.dir, "../host-origin-git-env-child.ts"), origin],
      {
        env: {
          ...host,
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: `credential.${lfs.origin}.helper`,
          GIT_CONFIG_VALUE_0:
            "!f() { test \"$1\" = get && printf 'username=probe\\npassword=probe\\n'; }; f",
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    if (made.exitCode !== 0) {
      throw new Error(`hostOriginGitEnv: ${made.stderr.toString().trim()}`);
    }
    const env = JSON.parse(
      made.stdout.toString().trim().split("\n").at(-1) ?? "{}"
    ) as Record<string, string>;
    // Spawned, not run synchronously: the LFS server answers on this process's loop.
    const push = Bun.spawn(
      ["git", ...FILTERS, "lfs", "push", "origin", "main"],
      { cwd: dir, env, stdout: "ignore", stderr: "pipe" }
    );
    const [code, said] = await Promise.all([
      push.exited,
      new Response(push.stderr).text(),
    ]);
    const pushed = { exitCode: code, stderr: said };
    const config = await readFile(join(dir, ".git", "config"), "utf8");
    kit.check(
      "A: the host's git lfs push of a repository whose .lfsconfig names another pushurl uploads to the origin's own LFS",
      pushed.exitCode === 0 &&
        lfs.asked.some(
          (each) => each.path === "/own/repo.git/info/lfs/objects/batch"
        ),
      `exit ${pushed.exitCode}: ${pushed.stderr.toString().trim()}; asked ${lfs.asked.map((each) => each.path).join(", ")}`
    );
    kit.check(
      "A: the repository the .lfsconfig named is asked nothing",
      !lfs.asked.some((each) => each.path.startsWith("/other/")),
      lfs.asked.map((each) => each.path).join(", ")
    );
    kit.check(
      "A: the clone's .git/config gets no lfs key",
      !LFS_SECTION.test(config),
      config
    );
  } finally {
    lfs.stop();
  }
};

/** The git a workspace's creation checkout of `start` runs with (workspace.ts `lfsCheckout`). */
const checkoutGit = (options: {
  declared?: { basic: string; endpoint: string };
  path: string;
  projectId: string;
}) => {
  const deadline = Date.now() + 120_000;
  return lfsCheckout({
    deadline,
    declared: options.declared,
    hub: undefined,
    path: options.path,
    plain: gitUntil(deadline),
    projectId: options.projectId,
    start: "origin/main",
  });
};

/** B: an undeclared third-party endpoint leaves pointers, asks nothing, and tells the hub. */
const undeclaredLeg = async (kit: Kit, root: string): Promise<void> => {
  const lfs = lfsServer();
  const hubUrl = process.env.CAWCO_HUB_URL;
  process.env.CAWCO_HUB_URL = lfs.origin.replace("http", "ws");
  try {
    const bytes = random(4096);
    const third = `${lfs.origin}/third/party.git/info/lfs`;
    const source = join(root, "b-source");
    await lfsRepo(source, bytes, { ".lfsconfig": `[lfs]\n\turl = ${third}\n` });
    lfs.keep("/third/party.git", bytes);
    const path = join(root, "b");
    unchecked(source, path, `${lfs.origin}/own/repo.git`);
    const checkout = await checkoutGit({
      path,
      projectId: "probe-project",
    });
    await checkout(
      path,
      "checkout",
      "--quiet",
      "-b",
      "ws/probe",
      "origin/main"
    ).catch((error: Error) =>
      kit.note(`B: the checkout said ${error.message}`)
    );
    const held = await readFile(join(path, "big.bin"), "utf8").catch(() => "");
    kit.check(
      "B: the checkout holds big.bin as a pointer",
      held.startsWith(POINTER),
      held.slice(0, 60)
    );
    kit.check(
      "B: the third-party endpoint is asked nothing",
      !lfs.asked.some((each) => each.path.startsWith("/third/")),
      lfs.asked.map((each) => each.path).join(", ")
    );
    const told = lfs.refused.find(
      (each) => each.path === "/api/lfs/projects/probe-project/refused"
    );
    kit.check(
      "B: the hub is told the endpoint the .lfsconfig asked for, for the project's thread",
      (told?.body as { endpoint?: string } | undefined)?.endpoint === third,
      JSON.stringify(lfs.refused)
    );
  } finally {
    if (hubUrl === undefined) {
      delete process.env.CAWCO_HUB_URL;
    } else {
      process.env.CAWCO_HUB_URL = hubUrl;
    }
    lfs.stop();
  }
};

/** C: a declared endpoint's objects come down with its connection's credential. */
const declaredLeg = async (kit: Kit, root: string): Promise<void> => {
  const lfs = lfsServer();
  try {
    const bytes = random(4096);
    const source = join(root, "c-source");
    await lfsRepo(source, bytes);
    lfs.keep("/decl/store.git", bytes);
    const path = join(root, "c");
    unchecked(source, path, `${lfs.origin}/own/repo.git`);
    const checkout = await checkoutGit({
      path,
      projectId: "probe-project",
      declared: {
        endpoint: `${lfs.origin}/decl/store.git/info/lfs`,
        basic: btoa("x-access-token:probe-connection-key"),
      },
    });
    await checkout(
      path,
      "checkout",
      "--quiet",
      "-b",
      "ws/probe",
      "origin/main"
    ).catch((error: Error) =>
      kit.note(`C: the checkout said ${error.message}`)
    );
    const held = await readFile(join(path, "big.bin")).catch(() =>
      Buffer.alloc(0)
    );
    kit.check(
      "C: the checkout holds big.bin itself, fetched from the declared endpoint",
      Buffer.compare(held, Buffer.from(bytes)) === 0,
      `${held.length} bytes`
    );
    const batch = lfs.asked.find(
      (each) => each.path === "/decl/store.git/info/lfs/objects/batch"
    );
    kit.check(
      "C: the declared endpoint is asked with the connection's credential",
      batch?.auth === "x-access-token:probe-connection-key",
      JSON.stringify(lfs.asked)
    );
    kit.check(
      "C: the origin's own LFS is asked nothing",
      !lfs.asked.some((each) => each.path.startsWith("/own/")),
      lfs.asked.map((each) => each.path).join(", ")
    );
  } finally {
    lfs.stop();
  }
};

/** D: a plain folder's 60 MiB file is left out, offered by pattern, and committed through LFS on Track. */
const folderLeg = async (kit: Kit, root: string): Promise<void> => {
  const dir = join(root, "d");
  await Bun.write(join(dir, "notes.md"), "# a folder\n");
  await Bun.write(join(dir, "media", "big.bin"), random(60 * 1024 * 1024));
  const placeRepo = (await import(agent("place-repo"))) as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  const { createPlaceRepos } = (await import(
    hubSource("place-repo")
  )) as typeof import("../../../packages/hub/src/place-repo");
  const notes: { event: Record<string, unknown>; title: string }[] = [];
  const offers = new Map<string, Record<string, unknown>>();
  const db = {
    listAgents: () => [],
    project: () => ({ id: "probe-project", places: [] }),
    lfsOffers: {
      offer: (row: Record<string, unknown>) => offers.set(String(row.id), row),
      of: (id: string) => offers.get(id),
      answer: (id: string, answer: string, commit?: string) =>
        offers.set(id, { ...offers.get(id), answer, commit: commit ?? null }),
    },
  };
  const notice = (_project: string, note: unknown) => {
    notes.push(note as (typeof notes)[number]);
  };
  const call = (_machine: string, method: string, args: unknown[]) => {
    const run = placeRepo[method];
    if (!run) {
      return Promise.reject(new Error(`this agent has no ${method}`));
    }
    return run(...args);
  };
  const repos = createPlaceRepos({
    call,
    db: db as unknown as Parameters<typeof createPlaceRepos>[0]["db"],
    notice,
  });
  const made = (await repos.ensure({
    projectId: "probe-project",
    machineId: "probe",
    path: dir,
  })) as {
    leftOut: { path: string }[];
  };
  kit.check(
    "D: the first commit leaves media/big.bin out",
    made.leftOut.some((each) => each.path === "media/big.bin") &&
      !git(dir, "ls-files").split("\n").includes("media/big.bin"),
    JSON.stringify(made.leftOut)
  );
  const offerId = notes[0]?.event.lfsOffer as string | undefined;
  const offered = offerId ? offers.get(offerId) : undefined;
  const rows = (offered?.rows ?? []) as { count: number; pattern: string }[];
  kit.check(
    "D: the note carries an offer of Git LFS for *.bin, 1 file",
    rows.length === 1 && rows[0]?.pattern === "*.bin" && rows[0]?.count === 1,
    JSON.stringify(notes[0]?.event)
  );
  if (!offerId) {
    return;
  }
  const lfsOffers = (await import(hubSource("lfs-offers")).catch(
    () => undefined
  )) as typeof import("../../../packages/hub/src/lfs-offers") | undefined;
  if (!lfsOffers) {
    kit.check("D: Track with LFS exists", false);
    return;
  }
  const answered = await lfsOffers
    .createLfsOffers({
      call,
      db: db as unknown as Parameters<
        typeof lfsOffers.createLfsOffers
      >[0]["db"],
      notice: (...args) => notice(...args),
    })
    .track(offerId)
    .catch((error: Error) => ({
      answer: `refused: ${error.message}`,
      commit: null,
    }));
  const pointer = answered.commit
    ? git(dir, "cat-file", "-p", `${answered.commit}:media/big.bin`)
    : "";
  kit.check(
    "D: Track with LFS commits media/big.bin as an LFS pointer in a second commit",
    answered.answer === "tracked" &&
      pointer.startsWith(POINTER) &&
      git(dir, "rev-list", "--count", "HEAD") === "2",
    `${answered.answer}: ${pointer.slice(0, 60)}`
  );
  const ignore = await readFile(join(dir, ".gitignore"), "utf8");
  // The folder's own git alone: no global or system config naming
  // git-lfs's filters, as on a machine where `git lfs install` never ran.
  const own = Bun.spawnSync(["git", "status", "--porcelain"], {
    cwd: dir,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const status = `${own.stdout.toString().trim()}${own.stderr.toString().trim()}`;
  kit.check(
    "D: .gitignore no longer names it, .gitattributes tracks *.bin, and the folder's status is clean with no global git config",
    !ignore.includes("/media/big.bin") &&
      (await readFile(join(dir, ".gitattributes"), "utf8")).includes(
        "*.bin filter=lfs"
      ) &&
      own.exitCode === 0 &&
      status === "",
    `${ignore}\n${status}`
  );
  const prePush = await readFile(
    join(dir, ".git", "hooks", "pre-push"),
    "utf8"
  ).catch(() => "");
  kit.check(
    "D: the folder's own git runs git-lfs's pre-push, so the person's own push sends the large file",
    prePush.includes("git lfs pre-push"),
    prePush || "no pre-push hook"
  );
};

/** A hub request, as JSON when it has a body, with `headers`. */
const asked = (
  path: string,
  init: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: string;
  } = {}
) =>
  new Request(`http://127.0.0.1${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

/**
 * E: the hub's side, a real hub in this process. The person declares the
 * project's Large files with a connection that holds a key; a machine with
 * a place of the project, by its proof, is answered the endpoint and that
 * key as Basic; a machine with no place, and a session, are refused; the
 * machine's word of a refused `.lfsconfig` lands in the project's thread.
 */
const hubLeg = async (kit: Kit, root: string): Promise<void> => {
  const home = join(root, "e");
  const homeWas = process.env.HOME;
  const { hubInProcess } =
    await import("../../../packages/hub/scripts/hub-in-process");
  const { db, hub, lifetime } = await hubInProcess(
    join(home, "cawco.db"),
    home
  );
  try {
    const { hubId } = await import("../../../packages/hub/src/hub-id");
    const { httpProof } =
      await import("../../../packages/core/src/machine-key");
    const { MACHINE_PROOF_HEADER } = await import("../../../packages/core/src");
    const proven = (
      machineId: string,
      key: string,
      method: string,
      route: string
    ) => {
      const at = Date.now();
      const nonce = crypto.randomUUID();
      return {
        [MACHINE_PROOF_HEADER]: `${machineId} ${at} ${nonce} ${httpProof(key, { at, hubId: hubId(), machineId, method, nonce, path: route })}`,
      };
    };
    const keyOf = {
      place: "probe-key-place-0123456789",
      none: "probe-key-none-0123456789",
    };
    db.hubAuth.putMachineKey("probe-place", keyOf.place);
    db.hubAuth.putMachineKey("probe-none", keyOf.none);
    db.createProject({
      id: "probe-project",
      name: "probe",
      checkout: { machineId: "probe-place", path: "/srv/probe" as never },
      remote: null,
    });
    const said = async (response: Response) =>
      `${response.status} ${(await response.text()).slice(0, 300)}`;
    const made = await hub.handle(
      asked("/api/connections", {
        method: "POST",
        body: {
          name: "probe-store",
          service: "github",
          account: "@probe",
          transport: "http",
          url: "http://127.0.0.1:9/mcp",
          auth: "bearer",
        },
      })
    );
    const keyed = await hub.handle(
      asked("/api/connections/probe-store/key", {
        method: "PUT",
        body: { key: "probe-connection-key" },
      })
    );
    kit.note(`E: connection ${await said(made)}; key ${keyed.status}`);
    const plain = await hub.handle(
      asked("/api/projects/probe-project", {
        method: "PATCH",
        body: {
          lfs: {
            url: "http://lfs.example.com/o/r.git",
            connection: "probe-store",
          },
        },
      })
    );
    kit.check(
      "E: a Large files URL over plain http is refused",
      plain.status === 400,
      await said(plain)
    );
    const declared = await hub.handle(
      asked("/api/projects/probe-project", {
        method: "PATCH",
        body: {
          lfs: {
            url: "https://lfs.example.com/o/r.git",
            connection: "probe-store",
          },
        },
      })
    );
    const row = (await declared
      .clone()
      .json()
      .catch(() => ({}))) as {
      lfsConnection?: string;
      lfsUrl?: string;
    };
    kit.check(
      "E: the person declares the project's Large files, the clone URL read as its LFS endpoint",
      declared.status === 200 &&
        row.lfsUrl === "https://lfs.example.com/o/r.git/info/lfs" &&
        row.lfsConnection === "probe-store",
      await said(declared)
    );
    const path = "/api/lfs/projects/probe-project";
    const answer = await hub.handle(
      asked(path, { headers: proven("probe-place", keyOf.place, "GET", path) })
    );
    const read = (await answer
      .clone()
      .json()
      .catch(() => ({}))) as {
      declared?: { basic: string; endpoint: string };
    };
    kit.check(
      "E: a machine holding a place of the project, by its proof, is answered the endpoint and the connection's key",
      answer.status === 200 &&
        read.declared?.endpoint ===
          "https://lfs.example.com/o/r.git/info/lfs" &&
        read.declared.basic === btoa("x-access-token:probe-connection-key"),
      await said(answer)
    );
    const stranger = await hub.handle(
      asked(path, { headers: proven("probe-none", keyOf.none, "GET", path) })
    );
    const session = await hub.handle(
      asked(path, { headers: { authorization: "Bearer probe-session" } })
    );
    kit.check(
      "E: a machine with no place of the project, and a session, are refused",
      stranger.status === 403 && session.status === 403,
      `${await said(stranger)} / ${await said(session)}`
    );
    const refusedPath = `${path}/refused`;
    const endpoint = "https://third.example.com/x.git/info/lfs";
    const told = await hub.handle(
      asked(refusedPath, {
        method: "POST",
        headers: proven("probe-place", keyOf.place, "POST", refusedPath),
        body: { root: "/srv/probe", endpoint, machineId: "probe-place" },
      })
    );
    // A project with no conversation yet keeps the note for the next one.
    db.projectNotes.adopt("probe-project", "probe-conversation");
    const note = db.projectNotes
      .of("probe-conversation")
      .map((kept) => kept.note)
      .find(
        (kept) =>
          kept.event.kind === "repo" && kept.event.lfsRefused === endpoint
      );
    kit.check(
      "E: the machine's word of a refused .lfsconfig is kept for the project's conversation, naming the endpoint and how to declare it",
      told.status === 200 &&
        (note?.body ?? "").includes(endpoint) &&
        (note?.body ?? "").includes("Project details › Large files"),
      `${await said(told)}; ${note?.body ?? "no note"}`
    );
  } finally {
    lifetime.close();
    process.env.HOME = homeWas;
  }
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "host-lfs",
  run: async (kit: Kit) => {
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "host-lfs-")
    );
    try {
      // First: the hub reads HOME and its database path once, as its modules load.
      await hubLeg(kit, root);
      await pushLeg(kit, root);
      await undeclaredLeg(kit, root);
      await declaredLeg(kit, root);
      await folderLeg(kit, root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
