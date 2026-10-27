/**
 * The overlay's own pick (agent preview-overlay pick.ts `listenForPicks`),
 * wired to the probe's stand-in bridge (decision-embeds.ts `CAWCO_BRIDGE`)
 * instead of the page's doc: a press on an option picks it as it does where
 * CawCo shows the page. Bundled for the page by `startDecisionStage` and
 * served beside it.
 */
import { listenForPicks } from "../../packages/agent/src/preview-overlay/pick";

interface StandIn {
  choose: (choice: string, option: string | string[] | null) => Promise<void>;
  on: (
    event: "picks",
    listener: (picks: Record<string, { options: string[] }>) => void
  ) => () => void;
}

const bridge = (window as unknown as { cawco?: StandIn }).cawco;
if (bridge) {
  let now: Record<string, { options: string[] }> = {};
  bridge.on("picks", (picks) => {
    now = picks;
  });
  listenForPicks(window, {
    choose: bridge.choose,
    interacting: () => true,
    keepsPicks: () => true,
    picked: (choice) => now[choice]?.options ?? [],
    refused: () => undefined,
  });
}
