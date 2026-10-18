/**
 * The decision library with the host's Svelte components as its renderers:
 * the one `@cawco/core/decisions-library` defines, whose schema the hub
 * checks a program with. Text, Row and Column are the view library's own
 * renderers, by name and shape.
 */
import { decisionLibrary } from "@cawco/core/decisions-library";
import type { OpenUIComponent } from "../../views/openui/OpenUiRenderer.svelte";
import ViewColumn from "../../views/openui/ViewColumn.svelte";
import ViewRow from "../../views/openui/ViewRow.svelte";
import ViewText from "../../views/openui/ViewText.svelte";
import Badge from "./Badge.svelte";
import Canvas from "./Canvas.svelte";
import Decision from "./Decision.svelte";
import Decisions from "./Decisions.svelte";
import Diagram from "./Diagram.svelte";
import Dials from "./Dials.svelte";
import Image from "./Image.svelte";
import Option from "./Option.svelte";
import Preview from "./Preview.svelte";
import Section from "./Section.svelte";

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
  Text: ViewText,
  Badge,
  Row: ViewRow,
  Column: ViewColumn,
});
