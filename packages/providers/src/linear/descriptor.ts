/**
 * Linear: an issue is `linear.app/<workspace>/issue/<TEAM-n>`, with or
 * without its title's slug after it, and a comment on one is that URL's
 * `#comment-<uuid>`.
 */
import type { ProviderDescriptor } from "../provider";

const WORKSPACE = /^[\w-]+$/u;
const IDENTIFIER = /^[A-Za-z0-9]+-\d{1,9}$/u;
const COMMENT = /#comment-([0-9a-f-]{8,64})$/iu;

export const linear: ProviderDescriptor = {
  id: "linear",
  hosts: ["linear.app"],
  itemOfUrl: (url) => {
    const [, workspace = "", segment = "", identifier = ""] =
      url.pathname.split("/");
    if (!(
      segment.toLowerCase() === "issue" &&
      WORKSPACE.test(workspace) &&
      IDENTIFIER.test(identifier)
    )) {
      return;
    }
    const key = identifier.toUpperCase();
    return {
      provider: "linear",
      host: url.host,
      container: workspace.toLowerCase(),
      kind: "issue",
      key,
      ref: key,
      url: `https://linear.app/${workspace}/issue/${key}`,
    };
  },
  commentOfUrl: (url) => COMMENT.exec(url.hash)?.[1],
};
