/**
 * Where a message sent from this browser waits out a reload until the hub
 * takes it: IndexedDB (idb.ts `sends`), one record per send, under the
 * send's own id, holding what the send carries. A tab reloaded while a send
 * waits for the hub (its socket dropped, or its ack never came) sends it
 * again under that id as it starts (client.svelte.ts `resumeKeptSends`),
 * and the hub, which takes a repeat of an id as the same send, posts it
 * once. A record goes once the hub takes its send; one the hub refused is
 * kept with its words for Try again or Edit, for as long as those stand.
 */
import type { SendExtras } from "./client.svelte";
import { database, done, result, SENDS } from "./idb";

/** One send as it is kept: enough to send it again exactly as it went. */
export interface KeptSend {
  /** When it was first sent: kept sends go again oldest first. */
  at: number;
  commandId: string;
  extras: SendExtras;
  instanceId: string;
  machineId: string;
  /**
   * The hub refused it, in these words, at this time: drawn again after a
   * reload as refused, with Try again and Edit, and never sent by itself.
   */
  refused?: { at: number; reason: string };
  /** The failed send it retries, when it does. */
  replaces?: string;
  text: string;
}

/**
 * Keeps a send until it settles; the same id again is the same record, in
 * the place it was first sent (a send going again keeps its `at`).
 */
export async function keepSend(send: KeptSend): Promise<void> {
  const db = await database();
  const transaction = db.transaction(SENDS, "readwrite");
  const store = transaction.objectStore(SENDS);
  // Plain data, whatever the caller held it in (a `$state` proxy does not clone).
  const plain = JSON.parse(JSON.stringify(send)) as KeptSend;
  const before = store.get(send.commandId);
  before.onsuccess = () => {
    const first = before.result as KeptSend | undefined;
    store.put(first ? { ...plain, at: first.at } : plain);
  };
  return done(transaction);
}

/** The hub refused the send: it is kept, with the hub's words, for Try again or Edit. */
export async function refuseSend(
  commandId: string,
  reason: string
): Promise<void> {
  const db = await database();
  const transaction = db.transaction(SENDS, "readwrite");
  const store = transaction.objectStore(SENDS);
  const kept = store.get(commandId);
  kept.onsuccess = () => {
    const send = kept.result as KeptSend | undefined;
    if (send) {
      store.put({ ...send, refused: { at: Date.now(), reason } });
    }
  };
  return done(transaction);
}

/** The send was taken, or let go: it is no longer this browser's to send. */
export async function forgetSend(commandId: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction(SENDS, "readwrite");
  transaction.objectStore(SENDS).delete(commandId);
  return done(transaction);
}

/** Every kept send, oldest first. */
export async function keptSends(): Promise<KeptSend[]> {
  const db = await database();
  const all = await result<KeptSend[]>(
    db.transaction(SENDS).objectStore(SENDS).getAll()
  );
  return all.sort((a, b) => a.at - b.at);
}
