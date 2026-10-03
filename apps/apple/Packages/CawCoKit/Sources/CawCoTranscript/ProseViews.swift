import CawCoDesign
import UIKit

/// A paragraph whose inline code spans stand on their own surface: 1pt above
/// and below the mono run, 4pt either side, --radius-xs (MessageBody `code`).
nonisolated final class CodeSpanFragment: NSTextLayoutFragment {
    override var renderingSurfaceBounds: CGRect {
        super.renderingSurfaceBounds.insetBy(dx: -Space.space1, dy: -2)
    }

    override func draw(at point: CGPoint, in context: CGContext) {
        if let paragraph = textElement as? NSTextParagraph {
            let text = paragraph.attributedString
            text.enumerateAttribute(.inlineCode, in: NSRange(location: 0, length: text.length)) { value, range, _ in
                guard let surface = value as? UIColor, range.length > 0 else { return }
                let font = text.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont ?? TypeScale.typeCode.font
                for line in textLineFragments {
                    let lineRange = line.characterRange
                    let start = max(range.location, lineRange.location)
                    let end = min(NSMaxRange(range), NSMaxRange(lineRange))
                    guard start < end else { continue }
                    let x0 = line.locationForCharacter(at: start).x
                    let x1 = line.locationForCharacter(at: end).x
                    let frame = line.typographicBounds
                    let baseline = frame.minY + line.glyphOrigin.y
                    let rect = CGRect(x: point.x + frame.minX + x0 - Space.space1, y: point.y + baseline - font.ascender - 1,
                                      width: x1 - x0 + Space.space1, height: font.ascender - font.descender + 2)
                    context.setFillColor(surface.cgColor)
                    context.addPath(UIBezierPath(roundedRect: rect, cornerRadius: Radius.radiusXs).cgPath)
                    context.fillPath()
                }
            }
        }
        super.draw(at: point, in: context)
    }
}

/// Running text, selectable, on TextKit 2: one block of a message.
final class ProseView: UITextView, NSTextLayoutManagerDelegate {
    /// A rect kept clear at the first line's end, for a grouped turn's clock.
    var floatSize: CGSize = .zero { didSet { if floatSize != oldValue { setNeedsLayout(); invalidateIntrinsicContentSize() } } }
    private var fades: [(range: NSRange, at: Double, color: UIColor)] = []

    init() {
        super.init(frame: .zero, textContainer: nil)
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

    nonisolated func textLayoutManager(_: NSTextLayoutManager, textLayoutFragmentFor location: any NSTextLocation,
                                       in textElement: NSTextElement) -> NSTextLayoutFragment {
        CodeSpanFragment(textElement: textElement, range: textElement.elementRange)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let paths = floatSize == .zero ? [] : [UIBezierPath(rect: CGRect(x: bounds.width - floatSize.width, y: 0,
                                                                          width: floatSize.width, height: floatSize.height))]
        if textContainer.exclusionPaths != paths {
            textContainer.exclusionPaths = paths
            invalidateIntrinsicContentSize()
        }
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
    private let label = UILabel()
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
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
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
        let font = TypeScale.typeCode.font(TypeScale.textLabel)
        let height = font.pointSize * TypeScale.leadingBody
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = height
        paragraph.maximumLineHeight = height
        paragraph.lineBreakMode = .byClipping
        let runs = Highlight.colors(source.text, language: source.language, dark: dark)
        let ink = runs == nil ? Palette.inkStrong : Highlight.foreground(dark: dark)
        let text = NSMutableAttributedString(string: source.text, attributes: [
            .font: font, .foregroundColor: ink, .paragraphStyle: paragraph,
            .baselineOffset: (height - font.lineHeight) / 4,
        ])
        for (range, color) in runs ?? [] where NSMaxRange(range) <= text.length {
            text.addAttribute(.foregroundColor, value: color, range: range)
        }
        label.attributedText = text
        label.accessibilityLabel = source.text
    }
}

/// A Markdown table (prose-sm): rules under the head and each row, cells set
/// inline, scrolling sideways when wider than the column.
final class TableBlock: UIView {
    private let scroll = UIScrollView()
    private let grid = UIStackView()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.showsHorizontalScrollIndicator = false
        grid.axis = .vertical
        grid.translatesAutoresizingMaskIntoConstraints = false
        pin(scroll)
        scroll.addSubview(grid)
        NSLayoutConstraint.activate([
            grid.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            grid.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            grid.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            grid.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            grid.widthAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.widthAnchor),
            scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(head: [NSAttributedString], rows: [[NSAttributedString]]) {
        grid.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let columns = max(head.count, rows.map(\.count).max() ?? 0)
        // Each column as wide as its widest cell, capped so a long cell wraps.
        var widths = [Double](repeating: 0, count: columns)
        let cap = 260.0
        for row in [head] + rows {
            for (i, cell) in row.enumerated() where i < columns {
                let size = cell.boundingRect(with: CGSize(width: cap, height: .greatestFiniteMagnitude),
                                             options: [.usesLineFragmentOrigin], context: nil).size
                widths[i] = max(widths[i], ceil(size.width))
            }
        }
        // th: 0 .666em .666em; td: .666em 1em; the first cell flush, the last flush.
        let cellPad = (TypeScale.textMeta * 2 / 3).rounded()
        let inline = TypeScale.textMeta
        func line(_ cells: [NSAttributedString], head: Bool) -> UIView {
            let row = UIStackView()
            row.axis = .horizontal
            row.alignment = .top
            for i in 0 ..< columns {
                let label = WrapLabel()
                label.attributedText = i < cells.count ? cells[i] : NSAttributedString()
                let box = UIView()
                box.pin(label, insets: UIEdgeInsets(top: head ? 0 : cellPad, left: i == 0 ? 0 : inline,
                                                    bottom: cellPad, right: i == columns - 1 ? 0 : inline))
                box.widthAnchor.constraint(equalToConstant: widths[i] + (i == 0 ? 0 : inline) + (i == columns - 1 ? 0 : inline)).isActive = true
                row.addArrangedSubview(box)
            }
            let wrap = UIView()
            wrap.pin(row)
            let rule = UIView()
            rule.backgroundColor = Palette.border
            rule.translatesAutoresizingMaskIntoConstraints = false
            wrap.addSubview(rule)
            NSLayoutConstraint.activate([
                rule.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
                rule.trailingAnchor.constraint(equalTo: wrap.trailingAnchor),
                rule.bottomAnchor.constraint(equalTo: wrap.bottomAnchor),
                rule.heightAnchor.constraint(equalToConstant: 1),
            ])
            return wrap
        }
        if !head.isEmpty { grid.addArrangedSubview(line(head, head: true)) }
        for (i, row) in rows.enumerated() {
            let drawn = line(row, head: false)
            if i == rows.count - 1 { drawn.subviews.last?.isHidden = true }
            grid.addArrangedSubview(drawn)
        }
    }
}

/// A quote (prose-sm `blockquote`): a 4pt rule in --border at its start, the
/// words muted and oblique 1.11em in.
final class QuoteBlock: UIView {
    let text = ProseView()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let bar = UIView()
        bar.backgroundColor = Palette.border
        bar.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bar)
        let inset = (TypeScale.textBody * 10 / 9).rounded() + Space.space1
        pin(text, insets: UIEdgeInsets(top: 0, left: inset, bottom: 0, right: 0))
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

    /// The words, as blocks. Where the blocks already drawn are the same kinds,
    /// each is updated in place, and a growing one fades its new words in when
    /// `fading` (a streaming reasoning step).
    func configure(_ source: String, style: ProseStyle = .body, fading: Bool = false) {
        guard source != self.source else { return }
        self.source = source
        self.style = style
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
    }

    func fade(_ now: Double) {
        for case let view as ProseView in stack.arrangedSubviews { view.fade(now) }
    }
}
