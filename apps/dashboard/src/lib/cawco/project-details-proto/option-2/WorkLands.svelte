<script lang="ts">
  /**
   * Stage 4 ("Work lands", code projects only): the four ways finished code
   * goes, as the house's equal tiles (OptionTiles), each led by the glyph of
   * what happens to the code: a commit onto the main line, a branch of its
   * own, a branch with a pull request, kept here. A press moves the pick at
   * once (changes.ts `withAsked`); a refusal puts it back and stands under
   * the tiles in the hub's words, with Try again (RowFault).
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { OptionTiles } from "#lib/components/ui/option-group/index.js";
  import {
    IconLandBranch,
    IconLandCommit,
    IconLandKept,
    IconLandPullRequest,
  } from "#lib/icons.js";
  import type { StageSends } from "./changes";
  import type { Landing } from "./records";
  import { howItRunsWords as words } from "./words";

  let { record, refused, onchange, onretry }: StageSends = $props();

  const GLYPHS = {
    default: IconLandCommit,
    branch: IconLandBranch,
    pr: IconLandPullRequest,
    nowhere: IconLandKept,
  } as const;
  const LANDINGS: readonly Landing[] = ["default", "branch", "pr", "nowhere"];
</script>

{#snippet glyph(landing: Landing)}
  {@const Glyph = GLYPHS[landing]}
  <Glyph aria-hidden="true" class="size-icon-md text-ink-muted" />
{/snippet}

<div class="flex min-w-0 flex-col gap-space-1">
  <OptionTiles
    bind:value={
      () => record.landing,
      (next) => {
        if (next !== null && next !== record.landing) {
          onchange({ key: "landing", value: next });
        }
      }
    }
    cols={1}
    disabled={!record.hubReachable}
    glide="mark"
    {glyph}
    label={words.lands.groupLabel}
    options={LANDINGS.map((landing) => ({
      id: landing,
      name: words.lands.options[landing].name,
      note: words.lands.options[landing].note,
    }))}
  />
  <RowFault
    again={() => onretry("landing")}
    againLabel={words.retryChange}
    reason={refused.landing}
  />
</div>
