import type { UsageSummary } from "@cawco/core";
import type { PageLoad } from "./$types";

/** Local midnight, and the Monday that starts this week. */
function boundaries(now: Date): { today: number; week: number } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return { today: today.getTime(), week: week.getTime() };
}

/**
 * opencode's money line: what it recorded spending today, this week and in
 * all. Everything else on the page is live (the limits) or read by its block
 * for the range on screen.
 */
export const load: PageLoad = async ({ fetch }) => {
  const total = async (since?: number): Promise<number> => {
    const response = await fetch(
      `/api/usage/summary?harness=opencode&groupBy=model${since === undefined ? "" : `&since=${since}`}`
    );
    if (!response.ok) {
      throw new Error(`the hub answered ${response.status}`);
    }
    return ((await response.json()) as UsageSummary).totals.costUsd;
  };
  const { today, week } = boundaries(new Date());
  try {
    const [spentToday, spentWeek, spentAll] = await Promise.all([
      total(today),
      total(week),
      total(),
    ]);
    return {
      spend: { today: spentToday, week: spentWeek, all: spentAll },
      error: null,
    };
  } catch {
    return {
      spend: null,
      error:
        "Could not reach the hub for usage data. Check that it is running, then try again.",
    };
  }
};
