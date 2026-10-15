/**
 * The CSS a project's mockup is drawn with, inside its shadow root
 * (MockupFrame): the mockup's roles (`--mk-*`), neutral unless the
 * project's manifest maps them onto its own tokens, and a reset that keeps
 * the dashboard out. Two cascade layers, declared first, so the project's
 * own CSS (its layers and its unlayered rules, after them) wins over both.
 *
 * Why a shadow root, not `@scope`: `@scope` bounds how far a project's
 * selectors reach, but nothing stops the dashboard's styles from reaching
 * in (its inherited font and colour, its tokens on `:root`), and the
 * project's `:root` tokens would land on the dashboard's own root. A shadow
 * root bounds selectors both ways by itself: the dashboard's rules match
 * nothing inside, the project's nothing outside. What still crosses it is
 * inheritance, which the reset ends at the host: `all: initial` for every
 * inherited property, and `initial` for each custom property the
 * dashboard's sheets declare (`all` leaves custom properties alone), so a
 * project's CSS never reads a CawCo token it did not set.
 */
import type { MockupFont, MockupRole } from "@cawco/core/mockups";

const UPPER = /[A-Z]/g;
const KEBAB = /-([a-z])/g;

/** A role's custom property: `onAccent` → `--mk-on-accent`. */
export const roleProperty = (role: MockupRole): string =>
  `--mk-${role.replace(UPPER, (letter) => `-${letter.toLowerCase()}`)}`;

/**
 * Each role where a project maps none: greys and the system's own face,
 * never CawCo's look. They follow the scheme the host is given.
 */
const NEUTRAL: Record<MockupRole, string> = {
  canvas: "light-dark(oklch(97.5% 0 0), oklch(17% 0 0))",
  surface: "light-dark(oklch(100% 0 0), oklch(22% 0 0))",
  sunken: "light-dark(oklch(95% 0 0), oklch(27% 0 0))",
  ink: "light-dark(oklch(22% 0 0), oklch(95% 0 0))",
  muted: "light-dark(oklch(50% 0 0), oklch(70% 0 0))",
  line: "light-dark(oklch(88% 0 0), oklch(35% 0 0))",
  accent: "light-dark(oklch(30% 0 0), oklch(90% 0 0))",
  onAccent: "light-dark(oklch(99% 0 0), oklch(15% 0 0))",
  positive: "oklch(55% 0.12 150)",
  caution: "oklch(66% 0.13 75)",
  critical: "oklch(55% 0.17 27)",
  fontBody: "system-ui, sans-serif",
  fontDisplay: "system-ui, sans-serif",
  textSize: "0.9375rem",
  space: "0.25rem",
  radius: "0.5rem",
  radiusSmall: "0.375rem",
  shadow: "0 1px 2px oklch(0% 0 0 / 0.08), 0 4px 12px oklch(0% 0 0 / 0.06)",
};

const declarations = (values: Partial<Record<MockupRole, string>>): string =>
  Object.entries(values)
    .map(([role, value]) => `${roleProperty(role as MockupRole)}: ${value};`)
    .join("\n    ");

/** Every custom property the dashboard's own sheets declare: what the reset ends at the host. */
export const dashboardProperties = (): string[] => {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (let at = 0; at < rule.style.length; at += 1) {
          const name = rule.style.item(at);
          if (name.startsWith("--") && !name.startsWith("--mk-")) {
            names.add(name);
          }
        }
      }
      if ("cssRules" in rule) {
        walk((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    walk(sheet.cssRules);
  }
  return [...names];
};

/** The shadow root's own sheet: the reset and the neutral roles, then the project's roles. */
export const shadowCss = (
  roles: Partial<Record<MockupRole, string>>,
  reset: string[]
): string => `@layer mk-base, mk-roles;
@layer mk-base {
  :host {
    all: initial;
    display: block;
    ${reset.map((name) => `${name}: initial;`).join("\n    ")}
    ${declarations(NEUTRAL)}
    font-family: var(--mk-font-body);
    font-size: var(--mk-text-size);
    line-height: 1.45;
    color: var(--mk-ink);
  }
  *, *::before, *::after { box-sizing: border-box; }
  .mk-root {
    display: flex;
    flex-direction: column;
    padding: calc(var(--mk-space) * 6);
    background: var(--mk-canvas);
    overflow: auto;
  }
}
@layer mk-roles {
  :host {
    ${declarations(roles)}
  }
}
`;

/** A font's @font-face descriptors as FontFace takes them: `unicode-range` → `unicodeRange`. */
export const fontDescriptors = (font: MockupFont): FontFaceDescriptors =>
  Object.fromEntries(
    Object.entries(font.descriptors).map(([name, value]) => [
      name.replace(KEBAB, (_dash, letter: string) => letter.toUpperCase()),
      value,
    ])
  );
