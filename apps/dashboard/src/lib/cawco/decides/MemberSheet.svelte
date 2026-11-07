<script lang="ts">
  /**
   * A member's card, hung from its chip in the team row, or a new agent's
   * while it is added. Its face (a press opens its picture), its name, and
   * for an agent whether he is told of each answer; what it runs on as a
   * chip that unfolds where it is changed; its standing instructions as its
   * own words, pressed to edit; and its record: this month's figures and
   * the questions it was asked, each with its pick. Save and Cancel stand
   * only once something changed; an agent he added can be removed, asked in
   * the card.
   */
  import { BUILT_IN_MEMBERS, type Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import CawLeadSwitch from "#lib/cawco/project/CawLeadSwitch.svelte";
  import { folderFileHref } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconChevronDown, IconUndoLinear } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import type { WhoDecides } from "./decides.svelte";
  import { readRecord } from "./decides-client";
  import { showFirstProblem } from "./first-problem";
  import MemberFace from "./MemberFace.svelte";
  import MemberRecord from "./MemberRecord.svelte";
  import PicturePicker from "./PicturePicker.svelte";
  import RunsOnEditor from "./RunsOnEditor.svelte";
  import { NEW, type Setup } from "./setup.svelte";

  let {
    who,
    setup,
    project,
    now = Date.now(),
  }: {
    who: WhoDecides;
    setup: Setup;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** The moment ages count to, ms epoch. */
    now?: number;
  } = $props();

  let body = $state<HTMLElement | null>(null);

  const member = $derived(who.setupMember(setup));
  const draft = $derived(setup.draft);
  const adding = $derived(member === null);
  const problems = $derived(who.setupProblems(setup));
  const problemOf = (row: "does" | "runs" | "knows") =>
    setup.tried ? problems[row] : undefined;
  const isCaw = $derived(member?.type === "caw");
  /** An agent: it runs on a harness, reads standing instructions and may tell him each answer. */
  const isAgent = $derived(
    member === null ||
      member.type === "agent" ||
      member.type === "advisor" ||
      member.type === "practice"
  );
  /** Its settings can change here: the agents, and Caw on a project's page. */
  const settable = $derived(isAgent || (isCaw && who.projectId !== null));
  const pictured = $derived(member === null || member.type !== "asker");
  /** Its open part: what it runs on, or its instructions. */
  let editing = $state<"runs" | "knows" | null>(null);
  /** The skills it may use stand listed, under its instructions. */
  let skillsOpen = $state(false);
  const showRuns = $derived(editing === "runs");
  const showKnows = $derived(adding || editing === "knows");

  /** The member as its face draws it: a new one, or a hue picked, as the draft says. */
  const face = $derived.by((): Member => {
    if (member === null) {
      return {
        id: NEW,
        type: "agent",
        name: draft.name || decidesWords.addAgent,
        job: "",
        subject: draft.name,
        builtIn: false,
        hue: draft.hue,
        pose: null,
        hear: draft.hear,
        delegateType: null,
        reach: null,
      };
    }
    return member.type === "agent" ? { ...member, hue: draft.hue } : member;
  });
  const runsLine = $derived(
    draft.harness === null
      ? decidesWords.harnessLabel
      : decidesWords.runsOn(
          who.harnessName(draft.harness),
          who.modelName(draft.harness, draft.model),
          isCaw ? null : draft.effort
        )
  );
  const calls = $derived(member ? who.callsOfMember(member.id) : []);
  const removeAsked = $derived(who.asker.pending?.at === `remove:${setup.key}`);
  const footFault = $derived(
    setup.fault && setup.fault.row === null ? setup.fault.reason : null
  );
  const removable = $derived(
    member !== null &&
      !(BUILT_IN_MEMBERS as readonly string[]).includes(member.id)
  );

  $effect(() => {
    if (setup.shown > 0) {
      const row = setup.open;
      if (row === "runs" || row === "knows") {
        editing = row;
      }
      tick().then(() => showFirstProblem(body));
    }
  });

  async function open(part: "runs" | "knows") {
    editing = editing === part ? null : part;
    if (editing === "knows") {
      await tick();
      body?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    }
  }

  async function askRemove() {
    if (member === null) {
      return;
    }
    const gone = member;
    const record = await readRecord(gone.id).catch(() => null);
    who.asker.ask({
      at: `remove:${gone.id}`,
      title: decidesWords.removeAsk(gone.name),
      body: decidesWords.removeLine(
        who.kindsHeldAnywhere(gone.id),
        record?.waiting ?? 0
      ),
      cancelLabel: decidesWords.keep,
      confirmLabel: decidesWords.remove,
      pendingLabel: decidesWords.removing,
      run: () => who.removeMember(gone.id),
    });
  }
</script>

{#snippet problemLine(row: "does" | "runs" | "knows")}
  {@const problem = problemOf(row)}
  {#if problem}
    <p
      class="type-meta text-status-fail-ink text-pretty"
      data-problem
      role="alert"
      transition:unfold
    >
      {problem}
    </p>
  {/if}
{/snippet}

<div
  bind:this={body}
  class="flex max-h-(--pop-max-h) min-h-0 min-w-0 flex-col gap-space-3 overflow-y-auto overscroll-contain"
  data-setup={setup.key}
>
  <header class="flex min-w-0 items-center gap-space-3">
    {#if pictured}
      <button
        aria-expanded={setup.picking}
        aria-label={decidesWords.changePicture(face.name)}
        class="flex flex-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
        onclick={() => {
          setup.picking = !setup.picking;
        }}
        type="button"
      >
        <MemberFace member={face} size={48} />
      </button>
    {:else}
      <MemberFace member={face} size={48} />
    {/if}
    <div class="flex min-w-0 flex-auto flex-col items-start gap-space-1">
      {#if adding}
        <Input
          aria-invalid={problemOf("does") ? true : undefined}
          aria-label={decidesWords.nameLabel}
          autocomplete="off"
          placeholder={decidesWords.namePlaceholder}
          bind:value={setup.draft.name}
        />
      {:else}
        <h2 class="type-title text-balance text-ink-strong wrap-anywhere">
          {face.name}
        </h2>
      {/if}
      {#if settable}
        <button
          aria-expanded={showRuns}
          aria-label={decidesWords.changeRuns(face.name, runsLine)}
          class={[
            "mark-line inline-flex max-w-full items-center gap-space-1 rounded-sm border border-border-control bg-surface-raised px-space-2 py-px type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid",
            problemOf("runs") && "border-error-9",
          ]}
          onclick={() => open("runs")}
          type="button"
        >
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{runsLine}</span
          >
          <IconChevronDown
            aria-hidden="true"
            class="size-icon-sm flex-none text-ink-muted"
          />
        </button>
      {/if}
    </div>
  </header>
  {@render problemLine("does")}

  {#if setup.picking}
    <div transition:unfold>
      <PicturePicker
        member={face}
        onpicked={(picture) => who.pickPicture(picture)}
      />
    </div>
  {/if}

  {#if isCaw && who.lead && who.projectId !== null && project !== null}
    <div class="type-label text-ink-strong">
      <CawLeadSwitch
        lead={who.lead}
        projectId={who.projectId}
        projectName={project}
      />
    </div>
  {/if}

  {#if showRuns && settable}
    <div class="rounded-md bg-surface-recess p-space-3" transition:unfold>
      <RunsOnEditor
        caw={isCaw}
        draft={setup.draft}
        problem={problemOf("runs")}
        {who}
      />
    </div>
  {/if}

  {#if isAgent}
    {#if showKnows}
      <div class="flex min-w-0 flex-col gap-space-2" transition:unfold>
        <Textarea
          aria-invalid={problemOf("knows") ? true : undefined}
          aria-label={decidesWords.instructionsLabel}
          placeholder={decidesWords.instructionsPlaceholder}
          bind:value={setup.draft.instructions}
        />
        {@render problemLine("knows")}
        {#if who.skills.length > 0}
          <button
            aria-expanded={skillsOpen}
            class="mark-line flex w-fit items-center gap-space-1 rounded-xs type-label text-ink-muted can-hover:hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
            onclick={() => {
              skillsOpen = !skillsOpen;
            }}
            type="button"
          >
            <span
              >{draft.skills.length === 0
                ? decidesWords.skillsLabel
                : decidesWords.skillsPicked(draft.skills.length)}</span
            >
            <IconChevronDown
              aria-hidden="true"
              class={[
                "size-icon-sm transition-transform",
                skillsOpen && "rotate-180",
              ]}
            />
          </button>
        {/if}
        {#if who.skills.length > 0 && skillsOpen}
          <ul
            aria-label={decidesWords.skillsLabel}
            class="m-0 flex max-h-64 list-none flex-col overflow-y-auto overscroll-contain p-0"
          >
            {#each who.skills as skill (skill.id)}
              <li>
                <label
                  class="flex min-h-c-touch-floor items-start gap-space-2 py-space-1"
                >
                  <Checkbox
                    bind:checked={
                      () => draft.skills.includes(skill.id),
                      (on) => {
                        setup.draft.skills = on
                          ? [...draft.skills, skill.id]
                          : draft.skills.filter((one) => one !== skill.id);
                      }
                    }
                  />
                  <span class="flex min-w-0 flex-col">
                    <span
                      class="type-label font-mono text-ink-strong wrap-anywhere"
                      >{skill.id}</span
                    >
                    {#if skill.note}
                      <span
                        class="line-clamp-2 type-meta text-ink-muted text-pretty wrap-anywhere"
                        >{skill.note}</span
                      >
                    {/if}
                  </span>
                </label>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <button
        aria-label={decidesWords.changeInstructions(face.name)}
        class="flex min-w-0 flex-col gap-space-2 rounded-md bg-surface-recess px-space-3 py-space-2 text-start transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
        onclick={() => open("knows")}
        type="button"
      >
        <span class="line-clamp-3 type-body text-pretty text-ink-strong"
          >{draft.instructions}</span
        >
        {#if draft.skills.length > 0}
          <span class="flex flex-wrap gap-space-1">
            {#each draft.skills as skill (skill)}
              <span
                class="rounded-xs bg-surface-raised px-space-1 type-meta font-mono text-ink-muted"
                >{skill}</span
              >
            {/each}
          </span>
        {/if}
      </button>
    {/if}
  {:else if isCaw}
    <p class="flex min-w-0 flex-wrap gap-x-space-3 gap-y-space-1 type-label">
      {#if who.projectId !== null && project !== null}
        <a
          class="rounded-xs text-link-ink underline-offset-2 wrap-anywhere can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
          href={folderFileHref(who.projectId, "AGENTS.md")}>AGENTS.md</a
        >
      {/if}
      <a
        class="rounded-xs text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
        href="/config/skills">{decidesWords.skillsLabel}</a
      >
    </p>
  {/if}

  {#if isAgent && member?.hear !== null}
    <label
      class="mark-line flex min-h-c-touch-floor items-center justify-between gap-space-3 type-label text-ink-strong"
    >
      <span>{decidesWords.hears.each.name}</span>
      <Switch
        data-box
        bind:checked={
          () => draft.hear === "each",
          (on) => {
            setup.draft.hear = on ? "each" : "later";
          }
        }
      />
    </label>
  {/if}

  {#if member && !adding}
    <section
      aria-label={decidesWords.recordLabel(member.name)}
      class="flex min-w-0 flex-col gap-space-2 border-border-hairline border-t pt-space-3"
    >
      {#if who.record?.member === member.id}
        <MemberRecord
          {now}
          onretry={() => who.readRecord(member.id)}
          projectId={who.projectId}
          read={who.record.read}
        />
      {/if}
      {#if calls.length > 0}
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          {#each calls as call (`${call.artifactId}#${call.card}`)}
            <li class="flex min-w-0 flex-col gap-px">
              <p class="line-clamp-2 type-body text-pretty text-ink-strong">
                {call.question}
              </p>
              <p
                class="mark-line flex min-w-0 items-center gap-space-1 type-meta text-ink-muted"
              >
                {#if call.takenBack}
                  <IconUndoLinear
                    aria-hidden="true"
                    class="size-icon-sm flex-none text-status-attn-glyph"
                  />
                  <span class="flex-none text-status-attn-ink"
                    >{decidesWords.pickedAgain}</span
                  >
                  <span aria-hidden="true">·</span>
                {/if}
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >{call.picked.length === 0
                    ? decidesWords.waiting
                    : call.picked.join(", ")}</span
                >
                <span aria-hidden="true">·</span>
                <span class="flex-none tabular-nums"
                  >{formatAgeShort(Date.parse(call.at), now)}</span
                >
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if footFault}
    <p class="type-meta text-status-fail-ink text-pretty" role="alert">
      {footFault}
    </p>
  {/if}

  {#if adding || setup.changed || removable}
    <footer
      class="sticky bottom-0 -mx-c-floating-pad -mb-c-floating-pad flex min-w-0 flex-wrap items-center gap-space-2 border-border-hairline border-t bg-surface-raised px-c-floating-pad py-space-2"
    >
      {#if removable && !adding}
        <Button
          disabled={removeAsked}
          onclick={askRemove}
          size="sm"
          variant="ghost"><span>{decidesWords.remove}</span></Button
        >
      {/if}
      {#if adding || setup.changed}
        <span class="ms-auto flex gap-space-2">
          <Button onclick={() => who.cancelSetup()} size="sm" variant="ghost"
            ><span>{decidesWords.cancel}</span></Button
          >
          <Button
            onclick={() => who.saveSetup()}
            pending={setup.saving}
            pendingLabel={adding
              ? decidesWords.addingMember
              : decidesWords.saving}
            size="sm"
            variant="default"
            ><span>{adding ? decidesWords.addAgentAct : decidesWords.save}</span
            ></Button
          >
        </span>
      {/if}
    </footer>
  {/if}
  <AskHere asker={who.asker} at="remove:{setup.key}" />
</div>
