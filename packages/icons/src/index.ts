/**
 * Every product icon of the dashboard's, Solar's, by the name the product
 * gives it. The dashboard's icon barrel (apps/dashboard/src/lib/icons.ts)
 * gives them out with its own local glyphs; every consumer imports them from
 * there (DESIGN.md, The Solar Duotone Rule). The brand marks, no product
 * icons, are `@cawco/icons/marks` (marks.ts).
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
/*
 * A machine's OS in a bar (OsMark's linear face, the project head's place):
 * Iconoir's Linux, Apple and Windows marks, Solar has none. Iconoir draws
 * on Solar Linear's grid and stroke (24px, 1.5, open strokes), where
 * Tabler's brand marks stroke at 2 and hold no Tux, and Phosphor's regular
 * logos are outlines cut as fills.
 */
export { default as IconOsAppleLinear } from "~icons/iconoir/apple-mac";
export { default as IconOsLinuxLinear } from "~icons/iconoir/linux";
export { default as IconOsWindowsLinear } from "~icons/iconoir/windows";
/*
 * Add, bare (the owner, 10-24: "u need to draw similar style icons that are
 * without their containers"): Solar's add in its bold-duotone cut.
 */
export { default as IconAdd } from "~icons/solar/add-bold-duotone";
/*
 * The session strip's "+", beside the tabs' close X: Solar's bare add in its
 * line-duotone cut, the X's own grammar (24px grid, 1.5 stroke, round caps)
 * with its upright stroke at half ink.
 */
export { default as IconAddLine } from "~icons/solar/add-line-duotone";
/** Add machine, in Solar's linear cut among the popover's linear rows. */
export { default as IconAddLinear } from "~icons/solar/add-linear";
export { default as IconAlignLeft } from "~icons/solar/align-left-bold-duotone";
export { default as IconTextRightToLeftLinear } from "~icons/solar/align-right-linear";
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
export { default as IconArchive } from "~icons/solar/archive-down-minimlistic-bold-duotone";
export { default as IconUnarchive } from "~icons/solar/archive-up-minimlistic-bold-duotone";
export { default as IconArrowDownDuotone } from "~icons/solar/arrow-down-bold-duotone";
export { default as IconArrowDown } from "~icons/solar/arrow-down-linear";
export { default as IconArrowLeft } from "~icons/solar/arrow-left-linear";
export { default as IconArrowRight } from "~icons/solar/arrow-right-linear";
/** Opens elsewhere: Solar's bare arrow out, with no square for it to leave. */
export { default as IconExternal } from "~icons/solar/arrow-right-up-bold-duotone";
/** A link that opens in another tab. */
export {
  default as IconArrowUpRight,
  default as IconExternalLinear,
} from "~icons/solar/arrow-right-up-linear";
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
/** Keep: the values or the timing he set kept as a version of their own (the design graph's versions). */
export { default as IconKeep } from "~icons/solar/bookmark-bold-duotone";
export { default as IconBox } from "~icons/solar/box-bold-duotone";
/**
 * The map of a component's states: one state branching into the ones its
 * moves lead to (the owner's pin 49 on the Working area).
 */
export { default as IconBranchingLinear } from "~icons/solar/branching-paths-up-linear";
/** A release's Fixed section (ReleaseNotes). */
export { default as IconBug } from "~icons/solar/bug-bold-duotone";
/** Work set for dates: a Caw starter that plans on the calendar. */
export { default as IconCalendar } from "~icons/solar/calendar-bold-duotone";
export { default as IconUsage } from "~icons/solar/chart-2-bold-duotone";
/**
 * A task review's Transcript chip, the attempt's session read in place.
 * Solar's bare round bubble: its dots and lines cuts draw marks inside the
 * bubble.
 */
/**
 * Comment, the artifact panel's mode: a click there leaves a comment (the
 * owner's pin 50 on the Working area). The round bubble, where the panel's
 * Comments list is the square one (`IconChat`).
 */
export {
  default as IconTranscript,
  default as IconComment,
} from "~icons/solar/chat-round-bold-duotone";
export { default as IconCommentLinear } from "~icons/solar/chat-round-linear";
export { default as IconChat } from "~icons/solar/chat-square-bold-duotone";
/*
 * A bar's symbols (the owner's pick on the artifact panel's decision page,
 * Solar Linear): every symbol standing in a bar's glass is Solar's linear
 * cut, the thin line Apple draws in a bar, each the twin of the product
 * icon of the same name; the bold duotone stays for status, tiles and rows
 * (DESIGN.md, The Solar Duotone Rule). A bar draws no duotone
 * (golar house/bar-symbol-linear). Undock and Room share one sidebar, as
 * their duotone does.
 */
export { default as IconChatLinear } from "~icons/solar/chat-square-linear";
export { default as IconSuccess } from "~icons/solar/check-bold-duotone";
export { default as IconSuccessLinear } from "~icons/solar/check-linear";
/**
 * A to-do list, and a starter that files tasks: Solar's bare checklist, the
 * ticks and lines checklist-minimalistic holds in a squircle.
 */
export {
  default as IconTaskList,
  default as IconToolTodo,
} from "~icons/solar/checklist-bold-duotone";
/** A report; and a project's decision pages (the Decisions tab's tiles and its empty state). */
export {
  default as IconDecisions,
  default as IconReport,
} from "~icons/solar/clipboard-check-bold-duotone";
export { default as IconFileTable } from "~icons/solar/clipboard-list-bold-duotone";
export { default as IconReportFailed } from "~icons/solar/clipboard-remove-bold-duotone";
export { default as IconClock } from "~icons/solar/clock-circle-bold-duotone";
/** Failed, and a tab closed (its menu's Close): Solar's bare close X. */
export {
  default as IconCloseTab,
  default as IconError,
} from "~icons/solar/close-bold-duotone";
export { default as IconCloudCross } from "~icons/solar/cloud-cross-bold-duotone";
export { default as IconToolCode } from "~icons/solar/code-2-bold-duotone";
export {
  default as IconTerminal,
  default as IconToolTerminal,
} from "~icons/solar/code-bold-duotone";
export { default as IconFileCode } from "~icons/solar/code-file-bold-duotone";
/** A tab split beside it, to the right (its menu's Split right). */
export { default as IconSplitRight } from "~icons/solar/columns-2-bold-duotone";
export { default as IconToolNavigate } from "~icons/solar/compass-bold-duotone";
export { default as IconCopy } from "~icons/solar/copy-bold-duotone";
/** The other tabs closed (its menu's Close others). */
export { default as IconCloseOthers } from "~icons/solar/copy-close-bold-duotone";
/**
 * The kit's CopyButton, in Solar's linear cut: the duotone's two sheets
 * fill to one block at a button's 12px, and its result swaps to the linear
 * Tick and Close.
 */
export { default as IconCopyLinear } from "~icons/solar/copy-linear";
/** A release's Improved section (ReleaseNotes). */
export { default as IconGraphUp } from "~icons/solar/course-up-bold-duotone";
export { default as IconCpu } from "~icons/solar/cpu-bold-duotone";
export { default as IconCpuBolt } from "~icons/solar/cpu-bolt-bold-duotone";
/** A screen tool's row; the preview pane's Interact mode (the page gets the pointer). */
export {
  default as IconInteract,
  default as IconToolScreen,
} from "~icons/solar/cursor-bold-duotone";
export { default as IconInteractLinear } from "~icons/solar/cursor-linear";
export { default as IconWarningTriangle } from "~icons/solar/danger-triangle-bold-duotone";
export { default as IconDatabase } from "~icons/solar/database-bold-duotone";
// A new conversation: two speech bubbles. Its full-weight marks are as large as
// a menu's other glyphs' (an add mark inside a tile read smaller beside them).
export { default as IconChatAdd } from "~icons/solar/dialog-2-bold-duotone";
export { default as IconChatAddLinear } from "~icons/solar/dialog-2-linear";
export { default as IconDocumentAlt } from "~icons/solar/document-bold-duotone";
export {
  default as IconArtifactPage,
  default as IconFileMarkdown,
  default as IconToolRead,
} from "~icons/solar/document-text-bold-duotone";
/** Keep as artifact, a bar's symbol over an agent's block (tsk-330). */
export { default as IconArtifactPageLinear } from "~icons/solar/document-text-linear";
export { default as IconDocuments } from "~icons/solar/documents-bold-duotone";
export { default as IconDollar } from "~icons/solar/dollar-bold-duotone";
export { default as IconCollapseOthers } from "~icons/solar/double-alt-arrow-up-bold-duotone";
export { default as IconDownload } from "~icons/solar/download-bold-duotone";
export { default as IconAlert } from "~icons/solar/exclamation-mark-bold-duotone";
export { default as IconEye } from "~icons/solar/eye-bold-duotone";
export { default as IconEyeClosed } from "~icons/solar/eye-closed-bold-duotone";
export { default as IconEyeClosedLinear } from "~icons/solar/eye-closed-linear";
export { default as IconEyeLinear } from "~icons/solar/eye-linear";
export { default as IconDocument } from "~icons/solar/file-text-bold-duotone";
/** What narrows a project's tasks (TaskFilterPopover). */
export { default as IconFilter } from "~icons/solar/filter-bold-duotone";
export { default as IconFire } from "~icons/solar/fire-bold-duotone";
export { default as IconFiles } from "~icons/solar/folder-2-bold-duotone";
export { default as IconFilesLinear } from "~icons/solar/folder-2-linear";
export { default as IconFolder } from "~icons/solar/folder-bold-duotone";
export { default as IconFolderGit } from "~icons/solar/folder-git-bold-duotone";
export { default as IconFolderLinear } from "~icons/solar/folder-linear";
export { default as IconFolderOpen } from "~icons/solar/folder-open-bold-duotone";
export { default as IconToolFiles } from "~icons/solar/folder-with-files-bold-duotone";
/** Adapt: the stage drawn at the room it has, its corners marked (a bare glass symbol, linear). */
export { default as IconAdaptLinear } from "~icons/solar/full-screen-linear";
export { default as IconImage } from "~icons/solar/gallery-bold-duotone";
/** Files' artifacts as their thumbnails' masonry (FilesList's Thumbnails | List). */
export { default as IconThumbnails } from "~icons/solar/gallery-wide-bold-duotone";
export {
  default as IconAgent,
  default as IconGhost,
} from "~icons/solar/ghost-smile-bold-duotone";
/** The agent driving a browser, in its address (BrowserAddress): the agent's ghost, a bar's linear cut. */
export { default as IconAgentLinear } from "~icons/solar/ghost-smile-linear";
/** What differs between two states: Compare (bare: the scale stands on a tile, The Solar Duotone Rule). */
export { default as IconCompare } from "~icons/solar/git-diff-bold-duotone";
export { default as IconCompareLinear } from "~icons/solar/git-diff-linear";
/** Fork, Spin off: a session forked from another (the bare cut, no enclosure). */
export { default as IconFork } from "~icons/solar/git-fork-bold-duotone";
export { default as IconForkLinear } from "~icons/solar/git-fork-linear";
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
/** A browser take-over's Show keyboard, a bar symbol floating over the stream: the phone's keyboard, typing into the page. */
export { default as IconKeyboardLinear } from "~icons/solar/keyboard-linear";
export { default as IconLaptopAlt } from "~icons/solar/laptop-bold-duotone";
export { default as IconLaptop } from "~icons/solar/laptop-minimalistic-bold-duotone";
export { default as IconLayers } from "~icons/solar/layers-bold-duotone";
export { default as IconLayersLinear } from "~icons/solar/layers-linear";
export { default as IconLayersMinimal } from "~icons/solar/layers-minimalistic-bold-duotone";
export { default as IconLeaf } from "~icons/solar/leaf-bold-duotone";
/** A connection: Configure › Connections' rail glyph, and a row whose service has no mark. */
export { default as IconConnection } from "~icons/solar/link-bold-duotone";
export { default as IconLink } from "~icons/solar/link-minimalistic-2-bold-duotone";
export { default as IconLinkLinear } from "~icons/solar/link-minimalistic-2-linear";
/** Files' artifacts one row each (FilesList's Thumbnails | List). */
export { default as IconListRows } from "~icons/solar/list-bold-duotone";
export { default as IconListCheck } from "~icons/solar/list-check-bold-duotone";
export { default as IconListRowsLinear } from "~icons/solar/list-linear";
/** Waits on another task that has not landed. */
export { default as IconLock } from "~icons/solar/lock-keyhole-minimalistic-bold-duotone";
export { default as IconLogout } from "~icons/solar/logout-2-bold-duotone";
export { default as IconSparkles } from "~icons/solar/magic-stick-3-bold-duotone";
/** A search tool's call in the transcript, among the tool glyphs' duotone. */
export { default as IconToolSearch } from "~icons/solar/magnifer-bold-duotone";
/**
 * Search, a control: Solar's linear cut, the line Close and Plus are drawn in
 * beside it (the bold-duotone's lens is a filled disc, the one solid body in
 * a bar's glass of line glyphs: the owner's pin on the Comments sheet's bar).
 */
export { default as IconSearch } from "~icons/solar/magnifer-linear";
/** A browser's page drawn up on a phone, and back to its width (BrowserView), Solar's linear cut. */
export { default as IconZoomInLinear } from "~icons/solar/magnifer-zoom-in-linear";
export { default as IconZoomOutLinear } from "~icons/solar/magnifer-zoom-out-linear";
export { default as IconMapPoint } from "~icons/solar/map-point-bold-duotone";
export { default as IconMaximize } from "~icons/solar/maximize-bold-duotone";
export { default as IconMaximizeLinear } from "~icons/solar/maximize-linear";
export { default as IconMore } from "~icons/solar/menu-dots-bold-duotone";
export { default as IconMoreLinear } from "~icons/solar/menu-dots-linear";
export { default as IconMic } from "~icons/solar/microphone-bold-duotone";
export { default as IconZoomIn } from "~icons/solar/minimalistic-magnifer-zoom-in-bold-duotone";
/** Fit: a zoomed timeline put back to its whole move (the design graph's Animation face). */
export { default as IconZoomOut } from "~icons/solar/minimalistic-magnifer-zoom-out-bold-duotone";
export { default as IconMinimize } from "~icons/solar/minimize-bold-duotone";
export { default as IconMinimizeLinear } from "~icons/solar/minimize-linear";
/**
 * Minus, Solar's bare linear cut: a checkbox's mixed state, zoom out, and the
 * neutral status (a routine that has not run yet, or a run that ended without
 * an outcome: cancelled, skipped, denied, No).
 */
export {
  default as IconMinus,
  default as IconMinusLinear,
  default as IconNeutral,
} from "~icons/solar/minus-linear";
export { default as IconMonitor } from "~icons/solar/monitor-bold-duotone";
export { default as IconMonitorLinear } from "~icons/solar/monitor-linear";
export { default as IconMoon } from "~icons/solar/moon-bold-duotone";
export { default as IconMoonLinear } from "~icons/solar/moon-linear";
export { default as IconMoonSleep } from "~icons/solar/moon-sleep-bold-duotone";
export { default as IconAudio } from "~icons/solar/music-note-bold-duotone";
export { default as IconToolNotebook } from "~icons/solar/notebook-bold-duotone";
export { default as IconFileLog } from "~icons/solar/notes-bold-duotone";
/** Solar's own spelling. The `palette-*` cut is a board; this one is the palette. */
export { default as IconPalette } from "~icons/solar/pallete-2-bold-duotone";
/*
 * The desk's one sidebar toggle (Shell), a bar symbol and a matched pair on
 * Solar Linear's panel: the chevron points into the panel while the sidebar
 * stands (Hide sidebar) and out of it while it is away (Show sidebar), and
 * the toggle, which never moves, turns one into the other as the sidebar
 * slides.
 */
export { default as IconSidebarHideLinear } from "~icons/solar/panel-left-close-linear";
export { default as IconSidebarShowLinear } from "~icons/solar/panel-left-open-linear";
/** Attach's Files and photos. */
export { default as IconPaperclip } from "~icons/solar/paperclip-bold-duotone";
/** Caw holds still while his lead works (the sidebar's motion switch); a paused routine; Idle and Stopped (DESIGN.md, Session status). */
export { default as IconPause } from "~icons/solar/pause-bold-duotone";
export { default as IconToolEdit } from "~icons/solar/pen-2-bold-duotone";
/**
 * A pen: a draft starter's glyph; a result in words alone (what the session
 * said it did); a write. Solar's bare pen, the one pen-new-square holds in its
 * squircle.
 */
export {
  default as IconPen,
  default as IconResult,
  default as IconArtifactCanvas,
  default as IconPenLine,
  default as IconToolWrite,
} from "~icons/solar/pen-bold-duotone";
export { default as IconPenLinear } from "~icons/solar/pen-linear";
/** A pin placed (PinCard), and a thing pinned to stay (a folder, a rule). */
export { default as IconPin } from "~icons/solar/pin-bold-duotone";
export { default as IconPinLinear } from "~icons/solar/pin-linear";
/** A colour taken from the screen: a colour picker's eyedropper. */
export { default as IconPipette } from "~icons/solar/pipette-bold-duotone";
export {
  default as IconSend,
  default as IconToolMessage,
} from "~icons/solar/plain-2-bold-duotone";
export { default as IconPlain } from "~icons/solar/plain-bold-duotone";
export { default as IconPlanet } from "~icons/solar/planet-bold-duotone";
export { default as IconPlay } from "~icons/solar/play-bold-duotone";
export { default as IconPlayLinear } from "~icons/solar/play-linear";
export {
  default as IconAsk,
  default as IconToolQuestion,
} from "~icons/solar/question-mark-bold-duotone";
/** The agent's own question waiting on the person, a tile beside the decision's and the pin's (waiting/WaitingList). */
export { default as IconQuestion } from "~icons/solar/question-square-bold-duotone";
/** Working: the session status glyph (DESIGN.md, Session status); and a starter that refreshes something (StarterCards). */
export {
  default as IconRefresh,
  default as IconRenew,
  default as IconWorking,
} from "~icons/solar/refresh-bold-duotone";
export { default as IconRefreshLinear } from "~icons/solar/refresh-linear";
/** Repeat: a move played round again each time it ends (the design graph's Animation face). */
export { default as IconRepeat } from "~icons/solar/repeat-bold-duotone";
/** Reopen a resolved pin. */
export { default as IconReopen } from "~icons/solar/restart-bold-duotone";
export { default as IconReopenLinear } from "~icons/solar/restart-linear";
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
/** Two things weighed against each other: Jev. */
export { default as IconJev } from "~icons/solar/scale-bold-duotone";
export { default as IconServer } from "~icons/solar/server-2-bold-duotone";
export { default as IconServerLinear } from "~icons/solar/server-2-linear";
export { default as IconServerAlt } from "~icons/solar/server-bold-duotone";
export { default as IconServerSquare } from "~icons/solar/server-square-bold-duotone";
export { default as IconSettings } from "~icons/solar/settings-bold-duotone";
export { default as IconShield } from "~icons/solar/shield-bold-duotone";
/** Rules: a standing guard over what sessions say, distinct from bare `shield`. */
export { default as IconRules } from "~icons/solar/shield-check-bold-duotone";
/** A permission waiting on the person in a list of kinds: the shield as a half-tone tile with its keyhole, the weight of the decision's, the pin's and the question's tiles (waiting/WaitingList). */
export { default as IconShieldKeyhole } from "~icons/solar/shield-keyhole-bold-duotone";
/** HTTPS on the tailnet: the hub's name served over TLS to every device on it. */
export { default as IconTailnetHttps } from "~icons/solar/shield-network-bold-duotone";
export { default as IconShop } from "~icons/solar/shop-bold-duotone";
export {
  /** The design graph's Show states: its room brought back beside or under the stage, in its bar's bold duotone (a component artifact's pane offers no Undock). */
  default as IconRoom,
  /** A canvas's Undock, out of the artifact panel back over the field. */
  default as IconUndock,
} from "~icons/solar/sidebar-minimalistic-bold-duotone";
export { default as IconSidebar } from "~icons/solar/sidebar-minimalistic-line-duotone";
export {
  default as IconRoomLinear,
  default as IconUndockLinear,
} from "~icons/solar/sidebar-minimalistic-linear";
/** Replay: a move played again from its start, wherever its playhead stands (the design graph's Animation face). */
export { default as IconReplay } from "~icons/solar/skip-previous-bold-duotone";
export { default as IconToolGeneric } from "~icons/solar/sledgehammer-bold-duotone";
export { default as IconPhone } from "~icons/solar/smartphone-bold-duotone";
/** The stage's widths as bare glass symbols (linear, as every glass item): a phone, a tablet, a desk, a wide screen. */
export { default as IconPhoneLinear } from "~icons/solar/smartphone-linear";
export { default as IconTextEmojiLinear } from "~icons/solar/smile-circle-linear";
/*
 * Sort: Solar's bare cut of it, the bars and their arrow with no squircle
 * round them (the owner, 10-24: "u need to draw similar style icons that are
 * without their containers").
 */
export { default as IconSort } from "~icons/solar/sort-from-top-to-bottom-bold-duotone";
export { default as IconSortLinear } from "~icons/solar/sort-from-top-to-bottom-linear";
export { default as IconTextLongLinear } from "~icons/solar/sort-horizontal-linear";
export { default as IconUnfold } from "~icons/solar/sort-vertical-bold-duotone";
/** A release's New section (ReleaseNotes). */
export { default as IconStars } from "~icons/solar/stars-bold-duotone";
/** Stop; and an install stopped by the person, its status glyph (Add machine). */
export {
  default as IconStop,
  default as IconStopped,
} from "~icons/solar/stop-bold-duotone";
export { default as IconStopLinear } from "~icons/solar/stop-linear";
/** A work tab's Structure toggle, on: the solid cut beside its duotone off. */
export { default as IconStructureSolid } from "~icons/solar/structure-bold";
export { default as IconStructure } from "~icons/solar/structure-bold-duotone";
export { default as IconSun } from "~icons/solar/sun-bold-duotone";
export { default as IconSunLinear } from "~icons/solar/sun-linear";
/** A tablet: the stage drawn at a tablet's width. */
export { default as IconTablet } from "~icons/solar/tablet-bold-duotone";
export { default as IconTabletLinear } from "~icons/solar/tablet-linear";
export { default as IconLab } from "~icons/solar/test-tube-bold-duotone";
export { default as IconTextEmptyLinear } from "~icons/solar/text-cross-linear";
/*
 * The Dials card's switch of the component's words (the owner's pin 14 on
 * Dials with props: a glass, never a menu): Solar Linear's text glyphs, one
 * a case, as a bar's glass draws its symbols.
 */
export { default as IconTextLinear } from "~icons/solar/text-linear";
export { default as IconTextNoSpacesLinear } from "~icons/solar/text-selection-linear";
/** A transfer; a tab moved to another group (its menu's Move to group). */
export {
  default as IconMoveTab,
  default as IconTransfer,
} from "~icons/solar/transfer-horizontal-bold-duotone";
export { default as IconMoveTabLinear } from "~icons/solar/transfer-horizontal-linear";
export { default as IconTrash } from "~icons/solar/trash-bin-minimalistic-bold-duotone";
export { default as IconTrashLinear } from "~icons/solar/trash-bin-minimalistic-linear";
/** A project deleted for good: the bin with its lid's lines, beside Forget's plain bin. */
export { default as IconDeleteForGood } from "~icons/solar/trash-bin-trash-bold-duotone";
/** Values to tune: a hook's common fields, a tool's settings, the design graph's Controls. */
export { default as IconTuning } from "~icons/solar/tuning-2-bold-duotone";
export { default as IconTuningLinear } from "~icons/solar/tuning-2-linear";
export { default as IconWideLinear } from "~icons/solar/tv-linear";
export { default as IconReset } from "~icons/solar/undo-left-bold-duotone";
/** Undo and redo in a bar's glass (a canvas's tools), Solar's linear cut. */
export { default as IconUndoLinear } from "~icons/solar/undo-left-linear";
export { default as IconRedoLinear } from "~icons/solar/undo-right-linear";
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
