/**
 * Every product icon of the dashboard's, Solar's, by the name the product
 * gives it. The dashboard's icon barrel (apps/dashboard/src/lib/icons.ts)
 * gives them out with its own local glyphs; every consumer imports them from
 * there (DESIGN.md, The Solar Duotone Rule). The brand marks, no product
 * icons, are `@cawco/icons/marks` (marks.ts).
 *
 * Every glyph stands bare: none is drawn inside a circle or a rounded square
 * of its own (DESIGN.md, The Bare Glyph Rule). Where Solar has a meaning
 * only in such a container, the glyph is drawn here instead, in the
 * `cawco` collection (`~icons/cawco/<name>`, drawn.ts).
 *
 * A package of its own, so the dev server pre-bundles all of them into one
 * module (the dashboard's vite.config.ts `optimizeDeps.include`): Vite
 * pre-bundles a dependency, and only a bare import reaches it. Each
 * `~icons/…` here is a module of its own otherwise, compiled on request, and
 * a page that loads the barrel asked for every one: a component canvas's
 * cold open sent 150 of them at once.
 *
 * Every `~icons/…` module of the repository's is named in this package and
 * nowhere else (scripts/icon-imports-check.ts).
 */
/** A subagent: drawn (drawn.ts), Solar's branching paths out of their rounded square. */
// biome-ignore lint/performance/noBarrelFile: the dashboard's icon barrel (lib/icons.ts) re-exports it, every consumer imports from there
export { default as IconSubagent } from "~icons/cawco/branch-down";
/** A fork: drawn (drawn.ts), the same paths turned up. */
export { default as IconFork } from "~icons/cawco/branch-up";
/** Spend: drawn (drawn.ts), the dollar sign off Solar's coin. */
export { default as IconDollar } from "~icons/cawco/dollar";
/** Drawn (drawn.ts): the "i" alone, Solar's exclamation mark turned over. */
export { default as IconInfo } from "~icons/cawco/info";
/** An MCP server: drawn (drawn.ts), the plug without the cable Solar rings it with. */
export { default as IconToolMcp } from "~icons/cawco/plug";
/** A shell: drawn (drawn.ts), Solar's prompt out of its rounded square. */
export {
  default as IconTerminal,
  default as IconToolTerminal,
} from "~icons/cawco/terminal";
/** An add in a chip's slot (the project and machine pickers' "New…" rows). */
export { default as IconAdd } from "~icons/solar/add-bold-duotone";
/*
 * The session strip's "+", beside the tabs' close X: Solar's bare add in its
 * line-duotone cut, the X's own grammar (24px grid, 1.5 stroke, round caps)
 * with its upright stroke at half ink.
 */
export { default as IconAddLine } from "~icons/solar/add-line-duotone";
export { default as IconAlignLeft } from "~icons/solar/align-left-bold-duotone";
/*
 * Glyphs, not marks: the chevrons and arrows stay in Solar's linear cut, as
 * do the dashboard's local Minus, Plus and Tick (its lib/icons.ts). Every
 * other icon is Solar's bold-duotone cut, one face for the whole product.
 */
export { default as IconChevronDown } from "~icons/solar/alt-arrow-down-linear";
export { default as IconChevronLeft } from "~icons/solar/alt-arrow-left-linear";
export { default as IconChevronRightDuotone } from "~icons/solar/alt-arrow-right-bold-duotone";
export { default as IconChevronRight } from "~icons/solar/alt-arrow-right-linear";
export { default as IconChevronUp } from "~icons/solar/alt-arrow-up-linear";
/** The archive box itself, lid and all (its minimalistic cut drew the arrow in a bare rounded square). */
export { default as IconArchive } from "~icons/solar/archive-down-bold-duotone";
export { default as IconUnarchive } from "~icons/solar/archive-up-bold-duotone";
export { default as IconArrowDownDuotone } from "~icons/solar/arrow-down-bold-duotone";
export { default as IconArrowDown } from "~icons/solar/arrow-down-linear";
export { default as IconArrowLeft } from "~icons/solar/arrow-left-linear";
export { default as IconArrowRight } from "~icons/solar/arrow-right-linear";
/** Open elsewhere: the arrow out, with no square for it to leave. */
export { default as IconExternal } from "~icons/solar/arrow-right-up-bold-duotone";
/** A link that opens in another tab. */
export { default as IconArrowUpRight } from "~icons/solar/arrow-right-up-linear";
export { default as IconArrowUp } from "~icons/solar/arrow-up-linear";
/** What happened that nobody asked for: Caw's Notices section (CawPanel). */
export { default as IconNotices } from "~icons/solar/bell-bold-duotone";
export {
  default as IconBolt,
  default as IconSkill,
  default as IconToolSkill,
} from "~icons/solar/bolt-bold-duotone";
export { default as IconBook2 } from "~icons/solar/book-2-bold-duotone";
export { default as IconBook } from "~icons/solar/book-bold-duotone";
export { default as IconBox } from "~icons/solar/box-bold-duotone";
/** A release's Fixed section (ReleaseNotes). */
export { default as IconBug } from "~icons/solar/bug-bold-duotone";
/** Work set for dates: a Caw starter that plans on the calendar. */
export { default as IconCalendar } from "~icons/solar/calendar-bold-duotone";
export { default as IconUsage } from "~icons/solar/chart-2-bold-duotone";
/** Comment: the artifact panel's mode and the radial menu's sector (DESIGN.md, Artifact panel, canvas and ink). */
export { default as IconComment } from "~icons/solar/chat-round-dots-bold-duotone";
/** A task review's Transcript chip: the attempt's session, read in place. */
export { default as IconTranscript } from "~icons/solar/chat-round-line-bold-duotone";
export { default as IconChat } from "~icons/solar/chat-square-bold-duotone";
/**
 * Done, and a confirmation (a copy made, a choice ticked): Solar's bare
 * check, where `check-circle` and `check-read` drew it in a circle and a
 * rounded square.
 */
export {
  default as IconCheck,
  default as IconSuccess,
} from "~icons/solar/check-bold-duotone";
export { default as IconToolTodo } from "~icons/solar/checklist-bold-duotone";
/** A report; and a project's decision pages (the Decisions tab's tiles and its empty state). */
export {
  default as IconDecisions,
  default as IconReport,
} from "~icons/solar/clipboard-check-bold-duotone";
export { default as IconFileTable } from "~icons/solar/clipboard-list-bold-duotone";
export { default as IconReportFailed } from "~icons/solar/clipboard-remove-bold-duotone";
export { default as IconClock } from "~icons/solar/clock-circle-bold-duotone";
/** Failed, and a tab closed (its menu's Close): Solar's bare cross. */
export {
  default as IconCloseTab,
  default as IconError,
} from "~icons/solar/close-bold-duotone";
/** A machine away: the line-duotone cut, whose cross stands under the cloud bare (the bold cut boxes it). */
export { default as IconCloudCross } from "~icons/solar/cloud-cross-line-duotone";
export { default as IconToolCode } from "~icons/solar/code-2-bold-duotone";
export { default as IconFileCode } from "~icons/solar/code-file-bold-duotone";
/** A tab split beside it, to the right (its menu's Split right). */
export { default as IconSplitRight } from "~icons/solar/columns-2-bold-duotone";
export { default as IconToolNavigate } from "~icons/solar/compass-bold-duotone";
export { default as IconCopy } from "~icons/solar/copy-bold-duotone";
/** The other tabs closed (its menu's Close others). */
export { default as IconCloseOthers } from "~icons/solar/copy-close-bold-duotone";
export { default as IconCpu } from "~icons/solar/cpu-bold-duotone";
export { default as IconCpuBolt } from "~icons/solar/cpu-bolt-bold-duotone";
/** A screen tool's row; the preview pane's Interact mode (the page gets the pointer). */
export {
  default as IconInteract,
  default as IconToolScreen,
} from "~icons/solar/cursor-bold-duotone";
export { default as IconWarningTriangle } from "~icons/solar/danger-triangle-bold-duotone";
export { default as IconDatabase } from "~icons/solar/database-bold-duotone";
/** A release's Improved section (ReleaseNotes). */
export { default as IconGraphUp } from "~icons/solar/diagram-up-bold-duotone";
// A new thread: a conversation of two. Its full-weight marks are as large as
// a menu's other glyphs' (an add mark inside a tile read smaller beside them).
export { default as IconChatAdd } from "~icons/solar/dialog-2-bold-duotone";
export { default as IconDocumentAlt } from "~icons/solar/document-bold-duotone";
export {
  default as IconArtifactPage,
  default as IconFileMarkdown,
  default as IconToolRead,
} from "~icons/solar/document-text-bold-duotone";
export { default as IconDocuments } from "~icons/solar/documents-bold-duotone";
export { default as IconCollapseOthers } from "~icons/solar/double-alt-arrow-up-bold-duotone";
export { default as IconDownload } from "~icons/solar/download-bold-duotone";
export { default as IconAlert } from "~icons/solar/exclamation-mark-bold-duotone";
export { default as IconEye } from "~icons/solar/eye-bold-duotone";
export { default as IconEyeClosed } from "~icons/solar/eye-closed-bold-duotone";
export { default as IconDocument } from "~icons/solar/file-text-bold-duotone";
/** What narrows a project's tasks (TaskFilterPopover). */
export { default as IconFilter } from "~icons/solar/filter-bold-duotone";
export { default as IconFire } from "~icons/solar/fire-bold-duotone";
export { default as IconFiles } from "~icons/solar/folder-2-bold-duotone";
export { default as IconFolder } from "~icons/solar/folder-bold-duotone";
export { default as IconFolderGit } from "~icons/solar/folder-git-bold-duotone";
export { default as IconFolderOpen } from "~icons/solar/folder-open-bold-duotone";
export { default as IconToolFiles } from "~icons/solar/folder-with-files-bold-duotone";
export { default as IconImage } from "~icons/solar/gallery-bold-duotone";
/** Files' artifacts as their thumbnails' masonry (FilesList's Thumbnails | List). */
export { default as IconThumbnails } from "~icons/solar/gallery-wide-bold-duotone";
export {
  default as IconAgent,
  default as IconGhost,
} from "~icons/solar/ghost-smile-bold-duotone";
export {
  default as IconGlobe,
  default as IconToolWeb,
} from "~icons/solar/global-bold-duotone";
/** A person is asked for: the Needs-you glyph (DESIGN.md, Session status). */
export { default as IconNeedsYou } from "~icons/solar/hand-shake-bold-duotone";
export { default as IconHistory } from "~icons/solar/history-bold-duotone";
/** A routine turning itself off soon unless kept. */
export { default as IconHourglass } from "~icons/solar/hourglass-bold-duotone";
export { default as IconHandoff } from "~icons/solar/inbox-in-bold-duotone";
export { default as IconKey } from "~icons/solar/key-bold-duotone";
export { default as IconLaptopAlt } from "~icons/solar/laptop-bold-duotone";
export { default as IconLaptop } from "~icons/solar/laptop-minimalistic-bold-duotone";
export { default as IconLayers } from "~icons/solar/layers-bold-duotone";
export { default as IconLayersMinimal } from "~icons/solar/layers-minimalistic-bold-duotone";
export { default as IconLeaf } from "~icons/solar/leaf-bold-duotone";
/** A connection: Configure › Connections' rail glyph, and a row whose service has no mark. */
export { default as IconConnection } from "~icons/solar/link-bold-duotone";
export { default as IconLink } from "~icons/solar/link-minimalistic-2-bold-duotone";
/** Sort, and a starter that triages: its lines at half ink, the arrow down in full. */
export { default as IconSort } from "~icons/solar/list-arrow-down-bold-duotone";
/** Files' artifacts one row each (FilesList's Thumbnails | List). */
export { default as IconListRows } from "~icons/solar/list-bold-duotone";
export { default as IconListCheck } from "~icons/solar/list-check-bold-duotone";
/** A starter that files tasks: its lines at half ink and the tick in full (StarterCards). */
export { default as IconTaskList } from "~icons/solar/list-check-minimalistic-bold-duotone";
/** Waits on another task that has not landed. */
export { default as IconLock } from "~icons/solar/lock-keyhole-minimalistic-bold-duotone";
export { default as IconLogout } from "~icons/solar/logout-2-bold-duotone";
export { default as IconSparkles } from "~icons/solar/magic-stick-3-bold-duotone";
export {
  default as IconSearch,
  default as IconToolSearch,
} from "~icons/solar/magnifer-bold-duotone";
export { default as IconMapPoint } from "~icons/solar/map-point-bold-duotone";
export { default as IconMaximize } from "~icons/solar/maximize-bold-duotone";
export { default as IconMore } from "~icons/solar/menu-dots-bold-duotone";
export { default as IconMic } from "~icons/solar/microphone-bold-duotone";
export { default as IconZoomIn } from "~icons/solar/minimalistic-magnifer-zoom-in-bold-duotone";
export { default as IconMinimize } from "~icons/solar/minimize-bold-duotone";
/** A routine that has not run yet, or a run that ended without an outcome (cancelled, skipped, denied): the neutral status, Solar's bare minus. */
export { default as IconNeutral } from "~icons/solar/minus-bold-duotone";
export { default as IconMonitor } from "~icons/solar/monitor-bold-duotone";
export { default as IconMoon } from "~icons/solar/moon-bold-duotone";
export { default as IconMoonSleep } from "~icons/solar/moon-sleep-bold-duotone";
export { default as IconAudio } from "~icons/solar/music-note-bold-duotone";
export { default as IconToolNotebook } from "~icons/solar/notebook-bold-duotone";
export { default as IconFileLog } from "~icons/solar/notes-bold-duotone";
/** Solar's own spelling. The `palette-*` cut is a board; this one is the palette. */
export { default as IconPalette } from "~icons/solar/pallete-2-bold-duotone";
/** Attach's Files and photos. */
export { default as IconPaperclip } from "~icons/solar/paperclip-bold-duotone";
/** Caw holds still while his lead works (the sidebar's motion switch); a paused routine's or session's state glyph. */
export { default as IconPause } from "~icons/solar/pause-bold-duotone";
export { default as IconToolEdit } from "~icons/solar/pen-2-bold-duotone";
/**
 * A pen: a draft starter's glyph; a result in words alone (what the session
 * said it did); a canvas; a rename; a Write tool's row. Solar's bare pen,
 * where `pen-new-square` drew it over a rounded square.
 */
export {
  default as IconArtifactCanvas,
  default as IconPen,
  default as IconPenLine,
  default as IconResult,
  default as IconToolWrite,
} from "~icons/solar/pen-bold-duotone";
export { default as IconPin } from "~icons/solar/pin-bold-duotone";
export {
  default as IconSend,
  default as IconToolMessage,
} from "~icons/solar/plain-2-bold-duotone";
export { default as IconPlain } from "~icons/solar/plain-bold-duotone";
export { default as IconPlanet } from "~icons/solar/planet-bold-duotone";
export { default as IconPlay } from "~icons/solar/play-bold-duotone";
export {
  default as IconAsk,
  default as IconToolQuestion,
} from "~icons/solar/question-mark-bold-duotone";
/**
 * A step not reached yet, and a fact with no verdict: an empty ring, a
 * status mark with no glyph in it (Add machine's steps and their rows in
 * the machines list, the address tray's facts and its stations ahead).
 */
export {
  default as IconDot,
  default as IconFuture,
} from "~icons/solar/record-linear";
/** Refresh; Working, the session status glyph (DESIGN.md, Session status); and a starter that refreshes something (StarterCards). */
export {
  default as IconRefresh,
  default as IconRenew,
  default as IconWorking,
} from "~icons/solar/refresh-bold-duotone";
/** Reopen a resolved pin. */
export { default as IconReopen } from "~icons/solar/restart-bold-duotone";
/*
 * The marks a folder can be given by hand (see `FOLDER_MARKS` in
 * lib/cawco/folder-prefs.svelte.ts), picked to span the kinds of work a
 * directory holds rather than to be a complete icon set.
 */
export { default as IconRocket } from "~icons/solar/rocket-2-bold-duotone";
/** Hooks: a lifecycle event branching into what runs. */
export { default as IconHook } from "~icons/solar/routing-2-bold-duotone";
/** A design system: the project's look, written down (StarterCards' `system`). */
/** A tab split under it (its menu's Split down). */
export { default as IconSplitDown } from "~icons/solar/rows-2-bold-duotone";
export { default as IconRulerPen } from "~icons/solar/ruler-cross-pen-bold-duotone";
export { default as IconJev } from "~icons/solar/scale-bold-duotone";
export { default as IconServer } from "~icons/solar/server-2-bold-duotone";
export { default as IconServerAlt } from "~icons/solar/server-bold-duotone";
export { default as IconSettings } from "~icons/solar/settings-bold-duotone";
export { default as IconPipeline } from "~icons/solar/share-circle-bold-duotone";
export { default as IconShield } from "~icons/solar/shield-bold-duotone";
/** Rules: a standing guard over what sessions say, distinct from bare `shield`. */
export { default as IconRules } from "~icons/solar/shield-check-bold-duotone";
/** HTTPS on the tailnet: the hub's name served over TLS to every device on it. */
export { default as IconTailnetHttps } from "~icons/solar/shield-network-bold-duotone";
export { default as IconShop } from "~icons/solar/shop-bold-duotone";
/** A canvas's Undock, out of the artifact panel back over the field. */
export { default as IconUndock } from "~icons/solar/sidebar-minimalistic-bold-duotone";
export { default as IconSidebar } from "~icons/solar/sidebar-minimalistic-line-duotone";
export { default as IconToolGeneric } from "~icons/solar/sledgehammer-bold-duotone";
export { default as IconPhone } from "~icons/solar/smartphone-bold-duotone";
export { default as IconUnfold } from "~icons/solar/sort-vertical-bold-duotone";
/** A release's New section (ReleaseNotes). */
export { default as IconStars } from "~icons/solar/stars-bold-duotone";
/** Stop; an install stopped by the person, its status glyph (Add machine). */
export {
  default as IconStop,
  default as IconStopped,
} from "~icons/solar/stop-bold-duotone";
/** A work tab's Structure toggle, on: the solid cut beside its duotone off. */
export { default as IconStructureSolid } from "~icons/solar/structure-bold";
export { default as IconStructure } from "~icons/solar/structure-bold-duotone";
export { default as IconSun } from "~icons/solar/sun-bold-duotone";
export { default as IconLab } from "~icons/solar/test-tube-bold-duotone";
/** Transfer; a tab moved to another group (its menu's Move to group). */
export {
  default as IconMoveTab,
  default as IconTransfer,
} from "~icons/solar/transfer-horizontal-bold-duotone";
export { default as IconTrash } from "~icons/solar/trash-bin-minimalistic-bold-duotone";
export { default as IconTuning } from "~icons/solar/tuning-2-bold-duotone";
export { default as IconReset } from "~icons/solar/undo-left-bold-duotone";
export { default as IconUser } from "~icons/solar/user-bold-duotone";
/** Delegated work: the subagents a session still has out. Accounts: Configure's sign-ins. */
export {
  default as IconAccounts,
  default as IconSubagents,
  default as IconToolTask,
} from "~icons/solar/users-group-rounded-bold-duotone";
export { default as IconVideo } from "~icons/solar/video-library-bold-duotone";
export { default as IconSoundOff } from "~icons/solar/volume-cross-bold-duotone";
export { default as IconSound } from "~icons/solar/volume-loud-bold-duotone";
export { default as IconColumns } from "~icons/solar/widget-2-bold-duotone";
/** A sheet: a component's states, side by side, each a tile. */
export { default as IconArtifactSheet } from "~icons/solar/widget-4-bold-duotone";
// Menu rows among duotone glyphs: a new session, and folding the others away.
export { default as IconSessionAdd } from "~icons/solar/widget-add-bold-duotone";
export { default as IconWindow } from "~icons/solar/window-frame-bold-duotone";
