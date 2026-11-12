import { cp } from "node:fs/promises";
import { join } from "node:path";
import { signBundle } from "../../binary/sign-agent-bundle";
import { writeAppleSecrets } from "../../release-signing";
import { alone, type StepContext } from "./shared";

/** A darwin target's CawCo Agent.app signed with the team's Developer ID, on this host. */
export const sign = async (
  { run, staging, bundleFiles, learned, secrets }: StepContext,
  target: string
): Promise<void> => {
  const dir = join(staging, target);
  await cp(join(bundleFiles, "Info.plist"), join(dir, "Info.plist"));
  learned.apple ??= writeAppleSecrets(join(staging, "apple"), secrets);
  await signBundle(run, dir, (await learned.apple).identity);
};

await alone(
  import.meta,
  "bun scripts/release/steps/sign.ts --commit SHA --target darwin-arm64|darwin-x64 [--staging DIR]\n  Signs <staging>/<target> with rcodesign, using <staging>/agent-bundle/Info.plist (release:bundle-files) and the release env's Developer ID.",
  (context, flags) => sign(context, flags.required("--target")),
  { secrets: true }
);
