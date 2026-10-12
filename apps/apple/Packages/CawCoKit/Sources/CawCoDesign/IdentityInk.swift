import UIKit

/// A directory's identity colour (app.css `identity-ink`):
/// `oklch(from var(--identity-ink) l c var(--identity-h))`, the token's
/// lightness and chroma for each appearance at the directory's own hue.
public enum IdentityInk {
    public static func color(hue: Double) -> UIColor {
        UIColor { traits in
            let ink = Palette.identityInk.resolvedColor(with: traits)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            ink.getRed(&r, green: &g, blue: &b, alpha: &a)
            let (l, c, _) = OKLab.lch(r, g, b)
            let (r2, g2, b2) = OKLab.rgb(l: l, c: c, h: hue)
            return UIColor(red: r2, green: g2, blue: b2, alpha: a)
        }
    }
}

/// Extended sRGB ↔ OKLCH (Björn Ottosson's OKLab, the space CSS `oklch()` uses).
enum OKLab {
    private static func linear(_ v: Double) -> Double {
        let m = abs(v)
        let out = m <= 0.04045 ? m / 12.92 : pow((m + 0.055) / 1.055, 2.4)
        return v < 0 ? -out : out
    }

    private static func gamma(_ v: Double) -> Double {
        let m = abs(v)
        let out = m <= 0.0031308 ? m * 12.92 : 1.055 * pow(m, 1 / 2.4) - 0.055
        return v < 0 ? -out : out
    }

    static func lch(_ red: Double, _ green: Double, _ blue: Double) -> (Double, Double, Double) {
        let r = linear(red), g = linear(green), b = linear(blue)
        let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        let L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        let A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        let B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        return (L, (A * A + B * B).squareRoot(), atan2(B, A) * 180 / .pi)
    }

    static func rgb(l L: Double, c: Double, h: Double) -> (Double, Double, Double) {
        let A = c * cos(h * .pi / 180), B = c * sin(h * .pi / 180)
        let l = pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
        let m = pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
        let s = pow(L - 0.0894841775 * A - 1.2914855480 * B, 3)
        return (
            gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
        )
    }
}

/// An account's colours (rings.ts `hueToken`, Rings.svelte `.arc.week`):
/// its `account-<hue>` token, and its week's shade, the hue mixed in oklch
/// toward `account-week-toward` by `account-week-mix`
/// (`color-mix(in oklch, hue, toward mix%)`; the toward colour's hue is
/// `none`, so only lightness and chroma move).
public enum AccountInk {
    /// The `account-<hue>` token (core AccountHue); an unknown hue reads as amber, the first.
    public static func color(_ hue: String) -> UIColor {
        switch hue {
        case "blue": Palette.accountBlue
        case "cyan": Palette.accountCyan
        case "green": Palette.accountGreen
        case "orange": Palette.accountOrange
        case "rose": Palette.accountRose
        case "violet": Palette.accountViolet
        default: Palette.accountAmber
        }
    }

    /// The week rim's and week mark's shade of `hue`.
    public static func week(_ hue: String) -> UIColor {
        let base = color(hue)
        return UIColor { traits in
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            base.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
            var tr: CGFloat = 0, tg: CGFloat = 0, tb: CGFloat = 0, ta: CGFloat = 0
            Palette.accountWeekToward.resolvedColor(with: traits).getRed(&tr, green: &tg, blue: &tb, alpha: &ta)
            let mix = Motion.accountWeekMix.value(for: traits)
            let (l, c, h) = OKLab.lch(r, g, b)
            let (tl, tc, _) = OKLab.lch(tr, tg, tb)
            let (r2, g2, b2) = OKLab.rgb(l: l + (tl - l) * mix, c: c + (tc - c) * mix, h: h)
            return UIColor(red: r2, green: g2, blue: b2, alpha: a)
        }
    }
}
