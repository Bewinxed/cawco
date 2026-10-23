/**
 * The hub's own preview origins on this machine (core hub-previews.ts): kept
 * from each register ack in {@link hubPreviewsPath}, in the agent's data dir,
 * which no workspace's sandbox reads, for each workspace's relay to dial them
 * from the host (proxy-relay.ts, boundary-host.ts).
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  HUB_PREVIEWS_FILE,
  hubPreviewOriginsOf,
  originsFor,
} from "@cawco/core/hub-previews";
import { cawcoDataDir } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/** Where the agent keeps the hub's preview origins: what each workspace's relay reads. */
export const hubPreviewsPath = (): string =>
  join(cawcoDataDir(), HUB_PREVIEWS_FILE);

/**
 * The register ack's `previewOrigins` kept for this machine's relays, as
 * this machine dials them (core `originsFor`); none from a hub from before
 * them, and the file goes.
 */
export const keepHubPreviews = async (
  origins: unknown,
  hostsHub: boolean
): Promise<void> => {
  const read = hubPreviewOriginsOf(origins);
  if (!read) {
    await rm(hubPreviewsPath(), { force: true });
    return;
  }
  await writeStateFile(
    hubPreviewsPath(),
    `${JSON.stringify(originsFor(read, hostsHub))}\n`
  );
};
