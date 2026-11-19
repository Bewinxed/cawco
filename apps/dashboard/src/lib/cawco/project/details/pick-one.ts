/**
 * An option group's value as the hub holds it: what reads chosen is the
 * hub's pick, and a press on another option asks for it (`ask`) without
 * moving the pick, so the old row stays chosen until the hub answers.
 */
export const pickOne = (
  chosen: () => string | null,
  ask: (value: string) => void
) => ({
  get: (): string[] => {
    const now = chosen();
    return now ? [now] : [];
  },
  set: (next: string[]): void => {
    const [value] = next;
    if (value && value !== chosen()) {
      ask(value);
    }
  },
});
