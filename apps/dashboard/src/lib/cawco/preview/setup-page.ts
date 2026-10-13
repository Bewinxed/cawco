/**
 * A new project's setup page (the page artifact `setup` its Caw makes, the
 * hub's setup.ts). The hub applies its fleet choices and place on every
 * send; the pane only tells it apart, to put the phone's sheet away once it
 * is sent.
 */
export const SETUP_PAGE = "setup";

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
