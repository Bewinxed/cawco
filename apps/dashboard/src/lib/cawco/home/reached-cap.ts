/**
 * A project's day budget, reached: $12.40 of $10, six hours left of its
 * day. What Needs you's budget row draws in its stories and the address
 * previews.
 */
import type { ProjectCap } from "@cawco/core/areas";
import { HOUR_MS } from "@cawco/core/time";

export const reachedCap = (): ProjectCap => ({
  from: "project",
  inherited: false,
  onCap: "quiet",
  onCapFrom: "project",
  period: "day",
  reached: true,
  resetsAt: Date.now() + 6 * HOUR_MS,
  spentUsd: 12.4,
  startsAt: Date.now() - 18 * HOUR_MS,
  usd: 10,
});
