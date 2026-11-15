<script lang="ts">
  /**
   * A member's settings, and Add a member (build spec §3.4), in the popover
   * hung from the card that opened it: nothing on the page moves or is held.
   *
   * The head: the member's face (a press opens its picture picker under the
   * head), its name, the line saying what it is, and ×. Then its rows, by
   * who it is: an agent's What it does → Runs on → Knows → Decides → How you
   * hear → Record; Common practice's Runs on, How you hear and Record;
   * Caw's What he does → Leads this project → Runs on → Knows → Decides →
   * Record (MemberRecord, read as the settings open). A member's rows stand
   * folded, each with Change; Add a member asks which kind first (an agent;
   * a person and a channel wait on a connection), then unfolds one step at a
   * time, Continue folding each into its summary.
   *
   * The foot: changes apply from now on, the count of what needs fixing once
   * Save was pressed, Cancel (the one discard) and Save, or Continue then
   * Add member in one cell (The Steady Swap Rule). An agent opens in
   * Delegate types from under it; one he added can be removed, which asks in
   * the settings' flow first.
   */
  import { BUILT_IN_MEMBERS, type Member } from "@cawco/core/decides";
  import { HARNESSES, type HarnessKind } from "@cawco/core/harness/kinds";
  import { unhandled } from "@cawco/core/unhandled";
  import { decidesWords } from "@cawco/core/words/decides";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { EFFORT_OPTIONS } from "#lib/cawco/effort-levels.js";
  import CawLeadSwitch from "#lib/cawco/project/CawLeadSwitch.svelte";
  import { folderFileHref } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
    OptionTiles,
  } from "#lib/components/ui/option-group/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconClose, IconFolder, IconGlobe, IconPen } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { WhoDecides } from "./decides.svelte";
  import { readRecord } from "./decides-client";
  import { showFirstProblem } from "./first-problem";
  import { kindGlyph } from "./kind-glyph";
  import MemberFace from "./MemberFace.svelte";
  import MemberRecord from "./MemberRecord.svelte";
  import PicturePicker from "./PicturePicker.svelte";
  import SetupRow from "./SetupRow.svelte";
  import { NEW, type RowId, readOnly, type Setup } from "./setup.svelte";

  let {
    who,
    setup,
    project,
    headId,
  }: {
    who: WhoDecides;
    setup: Setup;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** The head's id, which names the popover. */
    headId: string;
  } = $props();

  const uid = $props.id();
  let body = $state<HTMLElement | null>(null);

  const member = $derived(who.setupMember(setup));
  const draft = $derived(setup.draft);
  const rows = $derived(who.rowsOf(setup));
  const problems = $derived(who.setupProblems(setup));

  /** Rows on screen: every row, or while adding the steps reached so far. */
  const shown = $derived.by(() => {
    if (member !== null) {
      return rows;
    }
    return setup.adding === null ? [] : rows.slice(0, setup.reached + 1);
  });
  const adding = $derived(member === null);
  /** What needs fixing in the rows on screen: a step not reached yet counts for nothing. */
  const count = $derived(shown.filter((row) => problems[row]).length);
  const isAgent = $derived(
    member === null ||
      member.type === "agent" ||
      member.type === "advisor" ||
      member.type === "practice"
  );
  const isCaw = $derived(member?.type === "caw");

  /** The member as its face draws it: a new one, or a hue picked, as the draft says. */
  const face = $derived.by((): Member => {
    if (member === null) {
      return {
        id: NEW,
        type: "agent",
        name: draft.name || decidesWords.memberTypes.agent.name,
        job: draft.job,
        subject: draft.name,
        builtIn: false,
        hue: draft.hue,
        pose: null,
        hear: draft.hear,
        delegateType: null,
      };
    }
    return member.type === "agent" ? { ...member, hue: draft.hue } : member;
  });
  const name = $derived(
    member?.name ?? (setup.adding === null ? decidesWords.addMember : face.name)
  );
  const line = $derived.by(() => {
    const type = member?.type ?? "agent";
    switch (type) {
      case "agent":
        return decidesWords.headAgent;
      case "practice":
        return decidesWords.headPractice;
      case "caw":
        return project === null
          ? decidesWords.headCawFleet
          : decidesWords.headLead(project);
      case "person":
      case "channel":
        return decidesWords.memberTypes.person.note;
      case "advisor":
      case "asker":
      case "you":
        return decidesWords.headBuiltIn;
      default:
        return unhandled("member type", type);
    }
  });
  /** Its picture can change: Caw's flock and the agents he adds. */
  const pictured = $derived(
    member === null ? setup.adding !== null : member.type !== "asker"
  );

  const rowLabel = (row: RowId): string =>
    row === "does" && isCaw
      ? decidesWords.rows.doesCaw
      : decidesWords.rows[row];

  const offer = (id: HarnessKind | null) =>
    who.harnesses.find((one) => one.id === id);

  const harnessTiles = $derived(
    HARNESSES.map((id) => {
      const machines = offer(id)?.machines ?? [];
      return {
        id,
        name: who.harnessName(id),
        note:
          machines.length > 0
            ? decidesWords.harnessOn(machines)
            : decidesWords.notOnMachine,
        disabled: machines.length === 0 && draft.harness !== id,
      };
    })
  );
  const models = $derived.by(() => {
    const listed = offer(draft.harness)?.models ?? [];
    const own =
      draft.model !== null && !listed.some((one) => one.id === draft.model)
        ? [
            {
              id: draft.model,
              name: who.modelName(draft.harness ?? "claude", draft.model),
              default: false,
            },
          ]
        : [];
    return [...own, ...listed];
  });
  /** The model the draft runs: its own, else its harness's default. */
  const modelChosen = $derived(
    draft.model ?? models.find((one) => one.default)?.id ?? null
  );
  const effort = $derived(
    EFFORT_OPTIONS.find((one) => one.value === draft.effort)
  );

  /** A folded row's value, in a line. */
  const summary = (row: RowId): string => {
    switch (row) {
      case "does":
        return adding
          ? [draft.name, draft.job].filter(Boolean).join(" · ")
          : draft.job;
      case "lead":
      case "record":
        return "";
      case "runs":
        return draft.harness === null
          ? ""
          : decidesWords.runsOn(
              who.harnessName(draft.harness),
              who.modelName(draft.harness, draft.model),
              isCaw ? null : draft.effort
            );
      case "knows":
        return decidesWords.knowsLine(
          draft.skills.length,
          draft.instructions.split("\n")[0]?.trim() ?? ""
        );
      case "decides": {
        const names = who.kinds
          .filter((kind) => draft.kinds.includes(kind.id))
          .map((kind) => kind.name);
        return names.length > 0
          ? decidesWords.kindsList(names)
          : decidesWords.decidesNothing;
      }
      case "hear":
        return decidesWords.hears[draft.hear].name;
      default:
        return "";
    }
  };

  /** The problem a row shows, once Save or Continue was pressed. */
  const problemOf = (row: RowId): string | undefined =>
    setup.tried ? problems[row] : undefined;

  /** A foot fault no field holds. */
  const footFault = $derived(
    setup.fault && setup.fault.row === null ? setup.fault.reason : null
  );
  /** A removal stands asked: its Remove member is the view's one coral act. */
  const removeAsked = $derived(who.asker.pending?.at === `remove:${setup.key}`);

  // The first problem in view once Save or Continue found it, its field in hand.
  $effect(() => {
    if (setup.shown > 0) {
      showFirstProblem(body);
    }
  });

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

  const press = () => (adding ? who.next() : who.saveSetup());
  const last = $derived(who.lastStep(setup));
</script>

{#snippet problemLine(row: RowId)}
  {@const problem = problemOf(row)}
  {#if problem}
    <p
      class="m-0 type-meta text-status-fail-ink text-pretty"
      data-problem
      role="alert"
      transition:unfold
    >
      {problem}
    </p>
  {/if}
{/snippet}

{#snippet does()}
  {#if adding}
    <div class="flex min-w-0 flex-col gap-space-2">
      <label class="type-meta text-ink-muted" for="{uid}-name"
        >{decidesWords.nameLabel}</label
      >
      <Input
        aria-invalid={problemOf("does") ? true : undefined}
        autocomplete="off"
        id="{uid}-name"
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            press();
          }
        }}
        placeholder={decidesWords.namePlaceholder}
        bind:value={setup.draft.name}
      />
      {@render problemLine("does")}
    </div>
  {:else if member?.type === "agent"}
    <p class="m-0 flex min-w-0 flex-col">
      <span class="type-label text-ink-strong wrap-anywhere">{member.name}</span
      >
      <span class="type-meta text-ink-muted">{decidesWords.nameKept}</span>
    </p>
  {/if}
  {#if adding || member?.type === "agent"}
    <div class="flex min-w-0 flex-col gap-space-2">
      <label class="type-meta text-ink-muted" for="{uid}-job"
        >{decidesWords.jobLabel}</label
      >
      <Input
        autocomplete="off"
        id="{uid}-job"
        placeholder={decidesWords.jobPlaceholder}
        bind:value={setup.draft.job}
      />
    </div>
  {:else}
    <p class="m-0 flex min-w-0 flex-col">
      <span class="type-label text-ink-strong text-pretty wrap-anywhere"
        >{member?.job}</span
      >
      {#if isCaw && who.lead}
        <span class="type-meta text-ink-muted"
          >{decidesWords.cawNow(who.lead.sentence)}</span
        >
      {/if}
    </p>
  {/if}
{/snippet}

{#snippet lead()}
  {#if who.lead && who.projectId !== null && project !== null}
    <div class="type-label text-ink-strong">
      <CawLeadSwitch
        lead={who.lead}
        projectId={who.projectId}
        projectName={project}
      />
    </div>
  {/if}
{/snippet}

{#snippet runs()}
  <p class="m-0 -mb-space-1 type-meta text-ink-muted" aria-hidden="true">
    {decidesWords.harnessLabel}
  </p>
  <OptionTiles
    cols={3}
    label={decidesWords.harnessLabel}
    options={harnessTiles}
    bind:value={
      () => draft.harness,
      (next) => {
        if (next !== null && next !== draft.harness) {
          setup.draft.harness = next;
          setup.draft.model = isCaw
            ? null
            : (offer(next)?.models.find((one) => one.default)?.id ?? null);
        }
      }
    }
  />
  {@render problemLine("runs")}
  {#if models.length > 0}
    <div class="flex min-w-0 flex-col gap-space-2">
      <p class="m-0 type-meta text-ink-muted" id="{uid}-model">
        {decidesWords.modelLabel}
      </p>
      <div class="max-h-64 min-w-0 overflow-y-auto overscroll-contain">
        <OptionGroup
          aria-labelledby="{uid}-model"
          layout="list"
          bind:value={
            () => (modelChosen === null ? [] : [modelChosen]),
            (next) => {
              const [picked] = next;
              if (picked !== undefined) {
                setup.draft.model =
                  isCaw && models.find((one) => one.id === picked)?.default
                    ? null
                    : picked;
              }
            }
          }
        >
          {#each models as model (model.id)}
            <OptionGroupItem value={model.id}>
              <span class="min-w-0 wrap-anywhere">{model.name}</span>
            </OptionGroupItem>
          {/each}
        </OptionGroup>
      </div>
    </div>
  {/if}
  {#if !isCaw}
    <div class="flex min-w-0 flex-col gap-space-2">
      <p class="m-0 type-meta text-ink-muted" aria-hidden="true">
        {decidesWords.effortLabel}
      </p>
      <OptionTiles
        cols={5}
        colsPhone={3}
        label={decidesWords.effortLabel}
        options={EFFORT_OPTIONS.map((one) => ({
          id: one.value,
          name: one.label,
        }))}
        bind:value={setup.draft.effort}
      />
      {#if effort}
        <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
          {effort.description}
        </p>
      {/if}
    </div>
    <label
      class="flex min-h-c-touch-floor items-center gap-space-2 type-label text-ink-strong"
    >
      <Checkbox bind:checked={setup.draft.delegates} />
      <span>{decidesWords.delegatesLabel}</span>
    </label>
  {/if}
{/snippet}

{#snippet knows()}
  {#if isCaw}
    <p class="m-0 flex min-w-0 flex-col gap-space-1 type-label">
      {#if who.projectId !== null && project !== null}
        <a
          class="text-link-ink underline-offset-2 wrap-anywhere can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
          href={folderFileHref(who.projectId, "AGENTS.md")}
          >{decidesWords.cawInstructions(project)}</a
        >
      {/if}
      <a
        class="text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
        href="/config/skills">{decidesWords.cawSkills}</a
      >
    </p>
  {:else}
    <fieldset class="m-0 flex min-w-0 flex-col gap-space-1 border-0 p-0">
      <legend class="mb-space-1 type-meta text-ink-muted"
        >{decidesWords.skillsLabel}</legend
      >
      {#if who.skills.length === 0}
        <p class="m-0 type-meta text-ink-muted">{decidesWords.noSkills}</p>
      {:else}
        <ul
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
                      class="type-meta text-ink-muted text-pretty wrap-anywhere line-clamp-2"
                      >{skill.note}</span
                    >
                  {/if}
                </span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </fieldset>
    <div class="flex min-w-0 flex-col gap-space-2">
      <label class="type-meta text-ink-muted" for="{uid}-instructions"
        >{decidesWords.instructionsLabel}</label
      >
      <Textarea
        aria-describedby="{uid}-instructions-hint"
        aria-invalid={problemOf("knows") ? true : undefined}
        id="{uid}-instructions"
        placeholder={decidesWords.instructionsPlaceholder}
        bind:value={setup.draft.instructions}
      />
      <p class="m-0 type-meta text-ink-muted" id="{uid}-instructions-hint">
        {decidesWords.instructionsHint}
      </p>
      {@render problemLine("knows")}
    </div>
  {/if}
{/snippet}

{#snippet decides()}
  <ul class="m-0 flex list-none flex-col p-0">
    {#each who.kinds as kind (kind.id)}
      {@const Glyph = kindGlyph(kind.id)}
      {@const holder = who.routes[kind.id]}
      {@const other =
        holder !== undefined && holder !== setup.key
          ? who.member(holder)
          : undefined}
      <li>
        <label
          class="mark-line flex min-h-c-touch-floor items-center gap-space-2 py-space-1"
        >
          <Checkbox
            data-box
            bind:checked={
              () => draft.kinds.includes(kind.id),
              (on) => {
                setup.draft.kinds = on
                  ? [...draft.kinds, kind.id]
                  : draft.kinds.filter((one) => one !== kind.id);
              }
            }
          />
          <Glyph
            aria-hidden="true"
            class="size-icon-sm flex-none text-ink-muted"
          />
          <span class="min-w-0 type-label text-ink-strong wrap-anywhere"
            >{kind.name}</span
          >
          {#if project !== null}
            {@const Scope = who.isOwn(kind.id) ? IconFolder : IconGlobe}
            <Scope
              aria-hidden="true"
              class="size-icon-sm flex-none text-ink-muted"
              data-box
            />
          {/if}
          {#if other}
            <span class="min-w-0 type-meta text-ink-muted wrap-anywhere"
              >{decidesWords.nowHeld(other.name)}</span
            >
          {/if}
        </label>
      </li>
    {/each}
  </ul>
  <p class="m-0 type-meta text-ink-muted text-pretty">
    {project === null
      ? decidesWords.decidesHint
      : `${decidesWords.decidesHint} ${decidesWords.decidesHintProject}`}
  </p>
{/snippet}

{#snippet hear()}
  <OptionTiles
    cols={2}
    label={decidesWords.rows.hear}
    options={(["each", "later"] as const).map((id) => ({
      id,
      ...decidesWords.hears[id],
    }))}
    bind:value={
      () => draft.hear,
      (next) => {
        if (next !== null) {
          setup.draft.hear = next;
        }
      }
    }
  />
  <p class="m-0 type-meta text-ink-muted">{decidesWords.hearHint}</p>
  {#if who.projectId !== null}
    <a
      class="self-start type-label text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
      href="/project/{encodeURIComponent(who.projectId)}?view=decisions"
      >{decidesWords.answersIn}</a
    >
  {/if}
{/snippet}

{#snippet fields(row: RowId)}
  {#if row === "does"}
    {@render does()}
  {:else if row === "lead"}
    {@render lead()}
  {:else if row === "runs"}
    {@render runs()}
  {:else if row === "knows"}
    {@render knows()}
  {:else if row === "decides"}
    {@render decides()}
  {:else if row === "hear"}
    {@render hear()}
  {:else if member && who.record?.member === member.id}
    <MemberRecord
      now={Date.now()}
      onretry={() => who.readRecord(member.id)}
      projectId={who.projectId}
      read={who.record.read}
    />
  {/if}
{/snippet}

<div
  class="@container/member-setup flex max-h-(--pop-max-h) min-h-0 min-w-0 flex-col"
  data-setup={setup.key}
>
  <header class="flex min-w-0 items-start gap-x-space-3 p-space-3">
    {#if pictured}
      <button
        aria-expanded={setup.picking}
        aria-label={decidesWords.changePicture(face.name)}
        class="relative flex-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
        onclick={() => {
          setup.picking = !setup.picking;
        }}
        type="button"
      >
        <MemberFace member={face} size={56} />
        <span
          class="absolute -end-space-1 -bottom-space-1 grid size-6 place-items-center rounded-full border border-border-hairline bg-surface-raised text-ink-strong shadow-tile"
        >
          <IconPen aria-hidden="true" class="size-icon-sm" />
        </span>
      </button>
    {/if}
    <div class="flex min-w-0 flex-auto flex-col self-center">
      <h2
        class="m-0 type-title text-balance text-ink-strong wrap-anywhere"
        id={headId}
      >
        {name}
      </h2>
      {#if member !== null || setup.adding !== null}
        <p class="m-0 type-meta text-ink-muted text-pretty wrap-anywhere">
          {line}
        </p>
      {/if}
    </div>
    <Button
      aria-label={decidesWords.closeSetup(name)}
      icon={IconClose}
      onclick={() => who.closeSetup()}
      size="icon-sm"
      variant="ghost"
    />
  </header>

  <div
    bind:this={body}
    class="min-h-0 flex-auto overflow-y-auto overscroll-contain px-space-3"
  >
    {#if setup.picking}
      <div class="pb-space-3" transition:unfold>
        <PicturePicker
          member={face}
          onpicked={(picture) => who.pickPicture(picture)}
        />
      </div>
    {/if}

    {#if member === null && setup.adding === null}
      <div class="flex min-w-0 flex-col gap-space-2 pb-space-3">
        <OptionTiles
          cols={3}
          digits
          label={decidesWords.addMember}
          options={(["agent", "person", "channel"] as const).map((id) => ({
            id,
            ...decidesWords.memberTypes[id],
            disabled: id !== "agent",
          }))}
          bind:value={
            () => null,
            (next) => {
              if (next === "agent") {
                who.addAs("agent");
              }
            }
          }
        />
      </div>
    {/if}

    {#each shown as row (row)}
      <SetupRow
        id={row}
        label={rowLabel(row)}
        onopen={() => who.openRow(row)}
        open={setup.open === row}
        problem={problemOf(row) !== undefined}
        readOnly={readOnly(row, member)}
        value={summary(row)}
      >
        {@render fields(row)}
      </SetupRow>
    {/each}

    <AskHere asker={who.asker} at="remove:{setup.key}" class="pb-space-3" />
  </div>

  {#if member !== null || setup.adding !== null}
    <footer
      class="flex min-w-0 flex-col gap-space-2 border-t border-border-hairline p-space-3"
    >
      <RowFault reason={footFault} />
      <div
        class="flex min-w-0 flex-wrap items-center justify-end gap-x-space-3 gap-y-space-2"
      >
        <p class="m-0 me-auto min-w-0 type-meta text-ink-muted text-pretty">
          {decidesWords.fromNowOn}
          {#if setup.tried && count > 0}
            <span class="text-status-fail-ink">
              {decidesWords.toFix(count)}</span
            >
          {/if}
        </p>
        <div class="flex flex-none items-center gap-space-2">
          <Button
            label={decidesWords.cancel}
            onclick={() => who.cancelSetup()}
            size="sm"
            variant="ghost"
          />
          {#if adding}
            <Button
              aria-busy={setup.saving || undefined}
              onclick={press}
              size="sm"
              variant={removeAsked ? "secondary" : "default"}
            >
              <span
                class="grid grid-cols-1 grid-rows-1 *:col-start-1 *:row-start-1"
                data-box
              >
                <span class={[(last || setup.saving) && "invisible"]}
                  >{decidesWords.continue}</span
                >
                <span class={[(!last || setup.saving) && "invisible"]}
                  >{decidesWords.addMemberAct}</span
                >
                <span class={[!setup.saving && "invisible"]}
                  >{decidesWords.addingMember}</span
                >
              </span>
            </Button>
          {:else}
            <Button
              label={decidesWords.save}
              onclick={press}
              pending={setup.saving}
              pendingLabel={decidesWords.saving}
              size="sm"
              variant={removeAsked ? "secondary" : "default"}
            />
          {/if}
        </div>
      </div>
      {#if member !== null && isAgent && member.delegateType}
        <a
          class="self-end type-meta text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
          href="/config/delegate-types/{encodeURIComponent(
            member.delegateType
          )}">{decidesWords.openType}</a
        >
      {/if}
      {#if member !== null && !member.builtIn && !BUILT_IN_MEMBERS.some((builtIn) => builtIn === member.id)}
        <div class="border-t border-border-hairline pt-space-2">
          <Button
            disabled={removeAsked}
            label={decidesWords.remove}
            onclick={askRemove}
            size="sm"
            variant="destructive"
          />
        </div>
      {/if}
    </footer>
  {/if}
</div>
