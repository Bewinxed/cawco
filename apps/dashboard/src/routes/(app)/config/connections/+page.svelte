<script lang="ts" module>
  import type { ConnectionAuth } from "@cawco/core";

  /**
   * One way the hub signs in to a service: how (`auth`), what it is called
   * where it is picked, and what it takes, said under the pick.
   */
  export interface Way {
    auth: Extract<ConnectionAuth, "oauth" | "bearer" | "app">;
    /** What the key is, said under its field. */
    key?: string;
    label: string;
    /** What the way is for, under the pick. */
    says: string;
  }

  /**
   * A service the page can start a connection to: its MCP server and the
   * ways the hub signs in there, the first the one offered first.
   * - GitHub: "To access resources on behalf of an organization, or for
   *   long-lived integrations, you should use a GitHub App"
   *   (docs.github.com, managing your personal access tokens); its remote
   *   MCP server takes the app's `ghs_` token or a token as
   *   `Authorization: Bearer` (github/github-mcp-server#696). A project's
   *   tracker needs "Issues" (write) (docs.github.com, create an issue).
   * - Linear: an app acting as itself ("This option should be used for
   *   agents and service accounts", linear.app/developers/oauth-2-0-authentication),
   *   or an API key, both of which its MCP server takes as a bearer
   *   (linear.app/docs/mcp); or its MCP server's own sign-in, "OAuth 2.1 with
   *   dynamic client registration", whose token is for its MCP server alone.
   * - Slack: "We do not support SSE-based connections or Dynamic Client
   *   Registration at this time" (docs.slack.dev/ai/slack-mcp-server), so a
   *   user token, as Bearer.
   */
  export interface Service {
    label: string;
    service: string;
    url: string;
    ways: Way[];
  }

  export const SERVICES: Service[] = [
    {
      service: "github",
      label: "GitHub",
      url: "https://api.githubcopilot.com/mcp/",
      ways: [
        {
          auth: "app",
          label: "GitHub App",
          says: "An app you register and install on the projects' repositories, with Issues: read and write. It acts as itself.",
        },
        {
          auth: "bearer",
          label: "Token",
          says: "A fine-grained personal access token limited to the projects' repositories, with Issues: read and write.",
          key: "It acts as you.",
        },
      ],
    },
    {
      service: "linear",
      label: "Linear",
      url: "https://mcp.linear.app/mcp",
      ways: [
        {
          auth: "app",
          label: "Linear app",
          says: "An OAuth app you create in Linear's settings. It acts as itself, with read and write.",
        },
        {
          auth: "bearer",
          label: "API key",
          says: "A personal API key limited to the projects' teams.",
          key: "It acts as you.",
        },
        {
          auth: "oauth",
          label: "Sign in",
          says: "Linear's own sign-in, for agents' Linear tools. A project's tasks need a Linear app or an API key.",
        },
      ],
    },
    {
      service: "slack",
      label: "Slack",
      url: "https://mcp.slack.com/mcp",
      ways: [
        {
          auth: "bearer",
          label: "User token",
          says: "A Slack user token from your Slack app.",
          key: "A Slack user token (xoxp-…) from your Slack app.",
        },
      ],
    },
  ];

  /** What an app connection is set with, before the hub holds it. */
  export interface AppDraft {
    appId: string;
    clientId: string;
    clientSecret: string;
    installationId: string;
    privateKey: string;
  }

  export const emptyApp = (): AppDraft => ({
    appId: "",
    installationId: "",
    privateKey: "",
    clientId: "",
    clientSecret: "",
  });

  /** The registration a service's app is set with, from what was typed. */
  export const appBody = (service: string, draft: AppDraft) =>
    service === "github"
      ? {
          appId: draft.appId,
          installationId: draft.installationId,
          privateKey: draft.privateKey,
        }
      : { clientId: draft.clientId, clientSecret: draft.clientSecret };

  /** Whether a way signs in through a page of the service's own, in a tab. */
  export const signsInByPage = (service: string, way: Way): boolean =>
    way.auth === "oauth" || (way.auth === "app" && service === "linear");

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
   * its way in: Sign in (OAuth, or a Linear app, in a tab of its own, the
   * row turning signed in when the hub says so), Set key (a field under the
   * row, emptied the moment the hub has the key) or Set app (a GitHub App's
   * or a Linear app's registration, under the row). Signing in to a service
   * that has more than one way asks which first. ⋯ holds Projects… (a
   * checklist) and Remove, which goes through at once with Undo in its toast
   * (JOURNEY.md Flow 5).
   */
  import type { ConnectionView, Deleted } from "@cawco/core";
  import { onMount } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import Field from "#lib/cawco/config/Field.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow, {
    type RowNote,
  } from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { offerUndo } from "#lib/cawco/config/undo.js";
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
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import {
    IconConnection,
    IconEye,
    IconEyeClosed,
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

  /** Where a Linear app's sign-in comes back: the URL its settings must list. */
  let callbackUrl = $state("");

  onMount(() => {
    callbackUrl = `${window.location.origin}/api/connections/oauth/callback`;
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
  /**
   * An app connection whose registration is owed: none held yet, or a
   * GitHub App's that GitHub refused (it signs in with nothing else).
   */
  const needsApp = (row: ConnectionView) =>
    row.auth === "app" && (!row.app || row.app.service === "github");
  /** A row that signs in through the service's page: OAuth, or a Linear app once set. */
  const signsIn = (row: ConnectionView) =>
    row.auth === "oauth" ||
    (row.auth === "app" && row.app?.service === "linear");

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
    "Set its app.",
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

  // --- Set app: a GitHub App's or a Linear app's registration, under the row ---

  let appFor = $state<string | null>(null);
  let rowApp = $state<AppDraft>(emptyApp());
  let appPending = $state(false);
  /** Each secret field shown in the clear, by its id. */
  let revealed = $state<Record<string, boolean>>({});

  async function saveApp(row: ConnectionView) {
    // A Linear app signs in once it is set: its tab opens on the press.
    const tab =
      row.service.toLowerCase() === "linear" ? openTab(row.name) : null;
    if (row.service.toLowerCase() === "linear" && !tab) {
      return;
    }
    appPending = true;
    delete problems[row.name];
    try {
      await send<ConnectionView>(
        `${path(row.name)}/app`,
        json("PUT", appBody(row.service.toLowerCase(), rowApp))
      );
      rowApp = emptyApp();
      appFor = null;
    } catch (error) {
      tab?.close();
      problems[row.name] = failureWords(error);
      appPending = false;
      return;
    }
    appPending = false;
    await read();
    if (tab) {
      await startSignIn(row.name, tab);
    }
  }

  /** A tab for a sign-in, opened by the press itself; a blocked one is said on its row. */
  function openTab(name: string): Window | null {
    const tab = window.open("", "_blank");
    if (!tab) {
      problems[name] = BLOCKED;
    }
    return tab;
  }

  // --- Sign in to a service: the way, the account's words, then its way in ---

  let adding = $state<Service | null>(null);
  let addWay = $state<Way | null>(null);
  let account = $state("");
  let addKey = $state("");
  let addApp = $state<AppDraft>(emptyApp());
  let addPending = $state(false);
  let addProblem = $state<string | null>(null);

  function startAdding(service: Service) {
    adding = service;
    addWay = service.ways[0] ?? null;
    account = "";
    addKey = "";
    addApp = emptyApp();
    addProblem = null;
  }

  function stopAdding() {
    adding = null;
    addKey = "";
    addApp = emptyApp();
  }

  /** What follows the row's making: its key, or its app, said on the row when refused. */
  async function setUp(name: string, service: string, way: Way) {
    const typedKey = addKey;
    const typedApp = addApp;
    addKey = "";
    addApp = emptyApp();
    if (way.auth === "oauth") {
      return true;
    }
    try {
      await send<ConnectionView>(
        way.auth === "app" ? `${path(name)}/app` : `${path(name)}/key`,
        json(
          "PUT",
          way.auth === "app" ? appBody(service, typedApp) : { key: typedKey }
        )
      );
      return true;
    } catch (error) {
      problems[name] = failureWords(error);
      return false;
    }
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const service = adding;
    const way = addWay;
    if (!(service && way)) {
      return;
    }
    // The sign-in tab opens on the press, before anything is awaited.
    const byPage = signsInByPage(service.service, way);
    const tab = byPage ? window.open("", "_blank") : null;
    if (byPage && !tab) {
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
          auth: way.auth,
        })
      );
    } catch (error) {
      tab?.close();
      addProblem = failureWords(error);
      addPending = false;
      return;
    }
    // The row exists now: what follows is said on it.
    adding = null;
    addPending = false;
    await read();
    const ready = await setUp(name, service.service, way);
    if (!tab) {
      await read();
      return;
    }
    if (ready) {
      await startSignIn(name, tab);
      return;
    }
    tab.close();
    await read();
  }

  // --- Remove: at once, with Undo in the toast (config/undo.ts) ---

  /** The connection whose removal the hub is taking. */
  let removing = $state<string | null>(null);
  async function remove(row: ConnectionView) {
    removing = row.name;
    delete problems[row.name];
    try {
      const deleted = await send<Deleted>(path(row.name), { method: "DELETE" });
      stopWatching(row.name);
      // The hub puts it back whole, key and projects with it; the list is
      // read again, as after every change here.
      offerUndo(`deleted:${row.name}`, `Removed ${labelOf(row)}`, deleted, () =>
        read()
      );
    } catch (error) {
      problems[row.name] = failureWords(error);
    } finally {
      removing = null;
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
        [at]?.querySelector<HTMLElement>('[data-slot="controls"]') ?? null;
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
    <DropdownMenu.Content align="end" class="w-auto" min="regular">
      {#each SERVICES as service (service.service)}
        <DropdownMenu.Item onSelect={() => startAdding(service)}>
          <ProviderLogo provider={service.service} />
          <span>{service.label}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<!-- A secret typed in the kit's password field, with show and hide. -->
{#snippet secret(
  id: string,
  label: string,
  hint: string,
  draft: AppDraft,
  key: "clientSecret" | "privateKey"
)}
  <Field {hint} {id} {label}>
    <InputGroup.Root>
      <InputGroup.Input
        autocomplete="off"
        {id}
        required
        spellcheck="false"
        type={revealed[id] ? "text" : "password"}
        bind:value={draft[key]}
      />
      <InputGroup.Addon align="inline-end">
        <InputGroup.Button
          aria-label={revealed[id]
            ? `Hide the ${label.toLowerCase()}`
            : `Show the ${label.toLowerCase()}`}
          aria-pressed={revealed[id] ?? false}
          onclick={() => {
            revealed[id] = !revealed[id];
          }}
          size="icon-xs"
        >
          {#if revealed[id]}
            <IconEyeClosed />
          {:else}
            <IconEye />
          {/if}
        </InputGroup.Button>
      </InputGroup.Addon>
    </InputGroup.Root>
  </Field>
{/snippet}

<!-- An app's registration: a GitHub App's ids and private key, or a
     Linear app's client id and secret with the callback its settings list. -->
{#snippet appFields(service: string, draft: AppDraft, at: string)}
  {#if service === "github"}
    <Field
      hint="On the GitHub App's settings page: its App ID, or its client ID."
      id="{at}-app-id"
      label="App ID"
    >
      <Input
        autocomplete="off"
        id="{at}-app-id"
        inputmode="numeric"
        required
        spellcheck="false"
        bind:value={draft.appId}
      />
    </Field>
    <Field
      hint="The number at the end of the installation's settings URL."
      id="{at}-installation"
      label="Installation ID"
    >
      <Input
        autocomplete="off"
        id="{at}-installation"
        inputmode="numeric"
        required
        spellcheck="false"
        bind:value={draft.installationId}
      />
    </Field>
    {@render secret(
      `${at}-private-key`,
      "Private key",
      "The .pem file's text, from Generate a private key. The hub keeps it sealed.",
      draft,
      "privateKey"
    )}
  {:else}
    <!-- literal: 72ch -->
    <p
      data-slot="callback"
      class="flex min-w-0 max-w-(--app-measure) flex-col gap-space-1 type-meta text-ink-muted"
      style:--app-measure="72ch"
    >
      <span>Add this callback URL to the app in Linear:</span>
      <code class="min-w-0 font-mono text-ink-strong wrap-anywhere select-all"
        >{callbackUrl}</code
      >
    </p>
    <Field
      hint="On the app's page in Linear's settings."
      id="{at}-client-id"
      label="Client ID"
    >
      <Input
        autocomplete="off"
        id="{at}-client-id"
        required
        spellcheck="false"
        bind:value={draft.clientId}
      />
    </Field>
    {@render secret(
      `${at}-client-secret`,
      "Client secret",
      "The hub keeps it sealed.",
      draft,
      "clientSecret"
    )}
  {/if}
{/snippet}

<!-- The sign-in form opens where it was asked for: under the empty
     state's cards, or at the head of the list under its menu. -->
{#snippet addForm(service: Service)}
  <!-- literal: 72ch -->
  <form
    data-slot="add"
    aria-label="Sign in to {service.label}"
    class="mb-space-4 flex max-w-(--measure) flex-col gap-space-3 rounded-md bg-surface-recess p-space-4"
    onsubmit={add}
    style:--measure="72ch"
    transition:unfold
  >
    <p
      class="mark-line type-label flex items-center gap-space-2 text-ink-strong"
    >
      <ProviderLogo class="size-icon-md flex-none" provider={service.service} />
      <span>Sign in to {service.label}</span>
    </p>
    {#if service.ways.length > 1}
      <div data-slot="way" class="flex min-w-0 flex-col gap-space-1">
        <p class="type-meta text-ink-muted" id="connection-way">
          Signs in with
        </p>
        <ToggleGroup.Root
          aria-labelledby="connection-way"
          class="max-w-full flex-wrap self-start"
          type="single"
          bind:value={
            () => addWay?.label ?? "",
            (next) => {
              addWay =
                service.ways.find((each) => each.label === next) ?? addWay;
            }
          }
        >
          {#each service.ways as way (way.label)}
            <ToggleGroup.Item value={way.label}>{way.label}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
        {#if addWay}
          <!-- literal: 72ch -->
          <p
            class="max-w-(--app-measure) type-meta text-pretty text-ink-muted"
            data-way-says
            style:--app-measure="72ch"
          >
            {addWay.says}
          </p>
        {/if}
      </div>
    {/if}
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
    {#if addWay?.auth === "bearer"}
      <Field hint={addWay.key} id="connection-key" label="{service.label} key">
        <Input
          autocomplete="off"
          id="connection-key"
          required
          type="password"
          bind:value={addKey}
        />
      </Field>
    {:else if addWay?.auth === "app"}
      {@render appFields(service.service, addApp, "connection")}
    {/if}
    {#if addProblem}
      <p
        class="type-meta wrap-anywhere text-status-fail-ink"
        role="alert"
        transition:unfold
      >
        {addProblem}
      </p>
    {/if}
    <div class="flex justify-end gap-space-2">
      <Button
        disabled={addPending}
        label="Cancel"
        onclick={stopAdding}
        size="sm"
        variant="ghost"
      />
      <Button
        press="pressable"
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
    <!-- literal: 72ch -->
    <div
      data-slot="connections-page-empty"
      class="@container flex flex-col gap-space-3"
    >
      <p
        data-slot="empty-line"
        class="type-body max-w-(--measure) text-pretty text-ink-muted"
        style:--measure="72ch"
      >
        Each service asks you, not Caw, to let the hub in, so signing in is
        yours. The projects you allow then read from it and act through it.
      </p>
      <!-- The starter cards' recipe (StarterCards.svelte): raised, the tile
           shadow, every card one height, one column when narrow. -->
      <!-- literal: minmax(0, 1fr), 1fr; auto-fill tracks of min(100%, the starter's width) -->
      <ul
        data-slot="cards"
        aria-label="Services"
        class="m-0 grid list-none auto-rows-(--cards-rows) grid-cols-(--cards-cols) gap-space-2 p-0 @details:grid-cols-(--cards-cols-wide)"
        style:--cards-cols="minmax(0, 1fr)"
        style:--cards-cols-wide={"repeat(auto-fill, minmax(min(100%, var(--c-starter-w)), 1fr))"}
        style:--cards-rows="1fr"
      >
        {#each SERVICES as service (service.service)}
          <li>
            <button
              data-slot="connections-page-card"
              class="mark-line press-tint type-label flex size-full min-h-c-starter-h cursor-pointer items-center gap-space-2 rounded-lg border-none border-current bg-surface-raised p-space-3 text-start text-ink-strong shadow-tile transition-[background-color] dur-control ease-out hover:bg-surface-hover focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
              onclick={() => startAdding(service)}
              type="button"
            >
              <ProviderLogo
                class="size-icon-md flex-none"
                provider={service.service}
              />
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
            ...(row.auth === "app"
              ? [
                  {
                    label: "Set app…",
                    icon: IconConnection,
                    onselect: () => {
                      rowApp = emptyApp();
                      appFor = row.name;
                    },
                  },
                ]
              : []),
            {
              label: "Remove",
              icon: IconTrash,
              destructive: true,
              disabled: removing === row.name,
              onselect: () => remove(row),
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
            {#if appFor === row.name}
              <!-- literal: 72ch -->
              <form
                data-slot="row-app"
                aria-label="{labelOf(row)} app"
                class="m-0 flex min-w-0 max-w-(--app-measure) flex-col gap-space-3 py-space-2"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveApp(row);
                }}
                style:--app-measure="72ch"
                transition:unfold
              >
                {@render appFields(
                  row.service.toLowerCase(),
                  rowApp,
                  `app-${row.name}`
                )}
                <div class="flex justify-end gap-space-2">
                  <Button
                    press="pressable"
                    disabled={appPending}
                    label="Cancel"
                    onclick={() => {
                      appFor = null;
                      rowApp = emptyApp();
                    }}
                    size="xs"
                    variant="ghost"
                  />
                  <Button
                    press="pressable"
                    label="Save app"
                    pending={appPending}
                    pendingLabel="Saving…"
                    size="xs"
                    type="submit"
                  />
                </div>
              </form>
            {/if}
            {#if keying === row.name}
              <!-- literal: 14rem, 24rem -->
              <form
                data-slot="row-ask"
                aria-label="{labelOf(row)} key"
                class="m-0 flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 border-none border-current p-0 type-meta text-ink-strong"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveKey(row);
                }}
                style:--key-basis="14rem"
                style:--key-max="24rem"
                transition:unfold
              >
                <Input
                  aria-label="{labelOf(row)} key for {row.account}"
                  autocomplete="off"
                  required
                  type="password"
                  {@attach focusOnOpen}
                  bind:value={key}
                />
                <Button
                  press="pressable"
                  label="Save key"
                  pending={keyPending}
                  pendingLabel="Saving…"
                  size="xs"
                  type="submit"
                />
                <Button
                  press="pressable"
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
          {/snippet}
          {#snippet badge()}
            <Badge data-state={row.state} variant={STATE[row.state].variant}
              ><span>{STATE[row.state].label}</span></Badge
            >
          {/snippet}
          {#snippet trailing()}
            {#if shown.chips.length > 0}
              <span class="inline-flex flex-wrap items-center gap-space-1">
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
            {#if row.state !== "signed-in" && needsApp(row) && appFor !== row.name}
              <Button
                press="pressable"
                label="Set app"
                onclick={() => {
                  rowApp = emptyApp();
                  appFor = row.name;
                }}
                size="sm"
                variant="outline"
              />
            {:else if row.state !== "signed-in" && signsIn(row)}
              <Button
                press="pressable"
                label="Sign in"
                onclick={() => signIn(row)}
                pending={signing[row.name] ?? false}
                pendingLabel="Signing in…"
                size="sm"
                variant="outline"
              />
            {:else if row.state !== "signed-in" && takesKey(row) && keying !== row.name}
              <Button
                press="pressable"
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
  <Popover.Content align="end" customAnchor={chooseAnchor} width="narrow">
    {#if choosing}
      {@const row = choosing}
      <p class="type-label px-space-2 pt-space-2 pb-space-1 text-ink-strong">
        Projects that may use {labelOf(row)}
      </p>
      <ul class="m-0 flex list-none flex-col p-0">
        {#each cawco.projects as project (project.id)}
          <li>
            <!-- biome-ignore lint/a11y/noLabelWithoutControl: the kit Checkbox renders the control the label names -->
            <label
              class="kit-item type-label flex w-full cursor-pointer items-center gap-space-2 px-space-2 text-ink-strong"
            >
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
  /* residual: foreign-dom */
  [data-slot="row-ask"] :global([data-slot="input"]) {
    flex: 1 1 var(--key-basis);
    min-inline-size: 0;
    max-inline-size: var(--key-max);
  }
</style>
