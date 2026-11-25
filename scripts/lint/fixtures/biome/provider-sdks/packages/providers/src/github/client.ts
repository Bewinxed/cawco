// Left alone: GitHub's SDK in GitHub's provider folder.
import { Octokit } from "@octokit/rest";
import { verify } from "@octokit/webhooks-methods";

export const used = [Octokit, verify];
