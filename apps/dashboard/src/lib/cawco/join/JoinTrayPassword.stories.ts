/**
 * Where the password lives on Connect a machine's SSH form (Component Story
 * Format 3, live components): the designer's three answers, each at the
 * desk's 512px tray and the phone's sheet. Behind one line, opened by the
 * person who needs it; always shown, as today; or asked only once the
 * machine refuses the hub's key (the sign-in's own Needs you state).
 */
import JoinTrayFrame from "./preview/JoinTrayFrame.svelte";
import {
  ADDRESSES,
  SSH_KEY,
  signInRefused,
  TARGET,
} from "./preview/join-fixtures";

export default {
  title: "Connect a machine/Where the password lives",
  component: JoinTrayFrame,
  args: {
    layout: "desk",
    way: "ssh",
    target: TARGET,
    addresses: ADDRESSES,
    sshKey: SSH_KEY,
  },
};

const line = { taste: { password: "line" } };
const shown = { taste: { password: "shown" } };
const refused = { taste: { password: "refused" } };

/** Behind one line: the form is the target and its port. */
export const BehindALine = { args: line, parameters: { viewport: 640 } };
/** Behind one line, opened: today's field and hint under it. */
export const BehindALineOpen = {
  args: { ...line, passwordOpen: true },
  parameters: { viewport: 640 },
};
/** Behind one line, on the phone. */
export const BehindALinePhone = {
  args: { ...line, layout: "phone" },
  parameters: { viewport: 390 },
};

/** Always shown, as today. */
export const AlwaysShown = { args: shown, parameters: { viewport: 640 } };
/** Always shown, on the phone. */
export const AlwaysShownPhone = {
  args: { ...shown, layout: "phone" },
  parameters: { viewport: 390 },
};

/** Asked only when refused: the form holds no password at all. */
export const WhenRefused = { args: refused, parameters: { viewport: 640 } };
/** Asked only when refused: the machine refused the key, the field in place. */
export const WhenRefusedAsked = {
  args: { ...refused, job: signInRefused() },
  parameters: { viewport: 640 },
};
/** Asked only when refused, on the phone. */
export const WhenRefusedPhone = {
  args: { ...refused, layout: "phone" },
  parameters: { viewport: 390 },
};
