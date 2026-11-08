/** Whether `error` says nothing is at the path: a file or folder that is not (or no longer) there. */
export const isGone = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

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
