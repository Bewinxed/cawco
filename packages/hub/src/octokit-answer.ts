/**
 * GitHub's answer to one Octokit call, whether it made the change or refused
 * it: Octokit throws its answer for any status of 300 or more
 * (@octokit/request-error `RequestError`: its `status` and `response`), and
 * that is read back as an answer here. A failure to reach GitHub is thrown.
 */
export const octokitAnswer = async (
  call: () => Promise<{ data: unknown; status: number }>
): Promise<{ data: unknown; status: number }> => {
  try {
    return await call();
  } catch (error) {
    const refused = error as {
      response?: { data?: unknown };
      status?: unknown;
    } | null;
    if (typeof refused?.status === "number" && refused.response) {
      return { status: refused.status, data: refused.response.data };
    }
    throw error;
  }
};
