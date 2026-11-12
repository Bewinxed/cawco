import { join } from "node:path";
import { uploadAssets } from "../../publish-release";
import { alone, type StepContext } from "./shared";

/** A target's archive and its checksum, put on the draft release. */
export const upload = async (
  { notStopped, tag, staging, archiveName }: StepContext,
  target: string
): Promise<void> => {
  await notStopped();
  await uploadAssets(tag(), [
    join(staging, archiveName(target)),
    join(staging, `${archiveName(target)}.sha256`),
  ]);
};

await alone(
  import.meta,
  "bun scripts/release/steps/upload.ts --commit SHA --target T [--staging DIR] [--version V]\n  Uploads the target's archive and .sha256 from the staging to the draft release (release:draft).",
  (context, flags) => upload(context, flags.required("--target"))
);
