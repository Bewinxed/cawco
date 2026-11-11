/**
 * CawCo's view library with the dashboard's components as its renderers:
 * the one `@cawco/core/views-library` defines, whose schema the hub parses
 * drafts with and whose prompt Caw writes to. Only these render; a name
 * outside them is dropped by the parser and named by ViewOpenUI. OpenUI's
 * own component library and theme are not loaded (PRD §5.2).
 *
 * The block library (an agent's block in its reply, tsk-330) is the same
 * library less its task components, with the media a block shows (a
 * picture, a clip, a sound, a slideshow, a page artifact), on the same
 * renderers where both draw a component.
 */
import { blockLibrary, viewLibrary } from "@cawco/core/views-library";
import Diagram from "../../decisions/host/Diagram.svelte";
import BlockAudio from "./BlockAudio.svelte";
import BlockDiagram from "./BlockDiagram.svelte";
import BlockImage from "./BlockImage.svelte";
import BlockPreview from "./BlockPreview.svelte";
import BlockSlides from "./BlockSlides.svelte";
import BlockVideo from "./BlockVideo.svelte";
import type { OpenUIComponent } from "./OpenUiRenderer.svelte";
import ViewBadge from "./ViewBadge.svelte";
import ViewBoard from "./ViewBoard.svelte";
import ViewCalendarNode from "./ViewCalendarNode.svelte";
import ViewColumn from "./ViewColumn.svelte";
import ViewRow from "./ViewRow.svelte";
import ViewStageColumn from "./ViewStageColumn.svelte";
import ViewStat from "./ViewStat.svelte";
import ViewTable from "./ViewTable.svelte";
import ViewTaskCard from "./ViewTaskCard.svelte";
import ViewTaskTable from "./ViewTaskTable.svelte";
import ViewText from "./ViewText.svelte";

/** The components a view and a block both draw, by name. */
const SHARED = {
  Column: ViewColumn,
  Row: ViewRow,
  Text: ViewText,
  Badge: ViewBadge,
  StatTile: ViewStat,
  Table: ViewTable,
} satisfies Record<string, OpenUIComponent>;

export const VIEW_LIBRARY = viewLibrary<OpenUIComponent>({
  ...SHARED,
  Diagram,
  Board: ViewBoard,
  StageColumn: ViewStageColumn,
  TaskCard: ViewTaskCard,
  TaskTable: ViewTaskTable,
  Calendar: ViewCalendarNode,
});

/** A block's, in a reply: its Diagram sized as a block sizes it, and its media read through the reply (block-media.ts). */
export const BLOCK_LIBRARY = blockLibrary<OpenUIComponent>({
  ...SHARED,
  Diagram: BlockDiagram,
  Image: BlockImage,
  Video: BlockVideo,
  Audio: BlockAudio,
  Slides: BlockSlides,
  Preview: BlockPreview,
});
