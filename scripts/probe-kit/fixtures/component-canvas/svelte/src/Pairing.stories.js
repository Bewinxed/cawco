import Pairing from "./Pairing.svelte";

export default {
  title: "Flows/Pairing",
  component: Pairing,
  parameters: { viewport: "phone" },
};

/** Waiting for the phone to scan the code. */
export const Waiting = { args: { status: "waiting" } };

/** The phone said yes: the code leaves and the face comes in. */
export const Approved = {
  args: { status: "approved" },
  from: "Waiting",
  play: async ({ update }) => {
    await update({ status: "approved" });
  },
};
