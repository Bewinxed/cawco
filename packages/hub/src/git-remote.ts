/**
 * The hub as a git remote (Projects spec §5.1, "A project runs on any
 * machine"): a bare repository per project under the hub's data folder,
 * served by git's own smart HTTP CGI (`git http-backend`), and a Git LFS
 * server beside it (the Batch API and the `basic` transfer adapter), its
 * objects kept once each by sha256.
 *
 * Every request carries HTTP Basic: a fleet machine's credential
 * (`<machineId>:<credential>`, minted at each register) or a session's
 * (`<instanceId>:<session credential>`). Anything else is a 401. The proven
 * id is the CGI's `REMOTE_USER`, which is what turns `receive-pack` on
 * ("If the client is authenticated, the receive-pack service is enabled",
 * https://git-scm.com/docs/git-http-backend).
 *
 * Bodies stream both ways: a pack goes from the client's request into the
 * CGI's stdin and from its stdout into the response without being held in
 * memory, and a large file goes to disk as it arrives.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { detach } from "@cawco/core/detach";
import { Elysia } from "elysia";
import { hidden } from "./hidden";

export interface GitRemoteDeps {
  /** The machine or session an `Authorization` header proves, else undefined. */
  readonly authenticate: (authorization: string | null) => string | undefined;
  /** Where large files are kept: `<lfsRoot>/objects/<aa>/<bb>/<oid>`. */
  readonly lfsRoot: string;
  /** Only a project the hub has gets a repository. */
  readonly projectExists: (projectId: string) => boolean;
  /** `GIT_PROJECT_ROOT`: each project's bare repository is `<root>/<projectId>.git`. */
  readonly root: string;
}

/** A repository's segment of the path: `<projectId>.git`. */
const REPO = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.git$/;
const OID = /^[0-9a-f]{64}$/;
const RANGE = /^bytes=(\d+)-(\d*)$/;
const HEADER_LINE = /^([^:]+):\s*(.*)$/;
const LFS_TYPE = "application/vnd.git-lfs+json";
const REALM = 'Basic realm="CawCo"';
/** How long a large file's link in a batch answer stands. */
const ACTION_EXPIRES_S = 3600;
/** The tail of a CGI's stderr kept for the log. */
const STDERR_KEPT = 4000;

/** The project id a repository segment names, or undefined. */
export const repoProject = (segment: string): string | undefined =>
  REPO.exec(segment)?.[1];

/** The bare repository of `projectId` under `root`. */
export const bareRepoPath = (root: string, projectId: string): string =>
  join(root, `${projectId}.git`);

/** A large file's place in the store. */
export const lfsObjectPath = (lfsRoot: string, oid: string): string =>
  join(lfsRoot, "objects", oid.slice(0, 2), oid.slice(2, 4), oid);

const run = async (argv: string[]): Promise<void> => {
  const child = Bun.spawn(argv, {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(`${argv.slice(0, 3).join(" ")} failed: ${stderr.trim()}`);
  }
};

/** Where the bytes of a CGI's header block end, and how long its terminator is. */
const headerEnd = (bytes: Uint8Array): { at: number; length: number } => {
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (bytes[i] === 10 && bytes[i + 1] === 10) {
      return { at: i, length: 2 };
    }
    if (
      bytes[i] === 13 &&
      bytes[i + 1] === 10 &&
      bytes[i + 2] === 13 &&
      bytes[i + 3] === 10
    ) {
      return { at: i, length: 4 };
    }
  }
  return { at: -1, length: 0 };
};

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a, 0);
  joined.set(b, a.length);
  return joined;
};

const LINE_BREAK = /\r?\n/;

/**
 * A CGI's stdout read up to the end of its header block: its status, its
 * headers, and the bytes of the body already read. Undefined when it ended
 * before a header block.
 */
const cgiHead = async (
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<
  { headers: Headers; rest: Uint8Array; status: number } | undefined
> => {
  let head: Uint8Array = new Uint8Array(0);
  let end = { at: -1, length: 0 };
  while (end.at < 0) {
    // biome-ignore lint/performance/noAwaitInLoops: the header block arrives in order, chunk by chunk
    const { value, done } = await reader.read();
    if (done) {
      return undefined;
    }
    head = concat(head, value);
    end = headerEnd(head);
  }
  const headers = new Headers();
  let status = 200;
  const block = new TextDecoder().decode(head.slice(0, end.at));
  for (const line of block.split(LINE_BREAK)) {
    const match = HEADER_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, name, value] = match;
    if (name.toLowerCase() === "status") {
      status = Number.parseInt(value, 10) || 500;
    } else {
      headers.append(name, value);
    }
  }
  return { headers, rest: head.slice(end.at + end.length), status };
};

const lfsError = (status: number, message: string): Response =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: {
      "Content-Type": LFS_TYPE,
      ...(status === 401 ? { "LFS-Authenticate": REALM } : {}),
    },
  });

const unauthorized = (): Response =>
  new Response(
    "This remote takes a CawCo machine or session credential (HTTP Basic).\n",
    {
      status: 401,
      headers: {
        "WWW-Authenticate": REALM,
        "Content-Type": "text/plain",
      },
    }
  );

interface BatchObject {
  oid: string;
  size: number;
}

export const gitRemoteRoutes = (deps: GitRemoteDeps) => {
  /** Repositories being made now, so two first requests make one. */
  const making = new Map<string, Promise<string>>();

  /**
   * The project's bare repository, made on first use with `http.receivepack`
   * on. Undefined for a project the hub does not have.
   */
  const repository = (projectId: string): Promise<string> | undefined => {
    if (!deps.projectExists(projectId)) {
      return undefined;
    }
    const path = bareRepoPath(deps.root, projectId);
    const made = making.get(path);
    if (made !== undefined) {
      return made;
    }
    const make = (async () => {
      const exists = await stat(join(path, "HEAD")).then(
        () => true,
        () => false
      );
      if (!exists) {
        await mkdir(deps.root, { recursive: true });
        await run(["git", "init", "--quiet", "--bare", path]);
        await run(["git", "-C", path, "config", "http.receivepack", "true"]);
      }
      return path;
    })();
    making.set(path, make);
    make.catch(() => making.delete(path));
    return make;
  };

  /** Who the request is, for a route that refuses everyone else. */
  const caller = (request: Request): string | undefined =>
    deps.authenticate(request.headers.get("authorization"));

  /** The environment `git http-backend` reads (git-http-backend(1), "ENVIRONMENT"). */
  const cgiEnv = (
    request: Request,
    projectId: string,
    service: string,
    user: string
  ): Record<string, string> => {
    const header = (name: string) => request.headers.get(name) ?? undefined;
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/",
      GIT_PROJECT_ROOT: deps.root,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: `/${projectId}.git/${service}`,
      REMOTE_USER: user,
      REQUEST_METHOD: request.method,
      QUERY_STRING: new URL(request.url).search.slice(1),
      CONTENT_TYPE: header("content-type") ?? "",
    };
    const optional: [string, string | undefined][] = [
      ["CONTENT_LENGTH", header("content-length")],
      // git gzips a long negotiation; the backend inflates it itself.
      ["HTTP_CONTENT_ENCODING", header("content-encoding")],
      // Protocol v2 rides this header (git-http-backend: GIT_PROTOCOL).
      ["GIT_PROTOCOL", header("git-protocol")],
    ];
    for (const [key, value] of optional) {
      if (value) {
        env[key] = value;
      }
    }
    return env;
  };

  /**
   * One smart-HTTP request through `git http-backend`: the request body piped
   * into its stdin, its stdout's CGI header block read, then the rest
   * streamed back as the response body.
   */
  const backend = async (
    request: Request,
    projectId: string,
    service: string,
    user: string
  ): Promise<Response> => {
    const made = repository(projectId);
    if (!made) {
      return new Response(`There is no project ${projectId}.\n`, {
        status: 404,
      });
    }
    await made;
    const child = Bun.spawn(["git", "http-backend"], {
      env: cgiEnv(request, projectId, service, user),
      stdin: request.body ?? "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    let stderr = "";
    const decoder = new TextDecoder();
    // What the backend says on stderr goes to the log once it ends.
    detach(
      (async () => {
        for await (const chunk of child.stderr) {
          stderr = (stderr + decoder.decode(chunk)).slice(-STDERR_KEPT);
        }
        const code = await child.exited;
        if (code !== 0 || stderr.trim()) {
          console.warn(
            `[git] ${service} for ${projectId} by ${user} exited ${code}: ${stderr.trim()}`
          );
        }
      })(),
      "git http-backend"
    );
    const reader = child.stdout.getReader();
    const head = await cgiHead(reader);
    if (!head) {
      await child.exited;
      return new Response(
        `git http-backend answered nothing: ${stderr.trim()}\n`,
        { status: 502 }
      );
    }
    const { status, headers, rest } = head;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (rest.length > 0) {
          controller.enqueue(rest);
        }
      },
      async pull(controller) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      },
      cancel() {
        child.kill();
      },
    });
    return new Response(body, { status, headers });
  };

  /** The answer for one object of a batch. */
  const batchObject = async (
    operation: "download" | "upload",
    object: BatchObject,
    href: string
  ) => {
    const { oid, size } = object;
    if (!(OID.test(oid) && Number.isSafeInteger(size) && size >= 0)) {
      return {
        oid,
        size,
        error: { code: 422, message: "An object is a sha256 oid and a size." },
      };
    }
    const held = await stat(lfsObjectPath(deps.lfsRoot, oid)).then(
      (found) => found.size,
      () => undefined
    );
    if (operation === "download") {
      return held === undefined
        ? {
            oid,
            size,
            error: { code: 404, message: "The hub does not have this object." },
          }
        : {
            oid,
            size: held,
            actions: {
              download: {
                href: `${href}/${oid}`,
                expires_in: ACTION_EXPIRES_S,
              },
            },
          };
    }
    // An upload the hub already holds is said by leaving out `actions`.
    return held === size
      ? { oid, size }
      : {
          oid,
          size,
          actions: {
            upload: { href: `${href}/${oid}`, expires_in: ACTION_EXPIRES_S },
          },
        };
  };

  /** A large file's bytes, whole (200) or from where a resumed download stopped (206). */
  const download = async (oid: string, request: Request): Promise<Response> => {
    const path = lfsObjectPath(deps.lfsRoot, oid);
    const size = await stat(path).then(
      (found) => found.size,
      () => undefined
    );
    if (size === undefined) {
      return lfsError(404, "The hub does not have this object.");
    }
    const range = request.headers.get("range");
    const file = Bun.file(path);
    if (!range) {
      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
        },
      });
    }
    const match = RANGE.exec(range.trim());
    const start = match ? Number(match[1]) : Number.NaN;
    const last = match?.[2] ? Number(match[2]) : size - 1;
    if (!(start <= last && last < size)) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    return new Response(file.slice(start, last + 1), {
      status: 206,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(last - start + 1),
        "Content-Range": `bytes ${start}-${last}/${size}`,
        "Accept-Ranges": "bytes",
      },
    });
  };

  /**
   * A large file arriving: written to a temporary file as it streams, hashed
   * on the way, and kept only when its sha256 is its oid and its length the
   * length it was sent with.
   */
  const upload = async (oid: string, request: Request): Promise<Response> => {
    const target = lfsObjectPath(deps.lfsRoot, oid);
    const temporary = join(deps.lfsRoot, "tmp", `${oid}.${randomUUID()}`);
    await mkdir(dirname(temporary), { recursive: true });
    const writer = Bun.file(temporary).writer();
    const hash = createHash("sha256");
    let length = 0;
    try {
      if (request.body) {
        for await (const chunk of request.body) {
          hash.update(chunk);
          length += chunk.length;
          writer.write(chunk);
          // Drained before the next chunk is read: memory holds one at a time.
          await writer.flush();
        }
      }
      await writer.end();
      const declared = request.headers.get("content-length");
      if (declared !== null && Number(declared) !== length) {
        return lfsError(
          422,
          `The upload was ${length} bytes, not the ${declared} it declared.`
        );
      }
      if (hash.digest("hex") !== oid) {
        return lfsError(422, "The upload's sha256 is not its oid.");
      }
      await mkdir(dirname(target), { recursive: true });
      await rename(temporary, target);
      return new Response(null, { status: 200 });
    } finally {
      await rm(temporary, { force: true });
    }
  };

  /** `[git]` and `[lfs]` log lines name the caller and that it authenticated, never the credential. */
  const logLfs = (
    request: Request,
    user: string,
    what: string,
    extra = ""
  ): void => {
    console.log(
      `[lfs] ${request.method} ${what} by ${user} (authorization: ${
        request.headers.get("authorization")?.split(" ")[0] ?? "none"
      } present)${extra}`
    );
  };

  // Bodies are the CGI's and the store's to read, as they stream.
  const opts = { parse: "none" as const, ...hidden };

  /** A smart-HTTP route: refused without a credential, then the backend's. */
  const smart =
    (service: string) =>
    ({ params, request }: { params: { repo: string }; request: Request }) => {
      const user = caller(request);
      if (!user) {
        return unauthorized();
      }
      const projectId = repoProject(params.repo);
      return projectId
        ? backend(request, projectId, service, user)
        : new Response("Not a repository.\n", { status: 404 });
    };

  return (
    new Elysia()
      // Discovery: which refs, and whether to speak v2.
      .get("/git/:repo/info/refs", opts, smart("info/refs"))
      .post("/git/:repo/git-upload-pack", opts, smart("git-upload-pack"))
      .post("/git/:repo/git-receive-pack", opts, smart("git-receive-pack"))
      // The LFS Batch API (git-lfs docs/api/batch.md), `basic` transfers only.
      .post(
        "/git/:repo/info/lfs/objects/batch",
        opts,
        async ({ params, request }) => {
          const projectId = repoProject(params.repo);
          const user = caller(request);
          if (!user) {
            return lfsError(401, "This remote takes a CawCo credential.");
          }
          if (!(projectId && deps.projectExists(projectId))) {
            return lfsError(404, "There is no such project on this hub.");
          }
          let body: {
            objects?: BatchObject[];
            operation?: string;
            transfers?: string[];
          };
          try {
            body = (await request.json()) as typeof body;
          } catch {
            return lfsError(422, "A batch request is JSON.");
          }
          const { operation, objects, transfers } = body;
          if (
            !(
              (operation === "download" || operation === "upload") &&
              Array.isArray(objects)
            )
          ) {
            return lfsError(
              422,
              "A batch names an operation (download or upload) and its objects."
            );
          }
          if (transfers && !transfers.includes("basic")) {
            return lfsError(
              422,
              "This hub transfers large files with the basic adapter only."
            );
          }
          const href = `${new URL(request.url).origin}/git/${params.repo}/info/lfs/objects`;
          logLfs(
            request,
            user,
            `batch ${operation} of ${objects.length} object(s) for ${projectId}`
          );
          return new Response(
            JSON.stringify({
              transfer: "basic",
              hash_algo: "sha256",
              objects: await Promise.all(
                objects.map((object) => batchObject(operation, object, href))
              ),
            }),
            { headers: { "Content-Type": LFS_TYPE } }
          );
        }
      )
      .get("/git/:repo/info/lfs/objects/:oid", opts, ({ params, request }) => {
        const user = caller(request);
        if (!user) {
          return lfsError(401, "This remote takes a CawCo credential.");
        }
        if (!OID.test(params.oid)) {
          return lfsError(404, "Not an object.");
        }
        const range = request.headers.get("range");
        logLfs(
          request,
          user,
          `object ${params.oid.slice(0, 12)}`,
          range ? ` Range: ${range}` : " whole"
        );
        return download(params.oid, request);
      })
      .put("/git/:repo/info/lfs/objects/:oid", opts, ({ params, request }) => {
        const user = caller(request);
        if (!user) {
          return lfsError(401, "This remote takes a CawCo credential.");
        }
        if (!OID.test(params.oid)) {
          return lfsError(422, "Not an object id.");
        }
        logLfs(request, user, `object ${params.oid.slice(0, 12)}`);
        return upload(params.oid, request);
      })
  );
};
