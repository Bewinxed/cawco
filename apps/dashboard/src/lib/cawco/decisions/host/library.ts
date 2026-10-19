/**
 * The decision library with the host's Svelte components as its renderers:
 * the one `@cawco/core/decisions-library` defines, whose schema the hub
 * checks a program with. Text, Badge, Row and Column are the view library's
 * by name and shape, drawn by the host's own components on scoped styles, so
 * the host page depends on no styling of the dashboard's.
 */
import { decisionLibrary } from "@cawco/core/decisions-library";
import type { OpenUIComponent } from "../../views/openui/OpenUiRenderer.svelte";
import Badge from "./Badge.svelte";
import Canvas from "./Canvas.svelte";
import Column from "./Column.svelte";
import Decision from "./Decision.svelte";
import Decisions from "./Decisions.svelte";
import Diagram from "./Diagram.svelte";
import Dials from "./Dials.svelte";
import Image from "./Image.svelte";
import Option from "./Option.svelte";
import Preview from "./Preview.svelte";
import Row from "./Row.svelte";
import Section from "./Section.svelte";
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
});
