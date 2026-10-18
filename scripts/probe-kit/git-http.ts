/**
 * Git repositories on a host that is not GitHub, for the specs that need
 * one: bare repositories under a root, served over http on the loopback by
 * git's own smart http server (git-http-backend(1), run as a CGI program),
 * taking pushes (`http.receivepack`). Each push a repository takes is
 * counted (a `POST …/git-receive-pack`).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/** A CGI answer's head and body, split at its blank line. */
const CGI_HEAD_END = /\r?\n\r?\n/;
const LINE_BREAK = /\r?\n/;
const RECEIVE_PACK = /\/git-receive-pack$/;

export interface GitHttp {
  /** Makes a bare repository at `path` (`owner/repo.git`) under the root: answers its URL. */
  readonly bare: (path: string) => Promise<string>;
  /** Where repository `path` lies on disk. */
  readonly dir: (path: string) => string;
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

/** Serves the bare repositories under `root` over http on 127.0.0.1. */
export const serveGitHttp = (root: string): GitHttp => {
  const pushed = new Map<string, number>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "POST" && RECEIVE_PACK.test(url.pathname)) {
        const repo = url.pathname.replace(RECEIVE_PACK, "").slice(1);
        pushed.set(repo, (pushed.get(repo) ?? 0) + 1);
      }
      const child = Bun.spawn(["git", "http-backend"], {
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
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
    bare: async (path) => {
      const dir = join(root, path);
      await mkdir(dir, { recursive: true });
      await Bun.$`git init -q --bare -b main ${dir} && git -C ${dir} config http.receivepack true`.quiet();
      return `${base}/${path}`;
    },
    dir: (path) => join(root, path),
    pushes: (path) => pushed.get(path) ?? 0,
    stop: () => server.stop(true),
  };
};
