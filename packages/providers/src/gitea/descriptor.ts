/**
 * Gitea: an issue is `<host>/<owner>/<repo>/issues/<n>` and a pull request
 * `…/pulls/<n>`, one numbering for both; a comment on either is that URL's
 * `#issuecomment-<id>`. gitea.com is Gitea's own; a self-hosted host is
 * Gitea's once a connection says so.
 */
import type { LinkKind, ProviderDescriptor } from "../provider";

const NAME = /^[\w.-]+$/u;
const NUMBER = /^\d{1,9}$/u;
const COMMENT = /#issuecomment-(\d{1,20})$/u;

const KINDS: Readonly<Record<string, LinkKind>> = {
  issues: "issue",
  pulls: "pr",
};

export const gitea: ProviderDescriptor = {
  id: "gitea",
  hosts: ["gitea.com"],
  itemOfUrl: (url) => {
    const [, owner = "", repo = "", written = "", digits = ""] =
      url.pathname.split("/");
    const segment = written.toLowerCase();
    const kind = KINDS[segment];
    if (!(kind && NAME.test(owner) && NAME.test(repo) && NUMBER.test(digits))) {
      return;
    }
    const key = String(Number(digits));
    return {
      provider: "gitea",
      host: url.host,
      container: `${owner}/${repo}`.toLowerCase(),
      kind,
      key,
      ref: `#${key}`,
      url: `https://${url.host}/${owner}/${repo}/${segment}/${key}`,
    };
  },
  commentOfUrl: (url) => COMMENT.exec(url.hash)?.[1],
};
