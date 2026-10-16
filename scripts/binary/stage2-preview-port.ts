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
import { Gone, readWithin } from "../../packages/core/src/bounded";

const [, , hub, instanceId] = Bun.argv;
const WAIT_MS = 15_000;

interface PreviewFrame {
  instanceId?: string;
  port?: number;
  state?: string;
}

const socket = new WebSocket(`${hub.replace("http", "ws")}/ws/dashboard`);
const seen: string[] = [];
const port = await readWithin(
  WAIT_MS,
  () =>
    new Promise<number>((resolve, reject) => {
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
          resolve(mine.port);
        }
      };
      socket.onerror = () => {
        reject(new Gone("the hub's dashboard socket failed"));
      };
    })
);
socket.close();
switch (port.kind) {
  case "answered":
    console.log(port.value);
    break;
  case "unanswered":
    console.error(
      `no open preview of ${instanceId} with a port: the hub did not answer within ${port.after} ms (${port.reason}); previews seen: ${seen.join(" | ") || "none"}`
    );
    process.exit(1);
    break;
  default: {
    const unhandled: never = port;
    throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
  }
}
