<script lang="ts">
  /**
   * One artifact's notice in Caw's panel (core artifact-needs.ts): a
   * revision with nothing asked ("Presence page: 4 changed since you
   * looked"), a pin's closing answer not read, or its session ended with
   * its ask unanswered ("Claude Code ended; 3 picks on Pairing never made").
   * One row per artifact, on the notice recipe (NoticeRow): its session's
   * mark, its words, and its ✕, which acknowledges every part it says on
   * every device. Its words open it, its session with the artifact in its
   * panel at its first stop, which is a look: what a revision changed and a
   * closing answer leave with it. One no session holds says its words alone.
   */
  import {
    type ArtifactKind,
    type ArtifactNeedNotice,
    artifactWords,
    noticePartWords,
  } from "@cawco/core";
  import type { Component } from "svelte";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconGlobe,
    IconWindow,
  } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { openArtifactIn } from "../reference-open.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { cawOf } from "../session-status";
  import NoticeRow from "./NoticeRow.svelte";

  let {
    notice,
    onchoose,
    ondismiss,
  }: {
    notice: ArtifactNeedNotice;
    /** Its words were chosen: it opens, and the panel closes. */
    onchoose: () => void;
    /** Its ✕: every part's notice id. */
    ondismiss: (ids: string[]) => void;
  } = $props();

  // ArtifactMenu's GLYPHS.
  const GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    component: IconArtifactSheet,
    browser: IconGlobe,
  };
  const Kind = $derived(GLYPHS[notice.artifactKind]);
  const words = $derived(
    notice.parts.map((part) => noticePartWords(part, notice.name)).join(" · ")
  );
  /** Its words chosen: the panel closes, and it opens in its session's panel at its stop. */
  function opened(): void {
    onchoose();
    if (notice.instanceId) {
      // biome-ignore lint/complexity/noVoid: its refusal is its own toast
      void openArtifactIn(notice.instanceId, notice.artifactId, notice.stop);
    }
  }
  const row = $derived(
    notice.instanceId
      ? cawco.instanceIndex.byId.get(notice.instanceId)
      : undefined
  );
</script>

<NoticeRow
  dismissLabel={artifactWords.dismissNotice(notice.name)}
  label={words}
  ondismiss={() => ondismiss(notice.parts.map((part) => part.id))}
>
  {#snippet lead()}
    {#if notice.instanceId}
      <SessionMark
        caw={cawOf(notice.instanceId)}
        id={notice.instanceId}
        place={row?.cwd || notice.machineId || notice.instanceId}
        status="idle"
      />
    {:else}
      <Kind aria-hidden="true" class="size-icon-md text-ink-muted" />
    {/if}
  {/snippet}
  {#if notice.href}
    <a
      data-slot="name"
      data-artifact-notice={notice.artifactId}
      class="select-none pe-(--x-room) min-w-0 rounded-xs type-label wrap-anywhere text-ink-row no-underline focus-inset hover:text-ink-strong"
      href={notice.href.split("?")[0]}
      onclick={opened}>{words}</a
    >
  {:else}
    <span
      data-slot="name"
      data-artifact-notice={notice.artifactId}
      class="pe-(--x-room) min-w-0 type-label wrap-anywhere text-ink-row"
      >{words}</span
    >
  {/if}
</NoticeRow>
