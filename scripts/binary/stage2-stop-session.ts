/**
 * Asks a hub to stop a session the way the dashboard does: a `stop` frame on
 * its dashboard socket. Run inside a container by the installed binary acting
 * as bun (BUN_BE_BUN=1), so the container needs no runtime of its own.
 *   cawco stage2-stop-session.ts <hub http url> <machineId> <instanceId>
 * Exits 1 and prints the hub's words when it answers the stop with a failure.
 */
const [, , hub, machineId, instanceId] = Bun.argv;
const socket = new WebSocket(`${hub.replace("http", "ws")}/ws/dashboard`);
const refused: string[] = [];
socket.onmessage = (event) => {
  const text = String(event.data);
  try {
    const frame = JSON.parse(text) as {
      instanceId?: string;
      payload?: { kind?: string; message?: string };
    };
    if (frame.instanceId === instanceId && frame.payload?.kind === "error") {
      refused.push(frame.payload.message ?? text.slice(0, 300));
    }
  } catch {
    // Not a frame: nothing to read here.
  }
};
await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve();
  socket.onerror = () =>
    reject(new Error("the hub's dashboard socket did not open"));
});
socket.send(
  JSON.stringify({
    verb: "stop",
    machineId,
    instanceId,
    payload: { instanceId, harness: "claude" },
  })
);
await Bun.sleep(1500);
socket.close();
if (refused.length > 0) {
  console.error(`the hub refused the stop: ${refused.join(" | ")}`);
  process.exit(1);
}
console.log(`asked ${hub} to stop ${instanceId} on ${machineId}`);

export {};
