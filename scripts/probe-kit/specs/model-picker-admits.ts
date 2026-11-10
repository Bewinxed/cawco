/**
 * The New session model picker offers, for the chosen machine and harness,
 * only the ids typed in before that the hub will start there. On 2026-11-06
 * the owner picked `opencode/deepseek-v4.1-flash` for OpenCode on
 * niftybot.art from the picker's typed ids (dashboard models.svelte.ts
 * `recentFor`, kept per harness for the whole fleet), a model that machine
 * doesn't list, and the hub refused the start (core
 * `unlistedModelRefusal`). The picker now judges each typed id by the
 * hub's own test (core `modelAdmitted` over `modelListingOn`), through
 * dashboard model-catalog.ts `typedOffered`.
 *
 * (a) OpenCode on a machine whose list is read and doesn't hold a typed id:
 *     the id is not offered.
 * (b) OpenCode on a machine whose list is unread: the id is not offered.
 * (c) Claude Code on a machine whose accounts' catalogs are unread: its
 *     alias and a full model name typed in are offered, as the hub admits
 *     them with no list.
 *
 *   bun scripts/probe-kit/run.ts model-picker-admits
 */

import { typedOffered } from "../../../apps/dashboard/src/lib/cawco/model-catalog";
import { modelListingOn } from "../../../packages/core/src/model-names";
import type { Kit, Spec } from "../spec";

/** The id the owner typed and lost a session to. */
const UNLISTED = "opencode/deepseek-v4.1-flash";

const spec: Spec = {
  group: "The hub and machines",
  name: "model-picker-admits",
  run: async (kit: Kit) => {
    const { check } = kit;
    const listed = [
      { value: "opencode/big-pickle", displayName: "Big Pickle" },
    ];
    const readHere = typedOffered("opencode", [UNLISTED], listed, {
      every: true,
      listings: [modelListingOn("opencode", { report: { models: listed } })],
    });
    check(
      `a: OpenCode lists only opencode/big-pickle there, and the typed ${UNLISTED} is not offered`,
      readHere.length === 0,
      JSON.stringify(readHere)
    );
    const unreadHere = typedOffered("opencode", [UNLISTED], [], {
      every: true,
      listings: [
        modelListingOn("opencode", {
          report: { modelsUnread: "OpenCode's server would not start." },
        }),
      ],
    });
    check(
      `b: OpenCode's list there is unread, and the typed ${UNLISTED} is not offered`,
      unreadHere.length === 0,
      JSON.stringify(unreadHere)
    );
    const claude = typedOffered("claude", ["opus", "claude-opus-5-5"], [], {
      every: true,
      listings: [modelListingOn("claude", { catalogs: [], faults: [] })],
    });
    check(
      "c: Claude Code's catalogs there are unread, and its typed alias opus and claude-opus-5-5 are offered",
      claude.length === 2,
      JSON.stringify(claude)
    );
    await Promise.resolve();
  },
};

export default spec;
