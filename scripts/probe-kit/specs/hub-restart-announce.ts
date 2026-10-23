/**
 * The hub's word that it is restarting for an update (hub hub-restart.ts),
 * read on the dashboard socket of a scratch hub. A fake machine registers as
 * the hub's own (`hostsHub`) and reports the update's trial, `installing`:
 *
 * 1. With `availableVersion` the build this hub runs (its `/health` version),
 *    that is the restart it has already come through: a connected dashboard
 *    hears no `hub.restart` frame with a restart in it, and one connecting
 *    after is owed none.
 * 2. With another build named, the hub announces: the connected dashboard
 *    hears the restart naming that build, within the update's trial.
 *
 *   bun scripts/probe-kit/run.ts hub-restart-announce
 */
import { until } from "../../scratch-fleet";
import type { Spec } from "../kit";

interface Frame {
  machineId?: string;
  payload?: {
    kind?: string;
    restart?: {
      reason: string;
      version: string | null;
      withinMs: number;
    } | null;
  };
  verb?: string;
}

/** How long a frame that is not coming is waited for. */
const QUIET_MS = 3000;

const dashboard = async (base: string) => {
  const restarts: NonNullable<Frame["payload"]>["restart"][] = [];
  const socket = new WebSocket(`${base.replace("http", "ws")}/ws/dashboard`);
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data)) as Frame;
    if (frame.payload?.kind === "hub.restart") {
      restarts.push(frame.payload.restart ?? null);
    }
  });
  await new Promise<void>((done, fail) => {
    socket.addEventListener("open", () => done(), { once: true });
    socket.addEventListener(
      "error",
      () => fail(new Error("the dashboard socket did not open")),
      { once: true }
    );
  });
  return { restarts, close: () => socket.close() };
};

/** A machine that says it hosts the hub and is installing `availableVersion`. */
const hubMachine = async (
  base: string,
  machineId: string,
  availableVersion: string
) => {
  const socket = new WebSocket(`${base.replace("http", "ws")}/ws`);
  await new Promise<void>((done, fail) => {
    socket.addEventListener("open", () => done(), { once: true });
    socket.addEventListener(
      "error",
      () => fail(new Error("the machine socket did not open")),
      { once: true }
    );
  });
  socket.send(
    JSON.stringify({
      verb: "register",
      machineId,
      payload: {
        machineId,
        hostname: machineId,
        os: "linux",
        home: "/tmp",
        auth: { state: "signed-out" },
        binaryUpdate: {
          availableVersion,
          channel: "nightly",
          hostsHub: true,
          installedVersion: "0.0.1-probe",
          phase: "installing",
          updatedAt: Date.now(),
        },
      },
    })
  );
  return socket;
};

const spec: Spec = {
  name: "hub-restart-announce",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    const { version } = await fleet.api<{ version: string }>("/health");
    const other = `${version}-other-build`;

    // 1. The build it runs.
    const heard = await dashboard(fleet.base);
    const own = await hubMachine(fleet.base, "probe-hub-own", version);
    await Bun.sleep(QUIET_MS);
    const late = await dashboard(fleet.base);
    await Bun.sleep(1000);
    check(
      "1. a hub whose machine is installing the build the hub runs announces no restart, to a connected dashboard or one connecting after",
      heard.restarts.every((restart) => restart === null) &&
        late.restarts.every((restart) => restart === null),
      `running ${version}; connected heard ${JSON.stringify(heard.restarts)}; late heard ${JSON.stringify(late.restarts)}`
    );
    late.close();
    own.close();

    // 2. Another build.
    const announced = await hubMachine(fleet.base, "probe-hub-next", other);
    const said = await until(
      "the announcement",
      () => heard.restarts.find((restart) => restart !== null),
      (restart) => restart !== undefined,
      10_000
    ).catch(() => undefined);
    check(
      "2. a machine installing a different build than the hub runs: the connected dashboard hears the restart naming it",
      said?.reason === "update" && said.version === other,
      `named ${other}; ${JSON.stringify(said)}; heard ${JSON.stringify(heard.restarts)}`
    );
    announced.close();
    heard.close();
  },
};

export default spec;
