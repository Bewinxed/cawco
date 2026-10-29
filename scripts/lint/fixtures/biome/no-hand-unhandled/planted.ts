// Planted: an exhaustive switch ended by hand.
export const label = (state: "a" | "b"): string => {
  switch (state) {
    case "a":
      return "A";
    case "b":
      return "B";
    default: {
      const missed: never = state;
      return missed;
    }
  }
};
