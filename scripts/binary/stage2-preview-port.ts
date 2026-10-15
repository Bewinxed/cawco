/**
 * Prints the hub's preview port for one session's open preview, as a
 * dashboard learns it: the `previews` of the `instances` frame its dashboard
 * socket sends (server.ts `boardExtras`, preview.ts `previewFrame`). Run inside
 * a container by the installed binary acting as bun (BUN_BE_BUN=1), so the
 * container needs no runtime of its own.
 *   cawco stage2-preview-port.ts <hub http url> <instanceId>
 * Exits 1, saying what it saw, when no open preview of that session with a
 * port comes within 15 s.
 */
const [, , hub, instanceId] = Bun.argv;
const WAIT_MS = 15_000;

interface PreviewFrame {
  instanceId?: string;
  port?: number;
  state?: string;
}

const socket = new WebSocket(`${hub.replace("http", "ws")}/ws/dashboard`);
const seen: string[] = [];
const port = await new Promise<number | undefined>((resolve) => {
  const timer = setTimeout(() => resolve(undefined), WAIT_MS);
  socket.onmessage = (event) => {
    let frame: { payload?: { kind?: string; previews?: PreviewFrame[] } };
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (frame.payload?.kind !== "instances") {
      return;
    }
    const previews = frame.payload.previews ?? [];
    seen.push(JSON.stringify(previews).slice(0, 400));
    const mine = previews.find(
      (one) =>
        one.instanceId === instanceId &&
        one.state === "open" &&
        typeof one.port === "number"
    );
    if (mine?.port) {
      clearTimeout(timer);
      resolve(mine.port);
    }
  };
  socket.onerror = () => {
    clearTimeout(timer);
    resolve(undefined);
  };
});
socket.close();
if (port === undefined) {
  console.error(
    `no open preview of ${instanceId} with a port in ${WAIT_MS / 1000}s; previews seen: ${seen.join(" | ") || "none"}`
  );
  process.exit(1);
}
console.log(port);

export {};
