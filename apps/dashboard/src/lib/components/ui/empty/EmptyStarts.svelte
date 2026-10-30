<script lang="ts" module>
  /** The empty states The Empty Starts Work Rule gave an action, by where they stand. */
  type EmptySite =
    | "hooks"
    | "rules"
    | "rules-waiting"
    | "mcp"
    | "memory-no-match"
    | "delegate-types"
    | "cli-tools"
    | "session-blank"
    | "transcript-empty"
    | "routines-caw-away"
    | "sources"
    | "view-missing"
    | "view-unread";
</script>

<script lang="ts">
  /**
   * The states file's seam (EmptyStarts.stories.ts): each empty state the
   * rule covers, drawn with the real EmptyState, EmptyAsk and CantStart and
   * the words its own surface reads (core's words, empty-asks.ts), so each
   * can be judged without its page's live store. A press here goes nowhere;
   * on its surface it puts the words where they go.
   */
  import { CAW_NO_MACHINE } from "@cawco/core/project-conversation";
  import { connectWords } from "@cawco/core/words/connect";
  import { delegateTypesWords } from "@cawco/core/words/delegate-types";
  import { mcpWords } from "@cawco/core/words/mcp";
  import { memoryWords } from "@cawco/core/words/memory";
  import { routinesWords } from "@cawco/core/words/routines";
  import CantStart from "#lib/cawco/CantStart.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import EmptyAsk from "#lib/cawco/EmptyAsk.svelte";
  import {
    askLabel,
    EMPTY_LINES,
    FLEET_ASKS,
    firstAskLabel,
    NO_SESSION_CAN_START,
  } from "#lib/cawco/empty-asks.js";
  import { stageLabel } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconAlert,
    IconChat,
    IconClock,
    IconHook,
    IconSearch,
    IconTerminal,
  } from "#lib/icons.js";
  import EmptyState from "./empty-state.svelte";

  let {
    site,
    canStart = true,
    project = "Launch",
    view = "release-train",
    filter = "models/opus",
    harness = "claude",
  }: {
    site: EmptySite;
    /** A machine is online (Configure) or Caw can start (a project). */
    canStart?: boolean;
    /** The project's name, where the line names it. */
    project?: string;
    /** The view a link named. */
    view?: string;
    /** What the memory filter holds. */
    filter?: string;
    /** The session's harness. */
    harness?: string;
  } = $props();

  const nowhere = () => undefined;
</script>

{#snippet addMachine()}
  <Button
    aria-haspopup="dialog"
    label={connectWords.addMachine}
    variant="outline"
  />
{/snippet}

{#snippet createRoutine()}
  <Button label={routinesWords.createRoutine} variant="outline" />
{/snippet}

<div class="w-full min-w-0" data-empty-site={site}>
  {#if site === "hooks" || site === "rules"}
    <EmptyState
      icon={sectionOf(site).icon}
      line={EMPTY_LINES.starters(site, canStart)}
      title={site === "hooks" ? "Nothing runs yet" : "Nothing is watching yet"}
    >
      {#snippet action()}
        <EmptyAsk
          {canStart}
          label={askLabel(FLEET_ASKS[site].what)}
          onask={nowhere}
          reason={NO_SESSION_CAN_START}
        />
      {/snippet}
    </EmptyState>
  {:else if site === "rules-waiting"}
    <EmptyState
      icon={sectionOf("rules").icon}
      line={EMPTY_LINES.rulesNoneWaiting}
      title="No rule is waiting on an answer"
    >
      {#snippet action()}
        <Button label="Remove the filter" variant="outline" />
      {/snippet}
    </EmptyState>
  {:else if site === "mcp"}
    <EmptyState
      icon={sectionOf("mcp").icon}
      line={mcpWords.emptyLine}
      title={mcpWords.emptyTitle}
    >
      {#snippet action()}
        <EmptyAsk
          {canStart}
          label={askLabel(FLEET_ASKS.mcp.what)}
          onask={nowhere}
          reason={NO_SESSION_CAN_START}
        >
          {#snippet byHand()}
            <Button label={mcpWords.add} variant="outline" />
          {/snippet}
        </EmptyAsk>
      {/snippet}
    </EmptyState>
  {:else if site === "memory-no-match"}
    <EmptyState
      icon={IconSearch}
      line={EMPTY_LINES.memoryNoMatch}
      title={memoryWords.noMatch(filter)}
    >
      {#snippet action()}
        <Button label="Remove the filter" variant="outline" />
      {/snippet}
    </EmptyState>
  {:else if site === "delegate-types"}
    <EmptyState
      icon={sectionOf("delegate-types").icon}
      line={delegateTypesWords.emptyLine}
      title={delegateTypesWords.emptyTitle}
    >
      {#snippet action()}
        <EmptyAsk
          {canStart}
          label={askLabel(FLEET_ASKS.delegateTypes.what)}
          onask={nowhere}
          reason={NO_SESSION_CAN_START}
        >
          {#snippet byHand()}
            <Button label={delegateTypesWords.add} variant="outline" />
          {/snippet}
        </EmptyAsk>
      {/snippet}
    </EmptyState>
  {:else if site === "cli-tools"}
    <EmptyState
      icon={IconTerminal}
      line={EMPTY_LINES.cliTools}
      title="Nothing to install"
    >
      {#snippet action()}
        <Button label="Open Updates" variant="outline" />
      {/snippet}
    </EmptyState>
  {:else if site === "session-blank"}
    <EmptyState
      pad="transcript"
      icon={IconChat}
      title="Nothing has been said here yet"
    >
      {#snippet action()}
        <EmptyAsk label={firstAskLabel(harness)} onask={nowhere} />
      {/snippet}
    </EmptyState>
  {:else if site === "transcript-empty"}
    <EmptyState
      icon={IconChat}
      line={EMPTY_LINES.transcript}
      title="No messages yet"
    >
      {#snippet action()}
        <EmptyAsk label={firstAskLabel(harness)} onask={nowhere} />
      {/snippet}
    </EmptyState>
  {:else if site === "routines-caw-away"}
    <EmptyState
      icon={IconClock}
      line={routinesWords.emptyWhat(project)}
      title={routinesWords.empty}
    >
      {#snippet action()}
        <CantStart byHand={createRoutine} reason={CAW_NO_MACHINE} />
      {/snippet}
    </EmptyState>
  {:else if site === "sources"}
    <EmptyState
      icon={IconHook}
      line={routinesWords.noSourcesLine}
      title={routinesWords.noSourcesTitle}
    >
      {#snippet action()}
        <EmptyAsk
          byHand={addMachine}
          {canStart}
          label={routinesWords.connectSource}
          onask={nowhere}
          reason={CAW_NO_MACHINE}
          size="sm"
        />
      {/snippet}
    </EmptyState>
  {:else if site === "view-missing"}
    <EmptyState
      icon={IconAlert}
      line="The project has no view called {view}."
      title="This view didn't open"
    >
      {#snippet action()}
        <Button
          href="/project/{encodeURIComponent(project)}?ask={encodeURIComponent(
            `Make a view called ${stageLabel(view)} for this project.`
          )}"
          label="Ask Caw for this view"
          variant="outline"
        />
      {/snippet}
    </EmptyState>
  {:else}
    <EmptyState
      icon={IconAlert}
      line="The hub didn't answer (502). Nothing was changed."
      title="This view didn't open"
    >
      {#snippet action()}
        <Button label="Retry" variant="outline" />
      {/snippet}
    </EmptyState>
  {/if}
</div>
