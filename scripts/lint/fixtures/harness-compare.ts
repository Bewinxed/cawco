// What house/no-harness-compare must refuse (expected.txt): a compare or a
// case with a harness's name.
declare const harness: string;

export const compared = harness === "claude";
export const notCompared = harness !== "opencode";

export const named = (kind: string): number => {
  switch (kind) {
    case "pi":
      return 1;
    default:
      return 0;
  }
};

// Any other string, and a compare of two values, stands.
export const another = harness === "gemini";
export const values = harness === compared.toString();
