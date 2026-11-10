/**
 * The agent's calls to its hub arrive as who they are, through core's
 * request door (hub-request.ts), on a hub that requires paired devices.
 *
 * The nightly from 886030601 failed stage 2: the agent's update loop, moved
 * onto the door, sent its settings read through the door's default sender,
 * the platform's `fetch`, where it had sent through `provenFetch`, so the
 * machine's proof was dropped and the hub refused it as anonymous ("refused
 * anonymous GET /api/binary-updates/settings"), and every added machine's
 * Install now failed on "The hub's update settings answered 401". The door
 * now takes its sender at every call, and house/no-fetch-alias keeps
 * `fetch` from meaning a credentialed sender.
 *
 * On an in-process hub served on a port, pairing required, this machine's
 * key admitted and written where the agent reads it, and the agent's own
 * loopback gateway (mcp-oauth.ts) relaying to it:
 * 1. the update loop's settings read (binary-update.ts `readUpdateSettings`)
 *    answers the policy, carrying the machine's proof;
 * 2. the tool listing (delegation.ts `delegationTools`), through the
 *    gateway's relay, arrives with the machine's proof;
 * 3. a tool call (delegation.ts `callDelegationTool`), through the relay,
 *    arrives with the machine's proof and the session's bearer;
 * and the hub's record of refusals (hub-record.ts, what stage 2 reads) holds
 * none of them.
 *
 *   bun scripts/probe-kit/run.ts door-callers
 */
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hubPath } from "../../../packages/agent/src/hub-client";
import type { Kit, Spec } from "../spec";

const MACHINE = "probe-door-machine";
const CREDENTIAL = "probe-door-session-credential-0123456789abcdefghij";
/** Longer than the hub's record takes to reach its file (hub-record.ts `WRITE_AFTER_MS`, 100 ms). */
const RECORD_WRITTEN_MS = 500;

/** A port nothing listens on now, for the gateway. */
const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? done(address.port)
          : fail(new Error("no port"))
      );
    });
  });

/** One request as the hub was handed it: its route and the credentials it carried. */
interface Arrived {
  bearer: boolean;
  method: string;
  path: string;
  proof: boolean;
  status: number;
}

const spec: Spec = {
  group: "The hub and machines",
  name: "door-callers",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, and the agent's gateway its port and machine id, as their modules load",
  run: async (kit: Kit) => {
    const { check } = kit;
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "door-callers-")
    );
    process.env.CAWCO_MACHINE_ID = MACHINE;
    process.env.CAWCO_MCP_PORT = String(await freePort());
    let served: ReturnType<typeof Bun.serve> | undefined;
    try {
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const { db, hub } = await hubInProcess(
        join(scratch, "hub", "hub.db"),
        join(scratch, "home")
      );
      const { MACHINE_PROOF_HEADER } =
        await import("../../../packages/core/src/hub-auth");
      const { hubId } = await import("../../../packages/hub/src/hub-id");
      const { writeMachineKey } =
        await import("../../../packages/core/src/machine-key");
      const key = randomBytes(32).toString("base64url");
      db.hubAuth.putMachineKey(MACHINE, key);
      db.hubAuth.setPairingRequired(true);
      await writeMachineKey(key);

      const arrived: Arrived[] = [];
      served = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
          const response = await hub.handle(request);
          arrived.push({
            method: request.method,
            path: new URL(request.url).pathname,
            proof: request.headers.has(MACHINE_PROOF_HEADER),
            bearer: (request.headers.get("authorization") ?? "").startsWith(
              "Bearer "
            ),
            status: response.status,
          });
          return response;
        },
      });
      const base = `http://127.0.0.1:${served.port}`;

      // The agent: the hub it proves to, and its loopback gateway.
      const { setConnectedHub } =
        await import("../../../packages/agent/src/hub-proof");
      setConnectedHub(hubId());
      const { startMcpGateway } =
        await import("../../../packages/agent/src/mcp-oauth");
      const { freshen } =
        await import("../../../packages/agent/src/provider-accounts");
      await startMcpGateway(() => base, {
        freshen: (accountId) =>
          freshen(accountId, { borrowAsk: () => undefined }),
        browsers: { browsers: () => undefined, machineId: "probe-machine" },
        supervisorHolds: () => undefined,
      });
      const { readUpdateSettings } =
        await import("../../../packages/agent/src/binary-update");
      const { callDelegationTool, delegationTools, TOOL_DOOR } =
        await import("../../../packages/agent/src/delegation");

      const said = (error: unknown) =>
        error instanceof Error ? error.message : String(error);
      const of = (path: string) => arrived.find((one) => one.path === path);

      // 1. The update loop's settings read.
      const settings = await readUpdateSettings(base).catch(said);
      const read = of(hubPath.api["binary-updates"].settings["~path"]);
      check(
        "1. the update loop's settings read arrives as this machine and is answered the policy",
        typeof settings === "object" &&
          "policy" in settings &&
          read?.proof === true &&
          read.status === 200,
        JSON.stringify({ settings, read })
      );

      // 2. The tool listing, through the gateway's relay.
      const tools = await delegationTools().then(
        (listed) => `${JSON.stringify(listed).length} bytes`,
        said
      );
      const listing = of(hubPath.api.delegation.tools["~path"]);
      check(
        "2. the tool listing, through the agent's gateway, arrives with the machine's proof",
        listing?.proof === true && listing.status !== 401,
        JSON.stringify({ tools, listing })
      );

      // 3. A tool call, through the relay, as the session.
      const called = await callDelegationTool(
        "probe-door-session",
        "delegate_list",
        {},
        CREDENTIAL
      ).then(() => "answered", said);
      // The agent's own door path (delegation.ts `TOOL_DOOR`), the session's id after it.
      const call = arrived.find(
        (one) => one.path === `${TOOL_DOOR}probe-door-session`
      );
      check(
        "3. a tool call, through the agent's gateway, arrives with the machine's proof and the session's bearer",
        call?.proof === true && call.bearer,
        JSON.stringify({ called, call })
      );

      // What stage 2 reads: the gate's refusals, kept beside the hub's
      // database (hub-record.ts), written a moment after each.
      await Bun.sleep(RECORD_WRITTEN_MS);
      const record = (await Bun.file(join(scratch, "hub", "hub-record.json"))
        .json()
        .catch(() => [])) as { caller?: string; kind: string; path?: string }[];
      const refused = record.filter((one) => one.kind === "request-refused");
      check(
        "the hub's gate refused none of them, as anonymous or as anyone (its record of refusals holds none)",
        refused.length === 0,
        JSON.stringify({ refused, arrived })
      );
    } finally {
      served?.stop(true);
      await rm(scratch, { recursive: true, force: true });
    }
  },
};

export default spec;
