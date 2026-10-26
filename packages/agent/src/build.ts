/**
 * What this daemon was built from (NEW.md §12). The fleet is edited while it
 * runs, so a machine quietly a month behind is the normal failure — this is what
 * lets the hub say so instead of the user finding out through a protocol error.
 */

import type { BuildInfo } from "@cawco/core";
import { readBuildInfo } from "@cawco/core/build-info";

let reported: Promise<BuildInfo> | undefined;

/**
 * Read once and kept: a running daemon is whatever it started as, however the
 * checkout under it moves on. Learning that it moved is what an update is for.
 */
export const buildInfo = (): Promise<BuildInfo> => {
  reported ??= readBuildInfo(async () => {
    const manifest = (await Bun.file(
      Bun.fileURLToPath(new URL("../package.json", import.meta.url))
    ).json()) as { version: string };
    return manifest.version;
  });
  return reported;
};
