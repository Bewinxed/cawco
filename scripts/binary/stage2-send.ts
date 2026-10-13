/**
 * Sends a session a message the way the dashboard does: a `send` command on
 * the hub's dashboard socket (the Ledger Protocol's `CommandEnvelope`, core
 * stream.ts), whose id is the message's. Run inside a container by the
 * installed binary acting as bun (BUN_BE_BUN=1), as stage2-start-session.ts
 * is.
 *   cawco stage2-send.ts <hub http url> <machineId> <instanceId> <text>
 * Exits 0 once the hub accepts it, 1 with the hub's words when it fails it or
 * says nothing within 15 s.
 */
const [, , hub, machineId, instanceId, text] = Bun.argv;
const commandId = crypto.randomUUID();
const socket = new WebSocket(`${hub.replace("http", "ws")}/ws/dashboard`);
const settled = Promise.withResolvers<string | undefined>();
socket.onmessage = (event) => {
  try {
    const ack = JSON.parse(String(event.data)) as {
      type?: string;
      commandId?: string;
      stage?: string;
      reason?: string;
    };
    if (ack.type !== "command.ack" || ack.commandId !== commandId) {
      return;
    }
    if (ack.stage === "failed") {
      settled.resolve(ack.reason ?? "failed, with no reason given");
    } else {
      settled.resolve(undefined);
    }
  } catch {
    // Not a frame.
  }
};
await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve();
  socket.onerror = () =>
    reject(new Error("the hub's dashboard socket did not open"));
});
socket.send(
  JSON.stringify({
    type: "command",
    commandId,
    sessionId: instanceId,
    machineId,
    kind: "send",
    payload: {
      instanceId,
      message: {
        type: "user",
        uuid: commandId,
        origin: { kind: "human" },
        message: { role: "user", content: text },
      },
    },
  })
);
const timer = setTimeout(
  () => settled.resolve("no answer from the hub within 15 s"),
  15_000
);
const refused = await settled.promise;
clearTimeout(timer);
socket.close();
if (refused) {
  console.error(`the hub did not take the send: ${refused}`);
  process.exit(1);
}
console.log(`sent ${instanceId} on ${machineId}: ${text}`);

export {};
