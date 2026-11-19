/**
 * The project details card to use (Component Story Format 3, live
 * components): the project's head as it ships, the card hung from its
 * place mark, every press answered by a stand-in for the hub. The dials set
 * what no press reaches: what the hub says of the project, and whether it
 * takes a change or refuses it.
 */
import DetailsCardLive from "./details-card-live.svelte";

export default {
  title: "Project details/Use it",
  component: DetailsCardLive,
  args: {
    situation: "all-well",
    view: "card",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

/** My project's details at a glance on a laptop: agents can start, and how it is set. */
export const Live = {};

/** The same card on a wide screen, where each folder's whole path stands. */
export const LiveWide = { parameters: { viewport: 1440 } };

/** The same details on my phone, as a sheet over the project. */
export const LivePhone = { parameters: { viewport: "phone" } };
