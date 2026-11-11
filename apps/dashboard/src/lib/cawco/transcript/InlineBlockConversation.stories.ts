/**
 * An agent's blocks across a conversation (tsk-330), each drawn by the
 * transcript's own block over the conversation's versions: a reply that
 * revises its block in place, a long conversation of revisions whose every
 * replaced version is frozen to markup, and a block kept as an artifact.
 */
import mergeChecksPage from "./block-fixtures/merge-checks.html?raw";
import paywallStory from "./block-fixtures/paywall-story.mp4?url";
import releaseNarration from "./block-fixtures/release-narration.mp3?url";
import InlineBlockConversation from "./InlineBlockConversation.svelte";

/** A reply's fence for block `name` holding `program`. */
const fence = (name: string, program: string): string =>
  `\`\`\`openui name="${name}"\n${program}\n\`\`\``;

/** The release figures at one moment: merged, waiting and failed pull requests. */
const health = (merged: number, waiting: number, failed: number): string =>
  fence(
    "Release health",
    `root = Column([figures, table])
figures = Row([StatTile("Merged", ${merged}, "done"), StatTile("Waiting on review", ${waiting}, "attn"), StatTile("Failed checks", ${failed}, "fail")])
table = Table(["Pull request", "Owner", "Checks"], [["Inline blocks in the transcript", "Ana Ruiz", Badge("${failed > 0 ? "Failed" : "Passed"}", "${failed > 0 ? "fail" : "done"}")], ["Tray chip overflow", "Omar Haddad", Badge("Running", "live")], ["Sign-in move for stored transcripts", "Lea Martin", Badge("Waiting", "attn")]])`
  );

export default {
  title: "Transcript/Inline block versions",
  component: InlineBlockConversation,
  args: {
    replies: [
      `Here is where the release stands, then the same block once the rerun finished:\n\n${health(11, 4, 1)}\n\nThe rerun of the sign-in checks passed:\n\n${health(12, 3, 0)}\n\nNothing blocks the release now.`,
    ],
  },
};

/** One reply that draws a block, then redraws it under the same name: the first folds, the second is the newest. */
export const RevisedInOneReply = {};

/** Twelve replies, each redrawing the release figures: eleven frozen versions and one live block. */
export const LongConversation = {
  args: {
    replies: Array.from(
      { length: 12 },
      (_, at) =>
        `Check ${at + 1} of the release, ${at < 11 ? "still moving" : "settled"}:\n\n${health(at + 3, Math.max(0, 9 - at), at % 3 === 0 ? 1 : 0)}\n\n${at < 11 ? "I'll check again after the next merge." : "That's the release."}`
    ),
  },
};

/** The newest version kept as an artifact: its place folds, its capsule opens the artifact. */
export const Kept = {
  args: {
    replies: [
      `Where the release stands:\n\n${health(12, 3, 0)}\n\nI kept it as an artifact so it can follow the release.`,
    ],
    kept: [{ slug: "release-health", title: "Release health" }],
  },
};

/** The paywall story's clip, as a reply names it in the project's folder. */
const CLIP = "assets/4a0d95d4/paywall-story.mp4";
const clip = (caption: string): string =>
  fence(
    "Paywall story",
    `root = Column([clip])
clip = Video("${CLIP}", "${caption}", "small")`
  );

/** A clip redrawn in a later reply: the first stands still and folded, no player in it; the newest plays. */
export const ReplacedVideo = {
  args: {
    replies: [
      `The paywall story as it was this morning:\n\n${clip("First cut, 12.4 seconds")}\n\nI'll trim the opening.`,
      `Trimmed: the walk-in is shorter now.\n\n${clip("Second cut, 10.8 seconds")}\n\nThat's the cut that ships.`,
    ],
    files: { [CLIP]: paywallStory },
  },
};

/** The narration and the merge-checks page, as a reply names them. */
const NARRATION = "assets/4a0d95d4/release-narration.mp3";
const checks = (caption: string): string =>
  fence(
    "Merge checks",
    `root = Column([page, voice])
page = Preview("merge-checks-live", "${caption}")
voice = Audio("${NARRATION}", "Release narration, Alice voice")`
  );

/** A live page and a narration redrawn later: the first stands as a still box and a still row, no frame and no player in it. */
export const ReplacedPage = {
  args: {
    replies: [
      `The checks page with this morning's times:\n\n${checks("Morning run")}\n\nI'll rerun after the rebase.`,
      `After the rebase:\n\n${checks("After the rebase")}\n\nAll four passed.`,
    ],
    files: { [NARRATION]: releaseNarration },
    pages: [
      {
        name: "merge-checks-live",
        title: "Merge checks, live",
        src: URL.createObjectURL(
          new Blob([mergeChecksPage], { type: "text/html" })
        ),
      },
    ],
  },
};
