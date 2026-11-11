/**
 * The decision library with the host's Svelte components as its renderers:
 * the one `@cawco/core/decisions-library` defines, whose schema the hub
 * checks a program with. Text, Badge, Row and Column are the view library's
 * by name and shape, drawn by the host's own components on scoped styles, so
 * the host page depends on no styling of the dashboard's.
 */
import { decisionLibrary } from "@cawco/core/decisions-library";
import { blockLibrary } from "@cawco/core/views-library";
import BlockDiagram from "../../views/openui/BlockDiagram.svelte";
import type { OpenUIComponent } from "../../views/openui/OpenUiRenderer.svelte";
import ViewStat from "../../views/openui/ViewStat.svelte";
import ViewTable from "../../views/openui/ViewTable.svelte";
import Badge from "./Badge.svelte";
import Canvas from "./Canvas.svelte";
import Column from "./Column.svelte";
import Data from "./Data.svelte";
import Decision from "./Decision.svelte";
import Decisions from "./Decisions.svelte";
import Diagram from "./Diagram.svelte";
import Dials from "./Dials.svelte";
import Image from "./Image.svelte";
import Option from "./Option.svelte";
import Preview from "./Preview.svelte";
import Row from "./Row.svelte";
import Section from "./Section.svelte";
import Setup from "./Setup.svelte";
import Text from "./Text.svelte";

export const DECISION_LIBRARY = decisionLibrary<OpenUIComponent>({
  Decisions,
  Section,
  Decision,
  Option,
  Image,
  Diagram,
  Canvas,
  Preview,
  Dials,
  Text,
  Badge,
  Row,
  Column,
  Setup,
  Stage: Data,
  Delegate: Data,
});

/**
 * A kept block's library on the host page (core `blockLibrary`, tsk-330):
 * the host's own Text, Badge, Row and Column, as a decision page draws
 * them, with the dashboard's figure, table and this host's Diagram as a
 * block sizes it (BlockDiagram), so a block kept as an artifact draws in
 * the panel as it did in the reply.
 */
export const HOST_BLOCK_LIBRARY = blockLibrary<OpenUIComponent>({
  Column,
  Row,
  Text,
  Badge,
  StatTile: ViewStat,
  Table: ViewTable,
  Diagram: BlockDiagram,
});
