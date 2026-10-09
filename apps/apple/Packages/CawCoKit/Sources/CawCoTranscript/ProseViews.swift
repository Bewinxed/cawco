import CawCoDesign
import CoreText
import OSLog
import UIKit

/// A paragraph of rendered Markdown with what the browser paints that text
/// can't: inline code spans on their own surface (the run's block padding,
/// `.inlineCodePad`, above and below the mono run, 4pt either side,
/// --radius-xs), and a list's disc filled over its stand-in run (ListDisc).
nonisolated final class ProseFragment: NSTextLayoutFragment {
    override var renderingSurfaceBounds: CGRect {
        super.renderingSurfaceBounds.insetBy(dx: -Space.space1, dy: -Size.proseCodePad)
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
                    let rect = CGRect(x: span.x0 - Space.space1, y: span.baseline - font.ascender - pad,
                                      width: span.x1 - span.x0 + Space.space1, height: font.ascender - font.descender + pad * 2)
                    context.setFillColor(surface.cgColor)
                    context.addPath(UIBezierPath(roundedRect: rect, cornerRadius: Radius.radiusXs).cgPath)
                    context.fillPath()
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
        if abs(textContainer.size.width - inner) > 0.01 { textContainer.size = CGSize(width: inner, height: 0) }
        exclude(at: width)
        rewrap(at: inner, measuring: true)
        manager.ensureLayout(for: manager.documentRange)
        fitted = manager.usageBoundsForTextContainer.height + textContainerInset.top + textContainerInset.bottom
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
    private var laidWidth: CGFloat?

    /// The width the cell's words stand at, where the table knows it (ProseView `fitWidth`).
    var fitWidth: CGFloat? {
        didSet {
            guard fitWidth != oldValue else { return }
            prose?.fitWidth = fitWidth
            invalidateIntrinsicContentSize()
            setNeedsDisplay()
        }
    }

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
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = .clear
        isOpaque = false
        contentMode = .redraw
        setContentCompressionResistancePriority(.required, for: .vertical)
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

    /// The words' height at the width they stand at: `fitWidth`, else the one
    /// layout gave the cell. Once a text view stands in, it is the one measured.
    override var intrinsicContentSize: CGSize {
        let width = fitWidth ?? laidWidth ?? 0
        guard prose == nil, width > 0, text.length > 0 else { return CGSize(width: UIView.noIntrinsicMetric, height: prose == nil ? 0 : UIView.noIntrinsicMetric) }
        lay(at: width)
        return CGSize(width: UIView.noIntrinsicMetric, height: fitted)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard prose == nil, bounds.width > 0 else { return }
        if let fit = fitWidth, abs(bounds.width - fit) > 0.5 { fitWidth = nil }
        if fitWidth == nil, abs(bounds.width - (laidWidth ?? -1)) > 0.5 {
            laidWidth = bounds.width
            invalidateIntrinsicContentSize()
            remeasureRow()
        }
    }

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
        view.fitWidth = fitWidth ?? laidWidth
        prose = view
        pin(view)
        invalidateIntrinsicContentSize()
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

/// The one code surface (OutputBlock.svelte): a recessed well, --radius-sm,
/// 10/12 padding, the mono face at the label size on the body's leading,
/// scrolling sideways rather than wrapping.
final class CodeWell: UIView {
    private let scroll = UIScrollView()
    /// The listing, selectable as the web's is, at its own width: it never wraps.
    private let label = ProseView()
    private var labelWidth: NSLayoutConstraint!
    private var source: (language: String?, text: String)?
    private var labelTop: NSLayoutConstraint!
    private var labelBottom: NSLayoutConstraint!

    /// A chunk of one long fence: open where the next or last chunk carries on,
    /// so the chunks read as the one well they are.
    func join(above: Bool, below: Bool) {
        labelTop.constant = above ? 0 : Size.txCodePadBlock
        labelBottom.constant = below ? 0 : -Size.txCodePadBlock
        var corners: CACornerMask = []
        if !above { corners.formUnion([.layerMinXMinYCorner, .layerMaxXMinYCorner]) }
        if !below { corners.formUnion([.layerMinXMaxYCorner, .layerMaxXMaxYCorner]) }
        layer.maskedCorners = corners
    }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        clipsToBounds = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.alwaysBounceHorizontal = false
        label.textContainer.lineBreakMode = .byClipping
        labelWidth = label.widthAnchor.constraint(equalToConstant: 0)
        labelWidth.isActive = true
        addSubview(scroll)
        scroll.addSubview(label)
        let pad = UIEdgeInsets(top: Size.txCodePadBlock, left: Size.txCodePadInline, bottom: Size.txCodePadBlock, right: Size.txCodePadInline)
        labelTop = label.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: pad.top)
        labelBottom = label.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -pad.bottom)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            label.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: pad.left),
            label.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -pad.right),
            labelTop, labelBottom,
            scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor),
        ])
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
        let dark = traitCollection.userInterfaceStyle == .dark
        let runs = Highlight.colors(source.text, language: source.language, dark: dark)
        let ink = runs == nil ? Palette.inkStrong : Highlight.foreground(dark: dark)
        // The mono face at the label size on the body's leading.
        let text = NSMutableAttributedString(string: source.text, attributes: Styled.attributes(
            TypeScale.typeBody, color: ink, size: TypeScale.textLabel, weight: TypeScale.weightBody, leading: TypeScale.leadingBody,
            mono: true, lineBreak: .byClipping, textKit2: true))
        for (range, color) in runs ?? [] where NSMaxRange(range) <= text.length {
            text.addAttribute(.foregroundColor, value: color, range: range)
        }
        label.attributedText = text
        labelWidth.constant = ceil(text.boundingRect(with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude),
                                                     options: [.usesLineFragmentOrigin], context: nil).width) + 1
        label.accessibilityLabel = source.text
    }
}

/// A Markdown table (prose-sm): the table's own margins inside its scrolling
/// wrapper, rules under the head and each row, and the columns laid out as
/// CSS lays out a `width: 100%` table with `table-layout: auto`: each column
/// at its widest cell's one-line width, grown in proportion to fill the
/// width; where those don't fit, between each column's narrowest (its longest
/// word, any character of code, which breaks anywhere) and widest, in
/// proportion to the room between; past the narrowest, at those, scrolling
/// sideways.
final class TableBlock: UIView {
    private let scroll = UIScrollView()
    private let grid = UIStackView()
    /// Each column's narrowest and widest content, cell padding included.
    private var extents: [(least: Double, most: Double)] = []
    /// Every cell's width, by column.
    private var columnWidths: [[NSLayoutConstraint]] = []
    /// Every cell's text, by column, with the padding either side of it.
    private var columnTexts: [[(text: CellText, padding: Double)]] = []
    private var laidWidth: CGFloat = -1
    /// The width the table will stand at, where its row knows it (ProseView `fitWidth`).
    var fitWidth: CGFloat?

    /// th and td: 1em inline, the first cell's start and the last's end flush;
    /// .666em below, and above a body cell.
    private static let cellBlock = TypeScale.textMeta * 2 / 3
    private static let cellInline = TypeScale.textMeta

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.showsHorizontalScrollIndicator = false
        grid.axis = .vertical
        grid.translatesAutoresizingMaskIntoConstraints = false
        pin(scroll, insets: UIEdgeInsets(top: Size.proseSmTable, left: 0, bottom: Size.proseSmTable, right: 0))
        scroll.addSubview(grid)
        NSLayoutConstraint.activate([
            grid.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            grid.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            grid.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            grid.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, abs(bounds.width - laidWidth) > 0.5 else { return }
        laidWidth = bounds.width
        let widths = Self.columns(extents, fitting: bounds.width)
        for (column, constraints) in columnWidths.enumerated() {
            for constraint in constraints where abs(constraint.constant - widths[column]) > 0.25 {
                constraint.constant = widths[column]
            }
            for cell in columnTexts[column] { cell.text.fitWidth = widths[column] - cell.padding }
        }
    }

    /// CSS's auto table layout for a table as wide as `width`.
    private static func columns(_ extents: [(least: Double, most: Double)], fitting width: Double) -> [Double] {
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

    func configure(head: [NSAttributedString], rows: [[NSAttributedString]]) {
        laidWidth = -1
        setNeedsLayout()
        grid.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let columns = max(head.count, rows.map(\.count).max() ?? 0)
        extents = (0 ..< columns).map { i in
            let padding = (i == 0 ? 0 : Self.cellInline) + (i == columns - 1 ? 0 : Self.cellInline)
            return ([head] + rows).reduce((least: padding, most: padding)) { sofar, row in
                guard i < row.count else { return sofar }
                let cell = Self.extent(row[i])
                return (max(sofar.least, cell.least + padding), max(sofar.most, cell.most + padding))
            }
        }
        columnWidths = Array(repeating: [], count: columns)
        columnTexts = Array(repeating: [], count: columns)
        let known = bounds.width > 0 ? bounds.width : fitWidth
        let start = Self.columns(extents, fitting: known ?? extents.reduce(0) { $0 + $1.most })
        // A collapsed 1px border gives each of the two rows it parts half of
        // itself, and WebKit takes each half down to a whole device pixel:
        // at 3x a third of a point either side, 0.67 in all, under a rule
        // painted its full point. Mobile Safari: head 26.33, rows 54.20 and
        // 53.88 around two-line cells 53.55 tall, rules 54.33 apart.
        let scale = max(traitCollection.displayScale, 1)
        let half = scale >= 2 ? (scale / 2).rounded(.down) / scale : 0.5
        /// One row. `ruled`: the rule under it; `under`: a rule stands above it.
        func line(_ cells: [NSAttributedString], head: Bool, ruled: Bool, under: Bool) -> UIView {
            let row = UIStackView()
            row.axis = .horizontal
            row.alignment = .top
            for i in 0 ..< columns {
                let label = CellText(i < cells.count ? cells[i] : NSAttributedString())
                let box = UIView()
                let padding = (i == 0 ? 0 : Self.cellInline) + (i == columns - 1 ? 0 : Self.cellInline)
                if known != nil { label.fitWidth = start[i] - padding }
                columnTexts[i].append((label, padding))
                box.pin(label, insets: UIEdgeInsets(top: head ? 0 : Self.cellBlock, left: i == 0 ? 0 : Self.cellInline,
                                                    bottom: Self.cellBlock, right: i == columns - 1 ? 0 : Self.cellInline))
                let width = box.widthAnchor.constraint(equalToConstant: start[i])
                width.isActive = true
                columnWidths[i].append(width)
                row.addArrangedSubview(box)
            }
            let wrap = UIView()
            wrap.pin(row, insets: UIEdgeInsets(top: under ? half : 0, left: 0, bottom: ruled ? half : 0, right: 0))
            guard ruled else { return wrap }
            let rule = UIView()
            rule.backgroundColor = Palette.border
            rule.translatesAutoresizingMaskIntoConstraints = false
            wrap.addSubview(rule)
            NSLayoutConstraint.activate([
                rule.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
                rule.trailingAnchor.constraint(equalTo: wrap.trailingAnchor),
                rule.topAnchor.constraint(equalTo: wrap.bottomAnchor, constant: -half),
                rule.heightAnchor.constraint(equalToConstant: 1),
            ])
            return wrap
        }
        if !head.isEmpty { grid.addArrangedSubview(line(head, head: true, ruled: true, under: false)) }
        for (i, row) in rows.enumerated() {
            grid.addArrangedSubview(line(row, head: false, ruled: i < rows.count - 1, under: i > 0 || !head.isEmpty))
        }
    }
}

/// A quote (prose-sm `blockquote`): a 4pt rule in --border at its start, the
/// words 1.11em past it.
final class QuoteBlock: UIView {
    let text = ProseView()
    /// The rule and the gap after it, which the words stand past.
    static let inset = Space.space1 + TypeScale.textBody * TypeScale.proseSmQuoteInset

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let bar = UIView()
        bar.backgroundColor = Palette.border
        bar.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bar)
        pin(text, insets: UIEdgeInsets(top: 0, left: Self.inset, bottom: 0, right: 0))
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: leadingAnchor),
            bar.topAnchor.constraint(equalTo: topAnchor),
            bar.bottomAnchor.constraint(equalTo: bottomAnchor),
            bar.widthAnchor.constraint(equalToConstant: Space.space1),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }
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

/// A whole message's words (MessageBody.svelte) as a column of its blocks,
/// for the rows that draw a message in one piece: the reader's well, a note's
/// body, a report.
final class MessageBody: UIView {
    private let stack = UIStackView()
    private var source: String?
    private var style = ProseStyle.body
    /// Kept clear at the first line's end (a grouped turn's floated clock).
    var floatSize: CGSize = .zero { didSet { (views.first as? ProseView)?.floatSize = floatSize } }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        pin(stack)
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

    override func layoutSubviews() {
        super.layoutSubviews()
        redrawForViewport()
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
        // pass reads only its own copy of it: never the stack's
        // `arrangedSubviews`, which a pass re-entered from a layout or trait
        // change shrank under the loop counting blocks (TestFlight
        // 20261007.6, MessageBody.configure: index 1 beyond bounds [0 .. 0]).
        let drawn: [UIView]
        if same {
            drawn = views
            for (view, block) in zip(drawn, blocks) {
                switch block.kind {
                case let .text(text): (view as? ProseView)?.show(text, fading: fading)
                case let .code(language, text): (view as? CodeWell)?.configure(language: language, text: text)
                default: break
                }
            }
        } else {
            let old = views
            drawn = blocks.map(blockView)
            views = drawn
            for view in old { view.removeFromSuperview() }
            for view in drawn { stack.addArrangedSubview(view) }
        }
        for i in blocks.indices.dropFirst() {
            stack.setCustomSpacing(MarkdownRender.gap(after: blocks[i - 1], before: blocks[i]), after: drawn[i - 1])
        }
        (views.first as? ProseView)?.floatSize = floatSize
        for case let text as ProseView in views { text.fitWidth = fitWidth }
    }

    /// The block views, in order: what the stack arranges.
    private var views: [UIView] = []

    /// The width the words stand at, where their row knows it (ProseView `fitWidth`).
    var fitWidth: CGFloat? {
        didSet {
            guard fitWidth != oldValue else { return }
            for case let text as ProseView in views { text.fitWidth = fitWidth }
        }
    }

    func fade(_ now: Double) {
        for case let view as ProseView in views { view.fade(now) }
    }
}
