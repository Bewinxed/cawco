<script lang="ts">
  /**
   * Tie tasks to a tracker: the connection (each by its name and the
   * account behind it; with none that can serve, what kind is needed and
   * where to add one), the repository or team with the project's own first
   * and a field to find another, and for GitHub the Project that carries
   * stages (None among them) with each stage's Status option or Leave alone.
   * What tying does in four short facts. Nothing is tied until Tie; a
   * refusal keeps every choice.
   */
  import { TRACKER_NAMES } from "@cawco/core/trackers";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import type { TiePlan } from "./details";
  import Face from "./Face.svelte";
  import Group from "./Group.svelte";
  import { standingWords } from "./words";

  const words = standingWords.tie;

  let {
    form,
    plan,
    onconnection,
    ontarget,
    onproject,
    onstage,
    onaddconnection,
    onback,
    ontie,
  }: {
    form: "card" | "sheet";
    plan: TiePlan;
    onconnection: (name: string) => void;
    ontarget: (id: string) => void;
    onproject: (id: string) => void;
    /** A stage's Status option, or null for Leave alone. */
    onstage: (stage: string, option: string | null) => void;
    onaddconnection: () => void;
    onback: () => void;
    ontie: () => void;
  } = $props();

  const github = $derived(plan.provider === "github");
  const serving = $derived(
    (plan.connections ?? []).filter((one) => one.serves)
  );
  const ready = $derived(
    plan.connection !== null && plan.target !== null && plan.refusal === null
  );
  const LEAVE = "leave";
</script>

{#snippet chooser(
  label: string,
  value: string | null,
  options: { id: string; name: string; note?: string }[],
  onpick: (id: string) => void
)}
  <OptionGroup
    aria-label={label}
    bind:value={
      () => (value ? [value] : []),
      (next) => {
        const [picked] = next;
        if (picked && picked !== value) {
          onpick(picked);
        }
      }
    }
  >
    {#each options as option (option.id)}
      <OptionGroupItem value={option.id}>
        <span class="flex min-w-0 items-baseline gap-space-2">
          <span>{option.name}</span>
          {#if option.note}
            <span class="type-meta text-ink-muted">{option.note}</span>
          {/if}
        </span>
      </OptionGroupItem>
    {/each}
  </OptionGroup>
{/snippet}

<Face
  {form}
  backLabel={words.back}
  go={{ label: words.tie, disabled: !ready, onclick: ontie }}
  {onback}
  title={words.title(TRACKER_NAMES[plan.provider])}
>
  {#snippet lead()}
    <Group title={words.connection}>
      {#if plan.connections === null}
        <Skeleton height="control-sm" radius="chip" width="title" />
      {:else if serving.length === 0}
        <div class="flex min-w-0 flex-wrap items-center gap-space-3">
          <span class="type-meta text-ink-muted text-pretty"
            >{words.noConnection(
              github ? "a GitHub App or token" : "a Linear API key"
            )}</span
          >
          <Button onclick={onaddconnection} size="xs" variant="outline"
            >{words.addConnection}</Button
          >
        </div>
      {:else}
        <!-- mark-line: the tracker's mark leads the connections' chips, on their first row -->
        <div class="flex min-w-0 items-start gap-space-2">
          <span class="flex h-c-btn-h-sm flex-none items-center"
            ><ProviderLogo provider={plan.provider} /></span
          >
          <div class="min-w-0 flex-auto">
            {@render chooser(
              words.connection,
              plan.connection,
              serving.map((one) => ({
                id: one.name,
                name: one.name,
                note: one.account,
              })),
              onconnection
            )}
          </div>
        </div>
      {/if}
    </Group>
    {#if plan.connections === null || serving.length > 0}
      <Group title={github ? words.repository : words.team}>
        {#if plan.targets === null}
          <Skeleton height="control-sm" radius="chip" width="title" />
        {:else}
          {@render chooser(
            github ? words.repository : words.team,
            plan.target,
            plan.targets.map((one) => ({
              id: one.id,
              name: one.name,
              note: one.own ? words.ownRepo : undefined,
            })),
            ontarget
          )}
          <Input
            aria-label={words.find}
            autocomplete="off"
            placeholder={words.find}
            spellcheck="false"
          />
        {/if}
      </Group>
    {/if}
    {#if plan.refusal}
      <Alert variant="destructive">
        <AlertDescription>{plan.refusal}</AlertDescription>
      </Alert>
    {/if}
  {/snippet}
  {#snippet trail()}
    {#if github && (plan.connections === null || serving.length > 0)}
      <Group title={words.project}>
        {#if plan.projects === null}
          <Skeleton height="control-sm" radius="chip" width="title" />
        {:else}
          {@render chooser(
            words.project,
            plan.project,
            [
              { id: "none", name: words.noProject },
              ...plan.projects.map((one) => ({ id: one.id, name: one.title })),
            ],
            onproject
          )}
          {#if plan.projectReason}
            <p class="m-0 type-meta text-ink-muted text-pretty">
              {plan.projectReason}
            </p>
          {/if}
        {/if}
      </Group>
    {/if}
    <Group title={words.does}>
      <ul class="m-0 flex min-w-0 list-none flex-col gap-space-1 p-0">
        {#each words.facts as fact (fact)}
          <li class="type-meta text-ink-muted text-pretty">{fact}</li>
        {/each}
      </ul>
    </Group>
  {/snippet}
  {#snippet wide()}
    {#if github && serving.length > 0 && plan.project && plan.project !== "none" && plan.stages.length > 0}
      <Group title={words.stages}>
        <dl class="m-0 flex min-w-0 flex-col gap-space-2">
          {#each plan.stages as row (row.stage)}
            <div class="flex min-w-0 items-center gap-space-3">
              <dt class="w-24 flex-none truncate type-label text-ink-row">
                {row.stage}
              </dt>
              <dd class="m-0 min-w-0 flex-auto">
                {@render chooser(
                  row.stage,
                  row.pick ?? LEAVE,
                  [
                    ...row.options.map((option) => ({
                      id: option,
                      name: option,
                    })),
                    { id: LEAVE, name: words.leave },
                  ],
                  (id) => onstage(row.stage, id === LEAVE ? null : id)
                )}
              </dd>
            </div>
          {/each}
        </dl>
      </Group>
    {/if}
  {/snippet}
</Face>
