<script lang="ts" module>
  /** The empty states The Empty Starts Work Rule gave an action, by where they stand. */
  export type EmptySite =
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
   * rule covers, drawn with the real EmptyState and EmptyAsk and the words
   * its own surface uses, so each can be judged without its page's live
   * store. A press here goes nowhere; on its surface it puts the words
   * where they go (empty-asks.ts).
   */
  import {
    delegateTypesWords,
    mcpWords,
    memoryWords,
    routinesWords,
  } from "@cawco/core";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import EmptyAsk from "#lib/cawco/EmptyAsk.svelte";
  import {
    askLabel,
    FLEET_ASKS,
    firstAskLabel,
    NO_SESSION_CAN_START,
  } from "#lib/cawco/empty-asks.js";
  import { CAW_NO_MACHINE } from "#lib/cawco/project/caw-lead.svelte.js";
  import { stageLabel } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconAlert,
    IconChat,
    IconClock,
    IconHook,
    IconPlus,
    IconSearch,
    IconServer,
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
  <Button aria-haspopup="dialog" variant="outline">
    <IconServer />
    <span>Add machine</span>
  </Button>
{/snippet}

<div class="w-full min-w-0" data-empty-site={site}>
  {#if site === "hooks"}
    <EmptyState
      icon={sectionOf("hooks").icon}
      line="Start from one of these — they are ordinary hooks once added, and you can change every part of them."
      title="Nothing runs yet"
    >
      {#snippet action()}
        <EmptyAsk
          {canStart}
          label={askLabel(FLEET_ASKS.hooks.what)}
          onask={nowhere}
          reason={NO_SESSION_CAN_START}
        />
      {/snippet}
    </EmptyState>
  {:else if site === "rules"}
    <EmptyState
      icon={sectionOf("rules").icon}
      line="Start from one of these — they are ordinary rules once added, and you can change every part of them."
      title="Nothing is watching yet"
    >
      {#snippet action()}
        <EmptyAsk
          {canStart}
          label={askLabel(FLEET_ASKS.rules.what)}
          onask={nowhere}
          reason={NO_SESSION_CAN_START}
        />
      {/snippet}
    </EmptyState>
  {:else if site === "rules-waiting"}
    <EmptyState
      icon={sectionOf("rules").icon}
      line="Every session that was told something has answered for it."
      title="No rule is waiting on an answer"
    >
      {#snippet action()}
        <Button variant="outline">Remove the filter</Button>
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
            <Button variant="outline">
              <IconPlus />
              <span>{mcpWords.add}</span>
            </Button>
          {/snippet}
        </EmptyAsk>
      {/snippet}
    </EmptyState>
  {:else if site === "memory-no-match"}
    <EmptyState
      icon={IconSearch}
      line="Try fewer letters, or clear the filter."
      title={memoryWords.noMatch(filter)}
    >
      {#snippet action()}
        <Button variant="outline">Remove the filter</Button>
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
            <Button variant="outline">
              <IconPlus />
              <span>{delegateTypesWords.add}</span>
            </Button>
          {/snippet}
        </EmptyAsk>
      {/snippet}
    </EmptyState>
  {:else if site === "cli-tools"}
    <EmptyState
      icon={IconTerminal}
      line="This hub's build carries no tools to install. They ship with CawCo, so updating the hub brings them."
      title="Nothing to install"
    >
      {#snippet action()}
        <Button variant="outline">Open Updates</Button>
      {/snippet}
    </EmptyState>
  {:else if site === "session-blank"}
    <EmptyState
      pad="transcript"
      icon={IconChat}
      line="Write the first message below."
      title="Nothing has been said here yet"
    >
      {#snippet action()}
        <EmptyAsk label={firstAskLabel(harness)} onask={nowhere} />
      {/snippet}
    </EmptyState>
  {:else if site === "transcript-empty"}
    <EmptyState
      icon={IconChat}
      line="Send the first instruction below — / lists this session's commands, @ names a machine or session."
      title="No messages yet"
    >
      {#snippet action()}
        <EmptyAsk label={firstAskLabel(harness)} onask={nowhere} />
      {/snippet}
    </EmptyState>
  {:else if site === "routines-caw-away"}
    <EmptyState
      action={addMachine}
      icon={IconClock}
      line={routinesWords.emptyOff(CAW_NO_MACHINE)}
      title={routinesWords.empty}
    />
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
          variant="outline">Ask Caw for this view</Button
        >
      {/snippet}
    </EmptyState>
  {:else}
    <EmptyState
      icon={IconAlert}
      line="The hub didn't answer (502). Nothing was changed."
      title="This view didn't open"
    >
      {#snippet action()}
        <Button variant="outline">Retry</Button>
      {/snippet}
    </EmptyState>
  {/if}
</div>
