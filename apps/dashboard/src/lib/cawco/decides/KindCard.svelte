<script lang="ts">
  /**
   * One kind of choice: its glyph and name leading, the face of who answers
   * it trailing, and under them the latest questions agents asked of it,
   * each with its pick after the face of who made it, Waiting on you where
   * it waits on him, or who is deciding it. A kind no agent has asked of
   * yet shows what it would be asked, muted, each with who it would go to.
   * The face is the press that hands the kind over, its list hung from it;
   * nothing on the page moves, and once the hub has written it the face
   * changes in place. Under the members the same list renames the kind,
   * removes one he added (asked in the card), and on a project's page gives
   * a kind the project set back to the fleet's choice, which the folder
   * after its name marks. When its member can't run, the card says so with
   * the way to that member's card.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconFolder } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import type { RecentCall } from "./decides-client";
  import FaceChip from "./FaceChip.svelte";
  import { kindGlyph } from "./kind-glyph";
  import MemberFace from "./MemberFace.svelte";
  import WhoPicker, { type PickerAction } from "./WhoPicker.svelte";

  let {
    who,
    kind,
    project,
    named,
    waitingHref,
    facts,
  }: {
    who: WhoDecides;
    kind: Kind;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** The projects' names, by their ids. */
    named: (projects: string[]) => string[];
    /** Where a question waiting on him is answered, by its project. */
    waitingHref: (projectId: string | null) => string;
    /** Why a member can't be reached now; null when it can. */
    facts: (id: string) => string | null;
  } = $props();

  const uid = $props.id();
  let card = $state<HTMLElement | null>(null);
  let chip = $state<HTMLElement | null>(null);

  const Glyph = $derived(kindGlyph(kind.id));
  const holder = $derived(who.member(who.routes[kind.id]));
  const blocked = $derived(holder ? facts(holder.id) : null);
  const own = $derived(project !== null && who.isOwn(kind.id));
  const asking = $derived(
    who.asking?.kinds.includes(kind.id) ? who.asking.said : null
  );
  const fault = $derived(who.fault?.kinds.includes(kind.id) ? who.fault : null);
  const calls = $derived(who.callsOfKind(kind.id));
  const samples = $derived(
    kind.builtIn
      ? (decidesWords.kindSamples[kind.id] ?? [])
      : [kind.example.charAt(0).toUpperCase() + kind.example.slice(1)]
  );
  const rename = $derived(
    who.kindRename?.id === kind.id ? who.kindRename : null
  );
  const renameProblems = $derived(rename ? who.renameProblems(rename) : {});
  const kindFault = $derived(
    who.kindFault?.kind === kind.id ? who.kindFault : null
  );
  const others = $derived(who.kinds.filter((one) => one.id !== kind.id));
  const handing = $derived(who.handing === kind.id);
  const waiting = $derived(holder ? who.waitingOn(kind.id, holder.id) : 0);
  /** What else is done to the kind, under the members in its picker. */
  const pickerActions = $derived<PickerAction[]>([
    { label: decidesWords.renameItem, run: startRename },
    ...(own
      ? [{ label: decidesWords.giveBack, run: () => who.useFleet([kind.id]) }]
      : []),
    ...(kind.builtIn
      ? []
      : [
          {
            label: decidesWords.removeItem,
            run: () => who.askRemoveKind(kind.id, named),
          },
        ]),
  ]);
  const ownTip = $derived(
    decidesWords.ownTip(project ?? "", who.fleetHolder(kind.id)?.subject ?? "")
  );

  const pick = async (to: string) => {
    who.handing = null;
    chip?.focus({ preventScroll: true });
    if (to === holder?.id) {
      return;
    }
    if (project !== null && to === who.fleetRoutes[kind.id]) {
      await who.useFleet([kind.id]);
      return;
    }
    await who.handTo(kind.id, to);
  };

  async function startRename() {
    who.startRename(kind.id);
    await tick();
    card?.querySelector<HTMLInputElement>("[data-rename] input")?.focus();
  }

  function putBack(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      who.kindRename = null;
    }
  }

  const runsOn = (member: Member): string | null =>
    member.type === "caw" ? null : (who.facts(member, undefined)?.text ?? null);

  /** Who made a question's pick: him where he picked again, else its member. */
  const pickerOf = (call: RecentCall): Member | undefined =>
    who.member(call.takenBack ? "you" : call.member);
</script>

{#snippet byLine(member: Member | undefined, words: string, attention = false)}
  <p
    class={[
      "mark-line flex min-w-0 items-center gap-space-1 type-meta",
      attention ? "text-status-attn-ink" : "text-ink-muted",
    ]}
  >
    {#if member}
      <span class="flex" data-box><MemberFace {member} size={18} /></span>
    {/if}
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{words}</span
    >
  </p>
{/snippet}

<article
  aria-labelledby="{uid}-name"
  bind:this={card}
  class="flex min-w-0 flex-col gap-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile"
  data-kind={kind.id}
>
  {#if rename}
    <form
      class="flex min-w-0 flex-col gap-space-2"
      data-rename
      onsubmit={(event) => {
        event.preventDefault();
        who.doneRename();
      }}
    >
      <label class="flex min-w-0 flex-col gap-space-1">
        <span class="type-label text-ink-muted">{decidesWords.nameLabel}</span>
        <Input
          aria-invalid={renameProblems.name ? true : undefined}
          autocomplete="off"
          onkeydown={putBack}
          bind:value={rename.name}
        />
      </label>
      <label class="flex min-w-0 flex-col gap-space-1">
        <span class="type-label text-ink-muted"
          >{decidesWords.examplesLabel}</span
        >
        <Input
          aria-invalid={renameProblems.example ? true : undefined}
          autocomplete="off"
          onkeydown={putBack}
          bind:value={rename.example}
        />
      </label>
      {#if renameProblems.name || renameProblems.example}
        <p class="type-meta text-status-fail-ink text-pretty" role="alert">
          {renameProblems.name ?? renameProblems.example}
        </p>
      {/if}
      <div class="flex justify-end gap-space-2">
        <Button
          onclick={() => {
            who.kindRename = null;
          }}
          size="sm"
          variant="ghost"><span>{decidesWords.cancel}</span></Button
        >
        <Button
          pending={rename.saving}
          pendingLabel={decidesWords.renaming}
          size="sm"
          type="submit"
          variant="default"><span>{decidesWords.renameDone}</span></Button
        >
      </div>
    </form>
  {:else}
    <div class="mark-line flex min-w-0 items-center gap-space-2">
      <Glyph
        aria-hidden="true"
        class="size-icon-md flex-none self-center text-ink-muted"
      />
      <h2
        class="min-w-0 flex-auto type-body font-medium text-ink-strong text-balance wrap-anywhere"
        id="{uid}-name"
      >
        {kind.name}{#if own}<Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span
                  {...props}
                  aria-label={ownTip}
                  class="ms-space-1 inline-block align-middle text-ink-muted"
                  role="img"
                  ><IconFolder aria-hidden="true" class="size-icon-sm" /></span
                >
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{ownTip}</Tooltip.Content>
          </Tooltip.Root>{/if}
      </h2>
      {#if holder}
        <span
          class="flex max-w-1/2 min-w-0 flex-none items-center gap-space-1"
          data-box
        >
          {#if asking}
            <span class="flex" aria-hidden="true"><LiveDot /></span>
            <span class="sr-only" role="status">{asking}</span>
          {/if}
          <WhoPicker
            actions={pickerActions}
            anchor={chip}
            current={holder.id}
            fleetChoice={project === null ? null : who.fleetRoutes[kind.id]}
            {kind}
            members={who.members}
            note={waiting > 0
              ? decidesWords.waitingStay(
                  waiting,
                  holder.id === "you" ? holder.subject : holder.name
                )
              : null}
            onopen={(open) => {
              if (open && who.asking !== null) {
                return;
              }
              who.handing = open ? kind.id : null;
            }}
            onpick={pick}
            open={handing}
            {runsOn}
          >
            {#snippet trigger(props)}
              <FaceChip
                {...props}
                aria-label={decidesWords.answeredBy(kind.name, holder.name)}
                attention={blocked !== null}
                bind:ref={chip}
                change
                member={holder}
                pressed={handing}
              />
            {/snippet}
          </WhoPicker>
        </span>
      {/if}
    </div>
  {/if}

  {#if blocked && holder}
    <div
      class="flex min-w-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-meta"
    >
      <p class="min-w-0 text-status-attn-ink text-pretty">{blocked}.</p>
      <button
        class="rounded-xs text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
        onclick={() => who.openSetup(holder.id)}
        type="button">{decidesWords.fixMember(holder.name)}</button
      >
    </div>
  {/if}

  <RowFault again={fault?.again} reason={fault?.reason} />
  <RowFault again={kindFault?.again} reason={kindFault?.reason} />

  {#if who.recent.state === "reading"}
    <div class="flex flex-col gap-space-3" aria-hidden="true">
      {#each [0, 1] as at (at)}
        <div class="flex flex-col gap-space-1">
          <Skeleton line="body" radius="text" width="title" />
          <Skeleton line="meta" radius="text" width="name" />
        </div>
      {/each}
    </div>
  {:else if who.recent.state === "read"}
    <ul class="m-0 flex list-none flex-col gap-space-3 p-0">
      {#if calls.length === 0}
        {#each samples as sample (sample)}
          <li class="flex min-w-0 flex-col gap-px">
            <p class="line-clamp-2 type-body text-pretty text-ink-muted">
              {sample}
            </p>
            {@render byLine(
              holder,
              decidesWords.wouldGo(
                !holder || holder.id === "you" ? null : holder.name
              )
            )}
          </li>
        {/each}
      {:else}
        {#each calls as call (`${call.artifactId}#${call.card}`)}
          {@const picker = pickerOf(call)}
          {@const asked = who.member(call.member)}
          <li class="flex min-w-0 flex-col gap-px">
            <p class="line-clamp-2 type-body text-pretty text-ink-strong">
              {call.question}
            </p>
            {#if call.picked.length > 0}
              <span class="sr-only"
                >{decidesWords.pickedBy(picker?.name ?? "")}</span
              >
              {@render byLine(picker, call.picked.join(", "))}
            {:else if call.member === "you"}
              <a
                class="w-fit rounded-xs type-meta text-status-attn-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
                href={waitingHref(call.projectId)}
                >{decidesWords.waitingOnYou}</a
              >
            {:else}
              {@render byLine(
                asked,
                decidesWords.deciding(asked?.name ?? call.member)
              )}
            {/if}
          </li>
        {/each}
      {/if}
    </ul>
  {/if}

  <AskHere asker={who.asker} at="remove-kind:{kind.id}">
    <OptionGroup
      aria-label={decidesWords.moveToLabel}
      layout="list"
      bind:value={
        () => (who.moveTo === null ? [] : [who.moveTo]),
        (next) => {
          who.moveTo = next[0] ?? null;
        }
      }
    >
      {#each others as other (other.id)}
        {@const Mark = kindGlyph(other.id)}
        <OptionGroupItem value={other.id}>
          <span class="mark-line flex min-w-0 items-center gap-x-space-2">
            <Mark aria-hidden="true" class="size-icon-sm flex-none" />
            <span class="min-w-0 wrap-anywhere">{other.name}</span>
          </span>
        </OptionGroupItem>
      {/each}
    </OptionGroup>
  </AskHere>
</article>
