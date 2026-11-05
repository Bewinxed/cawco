<script lang="ts">
  /**
   * An area's own delegate types (hub project-delegate-types.ts): one file
   * each in its folder's `delegates/`, read as a project's are, each over a
   * fleet type of the same name. Each row names the type and what it is
   * for; Edit opens its file in place under the row, written as it stands
   * with Save, and Delete removes it. New delegate type opens an empty
   * file under a name. A file that made no type says why, in the hub's
   * words, under the list.
   *
   * Every write is a commit in the area's folder; the facts are read again
   * after it, so the row and the area's glyph say what the folder holds.
   */
  import { DELEGATE_TYPE_NAME } from "@cawco/core/delegate-types";
  import {
    AREA_SETTING_LABELS,
    areasScreenWords as words,
  } from "@cawco/core/words/areas";
  import { tick } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { configStore } from "../config/store.svelte";
  import { failureWords } from "../hub-read";
  import { unfold } from "../motion/fold.svelte";
  import RowFault from "../RowFault.svelte";
  import {
    type AreaTypes,
    deleteAreaFile,
    readAreaFile,
    writeAreaFile,
  } from "./areas";

  let { areaId, types }: { areaId: string; types: AreaTypes | null } = $props();

  const store = configStore();
  const uid = $props.id();

  /** The file open in place: an existing type's path, or a new one under a name typed. */
  let open = $state<{
    path: string | null;
    name: string;
    content: string;
  } | null>(null);
  let busy = $state(false);
  let fault = $state<string | null>(null);
  let nameField = $state<HTMLInputElement | null>(null);

  const NEW_FILE = "---\nharness: claude\n---\n";

  async function edit(path: string, name: string): Promise<void> {
    fault = null;
    busy = true;
    try {
      const file = await readAreaFile(areaId, path);
      open = { path, name, content: file.content };
    } catch (error) {
      fault = failureWords(error);
    } finally {
      busy = false;
    }
  }

  async function startNew(): Promise<void> {
    fault = null;
    open = { path: null, name: "", content: NEW_FILE };
    await tick();
    nameField?.focus();
  }

  const nameProblem = $derived(
    open &&
      open.path === null &&
      open.name !== "" &&
      !DELEGATE_TYPE_NAME.test(open.name)
      ? words.typeNameHint
      : null
  );

  async function save(): Promise<void> {
    if (!open || busy || nameProblem) {
      return;
    }
    const path = open.path ?? `delegates/${open.name}.md`;
    busy = true;
    fault = null;
    try {
      await writeAreaFile(areaId, path, open.content);
      open = null;
      await store.areaFacts.load(areaId);
    } catch (error) {
      fault = failureWords(error);
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    if (!open?.path || busy) {
      return;
    }
    busy = true;
    fault = null;
    try {
      await deleteAreaFile(areaId, open.path);
      open = null;
      await store.areaFacts.load(areaId);
    } catch (error) {
      fault = failureWords(error);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet editor()}
  {#if open}
    <form
      class="flex flex-col gap-space-2 rounded-md bg-surface-recess p-space-3"
      data-type-editor={open.path ?? "new"}
      onsubmit={(event) => {
        event.preventDefault();
        save();
      }}
      in:unfold
      out:unfold
    >
      {#if open.path === null}
        <label class="type-meta text-ink-muted" for="{uid}-name"
          >{words.typeName}</label
        >
        <Input
          aria-invalid={nameProblem ? "true" : undefined}
          autocomplete="off"
          bind:ref={nameField}
          bind:value={open.name}
          face="mono"
          id="{uid}-name"
          spellcheck="false"
        />
        <p
          class="type-meta text-ink-muted"
          class:text-status-fail-ink={nameProblem}
        >
          {words.typeNameHint}
        </p>
      {/if}
      <Textarea
        aria-label={open.path ?? words.typeName}
        face="mono"
        spellcheck="false"
        bind:value={open.content}
      />
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        {#if open.path}
          <Button
            data-delete-type
            disabled={busy}
            label={words.deleteType}
            onclick={remove}
            size="sm"
            variant="destructive"
          />
        {:else}
          <span></span>
        {/if}
        <span class="flex items-center gap-space-2">
          <Button
            label={words.cancel}
            onclick={() => {
              open = null;
              fault = null;
            }}
            size="sm"
            variant="ghost"
          />
          <Button
            disabled={busy ||
              nameProblem !== null ||
              (open.path === null && open.name === "")}
            label={words.saveType}
            pending={busy}
            size="sm"
            type="submit"
            variant="default"
          />
        </span>
      </div>
    </form>
  {/if}
{/snippet}

<div class="flex flex-col gap-space-2" data-setting="types">
  <span class="type-meta text-ink-muted">{AREA_SETTING_LABELS.types}</span>
  <div class="flex flex-wrap items-center justify-between gap-space-3">
    <p class="text-pretty">
      {types && types.types.length > 0
        ? words.typesOwn(types.types.length)
        : words.typesNone}
    </p>
    <Button
      data-new-type
      disabled={open !== null}
      onclick={startNew}
      size="sm"
      variant="outline"
    >
      <IconPlus />
      <span>{words.newType}</span>
    </Button>
  </div>
  {#if types && types.types.length > 0}
    <ul class="m-0 flex list-none flex-col gap-space-row p-0">
      {#each types.types as type (type.path)}
        <li class="flex min-w-0 flex-col gap-space-1" data-type={type.name}>
          <div class="flex min-w-0 items-center justify-between gap-space-3">
            <span class="flex min-w-0 flex-col gap-space-row">
              <span class="truncate type-code text-ink-row">{type.name}</span>
              {#if type.description}
                <span class="truncate type-meta text-ink-muted"
                  >{type.description}</span
                >
              {/if}
            </span>
            <Button
              aria-label={words.editType(type.name)}
              disabled={busy || open !== null}
              label={words.edit}
              onclick={() => edit(type.path, type.name)}
              size="sm"
              variant="ghost"
            />
          </div>
          {#if open?.path === type.path}
            {@render editor()}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if open && open.path === null}
    {@render editor()}
  {/if}
  {#each types?.problems ?? [] as problem (problem.path)}
    <p class="type-meta text-pretty text-status-fail-ink" role="alert">
      <span class="font-mono">{problem.path}</span>: {problem.problem}
    </p>
  {/each}
  <RowFault reason={fault} />
</div>
