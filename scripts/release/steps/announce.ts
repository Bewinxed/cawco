import { announce as tellHub } from "../../release-announce";
import { alone, type StepContext } from "./shared";

/** The hub told to look at the release just published. */
export const announce = ({ manifest }: StepContext): Promise<void> =>
  tellHub(manifest());

await alone(
  import.meta,
  "bun scripts/release/steps/announce.ts --commit SHA [--manifest FILE]\n  Tells the hub to look at the published release named by the manifest (default <staging>/manifest.json; after promote the staging is the --output folder's <version>, pass --manifest there/release.json).",
  announce
);
