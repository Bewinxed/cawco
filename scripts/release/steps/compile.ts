import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { alone, type StepContext } from "./shared";

/** One target's binary, built from the assets `prepare` made. */
export const compile = async (
  { run, staging, trees, manifest, current }: StepContext,
  target: string
): Promise<void> => {
  const dir = join(staging, target);
  await mkdir(dir, { recursive: true });
  await run(
    [
      process.execPath,
      "scripts/build-binary.ts",
      target,
      join(dir, "cawco"),
      manifest().version,
      current.commit,
      "--skip-prepare",
    ],
    trees.build
  );
};

await alone(
  import.meta,
  "bun scripts/release/steps/compile.ts --commit SHA --target T [--staging DIR] [--checkout DIR] [--version V]\n  Compiles the target's binary into <staging>/<target>/cawco, after `release:prepare` ran in the checkout.",
  (context, flags) => compile(context, flags.required("--target"))
);
