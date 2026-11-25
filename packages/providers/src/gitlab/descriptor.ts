/**
 * GitLab: an issue is `<host>/<group>/<sub…>/<project>/-/issues/<n>` and a
 * merge request `…/-/merge_requests/<n>`, numbered apart (`#12`, `!7`); a
 * comment on either is that URL's `#note_<id>` (docs.gitlab.com, "Notes
 * API": a note is a comment). A self-managed host is GitLab's once a
 * connection says so.
 */
import type { LinkKind, ProviderDescriptor } from "../provider";

const NAME = /^[\w.-]+$/u;
const NUMBER = /^\d{1,9}$/u;
const COMMENT = /#note_(\d{1,20})$/u;

const KINDS: Readonly<Record<string, { kind: LinkKind; mark: string }>> = {
  issues: { kind: "issue", mark: "#" },
  merge_requests: { kind: "pr", mark: "!" },
};

export const gitlab: ProviderDescriptor = {
  id: "gitlab",
  hosts: ["gitlab.com"],
  itemOfUrl: (url) => {
    const segments = url.pathname.split("/");
    const dash = segments.indexOf("-");
    const path = segments.slice(1, dash);
    const [written = "", digits = ""] = segments.slice(dash + 1);
    const segment = written.toLowerCase();
    const of = KINDS[segment];
    if (!(
      of &&
      dash > 2 &&
      path.every((name) => NAME.test(name)) &&
      NUMBER.test(digits)
    )) {
      return;
    }
    const key = String(Number(digits));
    const project = path.join("/");
    return {
      provider: "gitlab",
      host: url.host,
      container: project.toLowerCase(),
      kind: of.kind,
      key,
      ref: `${of.mark}${key}`,
      url: `https://${url.host}/${project}/-/${segment}/${key}`,
    };
  },
  commentOfUrl: (url) => COMMENT.exec(url.hash)?.[1],
};
