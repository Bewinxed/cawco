import CoreText
import UIKit

/// A type role from the token source (`TypeScale.type*`): weight, size, line
/// height and font stack. `size` is a range because title and kpi are fluid
/// on the web; every other role's range is one value.
public struct TypeRole: Sendable {
    public let weight: UIFont.Weight
    public let size: ClosedRange<Double>
    /// Line height as a multiple of the size.
    public let leading: Double
    /// The CSS font stack, first choice first.
    public let family: [String]

    /// The role's size on a compact screen: a fluid role's smallest.
    public var points: Double { size.lowerBound }

    /// The role's font: Figtree (the stack's first choice) at the token's
    /// weight on its variable `wght` axis, scaled by Dynamic Type from the
    /// token's size at the default setting.
    public var font: UIFont {
        let base = UIFont(descriptor: Self.descriptor(weight: weight), size: points)
        return UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base)
    }

    /// The role's line height in points, at the font's scaled size.
    public var lineHeight: Double { font.pointSize * leading }

    /// Text attributes that set a string in this role, with `tracking` in em.
    public func attributes(color: UIColor, tracking: Double = 0, alignment: NSTextAlignment = .natural) -> [NSAttributedString.Key: Any] {
        let font = font
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = font.pointSize * leading
        paragraph.maximumLineHeight = font.pointSize * leading
        paragraph.alignment = alignment
        paragraph.lineBreakMode = .byTruncatingTail
        return [
            .font: font,
            .foregroundColor: color,
            .kern: tracking * font.pointSize,
            .paragraphStyle: paragraph,
            .baselineOffset: (font.pointSize * leading - font.lineHeight) / 4,
        ]
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

    private static let family: String = {
        if let url = Bundle.module.url(forResource: "Figtree", withExtension: "ttf", subdirectory: "Fonts")
            ?? Bundle.module.url(forResource: "Figtree", withExtension: "ttf")
        {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return "Figtree"
    }()

    private static func descriptor(weight: UIFont.Weight) -> UIFontDescriptor {
        UIFontDescriptor(fontAttributes: [
            .family: family,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: axis(weight)],
        ])
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
