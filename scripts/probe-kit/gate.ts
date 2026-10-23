/**
 * A scratch project's landing gate, declared as the person declares one:
 * `gate.md` written into its hub folder through the folder route (hub
 * gate-file.ts). Specs that land work declare the gate their legs need.
 */

/**
 * The gate CawCo declares for itself, less its iOS step: the install first,
 * its failure leaving the rest unrun, then the root package.json's
 * `lint:changed` and `typecheck`.
 */
export const JS_GATE = `---
bun install --frozen-lockfile
  on-fail: stop
bun run lint:changed
bun run typecheck
---
`;

/**
 * CawCo's own iOS build step alone: run on a Mac in the item's gate
 * workspace there, only for work that changes what the Swift build reads.
 */
export const APPLE_GATE = `---
bash apps/apple/scripts/build-both.sh ios --gate
  name: iOS build compiles
  on: apps/apple, scripts/lib/disk-room.sh
  needs: apple
  timeout: 30m
---
`;

/** finish_item's refusal of an item whose iOS build step has no Mac online (hub gate-file.ts `capableRefusal`): the item waits for one. */
export const NO_MAC = "passes on a Mac (apple), and none is online";

/** The hub's wake of an item that waited for a Mac, once one is online (hub gate-file.ts `capableOnline`). */
export const MAC_ONLINE =
  "a Mac (apple), is online now: call finish_item again";

/** Writes `content` as the project's gate.md; throws with the hub's words when it is refused. */
export const declareGate = async (
  base: string,
  projectId: string,
  content: string
): Promise<void> => {
  const put = await fetch(`${base}/api/projects/${projectId}/folder/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "gate.md", content }),
  });
  if (!put.ok) {
    throw new Error(`gate.md: ${put.status} ${await put.text()}`);
  }
};
