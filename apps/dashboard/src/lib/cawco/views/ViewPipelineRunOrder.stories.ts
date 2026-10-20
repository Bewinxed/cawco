/**
 * PROPOSED: the Pipeline as the run order (taskpane advisor §3): what runs
 * now, what comes next and what it waits on; done tasks folded. At the
 * pane's width on a desk, and on a phone.
 */
import PageRoom from "../project/preview/PageRoom.svelte";
import {
  DATES,
  sessionNameOf,
  sessionPlaceOf,
  TASKS,
} from "../tasks/preview/tidewater";
import ViewPipelineRunOrder from "./ViewPipelineRunOrder.svelte";

export default {
  title: "Pipeline/Run order",
  component: ViewPipelineRunOrder,
  args: {
    tasks: TASKS,
    dateOf: (id: string) => DATES[id] ?? null,
    hrefOf: (id: string) => `?task=${id}`,
    nameOf: sessionNameOf,
    placeOf: sessionPlaceOf,
  },
};

/** Desk · Working first, then waiting on you, then stuck, then next; a task that waits stands under the one it waits on. */
export const RunOrder = {
  decorators: [() => ({ Component: PageRoom, props: {} })],
  parameters: { viewport: 1180 },
};
/** Phone · Each task on two lines, its title whole. */
export const Phone = {
  decorators: [() => ({ Component: PageRoom, props: { phone: true } })],
  parameters: { viewport: "phone" },
};
