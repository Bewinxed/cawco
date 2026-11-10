/**
 * A POST with no body reaches the hub through the dashboard as it was sent:
 * no body and no type, so the hub never parses it as JSON. The dashboard's
 * `/api` proxy once gave every request without a type `application/json`
 * (apps/dashboard `routes/api/[...path]/+server.ts`), and the hub parses a
 * typed body before any handler runs on a route that takes one, so Sign in
 * on an OAuth MCP server in Configure › MCP servers (`POST
 * /api/fleet/mcp/:name/sign-in`, no body when no access is picked) was
 * refused "Unexpected end of JSON input" from every address the dashboard is
 * served on, while the hub's own port answered it.
 *
 * On a scratch fleet's hub, an OAuth MCP server of the probe's own (an MCP
 * endpoint that answers 401 naming its protected-resource metadata, that
 * metadata, its authorization server's metadata and Dynamic Client
 * Registration), saved to the fleet. serve.js on the published build under
 * systemd's socket activation, as the dashboard's socket serves it, and in
 * front of it the hub's own tailnet relay (hub tailnet-https.ts
 * `dashboardRelay`: TLS, HTTP/2 by ALPN), as the dashboard is served on the
 * hub's tailnet name.
 *
 * 1. Over HTTP/2 through the relay, a POST to the server's sign-in with no
 *    body and no Content-Type answers 200 with the provider's authorization
 *    address.
 * 2. The same POST over HTTP/1.1 to serve.js's own listener answers the same.
 * 3. Configure › Phone's Send test (`POST /api/push/test`, its body optional
 *    too) through the relay answers the hub's own refusal for a fleet with
 *    no phone (409), never a parse problem.
 * 4. A parse problem the hub writes (the body it answered these POSTs with
 *    before) reads in Configure as the hub's refusal in the error formula,
 *    never the parser's exception: "Couldn't start sign-in to ProbeOAuth.
 *    The hub couldn't read the request this page sent (400)."
 *
 *   bun scripts/probe-kit/run.ts bodiless-post
 */

import { mkdir } from "node:fs/promises";
import { connect } from "node:http2";
import { join } from "node:path";
import {
  couldNot,
  refusedOf,
} from "../../../apps/dashboard/src/lib/platform/hub-read";
import { dataOf, hubPath } from "../../../packages/agent/src/hub-client";
import { refusalWords } from "../../../packages/core/src/hub-refusal";
import { dashboardRelay } from "../../../packages/hub/src/tailnet-https";
import { scratchCertificate } from "../cloudflare-front";
import { hubAt } from "../hub";
import { oauthProvider } from "../oauth-provider";
import { freePort, publishBuild, serveUnder } from "../socket-served";
import type { Kit, Spec } from "../spec";

/** The fleet's OAuth MCP server, as the person named it. */
const SERVER = "ProbeOAuth";
const SIGN_IN = hubPath.api.fleet.mcp({ name: SERVER })["sign-in"]["~path"];

/** What a request answered: its status, its type, its body, and the protocol it went over. */
interface Answer {
  body: string;
  protocol: string;
  status: number;
  type: string;
}

/** A POST of `path` with no body and no headers of its own, over HTTP/2 (ALPN h2) to `origin`. */
const postOverH2 = (origin: string, path: string): Promise<Answer> =>
  new Promise((resolve, reject) => {
    const session = connect(origin, { rejectUnauthorized: false });
    session.on("error", reject);
    const request = session.request({ ":method": "POST", ":path": path });
    let status = 0;
    let type = "";
    let body = "";
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
      type = String(headers["content-type"] ?? "");
    });
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      const protocol = session.alpnProtocol ?? "none";
      session.close();
      resolve({ status, type, body, protocol });
    });
    request.on("error", reject);
    request.end();
  });

/** The same POST over HTTP/1.1. */
const postOverH1 = async (origin: string, path: string): Promise<Answer> => {
  const response = await fetch(`${origin}${path}`, { method: "POST" });
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    body: response.ok
      ? await response.text()
      : refusalWords(await response.text(), response.status),
    protocol: "http/1.1",
  };
};

/** One answer, as a line of a check's evidence. */
const said = ({ status, type, body, protocol }: Answer): string =>
  `${protocol} ${status} ${type} ${body.slice(0, 300)}`;

/** Whether `answer` is the sign-in's start: 200, and the provider's authorize address. */
const signInStarted = (answer: Answer, provider: string): boolean => {
  if (answer.status !== 200) {
    return false;
  }
  const { authorizationUrl } = JSON.parse(answer.body) as {
    authorizationUrl?: string;
  };
  return authorizationUrl?.startsWith(`${provider}/authorize?`) === true;
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const provider = oauthProvider();
  let served: ReturnType<typeof Bun.spawn> | undefined;
  let relay: ReturnType<ReturnType<typeof dashboardRelay>> | undefined;
  try {
    fleet.launch("hub");
    await fleet.hubUp();
    const providerOrigin = `http://127.0.0.1:${provider.port}`;
    const saved = await hubAt(fleet.base)
      .api.fleet.mcp({ name: SERVER })
      .put({
        config: { type: "http", url: `${providerOrigin}/mcp` },
        enabled: true,
      });
    const row = dataOf(saved);
    kit.check(
      "0: the probe's server is saved to the fleet as an OAuth server",
      saved.error === null && row.auth?.mode === "oauth",
      `${saved.status} ${JSON.stringify(row)}`
    );

    await publishBuild();
    const port = await freePort();
    served = serveUnder(
      fleet,
      [{ address: `127.0.0.1:${port}`, name: "dashboard" }],
      join(kit.out, "serve.log")
    );
    const plain = `http://127.0.0.1:${port}`;
    const certs = join(kit.out, "certs");
    await mkdir(certs, { recursive: true });
    relay = dashboardRelay(port)({
      hostname: "127.0.0.1",
      port: 0,
      tls: await scratchCertificate(certs, ["localhost"]),
    });
    const secure = `https://127.0.0.1:${relay.port}`;
    // serve.js answers once its socket hands it the first connection.
    const deadline = Date.now() + 60_000;
    while (
      !(await fetch(plain).then(
        (r) => r.ok,
        () => false
      ))
    ) {
      if (Date.now() > deadline) {
        throw new Error(`serve.js did not answer at ${plain} within 60 s`);
      }
      await Bun.sleep(250);
    }

    const overRelay = await postOverH2(secure, SIGN_IN);
    kit.check(
      "1: through the hub's TLS relay over HTTP/2, a sign-in POST with no body and no type answers 200 with the provider's authorize address",
      overRelay.protocol === "h2" && signInStarted(overRelay, providerOrigin),
      said(overRelay)
    );

    const overServe = await postOverH1(plain, SIGN_IN);
    kit.check(
      "2: to serve.js's own listener over HTTP/1.1, the same POST answers the same",
      signInStarted(overServe, providerOrigin),
      said(overServe)
    );

    const test = await postOverH2(secure, hubPath.api.push.test["~path"]);
    kit.check(
      "3: Send test with no body through the relay answers the hub's own refusal for a fleet with no phone (409), not a parse problem",
      test.status === 409 && !test.type.includes("problem+json"),
      said(test)
    );

    const parseProblem = new Response(
      JSON.stringify({
        type: "parse",
        code: "parse",
        status: 400,
        detail: "Unexpected end of JSON input",
        title: "Bad Request",
      }),
      { status: 400, headers: { "content-type": "application/problem+json" } }
    );
    const shown = couldNot(
      `start sign-in to ${SERVER}`,
      await refusedOf(parseProblem)
    ).message;
    kit.check(
      "4: a parse problem from the hub reads in Configure as the hub's refusal with its status, never the parser's words",
      shown ===
        `Couldn't start sign-in to ${SERVER}. The hub couldn't read the request this page sent (400).`,
      shown
    );
  } finally {
    relay?.stop(true);
    provider.stop(true);
    served?.kill();
    await served?.exited;
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "bodiless-post",
  run,
};
export default spec;
