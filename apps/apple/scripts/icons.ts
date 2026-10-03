// Writes CawCoDesign's icon asset catalog from the icons the web dashboard
// draws, so both clients show the same glyphs: Solar bold duotone from the
// dashboard's own @iconify-json/solar, and the dashboard's hand-drawn glyphs
// (apps/dashboard/src/lib/components/icons/{Close,Tick,Plus}.svelte and the
// OS marks in apps/dashboard/src/lib/cawco/OsMark.svelte).
// Run from the repo root: bun apps/apple/scripts/icons.ts
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");
const SOLAR = join(
  ROOT,
  "apps/dashboard/node_modules/@iconify-json/solar/icons.json"
);
const OUT = join(
  ROOT,
  "apps/apple/Packages/CawCoKit/Sources/CawCoDesign/Resources/Icons.xcassets"
);

/** The Solar icons the apps draw, by their Solar id. */
const SOLAR_ICONS = [
  // The session sprites (apps/dashboard/src/lib/cawco/mark.ts), in its order.
  "ghost-smile-bold-duotone",
  "rocket-2-bold-duotone",
  "box-bold-duotone",
  "global-bold-duotone",
  "book-bold-duotone",
  "test-tube-bold-duotone",
  "bolt-bold-duotone",
  "leaf-bold-duotone",
  "planet-bold-duotone",
  "fire-bold-duotone",
  "pallete-2-bold-duotone",
  "magic-stick-3-bold-duotone",
  // The home's chrome.
  "hand-shake-bold-duotone",
  "danger-triangle-bold-duotone",
  "structure-bold-duotone",
  "structure-bold",
  "alt-arrow-right-linear",
  "magnifer-bold-duotone",
  "server-2-bold-duotone",
  "close-circle-bold-duotone",
  "archive-down-minimlistic-bold-duotone",
  // The transcript (apps/dashboard/src/lib/icons.ts names, beside each).
  "user-bold-duotone", // IconUser
  "cpu-bold-duotone", // IconCpu
  "code-square-bold-duotone", // IconToolTerminal, IconTerminal
  "document-text-bold-duotone", // IconToolRead
  "pen-2-bold-duotone", // IconToolEdit
  "pen-new-square-bold-duotone", // IconToolWrite
  "folder-with-files-bold-duotone", // IconToolFiles
  "plain-2-bold-duotone", // IconToolMessage
  "cursor-bold-duotone", // IconToolScreen
  "compass-bold-duotone", // IconToolNavigate
  "code-2-bold-duotone", // IconToolCode
  "plug-circle-bold-duotone", // IconToolMcp
  "users-group-rounded-bold-duotone", // IconToolTask
  "checklist-bold-duotone", // IconToolTodo
  "notebook-bold-duotone", // IconToolNotebook
  "question-circle-bold-duotone", // IconToolQuestion, IconAsk
  "sledgehammer-bold-duotone", // IconToolGeneric
  "info-circle-bold-duotone", // IconInfo
  "stop-bold-duotone", // IconStop
  "window-frame-bold-duotone", // IconWindow
  "shield-check-bold-duotone", // IconRules
  "clipboard-check-bold-duotone", // IconReport
  "clipboard-remove-bold-duotone", // IconReportFailed
  "share-circle-bold-duotone", // IconWorkflow
  "inbox-in-bold-duotone", // IconHandoff
  "check-read-bold-duotone", // IconCheck
  "arrow-down-bold-duotone", // Latest.svelte
  "square-top-down-bold-duotone", // IconExternal
  "maximize-bold-duotone", // IconMaximize
  "danger-circle-bold-duotone", // IconAlert
  "chat-square-bold-duotone", // IconChat
  "file-text-bold-duotone", // IconDocument
  "copy-bold-duotone", // IconCopy
  // The session screen's chrome.
  "arrow-up-linear", // IconArrowUp: the "needs you" pill
  "alt-arrow-down-linear", // IconChevronDown
  "alt-arrow-left-linear", // IconChevronLeft
  // SessionStatus.svelte's glyphs not listed above.
  "check-circle-bold-duotone", // Passed, Done; IconSuccess
  "moon-sleep-bold-duotone", // Sleeping
  "pause-circle-bold-duotone", // Idle, Stopped, Stored
  "refresh-circle-bold-duotone", // Working
  // The shell: bar, sidebar, projects, machines, jump, assistant, panes.
  "alt-arrow-up-linear", // IconChevronUp
  "arrow-right-linear", // IconArrowRight
  "align-left-bold-duotone", // IconAlignLeft
  "eye-scan-bold-duotone", // IconAssistant
  "folder-bold-duotone", // IconFolder
  "key-bold-duotone", // IconKey
  "laptop-minimalistic-bold-duotone", // IconLaptop
  "monitor-bold-duotone", // IconMonitor
  "moon-bold-duotone", // IconMoon
  "sun-bold-duotone", // IconSun
  "pin-bold-duotone", // IconPin
  "refresh-bold-duotone", // IconRefresh
  "settings-bold-duotone", // IconSettings
  "shield-bold-duotone", // IconShield
  "sidebar-minimalistic-bold-duotone", // IconSidebar
  "sort-bold-duotone", // IconSort
  "trash-bin-minimalistic-bold-duotone", // IconTrash
  "download-bold-duotone", // IconDownload
  "menu-dots-bold-duotone", // IconMore
  // A machine's tile (ui/machine-row machineIcon) and the join copy box.
  "laptop-bold-duotone",
  "server-square-bold-duotone",
  "documents-bold-duotone", // CopyBox
];

/** The dashboard's own glyphs, drawn where Solar has none. */
const DRAWN: Record<string, string> = {
  close:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#000" stroke-linecap="round" stroke-width="1.5"/></svg>',
  tick: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="M12 5v14M5 12h14" stroke="#000" stroke-linecap="round" stroke-width="1.5"/></svg>',
  "os-apple":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path fill="#000" d="M11.9 8.6c0-1.4.8-2.3 1.5-2.8-.6-.9-1.6-1.4-2.7-1.4-1.1-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.4-.6C4 4.5 2.9 5.2 2.3 6.3c-1.2 2.1-.3 5.3.9 7 .6.9 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.5c1-.1 1.6-.9 2.2-1.7.4-.6.7-1.2.9-1.9-1.4-.5-2.2-1.6-2.2-2.8ZM10.2 3.3c.5-.6.8-1.4.7-2.3-.7.1-1.6.5-2.1 1.1-.5.6-.9 1.4-.7 2.2.8.1 1.6-.4 2.1-1Z"/></svg>',
  "os-tux":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path fill="#000" d="M1.8 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0 1-4.8 0ZM9.4 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0 1-4.8 0ZM2.57 7.13a3.1 1.35 82 0 1 .86 6.14 3.1 1.35 82 0 1-.86-6.14ZM13.43 7.13a3.1 1.35 98 0 1 -.86 6.14 3.1 1.35 98 0 1 .86-6.14ZM3.1 9.9a4.9 5.1 0 0 1 9.8 0 4.9 5.1 0 0 1-9.8 0ZM4.7 4.1a3.3 3.4 0 0 1 6.6 0 3.3 3.4 0 0 1-6.6 0ZM5.55 3.9a.9 1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8.65 3.9a.9 1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8 5.6 6.6 7h2.8Z"/></svg>',
  "os-windows":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path fill="#000" d="M7.6 2.5 15 1.4v6.1H7.6ZM6.9 2.6v4.9H1V3.4ZM6.9 8.5v4.9L1 12.6V8.5ZM7.6 8.5H15v6.1L7.6 13.5Z"/></svg>',
};

interface IconSet {
  /** Names that draw another icon as it is (iconify's alias form). */
  aliases?: Record<string, { parent: string; [transform: string]: unknown }>;
  height?: number;
  icons: Record<string, { body: string; height?: number; width?: number }>;
  width?: number;
}

const set = JSON.parse(readFileSync(SOLAR, "utf8")) as IconSet;

/** The icon a name draws, through a plain alias; a transforming alias is refused. */
function solar(name: string) {
  const alias = set.aliases?.[name];
  if (alias && Object.keys(alias).length > 1) {
    throw new Error(`${name} is a transformed alias; draw it by hand`);
  }
  return set.icons[alias?.parent ?? name];
}

const svgs: Record<string, string> = { ...DRAWN };
for (const name of SOLAR_ICONS) {
  const icon = solar(name);
  if (!icon) {
    throw new Error(`Solar has no ${name}`);
  }
  const width = icon.width ?? set.width ?? 24;
  const height = icon.height ?? set.height ?? 24;
  // Template images draw by alpha; the duotone's second tone is its opacity.
  const body = icon.body.replaceAll("currentColor", "#000");
  svgs[name] =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "Contents.json"),
  `${JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2)}\n`
);
for (const [name, svg] of Object.entries(svgs)) {
  const dir = join(OUT, `${name}.imageset`);
  mkdirSync(dir);
  writeFileSync(join(dir, `${name}.svg`), `${svg}\n`);
  writeFileSync(
    join(dir, "Contents.json"),
    `${JSON.stringify(
      {
        images: [{ filename: `${name}.svg`, idiom: "universal" }],
        info: { author: "xcode", version: 1 },
        properties: {
          "preserves-vector-representation": true,
          "template-rendering-intent": "template",
        },
      },
      null,
      2
    )}\n`
  );
}
// Written in its final form: biome.jsonc excludes Icons.xcassets, so neither
// this script nor `bun run tokens` (apps/dashboard) formats it, and the two
// never rewrite each other's output.
console.log(`${Object.keys(svgs).length} icons → ${OUT}`);
