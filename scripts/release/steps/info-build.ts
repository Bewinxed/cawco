import { alone, type StepContext } from "./shared";

/** The binary build-info is asked of: a linux-x64 proof build. */
export const infoBuild = ({
  run,
  proofBinary,
  manifest,
  current,
  trees,
}: StepContext): Promise<string> =>
  run(
    [
      process.execPath,
      "scripts/build-binary.ts",
      "linux-x64",
      proofBinary,
      manifest().version,
      current.commit,
      "--proof",
      "--skip-prepare",
    ],
    trees.build
  );

await alone(
  import.meta,
  "bun scripts/release/steps/info-build.ts --commit SHA [--staging DIR] [--checkout DIR] [--version V]\n  Builds <staging>/cawco-proof, after `release:prepare`.",
  async (context) => {
    await infoBuild(context);
  }
);
