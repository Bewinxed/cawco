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
    private var fades: [(range: NSRange, at: Double, color: UIColor)] = []
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

    /// The text's own height, as CSS keeps a block's: a text view rounds its
    /// height up to a whole point, which over a run of blocks puts each a
    /// fraction lower than the web's (a 16.2pt line took 17).
    override var intrinsicContentSize: CGSize {
        // At a width known beforehand the text is laid out once, in its own
        // container, and that layout is the one it is then drawn from.
        if let width = fitWidth, width > 0, floatSize == .zero, textStorage.length > 0, let manager = textLayoutManager {
            if abs(textContainer.size.width - width) > 0.01 { textContainer.size = CGSize(width: width, height: 0) }
            rewrap(at: width, measuring: true)
            manager.ensureLayout(for: manager.documentRange)
            fitted = manager.usageBoundsForTextContainer.height + textContainerInset.top + textContainerInset.bottom
            return CGSize(width: UIView.noIntrinsicMetric, height: fitted)
        }
        let size = super.intrinsicContentSize
        guard size.height != UIView.noIntrinsicMetric, textStorage.length > 0, let manager = textLayoutManager else { return size }
        manager.ensureLayout(for: manager.documentRange)
        let used = manager.usageBoundsForTextContainer.height + textContainerInset.top + textContainerInset.bottom
        fitted = used
        // Only the round-up is taken off: where the two disagree by a point or
        // more, the container has not been laid out at this width yet.
        let over = size.height - used
        return over > 0 && over < 1 ? CGSize(width: size.width, height: used) : size
    }

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
        let clear = floatSize == .zero ? nil : CGRect(x: bounds.width - floatSize.width, y: 0,
                                                      width: floatSize.width, height: floatSize.height)
        if clear != excluded {
            excluded = clear
            textContainer.exclusionPaths = clear.map { [UIBezierPath(rect: $0)] } ?? []
            invalidateIntrinsicContentSize()
        }
        if let fit = fitWidth, bounds.width > 0, abs(bounds.width - fit) > 0.5 { fitWidth = nil }
        rewrap(at: bounds.width - textContainerInset.left - textContainerInset.right)
        // The frame is snapped to whole pixels and can come out a fraction
        // shorter than the text (LineWrap.Container `size`): said once a text.
        if bounds.height > 0, fitted - bounds.height > 0.01, shortFor != version {
            shortFor = version
            Self.log.info("text \(self.fitted, format: .fixed(precision: 2)) tall in a view \(Double(self.bounds.height), format: .fixed(precision: 2)) tall, \(self.textStorage.length) characters ending \(String(self.textStorage.string.suffix(12)), privacy: .public)")
        }
    }

    /// The text's own height, as last measured for the view's size.
    private var fitted = 0.0
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
    /// on, and fading the words it adds when `fading`.
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
        new.enumerateSubstrings(in: NSRange(location: old.length, length: new.length - old.length),
                                options: [.byWords, .substringNotRequired]) { _, word, _, _ in
            let color = storage.attribute(.foregroundColor, at: word.location, effectiveRange: nil) as? UIColor ?? Palette.inkStrong
            self.fades.append((word, now, color))
        }
    }

    func clear() {
        fades = []
        textStorage.setAttributedString(NSAttributedString())
        textChanged()
    }

    /// One frame of the chunk fade: each new word's opacity on --dur-menu, --ease-out.
    func fade(_ now: Double) {
        guard !fades.isEmpty, let manager = textLayoutManager, let content = manager.textContentManager else { return }
        fades.removeAll { entry in
            guard NSMaxRange(entry.range) <= textStorage.length,
                  let start = content.location(content.documentRange.location, offsetBy: entry.range.location),
                  let end = content.location(start, offsetBy: entry.range.length),
                  let range = NSTextRange(location: start, end: end) else { return true }
            let progress = min(1, (now - entry.at) / Motion.durMenu)
            if progress >= 1 { manager.removeRenderingAttribute(.foregroundColor, for: range); return true }
            manager.addRenderingAttribute(.foregroundColor, value: entry.color.withAlphaComponent(Motion.easeOut.value(at: progress)), for: range)
            return false
        }
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
    private var columnTexts: [[(text: ProseView, padding: Double)]] = []
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
                let label = ProseView()
                label.attributedText = i < cells.count ? cells[i] : NSAttributedString()
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
    var floatSize: CGSize = .zero { didSet { (stack.arrangedSubviews.first as? ProseView)?.floatSize = floatSize } }

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
        let blocks = MarkdownRender.blocks(source, style: style)
        let views = stack.arrangedSubviews
        let same = views.count == blocks.count && zip(views, blocks).allSatisfy { view, block in
            switch block.kind {
            case .text: view is ProseView
            case .code: view is CodeWell
            default: false
            }
        }
        if same {
            for (view, block) in zip(views, blocks) {
                switch block.kind {
                case let .text(text): (view as? ProseView)?.show(text, fading: fading)
                case let .code(language, text): (view as? CodeWell)?.configure(language: language, text: text)
                default: break
                }
            }
        } else {
            views.forEach { $0.removeFromSuperview() }
            for block in blocks { stack.addArrangedSubview(blockView(block)) }
        }
        for i in blocks.indices.dropFirst() {
            stack.setCustomSpacing(MarkdownRender.gap(after: blocks[i - 1], before: blocks[i]), after: stack.arrangedSubviews[i - 1])
        }
        (stack.arrangedSubviews.first as? ProseView)?.floatSize = floatSize
        for case let text as ProseView in stack.arrangedSubviews { text.fitWidth = fitWidth }
    }

    /// The width the words stand at, where their row knows it (ProseView `fitWidth`).
    var fitWidth: CGFloat? {
        didSet {
            guard fitWidth != oldValue else { return }
            for case let text as ProseView in stack.arrangedSubviews { text.fitWidth = fitWidth }
        }
    }

    func fade(_ now: Double) {
        for case let view as ProseView in stack.arrangedSubviews { view.fade(now) }
    }
}
