import CoreText
import UIKit

/// A type role from the token source (`TypeScale.type*`): weight, size, line
/// height and font stack. `size` is a range because title and kpi are fluid
/// on the web; every other role's range is one value.
public struct TypeRole: Sendable {
    /// A fluid size's preferred value, `clamp(min, base + perViewport·100vi, max)`.
    public struct Fluid: Sendable {
        public let base: Double
        /// Points per point of viewport width.
        public let perViewport: Double
    }

    public let weight: UIFont.Weight
    public let size: ClosedRange<Double>
    /// Line height as a multiple of the size.
    public let leading: Double
    /// The CSS font stack, first choice first.
    public let family: [String]
    /// How a fluid role (title, kpi) grows with the viewport between its bounds.
    public let fluid: Fluid?
    /// The letter-spacing the role is set with, in em: the token its web
    /// utility carries (`--text-title--letter-spacing`), zero for a role
    /// the web sets untracked.
    public let tracking: Double

    init(weight: UIFont.Weight, size: ClosedRange<Double>, leading: Double, family: [String], fluid: Fluid? = nil, tracking: Double = 0) {
        self.weight = weight
        self.size = size
        self.leading = leading
        self.family = family
        self.fluid = fluid
        self.tracking = tracking
    }

    /// The role's size on a compact screen: a fluid role's smallest.
    public var points: Double { size.lowerBound }

    /// The role's size in a viewport `width` points wide, as the browser
    /// resolves the token's clamp() at that width.
    public func points(viewport width: Double) -> Double {
        guard let fluid else { return size.lowerBound }
        return min(size.upperBound, max(size.lowerBound, fluid.base + fluid.perViewport * width))
    }

    /// The role's font: Figtree (the stack's first choice) at the token's
    /// weight on its variable `wght` axis, scaled by Dynamic Type from the
    /// token's size at the default setting.
    public var font: UIFont {
        font(points)
    }

    /// The role's face at another size, as a web rule that keeps a role's
    /// family and weight but restates its size (`font-size: var(--text-label)`
    /// on a mono run), scaled by Dynamic Type the same way.
    public func font(_ size: Double, weight: UIFont.Weight? = nil) -> UIFont {
        let mono = family.first?.hasPrefix("JetBrains Mono") == true
        let base = UIFont(descriptor: Self.descriptor(weight: weight ?? self.weight, mono: mono,
                                                      wordmark: family.first?.hasPrefix("Nunito") == true), size: size)
        return UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base)
    }

    /// The role's line height in points, at the font's scaled size.
    public var lineHeight: Double { font.pointSize * leading }

    /// Text attributes that set a string in this role. `tracking`, in em,
    /// is the role's own unless the element it ports restates it.
    public func attributes(color: UIColor, tracking: Double? = nil, alignment: NSTextAlignment = .natural) -> [NSAttributedString.Key: Any] {
        let font = font
        let line = LineBox.label(font, height: font.pointSize * leading)
        line.paragraph.alignment = alignment
        line.paragraph.lineBreakMode = .byTruncatingTail
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: line.paragraph,
            .baselineOffset: line.baselineOffset,
        ]
        // A kern attribute, even of zero, turns the face's own pair kerning
        // off. Untracked text keeps that kerning, as the web sets it; tracked
        // text loses it there too (measured in Mobile Safari 27.2: "your" at
        // 12pt is 23.89 with its y-o pair, and a title at -0.01em has none).
        let kern = (tracking ?? self.tracking) * font.pointSize
        if kern != 0 { attributes[.kern] = kern }
        return attributes
    }

    private var textStyle: UIFont.TextStyle {
        switch points {
        case ..<12.5: .caption1
        case ..<13.5: .footnote
        case ..<16: .subheadline
        default: .title3
        }
    }

    /// The CSS weight number the variable axis takes.
    private static func axis(_ weight: UIFont.Weight) -> Double {
        switch weight {
        case .ultraLight: 100
        case .thin: 200
        case .light: 300
        case .medium: 500
        case .semibold: 600
        case .bold: 700
        case .heavy: 800
        case .black: 900
        default: 400
        }
    }

    /// `wght`, the variation axis tag, as CoreText numbers it.
    private static let weightAxis = 0x7767_6874

    private static func register(_ file: String, family: String) -> String {
        if let url = Bundle.module.url(forResource: file, withExtension: "ttf", subdirectory: "Fonts")
            ?? Bundle.module.url(forResource: file, withExtension: "ttf")
        {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return family
    }

    private static let sans = register("Figtree", family: "Figtree")
    private static let wordmarkFamily = register("Nunito", family: "Nunito")
    /// JetBrains Mono, the mono stack's first choice; its ligatures (`calt`) off.
    private static let monoFamily = register("JetBrainsMono", family: "JetBrains Mono")

    private static func descriptor(weight: UIFont.Weight, mono: Bool, wordmark: Bool) -> UIFontDescriptor {
        var attributes: [UIFontDescriptor.AttributeName: Any] = [
            .family: wordmark ? wordmarkFamily : (mono ? monoFamily : sans),
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: wordmark ? TypeScale.weightWordmark : axis(weight)],
        ]
        if mono {
            attributes[.featureSettings] = [[
                UIFontDescriptor.FeatureKey.type: kContextualAlternatesType,
                UIFontDescriptor.FeatureKey.selector: kContextualAlternatesOffSelector,
            ]]
        }
        return UIFontDescriptor(fontAttributes: attributes)
    }
}

extension Palette {
    /// A colour token's set from this module's catalog, resolved against the
    /// trait collection it is drawn in.
    static func named(_ name: String) -> UIColor {
        guard let color = UIColor(named: name, in: .module, compatibleWith: nil) else {
            preconditionFailure("Tokens.xcassets has no colour set \(name); run `bun run tokens`")
        }
        return color
    }
}

/// A cubic Bézier timing curve from the token source (`--ease-*`).
public struct TimingCurve: Sendable {
    public let x1: Double
    public let y1: Double
    public let x2: Double
    public let y2: Double

    public init(x1: Double, y1: Double, x2: Double, y2: Double) {
        self.x1 = x1
        self.y1 = y1
        self.x2 = x2
        self.y2 = y2
    }

    /// For `UIViewPropertyAnimator`.
    public var parameters: UICubicTimingParameters {
        UICubicTimingParameters(controlPoint1: CGPoint(x: x1, y: y1), controlPoint2: CGPoint(x: x2, y: y2))
    }

    /// For Core Animation.
    public var function: CAMediaTimingFunction {
        CAMediaTimingFunction(controlPoints: Float(x1), Float(y1), Float(x2), Float(y2))
    }

    /// How far along (0–1) the curve is at `x` of its time, for motion driven a frame at a time.
    public func value(at x: Double) -> Double {
        guard x > 0 else {
            return 0
        }
        guard x < 1 else {
            return 1
        }
        func bezier(_ t: Double, _ a: Double, _ b: Double) -> Double {
            let u = 1 - t
            return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
        }
        var low = 0.0
        var high = 1.0
        var t = x
        for _ in 0 ..< 32 {
            let at = bezier(t, x1, x2)
            if abs(at - x) < 1e-7 {
                break
            }
            if at < x {
                low = t
            } else {
                high = t
            }
            t = (low + high) / 2
        }
        return bezier(t, y1, y2)
    }

    /// When (0–1 of its time) the curve reaches `share` of its way.
    public func time(reaching share: Double) -> Double {
        guard share > 0 else {
            return 0
        }
        guard share < 1 else {
            return 1
        }
        var low = 0.0
        var high = 1.0
        for _ in 0 ..< 24 {
            let mid = (low + high) / 2
            if value(at: mid) < share {
                low = mid
            } else {
                high = mid
            }
        }
        return high
    }

    /// An interruptible animator on this curve over `duration`.
    @MainActor
    public func animator(_ duration: TimeInterval, animations: (@MainActor () -> Void)? = nil) -> UIViewPropertyAnimator {
        let animator = UIViewPropertyAnimator(duration: duration, timingParameters: parameters)
        if let animations {
            animator.addAnimations(animations)
        }
        return animator
    }
}
