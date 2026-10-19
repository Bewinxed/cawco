/**
 * What a task's outputs say wherever they are drawn (tasks/TaskOutput.svelte,
 * tasks/PostCard.svelte) and the project's Made list (views/ViewMade.svelte),
 * with `parsePost`'s reasons a file is no post. For the dashboard and the
 * native app alike.
 *
 * `bun run words` writes these into the app as `Words.Made`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const madeWords = {
  /** The strip's tab, while a task has made something. */
  tab: "Made",
  /** A file output's row: Open shows the file itself. */
  open: "Open",
  /** An image output, read out as the way to it whole. */
  openFile: (name: string) => `Open ${name}`,
  /** A `*.post.json` that does not read as a post, and why. */
  notPost: (name: string, problem: string) =>
    `${name} does not read as a post. ${problem}`,
  notJson: (error: string) => `It is not JSON: ${error}`,
  noObject: "It holds no post object.",
  notXPost: 'Its kind is not "x-post".',
  noText: "It has no text or no account.",
  /** A post's alternates: the first paragraph as written, or another. */
  firstParagraph: "First paragraph",
  asWritten: "As written",
  alternate: (index: number) => `Alternate ${index}`,
  thread: "Thread",
  post: "Post",
  /** The post's length against the limit, as X counts it. */
  countTitle: "As X counts it: a link is 23, a line break is one",
  community: "Community",
  media: "Media",
  mediaPlan: "Media plan",
};
