import CawCoDesign
import CoreText
import OSLog
import UIKit

/// A paragraph of rendered Markdown with what the browser paints that text
/// can't: inline code spans on their own surface (the run's block padding,
/// `.inlineCodePad`, above and below the mono run, `InlineCodeRoom.side`
/// either side, --radius-xs), and a list's disc filled over its stand-in run (ListDisc).
nonisolated final class ProseFragment: NSTextLayoutFragment {
    override var renderingSurfaceBounds: CGRect {
        super.renderingSurfaceBounds.insetBy(dx: -InlineCodeRoom.side, dy: -Size.proseCodePad)
    }

    /// Each line's piece of a run: its start and end along the line, and the
    /// run's own baseline (the line's, raised by the run's baseline offset).
    private func spans(of range: NSRange, in text: NSAttributedString, at point: CGPoint) -> [(x0: CGFloat, x1: CGFloat, baseline: CGFloat)] {
        let raise = text.attribute(.baselineOffset, at: range.location, effectiveRange: nil) as? Double ?? 0
        return textLineFragments.compactMap { line in
            let lineRange = line.characterRange
            let start = max(range.location, lineRange.location)
            let end = min(NSMaxRange(range), NSMaxRange(lineRange))
            guard start < end else { return nil }
            let frame = line.typographicBounds
            return (point.x + frame.minX + line.locationForCharacter(at: start).x,
                    point.x + frame.minX + line.locationForCharacter(at: end).x,
                    point.y + frame.minY + line.glyphOrigin.y - raise)
        }
    }

    override func draw(at point: CGPoint, in context: CGContext) {
        if let paragraph = textElement as? NSTextParagraph {
            let text = paragraph.attributedString
            let all = NSRange(location: 0, length: text.length)
            text.enumerateAttribute(.inlineCode, in: all) { value, range, _ in
                guard let surface = value as? UIColor, range.length > 0 else { return }
                let font = text.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont ?? TypeScale.typeCode.font
                let pad = text.attribute(.inlineCodePad, at: range.location, effectiveRange: nil) as? Double ?? Size.txCodeSpanPad
                for span in spans(of: range, in: text, at: point) {
                    let rect = CGRect(x: span.x0 - InlineCodeRoom.side, y: span.baseline - font.ascender - pad,
                                      width: span.x1 - span.x0 + InlineCodeRoom.side, height: font.ascender - font.descender + pad * 2)
                    context.setFillColor(surface.cgColor)
                    context.addPath(UIBezierPath(roundedRect: rect, cornerRadius: Radius.radiusXs).cgPath)
                    context.fillPath()
                    // Edged inside with a hairline (`box-shadow: inset 0 0 0 1px var(--border-hairline)`).
                    context.setStrokeColor(Palette.borderHairline.cgColor)
                    context.setLineWidth(1)
                    context.addPath(UIBezierPath(roundedRect: rect.insetBy(dx: 0.5, dy: 0.5), cornerRadius: max(0, Radius.radiusXs - 0.5)).cgPath)
                    context.strokePath()
                }
            }
            text.enumerateAttribute(.listDisc, in: all) { value, range, _ in
                guard let ink = value as? UIColor, range.length > 0,
                      let font = text.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont,
                      let span = spans(of: range, in: text, at: point).first else { return }
                let side = ListDisc.diameter(font)
                context.setFillColor(ink.cgColor)
                context.fillEllipse(in: CGRect(x: span.x0, y: span.baseline - ListDisc.top(font), width: side, height: side))
            }
        }
        super.draw(at: point, in: context)
    }
}

/// Running text, selectable, on TextKit 2: one block of a message, a cell, a
/// listing. Its lines are CSS line boxes (Styled `textKit2`): the leading
/// below the last line, which TextKit leaves off, stands under it as inset.
/// Paragraphs marked `pretty` or `balance` wrap as WebKit wraps them (LineWrap).
class ProseView: UITextView, NSTextLayoutManagerDelegate {
    /// A rect kept clear at the first line's end, for a grouped turn's clock.
    var floatSize: CGSize = .zero { didSet { if floatSize != oldValue { setNeedsLayout(); invalidateIntrinsicContentSize() } } }
    private let wrap: LineWrap.Container
    /// The layout manager holds its content manager weakly.
    private let content: NSTextContentStorage
    /// Bumped whenever the text changes; the lines' widths were last chosen
    /// for `wrappedFor`'s width and version.
    private var version = 0
    private var wrappedFor: (width: CGFloat, version: Int)?

    override var attributedText: NSAttributedString! {
        didSet { textChanged() }
    }

    private func textChanged() {
        version += 1
        closeLastLine()
        // Widths keyed by where lines start never outlive the text they were chosen for.
        if bounds.width > 0 {
            rewrap(at: bounds.width - textContainerInset.left - textContainerInset.right)
        } else {
            wrap.widths = [:]
            wrap.codeStarts = [:]
        }
        setNeedsLayout()
    }

    /// The last line's leading below it: its paragraph's line spacing.
    private func closeLastLine() {
        let length = textStorage.length
        let style = length > 0 ? textStorage.attribute(.paragraphStyle, at: length - 1, effectiveRange: nil) as? NSParagraphStyle : nil
        let below = style?.lineSpacing ?? 0
        guard abs(textContainerInset.bottom - below) > 0.01 else { return }
        textContainerInset.bottom = below
        invalidateIntrinsicContentSize()
    }

    init() {
        let container = LineWrap.Container(size: .zero)
        let layout = NSTextLayoutManager()
        layout.textContainer = container
        let content = NSTextContentStorage()
        content.addTextLayoutManager(layout)
        content.primaryTextLayoutManager = layout
        wrap = container
        self.content = content
        super.init(frame: .zero, textContainer: container)
        isEditable = false
        isSelectable = true
        isScrollEnabled = false
        backgroundColor = .clear
        textContainerInset = .zero
        textContainer.lineFragmentPadding = 0
        translatesAutoresizingMaskIntoConstraints = false
        textLayoutManager?.delegate = self
        linkTextAttributes = [.foregroundColor: Palette.linkInk, .underlineStyle: NSUnderlineStyle.single.rawValue]
        setContentCompressionResistancePriority(.required, for: .vertical)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The width the text will stand at, where whoever places it knows that
    /// before layout does (a row of the list, a table's cell). A text view
    /// asked its height without one lays its text out for the asking and
    /// again for the drawing, at a width it has to be told twice; that was
    /// most of what a row took to build. A view that comes to stand at
    /// another width lets go of it.
    var fitWidth: CGFloat? { didSet { if fitWidth != oldValue { invalidateIntrinsicContentSize() } } }

    /// The width layout gave the view, where nobody said one beforehand
    /// (`fitWidth`): its height is measured at that width from then on.
    private var laidWidth: CGFloat?

    /// The text's own height at the width it stands at, as CSS keeps a
    /// block's (a text view rounds its height up to a whole point, which over
    /// a run of blocks put each a fraction lower than the web's). The width is
    /// `fitWidth`, else the one layout gave the view, else, before its first
    /// layout, its max-content width: never a guess at no width. UITextView's
    /// own intrinsic size is never asked: it laid the text out again at
    /// whatever width the view had, which before its first layout was none
    /// (a 554-character tool value measured 4,181pt tall in a 162pt view).
    /// The text is laid out once, in its own container, and that layout is
    /// the one it is drawn from.
    override var intrinsicContentSize: CGSize {
        let natural = fitWidth == nil ? naturalWidth : UIView.noIntrinsicMetric
        let width = fitWidth ?? laidWidth ?? naturalWidth
        guard width > 0, textStorage.length > 0, let manager = textLayoutManager else {
            fitted = 0
            return CGSize(width: natural, height: 0)
        }
        let inner = width - textContainerInset.left - textContainerInset.right
        Pace.time(.text) {
            if abs(textContainer.size.width - inner) > 0.01 { textContainer.size = CGSize(width: inner, height: 0) }
            exclude(at: width)
            rewrap(at: inner, measuring: true)
            manager.ensureLayout(for: manager.documentRange)
            fitted = manager.usageBoundsForTextContainer.height + textContainerInset.top + textContainerInset.bottom
        }
        #if DEBUG
        checkLater()
        #endif
        return CGSize(width: natural, height: fitted)
    }

    /// Keeps the float's rect clear at `width`; whether that changed the container.
    @discardableResult
    private func exclude(at width: CGFloat) -> Bool {
        let clear = floatSize == .zero ? nil : CGRect(x: width - floatSize.width, y: 0, width: floatSize.width, height: floatSize.height)
        guard clear != excluded else { return false }
        excluded = clear
        textContainer.exclusionPaths = clear.map { [UIBezierPath(rect: $0)] } ?? []
        return true
    }

    /// The width the text asks for where its view is sized to it (a
    /// `.leading` column, a line of a rail): its widest paragraph on one
    /// line, CSS's max-content, which the view's container then holds to
    /// the room it has. Never the width its own lines were wrapped to: a
    /// pretty paragraph wrapped at one width asked for another, was wrapped
    /// there and asked for the first again, and the layout pass that sized it
    /// never ended (a failed send's reason held the main thread for good).
    private var naturalWidth: CGFloat {
        if let natural, natural.version == version { return natural.width }
        let bounds = textStorage.boundingRect(with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude),
                                              options: [.usesLineFragmentOrigin], context: nil)
        let width = ceil(bounds.width) + textContainerInset.left + textContainerInset.right
        natural = (version, width)
        return width
    }

    /// `naturalWidth`, for the text version it was measured for.
    private var natural: (version: Int, width: CGFloat)?

    nonisolated func textLayoutManager(_: NSTextLayoutManager, textLayoutFragmentFor location: any NSTextLocation,
                                       in textElement: NSTextElement) -> NSTextLayoutFragment {
        ProseFragment(textElement: textElement, range: textElement.elementRange)
    }

    /// The rect kept clear for the float, as last given to the container.
    /// Compared as a rect: two `UIBezierPath`s of one rect are never equal
    /// (identity), and setting the paths on every pass relaid the whole text
    /// and invalidated the size every pass, so a turn with a clock never
    /// settled and every display-link frame laid it out again.
    private var excluded: CGRect?

    override func layoutSubviews() {
        super.layoutSubviews()
        if let fit = fitWidth, bounds.width > 0, abs(bounds.width - fit) > 0.5 { fitWidth = nil }
        // The width the text stands at, learnt from this pass: measured there
        // from now on, and the pass that sizes the row asks again.
        if fitWidth == nil, bounds.width > 0, abs(bounds.width - (laidWidth ?? -1)) > 0.5 {
            laidWidth = bounds.width
            invalidateIntrinsicContentSize()
        }
        if exclude(at: bounds.width) { invalidateIntrinsicContentSize() }
        rewrap(at: bounds.width - textContainerInset.left - textContainerInset.right)
        // Laid out at a height other than its own (it learnt its width after
        // its row was measured): the row is measured again, once a text and width.
        if bounds.width > 0, abs(intrinsicContentSize.height - bounds.height) > 1, remeasured.map({ $0 != (version, bounds.width) }) ?? true {
            remeasured = (version, bounds.width)
            remeasureRow()
        }
        #if DEBUG
        checkLater()
        #endif
        // The frame is snapped to whole pixels and can come out a fraction
        // shorter than the text (LineWrap.Container `size`): said once a text.
        if bounds.height > 0, fitted - bounds.height > 0.01, shortFor != version {
            shortFor = version
            Self.log.info("text \(self.fitted, format: .fixed(precision: 2)) tall in a view \(Double(self.bounds.height), format: .fixed(precision: 2)) tall, \(self.textStorage.length) characters ending \(String(self.textStorage.string.suffix(12)), privacy: .public)")
        }
    }

    /// The text's own height, as last measured for the view's size.
    private var fitted = 0.0
    /// The text and width the row was last asked to measure again for.
    private var remeasured: (Int, CGFloat)?
    /// The text version a short view was last logged for.
    private var shortFor = -1
    #if DEBUG
    /// The text, width and container width an overflow was last logged for.
    private var overflowFor: (Int, CGFloat, CGFloat)?
    /// The text and width a split chip was last logged for.
    private var splitFor: (Int, CGFloat)?
    private var checkQueued = false

    /// Once the pass that laid or measured the text is over: the lines as
    /// they will be drawn, against the view they are drawn in
    /// (scripts/probe-kit/specs/ios-task-review.ts). A line past the view's
    /// edge is cut off there; a container at another width than the view's
    /// draws the text at that width.
    private func checkLater() {
        guard !checkQueued else { return }
        checkQueued = true
        DispatchQueue.main.async { [weak self] in
            self?.checkQueued = false
            self?.checkOverflow()
        }
    }

    private func checkOverflow() {
        guard window != nil, bounds.width > 0, textStorage.length > 0, let manager = textLayoutManager else { return }
        var widest = 0.0
        let container = textContainer.size.width
        // An inline code chip narrower than a line laid across two (MessageBody.svelte's
        // chip is `inline-block`: it moves to the next line whole).
        var split: String?
        manager.enumerateTextLayoutFragments(from: manager.documentRange.location, options: [.ensuresLayout]) { fragment in
            let lines = fragment.textLineFragments
            for line in lines {
                widest = max(widest, fragment.layoutFragmentFrame.minX + line.typographicBounds.maxX)
            }
            if split == nil, let text = (fragment.textElement as? NSTextParagraph)?.attributedString {
                text.enumerateAttribute(.inlineCode, in: NSRange(location: 0, length: text.length)) { value, range, stop in
                    guard value != nil, range.length > 1 else { return }
                    let first = lines.firstIndex { NSLocationInRange(range.location, $0.characterRange) }
                    let last = lines.firstIndex { NSLocationInRange(NSMaxRange(range) - 1, $0.characterRange) }
                    let width = text.attributedSubstring(from: range).size().width + 2 * InlineCodeRoom.side
                    if let first, let last, first != last, width <= container {
                        split = (text.string as NSString).substring(with: range)
                        stop.pointee = true
                    }
                }
            }
            return true
        }
        if let split, splitFor.map({ $0 != (version, bounds.width) }) ?? true {
            splitFor = (version, bounds.width)
            Self.log.notice("prose chip split chip=\(split, privacy: .public) container=\(Double(container), format: .fixed(precision: 1))")
        }
        let used = widest + textContainerInset.left
        let inner = bounds.width - textContainerInset.left - textContainerInset.right
        // A line's trailing space can hang a hair past its box: a whole word can't.
        guard used > bounds.width + 6 || abs(container - inner) > 0.5 else { return }
        guard overflowFor.map({ $0 != (version, bounds.width, container) }) ?? true else { return }
        overflowFor = (version, bounds.width, container)
        Self.log.notice("prose overflow used=\(used, format: .fixed(precision: 1)) width=\(Double(self.bounds.width), format: .fixed(precision: 1)) container=\(Double(container), format: .fixed(precision: 1)) fit=\(self.fitWidth.map { String(format: "%.1f", $0) } ?? "none", privacy: .public) laid=\(self.laidWidth.map { String(format: "%.1f", $0) } ?? "none", privacy: .public) float=\(Double(self.floatSize.width), format: .fixed(precision: 1)) excluded=\(self.excluded.map { String(format: "%.1f", $0.minX) } ?? "none", privacy: .public) in=\(self.superview.map { String(describing: type(of: $0)) } ?? "none", privacy: .public) text=\(String(self.textStorage.string.prefix(40)), privacy: .public)")
    }
    #endif
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Prose")

    /// Chooses the constrained paragraphs' line widths for the width the text
    /// has, when the width or the text changed since they were last chosen.
    /// `measuring`: called from the height's own getter, which is not told its
    /// answer has changed.
    private func rewrap(at width: CGFloat, measuring: Bool = false) {
        guard width > 0 else { return }
        if let last = wrappedFor, abs(last.width - width) < 0.5, last.version == version { return }
        wrappedFor = (width, version)
        let widths = LineWrap.widths(for: textStorage, width: width)
        let codeStarts = LineWrap.codeStarts(in: textStorage)
        guard widths != wrap.widths || codeStarts != wrap.codeStarts else { return }
        wrap.widths = widths
        wrap.codeStarts = codeStarts
        if let manager = textLayoutManager { manager.invalidateLayout(for: manager.documentRange) }
        if !measuring { invalidateIntrinsicContentSize() }
    }

    /// The text, replacing only what changed from the first differing paragraph
    /// on. When `fading`, what it adds is the cursor's latest stretch: it
    /// joins the soft edge (`fade`).
    func show(_ next: NSAttributedString, fading: Bool) {
        let storage = textStorage
        let old = storage.string as NSString
        let new = next.string as NSString
        let prefix = storage.string.commonPrefix(with: next.string) as NSString
        var start = old.paragraphRange(for: NSRange(location: min(prefix.length, old.length), length: 0)).location
        start = min(start, new.length)
        if start > 0, !storage.attributedSubstring(from: NSRange(location: 0, length: start))
            .isEqual(to: next.attributedSubstring(from: NSRange(location: 0, length: start))) { start = 0 }
        storage.beginEditing()
        storage.replaceCharacters(in: NSRange(location: start, length: old.length - start),
                                  with: next.attributedSubstring(from: NSRange(location: start, length: new.length - start)))
        storage.endEditing()
        invalidateIntrinsicContentSize()
        textChanged()
        guard fading, !UIAccessibility.isReduceMotionEnabled, new.length > old.length else { return }
        let now = CACurrentMediaTime()
        // The stretch was uncovered over the frame that drew it, not at its
        // end: its characters are spread across that frame, so the edge is a
        // ramp rather than a step a frame.
        let from = max(uncoveredAt, now - Self.stretchSpan)
        uncovered.append((NSRange(location: old.length, length: new.length - old.length), from, now))
        uncoveredAt = now
    }

    func clear() {
        uncovered = []
        textStorage.setAttributedString(NSAttributedString())
        textChanged()
    }

    /// The streamed text's soft edge (prompt-3, pacing: "each word the cursor
    /// uncovers fades in with opacity only, over --dur-menu, --ease-out"):
    /// each stretch the cursor uncovered, with the moments its first and last
    /// characters were uncovered. Every character fades in from its own
    /// moment, so the newest words ramp from clear to full behind the cursor
    /// over as many characters as it crosses in --dur-menu, and a word that
    /// grows never pops. Drawn as TextKit rendering attributes: the colour is
    /// painted, the text is never laid out again for it.
    private var uncovered: [(range: NSRange, from: Double, to: Double)] = []
    /// When the cursor last uncovered text here.
    private var uncoveredAt = 0.0
    /// The longest a stretch is spread over: a frame at the slowest rate the
    /// display link runs at.
    private static let stretchSpan = 1.0 / 30
    /// Opacity steps the edge is painted in: finer than the eye tells apart,
    /// coarse enough that a frame paints a run per step, not per character.
    private static let steps = 24.0
    /// The range the last frame of the edge painted, cleared before the next.
    private var painted: NSRange?

    /// One frame of the soft edge.
    func fade(_ now: Double) {
        guard painted != nil || !uncovered.isEmpty, let manager = textLayoutManager, let content = manager.textContentManager else { return }
        let length = textStorage.length
        func textRange(_ range: NSRange) -> NSTextRange? {
            guard let start = content.location(content.documentRange.location, offsetBy: range.location),
                  let end = content.location(start, offsetBy: range.length) else { return nil }
            return NSTextRange(location: start, end: end)
        }
        if let painted, let range = textRange(NSIntersectionRange(painted, NSRange(location: 0, length: length))) {
            manager.removeRenderingAttribute(.foregroundColor, for: range)
        }
        painted = nil
        uncovered.removeAll { now - $0.to >= Motion.durMenu || $0.range.location >= length }
        // Runs of one colour at one step, along the edge.
        var runs: [(range: NSRange, color: UIColor)] = []
        for stretch in uncovered {
            let range = NSIntersectionRange(stretch.range, NSRange(location: 0, length: length))
            guard range.length > 0 else { continue }
            for i in range.location ..< NSMaxRange(range) {
                let at = stretch.from + (stretch.to - stretch.from) * Double(i - stretch.range.location + 1) / Double(stretch.range.length)
                let progress = min(1, max(0, (now - at) / Motion.durMenu))
                guard progress < 1 else { continue }
                let alpha = (Motion.easeOut.value(at: progress) * Self.steps).rounded(.down) / Self.steps
                let ink = textStorage.attribute(.foregroundColor, at: i, effectiveRange: nil) as? UIColor ?? Palette.inkStrong
                let color = ink.withAlphaComponent(alpha * ink.cgColor.alpha)
                if let last = runs.last, NSMaxRange(last.range) == i, last.color == color {
                    runs[runs.count - 1].range.length += 1
                } else {
                    runs.append((NSRange(location: i, length: 1), color))
                }
            }
        }
        for run in runs {
            guard let range = textRange(run.range) else { continue }
            manager.addRenderingAttribute(.foregroundColor, value: run.color, for: range)
            painted = painted.map { NSUnionRange($0, run.range) } ?? run.range
        }
    }
}

/// A table cell's words (TableBlock), laid out by a ProseView's container and
/// fragments and drawn by them, in a plain view. A text view per cell was most
/// of what a table cost to build: a 4×4 table's sixteen UITextViews were 40 ms
/// of its row's 80–97 ms frame in a Release build. Where a reader acts on the
/// cell (its first touch, or the first ask for its accessibility) a ProseView
/// with the same words stands in its place before that touch is delivered, so
/// selecting, a link and VoiceOver are the text view's own, as they were.
final class CellText: UIView, NSTextLayoutManagerDelegate {
    /// Links drawn as a text view draws them (ProseView `linkTextAttributes`).
    nonisolated private final class Layout: NSTextLayoutManager {
        override func renderingAttributes(forLink _: Any, at _: any NSTextLocation) -> [NSAttributedString.Key: Any] {
            [.foregroundColor: Palette.linkInk, .underlineStyle: NSUnderlineStyle.single.rawValue]
        }
    }

    private let text: NSAttributedString
    private let wrap = LineWrap.Container(size: .zero)
    private let layout = Layout()
    /// The layout manager holds its content manager weakly.
    private let content = NSTextContentStorage()
    /// The leading below the last line, which TextKit leaves off (ProseView `closeLastLine`).
    private let below: CGFloat
    /// The text view standing in for the cell once a reader acted on it.
    private(set) var prose: ProseView?
    /// The width the lines' widths were last chosen for.
    private var wrappedFor: CGFloat?
    /// The text's height at the width it was last laid out at.
    private var fitted: CGFloat = 0
    /// The width the words were last measured at (`height(at:)`): the one the table stands the cell at.
    private var measuredAt: CGFloat?

    /// The words' height `width` wide, laid out as the cell draws them there
    /// (TableGeometry). Once a text view stands in, it is the one measured.
    func height(at width: CGFloat) -> CGFloat {
        if measuredAt.map({ abs($0 - width) >= 0.5 }) ?? true {
            measuredAt = width
            prose?.fitWidth = width
            setNeedsDisplay()
        }
        if let prose { return prose.intrinsicContentSize.height }
        guard width > 0, text.length > 0 else { return 0 }
        lay(at: width)
        return fitted
    }

    /// Placed by frame (TableBlock `layoutSubviews`), at the width and height `height(at:)` said.
    init(_ text: NSAttributedString) {
        self.text = text
        let style = text.length > 0 ? text.attribute(.paragraphStyle, at: text.length - 1, effectiveRange: nil) as? NSParagraphStyle : nil
        below = style?.lineSpacing ?? 0
        super.init(frame: .zero)
        layout.textContainer = wrap
        wrap.lineFragmentPadding = 0
        content.addTextLayoutManager(layout)
        content.primaryTextLayoutManager = layout
        layout.delegate = self
        content.textStorage?.setAttributedString(text)
        backgroundColor = .clear
        isOpaque = false
        contentMode = .redraw
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (cell: CellText, _: UITraitCollection) in cell.setNeedsDisplay() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    nonisolated func textLayoutManager(_: NSTextLayoutManager, textLayoutFragmentFor _: any NSTextLocation,
                                       in textElement: NSTextElement) -> NSTextLayoutFragment {
        ProseFragment(textElement: textElement, range: textElement.elementRange)
    }

    /// Lays the words out `width` wide, the lines' widths chosen as a
    /// ProseView chooses them (`rewrap`), and keeps their height.
    private func lay(at width: CGFloat) {
        guard width > 0 else { return }
        if abs(wrap.size.width - width) > 0.01 { wrap.size = CGSize(width: width, height: 0) }
        if wrappedFor.map({ abs($0 - width) >= 0.5 }) ?? true {
            wrappedFor = width
            let widths = LineWrap.widths(for: text, width: width)
            let starts = LineWrap.codeStarts(in: text)
            if widths != wrap.widths || starts != wrap.codeStarts {
                wrap.widths = widths
                wrap.codeStarts = starts
                layout.invalidateLayout(for: layout.documentRange)
            }
        }
        layout.ensureLayout(for: layout.documentRange)
        fitted = layout.usageBoundsForTextContainer.height + below
    }

    #if DEBUG
    /// The words' height laid out at the width the cell stands at, as it draws them.
    func laidHeight() -> CGFloat {
        if let prose { return prose.intrinsicContentSize.height }
        lay(at: bounds.width)
        return fitted
    }
    #endif

    override func draw(_ rect: CGRect) {
        guard prose == nil, let context = UIGraphicsGetCurrentContext() else { return }
        lay(at: bounds.width)
        layout.enumerateTextLayoutFragments(from: layout.documentRange.location, options: [.ensuresLayout]) { fragment in
            let frame = fragment.layoutFragmentFrame
            guard frame.minY <= rect.maxY else { return false }
            if frame.maxY >= rect.minY { fragment.draw(at: frame.origin, in: context) }
            return true
        }
    }

    /// The text view the cell becomes where a reader acts on it: its words, at its width.
    @discardableResult
    private func promote() -> ProseView {
        if let prose { return prose }
        let view = ProseView()
        view.attributedText = text
        view.fitWidth = measuredAt ?? bounds.width
        prose = view
        pin(view)
        setNeedsDisplay()
        layoutIfNeeded()
        return view
    }

    /// A touch on the cell is the text view's from its start: it stands in
    /// before the touch is delivered. A pointer only hovering leaves it be.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, alpha > 0.01, self.point(inside: point, with: event) else { return nil }
        guard prose != nil || event?.type == .touches else { return self }
        let view = promote()
        return view.hitTest(convert(point, to: view), with: event) ?? view
    }

    /// What assistive technology reads is the text view's, as before.
    override var accessibilityElements: [Any]? {
        get { [promote()] }
        set {}
    }
}

/// The one code surface (OutputBlock.svelte): a well on code-bg, --radius-sm,
/// 10/12 padding, the mono face at the label size on the body's leading,
/// scrolling sideways rather than wrapping.
final class CodeWell: UIView {
    private let scroll = UIScrollView()
    /// The listing, selectable as the web's is, at its own width: it never wraps.
    private let label = ProseView()
    private var labelWidth = 0.0
    private var source: (language: String?, text: String)?
    /// The padding above and below the listing: none where a chunk carries on.
    private var padTop = Size.txCodePadBlock
    private var padBottom = Size.txCodePadBlock

    /// A chunk of one long fence: open where the next or last chunk carries on,
    /// so the chunks read as the one well they are.
    func join(above: Bool, below: Bool) {
        padTop = above ? 0 : Size.txCodePadBlock
        padBottom = below ? 0 : Size.txCodePadBlock
        var corners: CACornerMask = []
        if !above { corners.formUnion([.layerMinXMinYCorner, .layerMaxXMinYCorner]) }
        if !below { corners.formUnion([.layerMinXMaxYCorner, .layerMaxXMaxYCorner]) }
        layer.maskedCorners = corners
        invalidateIntrinsicContentSize()
        setNeedsLayout()
    }

    /// Laid out by frame (`layoutSubviews`): its listing inside the padding,
    /// at the listing's own width, scrolling sideways. Its height, the
    /// listing's and the padding, does not depend on its width: it is its
    /// intrinsic size, for the stacks it stands in.
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.codeBg
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        clipsToBounds = true
        scroll.translatesAutoresizingMaskIntoConstraints = true
        scroll.showsHorizontalScrollIndicator = false
        scroll.alwaysBounceHorizontal = false
        label.translatesAutoresizingMaskIntoConstraints = true
        label.textContainer.lineBreakMode = .byClipping
        addSubview(scroll)
        scroll.addSubview(label)
        label.isAccessibilityElement = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (well: CodeWell, _: UITraitCollection) in well.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(language: String?, text: String) {
        guard source?.language != language || source?.text != text else { return }
        source = (language, text)
        paint()
    }

    private func paint() {
        guard let source else { return }
        let runs = Highlight.colors(source.text, language: source.language)
        let text = Self.listing(source.text, ink: Palette.codeInk)
        for (range, color) in runs ?? [] where NSMaxRange(range) <= text.length {
            text.addAttribute(.foregroundColor, value: color, range: range)
        }
        label.attributedText = text
        labelWidth = Self.width(of: text)
        label.fitWidth = labelWidth
        label.accessibilityLabel = source.text
        invalidateIntrinsicContentSize()
        setNeedsLayout()
    }

    /// The listing's height at its width.
    private var labelHeight: Double { label.intrinsicContentSize.height }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: padTop + labelHeight + padBottom)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        scroll.frame = bounds
        label.frame = CGRect(x: Size.txCodePadInline, y: padTop, width: labelWidth, height: labelHeight)
        scroll.contentSize = CGSize(width: Size.txCodePadInline + labelWidth + Size.txCodePadInline, height: bounds.height)
    }

    /// A listing's text: the mono face at the label size on the body's
    /// leading, never wrapping. Its colours are the highlighter's, which lay
    /// nothing out; the row's height is worked out from this (PieceHeight).
    nonisolated static func listing(_ text: String, ink: UIColor) -> NSMutableAttributedString {
        NSMutableAttributedString(string: text, attributes: Styled.attributes(
            TypeScale.typeBody, color: ink, size: TypeScale.textLabel, weight: TypeScale.weightBody, leading: TypeScale.leadingBody,
            mono: true, lineBreak: .byClipping, textKit2: true))
    }

    /// The width a listing's text stands at: its widest line, and a point.
    nonisolated static func width(of text: NSAttributedString) -> Double {
        ceil(text.boundingRect(with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude),
                               options: [.usesLineFragmentOrigin], context: nil).width) + 1
    }
}

/// A Markdown table's layout `width` wide (prose-sm): the columns laid out as
/// CSS lays out a `width: 100%` table with `table-layout: auto` (`columns`),
/// each row as tall as its tallest cell's words laid out at that cell's
/// column width with the cell's padding, a rule under the head and each row
/// but the last, and the table's own margins. Worked out this one way for the
/// height a row stands at and for what the table draws: by the view
/// (TableBlock, each cell measured by the cell that draws it), and where a
/// transcript is prepared, off the main thread before any view (PieceHeight,
/// each cell measured by TextMeasure, which lays text out as a cell does).
nonisolated struct TableGeometry {
    /// One line of cells, the head first.
    struct Line {
        /// Where its box starts, from the rows' top (the table's margin above them).
        let top: Double
        /// Its box: its tallest cell's words and the cells' padding.
        let height: Double
        /// Above the words: a body cell's padding; the head has none.
        let pad: Double
        /// Where the rule under it is drawn, from the rows' top; nil: none.
        let rule: Double?
    }

    /// Each column's width, its cells' inline padding included.
    let columns: [Double]
    let lines: [Line]
    /// The rows' height, the rules' halves between them included.
    let rows: Double
    /// The whole table's: its rows and its margins.
    var height: Double { rows + 2 * Self.margin }

    /// th and td: 1em inline, the first cell's start and the last's end
    /// flush; .666em below, and above a body cell.
    static let block = TypeScale.textMeta * 2 / 3
    static let inline = TypeScale.textMeta
    /// The table's own margin above and below, inside its scroller.
    static let margin = Size.proseSmTable

    /// A cell's inline padding at its start and its end, in a table of `count` columns.
    static func edges(_ column: Int, of count: Int) -> (start: Double, end: Double) {
        (column == 0 ? 0 : inline, column == count - 1 ? 0 : inline)
    }

    /// Each column's room for its cells' words: its width less their inline padding.
    static func inner(_ columns: [Double]) -> [Double] {
        columns.enumerated().map { column, width in
            let edge = edges(column, of: columns.count)
            return width - edge.start - edge.end
        }
    }

    /// The table laid out in `columns` (`columns(_:fitting:)`): `words` each
    /// cell's words' height at its column's room (`inner`), by line and
    /// column, the first line the head when `headed`; `scale` the screen's,
    /// which the rules' halves are taken down to.
    init(columns: [Double], words: [[Double]], headed: Bool, scale: Double) {
        // A collapsed 1px border gives each of the two rows it parts half of
        // itself, and WebKit takes each half down to a whole device pixel:
        // at 3x a third of a point either side, 0.67 in all, under a rule
        // painted its full point. Mobile Safari: head 26.33, rows 54.20 and
        // 53.88 around two-line cells 53.55 tall, rules 54.33 apart.
        let half = scale >= 2 ? (scale / 2).rounded(.down) / scale : 0.5
        var y = 0.0
        var lines: [Line] = []
        for (line, cells) in words.enumerated() {
            let head = headed && line == 0
            // A rule under the head, and under every row but the last.
            let ruled = head || line < words.count - 1
            if line > 0 { y += half }
            let pad = head ? 0 : Self.block
            let height = pad + (cells.max() ?? 0) + Self.block
            lines.append(Line(top: y, height: height, pad: pad, rule: ruled ? y + height : nil))
            y += height + (ruled ? half : 0)
        }
        self.columns = columns
        self.lines = lines
        rows = y
    }

    /// CSS's auto table layout for a table as wide as `width`.
    static func columns(_ extents: [(least: Double, most: Double)], fitting width: Double) -> [Double] {
        let least = extents.reduce(0) { $0 + $1.least }
        let most = extents.reduce(0) { $0 + $1.most }
        if most > 0, most <= width { return extents.map { $0.most * width / most } }
        if least >= width || most <= least { return extents.map(\.least) }
        // WebKit's AutoTableLayout: each column in turn takes its share of what
        // is left in proportion to its widest content, never less than its
        // narrowest. Mobile Safari, widest 98 / 141.2 / 176 in 366: 86.39,
        // 124.48, 155.16.
        var left = width
        var widest = most
        return extents.map { column in
            let taken = max(column.least, left * column.most / widest)
            left -= taken
            widest -= column.most
            return taken
        }
    }

    /// A cell's narrowest and widest one-line widths.
    private static func extent(_ cell: NSAttributedString) -> (least: Double, most: Double) {
        // On one line, as wide as its advances: the padding after a code box is
        // kern on its last character, and the padding before one that opens the
        // cell is the container's to give (LineWrap.codeStarts).
        let opening = LineWrap.codeStarts(in: cell)[0] ?? 0
        let most = cell.length == 0 ? 0 : CTLineGetTypographicBounds(CTLineCreateWithAttributedString(cell), nil, nil, nil) + opening
        var least = 0.0
        let text = cell.string as NSString
        text.enumerateSubstrings(in: NSRange(location: 0, length: text.length), options: [.byWords, .substringNotRequired]) { _, word, enclosing, _ in
            // A word runs to the next space: its trailing punctuation stays on it.
            var run = word
            let end = NSMaxRange(enclosing)
            while NSMaxRange(run) < end, let scalar = Unicode.Scalar(text.character(at: NSMaxRange(run))),
                  !CharacterSet.whitespacesAndNewlines.contains(scalar) { run.length += 1 }
            var pieces = [run]
            if cell.attribute(.inlineCode, at: run.location, effectiveRange: nil) != nil {
                pieces = (0 ..< run.length).map { NSRange(location: run.location + $0, length: 1) }
            }
            for piece in pieces {
                least = max(least, ceil(cell.attributedSubstring(from: piece).size().width))
            }
        }
        return (min(least, most), most)
    }

    /// Each column's narrowest and widest content, its cells' padding included.
    static func extents(of lines: [[NSAttributedString]]) -> [(least: Double, most: Double)] {
        let count = lines.map(\.count).max() ?? 0
        return (0 ..< count).map { column in
            let edge = edges(column, of: count)
            let padding = edge.start + edge.end
            return lines.reduce((least: padding, most: padding)) { sofar, line in
                guard column < line.count else { return sofar }
                let cell = extent(line[column])
                return (max(sofar.least, cell.least + padding), max(sofar.most, cell.most + padding))
            }
        }
    }
}

/// A Markdown table (prose-sm), laid out by frame as its geometry says
/// (TableGeometry) at the width it stands at: its rows inside its own
/// margins, in a scroller that scrolls sideways where the columns at their
/// narrowest are wider than the table. Its height at a width is the height
/// it draws at that width (`height(for:)`), its cells' words measured by the
/// cells that draw them.
final class TableBlock: UIView {
    private let scroll = UIScrollView()
    /// The lines as given, the head first when `headed`.
    private var source: [[NSAttributedString]] = []
    private var headed = false
    /// Each column's narrowest and widest content, its cells' padding included.
    private var extents: [(least: Double, most: Double)] = []
    /// Each line's cells, one a column.
    private var cells: [[CellText]] = []
    /// One rule a line, shown under the lines the geometry rules.
    private var rules: [UIView] = []
    /// The geometry last worked out, with the width and scale it was worked out at.
    private var laid: (width: CGFloat, scale: CGFloat, geometry: TableGeometry)?
    /// The width and scale the cells were last placed at.
    private var placed: (width: CGFloat, scale: CGFloat)?

    init() {
        super.init(frame: .zero)
        scroll.showsHorizontalScrollIndicator = false
        addSubview(scroll)
        registerForTraitChanges([UITraitDisplayScale.self]) { (table: TableBlock, _: UITraitCollection) in table.setNeedsLayout() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    #if DEBUG
    /// What laying tables out has cost since launch (probe-kit spec `ios-table-height`, Pace `probe table cost`).
    static var cost = (heights: 0, heightTime: 0.0, layouts: 0, layoutTime: 0.0, configures: 0)

    /// Each line's box as laid out at the table's width, in its space, with its tallest cell's words as drawn.
    func probeRows() -> [(frame: CGRect, text: CGFloat)] {
        let geometry = geometry(at: bounds.width)
        return geometry.lines.enumerated().map { line, row in
            (CGRect(x: 0, y: TableGeometry.margin + row.top, width: geometry.columns.reduce(0, +), height: row.height),
             cells[line].map { $0.laidHeight() }.max() ?? 0)
        }
    }
    #endif

    /// Its geometry `width` wide, at the screen's scale.
    private func geometry(at width: CGFloat) -> TableGeometry {
        let scale = max(traitCollection.displayScale, 1)
        if let laid, abs(laid.width - width) < 0.5, laid.scale == scale { return laid.geometry }
        let columns = TableGeometry.columns(extents, fitting: width)
        let inner = TableGeometry.inner(columns)
        let words = cells.map { line in zip(line, inner).map { cell, room in Double(cell.height(at: room)) } }
        let geometry = TableGeometry(columns: columns, words: words, headed: headed, scale: scale)
        laid = (width, scale, geometry)
        return geometry
    }

    /// Its height `width` wide: the height it draws at that width.
    func height(for width: CGFloat) -> CGFloat {
        #if DEBUG
        let start = CACurrentMediaTime()
        defer { Self.cost.heights += 1; Self.cost.heightTime += CACurrentMediaTime() - start }
        #endif
        return geometry(at: width).height
    }

    override func layoutSubviews() {
        #if DEBUG
        let start = CACurrentMediaTime()
        defer { Self.cost.layouts += 1; Self.cost.layoutTime += CACurrentMediaTime() - start }
        #endif
        super.layoutSubviews()
        let scale = max(traitCollection.displayScale, 1)
        guard bounds.width > 0, placed.map({ abs($0.width - bounds.width) >= 0.5 || $0.scale != scale }) ?? true else { return }
        placed = (bounds.width, scale)
        let geometry = geometry(at: bounds.width)
        let wide = geometry.columns.reduce(0, +)
        scroll.frame = CGRect(x: 0, y: TableGeometry.margin, width: bounds.width, height: geometry.rows)
        scroll.contentSize = CGSize(width: wide, height: geometry.rows)
        let inner = TableGeometry.inner(geometry.columns)
        for (line, row) in geometry.lines.enumerated() {
            var x = 0.0
            for (column, width) in geometry.columns.enumerated() {
                let cell = cells[line][column]
                let start = TableGeometry.edges(column, of: geometry.columns.count).start
                cell.frame = CGRect(x: x + start, y: row.top + row.pad, width: inner[column], height: cell.height(at: inner[column]))
                x += width
            }
            rules[line].isHidden = row.rule == nil
            rules[line].frame = CGRect(x: 0, y: row.rule ?? 0, width: wide, height: 1)
        }
    }

    func configure(head: [NSAttributedString], rows: [[NSAttributedString]]) {
        #if DEBUG
        Self.cost.configures += 1
        #endif
        let lines = head.isEmpty ? rows : [head] + rows
        guard lines != source || headed == head.isEmpty else { return }
        source = lines
        headed = !head.isEmpty
        extents = TableGeometry.extents(of: lines)
        for view in cells.joined() { view.removeFromSuperview() }
        for view in rules { view.removeFromSuperview() }
        let count = extents.count
        cells = lines.map { line in (0 ..< count).map { CellText($0 < line.count ? line[$0] : NSAttributedString()) } }
        rules = lines.map { _ in
            let rule = UIView()
            rule.backgroundColor = Palette.border
            return rule
        }
        for view in cells.joined() { scroll.addSubview(view) }
        for view in rules { scroll.addSubview(view) }
        laid = nil
        placed = nil
        setNeedsLayout()
    }
}

/// A quote (prose-sm `blockquote`): a 4pt rule in --border at its start, the
/// words 1.11em past it.
final class QuoteBlock: UIView {
    let text = ProseView()
    /// The rule and the gap after it, which the words stand past.
    nonisolated static let inset = Space.space1 + TypeScale.textBody * TypeScale.proseSmQuoteInset

    private let bar = UIView()

    /// Laid out by frame (`layoutSubviews`): the rule down its start, the
    /// words past it. Its height is the words' at its width: its intrinsic
    /// size, for the stacks it stands in, asked again when the width it is
    /// laid out at changes the words' height.
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        bar.backgroundColor = Palette.border
        bar.translatesAutoresizingMaskIntoConstraints = true
        addSubview(bar)
        text.translatesAutoresizingMaskIntoConstraints = true
        addSubview(text)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: text.intrinsicContentSize.height)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = max(0, bounds.width - Self.inset)
        if bounds.width > 0, text.fitWidth.map({ abs($0 - width) > 0.5 }) ?? true {
            text.fitWidth = width
            if abs(text.intrinsicContentSize.height - bounds.height) > 0.5 { invalidateIntrinsicContentSize() }
        }
        bar.frame = CGRect(x: 0, y: 0, width: Space.space1, height: bounds.height)
        text.frame = CGRect(x: Self.inset, y: 0, width: width, height: text.intrinsicContentSize.height)
    }
}

/// One block's view, for whichever kind it is.
@MainActor
func blockView(_ block: MarkdownBlock) -> UIView {
    switch block.kind {
    case let .text(text):
        let view = ProseView()
        view.attributedText = text
        return view
    case let .code(language, text):
        let well = CodeWell()
        well.configure(language: language, text: text)
        return well
    case let .table(head, rows):
        let table = TableBlock()
        table.configure(head: head, rows: rows)
        return table
    case let .quote(text):
        let quote = QuoteBlock()
        quote.text.attributedText = text
        return quote
    case .rule:
        let rule = UIView()
        rule.backgroundColor = Palette.border
        rule.translatesAutoresizingMaskIntoConstraints = false
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return rule
    }
}

/// A block's view (`blockView`) made ready to be placed by frame in a column
/// (PieceView, MessageBody): a rule's own height constraint goes, its frame says it.
@MainActor
func framedBlock(_ view: UIView) -> UIView {
    if !(view is ProseView || view is CodeWell || view is TableBlock || view is QuoteBlock) {
        NSLayoutConstraint.deactivate(view.constraints)
    }
    view.translatesAutoresizingMaskIntoConstraints = true
    return view
}

/// A block's height `width` wide, as its view (`blockView`) lays itself out there.
@MainActor
func blockHeight(_ view: UIView, width: CGFloat) -> CGFloat {
    switch view {
    case let text as ProseView:
        text.fitWidth = width
        return text.intrinsicContentSize.height
    case let quote as QuoteBlock:
        quote.text.fitWidth = max(0, width - QuoteBlock.inset)
        return quote.intrinsicContentSize.height
    case let well as CodeWell:
        return well.intrinsicContentSize.height
    case let table as TableBlock:
        return table.height(for: width)
    default:
        // A rule.
        return 1
    }
}

/// A whole message's words (MessageBody.svelte) as a column of its blocks,
/// for the rows that draw a message in one piece: the reader's well, a note's
/// body, a report.
///
/// Its blocks are laid out by frame, the blocks' gap apart (`layoutSubviews`),
/// with no constraint among them; to a layout of constraints around it, its
/// height at its width is its intrinsic size (`height(for:)`), at the width
/// its row said (`fitWidth`) or else the one layout gave it.
final class MessageBody: UIView {
    private var source: String?
    private var style = ProseStyle.body
    /// Kept clear at the first line's end (a grouped turn's floated clock).
    var floatSize: CGSize = .zero { didSet { (views.first as? ProseView)?.floatSize = floatSize } }
    /// The room above each block: none above the first, the blocks' own gap above the rest.
    private var gaps: [Double] = []
    /// The width layout gave it, where nobody said one beforehand.
    private var laidWidth: CGFloat?

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (body: MessageBody, _: UITraitCollection) in
            let source = body.source; body.source = nil
            if let source { body.configure(source, style: body.style) }
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The window width the blocks were drawn for, where the style sizes
    /// headings on prose's fluid title scale; nil where nothing depends on it.
    private var rendered: Double?

    private static func viewport(of window: UIWindow?, for style: ProseStyle) -> Double? {
        guard style.headingSize == nil else { return nil }
        return window.map { Double($0.bounds.width) }
    }

    /// Drawn again once the window it stands in is known, or has resized.
    private func redrawForViewport() {
        guard window != nil, let source, Self.viewport(of: window, for: style) != rendered else { return }
        configure(source, style: style)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        redrawForViewport()
    }

    /// Its height `width` wide: its blocks' and the gaps between them.
    func height(for width: CGFloat) -> CGFloat {
        guard width > 0 else { return 0 }
        return zip(views, gaps).reduce(0) { $0 + $1.1 + blockHeight($1.0, width: width) }
    }

    override var intrinsicContentSize: CGSize {
        let height = height(for: fitWidth ?? laidWidth ?? 0)
        if fitWidth == nil, laidWidth != nil { reported = height }
        return CGSize(width: UIView.noIntrinsicMetric, height: height)
    }

    /// The height last told to the layout around it, at the width it was laid at.
    private var reported: CGFloat?

    override func layoutSubviews() {
        super.layoutSubviews()
        redrawForViewport()
        let width = bounds.width
        // Its height is its height at its width: laid at a new one whose
        // height differs from the one it told, it says so to the layout
        // around it, and the row it stands in, measured at the width it last
        // stood at, is measured again (a list's cell sizes itself before its
        // content lays out, so it read the old height). Only when the height
        // changes: a cell that lays it out at a passing width while sizing
        // itself would otherwise be told, and size itself, without end.
        if fitWidth == nil, width > 0, laidWidth.map({ abs($0 - width) > 0.5 }) ?? true {
            laidWidth = width
            if reported.map({ abs($0 - height(for: width)) > 0.5 }) ?? true {
                invalidateIntrinsicContentSize()
                remeasureRow()
            }
        }
        var y: CGFloat = 0
        for (view, gap) in zip(views, gaps) {
            y += gap
            let height = blockHeight(view, width: width)
            view.frame = CGRect(x: 0, y: y, width: width, height: height)
            y += height
        }
    }

    /// The words, as blocks. Where the blocks already drawn are the same kinds,
    /// each is updated in place, and a growing one fades its new words in when
    /// `fading` (a streaming reasoning step).
    func configure(_ source: String, style: ProseStyle = .body, fading: Bool = false) {
        let viewport = Self.viewport(of: window, for: style)
        guard source != self.source || viewport != rendered else { return }
        self.source = source
        self.style = style
        rendered = viewport
        var style = style
        style.viewport = viewport
        // Rendered where the transcript was prepared (MarkdownCache), off
        // the main thread; rendered here only for words it never saw.
        let blocks = MarkdownCache.shared.blocks(source, style: style)
        let same = views.count == blocks.count && zip(views, blocks).allSatisfy { view, block in
            switch block.kind {
            case .text: view is ProseView
            case .code: view is CodeWell
            default: false
            }
        }
        // The block views are this view's own list, one per block, and this
        // pass reads only its own copy of it, never the view's subviews: a
        // pass re-entered from a layout or trait change once shrank the list
        // it was counting under it (TestFlight 20261007.6,
        // MessageBody.configure: index 1 beyond bounds [0 .. 0]).
        if same {
            for (view, block) in zip(views, blocks) {
                switch block.kind {
                case let .text(text): (view as? ProseView)?.show(text, fading: fading)
                case let .code(language, text): (view as? CodeWell)?.configure(language: language, text: text)
                default: break
                }
            }
        } else {
            let old = views
            views = blocks.map(blockView)
            for view in old { view.removeFromSuperview() }
            for view in views { addSubview(framedBlock(view)) }
        }
        gaps = blocks.indices.map { i in i == 0 ? 0 : MarkdownRender.gap(after: blocks[i - 1], before: blocks[i]) }
        (views.first as? ProseView)?.floatSize = floatSize
        for case let text as ProseView in views { text.fitWidth = fitWidth ?? laidWidth }
        invalidateIntrinsicContentSize()
        setNeedsLayout()
    }

    /// The block views, in order.
    private var views: [UIView] = []

    /// The width the words stand at, where their row knows it (ProseView `fitWidth`).
    var fitWidth: CGFloat? {
        didSet {
            guard fitWidth != oldValue else { return }
            for case let text as ProseView in views { text.fitWidth = fitWidth ?? laidWidth }
            invalidateIntrinsicContentSize()
            setNeedsLayout()
        }
    }

    func fade(_ now: Double) {
        for case let view as ProseView in views { view.fade(now) }
    }
}
