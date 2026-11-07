<script lang="ts">
  /**
   * One kind of choice: its glyph and name leading, the face of who answers
   * it trailing, and under them the latest questions agents asked of it,
   * each with its pick, or Waiting on you where it waits on him. The face
   * is the press that hands the kind over, its list hung from it; nothing
   * on the page moves, and once the hub has written it the face changes in
   * place. Under the members the same list renames the kind, removes one
   * he added (asked in the card), and on a project's page gives a kind the
   * project set back to the fleet's choice, which the folder beside its
   * name marks.
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
  import FaceChip from "./FaceChip.svelte";
  import HandOver from "./HandOver.svelte";
  import Hung from "./Hung.svelte";
  import { kindGlyph } from "./kind-glyph";

  let {
    who,
    kind,
    project,
    named,
    waitingHref,
  }: {
    who: WhoDecides;
    kind: Kind;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** The projects' names, by their ids. */
    named: (projects: string[]) => string[];
    /** Where a question waiting on him is answered, by its project. */
    waitingHref: (projectId: string | null) => string;
  } = $props();

  let card = $state<HTMLElement | null>(null);
  let chip = $state<HTMLElement | null>(null);

  const Glyph = $derived(kindGlyph(kind.id));
  const holder = $derived(who.member(who.routes[kind.id]));
  const own = $derived(project !== null && who.isOwn(kind.id));
  const asking = $derived(
    who.asking?.kinds.includes(kind.id) ? who.asking.said : null
  );
  const fault = $derived(who.fault?.kinds.includes(kind.id) ? who.fault : null);
  const calls = $derived(who.callsOfKind(kind.id));
  const rename = $derived(
    who.kindRename?.id === kind.id ? who.kindRename : null
  );
  const renameProblems = $derived(rename ? who.renameProblems(rename) : {});
  const kindFault = $derived(
    who.kindFault?.kind === kind.id ? who.kindFault : null
  );
  const others = $derived(who.kinds.filter((one) => one.id !== kind.id));
  const handing = $derived(who.handing === kind.id);

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
</script>

{#snippet action(label: string, run: () => unknown)}
  <button
    class="flex min-h-c-touch-floor w-full items-center concentric-xs px-space-2 py-space-1 text-start type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
    onclick={() => {
      who.handing = null;
      run();
    }}
    type="button">{label}</button
  >
{/snippet}

<article
  aria-labelledby="kind-{kind.id}"
  bind:this={card}
  class="flex min-w-0 flex-col gap-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile"
  data-kind={kind.id}
>
  <div class="mark-line flex min-w-0 items-start gap-space-2">
    <span class="grid h-c-btn-h-sm flex-none place-items-center" data-box>
      <Glyph aria-hidden="true" class="size-icon-md text-ink-muted" />
    </span>
    {#if rename}
      <form
        class="flex min-w-0 flex-auto flex-col gap-space-2"
        data-box
        data-rename
        onsubmit={(event) => {
          event.preventDefault();
          who.doneRename();
        }}
      >
        <Input
          aria-invalid={renameProblems.name ? true : undefined}
          aria-label={decidesWords.rename(kind.name)}
          autocomplete="off"
          onkeydown={putBack}
          bind:value={rename.name}
        />
        <Input
          aria-invalid={renameProblems.example ? true : undefined}
          aria-label={decidesWords.kindSteps.example}
          autocomplete="off"
          onkeydown={putBack}
          placeholder={decidesWords.kindExamplePlaceholder}
          bind:value={rename.example}
        />
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
      <h2
        class="flex min-h-c-btn-h-sm min-w-0 flex-auto items-center gap-space-1 type-body font-medium text-ink-strong text-balance wrap-anywhere"
        data-box
        id="kind-{kind.id}"
      >
        <span>{kind.name}</span>
        {#if own}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span
                  {...props}
                  aria-label={decidesWords.ownTip(
                    project ?? "",
                    who.fleetHolder(kind.id)?.subject ?? ""
                  )}
                  class="flex text-ink-muted"
                  role="img"
                  ><IconFolder aria-hidden="true" class="size-icon-sm" /></span
                >
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content
              >{decidesWords.ownTip(
                project ?? "",
                who.fleetHolder(kind.id)?.subject ?? ""
              )}</Tooltip.Content
            >
          </Tooltip.Root>
        {/if}
      </h2>
      {#if holder}
        <span
          class="flex max-w-3/5 min-w-0 flex-none items-center gap-space-1"
          data-box
        >
          {#if asking}
            <span class="flex" aria-hidden="true"><LiveDot /></span>
            <span class="sr-only" role="status">{asking}</span>
          {/if}
          <Hung
            anchor={chip}
            align="end"
            label={decidesWords.handTo(kind.name)}
            onopen={(open) => {
              if (open && who.asking !== null) {
                return;
              }
              who.handing = open ? kind.id : null;
            }}
            open={handing}
            width="var(--c-pop-w)"
          >
            {#snippet trigger(props)}
              <FaceChip
                {...props}
                aria-label={decidesWords.answeredBy(kind.name, holder.name)}
                bind:ref={chip}
                change
                member={holder}
                pressed={handing}
              />
            {/snippet}
            <HandOver
              current={holder.id}
              fleetChoice={project === null ? null : who.fleetRoutes[kind.id]}
              {kind}
              members={who.members}
              onpick={pick}
              {runsOn}
            >
              {#snippet actions()}
                {@render action(decidesWords.renameItem, startRename)}
                {#if own}
                  {@render action(decidesWords.giveBack, () =>
                    who.useFleet([kind.id])
                  )}
                {/if}
                {#if !kind.builtIn}
                  {@render action(decidesWords.removeItem, () =>
                    who.askRemoveKind(kind.id, named)
                  )}
                {/if}
              {/snippet}
            </HandOver>
          </Hung>
        </span>
      {/if}
    {/if}
  </div>

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
    {#if calls.length === 0}
      <p class="type-meta text-ink-muted">{decidesWords.noQuestionsYet}</p>
    {:else}
      <ul class="m-0 flex list-none flex-col gap-space-3 p-0">
        {#each calls as call (`${call.artifactId}#${call.card}`)}
          <li class="flex min-w-0 flex-col gap-px">
            <p class="line-clamp-2 type-body text-pretty text-ink-strong">
              {call.question}
            </p>
            {#if call.picked.length === 0}
              <a
                class="w-fit rounded-xs type-meta text-status-attn-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
                href={waitingHref(call.projectId)}
                >{decidesWords.waitingOnYou}</a
              >
            {:else}
              <p
                class="overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
              >
                {call.picked.join(", ")}
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
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
