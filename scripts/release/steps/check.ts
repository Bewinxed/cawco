import { alone, type StepContext } from "./shared";

/** The repository's check, in the check tree beside the builds. */
export const check = ({ run, trees }: StepContext): Promise<string> =>
  run([process.execPath, "run", "check", "--all"], trees.check);

await alone(
  import.meta,
  "bun scripts/release/steps/check.ts --commit SHA\n  Runs `bun run check --all` in the commit's check worktree (release-<sha>-check, made by the release's tree and install steps).",
  async (context) => {
    await check(context);
  }
);
