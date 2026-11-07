<script lang="ts">
  /**
   * Who a kind can go to, hung from the face of who answers it: every
   * member as a row (its face, its name, what it runs on), the one answering
   * now ticked, and on a project's page the fleet's choice marked, which
   * gives the kind back to the fleet. Picking hands the kind over for the
   * choices raised from now on. Under them, what else can be done to the
   * kind (rename it, give it back, remove it), where the card asks for it.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import type { Snippet } from "svelte";
  import { IconTick } from "#lib/icons.js";
  import MemberFace from "./MemberFace.svelte";

  let {
    kind,
    members,
    current,
    fleetChoice,
    runsOn,
    onpick,
    actions,
  }: {
    kind: Kind;
    members: Member[];
    /** Who answers it now. */
    current: string;
    /** The member the fleet names for this kind; null on the fleet's page. */
    fleetChoice: string | null;
    /** What a member runs on, in a few words; null for those that run on nothing. */
    runsOn: (member: Member) => string | null;
    onpick: (member: string) => void;
    /** What else can be done to the kind, under the members. */
    actions?: Snippet;
  } = $props();
</script>

<ul
  aria-label={decidesWords.handTo(kind.name)}
  class="m-0 flex list-none flex-col gap-px p-0"
>
  {#each members as member (member.id)}
    {@const runs = runsOn(member)}
    <li>
      <button
        aria-current={member.id === current || undefined}
        class="mark-line flex min-h-c-touch-floor w-full items-center gap-space-2 concentric-xs px-space-2 py-space-1 text-start transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
        onclick={() => onpick(member.id)}
        type="button"
      >
        <span class="flex" data-box><MemberFace {member} size={28} /></span>
        <span class="flex min-w-0 flex-auto flex-col" data-box>
          <span class="type-label text-ink-strong wrap-anywhere"
            >{member.name}</span
          >
          {#if member.id === fleetChoice || runs}
            <span class="type-meta text-ink-muted wrap-anywhere"
              >{member.id === fleetChoice
                ? decidesWords.fleetsChoice
                : runs}</span
            >
          {/if}
        </span>
        {#if member.id === current}
          <IconTick aria-hidden="true" class="size-icon-sm text-ink-strong" />
        {/if}
      </button>
    </li>
  {/each}
</ul>
{#if actions}
  <div
    class="mt-space-1 flex flex-col gap-px border-border-hairline border-t pt-space-1"
  >
    {@render actions()}
  </div>
{/if}
