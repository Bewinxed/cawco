<script lang="ts" module>
  import {
    CONNECTION_SERVICES,
    type ConnectionService,
    type ConnectionWay,
  } from "@cawco/core";

  /** One way the hub signs in to a service (core `ConnectionWay`). */
  export type Way = ConnectionWay;
  /** A service the page can start a connection to (core `CONNECTION_SERVICES`, where each one's sources are). */
  export type Service = ConnectionService;

  export const SERVICES: readonly Service[] = CONNECTION_SERVICES;

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

  /** A typed server address as the hub takes one: an http(s) URL, or none. */
  export const serverUrl = (typed: string): string | undefined => {
    try {
      const url = new URL(typed.trim());
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : undefined;
    } catch {
      // Not a URL: no address the hub takes.
    }
  };

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
  import {
    type ConnectionView,
    configureWords,
    type Deleted,
    connectionsWords as words,
  } from "@cawco/core";
  import { onMount } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import Choice from "#lib/cawco/config/Choice.svelte";
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
  import { TabDraft } from "#lib/cawco/tab-draft.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
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
  /**
   * What a row's last action came to, when it failed: by connection name.
   * Kept in this tab through a reload, until the row's next action
   * (DESIGN.md, The Work Outlives Its Surface Rule: a failure stands until
   * the reader acts on it).
   */
  const kept = new TabDraft("cawco:connection-problems", () => ({
    byName: {} as Record<string, string>,
  }));
  const problems = kept.value.byName;

  const path = (name: string) => `/api/connections/${encodeURIComponent(name)}`;

  async function read() {
    try {
      ({ connections: rows } = await send<{ connections: ConnectionView[] }>(
        "/api/connections"
      ));
      loaded = true;
      readError = null;
    } catch (error) {
      readError = words.unread(failureClause(error));
    }
  }

  /** Where a Linear app's sign-in comes back: the URL its settings must list. */
  let callbackUrl = $state("");

  onMount(() => {
    callbackUrl = `${window.location.origin}/api/connections/oauth/callback`;
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
    void read();
    // A refused Undo tried again after a reload (SectionFrame) put one back.
    const reread = () => {
      // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
      void read();
    };
    window.addEventListener("cawco:config-restored", reread);
    return () => window.removeEventListener("cawco:config-restored", reread);
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
    "signed-in": { label: words.stateSignedIn, variant: "done" },
    "needs-sign-in": { label: words.stateNeedsSignIn, variant: "secondary" },
    error: { label: words.stateError, variant: "attn" },
  } as const;

  /** The hub's reasons the row's own button already says. */
  const SAID_BY_BUTTON = new Set([
    words.saidSignIn,
    words.saidSetKey,
    words.saidSetApp,
    words.saidUnderWay,
  ]);

  /**
   * The line under a row: its last failure, its sign-in under way (the
   * hub's, so a reload still says it), or the hub's reason.
   */
  function noteOf(row: ConnectionView): RowNote | undefined {
    const problem = problems[row.name];
    if (problem) {
      return { tone: "fail", text: problem };
    }
    if (signing[row.name] || row.signIn) {
      return {
        tone: "busy",
        text: words.signingInTab(labelOf(row)),
      };
    }
    if (row.state !== "signed-in" && row.reason === words.saidUnderWay) {
      return { tone: "fail", text: words.signInLapsed };
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
  //
  // The sign-in under way is the hub's (`signIn` on its row: the page it
  // was sent to, until it lapses), so a reload still shows it, and the
  // row's button opens that same page again rather than starting another.

  /** A sign-in asked for and not yet answered by the hub. */
  let signing = $state<Record<string, boolean>>({});
  /** The tabs this page opened for sign-ins under way, by connection. */
  const tabs: Record<string, Window> = {};
  /** How often a sign-in under way re-reads the hub. Our choice. */
  const WATCH_MS = 2000;

  // While any row's sign-in is under way the hub is read again, until each
  // moves on; a tab this page opened that closes first is said on its row.
  const underWay = $derived(rows.some((row) => row.signIn !== undefined));
  $effect(() => {
    if (!underWay) {
      return;
    }
    const watch = setInterval(async () => {
      const closed = Object.entries(tabs).filter(([, tab]) => tab.closed);
      await read();
      for (const [name] of closed) {
        delete tabs[name];
        if (rows.find((each) => each.name === name)?.signIn) {
          problems[name] = words.signInClosed;
        }
      }
    }, WATCH_MS);
    return () => clearInterval(watch);
  });

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
      tabs[name] = tab;
    } catch (error) {
      tab.close();
      problems[name] = failureWords(error);
    }
    await read();
    delete signing[name];
  }

  const BLOCKED = words.blocked;

  /**
   * The row's one press: the sign-in under way, opened again where it was,
   * or a new one when none can still finish.
   */
  function signIn(row: ConnectionView) {
    const open = row.signIn;
    const tab = window.open(open ? open.url : "", "_blank");
    if (!tab) {
      problems[row.name] = BLOCKED;
      return;
    }
    if (open) {
      delete problems[row.name];
      tabs[row.name] = tab;
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

  /**
   * The form as typed, kept in this tab so a reload or a trip to another
   * page opens it again as it was (The Work Outlives Its Surface Rule): the
   * service, its way, the account's words, the address, an app's ids, and
   * the refusal it last showed. Never a key or a secret: the form asks for
   * those again and says why (`secretTyped`).
   */
  const addDraft = new TabDraft("cawco:connection-add", () => ({
    service: null as string | null,
    way: null as string | null,
    account: "",
    address: "",
    appId: "",
    installationId: "",
    clientId: "",
    /** A key or secret was typed before the page went away. */
    secretTyped: false,
    problem: null as string | null,
  }));
  const typed = addDraft.value;
  const adding = $derived(
    SERVICES.find((each) => each.service === typed.service) ?? null
  );
  const addWay = $derived(
    adding?.ways.find((way) => way.label === typed.way) ??
      adding?.ways[0] ??
      null
  );
  let addressProblem = $state<string | null>(null);
  let addKey = $state("");
  let addApp = $state<AppDraft>({
    ...emptyApp(),
    appId: typed.appId,
    installationId: typed.installationId,
    clientId: typed.clientId,
  });
  let addPending = $state(false);
  /** The secrets asked for again after a reload, until one is typed. */
  const secretAskedAgain = $derived(
    typed.secretTyped &&
      addKey === "" &&
      addApp.privateKey === "" &&
      addApp.clientSecret === ""
  );
  $effect(() => {
    typed.appId = addApp.appId;
    typed.installationId = addApp.installationId;
    typed.clientId = addApp.clientId;
  });

  function startAdding(service: Service) {
    addDraft.clear();
    typed.service = service.service;
    typed.way = service.ways[0]?.label ?? null;
    typed.address = service.url ?? "";
    addressProblem = null;
    addKey = "";
    addApp = emptyApp();
  }

  function stopAdding() {
    addDraft.clear();
    addKey = "";
    addApp = emptyApp();
  }

  // What the page holds of a secret is only whether one was typed.
  $effect(() => {
    if (
      addKey !== "" ||
      addApp.privateKey !== "" ||
      addApp.clientSecret !== ""
    ) {
      typed.secretTyped = true;
    }
  });

  /** What follows the row's making: its key, or its app, said on the row when refused. */
  async function setUp(
    name: string,
    service: string,
    way: Way,
    typedKey: string,
    typedApp: AppDraft
  ) {
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
    const url = service.serverExample ? serverUrl(typed.address) : service.url;
    if (!url) {
      addressProblem = words.serverAddressProblem;
      return;
    }
    // The sign-in tab opens on the press, before anything is awaited.
    const byPage = signsInByPage(service.service, way);
    const tab = byPage ? window.open("", "_blank") : null;
    if (byPage && !tab) {
      typed.problem = BLOCKED;
      return;
    }
    const name = nameFor(service.service, typed.account);
    addPending = true;
    typed.problem = null;
    try {
      await send<ConnectionView>(
        "/api/connections",
        json("POST", {
          name,
          service: service.service,
          account: typed.account.trim(),
          transport: "http",
          url,
          auth: way.auth,
        })
      );
    } catch (error) {
      tab?.close();
      typed.problem = failureWords(error);
      addPending = false;
      return;
    }
    // The row exists now: what follows is said on it.
    const typedKey = addKey;
    const typedApp = addApp;
    addDraft.clear();
    addPending = false;
    await read();
    const ready = await setUp(name, service.service, way, typedKey, typedApp);
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
      delete tabs[row.name];
      // The hub puts it back whole, key and projects with it; the list is
      // read again, as after every change here.
      offerUndo(
        `deleted:${row.name}`,
        configureWords.removed(labelOf(row)),
        deleted,
        () => read(),
        { section: "/config/connections", name: labelOf(row) }
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
          label={words.signInTo}
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
            ? words.hideSecret(label.toLowerCase())
            : words.showSecret(label.toLowerCase())}
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
    <Field hint={words.appIdHint} id="{at}-app-id" label={words.appId}>
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
      hint={words.installationIdHint}
      id="{at}-installation"
      label={words.installationId}
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
      words.privateKey,
      words.privateKeyHint,
      draft,
      "privateKey"
    )}
  {:else}
    <p
      data-slot="callback"
      class="flex min-w-0 max-w-c-measure flex-col gap-space-1 type-meta text-ink-muted"
    >
      <span>{words.callbackLine}</span>
      <code class="min-w-0 font-mono wrap-anywhere text-ink-strong select-all"
        >{callbackUrl}</code
      >
    </p>
    <Field hint={words.clientIdHint} id="{at}-client-id" label={words.clientId}>
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
      words.clientSecret,
      words.clientSecretHint,
      draft,
      "clientSecret"
    )}
  {/if}
{/snippet}

<!-- The sign-in form opens where it was asked for: under the empty
     state's cards, or at the head of the list under its menu. -->
{#snippet addForm(service: Service)}
  <form
    data-slot="add"
    aria-label={words.signInService(service.label)}
    class="mb-space-4 flex max-w-c-measure flex-col gap-space-3 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
    onsubmit={add}
    transition:unfold
  >
    <p
      class="mark-line type-label flex items-center gap-space-2 text-ink-strong"
    >
      <ProviderLogo class="flex-none" provider={service.service} />
      <span>{words.signInService(service.label)}</span>
    </p>
    {#if service.ways.length > 1}
      <div data-slot="way" class="flex min-w-0 flex-col gap-space-1">
        <p class="type-meta text-ink-muted">{words.signsInWith}</p>
        <Choice
          label={words.signsInWith}
          onchange={(next) => {
            typed.way = next;
          }}
          options={service.ways.map((way) => ({
            value: way.label,
            label: way.label,
          }))}
          value={addWay?.label ?? ""}
        />
        {#if addWay}
          <p
            class="max-w-c-measure type-meta text-pretty text-ink-muted"
            data-way-says
          >
            {addWay.says}
          </p>
        {/if}
      </div>
    {/if}
    {#if service.serverExample}
      <Field
        id="connection-server"
        label={words.serverAddress}
        problem={addressProblem ?? undefined}
      >
        <Input
          autocomplete="off"
          id="connection-server"
          inputmode="url"
          oninput={() => {
            addressProblem = null;
          }}
          oninvalid={(event: Event) => {
            // Said under the field, never as the browser's bubble.
            event.preventDefault();
            addressProblem = words.serverAddressProblem;
          }}
          placeholder={service.serverExample}
          spellcheck="false"
          type="url"
          bind:value={typed.address}
        />
      </Field>
    {/if}
    <Field
      hint={words.accountHint}
      id="connection-account"
      label={words.account(service.label)}
    >
      <Input
        autocomplete="off"
        id="connection-account"
        placeholder={words.accountPlaceholder}
        required
        {@attach focusOnOpen}
        bind:value={typed.account}
      />
    </Field>
    {#if addWay?.auth === "bearer"}
      <Field
        hint={addWay.key}
        id="connection-key"
        label={words.key(service.label)}
      >
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
    {#if secretAskedAgain && addWay && addWay.auth !== "oauth"}
      <p
        data-slot="secret-again"
        class="type-meta max-w-c-measure text-pretty text-ink-muted"
        transition:unfold
      >
        {words.secretNotKept}
      </p>
    {/if}
    {#if typed.problem}
      <p
        data-slot="add-problem"
        class="type-meta wrap-anywhere text-status-fail-ink"
        role="alert"
        transition:unfold
      >
        {typed.problem}
      </p>
    {/if}
    <div class="flex justify-end gap-space-2">
      <Button
        disabled={addPending}
        label={words.cancel}
        onclick={stopAdding}
        size="sm"
        variant="ghost"
      />
      <Button
        press="pressable"
        label={words.signIn}
        pending={addPending}
        pendingLabel={words.signingIn}
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
    <div
      data-slot="connections-page-empty"
      class="@container flex flex-col gap-space-3"
    >
      <p
        data-slot="empty-line"
        class="type-body max-w-c-measure text-pretty text-ink-muted"
      >
        {words.emptyLine}
      </p>
      <!-- The starter cards' recipe (StarterCards.svelte): raised, the tile
           shadow, every card one height, one column when narrow. -->
      <ul
        data-slot="cards"
        aria-label={words.servicesLabel}
        class="grid auto-rows-fr grid-cols-1 gap-space-2 @details:grid-cols-(--cards-cols)"
        style:--cards-cols={"repeat(auto-fill, minmax(min(100%, var(--c-starter-w)), 1fr))"}
      >
        {#each SERVICES as service (service.service)}
          <li>
            <button
              data-slot="connections-page-card"
              class="select-none mark-line press-tint type-label flex size-full min-h-c-starter-h items-center gap-space-2 rounded-lg border-none border-current bg-surface-raised p-space-3 text-start text-ink-strong shadow-tile transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
              onclick={() => startAdding(service)}
              type="button"
            >
              <ProviderLogo class="flex-none" provider={service.service} />
              <span>{words.signInService(service.label)}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if adding}
        {@render addForm(adding)}
      {/if}
    </div>
  {:else}
    <RowList label={words.list}>
      {#each rows as row (row.id)}
        {@const shown = shownOf(row)}
        {@const marked = MARKED.has(row.service.toLowerCase())}
        <SectionRow
          actions={[
            {
              label: words.projects,
              icon: IconToolTodo,
              onselect: () => chooseFor(row),
            },
            ...(row.auth === "app"
              ? [
                  {
                    label: words.setApp,
                    icon: IconConnection,
                    onselect: () => {
                      rowApp = emptyApp();
                      appFor = row.name;
                    },
                  },
                ]
              : []),
            {
              label: words.remove,
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
              <form
                data-slot="row-app"
                aria-label={words.appOf(labelOf(row))}
                class="flex min-w-0 max-w-c-measure flex-col gap-space-3 py-space-2"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveApp(row);
                }}
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
                    label={words.cancel}
                    onclick={() => {
                      appFor = null;
                      rowApp = emptyApp();
                    }}
                    size="xs"
                    variant="ghost"
                  />
                  <Button
                    press="pressable"
                    label={words.saveApp}
                    pending={appPending}
                    pendingLabel={words.saving}
                    size="xs"
                    type="submit"
                  />
                </div>
              </form>
            {/if}
            {#if keying === row.name}
              <form
                data-slot="row-ask"
                aria-label={words.key(labelOf(row))}
                class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-strong"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveKey(row);
                }}
                transition:unfold
              >
                <Input
                  aria-label={words.rowKey(labelOf(row), row.account)}
                  autocomplete="off"
                  class="max-w-c-key-field-max grow basis-c-key-field-basis"
                  measure="shrink"
                  required
                  type="password"
                  {@attach focusOnOpen}
                  bind:value={key}
                />
                <Button
                  press="pressable"
                  label={words.saveKey}
                  pending={keyPending}
                  pendingLabel={words.saving}
                  size="xs"
                  type="submit"
                />
                <Button
                  press="pressable"
                  label={words.cancel}
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
                <span class="sr-only">{words.projectsMayUse}</span>
                {#each shown.chips as chip (chip)}
                  <Badge variant="secondary"><span>{chip}</span></Badge>
                {/each}
                {#if shown.more > 0}
                  <Badge variant="ghost"
                    ><span data-slot="num" class="num"
                      >{words.more(shown.more)}</span
                    ></Badge
                  >
                {/if}
              </span>
            {/if}
            {#if row.state !== "signed-in" && needsApp(row) && appFor !== row.name}
              <Button
                press="pressable"
                label={words.setAppNow}
                onclick={() => {
                  rowApp = emptyApp();
                  appFor = row.name;
                }}
                size="sm"
                variant="outline"
              />
            {:else if row.state !== "signed-in" && signsIn(row)}
              <!-- One press returns to the sign-in under way, the same
                   page; only when none can still finish does it start one. -->
              <Button
                aria-label="{row.signIn
                  ? words.openSignIn
                  : words.signIn} {labelOf(row)} {row.account}"
                data-sign-in
                press="pressable"
                label={row.signIn ? words.openSignIn : words.signIn}
                onclick={() => signIn(row)}
                pending={signing[row.name] ?? false}
                pendingLabel={words.signingIn}
                size="sm"
                variant="outline"
              />
            {:else if row.state !== "signed-in" && takesKey(row) && keying !== row.name}
              <Button
                press="pressable"
                label={words.setKey}
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
        {words.projectsFor(labelOf(row))}
      </p>
      <ul class="flex flex-col">
        {#each cawco.projects as project (project.id)}
          <li>
            <label
              class={menuItemVariants({
                class:
                  "type-label flex w-full items-center gap-space-2 px-space-2 text-ink-strong",
              })}
              data-menu-item
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
