import CawCoDesign
import UIKit

/// The transcript's columns (app.css `.tx-columns`), measured from a row's
/// inline start: the rail, the glyph cell a space-3 past it, the text column a
/// space-2 past the cell. 900pt wide and under, the rail sits at the edge.
struct Columns: Equatable {
    let rail: Double
    var glyph: Double { rail + Space.space3 }
    var text: Double { glyph + Size.txWGlyph + Space.space2 }
    /// A hung body's distance from the glyph column (`--x-hang`).
    var hang: Double { text - glyph }
    /// The gap between a rail line's cell and its words.
    static let gap = Space.space2

    static func at(width: Double) -> Columns {
        Columns(rail: width <= 900 ? Size.txXRailNarrow : Size.txXRail)
    }

    /// A rail line's least height: 44 under a coarse pointer, as every
    /// iPhone and iPad touch is (`@media (pointer: coarse)`).
    static var line: Double {
        #if targetEnvironment(macCatalyst)
        Size.txLine
        #else
        Size.txLineTouch
        #endif
    }
}

/// The flat 2px rail (`--rail`, a flat gradient), or a row's own ink for it.
enum RailInk {
    static var rail: UIColor { Palette.rail.stops[0].color }
}

/// Text set in a type role, optionally at another size or in another face.
enum Styled {
    static func attributes(_ role: TypeRole, color: UIColor, size: Double? = nil, weight: UIFont.Weight? = nil,
                           leading: Double? = nil, mono: Bool = false, tabular: Bool = false,
                           lineBreak: NSLineBreakMode = .byTruncatingTail, textKit2: Bool = false) -> [NSAttributedString.Key: Any] {
        let face = mono ? TypeScale.typeCode : role
        var font = face.font(size ?? role.points, weight: weight ?? role.weight)
        if tabular {
            font = UIFont(descriptor: font.fontDescriptor.addingAttributes([.featureSettings: [[
                UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
            ]]]), size: font.pointSize)
        }
        let height = font.pointSize * (leading ?? role.leading)
        let offset = (height - font.lineHeight) / 4
        let paragraph = NSMutableParagraphStyle()
        // A TextKit 2 line takes its baseline offset out of its height (measured:
        // 19.5pt lines for a 20.3pt line height): it is given back here.
        paragraph.minimumLineHeight = textKit2 ? height + offset : height
        paragraph.maximumLineHeight = textKit2 ? height + offset : height
        paragraph.lineBreakMode = lineBreak
        return [.font: font, .foregroundColor: color, .paragraphStyle: paragraph, .baselineOffset: offset]
    }

    static func string(_ text: String, _ role: TypeRole, color: UIColor, size: Double? = nil, weight: UIFont.Weight? = nil,
                       leading: Double? = nil, mono: Bool = false, tabular: Bool = false,
                       lineBreak: NSLineBreakMode = .byTruncatingTail, textKit2: Bool = false) -> NSAttributedString {
        NSAttributedString(string: text, attributes: attributes(role, color: color, size: size, weight: weight, leading: leading,
                                                               mono: mono, tabular: tabular, lineBreak: lineBreak, textKit2: textKit2))
    }
}

/// A one-line label for a rail line: it gives way (truncates) by priority.
final class LineLabel: UILabel {
    init(hug: UILayoutPriority = .defaultHigh, resist: UILayoutPriority = .defaultLow) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        numberOfLines = 1
        setContentHuggingPriority(hug, for: .horizontal)
        setContentCompressionResistancePriority(resist, for: .horizontal)
        adjustsFontForContentSizeCategory = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// Wrapping text that sizes itself to its width.
final class WrapLabel: UILabel {
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        numberOfLines = 0
        setContentCompressionResistancePriority(.required, for: .vertical)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// A label on its own surface: a badge, a state pill, an option's key cap.
class ChipLabel: UILabel {
    var insets: UIEdgeInsets { didSet { invalidateIntrinsicContentSize() } }
    var minHeight: Double = 0 { didSet { invalidateIntrinsicContentSize() } }
    var minWidth: Double = 0 { didSet { invalidateIntrinsicContentSize() } }

    init(insets: UIEdgeInsets, radius: Double) {
        self.insets = insets
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = radius
        layer.cornerCurve = .continuous
        clipsToBounds = true
        textAlignment = .center
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: max(minWidth, size.width + insets.left + insets.right),
                      height: max(minHeight, size.height + insets.top + insets.bottom))
    }

    override func drawText(in rect: CGRect) { super.drawText(in: rect.inset(by: insets)) }
}

/// A disclosure chevron (`alt-arrow-right-linear`), turned a quarter when open
/// over --dur-control on --ease-out.
final class Chevron: UIImageView {
    private let side: Double

    init(size: Double = Size.iconMd, tint: UIColor = Palette.inkMuted) {
        side = size
        super.init(image: Glyph.chevronRight.image)
        tintColor = tint
        contentMode = .scaleAspectFit
        translatesAutoresizingMaskIntoConstraints = false
        isAccessibilityElement = false
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override var intrinsicContentSize: CGSize { CGSize(width: side, height: side) }

    private var turned = false

    func set(open: Bool, animated: Bool) {
        guard open != turned else { return }
        turned = open
        let angle: CGAffineTransform = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
        if animated, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durControl) { [weak self] in self?.transform = angle }.startAnimation()
        } else { transform = angle }
    }
}

/// A glyph in the 16pt rail cell, centred (`.rail-cell`).
final class RailCell: UIView {
    let glyph: GlyphView

    init(_ glyph: Glyph, size: Double = Size.iconMd, tint: UIColor = Palette.inkMuted) {
        self.glyph = GlyphView(glyph, size: size, tint: tint)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        addSubview(self.glyph)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.txWGlyph),
            heightAnchor.constraint(equalToConstant: Size.txWGlyph),
            self.glyph.centerXAnchor.constraint(equalTo: centerXAnchor),
            self.glyph.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
}

/// A stack that says when it has laid out, for work that reads its own size.
final class LayoutStack: UIStackView {
    var onLayout: (() -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}

/// A view drawn by a top-to-bottom gradient token, sized with the view.
final class GradientView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }
    var gradient: CAGradientLayer { layer as! CAGradientLayer }
}

/// A horizontal line of a rail row: the cell, then words a space-2 apart.
func railLine(_ views: [UIView], spacing: Double = Columns.gap) -> UIStackView {
    let line = UIStackView(arrangedSubviews: views)
    line.axis = .horizontal
    line.alignment = .center
    line.spacing = spacing
    line.translatesAutoresizingMaskIntoConstraints = false
    return line
}

/// A still dot: a branch's live beat, an ask's mark.
final class Dot: UIView {
    init(_ side: Double, color: UIColor) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = color
        layer.cornerRadius = side / 2
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: side), heightAnchor.constraint(equalToConstant: side)])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The dot beats (opacity to 0.3 at half) on --breath, --ease-in-out, unless motion is reduced.
    func beat() {
        layer.removeAnimation(forKey: "beat")
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let beat = CAKeyframeAnimation(keyPath: "opacity")
        beat.values = [1, 0.3, 1]
        beat.keyTimes = [0, 0.5, 1]
        beat.duration = Motion.breath
        beat.timingFunctions = [Motion.easeInOut.function, Motion.easeInOut.function]
        beat.repeatCount = .infinity
        layer.add(beat, forKey: "beat")
    }
}

/// `formatDuration` (lib/utils/time.ts).
func formatDuration(_ seconds: TimeInterval) -> String {
    let s = Int(max(0, seconds))
    let m = s / 60, h = m / 60, d = h / 24
    if d > 0 { return "\(d)d \(h % 24)h" }
    if h > 0 { return "\(h)h \(m % 60)m" }
    if m > 0 { return "\(m)m \(s % 60)s" }
    return "\(s)s"
}

/// A first line, bare, at a scannable length (Subagent/Delegate `headline`).
func headline(_ text: String) -> String {
    let line = text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty } ?? ""
    return line.count > 120 ? String(line.prefix(119)) + "…" : line
}

extension UIView {
    func pin(_ view: UIView, insets: UIEdgeInsets = .zero) {
        view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.leadingAnchor.constraint(equalTo: leadingAnchor, constant: insets.left),
            view.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -insets.right),
            view.topAnchor.constraint(equalTo: topAnchor, constant: insets.top),
            view.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -insets.bottom),
        ])
    }
}

/// A body that grows open from nothing and folds shut where it stands
/// (collapsible-content.svelte `reveal`): open over --dur-reveal, shut over
/// --dur-exit, both on --ease-out, the content fading with it when `fades`.
/// Its height is its content's when open, nothing when shut; the transcript
/// animates its row's size on the same clock.
final class Reveal: UIView {
    let content: UIView
    private var shut: NSLayoutConstraint!
    private(set) var isOpen = false
    var fades = false

    init(_ content: UIView) {
        self.content = content
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        let bottom = content.bottomAnchor.constraint(equalTo: bottomAnchor)
        bottom.priority = .defaultHigh
        shut = heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: leadingAnchor),
            content.trailingAnchor.constraint(equalTo: trailingAnchor),
            content.topAnchor.constraint(equalTo: topAnchor),
            bottom, shut,
        ])
        content.isHidden = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// Sets the state at once (a row configured, drawn already open).
    func set(open: Bool) {
        isOpen = open
        shut.isActive = !open
        content.isHidden = !open
        content.alpha = 1
    }

    /// The state the next layout pass draws, and what to animate with it.
    func toggle(open: Bool) -> (layout: () -> Void, done: () -> Void) {
        isOpen = open
        if open {
            content.isHidden = false
            if fades { content.alpha = 0 }
            shut.isActive = false
            return ({ self.content.alpha = 1 }, {})
        }
        shut.isActive = true
        return ({ if self.fades { self.content.alpha = 0 } }, { if !self.isOpen { self.content.isHidden = true; self.content.alpha = 1 } })
    }
}
