import CoreText
import Synchronization
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
    /// The size Dynamic Type scales it as: its own, or (a measured figure)
    /// the size of the words it stands among, so the two scale together.
    private let styleSize: Double?
    /// Whether Dynamic Type scales it: every role does, but words drawn into
    /// a picture whose geometry is fixed in points (`fixed`).
    public let scales: Bool

    init(weight: UIFont.Weight, size: ClosedRange<Double>, leading: Double, family: [String], fluid: Fluid? = nil, tracking: Double = 0,
         textStyleOf styleSize: Double? = nil, scales: Bool = true) {
        self.weight = weight
        self.size = size
        self.leading = leading
        self.family = family
        self.fluid = fluid
        self.tracking = tracking
        self.styleSize = styleSize
        self.scales = scales
    }

    /// The role at its token size whatever the Dynamic Type setting: for the
    /// words of a drawing laid out in points (the routing figures), which the
    /// web draws at the token's size too. Such a drawing says nothing a person
    /// needs that the words around it, which do scale, don't say.
    public var fixed: TypeRole {
        TypeRole(weight: weight, size: size, leading: leading, family: family, fluid: fluid, tracking: tracking,
                 textStyleOf: styleSize, scales: false)
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
        let wordmark = family.first?.hasPrefix("Nunito") == true
        let weight = weight ?? self.weight
        let metrics = UIFontMetrics(forTextStyle: textStyle)
        // The scaled size stands for the Dynamic Type setting in the key: a
        // number the setting moves, worked out without making a font.
        let key = FontKey(mono: mono, wordmark: wordmark, weight: weight.rawValue, size: size,
                          scaled: scales ? metrics.scaledValue(for: size) : size, style: scales ? textStyle.rawValue : "")
        if let font = Self.fonts.withLock({ $0[key] }) { return font }
        let base = UIFont(descriptor: Self.descriptor(weight: weight, mono: mono, wordmark: wordmark), size: size)
        let font = scales ? metrics.scaledFont(for: base) : base
        Self.fonts.withLock { $0[key] = font }
        return font
    }

    /// A face at a size and a Dynamic Type setting (`font`).
    private struct FontKey: Hashable {
        let mono: Bool
        let wordmark: Bool
        let weight: CGFloat
        let size: Double
        let scaled: Double
        let style: String
    }

    /// Every face made, by what made it: a face is made once. Making one
    /// built a descriptor and hashed it through UIKit's own cache each time;
    /// a streamed reply's Markdown asked for its faces every frame, a tenth
    /// of the frame (probe-kit spec `ios-scroll-up`). Read off the main
    /// thread too, where the transcript is prepared.
    private static let fonts = Mutex<[FontKey: UIFont]>([:])

    /// The role's line height in points, at the font's scaled size.
    public var lineHeight: Double { font.pointSize * leading }

    /// A measured figure among this role's words (app.css `mono-figure`,
    /// DESIGN.md "Measured figure"): JetBrains Mono, ligatures off, at the
    /// size that brings its cap height to `monoFigureCap` of the role's
    /// size (`font-size-adjust: cap-height`), on the role's own line height,
    /// at the role's weight unless the run restates it (`weight`).
    public func figure(weight: UIFont.Weight? = nil) -> TypeRole {
        let probe = UIFont(descriptor: Self.descriptor(weight: .regular, mono: true, wordmark: false), size: 100)
        let cap = probe.capHeight / probe.pointSize
        let scale = cap > 0 ? TypeScale.monoFigureCap / cap : 1
        let sized = { (points: Double) in points * scale }
        return TypeRole(weight: weight ?? self.weight, size: sized(size.lowerBound) ... sized(size.upperBound),
                        leading: leading / scale, family: FontFamily.fontMono,
                        fluid: fluid.map { Fluid(base: $0.base * scale, perViewport: $0.perViewport * scale) },
                        textStyleOf: points)
    }

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

    /// `attributes` as an AttributedString's container (a button's title),
    /// set key by key in UIKit's scope. Built from the dictionary instead,
    /// a container reads the attribute scopes of every framework loaded, by
    /// reflection: the first one was 83 ms of the launch's main thread
    /// (Release, simulator), under the board's first button.
    public func container(color: UIColor, tracking: Double? = nil, alignment: NSTextAlignment = .natural) -> AttributeContainer {
        let font = font
        let line = LineBox.label(font, height: font.pointSize * leading)
        line.paragraph.alignment = alignment
        line.paragraph.lineBreakMode = .byTruncatingTail
        var container = AttributeContainer()
        container.uiKit.font = font
        container.uiKit.foregroundColor = color
        container.uiKit.paragraphStyle = line.paragraph
        container.uiKit.baselineOffset = line.baselineOffset
        let kern = (tracking ?? self.tracking) * font.pointSize
        if kern != 0 { container.uiKit.kern = kern }
        return container
    }

    private var textStyle: UIFont.TextStyle {
        switch styleSize ?? points {
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

    private nonisolated static func register(_ file: String, family: String) -> String {
        if let url = Bundle.module.url(forResource: file, withExtension: "ttf", subdirectory: "Fonts")
            ?? Bundle.module.url(forResource: file, withExtension: "ttf")
        {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return family
    }

    private nonisolated static let sans = register("Figtree", family: "Figtree")
    private nonisolated static let wordmarkFamily = register("Nunito", family: "Nunito")
    /// JetBrains Mono, the mono stack's first choice; its ligatures (`calt`) off.
    private nonisolated static let monoFamily = register("JetBrainsMono", family: "JetBrains Mono")

    /// Registers the bundled faces with CoreText, on whichever thread calls
    /// (CawCoScreens `Launch`): under the first label it was 9 ms of the
    /// launch's main thread (Release, simulator). CoreText's font manager is
    /// thread-safe, and each family's registration runs once.
    public nonisolated static func registerFaces() {
        _ = (sans, wordmarkFamily, monoFamily)
    }

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
    /// trait collection it is drawn in. Public for tokens named in shared
    /// data (a tool kind's ink, packages/core tool-presentation).
    public static func named(_ name: String) -> UIColor {
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
