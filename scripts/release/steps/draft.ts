import { createDraft } from "../../publish-release";
import { alone, type StepContext } from "./shared";

/** The draft release, made once the version is known. */
export const makeDraft = async ({
  notStopped,
  manifest,
  tag,
  learned,
}: StepContext): Promise<void> => {
  await notStopped();
  const { channel: on, commit, notes, version } = manifest();
  const created = createDraft({
    channel: on,
    commit,
    notes,
    version,
    tag: tag(),
  });
  // Recorded before the first await: a stop from here on removes it.
  learned.draft = { created, tag: tag() };
  await created;
};

await alone(
  import.meta,
  "bun scripts/release/steps/draft.ts --commit SHA [--staging DIR] [--version V]\n  Makes the draft GitHub release for the manifest's version (<staging>/manifest.json, or --version V).",
  makeDraft
);
