/**
 * Asks a hub to start a session the way the dashboard does: a `spawn` frame on
 * its dashboard socket. Run inside a container by the installed binary acting
 * as bun (BUN_BE_BUN=1), so the container needs no runtime of its own.
 *   cawco stage2-start-session.ts <hub http url> <machineId> <instanceId>
 */
const [, , hub, machineId, instanceId] = Bun.argv;
const socket = new WebSocket(`${hub.replace("http", "ws")}/ws/dashboard`);
const refused: string[] = [];
socket.onmessage = (event) => {
  const text = String(event.data);
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
