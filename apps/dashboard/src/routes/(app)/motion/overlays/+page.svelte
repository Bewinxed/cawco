<script lang="ts">
  /**
   * OVERLAYS BENCH (dev only): one of each kit overlay, as the app draws
   * them, each opened by its own button (`data-open`), each with a control
   * inside (`data-inside`) that counts the press and closes it; and the page
   * itself, a button under the whole screen (`data-page`) that counts the
   * presses that reach it. `?only=<kind>` shows that overlay's opener alone,
   * so what it opens stands over the page and nothing else. A script reads
   * the counts from `window.__overlays`: a control in an open overlay takes
   * a press on the first try, and once it has closed the next press, where
   * it stood, lands on the page (probe-kit `overlay-taps`).
   */
  // biome-ignore-all lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { page } from "$app/state";

  const KINDS = [
    "sheet",
    "dialog",
    "alert-dialog",
    "drawer",
    "dropdown-menu",
    "popover",
    "select",
    "context-menu",
  ] as const;
  type Kind = (typeof KINDS)[number];

  const only = page.url.searchParams.get("only");
  /** Whether `kind`'s opener is drawn. */
  const shows = (kind: Kind) => !only || only === kind;

  /** Presses each overlay's control took, and presses that reached the page. */
  const counts = $state<Record<Kind | "page", number>>({
    sheet: 0,
    dialog: 0,
    "alert-dialog": 0,
    drawer: 0,
    "dropdown-menu": 0,
    popover: 0,
    select: 0,
    "context-menu": 0,
    page: 0,
  });
  const open = $state<Record<Kind, boolean>>({
    sheet: false,
    dialog: false,
    "alert-dialog": false,
    drawer: false,
    "dropdown-menu": false,
    popover: false,
    select: false,
    "context-menu": false,
  });
  let chosen = $state("");

  /** The control inside `kind` was pressed: counted, and the overlay closes. */
  function inside(kind: Kind) {
    counts[kind] += 1;
    open[kind] = false;
  }

  Object.assign(globalThis, {
    __overlays: { counts: () => ({ ...counts }), open: () => ({ ...open }) },
  });
</script>

<svelte:head><title>Overlays bench · CawCo</title></svelte:head>

<main class="type-body grid gap-space-5 p-space-5 text-ink-strong">
  <div data-slot="openers" class="relative z-1 flex flex-wrap gap-space-2">
    {#if shows("sheet")}
      <Sheet.Root bind:open={open.sheet}>
        <Sheet.Trigger
          class="rounded-sm border border-border-control px-space-3 py-space-2"
          data-open="sheet">Sheet</Sheet.Trigger
        >
        <Sheet.Content side="left">
          <Sheet.Header>
            <Sheet.Title>Sheet</Sheet.Title>
          </Sheet.Header>
          <div data-slot="body" class="p-space-4">
            <Button data-inside="sheet" onclick={() => inside("sheet")}
              >Press</Button
            >
          </div>
        </Sheet.Content>
      </Sheet.Root>
    {/if}

    {#if shows("dialog")}
      <Dialog.Root bind:open={open.dialog}>
        <Dialog.Trigger
          class="rounded-sm border border-border-control px-space-3 py-space-2"
          data-open="dialog">Dialog</Dialog.Trigger
        >
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Dialog</Dialog.Title>
          </Dialog.Header>
          <Button data-inside="dialog" onclick={() => inside("dialog")}
            >Press</Button
          >
        </Dialog.Content>
      </Dialog.Root>
    {/if}

    {#if shows("alert-dialog")}
      <AlertDialog.Root bind:open={open["alert-dialog"]}>
        <AlertDialog.Trigger
          class="rounded-sm border border-border-control px-space-3 py-space-2"
          data-open="alert-dialog">Alert dialog</AlertDialog.Trigger
        >
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Alert dialog</AlertDialog.Title>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              data-inside="alert-dialog"
              onclick={() => inside("alert-dialog")}>Press</AlertDialog.Action
            >
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog.Root>
    {/if}

    {#if shows("drawer")}
      <Drawer.Root bind:open={open.drawer}>
        <Drawer.Trigger
          class="rounded-sm border border-border-control px-space-3 py-space-2"
          data-open="drawer">Drawer</Drawer.Trigger
        >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Drawer</Drawer.Title>
          </Drawer.Header>
          <div data-slot="body" class="p-space-4">
            <Button data-inside="drawer" onclick={() => inside("drawer")}
              >Press</Button
            >
          </div>
        </Drawer.Content>
      </Drawer.Root>
    {/if}

    {#if shows("dropdown-menu")}
      <DropdownMenu.Root bind:open={open["dropdown-menu"]}>
        <DropdownMenu.Trigger
          class="rounded-sm border border-border-control px-space-3 py-space-2"
          data-open="dropdown-menu">Dropdown menu</DropdownMenu.Trigger
        >
        <DropdownMenu.Content>
          <DropdownMenu.Item
            data-inside="dropdown-menu"
            onSelect={() => inside("dropdown-menu")}>Press</DropdownMenu.Item
          >
          <DropdownMenu.Item>Another</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}

    {#if shows("popover")}
      <Popover.Root bind:open={open.popover}>
        <Popover.Trigger
          class="rounded-sm border border-border-control px-space-3 py-space-2"
          data-open="popover">Popover</Popover.Trigger
        >
        <Popover.Content>
          <Button data-inside="popover" onclick={() => inside("popover")}
            >Press</Button
          >
        </Popover.Content>
      </Popover.Root>
    {/if}

    {#if shows("select")}
      <Select.Root
        onValueChange={(value: string) => {
          chosen = value;
          counts.select += 1;
        }}
        type="single"
        value={chosen}
        bind:open={open.select}
      >
        <Select.Trigger data-open="select" look="field"
          >{chosen || "Select"}</Select.Trigger
        >
        <Select.Content>
          <Select.Item data-inside="select" label="Press" value="press" />
          <Select.Item label="Another" value="another" />
        </Select.Content>
      </Select.Root>
    {/if}

    {#if shows("context-menu")}
      <ContextMenu.Root bind:open={open["context-menu"]}>
        <ContextMenu.Trigger>
          <div
            class="rounded-sm border border-border-control px-space-3 py-space-2"
            data-open="context-menu"
          >
            Context menu
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item
            data-inside="context-menu"
            onSelect={() => inside("context-menu")}>Press</ContextMenu.Item
          >
          <ContextMenu.Item>Another</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/if}
  </div>

  <!-- The page: what a press after an overlay closes must reach, wherever
       the overlay stood. The whole screen under the openers, so a press where
       an overlay stood lands on it once the overlay has gone. -->
  <button
    class="fixed inset-0 z-0 grid items-end justify-items-center border-none border-current bg-transparent p-space-5 text-ink-muted"
    data-page
    onclick={() => {
      counts.page += 1;
    }}
    type="button"
  >
    The page · {counts.page}
  </button>
</main>
