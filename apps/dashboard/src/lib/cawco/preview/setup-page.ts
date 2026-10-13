import type { ArtifactChoices, ChoiceEntry } from "@cawco/core";
import { addProjectPlace, setFleetChoices } from "../client.svelte";

/**
 * A new project's setup page (the page artifact `setup` its Caw makes, the
 * hub's setup.ts): when the person sends its picks, the dashboard applies
 * what is the fleet's and the project's own before Caw hears them, so he
 * writes only the project's files.
 *
 * - `fleet-delegates`, `fleet-todos`: `on` or `off`, to `PUT /api/fleet/choices`.
 * - `place`: `{ machineId, path }` from `cawco.pickPlace()`, added as the
 *   project's checkout (its first: its primary).
 */
export const SETUP_PAGE = "setup";

const onOff = (choices: ArtifactChoices, id: string): boolean | undefined => {
  const [option] = choices.choices[id]?.options ?? [];
  if (option === "on") {
    return true;
  }
  return option === "off" ? false : undefined;
};

const placeOf = (
  choices: ArtifactChoices
): { machineId: string; path: string } | undefined => {
  const entry: ChoiceEntry | undefined = choices.choices.place;
  const value = entry?.value as
    | { machineId?: unknown; path?: unknown }
    | null
    | undefined;
  return typeof value?.machineId === "string" &&
    typeof value.path === "string" &&
    value.path.startsWith("/")
    ? { machineId: value.machineId, path: value.path }
    : undefined;
};

/** The artifact a panel shows, as the setup page is told apart. */
interface Shown {
  kind: string;
  name: string;
}

/** Whether `artifact`, made by a session of `projectId`, is that project's setup page. */
export const isSetupPage = (
  artifact: Shown | undefined,
  projectId: string | null | undefined
): projectId is string =>
  !!projectId && artifact?.kind === "page" && artifact.name === SETUP_PAGE;

/** Applies the setup page's fleet choices and place, when it is the project's setup page; a refusal throws. */
export async function applySetupPicks(
  artifact: Shown | undefined,
  projectId: string | null | undefined,
  choices: ArtifactChoices | null
): Promise<void> {
  if (!(isSetupPage(artifact, projectId) && choices)) {
    return;
  }
  const delegates = onOff(choices, "fleet-delegates");
  const todos = onOff(choices, "fleet-todos");
  if (delegates !== undefined || todos !== undefined) {
    await setFleetChoices({
      ...(delegates === undefined ? {} : { delegates }),
      ...(todos === undefined ? {} : { todos }),
    });
  }
  const place = placeOf(choices);
  if (place) {
    await addProjectPlace(projectId, place);
  }
}
