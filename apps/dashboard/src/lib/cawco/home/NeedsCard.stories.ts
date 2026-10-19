/**
 * Needs you's row for a post to another person's repository held for the
 * owner (Component Story Format 3, live components): each post as the hub
 * parks it (core upstream-post.ts `describePost`, permission-presentation.ts
 * `presentPermission`), named by its own title over where it goes, the
 * session that asked on its last line. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import {
  type PermissionPresentation,
  presentPermission,
} from "@cawco/core/permission-presentation";
import {
  describePost,
  UPSTREAM_POST_TOOL,
  type UpstreamPost,
} from "@cawco/core/upstream-post";
import { askNaming } from "./ask-naming";
import type { NeedsItem } from "./home-state.svelte";
import NeedsCardSheet from "./NeedsCardSheet.svelte";

const ASKER = "Fix the tokenizer's unicode escapes";

/** A held post's ask, as the Caw panel lists it. */
const held = (post: UpstreamPost, repo: string, asker = ASKER): NeedsItem => {
  const input = describePost(post, repo, "@bewinxed");
  const presentation: PermissionPresentation = presentPermission(
    UPSTREAM_POST_TOOL,
    { ...input },
    { asker, memory: () => undefined } as never
  );
  const { title, ask } = askNaming(presentation, () => asker);
  return {
    kind: "ask",
    key: `probe:${JSON.stringify(post).length}`,
    instanceId: "probe-instance",
    cwd: "/home/bewinxed/cockpit",
    origin: null,
    thread: null,
    machineId: "obelisk",
    title,
    place: "obelisk · cockpit",
    project: { name: "cockpit", hue: 3 },
    machine: { name: "obelisk", os: "linux-x64" },
    isQuestion: false,
    ask,
    raisedAt: Date.now() - 4 * 60_000,
    request: {
      heard: 0,
      input: { ...input },
      instanceId: "probe-instance",
      presentation,
      requestId: "probe-request",
      toolName: UPSTREAM_POST_TOOL,
    },
    stale: false,
  } as NeedsItem;
};

export default {
  title: "Needs you/Held post",
  component: NeedsCardSheet,
  args: { stale: false, onchoose: () => undefined },
  parameters: { viewport: 400 },
};

/** A new issue: its title over owner/repo. */
export const Issue = {
  args: {
    item: held(
      {
        via: "forge",
        forge: "github",
        repo: "github.com/sveltejs/svelte",
        write: {
          op: "issue",
          title: "$state proxies drop symbol keys on spread",
          body: "Repro below.",
        },
      },
      "github.com/sveltejs/svelte"
    ),
  },
};

/** A comment on a pull request: its first line over owner/repo#n. */
export const Comment = {
  args: {
    item: held(
      {
        via: "forge",
        forge: "github",
        repo: "github.com/sveltejs/svelte",
        write: {
          op: "comment",
          on: "pull_request",
          number: 14_212,
          body: "\nThis fixes the repro in #14190 on our side too.\nThanks!",
        },
      },
      "github.com/sveltejs/svelte"
    ),
  },
};

/** Off GitHub: the host stays in the target. */
export const GitLab = {
  args: {
    item: held(
      {
        via: "forge",
        forge: "gitlab",
        repo: "gitlab.com/inkscape/inkscape",
        write: {
          op: "pull_request",
          title: "Snap to page edges when the canvas is rotated",
          body: "…",
          base: "master",
          head: "probe:rotated-snap",
        },
      },
      "gitlab.com/inkscape/inkscape"
    ),
  },
};

/** A comment whose title, repository and asking session all run long. */
const long = held(
  {
    via: "forge",
    forge: "github",
    repo: "github.com/some-organisation-with-a-long-name/an-equally-long-repository-name",
    write: {
      op: "comment",
      on: "issue",
      number: 98_765,
      body: "A first line that runs well past any panel's width, as people's comments often do when they start with context",
    },
  },
  "github.com/some-organisation-with-a-long-name/an-equally-long-repository-name",
  "Reconcile the hub's held-post ledger with the forge adapters after a restart"
);

/** Hostile, at a desk: a long title, a long asker and a long repository. */
export const LongNames = {
  args: { item: long },
  parameters: { viewport: "desk" },
};

/** Hostile, at 320: the asker's name gives way before the machine's mark. */
export const LongNamesNarrow = {
  args: { item: long },
  parameters: { viewport: 320 },
};
