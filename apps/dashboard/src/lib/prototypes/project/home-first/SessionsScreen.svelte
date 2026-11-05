<script lang="ts">
  /**
   * Sessions (TOM task 13, open question 4), reached from Home's Working
   * now: the project's own sessions in three groups (Caw's conversations,
   * attempts on tasks, sessions spun off by hand), each with its state as
   * glyph and word, its machine, harness and delegate type, how long ago,
   * its transcript and Stop. Spin off a session is the bar's prominent
   * action and opens its form beside the list: machine and checkout,
   * harness and delegate type, and what comes along (the project's skills
   * and MCP servers, named).
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconSessionAdd } from "#lib/icons.js";
  import { SERVERS, SKILLS } from "./fixture";
  import Group from "./Group.svelte";
  import type { Session } from "./model";
  import ProjectFrame from "./ProjectFrame.svelte";
  import StateMark from "./StateMark.svelte";

  let {
    project,
    sessions,
    read = "live",
    staleAt,
    spinning = false,
  }: {
    project: string;
    sessions: Session[];
    read?: "live" | "loading" | "stale";
    staleAt?: string;
    /** Spin off a session was pressed: its form stands open. */
    spinning?: boolean;
  } = $props();

  const GROUPS = ["caw", "attempt", "spunOff"] as const;
  const TITLE = {
    caw: words.sessions.caw,
    attempt: words.sessions.attempts,
    spunOff: words.sessions.spunOff,
  } as const;
  const STATE_WORD = words.work.state;
  const at = $derived(read === "stale" ? staleAt : undefined);
</script>

<ProjectFrame
  action={{ label: words.bar.spinOff, icon: IconSessionAdd, compact: true }}
  more={[words.more.configure]}
  pane={spinning ? spinPane : undefined}
  paneClose={words.taskPane.close}
  paneForm="sheet"
  paneTitle={words.sessions.form.title}
  {project}
  title={words.places.sessions}
>
  <div
    class="flex min-w-0 flex-col gap-space-5 @min-wide/shell:max-w-c-config-max-w"
  >
    {#each GROUPS as key (key)}
      {@const rows = sessions.filter((s) => s.group === key)}
      <Group count={rows.length} staleAt={at} title={TITLE[key]}>
        {#if read === "loading"}
          <div class="flex flex-col gap-space-3 p-space-3">
            <Skeleton height="item" radius="tile" />
            <Skeleton height="item" radius="tile" />
          </div>
        {:else if rows.length === 0}
          <p class="m-0 px-space-4 py-space-3 type-body text-ink-muted">
            {words.sessions.none}
          </p>
        {:else}
          <ul class="m-0 list-none p-0">
            {#each rows as session (session.id)}
              <!-- mark-line: the state's glyph stands beside the title's line; its facts start under it. -->
              <li
                class="flex flex-wrap items-start gap-x-space-3 gap-y-space-2 border-b border-b-border-hairline py-space-3 ps-space-3 pe-space-4 last:border-b-0"
              >
                <StateMark
                  label={STATE_WORD[session.state]}
                  line
                  mark={session.state}
                />
                <span class="flex min-w-0 flex-1 flex-col gap-space-row">
                  <span class="type-label text-ink-row text-pretty"
                    >{session.title}</span
                  >
                  <span class="type-meta text-ink-muted">
                    <span class="font-medium text-ink-strong"
                      >{STATE_WORD[session.state]}</span
                    >
                    · {session.machine} · {session.harness}{#if session.type}
                      · {session.type}{/if} ·
                    <span class="tabular-nums">{session.age}</span>
                  </span>
                </span>
                <span
                  class="flex flex-none gap-space-2 ps-c-row-lead @min-desk/shell:ps-0"
                >
                  <Button
                    label={words.sessions.openTranscript}
                    size="sm"
                    variant="outline"
                  />
                  {#if session.state !== "done" && session.state !== "stopped" && session.state !== "idle"}
                    <Button
                      label={words.sessions.stop}
                      size="sm"
                      variant="outline"
                    />
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </Group>
    {/each}
  </div>
</ProjectFrame>

{#snippet spinPane()}
  <div class="flex flex-col gap-space-5">
    <section class="flex flex-col gap-space-2">
      <h3 class="m-0 type-label text-ink-strong">
        {words.sessions.form.place}
      </h3>
      <div>
        <button class={chipVariants({ variant: "setting" })} type="button">
          <span data-slot="chip-label"
            >obelisk-of-light · ~/cawco-marketing</span
          >
        </button>
      </div>
    </section>
    <section class="flex flex-col gap-space-2">
      <h3 class="m-0 type-label text-ink-strong">
        {words.sessions.form.harness}
      </h3>
      <ToggleGroup.Root type="single" value="claude">
        <ToggleGroup.Item value="claude"
          ><span>Claude Code</span></ToggleGroup.Item
        >
        <ToggleGroup.Item value="opencode"
          ><span>OpenCode</span></ToggleGroup.Item
        >
        <ToggleGroup.Item value="pi"><span>pi</span></ToggleGroup.Item>
      </ToggleGroup.Root>
    </section>
    <section class="flex flex-col gap-space-2">
      <h3 class="m-0 type-label text-ink-strong">{words.sessions.form.type}</h3>
      <div>
        <button class={chipVariants({ variant: "setting" })} type="button">
          <span data-slot="chip-label">writer</span>
        </button>
      </div>
    </section>
    <section class="flex flex-col gap-space-2">
      <h3 class="m-0 type-label text-ink-strong">
        {words.sessions.form.along}: {words.sessions.form.skills(
          SKILLS.length
        )}, {words.sessions.form.servers(SERVERS.length)}
      </h3>
      <p class="m-0 type-meta text-ink-muted text-pretty">
        {SKILLS.join(", ")}
      </p>
      <p class="m-0 type-meta text-ink-muted text-pretty">
        {SERVERS.join(", ")}
      </p>
    </section>
    <div>
      <Button label={words.sessions.form.start} />
    </div>
  </div>
{/snippet}
