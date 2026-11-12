import { alone, type StepContext } from "./shared";

/** The dashboard and every target-independent asset, once, for all the compiles. */
export const prepare = ({ run, trees }: StepContext): Promise<string> =>
  run([process.execPath, "scripts/build-binary.ts", "prepare"], trees.build);

await alone(
  import.meta,
  "bun scripts/release/steps/prepare.ts --commit SHA [--checkout DIR]\n  Builds the dashboard and the assets every target shares, in the build's checkout.",
  async (context) => {
    await prepare(context);
  }
);
