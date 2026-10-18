/**
 * An artifact's doc from a probe, as a page's own client writes it: the
 * y-websocket sync protocol (y-protocols/sync) on the session's preview
 * listener at `/__cawco/artifact/<id>` (the hub's artifacts/sync.ts). The hub
 * keeps what a person's client may write (core `pinsProblem`), so pins
 * seeded here stand as a person's would.
 *
 *   await seedPins(fleet.base, session, artifact, 12);
 */
import { createDecoder, readVarUint } from "lib0/decoding";
import {
  createEncoder,
  length,
  toUint8Array,
  writeVarUint,
} from "lib0/encoding";
import { readSyncMessage, writeSyncStep1, writeUpdate } from "y-protocols/sync";
import { Doc } from "yjs";

/** y-websocket's sync message type. */
const MESSAGE_SYNC = 0;

/** The session's preview listener, where the artifact's doc syncs. */
async function previewPort(hub: string, session: string): Promise<number> {
  const response = await fetch(
    `${hub}/api/instances/${session}/preview-address`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error(
      `preview-address ${response.status}: ${await response.text()}`
    );
  }
  return ((await response.json()) as { port: number }).port;
}

/**
 * Writes `count` open comment pins on the page's first heading into the
 * artifact's doc, numbered after any it holds, and leaves once the hub has
 * them. Answers how many pins the doc holds.
 */
export async function seedPins(
  hub: string,
  session: string,
  artifact: string,
  count: number
): Promise<number> {
  const port = await previewPort(hub, session);
  const doc = new Doc();
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/__cawco/artifact/${artifact}`
  );
  socket.binaryType = "arraybuffer";
  const send = (write: (encoder: ReturnType<typeof createEncoder>) => void) => {
    const encoder = createEncoder();
    writeVarUint(encoder, MESSAGE_SYNC);
    write(encoder);
    socket.send(toUint8Array(encoder));
  };
  const synced = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () =>
      send((encoder) => writeSyncStep1(encoder, doc))
    );
    socket.addEventListener("message", (event) => {
      const decoder = createDecoder(new Uint8Array(event.data as ArrayBuffer));
      if (readVarUint(decoder) !== MESSAGE_SYNC) {
        return;
      }
      const encoder = createEncoder();
      writeVarUint(encoder, MESSAGE_SYNC);
      // Step 2 (the hub's doc) applies it; step 1 answers with ours.
      const kind = readSyncMessage(decoder, encoder, doc, "hub");
      if (length(encoder) > 1) {
        socket.send(toUint8Array(encoder));
      }
      if (kind === 1) {
        resolve();
      }
    });
    socket.addEventListener("close", (event) =>
      reject(
        new Error(`the doc's socket closed: ${event.code} ${event.reason}`)
      )
    );
    socket.addEventListener("error", () =>
      reject(new Error("the doc's socket failed"))
    );
  });
  await synced;
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "hub") {
      send((encoder) => writeUpdate(encoder, update));
    }
  });
  const pins = doc.getMap("pins");
  const first = pins.size + 1;
  const at = new Date().toISOString();
  doc.transact(() => {
    for (let number = first; number < first + count; number += 1) {
      const id = crypto.randomUUID();
      pins.set(id, {
        id,
        number,
        kind: "comment",
        anchor: { selector: "h1", source: null, text: "Which plan?" },
        at,
        by: "person",
        elements: [],
        point: { x: 0.5, y: 0.5 },
        thread: [
          {
            id: crypto.randomUUID(),
            by: "person",
            at,
            text: `Seeded pin ${number}`,
          },
        ],
      });
    }
  });
  // The hub closes a refused update's socket at once; one that stays open has it.
  await Bun.sleep(1500);
  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error("the hub refused the pins");
  }
  socket.close();
  return pins.size;
}
