/**
 * This machine's side of a folder move's stream between two machines, at
 * the hub (`/api/folder-moves/relay/<token>`, hub folder-move-relay.ts):
 * the folder's machine puts the stream, the destination's takes it, each
 * read and written as it goes, through the hub's typed client's byte calls
 * (`putBytes`, `getBytes`) with this machine's proof.
 */

import { folderStepWords } from "@cawco/core/words/folder-move";
import {
  type HubRefusal,
  hubClient,
  refusalText,
  unwrap,
} from "@cawco/hub/client";
import { TreeRefused } from "./folder-tree";
import { hubOrigin } from "./git/hub-remote";
import { provenFetch } from "./hub-proof";

/** One copy's stream at this machine's hub. */
const relay = (token: string) =>
  hubClient(hubOrigin(), provenFetch).api["folder-moves"].relay({ token });

/** The hub ended the stream, in its words. */
const ended = (refusal: HubRefusal): Error =>
  new TreeRefused(folderStepWords.relayEnded(refusalText(refusal)));

/** The sending side: `stream` put to the hub, answered once the taking side has read all of it. */
export const relayStream = async (
  token: string,
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<void> => {
  unwrap(await relay(token).putBytes(stream, signal ? { signal } : {}), ended);
};

/** The taking side: the stream as the hub passes it on. */
export const relayTaken = async (
  token: string,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> =>
  unwrap(await relay(token).getBytes(signal ? { signal } : {}), ended);
