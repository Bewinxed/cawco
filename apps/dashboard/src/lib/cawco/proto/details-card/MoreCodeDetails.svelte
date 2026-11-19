<script lang="ts">
  /**
   * More code details: one closed row at the card's foot, only for a
   * project that has code. Closed, it still states its facts: the connected
   * codebase's name and where big files are kept. A press opens it in
   * place: Connected code (each codebase with its host, a link out, nothing
   * to change) beside Big file storage (Use defaults, or Custom location,
   * which opens an address, the sign-ins that can serve it, and Save under
   * itself; nothing changes until Save). Side by side from the card's two
   * columns, stacked under them. It opens by itself when the hub refused a
   * change inside it.
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconArrowUpRight,
    IconChevronDown,
    IconFolderGit,
    IconGlobe,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type {
    BigDraft,
    BigFiles,
    Codebase,
    Pending,
    Read,
    SignIn,
  } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import SignInRows from "./SignInRows.svelte";
  import { cardWords, moreWords, sectionWords } from "./words";

  let {
    codebases,
    bigFiles,
    signIns,
    pending,
    open = $bindable(false),
    draft = $bindable({ open: false, address: "", signIn: null }),
    sunk = false,
    onsave,
    ondefaults,
    ontry,
  }: {
    codebases: Codebase[];
    bigFiles: Read<BigFiles>;
    signIns: SignIn[];
    pending?: Pending;
    open?: boolean;
    draft?: BigDraft;
    sunk?: boolean;
    /** Save: the address and the sign-in for it. */
    onsave: (address: string, signIn: string) => void;
    ondefaults: () => void;
    ontry: () => void;
  } = $props();

  const id = $props.id();
  const kept = $derived(bigFiles.state === "read" ? bigFiles.value : null);
  const chosen = $derived(kept?.mode ?? null);
  /** It stands open while the person keeps it so, and whenever a change inside it was refused. */
  const shown = $derived(open || Boolean(pending?.refused));
  const summary = $derived(
    [
      codebases.map((codebase) => codebase.name).join(", "),
      kept?.mode === "custom" ? moreWords.bigCustom : moreWords.bigDefaults,
    ]
      .filter(Boolean)
      .join(" · ")
  );
  const canSave = $derived(
    draft.address.trim() !== "" && draft.signIn !== null && !sunk
  );
</script>

<Collapsible.Root
  bind:open={
    () => shown,
    (next) => {
      open = next;
    }
  }
>
  <Collapsible.Trigger look="head" class="w-full">
    <span
      class="mark-line flex w-full min-w-0 items-center gap-space-3 px-space-3 py-space-2"
      data-box
    >
      <span class="type-label font-medium text-ink-strong"
        >{sectionWords.more.name}</span
      >
      <span
        class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-meta font-normal text-ink-muted"
        >{summary}</span
      >
      <IconChevronDown
        aria-hidden="true"
        class={[
          "size-icon-sm flex-none text-ink-muted transition-transform duration-(--duration-control) ease-out",
          shown && "rotate-180",
        ]}
      />
    </span>
  </Collapsible.Trigger>
  <Collapsible.Content reveal>
    <div
      class="grid grid-cols-1 gap-x-space-6 gap-y-space-5 px-space-3 pt-space-3 pb-space-1 @min-details-card/card:grid-cols-2"
      id="{id}-more"
    >
      {#if codebases.length > 0}
        <section class="flex min-w-0 flex-col gap-space-3" data-section="code">
          <header class="flex flex-col gap-space-1">
            <h4 class="m-0 type-label font-medium text-ink-strong">
              {sectionWords.code.name}
            </h4>
            <p class="m-0 type-meta text-pretty text-ink-muted">
              {sectionWords.code.line}
            </p>
          </header>
          <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
            {#each codebases as codebase (codebase.url)}
              <li
                class="mark-line flex min-w-0 items-center gap-space-2 rounded-sm border border-border-hairline bg-surface-recess px-space-3 py-space-2"
              >
                <IconFolderGit
                  aria-hidden="true"
                  class="size-icon-md flex-none text-ink-muted"
                />
                <span
                  class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
                  >{codebase.name}</span
                >
                <span class="flex-none type-meta text-ink-muted"
                  >{codebase.host}</span
                >
                <Button
                  href={codebase.url}
                  icon={IconArrowUpRight}
                  aria-label="Open {codebase.name} on {codebase.host}"
                  rel="noreferrer"
                  size="icon-xs"
                  target="_blank"
                  variant="ghost"
                />
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section
        class="flex min-w-0 flex-col gap-space-3"
        data-section="big-files"
      >
        <header class="flex flex-col gap-space-1">
          <h4 class="m-0 type-label font-medium text-ink-strong">
            {sectionWords.bigFiles.name}
          </h4>
          <p class="m-0 type-meta text-pretty text-ink-muted">
            {sectionWords.bigFiles.line}
          </p>
        </header>
        {#if bigFiles.state === "reading"}
          <Skeleton height="item" />
          <Skeleton height="item" />
        {:else if bigFiles.state === "failed"}
          <RowFault
            again={ontry}
            reason="{cardWords.couldntRead} {bigFiles.reason}"
          />
        {:else}
          <OptionGroup
            aria-label={sectionWords.bigFiles.name}
            bind:value={
              () => [draft.open ? "custom" : (chosen ?? "defaults")],
              (next) => {
                if (next[0] === "custom") {
                  draft = { ...draft, open: true };
                } else if (next[0] === "defaults") {
                  draft = { ...draft, open: false };
                  if (chosen !== "defaults") {
                    ondefaults();
                  }
                }
              }
            }
            disabled={sunk}
            layout="list"
          >
            <OptionGroupItem value="defaults">
              <OptionLine
                glyph={IconFolderGit}
                line={moreWords.defaults.line}
                name={moreWords.defaults.name}
                waiting={pending?.value === "defaults" && !pending.refused}
              />
            </OptionGroupItem>
            <OptionGroupItem value="custom">
              <OptionLine
                glyph={IconGlobe}
                line={kept?.mode === "custom" && !draft.open
                  ? kept.address
                  : moreWords.custom.line}
                name={moreWords.custom.name}
                waiting={pending?.value === "custom" && !pending.refused}
              />
            </OptionGroupItem>
          </OptionGroup>
          {#if draft.open}
            <form
              class="flex flex-col gap-space-3 ps-c-details-option-text"
              onsubmit={(event) => {
                event.preventDefault();
                if (canSave && draft.signIn) {
                  onsave(draft.address.trim(), draft.signIn);
                }
              }}
              transition:unfold
            >
              <label class="flex flex-col gap-space-1">
                <span class="type-meta font-medium text-ink-muted"
                  >{moreWords.address}</span
                >
                <Input
                  autocomplete="off"
                  disabled={sunk}
                  face="mono"
                  placeholder="https://files.example.com/acme/hyucksfield.git/info/lfs"
                  spellcheck="false"
                  text="meta"
                  bind:value={
                    () => draft.address,
                    (address) => {
                      draft = { ...draft, address: address ?? "" };
                    }
                  }
                />
              </label>
              <div class="flex flex-col gap-space-1">
                <span
                  class="type-meta font-medium text-ink-muted"
                  id="{id}-signin">{moreWords.signInFor}</span
                >
                {#if signIns.length === 0}
                  <p class="m-0 type-meta text-pretty text-ink-muted">
                    {moreWords.noSignIn}
                  </p>
                {:else}
                  <SignInRows
                    chosen={draft.signIn}
                    label={moreWords.signInFor}
                    onchoose={(signIn) => {
                      draft = { ...draft, signIn };
                    }}
                    {signIns}
                    {sunk}
                  />
                {/if}
              </div>
              {#if pending?.value === "custom" && pending.refused}
                <RowFault
                  again={() =>
                    draft.signIn && onsave(draft.address.trim(), draft.signIn)}
                  reason={pending.refused}
                />
              {/if}
              <div class="flex justify-end">
                <Button
                  disabled={!canSave}
                  pending={pending?.value === "custom" && !pending.refused}
                  size="sm"
                  type="submit">{moreWords.save}</Button
                >
              </div>
            </form>
          {/if}
        {/if}
      </section>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
