/**
 * Planted numeric reads of custom properties for house/typed-property-read
 * (expected.txt), beside reads it must let stand.
 */
export const sliver = (node: HTMLElement): number =>
  Number.parseFloat(getComputedStyle(node).getPropertyValue("--planted-min"));

export const trimmed = (node: HTMLElement): number =>
  +getComputedStyle(node).getPropertyValue("--planted-gap").trim();

export const kept = (node: HTMLElement): number => {
  const value = getComputedStyle(node).getPropertyValue("--planted-step");
  return Number(value);
};

export const helped = (node: HTMLElement): number => {
  const style = getComputedStyle(node);
  const px = (name: string) =>
    Number.parseFloat(style.getPropertyValue(name)) || 0;
  return px("--card-min") + px("--planted-inset");
};

export const unfollowed = (node: HTMLElement, name: string): number =>
  Number.parseInt(getComputedStyle(node).getPropertyValue(name), 10);

// Let stand: a typed property, a standard property, and a read kept as text.
export const typed = (node: HTMLElement): number =>
  Number.parseFloat(getComputedStyle(node).getPropertyValue("--card-min"));
export const standard = (node: HTMLElement): number =>
  Number.parseFloat(
    getComputedStyle(node).getPropertyValue("border-top-width")
  );
export const text = (node: HTMLElement): string =>
  getComputedStyle(node).getPropertyValue("--planted-ease").trim();
