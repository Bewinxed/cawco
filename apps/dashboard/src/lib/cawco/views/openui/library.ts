/**
 * CawCo's view library with the dashboard's components as its renderers:
 * the one `@cawco/core/views-library` defines, whose schema the hub parses
 * drafts with and whose prompt Caw writes to. Only these render; a name
 * outside them is dropped by the parser and named by ViewOpenUI. OpenUI's
 * own component library and theme are not loaded (PRD §5.2).
 */
import { viewLibrary } from "@cawco/core/views-library";
import type { OpenUIComponent } from "./OpenUiRenderer.svelte";
import ViewBadge from "./ViewBadge.svelte";
import ViewBoard from "./ViewBoard.svelte";
import ViewCalendarNode from "./ViewCalendarNode.svelte";
import ViewColumn from "./ViewColumn.svelte";
import ViewPipelineNode from "./ViewPipelineNode.svelte";
import ViewRow from "./ViewRow.svelte";
import ViewStageColumn from "./ViewStageColumn.svelte";
import ViewStat from "./ViewStat.svelte";
import ViewTable from "./ViewTable.svelte";
import ViewTaskCard from "./ViewTaskCard.svelte";
import ViewText from "./ViewText.svelte";

export const VIEW_LIBRARY = viewLibrary<OpenUIComponent>({
  Column: ViewColumn,
  Row: ViewRow,
  Text: ViewText,
  Badge: ViewBadge,
  StatTile: ViewStat,
  Board: ViewBoard,
  StageColumn: ViewStageColumn,
  TaskCard: ViewTaskCard,
  Table: ViewTable,
  Calendar: ViewCalendarNode,
  Pipeline: ViewPipelineNode,
});
