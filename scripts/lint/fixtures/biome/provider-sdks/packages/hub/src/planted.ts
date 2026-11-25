// Planted: a service's SDK outside its provider, by import, type import,
// re-export and on demand.
import { Octokit } from "@octokit/rest";
import type { LinearClient } from "@linear/sdk";
export { Gitlab } from "@gitbeaker/rest";
export const later = () => import("@octokit/webhooks-methods");

export const used: [typeof Octokit, LinearClient | null] = [Octokit, null];
