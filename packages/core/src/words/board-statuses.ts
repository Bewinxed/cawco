/**
 * What the hub tells the person when it adds Status options to a GitHub
 * Project a project's board syncs with (hub tracker.ts): one note per
 * Project, naming the options added.
 */
import { andList } from "./helpers";

export const boardStatusWords = {
  /** The note's line: the options added, and the Project. */
  addedTitle: (board: string, options: readonly string[]): string =>
    `Added ${andList(options.map((option) => `“${option}”`))} to ${board}'s Status`,
  /** Its fold: why, and what stays as it was. */
  addedBody: (board: string, count: number): string =>
    `${count === 1 ? "It is a column" : "Each is a column"} of this project's board that ${board} had no Status option for, so its tasks show there too. Every option ${board} had stays as it was, and none is added again if you remove or rename it on GitHub.`,
};
