/**
 * What the person reads when the hub has added Status options to a GitHub
 * Project a project's board syncs with (hub sync.ts): under the tie's
 * row in the project's settings, the options it added last.
 */
import { andList } from "@cawco/providers/names";

export const boardStatusWords = {
  /** The line: the options added, and the Project. */
  addedTitle: (board: string, options: readonly string[]): string =>
    `Added ${andList(options.map((option) => `“${option}”`))} to ${board}'s Status`,
  /** Under it: why, and what stays as it was. */
  addedBody: (board: string, count: number): string =>
    `${count === 1 ? "It is a column" : "Each is a column"} of this project's board that ${board} had no Status option for, so its tasks show there too. Every option ${board} had stays as it was, and none is added again if you remove or rename it on GitHub.`,
};
