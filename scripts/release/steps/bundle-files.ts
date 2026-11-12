import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { alone, type StepContext } from "./shared";

/** The Info.plist the darwin bundles are laid out with, from this commit. */
export const bundleFiles = async ({
  run,
  bundleFiles: folder,
  trees,
}: StepContext): Promise<void> => {
  await mkdir(folder, { recursive: true });
  await run(
    [
      process.execPath,
      "scripts/binary/info-plist.ts",
      join(folder, "Info.plist"),
    ],
    trees.build
  );
};

await alone(
  import.meta,
  "bun scripts/release/steps/bundle-files.ts --commit SHA [--staging DIR] [--checkout DIR]\n  Writes <staging>/agent-bundle/Info.plist.",
  bundleFiles
);
