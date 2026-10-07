/**
 * CawCo's A2UI catalog for svelte-a2ui: the dashboard's components,
 * registered under exactly the names core's catalog lists
 * (`CAWCO_COMPONENT_NAMES`). Only these render; a name outside them draws
 * the Missing alert. svelte-a2ui's basic catalog and its theme are not
 * loaded (PRD §5.2).
 */
import {
  CAWCO_CATALOG_ID,
  CAWCO_COMPONENT_NAMES,
  type CawcoComponentName,
} from "@cawco/core";
import {
  type Catalog,
  type CatalogEntry,
  createCatalogRegistry,
} from "svelte-a2ui";
import Layout from "./Layout.svelte";
import Text from "./Text.svelte";
import ViewBadge from "./ViewBadge.svelte";
import ViewBoard from "./ViewBoard.svelte";
import ViewCalendarNode from "./ViewCalendarNode.svelte";
import ViewPipelineNode from "./ViewPipelineNode.svelte";
import ViewStageColumn from "./ViewStageColumn.svelte";
import ViewStat from "./ViewStat.svelte";
import ViewTable from "./ViewTable.svelte";
import ViewTaskCard from "./ViewTaskCard.svelte";

const ENTRIES: Record<CawcoComponentName, CatalogEntry> = {
  Board: { component: ViewBoard, slots: { children: "children" } },
  StageColumn: { component: ViewStageColumn, raw: ["fields"] },
  TaskCard: { component: ViewTaskCard, raw: ["fields"] },
  Table: { component: ViewTable, raw: ["columns"] },
  Calendar: { component: ViewCalendarNode },
  Pipeline: { component: ViewPipelineNode },
  StatTile: { component: ViewStat },
  Text: { component: Text },
  Row: { component: Layout, slots: { children: "children" } },
  Column: { component: Layout, slots: { children: "children" } },
  Badge: { component: ViewBadge },
};

const cawcoCatalog: Catalog = {
  id: CAWCO_CATALOG_ID,
  components: Object.fromEntries(
    CAWCO_COMPONENT_NAMES.map((name) => [name, ENTRIES[name]])
  ),
};

/** The registry every view's surface resolves its components in. */
export const VIEW_CATALOG = createCatalogRegistry([cawcoCatalog]);
