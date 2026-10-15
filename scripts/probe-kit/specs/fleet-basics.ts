/**
 * What a machine's first minutes on a hub show, read per commit on a scratch
 * fleet (real hub, agent and sessiond from this checkout; no binary install is
 * needed for either, so neither waits for the release's container proof).
 *
 * (a) Until a CawCo account is signed in on a machine, a Claude session start
 *     there is refused in the hub's sentence (hub placement.ts
 *     `noAccountRefusal`): "No Claude account is signed in on <machine>. Add
 *     one in Configure → Accounts and sign it in there. Nothing was started."
 *     The hub keeps no row
 *     for it and the machine's keeper holds nothing under it.
 * (b) The capability report (core capabilities.ts, reported as the agent
 *     registers) lists each tool by id with whether it is there: git, found on
 *     this host, with the version `git --version` says, and the service
 *     manager with a yes or a no.
 *
 *   bun scripts/probe-kit/run.ts fleet-basics
 */
import { MACHINE } from "../../scratch-fleet";
import type { Spec } from "../kit";

const REFUSAL =
  /^No Claude account is signed in on (.+)\. Add one in Configure → Accounts and sign it in there\. Nothing was started\.$/;

interface AgentRow {
  hostname: string;
  machineCapabilities?: {
    items: { available: boolean; id: string; version?: string }[];
  };
  machineId: string;
}

const spec: Spec = {
  name: "fleet-basics",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const row = (await fleet.api<AgentRow[]>("/api/agents")).find(
      (agent) => agent.machineId === MACHINE
    );

    // (a) A start with no account filed or signed in: the hub's answer on the
    // dashboard socket is an error frame for that instance.
    const instanceId = crypto.randomUUID();
    const socket = new WebSocket(
      `${fleet.base.replace("http", "ws")}/ws/dashboard`
    );
    const refused = new Promise<string>((done) => {
      socket.onmessage = (event) => {
        const frame = JSON.parse(String(event.data)) as {
          instanceId?: string;
          payload?: { kind?: string; message?: string };
        };
        if (
          frame.instanceId === instanceId &&
          frame.payload?.kind === "error"
        ) {
          done(frame.payload.message ?? "");
        }
      };
    });
    await new Promise<void>((done, fail) => {
      socket.onopen = () => done();
      socket.onerror = () =>
        fail(new Error("the dashboard socket did not open"));
    });
    socket.send(
      JSON.stringify({
        verb: "spawn",
        machineId: MACHINE,
        instanceId,
        payload: {
          instanceId,
          cwd: fleet.workdir,
          harness: "claude",
          model: "claude-haiku-4-5",
        },
      })
    );
    const said = await Promise.race([
      refused,
      Bun.sleep(30_000).then(() => ""),
    ]);
    socket.close();
    const named = REFUSAL.exec(said)?.[1];
    check(
      "(a) a Claude start on a machine with no CawCo account is refused in the hub's sentence, naming the machine",
      named !== undefined && row?.hostname.startsWith(named) === true,
      `said: ${said || "(nothing in 30 s)"}; the machine's hostname: ${row?.hostname}`
    );
    const held = (await fleet.heldProcs()).filter(({ procId }) =>
      procId.includes(instanceId)
    );
    check(
      "(a) the refused start has no row on the hub and nothing on the machine's keeper",
      fleet.instance(instanceId) === undefined && held.length === 0,
      `row: ${JSON.stringify(fleet.instance(instanceId))}; held: ${JSON.stringify(held)}`
    );

    // (b) The capability report, as the agent registered it.
    const items = row?.machineCapabilities?.items ?? [];
    const git = items.find((item) => item.id === "git");
    const hostGit = (await Bun.$`git --version`.quiet().nothrow()).stdout
      .toString()
      .trim();
    check(
      "(b) the capability report names git as found, with the version `git --version` says",
      git?.available === true &&
        typeof git.version === "string" &&
        git.version !== "" &&
        hostGit.includes(git.version),
      `git: ${JSON.stringify(git)}; host: ${hostGit}`
    );
    const manager = items.find((item) => item.id === "service-manager");
    check(
      "(b) the capability report says whether the machine has a service manager",
      typeof manager?.available === "boolean",
      JSON.stringify(items)
    );
  },
};

export default spec;
