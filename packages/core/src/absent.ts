/** The errno code a failure carries (`ENOENT`, `EACCES`), when it carries one. */
export const errnoCode = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;

/** Whether `error` says nothing is at the path: a file or folder that is not (or no longer) there. */
export const isGone = (error: unknown): boolean =>
  errnoCode(error) === "ENOENT";

/**
 * For a read of a path CawCo keeps, where absent is an answer and anything
 * else is a failure: a read that found nothing there answers `none`, any
 * other failure stands.
 */
export const unlessGone =
  <T>(none: T) =>
  (error: unknown): T => {
    if (isGone(error)) {
      return none;
    }
    throw error;
  };
