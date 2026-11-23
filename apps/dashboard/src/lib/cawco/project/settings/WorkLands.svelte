<script lang="ts">
  import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
  import { settingsViewWords as words } from "@cawco/core/words/settings-view";
  /**
   * Where code goes (Repository & Git, code projects only): the four ways
   * finished code goes, as the view's one pick (PickTiles), each led by the
   * glyph of what happens to the code: a commit onto the main line, a
   * branch of its own, a branch with a pull request, kept here, each one's
   * line under its name. A press moves the pick at
   * once (changes.ts `withAsked`); a refusal puts it back and stands under
   * the tiles in the hub's words, with Try again (RowFault).
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    IconLandBranch,
    IconLandCommit,
    IconLandKept,
    IconLandPullRequest,
  } from "#lib/icons.js";
  import type { StageSends } from "./changes";
  import PickTiles from "./PickTiles.svelte";

  let { record, refused, onchange, onretry }: StageSends = $props();

  const GLYPHS = {
    main: IconLandCommit,
    branch: IconLandBranch,
    pr: IconLandPullRequest,
    none: IconLandKept,
  } as const satisfies Record<LandsMode, unknown>;
</script>

{#snippet glyph(landing: LandsMode)}
  {@const Glyph = GLYPHS[landing]}
  <Glyph aria-hidden="true" class="size-icon-md text-ink-muted" />
{/snippet}

<div class="flex min-w-0 flex-col gap-space-1">
  <PickTiles
    cols={2}
    disabled={!record.hubReachable}
    {glyph}
    label={words.lands.groupLabel}
    onpick={(next) => {
      if (next !== record.landing) {
        onchange({ key: "landing", value: next });
      }
    }}
    options={LANDS_MODES.map((landing) => ({
      id: landing,
      name: words.lands.options[landing].name,
      note: words.lands.options[landing].note,
    }))}
    value={record.landing}
  />
  <RowFault
    again={() => onretry("landing")}
    againLabel={words.retryChange}
    reason={refused.landing}
  />
</div>
