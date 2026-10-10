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
nonisolated enum Styled {
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
        // CSS line boxes (LineBox): a label's, or a TextKit 2 view's, whose
        // last line ProseView closes.
        guard textKit2 else {
            let line = LineBox.label(font, height: height)
            line.paragraph.lineBreakMode = lineBreak
            return [.font: font, .foregroundColor: color, .paragraphStyle: line.paragraph, .baselineOffset: line.baselineOffset]
        }
        let paragraph = LineBox.textView(font, height: height)
        paragraph.lineBreakMode = lineBreak
        return [.font: font, .foregroundColor: color, .paragraphStyle: paragraph]
    }

    /// `.kit-empty-title` (app.css): the title role at the size its clamp()
    /// takes in a window `viewport` wide, tracked -0.01em, in the strong ink.
    static func emptyTitle(_ text: String, viewport: Double?) -> NSAttributedString {
        let size = viewport.map { TypeScale.typeTitle.points(viewport: $0) } ?? TypeScale.typeTitle.points
        var attributes = attributes(TypeScale.typeTitle, color: Palette.inkStrong, size: size, lineBreak: .byWordWrapping)
        attributes[.kern] = TypeScale.trackTitle * size
        return NSAttributedString(string: text, attributes: attributes)
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

/// Wrapping text that sizes itself to its width, read but not touched (taps
/// go to the row it stands in): a ProseView, so its lines are CSS line boxes
/// and wrap as the element it stands for does in the browser (`wrap`: a `p`
/// or `li` pretty, h1–h4 balance, anything else as written). It takes text
/// set in `Styled` label lines and gives each paragraph the TextKit 2 line
/// box for the same font and line height (LineBox).
final class WrapLabel: ProseView {
    private let wrapStyle: LineWrap.Style

    init(wrap: LineWrap.Style = .greedy) {
        wrapStyle = wrap
        super.init()
        isSelectable = false
        isUserInteractionEnabled = false
    }

    override var attributedText: NSAttributedString! {
        get { super.attributedText }
        set { super.attributedText = newValue.map(lined) }
    }

    private func lined(_ text: NSAttributedString) -> NSAttributedString {
        let out = NSMutableAttributedString(attributedString: text)
        let all = NSRange(location: 0, length: out.length)
        out.removeAttribute(.baselineOffset, range: all)
        text.enumerateAttributes(in: all) { attributes, range, _ in
            guard let font = attributes[.font] as? UIFont, let label = attributes[.paragraphStyle] as? NSParagraphStyle,
                  label.minimumLineHeight > 0, label.minimumLineHeight == label.maximumLineHeight else { return }
            let line = LineBox.textView(font, height: label.minimumLineHeight)
            line.alignment = label.alignment
            // A label of any number of lines wraps by word whatever its mode; a text view would truncate.
            line.lineBreakMode = label.lineBreakMode == .byCharWrapping ? .byCharWrapping : .byWordWrapping
            line.headIndent = label.headIndent
            line.firstLineHeadIndent = label.firstLineHeadIndent
            line.tabStops = label.tabStops
            out.addAttribute(.paragraphStyle, value: line, range: range)
        }
        if wrapStyle != .greedy { out.addAttribute(.wrapStyle, value: wrapStyle.rawValue, range: all) }
        return out
    }
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

/// One flex row (`display: flex; align-items: center; gap`): its items in
/// order at their max-content widths, centred on the row; room to spare goes
/// to the ones that grow (`flex-grow: 1`), and when they overflow the row,
/// the ones that shrink (`flex-shrink: 1; min-width: 0`) give way in
/// proportion to their widths, as CSS distributes the shortfall. Laid out
/// directly on every pass, so the widths always follow the items now in it.
final class FlexLine: UIView {
    struct Item {
        let view: UIView
        var grows = false
        var shrinks = false
        /// A fixed box in place of the view's own size (a glyph's cell).
        var size: CGSize?
    }

    private let items: [Item]
    private let gap: Double

    init(_ items: [Item], gap: Double) {
        self.items = items
        self.gap = gap
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        for item in items {
            item.view.translatesAutoresizingMaskIntoConstraints = true
            addSubview(item.view)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func size(of item: Item) -> CGSize {
        if let size = item.size { return size }
        let natural = item.view.intrinsicContentSize
        let scale = window?.screen.scale ?? traitCollection.displayScale
        // Whole device pixels up, so a label is never laid a hair under its text.
        return CGSize(width: (max(0, natural.width) * scale).rounded(.up) / scale, height: max(0, natural.height))
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: items.filter { !$0.view.isHidden }.map { size(of: $0).height }.max() ?? 0)
    }

    /// The row's `max-content` width: every item shown at its own width, the gaps between.
    var naturalWidth: Double {
        let shown = items.filter { !$0.view.isHidden }
        return shown.reduce(0) { $0 + size(of: $1).width } + gap * Double(max(0, shown.count - 1))
    }

    /// The items changed what they hold: lay the row out again.
    func refit() {
        invalidateIntrinsicContentSize()
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let shown = items.filter { !$0.view.isHidden }
        let sizes = shown.map(size(of:))
        let total = sizes.reduce(0) { $0 + $1.width } + gap * Double(max(0, shown.count - 1))
        let overflow = max(0, total - bounds.width)
        let spare = max(0, bounds.width - total)
        let shrinking = zip(shown, sizes).filter { $0.0.shrinks }.reduce(0) { $0 + $1.1.width }
        let growing = shown.filter(\.grows).count
        var x = 0.0
        for (item, size) in zip(shown, sizes) {
            var width = size.width
            if overflow > 0, item.shrinks, shrinking > 0 { width = max(0, width - overflow * width / shrinking) }
            if spare > 0, item.grows { width += spare / Double(growing) }
            item.view.frame = CGRect(x: x, y: (bounds.height - size.height) / 2, width: width, height: size.height)
            x += width + gap
        }
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

/// What moves a Reveal a frame at a time: the transcript, which lays its
/// row out again at each step and holds the reader's place around it.
@MainActor
protocol RevealDriver: AnyObject {
    /// `reveal` began opening or folding shut: it is stepped from now on.
    func revealMoved(_ reveal: Reveal)
    /// The reader opened or shut a body where they stand: the list lets go of the tail.
    func readerToggled()
    /// Runs `change` with the list's own resizing off: the box's row is sized by its steps alone.
    func quietly(_ change: () -> Void)
}

/// A body that grows open from nothing and folds shut where it stands
/// (collapsible-content.svelte `reveal`): open over --dur-reveal, shut over
/// --dur-exit, both on --ease-out, the content fading with it when `fades`.
/// Its height is its content's when open, nothing when shut.
///
/// The height between is stepped a frame at a time by the transcript that
/// holds it (`RevealDriver`), which lays the row out at each step: the row's
/// foot, and every row under it, are where the body's edge is in that same
/// frame. Left to the list's own resizing, the row's size changed on the
/// list's clock and not the body's, and the rows around it jumped. The
/// content keeps its own height throughout, clipped by the box; under
/// Reduce Motion the first step is the last.
final class Reveal: UIView {
    let content: UIView
    /// The box's height while it is shut or between: nothing shut, the step's height moving.
    private var cap: NSLayoutConstraint!
    private(set) var isOpen = false
    var fades = false
    /// The motion under way: the height it left from, when, and over how long.
    private var motion: (from: CGFloat, start: CFTimeInterval, duration: TimeInterval)?

    init(_ content: UIView) {
        self.content = content
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        // Under its words' own resistance (750): a capped box clips its
        // content rather than squeezing it.
        let bottom = content.bottomAnchor.constraint(equalTo: bottomAnchor)
        bottom.priority = .defaultHigh - 1
        cap = heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: leadingAnchor),
            content.trailingAnchor.constraint(equalTo: trailingAnchor),
            content.topAnchor.constraint(equalTo: topAnchor),
            bottom, cap,
        ])
        content.isHidden = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The height the box stands at now, on screen.
    var shownHeight: CGFloat { motion != nil || !isOpen ? cap.constant : bounds.height }

    /// Sets the state at once (a row configured, drawn already open). A row
    /// configured again while its body moves to this same state keeps moving.
    func set(open: Bool) {
        if motion != nil, open == isOpen { return }
        motion = nil
        isOpen = open
        cap.constant = 0
        cap.isActive = !open
        content.isHidden = !open
        content.alpha = 1
    }

    /// Begins opening or folding shut from where the box stands: its height
    /// does not change here, but at each of the driver's steps (`advance`).
    /// Returns what to fade with it, on the same curve and clock. `duration`:
    /// a box that moves with another one keeps that one's clock.
    func toggle(open: Bool, over duration: TimeInterval? = nil) -> (layout: () -> Void, done: () -> Void) {
        let begin = {
            let from = self.shownHeight
            self.isOpen = open
            self.cap.constant = from
            self.cap.isActive = true
            self.content.isHidden = false
            if open, self.fades { self.content.alpha = 0 }
            if open { self.measure() }
            let still = UIAccessibility.isReduceMotionEnabled || self.window == nil
            self.motion = (from, CACurrentMediaTime(), still ? 0 : duration ?? (open ? Motion.durReveal : Motion.durExit))
        }
        if let driver {
            driver.quietly(begin)
            driver.revealMoved(self)
        } else {
            // In no list: nothing stands around it to move.
            begin()
            _ = advance(.infinity)
        }
        return (open ? { self.content.alpha = 1 } : { if self.fades { self.content.alpha = 0 } }, {})
    }

    /// The transcript this box stands in.
    var driver: RevealDriver? {
        sequence(first: self as UIView, next: { $0.superview }).dropFirst().lazy.compactMap { $0 as? RevealDriver }.first
    }

    /// The height the motion left from, while it moves.
    var travel: CGFloat? { motion?.from }

    /// Steps the height to where the curve is at `now`; false once it has
    /// arrived (the last step lands the end state).
    func advance(_ now: CFTimeInterval) -> Bool {
        guard let motion else { return false }
        let x = motion.duration > 0 ? (now - motion.start) / motion.duration : 1
        guard x < 1 else {
            self.motion = nil
            cap.constant = 0
            cap.isActive = !isOpen
            if !isOpen {
                content.isHidden = true
                content.alpha = 1
            }
            return false
        }
        // Open, the content stands at its own height under the cap: that is where the edge goes.
        let to = isOpen ? content.bounds.height : 0
        cap.constant = motion.from + (to - motion.from) * Motion.easeOut.value(at: x)
        return true
    }

    /// Lays the content out at the box's width before it opens, so its height
    /// is known from the first step (two passes, as a cell measures: every
    /// text learns its width, then the measure).
    private func measure() {
        let width = bounds.width
        guard width > 0 else { return }
        content.frame = CGRect(x: 0, y: 0, width: width, height: max(content.bounds.height, 1))
        content.layoutIfNeeded()
        let size = content.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                                   verticalFittingPriority: .fittingSizeLevel)
        content.frame.size.height = size.height
    }
}
