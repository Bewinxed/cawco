// What no-harness-compare must refuse: a compare, a case, a list or a lookup
// by a harness's name.
declare const harness: (name: string) => unknown;
declare const kind: string;
declare const name: string;

export const compared = kind === "claude";
export const notCompared = kind !== "opencode";
export const flipped = "pi" === kind;
export const loose = kind == "claude";
export const has = name.includes("claude");
export const listed = ["claude", "pi"].includes(kind);
export const lookedUp = harness("opencode");

export const cased = (value: string): number => {
  switch (value) {
    case "pi":
      return 1;
    default:
      return 0;
  }
};

// Any other string, and a compare of two values, stands.
export const another = kind === "gemini";
export const values = kind === name;
export const otherList = ["x"].includes(kind);
export const otherLookup = harness("gemini");
