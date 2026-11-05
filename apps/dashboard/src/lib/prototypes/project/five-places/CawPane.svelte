<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * Caw, the fifth place: a pane docked on the right at 1024 and up that
   * stays open while the other four places change, an overlay drawer from
   * the right at 900, a full screen on a phone. It holds his status in a
   * glyph and word with his sentence, his harness and model, whether the
   * project's events reach him and Turn off; the newest conversation; the
   * sessions on this project with Spin off a session; the starters written
   * for this project, which fill the field and never send; the composer.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import NativeSelect from "#lib/components/ui/native-select/native-select.svelte";
  import NativeSelectOption from "#lib/components/ui/native-select/native-select-option.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import Switch from "#lib/components/ui/switch/switch.svelte";
  import Textarea from "#lib/components/ui/textarea/textarea.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconAdd,
    IconArrowLeft,
    IconChatAdd,
    IconClose,
    IconCpu,
    IconHistory,
    IconMaximize,
    IconSend,
    IconStop,
  } from "#lib/icons.js";
  import type { Read } from "./derive";
  import type { ProjectRecords } from "./records";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    records,
    read,
    sessionsStale = false,
    spinning: spinningArg = false,
    draft: draftArg = "",
    onclose,
  }: {
    records: ProjectRecords;
    read: Read;
    /** The partial state: the sessions' read failed while the conversation is live. */
    sessionsStale?: boolean;
    /** The Spin off row is open. */
    spinning?: boolean;
    /** Words already in the field (a starter, an empty state's ask). */
    draft?: string;
    onclose: () => void;
  } = $props();

  let draft = $derived(draftArg);
  let spinning = $derived(spinningArg);
  let events = $derived(records.caw.events);
  const caw = $derived(records.caw);
  const live = $derived(read === "live");
  const awake = $derived(caw.status !== "off" && caw.status !== "unreachable");
</script>

<div class="flex h-full min-h-0 flex-col bg-surface-raised">
  <!-- The bar: no title (the pane is opened by his name); Back on a phone,
       Close at a desk; Open as its own session and New conversation as bare
       symbols in one glass group. -->
  <div class="flex h-c-top-bar-h flex-none items-center gap-space-2 px-space-3">
    <span class="@phone/five:hidden">
      <Button
        aria-label={words.back}
        icon={IconArrowLeft}
        onclick={onclose}
        size="icon-sm"
        variant="ghost"
      />
    </span>
    <span class="type-label text-ink-strong @phone/five:hidden"
      >{words.places.caw}</span
    >
    <div
      class="ms-auto flex items-center gap-space-1 rounded-pill border border-border-hairline bg-material-panel p-c-bar-group-pad shadow-tile glass-backdrop"
    >
      {#each [{ label: words.newConversation, icon: IconChatAdd }, { label: words.older, icon: IconHistory }, { label: words.openSession, icon: IconMaximize }] as one (one.label)}
        <Tip label={one.label}>
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label={one.label}
              icon={one.icon}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
      {/each}
      <span class="hidden @phone/five:inline-flex">
        <Tip label={words.closeCaw}>
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label={words.closeCaw}
              icon={IconClose}
              onclick={onclose}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
      </span>
    </div>
  </div>

  <div
    class="flex min-h-0 flex-1 flex-col gap-space-5 overflow-y-auto px-space-5 pb-space-4"
  >
    <!-- His status, sentence and settings. -->
    <section class="flex flex-col gap-space-3">
      {#if read === "loading"}
        <Skeleton line="label" radius="line" width="title" />
        <Skeleton line="meta" radius="line" width="chart-cap" />
      {:else}
        <!-- mark-line: his status glyph and word stand on their own line; the sentence is a paragraph under it -->
        <div class="flex flex-col gap-space-1">
          <StatusGlyph status={caw.status} word={words.cawStatus[caw.status]} />
          {#if awake}
            <p class="type-body text-ink-strong text-pretty">{caw.sentence}</p>
          {:else}
            <p class="type-body text-ink-muted text-pretty">
              {caw.status === "off" ? words.cawOffLine : words.cawUnreachable}
            </p>
          {/if}
        </div>
        <div class="flex flex-wrap items-center gap-space-2">
          <span
            class={chipVariants({ variant: "setting" })}
            data-variant="static"
          >
            <IconCpu aria-hidden="true" /><span data-slot="chip-label"
              >{caw.harness}</span
            >
          </span>
          <span
            class={chipVariants({ variant: "setting" })}
            data-variant="static"
          >
            <span data-slot="chip-label">{caw.model}</span>
          </span>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-space-3">
          <label
            class="mark-line flex items-center gap-space-2 type-label text-ink-strong"
          >
            <Switch
              bind:checked={events}
              data-box
              disabled={!(awake && live)}
              size="sm"
            />
            {words.events}
          </label>
          {#if awake}
            <Button
              disabled={!live}
              icon={IconStop}
              label={words.turnOff}
              size="sm"
              variant="ghost"
              tone="quiet"
            />
          {:else}
            <Button
              disabled={!live}
              label={words.turnOn}
              size="sm"
              variant="outline"
            />
          {/if}
        </div>
      {/if}
    </section>

    <!-- The newest conversation. -->
    <section
      aria-label={words.places.caw}
      class="flex flex-col gap-space-4 border-t border-border-hairline pt-space-4"
    >
      {#if read === "loading"}
        <Skeleton height="block" radius="card" />
      {:else if caw.turns.length === 0}
        <p class="type-body text-ink-muted">{words.freshConversation}</p>
      {:else}
        {#each caw.turns as turn, index (index)}
          {#if turn.who === "person"}
            <p
              class="ms-space-8 self-end rounded-lg bg-surface-recess px-space-4 py-space-3 type-body text-ink-strong text-pretty"
            >
              {turn.text}
            </p>
          {:else}
            <p class="type-prose text-ink-strong text-pretty">{turn.text}</p>
          {/if}
        {/each}
      {/if}
    </section>

    <!-- Sessions on this project: attempts and spun-off sessions. -->
    <section
      aria-labelledby="caw-sessions"
      class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-4"
    >
      <h3
        class="mark-line flex h-c-btn-h-sm items-center gap-space-2 type-label text-ink-strong"
        id="caw-sessions"
      >
        {words.sessionsHead}
        {#if records.sessions.length > 0 && !sessionsStale}<span
            class="type-meta text-ink-muted num">{records.sessions.length}</span
          >{/if}
      </h3>
      {#if sessionsStale}
        <p class="type-meta text-ink-muted">{words.sessionsStale}</p>
      {/if}
      {#if records.sessions.length === 0 && !sessionsStale}
        <p class="type-meta text-ink-muted">{words.noSessions}</p>
      {/if}
      <ul class={["flex flex-col", sessionsStale && "opacity-60"]}>
        {#each records.sessions as session (session.id)}
          <li>
            <a
              class="press-tint mark-line grid grid-cols-lead-fluid items-center gap-x-space-3 rounded-md px-space-1 py-space-2 can-hover:hover:bg-surface-hover"
              href={`#session-${session.id}`}
            >
              <span class="flex justify-center" data-box>
                <StatusGlyph
                  status={session.status === "idle" ? "idle" : session.status}
                  wordless
                />
              </span>
              <span class="flex min-w-0 items-start gap-space-3" data-box>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span
                    class="overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
                    >{session.title}</span
                  >
                  <span
                    class="overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
                    >{session.kind === "attempt" && session.task
                      ? words.attemptOf(session.task)
                      : words.spunOff} · {session.machine} · {session.harness}</span
                  >
                </span>
                <span class="flex-none type-meta text-ink-muted num"
                  >{session.ago}</span
                >
              </span>
            </a>
          </li>
        {/each}
        <li class="pt-space-1">
          {#if spinning}
            <form
              class="flex flex-col gap-space-3 rounded-lg bg-surface-recess p-space-4"
              onsubmit={(event) => event.preventDefault()}
            >
              <div class="grid grid-cols-1 gap-space-2 @phone/five:grid-cols-3">
                <label
                  class="flex flex-col gap-space-1 type-meta text-ink-muted"
                  >{words.spinMachine}
                  <NativeSelect value="obelisk-of-light">
                    <NativeSelectOption value="obelisk-of-light"
                      >obelisk-of-light · ~/cockpit</NativeSelectOption
                    >
                    <NativeSelectOption value="Omars-MacBook-Pro"
                      >Omars-MacBook-Pro · ~/code/cockpit</NativeSelectOption
                    >
                  </NativeSelect>
                </label>
                <label
                  class="flex flex-col gap-space-1 type-meta text-ink-muted"
                  >{words.spinHarness}
                  <NativeSelect value="claude">
                    <NativeSelectOption value="claude"
                      >Claude Code</NativeSelectOption
                    >
                    <NativeSelectOption value="opencode"
                      >OpenCode</NativeSelectOption
                    >
                    <NativeSelectOption value="pi">pi</NativeSelectOption>
                  </NativeSelect>
                </label>
                <label
                  class="flex flex-col gap-space-1 type-meta text-ink-muted"
                  >{words.spinType}
                  <NativeSelect value="medium">
                    <NativeSelectOption value="medium"
                      >medium</NativeSelectOption
                    >
                    <NativeSelectOption value="high">high</NativeSelectOption>
                    <NativeSelectOption value="design"
                      >design</NativeSelectOption
                    >
                  </NativeSelect>
                </label>
              </div>
              <p class="type-meta text-ink-muted text-pretty">
                {words.spinComes}
              </p>
              <div class="flex justify-end gap-space-2">
                <Button
                  label={words.cancel}
                  onclick={() => {
                    spinning = false;
                  }}
                  size="sm"
                  variant="ghost"
                />
                <Button
                  disabled={!live}
                  label={words.startSession}
                  size="sm"
                  variant="outline"
                />
              </div>
            </form>
          {:else}
            <Button
              align="row"
              class="w-full"
              disabled={!live}
              icon={IconAdd}
              label={words.spinOff}
              onclick={() => {
                spinning = true;
              }}
              size="sm"
              variant="ghost"
            />
          {/if}
        </li>
      </ul>
    </section>
  </div>

  <!-- Starters, then the field, at the pane's foot on every place. -->
  <div
    class="flex flex-none flex-col gap-space-2 border-t border-border-hairline px-space-4 pt-space-3 pb-space-4"
  >
    {#if awake && read !== "loading"}
      <fieldset
        class="no-scrollbar -mx-space-1 flex gap-space-2 overflow-x-auto px-space-1"
      >
        <legend class="sr-only">{words.starters}</legend>
        {#each caw.starters as starter (starter)}
          <button
            class={[
              chipVariants({ variant: "option" }),
              "max-w-c-starter-w flex-none",
            ]}
            onclick={() => {
              draft = starter;
            }}
            type="button"
          >
            <span>{starter}</span>
          </button>
        {/each}
      </fieldset>
    {/if}
    <form
      class="flex items-end gap-space-2"
      onsubmit={(event) => event.preventDefault()}
    >
      <Textarea
        aria-label={words.askCaw}
        bind:value={draft}
        disabled={!(awake && live)}
        placeholder={words.askCaw}
        rows={1}
      />
      <Button
        aria-label={words.send}
        disabled={!(awake && live) || draft.trim() === ""}
        icon={IconSend}
        size="icon"
        type="submit"
      />
    </form>
  </div>
</div>
