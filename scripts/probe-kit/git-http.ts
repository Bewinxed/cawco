/**
 * Git repositories on a host that is not GitHub, for the specs that need
 * one: bare repositories under a root, served over http on the loopback by
 * git's own smart http server (git-http-backend(1), run as a CGI program),
 * taking pushes (`http.receivepack`). Each push a repository takes is
 * counted (a `POST …/git-receive-pack`).
 *
 * Each repository also has an LFS server at the endpoint git-lfs guesses for
 * it (`<repo>.git/info/lfs`, git-lfs docs/api/server-discovery.md), and any
 * other path ending `/info/lfs` is one too: git-lfs's Batch API
 * (docs/api/batch.md: `POST <endpoint>/objects/batch`, `upload` actions),
 * signed in with Basic auth alone (401 with `LFS-Authenticate` otherwise),
 * each object stored with the login that sent it.
 *
 * A repository made `signedIn` takes pushes signed in with Basic auth
 * (401 with `WWW-Authenticate` otherwise) and reads from anyone, as a forge
 * serves a public repository: a push there asks git's credential helper.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { startedPath } from "../../packages/core/src/workspace-needs";

/** A CGI answer's head and body, split at its blank line. */
const CGI_HEAD_END = /\r?\n\r?\n/u;
const LINE_BREAK = /\r?\n/u;
const RECEIVE_PACK = /\/git-receive-pack$/u;
/** `<endpoint>/objects/batch`: the LFS server's endpoint before it. */
const LFS_BATCH = /^\/(.+)\/info\/lfs\/objects\/batch$/u;
/** An upload's href: `/lfs-upload/<endpoint path>/<oid>`. */
const LFS_UPLOAD = /^\/lfs-upload\/(.+)\/([0-9a-f]{64})$/u;
const LFS_JSON = "application/vnd.git-lfs+json";

/** One LFS object a server took: its id and the login that sent it. */
export interface LfsObject {
  readonly oid: string;
  readonly user: string;
}

export interface GitHttp {
  /** Makes a bare repository at `path` (`owner/repo.git`) under the root, taking only signed-in pushes when `signedIn`: answers its URL. */
  readonly bare: (path: string, signedIn?: boolean) => Promise<string>;
  /** Where repository `path` lies on disk. */
  readonly dir: (path: string) => string;
  /** The LFS objects the server at endpoint path `endpoint` took (`someone/else.git`, or any other path before `/info/lfs`). */
  readonly lfs: (endpoint: string) => readonly LfsObject[];
  /** How many Batch API calls the server at endpoint path `endpoint` was sent, signed in or not. */
  readonly lfsCalls: (endpoint: string) => number;
  /** How many pushes repository `path` has taken. */
  readonly pushes: (path: string) => number;
  readonly stop: () => void;
}

/** One CGI answer as an HTTP response: its `Status:` and its headers, then its body. */
const cgiResponse = (out: Buffer): Response => {
  const text = out.toString("latin1");
  const match = CGI_HEAD_END.exec(text);
  const head = match ? text.slice(0, match.index) : "";
  const body = match ? out.subarray(match.index + match[0].length) : out;
  const headers = new Headers();
  let status = 200;
  for (const line of head.split(LINE_BREAK)) {
    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (name.toLowerCase() === "status") {
      status = Number.parseInt(value, 10) || 200;
    } else {
      headers.append(name, value);
    }
  }
  return new Response(new Uint8Array(body), { status, headers });
};

/** The login of a request's Basic `Authorization`, when it is `login` with `password`. */
const basicUser = (
  request: Request,
  login: { password: string; user: string }
): string | undefined => {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) {
    return;
  }
  const [user, password] = atob(header.slice("Basic ".length)).split(":");
  return user === login.user && password === login.password ? user : undefined;
};

/**
 * Serves the bare repositories under `root` over http on 127.0.0.1; their
 * LFS takes `login` alone, and `api`, when given, answers first.
 */
export const serveGitHttp = (
  root: string,
  login: { password: string; user: string } = {
    user: "probe",
    password: "probe",
  },
  /** A forge's API on the same host (forge-stubs.ts): its answer, or none for git's own paths. */
  api?: (request: Request, url: URL) => Promise<Response | undefined>
): GitHttp => {
  const pushed = new Map<string, number>();
  const stored = new Map<string, LfsObject[]>();
  const calls = new Map<string, number>();
  /** The repositories that take only signed-in pushes, by their path. */
  const signedIn = new Set<string>();
  const lfs = async (
    request: Request,
    url: URL,
    serverBase: string
  ): Promise<Response | undefined> => {
    const batch = LFS_BATCH.exec(url.pathname);
    const upload = LFS_UPLOAD.exec(url.pathname);
    if (!(batch || upload)) {
      return;
    }
    const endpoint = (batch?.[1] ?? upload?.[1]) as string;
    if (batch) {
      calls.set(endpoint, (calls.get(endpoint) ?? 0) + 1);
    }
    const user = basicUser(request, login);
    if (!user) {
      return Response.json(
        { message: "Credentials needed" },
        {
          status: 401,
          headers: {
            "content-type": LFS_JSON,
            "lfs-authenticate": 'Basic realm="probe"',
          },
        }
      );
    }
    if (upload) {
      await request.arrayBuffer();
      stored.set(endpoint, [
        ...(stored.get(endpoint) ?? []),
        { oid: upload[2] as string, user },
      ]);
      return new Response(null, { status: 200 });
    }
    const asked = (await request.json()) as {
      objects: { oid: string; size: number }[];
      operation: string;
    };
    const have = new Set((stored.get(endpoint) ?? []).map((one) => one.oid));
    return Response.json(
      {
        transfer: "basic",
        objects: asked.objects.map(({ oid, size }) =>
          asked.operation === "upload" && !have.has(oid)
            ? {
                oid,
                size,
                authenticated: true,
                actions: {
                  upload: {
                    href: `${serverBase}/lfs-upload/${endpoint}/${oid}`,
                    header: {
                      authorization: request.headers.get("authorization") ?? "",
                    },
                  },
                },
              }
            : { oid, size }
        ),
      },
      { headers: { "content-type": LFS_JSON } }
    );
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const apiAnswer = await api?.(request, url);
      if (apiAnswer) {
        return apiAnswer;
      }
      const lfsAnswer = await lfs(
        request,
        url,
        `http://127.0.0.1:${server.port}`
      );
      if (lfsAnswer) {
        return lfsAnswer;
      }
      if (
        [...signedIn].some((path) => url.pathname.startsWith(`/${path}/`)) &&
        (RECEIVE_PACK.test(url.pathname) ||
          url.searchParams.get("service") === "git-receive-pack") &&
        !basicUser(request, login)
      ) {
        return new Response("Credentials needed\n", {
          status: 401,
          headers: { "www-authenticate": 'Basic realm="probe"' },
        });
      }
      if (request.method === "POST" && RECEIVE_PACK.test(url.pathname)) {
        const repo = url.pathname.replace(RECEIVE_PACK, "").slice(1);
        pushed.set(repo, (pushed.get(repo) ?? 0) + 1);
      }
      const child = Bun.spawn(["git", "http-backend"], {
        env: {
          PATH: startedPath(),
          GIT_PROJECT_ROOT: root,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          REQUEST_METHOD: request.method,
          CONTENT_TYPE: request.headers.get("content-type") ?? "",
          HTTP_CONTENT_ENCODING: request.headers.get("content-encoding") ?? "",
          GIT_PROTOCOL: request.headers.get("git-protocol") ?? "",
          REMOTE_USER: "probe",
          REMOTE_ADDR: "127.0.0.1",
        },
        stdin: request.body
          ? new Uint8Array(await request.arrayBuffer())
          : "ignore",
        stdout: "pipe",
        stderr: "ignore",
      });
      return cgiResponse(
        Buffer.from(await new Response(child.stdout).arrayBuffer())
      );
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  return {
    bare: async (path, signed = false) => {
      if (signed) {
        signedIn.add(path);
      }
      const dir = join(root, path);
      await mkdir(dir, { recursive: true });
      await Bun.$`git init -q --bare -b main ${dir} && git -C ${dir} config http.receivepack true`.quiet();
      return `${base}/${path}`;
    },
    dir: (path) => join(root, path),
    lfs: (endpoint) => stored.get(endpoint) ?? [],
    lfsCalls: (endpoint) => calls.get(endpoint) ?? 0,
    pushes: (path) => pushed.get(path) ?? 0,
    stop: () => server.stop(true),
  };
};
