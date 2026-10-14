import { newId } from "./id";

/**
 * One id per browser tab: minted once, kept only in memory (never in
 * `localStorage`, which a duplicated tab would inherit and so blur two
 * senders into one), and attached to every command as the fleet store's
 * `submitCommand` provenance, and to a pane's word that it shows an
 * artifact. Without this an incident like "a send landed on the wrong
 * session" is unprovable — every socket writes with the same voice. Its own
 * module, so an artifact's tab names itself without the fleet store.
 */
let tabClientId: string | undefined;
export function currentClientId(): string {
  tabClientId ??= newId();
  return tabClientId;
}
