<script lang="ts">
  /**
   * Find folder: point a place at the folder the project is in now. The
   * place and the folder it pointed at, the folder typed, what CawCo can
   * tell of it, and what follows: no file moves, conversations are carried,
   * sessions whose folder is gone stop, everything placed goes again. Only
   * when so: the old folder stays on disk and stops being a place; the
   * change waits for an away machine; two projects become one, both named,
   * with which remains as two tiles. A refusal keeps what was typed.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import type { ProjectPlace } from "#lib/cawco/projects.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { FindPlan } from "./details";
  import Face from "./Face.svelte";
  import Group from "./Group.svelte";
  import { standingWords } from "./words";

  const words = standingWords.find;

  let {
    form,
    place,
    machine,
    projectName,
    typed,
    plan,
    ontype,
    onkeep,
    onback,
    onpoint,
  }: {
    form: "card" | "sheet";
    place: ProjectPlace;
    machine: Machine | null;
    projectName: string;
    typed: string;
    plan: FindPlan;
    ontype: (folder: string) => void;
    /** Which project remains, when two become one. */
    onkeep: (name: string) => void;
    onback: () => void;
    onpoint: () => void;
  } = $props();

  const folderId = $props.id();
  const machineName = $derived(
    machine ? machineLabel(machine.hostname) : place.machineId
  );
  const ready = $derived(
    typed.trim() !== "" &&
      plan.tell !== "reading" &&
      plan.refusal === null &&
      (plan.merge === null || plan.merge.keep !== null)
  );
</script>

<Face
  {form}
  go={{ label: words.point, disabled: !ready, onclick: onpoint }}
  {onback}
  title={words.title}
>
  {#snippet lead()}
    <div class="flex min-w-0 flex-col gap-space-1">
      <span class="type-label text-ink-strong">{machineName}</span>
      <span class="type-meta text-ink-muted text-pretty"
        >{words.was(place.path)}</span
      >
    </div>
    <div class="flex min-w-0 flex-col gap-space-2">
      <label class="type-meta text-ink-muted" for={folderId}
        >{words.folder}</label
      >
      <Input
        aria-invalid={plan.refusal !== null || undefined}
        autocomplete="off"
        face="mono"
        id={folderId}
        oninput={(event) => ontype(event.currentTarget.value)}
        spellcheck="false"
        value={typed}
      />
      {#if plan.tell}
        <p aria-live="polite" class="m-0 type-meta text-ink-strong text-pretty">
          {#if plan.tell === "reading"}
            <span class="mark-line flex items-center gap-space-2">
              <LiveDot data-box size="row" />
              <span>{words.tells.reading}</span>
            </span>
          {:else}
            {words.tells[plan.tell]}
          {/if}
        </p>
      {/if}
      {#if plan.away}
        <p class="m-0 type-meta text-status-attn-ink text-pretty">
          {words.away(machineName)}
        </p>
      {/if}
    </div>
    {#if plan.refusal}
      <Alert variant="destructive">
        <AlertDescription>{plan.refusal}</AlertDescription>
      </Alert>
    {/if}
  {/snippet}
  {#snippet trail()}
    {#if plan.merge}
      <div class="flex min-w-0 flex-col gap-space-2" in:reveal>
        <p
          class="m-0 mark-line flex items-start gap-space-2 type-label text-ink-strong text-pretty"
        >
          <IconWarningTriangle
            aria-hidden="true"
            class="size-icon-sm flex-none text-status-attn-ink"
            data-box
          />
          <span>{words.merge(plan.merge.other)}</span>
        </p>
        <OptionGroup
          aria-label={words.merge(plan.merge.other)}
          bind:value={
            () => (plan.merge?.keep ? [plan.merge.keep] : []),
            (next) => {
              const [name] = next;
              if (name) {
                onkeep(name);
              }
            }
          }
          layout="tiles"
          style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
        >
          <OptionGroupItem value={projectName}>
            <span class="type-label">{projectName}</span>
          </OptionGroupItem>
          <OptionGroupItem value={plan.merge.other}>
            <span class="type-label">{plan.merge.other}</span>
          </OptionGroupItem>
        </OptionGroup>
      </div>
    {/if}
    <Group title={words.follows}>
      <ul class="m-0 flex min-w-0 list-none flex-col gap-space-1 p-0">
        <li class="type-meta text-ink-strong">{words.noFileMoves}</li>
        <li class="type-meta text-ink-muted">{words.carried}</li>
        <li class="type-meta text-ink-muted">{words.goneStop}</li>
        <li class="type-meta text-ink-muted">{words.placed}</li>
        {#if plan.oldStays}
          <li class="type-meta text-ink-muted text-pretty">
            {words.oldStays(place.path)}
          </li>
        {/if}
      </ul>
    </Group>
  {/snippet}
</Face>
