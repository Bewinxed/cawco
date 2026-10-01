// biome-ignore lint/style/useConsistentTypeDefinitions: shared public contract requested as a type alias.
export type SpringSpec = { visualDuration: number; bounce: number };

export function springFromVisual(spec: SpringSpec): {
  stiffness: number;
  damping: number;
} {
  const frequency = (2 * Math.PI) / spec.visualDuration;
  return {
    stiffness: frequency ** 2 / 3600,
    damping: (2 * frequency * (1 - spec.bounce)) / 60,
  };
}
