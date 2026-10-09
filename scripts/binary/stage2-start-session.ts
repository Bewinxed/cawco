/**
 * Asks a hub to start a session the way the dashboard does: a `spawn` frame on
 * its dashboard socket. Run inside a container by the installed binary acting
 * as bun (BUN_BE_BUN=1), so the container needs no runtime of its own.
 *   cawco stage2-start-session.ts <hub http url> <machineId> <instanceId>
 * Exits 1 and prints the hub's words when it refuses the start: the frame it
 * answers a refused spawn with (`refusalFrame`, `payload.kind` "error" for
 * this instance), or an answer that says `"ok":false` or "failure".
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
      return;
    }
  } catch {
    // Not a frame: read as text below.
  }
  if (text.includes('"ok":false') || text.includes("failure")) {
    refused.push(text.slice(0, 300));
  }
};
await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve();
  socket.onerror = () =>
    reject(new Error("the hub's dashboard socket did not open"));
});
socket.send(
  JSON.stringify({
    verb: "spawn",
    machineId,
    instanceId,
    payload: { instanceId, cwd: "/tmp", harness: "claude", model: "stub" },
  })
);
await Bun.sleep(1500);
socket.close();
if (refused.length > 0) {
  console.error(`the hub refused the start: ${refused.join(" | ")}`);
  process.exit(1);
}
console.log(`asked ${hub} to start ${instanceId} on ${machineId}`);

export {};
