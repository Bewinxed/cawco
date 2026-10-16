<script lang="ts" module>
  import type { ConnectionAuth } from "@cawco/core";

  /**
   * A service the page can start a connection to: its MCP server and how
   * the hub signs in there.
   * - Linear: "The interactive setup flow uses OAuth 2.1 with dynamic client
   *   registration" (linear.app/docs/mcp), which the hub's sign-in runs.
   * - GitHub: the remote server takes "a personal access token (PAT)" as
   *   `Authorization: Bearer` (docs.github.com, set-up-the-github-mcp-server);
   *   its OAuth needs a pre-registered app, and the hub's GitHub poller takes
   *   a bearer key (connections.ts `githubToken`).
   * - Slack: "We do not support SSE-based connections or Dynamic Client
   *   Registration at this time" (docs.slack.dev/ai/slack-mcp-server), so a
   *   user token, as Bearer.
   */
  export interface Service {
    auth: Extract<ConnectionAuth, "oauth" | "bearer">;
    /** What the key is, said under its field. */
    key?: string;
    label: string;
    service: string;
    url: string;
  }

  export const SERVICES: Service[] = [
    {
      service: "github",
      label: "GitHub",
      url: "https://api.githubcopilot.com/mcp/",
      auth: "bearer",
      key: "A personal access token with the scopes the projects need.",
    },
    {
      service: "linear",
      label: "Linear",
      url: "https://mcp.linear.app/mcp",
      auth: "oauth",
    },
    {
      service: "slack",
      label: "Slack",
      url: "https://mcp.slack.com/mcp",
      auth: "bearer",
      key: "A Slack user token (xoxp-…) from your Slack app.",
    },
  ];

  /** Services ProviderLogo draws a mark for. */
  const MARKED = new Set(["github", "linear", "slack", "gmail"]);

  const NOT_NAME = /[^a-z0-9]+/g;
  const EDGE_HYPHENS = /^-+|-+$/g;
  const TRAILING_HYPHENS = /-+$/;

  /** A connection's name from its service and the account's words: `github-brand`. */
  export const nameFor = (service: string, account: string): string => {
    const words = account
      .toLowerCase()
      .replace(NOT_NAME, "-")
      .replace(EDGE_HYPHENS, "");
    return (words ? `${service}-${words}` : service)
      .slice(0, 24)
      .replace(TRAILING_HYPHENS, "");
  };
</script>

<script lang="ts">
  /**
   * Connections (WORDS.md: a signed-in outside service whose key the hub
   * holds; connections.ts on the hub): one row each, led by the service's
   * mark, with the account it signs in as and its state, both the hub's
   * word, and which projects may use it. A row that is not signed in carries
   * its way in: Sign in (OAuth, in a tab of its own, the row turning signed
   * in when the hub says so) or Set key (a field under the row, emptied the
   * moment the hub has the key). ⋯ holds Projects… (a checklist) and Remove,
   * which asks on the row (The Open Page Rule).
   */
  import type { ConnectionView } from "@cawco/core";
  import { onMount } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import Field from "#lib/cawco/config/Field.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow, {
    type RowNote,
  } from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { json, send } from "#lib/cawco/project-tasks.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconConnection,
    IconPlus,
    IconToolTodo,
    IconTrash,
  } from "#lib/icons.js";

  const section = sectionOf("connections");

  /** A field that opens on a press takes the next keystroke. */
  const focusOnOpen = (node: HTMLElement) => {
    node.focus({ preventScroll: true });
  };

  let rows = $state<ConnectionView[]>([]);
  let loaded = $state(false);
  let readError = $state<string | null>(null);
  /** What a row's last action came to, when it failed: by connection name. */
  let problems = $state<Record<string, string>>({});

  const path = (name: string) => `/api/connections/${encodeURIComponent(name)}`;

  async function read() {
    try {
      ({ connections: rows } = await send<{ connections: ConnectionView[] }>(
        "/api/connections"
      ));
      loaded = true;
      readError = null;
    } catch (error) {
      readError = `Could not read the connections — ${failureClause(error)}.`;
    }
  }

  onMount(() => {
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
    void read();
    return () => {
      for (const watch of Object.values(watches)) {
        clearInterval(watch);
      }
    };
  });

  const serviceOf = (row: ConnectionView) =>
    SERVICES.find((each) => each.service === row.service.toLowerCase());
  const labelOf = (row: ConnectionView) => serviceOf(row)?.label ?? row.service;
  const takesKey = (row: ConnectionView) =>
    row.auth === "bearer" || row.auth === "header";

  /** The hub's state, as the row's word. */
  const STATE = {
    "signed-in": { label: "Signed in", variant: "done" },
    "needs-sign-in": { label: "Not signed in", variant: "secondary" },
    error: { label: "Failing", variant: "attn" },
  } as const;

  /** The hub's reasons the row's own button already says. */
  const SAID_BY_BUTTON = new Set([
    "Sign in.",
    "Set its key.",
    "A sign-in is under way.",
  ]);

  /** The line under a row: its sign-in under way, its last failure, or the hub's reason. */
  function noteOf(row: ConnectionView): RowNote | undefined {
    if (signing[row.name]) {
      return {
        tone: "busy",
        text: `${labelOf(row)}'s sign-in is open in a new tab; this row turns signed in when you finish there.`,
      };
    }
    const problem = problems[row.name];
    if (problem) {
      return { tone: "fail", text: problem };
    }
    if (
      row.state !== "signed-in" &&
      row.reason &&
      !SAID_BY_BUTTON.has(row.reason)
    ) {
      return { tone: "fail", text: row.reason };
    }
    return undefined;
  }

  /** Up to two of the projects that may use it, then "+N". */
  const shownOf = (row: ConnectionView) => {
    const names = row.projects.flatMap((id) => {
      const project = cawco.projects.find((each) => each.id === id);
      return project ? [project.name] : [];
    });
    return { chips: names.slice(0, 2), more: names.length - 2 };
  };

  // --- Sign in: a tab of its own; the row says so until the hub's word ---

  let signing = $state<Record<string, boolean>>({});
  const watches: Record<string, ReturnType<typeof setInterval>> = {};
  /** How often a sign-in under way re-reads the hub. Our choice. */
  const WATCH_MS = 2000;

  function stopWatching(name: string) {
    clearInterval(watches[name]);
    delete watches[name];
    signing[name] = false;
  }

  /** Re-reads the hub while the sign-in tab is open, until the row moves on. */
  function watchSignIn(name: string, tab: Window) {
    clearInterval(watches[name]);
    watches[name] = setInterval(async () => {
      const { closed } = tab;
      await read();
      const row = rows.find((each) => each.name === name);
      if (row?.reason !== "A sign-in is under way.") {
        stopWatching(name);
        return;
      }
      if (closed) {
        stopWatching(name);
        problems[name] = "The sign-in tab closed before it finished.";
      }
    }, WATCH_MS);
  }

  /** Starts `name`'s OAuth sign-in in `tab`, opened by the press itself so no pop-up blocker stops it. */
  async function startSignIn(name: string, tab: Window) {
    signing[name] = true;
    delete problems[name];
    try {
      const { authorizationUrl } = await send<{ authorizationUrl: string }>(
        `${path(name)}/sign-in`,
        json("POST", { origin: window.location.origin })
      );
      tab.location.assign(authorizationUrl);
      watchSignIn(name, tab);
    } catch (error) {
      tab.close();
      signing[name] = false;
      problems[name] = failureWords(error);
    }
    await read();
  }

  const BLOCKED =
    "The browser blocked the sign-in tab. Allow pop-ups for this page, then try again.";

  function signIn(row: ConnectionView) {
    const tab = window.open("", "_blank");
    if (!tab) {
      problems[row.name] = BLOCKED;
      return;
    }
    // biome-ignore lint/complexity/noVoid: the sign-in reports its own outcome on its row
    void startSignIn(row.name, tab);
  }

  // --- Set key: a field under the row, emptied once the hub holds it ---

  let keying = $state<string | null>(null);
  let key = $state("");
  let keyPending = $state(false);

  async function saveKey(row: ConnectionView) {
    keyPending = true;
    delete problems[row.name];
    try {
      await send<ConnectionView>(`${path(row.name)}/key`, json("PUT", { key }));
      key = "";
      keying = null;
    } catch (error) {
      problems[row.name] = failureWords(error);
    } finally {
      keyPending = false;
    }
    await read();
  }

  // --- Sign in to a service: the account's words, then its way in ---

  let adding = $state<Service | null>(null);
  let account = $state("");
  let addKey = $state("");
  let addPending = $state(false);
  let addProblem = $state<string | null>(null);

  function startAdding(service: Service) {
    adding = service;
    account = "";
    addKey = "";
    addProblem = null;
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const service = adding;
    if (!service) {
      return;
    }
    // The sign-in tab opens on the press, before anything is awaited.
    const tab = service.auth === "oauth" ? window.open("", "_blank") : null;
    if (service.auth === "oauth" && !tab) {
      addProblem = BLOCKED;
      return;
    }
    const name = nameFor(service.service, account);
    addPending = true;
    addProblem = null;
    try {
      await send<ConnectionView>(
        "/api/connections",
        json("POST", {
          name,
          service: service.service,
          account: account.trim(),
          transport: "http",
          url: service.url,
          auth: service.auth,
        })
      );
    } catch (error) {
      tab?.close();
      addProblem = failureWords(error);
      addPending = false;
      return;
    }
    // The row exists now: what follows is said on it.
    const typed = addKey;
    addKey = "";
    adding = null;
    addPending = false;
    await read();
    if (tab) {
      await startSignIn(name, tab);
      return;
    }
    try {
      await send<ConnectionView>(
        `${path(name)}/key`,
        json("PUT", { key: typed })
      );
    } catch (error) {
      problems[name] = failureWords(error);
    }
    await read();
  }

  // --- Remove: asked on the row it removes (The Open Page Rule) ---

  let removing = $state<string | null>(null);
  let removePending = $state(false);
  async function remove(row: ConnectionView) {
    removePending = true;
    delete problems[row.name];
    try {
      await send(path(row.name), { method: "DELETE" });
      removing = null;
      stopWatching(row.name);
    } catch (error) {
      problems[row.name] = failureWords(error);
    } finally {
      removePending = false;
    }
    await read();
  }

  // --- Projects… -----------------------------------------------------------

  let choosing = $state<ConnectionView | null>(null);
  let chooseAnchor = $state<HTMLElement | null>(null);
  function chooseFor(row: ConnectionView) {
    // Rows are named by their service, which two accounts share: the row
    // is found by its place in the list.
    const at = rows.findIndex((each) => each.name === row.name);
    chooseAnchor =
      document
        .querySelectorAll<HTMLElement>(
          'ul[aria-label="Connections"] > [data-row-name]'
        )
        [at]?.querySelector<HTMLElement>(".controls") ?? null;
    choosing = row;
  }
  async function toggle(row: ConnectionView, project: string, on: boolean) {
    const projects = on
      ? [...new Set([...row.projects, project])]
      : row.projects.filter((each) => each !== project);
    delete problems[row.name];
    try {
      const next = await send<ConnectionView>(
        path(row.name),
        json("PATCH", { projects })
      );
      rows = rows.map((each) => (each.name === next.name ? next : each));
      choosing = next;
    } catch (error) {
      problems[row.name] = failureWords(error);
    }
  }
</script>

{#snippet signInMenu(blocked: string | null)}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger disabled={blocked !== null}>
      {#snippet child({ props })}
        <Button
          {...props}
          icon={IconPlus}
          label="Sign in to a service"
          title={blocked ?? undefined}
        />
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-auto min-w-44">
      {#each SERVICES as service (service.service)}
        <DropdownMenu.Item onSelect={() => startAdding(service)}>
          <ProviderLogo provider={service.service} />
          <span>{service.label}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<!-- The sign-in form opens where it was asked for: under the empty
     state's cards, or at the head of the list under its menu. -->
{#snippet addForm(service: Service)}
  <form
    data-slot="add"
    aria-label="Sign in to {service.label}"
    class="add"
    onsubmit={add}
    transition:unfold
  >
    <p class="add-head mark-line">
      <ProviderLogo provider={service.service} />
      <span>Sign in to {service.label}</span>
    </p>
    <Field
      hint="Two accounts of one service are two connections."
      id="connection-account"
      label="Which {service.label} account"
    >
      <Input
        autocomplete="off"
        id="connection-account"
        placeholder="brand, or your handle"
        required
        {@attach focusOnOpen}
        bind:value={account}
      />
    </Field>
    {#if service.auth === "bearer"}
      <Field hint={service.key} id="connection-key" label="{service.label} key">
        <Input
          autocomplete="off"
          id="connection-key"
          required
          type="password"
          bind:value={addKey}
        />
      </Field>
    {/if}
    {#if addProblem}
      <p class="add-problem" role="alert" transition:unfold>{addProblem}</p>
    {/if}
    <div class="buttons">
      <Button
        disabled={addPending}
        label="Cancel"
        onclick={() => {
          adding = null;
          addKey = "";
        }}
        size="sm"
        variant="ghost"
      />
      <Button
        class="pressable"
        label="Sign in"
        pending={addPending}
        pendingLabel="Signing in…"
        size="sm"
        type="submit"
      />
    </div>
  </form>
{/snippet}

<SectionFrame
  problem={readError}
  purpose={section.purpose}
  ready={loaded}
  title={section.label}
>
  {#snippet actions(blocked)}
    {#if rows.length > 0}
      {@render signInMenu(blocked)}
    {/if}
  {/snippet}

  {#if adding && rows.length > 0}
    {@render addForm(adding)}
  {/if}

  {#if rows.length === 0}
    <!-- The Empty Starts Work Rule, its by-hand branch: a sign-in is the
         service asking you, so Caw can't start it. The line says so, and
         each card signs in to one service, its row then saying how it goes. -->
    <div data-slot="connections-page-empty" class="empty">
      <p data-slot="empty-line" class="empty-line">
        Each service asks you, not Caw, to let the hub in, so signing in is
        yours. The projects you allow then read from it and act through it.
      </p>
      <ul data-slot="cards" aria-label="Services" class="cards">
        {#each SERVICES as service (service.service)}
          <li>
            <button
              data-slot="connections-page-card"
              class="card mark-line press-tint"
              onclick={() => startAdding(service)}
              type="button"
            >
              <ProviderLogo provider={service.service} />
              <span>Sign in to {service.label}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if adding}
        {@render addForm(adding)}
      {/if}
    </div>
  {:else}
    <RowList label="Connections">
      {#each rows as row (row.id)}
        {@const shown = shownOf(row)}
        {@const marked = MARKED.has(row.service.toLowerCase())}
        <SectionRow
          actions={[
            {
              label: "Projects…",
              icon: IconToolTodo,
              onselect: () => chooseFor(row),
            },
            {
              label: "Remove",
              icon: IconTrash,
              destructive: true,
              onselect: () => {
                removing = row.name;
              },
            },
          ]}
          meta={row.account}
          name={labelOf(row)}
          note={noteOf(row)}
        >
          {#snippet tile()}
            {#if marked}
              <ProviderLogo provider={row.service.toLowerCase()} />
            {:else}
              <IconConnection />
            {/if}
          {/snippet}
          {#snippet below()}
            {#if keying === row.name}
              <form
                data-slot="row-ask"
                aria-label="{labelOf(row)} key"
                class="row-ask"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveKey(row);
                }}
                transition:unfold
              >
                <Input
                  aria-label="{labelOf(row)} key for {row.account}"
                  autocomplete="off"
                  class="key"
                  required
                  type="password"
                  {@attach focusOnOpen}
                  bind:value={key}
                />
                <Button
                  class="pressable"
                  label="Save key"
                  pending={keyPending}
                  pendingLabel="Saving…"
                  size="xs"
                  type="submit"
                />
                <Button
                  class="pressable"
                  label="Cancel"
                  onclick={() => {
                    keying = null;
                    key = "";
                  }}
                  size="xs"
                  variant="ghost"
                />
              </form>
            {/if}
            {#if removing === row.name}
              <fieldset
                data-slot="row-ask"
                aria-label="Remove {labelOf(row)}"
                class="row-ask"
                transition:unfold
              >
                <span
                  >Remove {labelOf(row)}? The hub forgets its key for {row.account};
                  routines that use it stop at their next run until it is signed
                  in again.</span
                >
                <Button
                  class="pressable"
                  label="Remove connection"
                  onclick={() => remove(row)}
                  pending={removePending}
                  pendingLabel="Removing…"
                  size="xs"
                  variant="destructive"
                />
                <Button
                  class="pressable"
                  label="Cancel"
                  onclick={() => {
                    removing = null;
                  }}
                  size="xs"
                  variant="ghost"
                />
              </fieldset>
            {/if}
          {/snippet}
          {#snippet badge()}
            <Badge data-state={row.state} variant={STATE[row.state].variant}
              ><span>{STATE[row.state].label}</span></Badge
            >
          {/snippet}
          {#snippet trailing()}
            {#if shown.chips.length > 0}
              <span class="projects">
                <span class="sr-only">Projects that may use it:</span>
                {#each shown.chips as chip (chip)}
                  <Badge variant="secondary"><span>{chip}</span></Badge>
                {/each}
                {#if shown.more > 0}
                  <Badge variant="ghost"
                    ><span data-slot="num" class="num">+{shown.more}</span
                    ></Badge
                  >
                {/if}
              </span>
            {/if}
            {#if row.state !== "signed-in" && row.auth === "oauth"}
              <Button
                class="pressable"
                label="Sign in"
                onclick={() => signIn(row)}
                pending={signing[row.name] ?? false}
                pendingLabel="Signing in…"
                size="sm"
                variant="outline"
              />
            {:else if row.state !== "signed-in" && takesKey(row) && keying !== row.name}
              <Button
                class="pressable"
                label="Set key"
                onclick={() => {
                  key = "";
                  keying = row.name;
                }}
                size="sm"
                variant="outline"
              />
            {/if}
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}
</SectionFrame>

<Popover.Root
  bind:open={
    () => choosing !== null,
    (next) => {
      if (!next) {
        choosing = null;
      }
    }
  }
>
  <Popover.Content align="end" class="w-64" customAnchor={chooseAnchor}>
    {#if choosing}
      {@const row = choosing}
      <p class="pick-head">Projects that may use {labelOf(row)}</p>
      <ul class="checklist">
        {#each cawco.projects as project (project.id)}
          <li>
            <!-- biome-ignore lint/a11y/noLabelWithoutControl: the kit Checkbox renders the control the label names -->
            <label class="kit-item check">
              <Checkbox
                data-box
                bind:checked={
                  () => row.projects.includes(project.id),
                  (on) => toggle(row, project.id, on)
                }
              />
              <span>{project.name}</span>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
  </Popover.Content>
</Popover.Root>

<style>
  .projects {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .row-ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
    font: var(--type-meta);
    color: var(--ink-strong);
  }
  .row-ask :global(.key) {
    flex: 1 1 14rem;
    min-inline-size: 0;
    max-inline-size: 24rem;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-inline-size: 72ch;
    margin-block-end: var(--space-4);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
  }
  .add-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .add-head :global(svg),
  .card :global(svg) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .add-problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
    overflow-wrap: anywhere;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    container-type: inline-size;
  }
  .empty-line {
    max-inline-size: 72ch;
    font: var(--type-body);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  /* The starter cards' recipe (StarterCards.svelte): raised, the tile
     shadow, every card one height, one column when narrow. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: 1fr;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @container (min-width: 30rem) {
    .cards {
      grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, var(--c-starter-w)), 1fr)
      );
    }
  }
  .card {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    block-size: 100%;
    min-block-size: var(--c-starter-h);
    padding: var(--space-3);
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) {
    .card:hover {
      background: var(--surface-hover);
    }
  }
  .card:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .pick-head {
    padding: var(--space-2) var(--space-2) var(--space-1);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .checklist {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    padding-inline: var(--space-2);
    font: var(--type-label);
    color: var(--ink-strong);
    cursor: pointer;
  }
</style>
