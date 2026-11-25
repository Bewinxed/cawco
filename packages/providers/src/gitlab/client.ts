/**
 * GitLab's client through @gitbeaker/rest, "A Typed GitLab SDK for
 * Browsers, Node.js, and Deno" (github.com/jdalrymple/gitbeaker), made here
 * for every caller (provider spec §2.2). Today the one caller is a
 * machine's: glab's sign-in, the host's `token` and where its API answers
 * (agent forges: "`token`: Your GitLab access token … Scoped per host";
 * "`api_protocol`: What protocol to use to access the API endpoint",
 * docs.gitlab.com/cli/config).
 */
import { Gitlab } from "@gitbeaker/rest";

/** A client signed in to one GitLab host. */
export interface GitLabClient {
  api: Gitlab<false>;
}

/** A client for `api` (`https://gitlab.example.com`), signed in with `token`. */
export const gitlabClient = (signIn: {
  api: string;
  token: string;
}): GitLabClient => ({
  api: new Gitlab({ host: signIn.api, token: signIn.token }),
});
