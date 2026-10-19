/**
 * The forge-adapters spec's poller leg: the hub's GitHub poller (hub
 * github.ts `pollRepo`, which ingress.ts runs for a project) reads a
 * repository through Octokit, signed in as the poller's connection, against
 * a stand-in of GitHub's REST API on the loopback.
 *
 * The stand-in answers the four lists the poller reads (docs.github.com/rest:
 * pulls, issues, issue comments, issue events), each with an ETag and a 304
 * for it, and the pulls list over two pages joined by a `link` header, and
 * records every request: its path, User-Agent, Authorization and
 * If-None-Match. The connection's Octokit is made as the hub makes a token
 * connection's (connections.ts `githubClient`): its token, the API's origin,
 * `userAgent: "CawCo-hub"`.
 *
 * (p) one poll asks every list through Octokit (its User-Agent names
 *     octokit-rest.js, its Authorization is Octokit's `token <t>`), follows
 *     the pulls list's `link` to its second page, and reads both pulls;
 * (p) the next poll sends each list's ETag and takes GitHub's 304 for it:
 *     no events, each cursor's not-modified count one more.
 */
import { join } from "node:path";
import type { Kit } from "./kit";

const TOKEN = "probe-poll-token";
const REPO = "probe-owner/probe-repo";

/** One request the stand-in took. */
interface Seen {
  readonly authorization: string;
  readonly ifNoneMatch: string;
  readonly path: string;
  readonly userAgent: string;
}

/** GitHub's lists for one repository: the pulls over two pages, the others empty, each with its ETag. */
const pollStub = (now: number) => {
  const seen: Seen[] = [];
  const at = new Date(now - 30_000).toISOString();
  const pull = (number: number) => ({
    number,
    html_url: `https://github.com/${REPO}/pull/${number}`,
    title: `Probe pull ${number}`,
    body: null,
    user: { login: "probe-author" },
    labels: [],
    head: { ref: `probe-${number}` },
    base: { repo: { full_name: REPO } },
    created_at: at,
    updated_at: at,
    closed_at: null,
    merged_at: null,
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const ifNoneMatch = request.headers.get("if-none-match") ?? "";
      seen.push({
        path: `${url.pathname}${url.search}`,
        userAgent: request.headers.get("user-agent") ?? "",
        authorization: request.headers.get("authorization") ?? "",
        ifNoneMatch,
      });
      const list = url.pathname.slice(`/repos/${REPO}/`.length);
      const page = url.searchParams.get("page") ?? "1";
      const etag = `"probe-${list.replaceAll("/", "-")}-${page}"`;
      if (ifNoneMatch === etag) {
        return new Response(null, { status: 304, headers: { etag } });
      }
      if (!url.pathname.startsWith(`/repos/${REPO}/`)) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      if (list === "pulls" && page === "1") {
        const next = new URL(url);
        next.searchParams.set("page", "2");
        return Response.json([pull(1)], {
          headers: { etag, link: `<${next.href}>; rel="next"` },
        });
      }
      return Response.json(list === "pulls" ? [pull(2)] : [], {
        headers: { etag },
      });
    },
  });
  return { seen, origin: `http://127.0.0.1:${server.port}`, server };
};

export const githubPollLeg = async (kit: Kit): Promise<void> => {
  const now = Date.now();
  const stub = pollStub(now);
  const { pollRepo } = await import("../../packages/hub/src/github");
  const { Octokit } = (await import(
    Bun.resolveSync(
      "@octokit/rest",
      join(import.meta.dir, "../../packages/hub/src")
    )
  )) as { Octokit: new (options: Record<string, unknown>) => unknown };
  const octokit = new Octokit({
    auth: TOKEN,
    baseUrl: stub.origin,
    userAgent: "CawCo-hub",
  });
  // The poller's input as ingress hands it: its connection's Octokit. A
  // build that reads by hand takes the API and the token instead.
  const asked = {
    connection: "probe-github",
    now,
    repo: REPO,
    octokit,
    api: stub.origin,
    token: TOKEN,
  };
  try {
    const first = await pollRepo({ ...asked, cursors: {} } as never);
    const firstSeen = [...stub.seen];
    const keys = first.events.map((event) => event.key).sort();
    kit.check(
      "(p) the GitHub poller asks every list through Octokit, signed in as its connection, and follows the pulls list's link to its second page",
      first.problem === null &&
        firstSeen.length === 5 &&
        firstSeen.every(
          (each) =>
            each.userAgent.startsWith("CawCo-hub octokit-rest.js/") &&
            each.authorization === `token ${TOKEN}`
        ) &&
        firstSeen.some(
          (each) =>
            each.path.includes("/pulls?") && each.path.includes("page=2")
        ) &&
        keys.join(",") === "pr:1:opened,pr:2:opened",
      `problem ${first.problem} | events ${keys.join(",")} | asked ${JSON.stringify(firstSeen)}`
    );

    const second = await pollRepo({
      ...asked,
      now: now + 60_000,
      cursors: first.cursors,
    } as never);
    const secondSeen = stub.seen.slice(firstSeen.length);
    const cursors = Object.values(second.cursors);
    kit.check(
      "(p) the next poll sends each list's ETag through Octokit and takes GitHub's 304: no events, each list's not-modified count one more",
      second.problem === null &&
        second.events.length === 0 &&
        secondSeen.length === 4 &&
        secondSeen.every(
          (each) =>
            each.ifNoneMatch.startsWith('"probe-') &&
            each.userAgent.startsWith("CawCo-hub octokit-rest.js/")
        ) &&
        cursors.length === 4 &&
        cursors.every((cursor) => cursor?.notModified === 1),
      `problem ${second.problem} | events ${second.events.length} | asked ${JSON.stringify(secondSeen)} | cursors ${JSON.stringify(second.cursors)}`
    );
  } finally {
    stub.server.stop(true);
  }
};
