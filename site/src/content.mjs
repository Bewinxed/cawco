export const GITHUB_URL = "https://github.com/Bewinxed/cawco";
export const APP_STORE_URL = "#";

// The owner supplied $9.99 on 2026-10-03; both pages read this one plan.
// A null price uses pricingState. No trial or usage limits have been agreed.
export const IOS_PLAN = {
  name: "CawCo for iPhone",
  price: "$9.99",
  /** @type {'once' | 'month'} */
  period: "once",
  pricingState: "Pricing at launch",
  availability: "Coming soon",
  includes: ["Your fleet, wherever you are", "Live transcripts and session control", "Connects to your self-hosted hub"],
  platforms: "For iPhone, iPad and Mac",
};
