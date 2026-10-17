/**
 * Where a message sent from this browser waits out a reload until the hub
 * takes it: IndexedDB (idb.ts `sends`), one record per send, under the
 * send's own id, holding what the send carries. A tab reloaded while a send
 * waits for the hub (its socket dropped, or its ack never came) sends it
 * again under that id as it starts (client.svelte.ts `resumeKeptSends`),
 * and the hub, which takes a repeat of an id as the same send, posts it
 * once. A record goes as its send settles: the hub took it, or refused it.
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
  /** The failed send it retries, when it does. */
  replaces?: string;
  text: string;
}

/** Keeps a send until it settles; the same id again is the same record. */
export async function keepSend(send: KeptSend): Promise<void> {
  const db = await database();
  const transaction = db.transaction(SENDS, "readwrite");
  // Plain data, whatever the caller held it in (a `$state` proxy does not clone).
  transaction
    .objectStore(SENDS)
    .put(JSON.parse(JSON.stringify(send)) as KeptSend);
  return done(transaction);
}

/** The send settled: it is no longer this browser's to send. */
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
