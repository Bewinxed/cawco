/**
 * The six moments every guide-after-a-reply option is drawn at: back at a
 * desk, the first stop of stepping, the stop on pin ② (changed, no answer),
 * a 30-minute run's rollup, and the phone's session sheet and artifact tab.
 */
export type Scene =
  "came-back" | "stop-1" | "pin-2" | "rollup" | "phone-session" | "phone-tab";

/** What each scene still washes: changed and not looked at. */
export const WASHED: Record<Scene, string[]> = {
  "came-back": ["#headline", "#cta", "#shot"],
  "stop-1": ["#headline", "#cta", "#shot"],
  "pin-2": ["#shot"],
  rollup: ["#headline", "#cta", "#shot", "#sub", "#foot", "#nav-docs"],
  "phone-session": ["#headline", "#cta", "#shot"],
  "phone-tab": ["#headline", "#cta", "#shot"],
};

/** The element a step chose, and which stop of today's tag it is. */
export const STEPPED: Partial<Record<Scene, { anchor: string; stop: number }>> =
  {
    "stop-1": { anchor: "#headline", stop: 1 },
    "pin-2": { anchor: "#shot", stop: 3 },
  };
