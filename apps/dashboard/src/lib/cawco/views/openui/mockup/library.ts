/**
 * A project's mockup library with the dashboard's components as its
 * renderers: the one `@cawco/core/mockups` defines, from the same design the
 * hub checks a mockup against (hub mockups.ts), so both read it alike.
 *
 * - The primitives (`Mk*`) are drawn with the mockup's roles alone
 *   (`--mk-*`), and carry their styles with them (`css="injected"`) into
 *   the shadow root a project's mockup is drawn in.
 * - A project drawn as CawCo (`system: "cawco"`) also gets CawCo's own
 *   components (`cawco/Cw*`), each the dashboard's real component over
 *   made-up props, and its Button, Badge, Input and Switch are the kit's.
 * - Every specimen is drawn by MkSpecimen from its template.
 */
import {
  type MockupDesign,
  type MockupRenderers,
  mockupLibrary,
} from "@cawco/core/mockups";
import type { OpenUIComponent, OpenUILibrary } from "../OpenUiRenderer.svelte";
import CwAlert from "./cawco/CwAlert.svelte";
import CwBadge from "./cawco/CwBadge.svelte";
import CwBoardColumn from "./cawco/CwBoardColumn.svelte";
import CwButton from "./cawco/CwButton.svelte";
import CwComposer from "./cawco/CwComposer.svelte";
import CwInput from "./cawco/CwInput.svelte";
import CwMachineRow from "./cawco/CwMachineRow.svelte";
import CwMessage from "./cawco/CwMessage.svelte";
import CwSessionRow from "./cawco/CwSessionRow.svelte";
import CwSwitch from "./cawco/CwSwitch.svelte";
import CwTaskCard from "./cawco/CwTaskCard.svelte";
import CwToolCalls from "./cawco/CwToolCalls.svelte";
import MkAnnotation from "./MkAnnotation.svelte";
import MkBadge from "./MkBadge.svelte";
import MkButton from "./MkButton.svelte";
import MkCard from "./MkCard.svelte";
import MkDevice from "./MkDevice.svelte";
import MkDialog from "./MkDialog.svelte";
import MkGrid from "./MkGrid.svelte";
import MkImage from "./MkImage.svelte";
import MkInput from "./MkInput.svelte";
import MkListRow from "./MkListRow.svelte";
import MkNav from "./MkNav.svelte";
import MkSpecimen from "./MkSpecimen.svelte";
import MkStack from "./MkStack.svelte";
import MkStates from "./MkStates.svelte";
import MkSwitch from "./MkSwitch.svelte";
import MkTabs from "./MkTabs.svelte";
import MkText from "./MkText.svelte";

const RENDERERS: MockupRenderers<OpenUIComponent> = {
  Stack: MkStack,
  Grid: MkGrid,
  Text: MkText,
  Badge: MkBadge,
  Button: MkButton,
  Input: MkInput,
  Switch: MkSwitch,
  Card: MkCard,
  Image: MkImage,
  Nav: MkNav,
  Tabs: MkTabs,
  ListRow: MkListRow,
  Dialog: MkDialog,
  Device: MkDevice,
  Annotation: MkAnnotation,
  States: MkStates,
  SessionRow: CwSessionRow,
  Message: CwMessage,
  ToolCalls: CwToolCalls,
  Composer: CwComposer,
  TaskCard: CwTaskCard,
  BoardColumn: CwBoardColumn,
  MachineRow: CwMachineRow,
  Alert: CwAlert,
  Specimen: MkSpecimen,
};

/** CawCo's kit, for a project drawn as CawCo: the same props, the dashboard's own controls. */
const CAWCO_KIT: Partial<MockupRenderers<OpenUIComponent>> = {
  Button: CwButton,
  Badge: CwBadge,
  Input: CwInput,
  Switch: CwSwitch,
};

/** Each library made, by its design's hash: a parser is memoised by the library's identity. */
const made = new Map<string, OpenUILibrary>();

/** The library for a project's design, made once per design hash. */
export const mockupLibraryOf = (
  hash: string,
  design: MockupDesign
): OpenUILibrary => {
  const kept = made.get(hash);
  if (kept) {
    return kept;
  }
  const library = mockupLibrary<OpenUIComponent>(
    design.system === "cawco" ? { ...RENDERERS, ...CAWCO_KIT } : RENDERERS,
    design
  );
  made.set(hash, library);
  return library;
};
