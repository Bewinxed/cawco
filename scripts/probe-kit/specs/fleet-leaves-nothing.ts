/**
 * A scratch fleet leaves no process behind, whatever its sessions start.
 *
 * A session started in a checkout of this repository loads the checkout's
 * `.mcp.json`: its playwriter server (`npx playwriter@latest`,
 * PLAYWRITER_AUTO_ENABLE=1) starts a `playwriter-ws-server` in a session of
 * its own (`setsid`: its own process group). Once the server above it ends
 * it is re-parented to the nearest subreaper, so neither a tree nor a group
 * the fleet's services lead holds it, and one outlived its fleet with the
 * fleet's HOME in its environment; the kit's browser-leftovers check tracks
 * only the kit's own Chromium. The fleet's teardown ends every process whose
 * environment names one of its folders (scratch-fleet.ts `endCarriers`).
 *
 * 1. One Claude session is started in this checkout and given a turn; the
 *    checkout's playwriter server and its ws-server run under the fleet (the
 *    leak's ground). The session is stopped, as a person stops it; what of
 *    playwriter is still under the fleet then is noted: whether the
 *    ws-server outlives its server is a race of its own.
 * 2. So the escape is made sure of too: a process started in the fleet's
 *    environment through `setsid` in a shell that exits at once, as the
 *    ws-server leaves, in no tree or group of the fleet's.
 * 3. The fleet is torn down: no process carries its HOME or sandbox in its
 *    environment.
 *
 *   bun scripts/probe-kit/run.ts fleet-leaves-nothing
 */
import { carrying, until } from "../../scratch-fleet";
import { ROOT, type Spec } from "../kit";

const spec: Spec = {
  name: "fleet-leaves-nothing",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["done"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const folders = [fleet.home, fleet.sandbox];
    const said = (list: { command: string; pid: number }[]) =>
      list.map((one) => `${one.pid} ${one.command}`).join("; ") || "none";

    // 1. The checkout's playwriter, under the fleet.
    const id = await fleet.spawn("claude", "In the checkout", ROOT);
    await fleet.send(id, `Checkout turn ${crypto.randomUUID()}`);
    const playwriter = async () =>
      (await carrying(folders)).filter((one) =>
        one.command.includes("playwriter")
      );
    const ran = await until(
      "the checkout's playwriter ws-server, under the fleet",
      playwriter,
      (list) => list.some((one) => one.command.includes("ws-server")),
      180_000
    ).catch(playwriter);
    check(
      "the checkout's playwriter server and its ws-server ran under the fleet",
      ran.some((one) => one.command.includes("ws-server")),
      said(ran)
    );
    await fleet.stopSession(id);
    const outlived = await until(
      "the session's playwriter server gone with it",
      playwriter,
      (list) => !list.some((one) => one.command.includes("npm exec")),
      60_000
    ).catch(playwriter);
    kit.note(`after the session's stop, under the fleet: ${said(outlived)}`);

    // 2. An escape for sure: setsid, its shell gone at once.
    await Bun.spawn(
      ["sh", "-c", "setsid sleep 600 </dev/null >/dev/null 2>&1 &"],
      { env: fleet.env, cwd: fleet.workdir }
    ).exited;
    const escaped = await until(
      "the escaped process, under the fleet",
      async () =>
        (await carrying(folders)).filter((one) =>
          one.command.startsWith("sleep 600")
        ),
      (list) => list.length > 0,
      10_000
    ).catch(() => []);
    check(
      "a process started through setsid in the fleet's environment runs outside its trees",
      escaped.length > 0,
      said(escaped)
    );

    // 3. Down: nothing left.
    await fleet.close();
    const left = await carrying(folders);
    check(
      "once the fleet is down, no process carries its HOME or sandbox in its environment",
      left.length === 0,
      said(left)
    );
  },
};

export default spec;
