/**
 * GitHub: an issue, pull request or discussion is
 * `github.com/<owner>/<repo>/{issues,pull,discussions}/<n>`, and a comment
 * on one is that URL's `#issuecomment-<id>` or `#discussioncomment-<id>`.
 * An Actions run is `github.com/<owner>/<repo>/actions/runs/<id>`.
 */
import type { ItemRef, LinkKind, ProviderDescriptor } from "../provider";

const NAME = /^[\w.-]+$/u;
const NUMBER = /^\d{1,9}$/u;
const RUN_ID = /^\d{1,15}$/u;
const COMMENT = /#(?:issuecomment|discussioncomment)-(\d{1,20})$/u;

const KINDS: Readonly<Record<string, LinkKind>> = {
  issues: "issue",
  pull: "pr",
  discussions: "discussion",
};

/** An Actions run; its URL names the repository in lower case, as a wait's handle always has. */
const runOf = (
  host: string,
  container: string,
  id: string
): ItemRef | undefined =>
  RUN_ID.test(id)
    ? {
        provider: "github",
        host,
        container,
        kind: "run",
        key: id,
        ref: `run ${id}`,
        url: `https://github.com/${container}/actions/runs/${id}`,
      }
    : undefined;

export const github: ProviderDescriptor = {
  id: "github",
  hosts: ["github.com"],
  itemOfUrl: (url) => {
    const [, owner = "", repo = "", written = "", digits = "", id = ""] =
      url.pathname.split("/");
    if (!(NAME.test(owner) && NAME.test(repo))) {
      return;
    }
    const container = `${owner}/${repo}`.toLowerCase();
    const segment = written.toLowerCase();
    if (segment === "actions" && digits.toLowerCase() === "runs") {
      return runOf(url.host, container, id);
    }
    const kind = KINDS[segment];
    if (!(kind && NUMBER.test(digits))) {
      return;
    }
    const key = String(Number(digits));
    return {
      provider: "github",
      host: url.host,
      container,
      kind,
      key,
      ref: `#${key}`,
      url: `https://github.com/${owner}/${repo}/${segment}/${key}`,
    };
  },
  commentOfUrl: (url) => COMMENT.exec(url.hash)?.[1],
};
