/**
 * This machine's side of a folder move's stream between two machines, at
 * the hub (`/api/folder-moves/relay/<token>`, hub folder-move-relay.ts):
 * the folder's machine puts the stream, the destination's takes it, each
 * read and written as it goes. Eden's client reads a body whole, so the
 * route's address is taken from it (`hubPath`) and the stream sent with
 * this machine's proof by plain `fetch`.
 */

import { folderStepWords } from "@cawco/core/words/folder-move";
import { hubClient, hubPath } from "@cawco/hub/client";
import { TreeRefused } from "./folder-tree";
import { hubOrigin } from "./git/hub-remote";
import { provenFetch } from "./hub-proof";

/** The address of one copy's stream at this machine's hub. */
const relayUrl = (token: string): string => {
  const origin = hubOrigin();
  const route = hubClient(origin, (input, init) => fetch(input, init)).api[
    "folder-moves"
  ].relay({ token });
  return `${origin}${hubPath(route)}`;
};

/** The sending side: `stream` put to the hub, answered once the taking side has read all of it. */
export const relayStream = async (
  token: string,
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<void> => {
  const sent = await provenFetch(relayUrl(token), {
    method: "PUT",
    body: stream,
    ...(signal ? { signal } : {}),
  });
  if (!sent.ok) {
    throw new TreeRefused(
      folderStepWords.relayEnded(`${sent.status} ${await sent.text()}`)
    );
  }
};

/** The taking side: the stream as the hub passes it on. */
export const relayTaken = async (
  token: string,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> => {
  const taken = await provenFetch(relayUrl(token), {
    method: "GET",
    ...(signal ? { signal } : {}),
  });
  if (!(taken.ok && taken.body)) {
    throw new TreeRefused(
      folderStepWords.relayEnded(`${taken.status} ${await taken.text()}`)
    );
  }
  return taken.body;
};
