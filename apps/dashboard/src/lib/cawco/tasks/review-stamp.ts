/**
 * What changes when a task's attempts move or hand in a result, which its
 * file's `updatedAt` does not say (a result is kept on the attempt, not in
 * the file): the views that hold a read task read it again when it moves.
 */
import type { TaskAttempt } from "../project-tasks";

export const resultStamp = (task: { attempts: TaskAttempt[] }): string =>
  task.attempts
    .map(
      (attempt) =>
        `${attempt.workItemId}:${attempt.state}:${attempt.result?.at ?? 0}`
    )
    .join(",");
