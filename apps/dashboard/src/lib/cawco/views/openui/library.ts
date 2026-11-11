/**
 * CawCo's view library with the dashboard's components as its renderers:
 * the one `@cawco/core/views-library` defines, whose schema the hub parses
 * drafts with and whose prompt Caw writes to. Only these render; a name
 * outside them is dropped by the parser and named by ViewOpenUI. OpenUI's
 * own component library and theme are not loaded (PRD §5.2).
 *
 * The block library (an agent's block in its reply, tsk-330) is the same
 * library less its task components, on the same renderers.
 */
import { blockLibrary, viewLibrary } from "@cawco/core/views-library";
import Diagram from "../../decisions/host/Diagram.svelte";
import BlockDiagram from "./BlockDiagram.svelte";
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

/** The components a block draws, by name. */
const BLOCK_RENDERERS = {
  Column: ViewColumn,
  Row: ViewRow,
  Text: ViewText,
  Badge: ViewBadge,
  StatTile: ViewStat,
  Table: ViewTable,
  Diagram: BlockDiagram,
} satisfies Record<string, OpenUIComponent>;

export const VIEW_LIBRARY = viewLibrary<OpenUIComponent>({
  ...BLOCK_RENDERERS,
  Diagram,
  Board: ViewBoard,
  StageColumn: ViewStageColumn,
  TaskCard: ViewTaskCard,
  TaskTable: ViewTaskTable,
  Calendar: ViewCalendarNode,
});

export const BLOCK_LIBRARY = blockLibrary<OpenUIComponent>(BLOCK_RENDERERS);
