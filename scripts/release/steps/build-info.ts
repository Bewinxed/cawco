import { mkdir } from "node:fs/promises";
import type { ReleaseManifest } from "../../../packages/core/src/release-manifest";
import { alone, type StepContext } from "./shared";

/**
 * The hub ↔ agent contract this build speaks, as the build itself says: a joined machine installs it only when
 * it overlaps its hub's. The info build runs only under a scratch HOME and an isolated loopback hub
 * (scripts/binary/test-entry.ts), and inherits no credentials, so build-info is asked under exactly those.
 */
export const buildInfo = async ({
  run,
  infoHome,
  proofBinary,
  trees,
  manifest,
}: StepContext): Promise<void> => {
  await mkdir(infoHome, { recursive: true });
  const { protocol } = JSON.parse(
    await run(
      [
        "env",
        "-i",
        `PATH=${process.env.PATH ?? ""}`,
        `HOME=${infoHome}`,
        "HOST=127.0.0.1",
        "CAWCO_HUB_PORT=43456",
        "CAWCO_HUB_URL=http://127.0.0.1:43456",
        proofBinary,
        "build-info",
      ],
      trees.build,
      true
    )
  ) as Pick<ReleaseManifest, "protocol">;
  manifest().protocol = protocol;
};

await alone(
  import.meta,
  "bun scripts/release/steps/build-info.ts --commit SHA [--staging DIR] [--checkout DIR] [--version V]\n  Asks <staging>/cawco-proof for its protocol and records it in <staging>/manifest.json.",
  buildInfo,
  { keepsManifest: true }
);
