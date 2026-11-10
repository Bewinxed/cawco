/**
 * The HTTP status the container runtime's API answered a failed call with
 * (dockerode puts it on the error as `statusCode`): 404 for a thing that is
 * not there, 409 for one made twice at once.
 */
export const statusOf = (error: unknown): number | undefined =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  typeof error.statusCode === "number"
    ? error.statusCode
    : undefined;
