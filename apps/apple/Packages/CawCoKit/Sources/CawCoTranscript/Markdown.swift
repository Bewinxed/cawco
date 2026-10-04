import CawCoDesign
import Highlightr
import JavaScriptCore
import Markdown
import UIKit

extension NSAttributedString.Key {
    /// An inline code span: ProseView paints its surface behind the run.
    nonisolated static let inlineCode = NSAttributedString.Key("dev.cawco.inlineCode")
    /// The surface's block padding past the run's ascender and descender.
    nonisolated static let inlineCodePad = NSAttributedString.Key("dev.cawco.inlineCodePad")
    /// A list's disc: the run stands in for it, and ProseView fills the disc over it in this colour.
    nonisolated static let listDisc = NSAttributedString.Key("dev.cawco.listDisc")
}

/// An outside `list-style: disc` marker as WebKit draws it (RenderListMarker):
/// a filled circle `(ascent·⅔ + 1) / 2` across, its top half the ascent above
/// the baseline, its start the marker padding plus ⅔ of the rounded ascent
/// (whole pixels, as WebKit's integer `intAscent() * 2 / 3`) out from the item.
nonisolated enum ListDisc {
    static func diameter(_ font: UIFont) -> Double { (font.ascender * 2 / 3 + 1) / 2 }
    static func top(_ font: UIFont) -> Double { font.ascender / 2 }
    /// From the disc's start to where the item starts.
    static func outset(_ font: UIFont) -> Double { (font.ascender.rounded() * 2 / 3).rounded(.down) + Size.listMarkerPadding }
}

/// One block of rendered Markdown, as the shared `Markdown` component draws it
/// inside `.prose`: running text, a fence in its code well (OutputBlock), a
/// table, a quote, a rule.
struct MarkdownBlock {
    enum Kind {
        case text(NSAttributedString)
        case code(language: String?, text: String)
        case table(head: [NSAttributedString], rows: [[NSAttributedString]])
        case quote(NSAttributedString)
        case rule
    }

    let kind: Kind
    /// Its margins as its container's CSS leaves them; a neighbour's collapse into them.
    var top: Double = 0
    var bottom: Double = 0

    static func text(_ text: NSAttributedString) -> MarkdownBlock { MarkdownBlock(kind: .text(text)) }
    static func code(language: String?, text: String) -> MarkdownBlock { MarkdownBlock(kind: .code(language: language, text: text)) }
    static func table(head: [NSAttributedString], rows: [[NSAttributedString]]) -> MarkdownBlock { MarkdownBlock(kind: .table(head: head, rows: rows)) }
    static func quote(_ text: NSAttributedString) -> MarkdownBlock { MarkdownBlock(kind: .quote(text)) }
    static let rule = MarkdownBlock(kind: .rule)
}

/// How one container sets the markdown inside it: @tailwindcss/typography's
/// prose-sm (with app.css's type over it) and the container's own rules over
/// that. A document keeps prose-sm's rhythm; a turn, a tool's markdown and a
/// reasoning step each put one gap of their own between blocks.
struct ProseStyle {
    var ink: UIColor = Palette.inkStrong
    var role: TypeRole = TypeScale.typeBody
    /// The running text's line height; nil keeps the role's.
    var leading: Double?
    /// `.prose > *`'s top margin, which every block takes over prose-sm's;
    /// nil keeps prose-sm's own (a document).
    var blockGap: Double? = Space.space3
    /// The same rule writing `margin-block: <gap> 0`, so no block keeps a
    /// bottom margin (a reasoning step).
    var flushBottoms = false
    /// Over a heading that is not first, for headings up to `headingGapThrough`.
    var headingGap: Double? = Space.space5
    var headingGapThrough = 6
    /// Every heading at one size on --leading-ui; nil keeps prose's scale
    /// (h1 and h2 at the title size, the rest at the body's).
    var headingSize: Double? = TypeScale.textBody
    /// Between two paragraphs inside a quote or an item: the container's
    /// `p + p`, none where it zeroes paragraph margins, or prose-sm's own.
    var paragraphGap: Double = Space.space3
    var listInset = Space.space5
    /// Above and below a list inside an item (the container's `li > ul`, or
    /// prose-sm's nested-list margins); below collapses with the next item's gap.
    var nestedListGap = Space.space1
    var nestedListAfter: Double = 0
    /// Between an item's paragraphs (a loose list's): `p + p`, or prose-sm's `li p`.
    var itemParagraphGap: Double = Space.space3
    /// Strong text's ink, where a body sets one (a reasoning step's).
    var strongInk: UIColor?
    /// Inline code: its size, its surface and the surface's block padding.
    var codeSize = TypeScale.textMeta
    var codeSurface: UIColor = Palette.muted
    var codePad = Size.proseCodePad
    /// The prose plugin wraps inline code in literal backticks (`code::before/after`);
    /// a reasoning step and a tool's markdown take them off.
    var codeTicks = true
    /// app.css's wrap: `p` and `li` `pretty`, h1–h4 `balance` (LineWrap);
    /// a turn's words (MessageBody) are `stable` and wrap as written.
    var wraps = false
    /// The window's width, which the fluid title size (`clamp(…vi…)`) of
    /// prose's h1 and h2 is resolved against; MessageBody sets it.
    var viewport: Double?

    /// A turn's words (MessageBody.svelte): --space-3 between blocks and
    /// --space-5 over a heading, headings at the body size, code at the label
    /// size on the recess.
    static let body = ProseStyle(codeSize: TypeScale.textLabel, codeSurface: Palette.surfaceRecess, codePad: Size.txCodeSpanPad)
    /// The reader's own words, in their well: code lifts to the raised surface.
    static let well = ProseStyle(codeSize: TypeScale.textLabel, codeSurface: Palette.surfaceRaised, codePad: Size.txCodeSpanPad)
    static let muted = ProseStyle(ink: Palette.inkMuted, codeSize: TypeScale.textLabel, codeSurface: Palette.surfaceRecess, codePad: Size.txCodeSpanPad)
    /// A reasoning step (thinking-step.svelte): muted, --space-1 above each
    /// block and nothing below, strong in the strong ink, no backticks.
    static let step = ProseStyle(ink: Palette.inkMuted, blockGap: Space.space1, flushBottoms: true, headingGap: Space.space1,
                                 headingSize: nil, paragraphGap: 0, itemParagraphGap: 0, strongInk: Palette.inkStrong, codeTicks: false,
                                 wraps: true)
    /// ToolProse: a tool's markdown, --space-2 apart, h1 to h4 --space-4 down
    /// and at the label size, no backticks.
    static let tool = ProseStyle(blockGap: Space.space2, headingGap: Space.space4, headingGapThrough: 4,
                                 headingSize: TypeScale.textLabel, paragraphGap: 0, itemParagraphGap: 0, codeTicks: false, wraps: true)
    /// A rendered document (the project page's docs card, a memory file):
    /// prose-sm as it stands, on its 24/14 line.
    static let document = ProseStyle(leading: TypeScale.leadingProseSm, blockGap: nil, headingGap: nil, headingSize: nil,
                                     paragraphGap: Size.proseSmBlock, listInset: Size.proseSmListInset,
                                     nestedListGap: Size.proseSmNestedList, nestedListAfter: Size.proseSmNestedList,
                                     itemParagraphGap: Size.proseSmNestedList, wraps: true)
}

enum MarkdownRender {
    /// The blocks of a source, top level first to last.
    static func blocks(_ source: String, style: ProseStyle = .body) -> [MarkdownBlock] {
        var out: [MarkdownBlock] = []
        var previous: Markup?
        // The web's markdown keeps quotes and dashes as typed: no smart punctuation.
        for node in Document(parsing: source, options: [.disableSmartOpts]).children {
            // Raw HTML blocks in a row are bare text nodes side by side: they run
            // on in one line box, nothing between them (`</details><custom-tag>`).
            if node is HTMLBlock, previous is HTMLBlock, let last = out.last, case let .text(before) = last.kind,
               case let .text(more) = block(node, style: style).kind {
                let joined = NSMutableAttributedString(attributedString: before)
                joined.append(more)
                out[out.count - 1] = MarkdownBlock(kind: .text(joined), top: last.top, bottom: last.bottom)
                previous = node
                continue
            }
            var each = block(node, style: style)
            if style.wraps { each = wrapped(each, node) }
            (each.top, each.bottom) = margins(node, after: previous, style: style)
            out.append(each)
            previous = node
        }
        return out
    }

    /// A block's text marked with its `text-wrap-style`: h1–h4 balance, the
    /// paragraphs, items and quoted paragraphs pretty; a heading below h4, raw
    /// HTML (a bare text node) and a listing in an item wrap as written.
    private static func wrapped(_ block: MarkdownBlock, _ node: Markup) -> MarkdownBlock {
        let style: LineWrap.Style
        switch node {
        case let heading as Heading: style = heading.level <= 4 ? .balance : .greedy
        case is HTMLBlock: style = .greedy
        default: style = .pretty
        }
        func mark(_ text: NSAttributedString) -> NSAttributedString {
            guard style != .greedy else { return text }
            let out = NSMutableAttributedString(attributedString: text)
            let all = NSRange(location: 0, length: out.length)
            var open: [NSRange] = []
            out.enumerateAttribute(.wrapStyle, in: all) { value, range, _ in if value == nil { open.append(range) } }
            for range in open { out.addAttribute(.wrapStyle, value: style.rawValue, range: range) }
            return out
        }
        var marked = block
        switch block.kind {
        case let .text(text): marked = MarkdownBlock(kind: .text(mark(text)), top: block.top, bottom: block.bottom)
        case let .quote(text): marked = MarkdownBlock(kind: .quote(mark(text)), top: block.top, bottom: block.bottom)
        default: break
        }
        return marked
    }

    /// A block's margins: prose-sm's own, then the container's rules over them.
    private static func margins(_ node: Markup, after previous: Markup?, style: ProseStyle) -> (top: Double, bottom: Double) {
        // Raw HTML stands as a bare text node: an anonymous box, with no
        // margins of its own and none the container's `.prose > *` reaches.
        if node is HTMLBlock { return (0, 0) }
        let body = style.role.points
        var (top, bottom): (Double, Double)
        switch node {
        case let heading as Heading:
            let size = headingFont(heading.level, style: style).pointSize
            switch heading.level {
            case 1: (top, bottom) = (0, TypeScale.proseSmTitleAfter * size)
            case 2: (top, bottom) = (TypeScale.proseSmTitleBefore * size, TypeScale.proseSmTitleAfter * size)
            case 3: (top, bottom) = (TypeScale.proseSmH3Before * size, TypeScale.proseSmH3After * size)
            default: (top, bottom) = (TypeScale.proseSmH4Before * size, TypeScale.proseSmH4After * size)
            }
        case is BlockQuote: (top, bottom) = (TypeScale.proseSmQuote * body, TypeScale.proseSmQuote * body)
        case is ThematicBreak: (top, bottom) = (TypeScale.proseSmRule * body, TypeScale.proseSmRule * body)
        // A fence's `.not-prose my-3` wrapper.
        case is CodeBlock: (top, bottom) = (Size.txCodeMargin, Size.txCodeMargin)
        // A table's scrolling wrapper takes no margin; the table's own sit inside it (TableBlock).
        case is Table: (top, bottom) = (0, 0)
        default: (top, bottom) = (Size.proseSmBlock, Size.proseSmBlock)
        }
        // typography.config.ts FOLLOWS: what comes after an h2 to h4 or a rule
        // starts flush, but for the wrapped blocks (a fence's, a table's).
        if let previous, (previous as? Heading).map({ (2 ... 4).contains($0.level) }) ?? (previous is ThematicBreak),
           !(node is CodeBlock), !(node is Table) {
            top = 0
        }
        guard let gap = style.blockGap else { return (top, bottom) }
        // The container's own rhythm: `.prose > *` sets every top, a heading's
        // its own, and p, lists and quotes give up their margins.
        if let heading = node as? Heading, heading.level <= style.headingGapThrough, let over = style.headingGap {
            top = over
        } else {
            top = gap
        }
        if node is Paragraph || node is UnorderedList || node is OrderedList || node is BlockQuote || style.flushBottoms {
            bottom = 0
        }
        return (top, bottom)
    }

    /// The top-level blocks a source is cut at: each one, but a raw HTML block
    /// that follows another stays with it, since the two draw as one line (`blocks`).
    static func pieceHeads(_ children: [Markup]) -> [Markup] {
        children.indices.compactMap { i in
            i > 0 && children[i] is HTMLBlock && children[i - 1] is HTMLBlock ? nil : children[i]
        }
    }

    /// A settled source cut at its top-level blocks.
    static func topLevel(_ source: String) -> [String] {
        let children = pieceHeads(Array(Document(parsing: source).children))
        guard children.count > 1 else { return source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : [source] }
        let raw = Array(source.utf8)
        var lines = [0]
        for (i, byte) in raw.enumerated() where byte == 10 { lines.append(i + 1) }
        let starts = children.map { child -> Int in
            guard let at = child.range?.lowerBound else { return 0 }
            return lines[at.line - 1] + at.column - 1
        }
        return starts.indices.map { i in
            String(decoding: raw[starts[i] ..< (i + 1 < starts.count ? starts[i + 1] : raw.count)], as: UTF8.self)
        }
    }

    /// Room between two blocks, their margins collapsed as CSS collapses them.
    static func gap(after above: MarkdownBlock, before below: MarkdownBlock) -> Double {
        max(above.bottom, below.top)
    }

    private static func base(_ style: ProseStyle) -> [NSAttributedString.Key: Any] {
        Styled.attributes(style.role, color: style.ink, leading: style.leading, lineBreak: .byWordWrapping, textKit2: true)
    }

    /// A heading's face: the container's one size, or app.css's prose scale
    /// (h1 and h2 at the title size, the rest at the body's), at --weight-strong.
    private static func headingFont(_ level: Int, style: ProseStyle) -> UIFont {
        let title = style.viewport.map { TypeScale.typeTitle.points(viewport: $0) } ?? TypeScale.typeTitle.points
        let size = style.headingSize ?? (level <= 2 ? title : TypeScale.textBody)
        return style.role.font(size, weight: TypeScale.weightStrong)
    }

    private static func headingAttributes(_ level: Int, style: ProseStyle) -> [NSAttributedString.Key: Any] {
        let font = headingFont(level, style: style)
        // A container's one size sits on --leading-ui; prose's scale on its own.
        let leading = style.headingSize != nil || level >= 4 ? TypeScale.leadingUi : TypeScale.leadingTight
        var attributes = Styled.attributes(style.role, color: style.ink, size: font.pointSize, weight: TypeScale.weightStrong,
                                           leading: leading, lineBreak: .byWordWrapping, textKit2: true)
        if style.headingSize == nil, level <= 2 { attributes[.kern] = TypeScale.trackDisplay * font.pointSize }
        return attributes
    }

    private static func block(_ node: Markup, style: ProseStyle) -> MarkdownBlock {
        switch node {
        case let code as CodeBlock:
            var text = code.code
            if text.hasSuffix("\n") { text.removeLast() }
            return .code(language: code.language, text: text)
        case let table as Table:
            let head = Array(table.head.cells).map { cell in
                inline(cell, attributes: cellAttributes(style, head: true), style: style)
            }
            let rows = table.body.rows.map { row in
                Array(row.cells).map { inline($0, attributes: cellAttributes(style, head: false), style: style) }
            }
            return .table(head: head, rows: Array(rows))
        case let quote as BlockQuote:
            return .quote(quoted(quote, style: style))
        case is ThematicBreak:
            return .rule
        case let html as HTMLBlock:
            // The web's markdown renders no raw HTML: the block is its source as
            // a bare text node, white space collapsed as `white-space: normal` does.
            let text = html.rawHTML.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            return .text(NSAttributedString(string: text, attributes: base(style)))
        default:
            return .text(flow(node, style: style, depth: 0))
        }
    }

    /// prose-sm's `blockquote`: muted, italic, at --weight-strong, its first
    /// paragraph opening on “ and its last closing on ”, the paragraphs
    /// `paragraphGap` apart.
    private static func quoted(_ quote: BlockQuote, style: ProseStyle) -> NSAttributedString {
        var inner = style
        inner.ink = Palette.inkMuted
        let text = NSMutableAttributedString()
        for (i, child) in quote.children.enumerated() {
            if i > 0 { text.append(NSAttributedString(string: "\n", attributes: base(inner))) }
            let start = text.length
            text.append(flow(child, style: inner, depth: 0, italic: true))
            if i > 0 { open(text, at: start, by: style.paragraphGap) }
            let range = NSRange(location: start, length: text.length - start)
            text.enumerateAttribute(.font, in: range) { value, run, _ in
                guard let font = value as? UIFont, (text.attribute(.inlineCode, at: run.location, effectiveRange: nil)) == nil else { return }
                text.addAttributes(traits([.font: font], bold: true), range: run)
            }
        }
        guard text.length > 0 else { return text }
        let open = text.attributes(at: 0, effectiveRange: nil)
        let close = text.attributes(at: text.length - 1, effectiveRange: nil)
        text.insert(NSAttributedString(string: "\u{201C}", attributes: open.filter { $0.key != .inlineCode && $0.key != .inlineCodePad && $0.key != .link }), at: 0)
        text.append(NSAttributedString(string: "\u{201D}", attributes: close.filter { $0.key != .inlineCode && $0.key != .inlineCodePad && $0.key != .link }))
        return text
    }

    private static func cellAttributes(_ style: ProseStyle, head: Bool) -> [NSAttributedString.Key: Any] {
        // prose-sm's table: 0.857em of the body, line height 1.5; th at the strong weight.
        Styled.attributes(style.role, color: style.ink, size: TypeScale.textMeta, weight: head ? TypeScale.weightStrong : nil,
                          leading: TypeScale.leadingRoot, lineBreak: .byWordWrapping, textKit2: true)
    }

    /// A block of running text: a paragraph, a heading, a list.
    private static func flow(_ node: Markup, style: ProseStyle, depth: Int, italic: Bool = false) -> NSAttributedString {
        let out = NSMutableAttributedString()
        var attrs = base(style)
        if italic { attrs = traits(attrs, italic: true) }
        switch node {
        case let heading as Heading:
            var h = headingAttributes(heading.level, style: style)
            if italic { h = traits(h, italic: true) }
            out.append(inline(heading, attributes: h, style: style))
        case let paragraph as Paragraph:
            out.append(inline(paragraph, attributes: indented(attrs, depth: depth, style: style), style: style))
        case let list as UnorderedList:
            out.append(items(Array(list.listItems), ordered: nil, style: style, depth: depth, italic: italic))
        case let list as OrderedList:
            out.append(items(Array(list.listItems), ordered: Int(list.startIndex), style: style, depth: depth, italic: italic))
        case let code as CodeBlock:
            // A fence inside a list item: the mono face at the label size, in place.
            var mono = Styled.attributes(style.role, color: style.ink, size: TypeScale.textLabel, mono: true, lineBreak: .byCharWrapping, textKit2: true)
            mono = indented(mono, depth: depth, style: style)
            // A `pre`: it never takes the item's pretty wrap.
            mono[.wrapStyle] = LineWrap.Style.greedy.rawValue
            out.append(NSAttributedString(string: code.code.trimmingCharacters(in: .newlines), attributes: mono))
        default:
            for (i, child) in node.children.enumerated() {
                if i > 0 { out.append(NSAttributedString(string: "\n", attributes: attrs)) }
                out.append(flow(child, style: style, depth: depth, italic: italic))
            }
        }
        return out
    }

    /// How an item's marker hangs outside the item's box (WebKit RenderListMarker):
    /// a counter's text ends a space short of where the item starts (its
    /// suffix is ". "); a disc stands `ListDisc.outset` out.
    private enum Marker { case counter, disc }

    /// An item's text, `depth` lists in: each list's inset plus prose-sm's own
    /// inset of the item, and its marker's tab stop.
    private static func indented(_ attrs: [NSAttributedString.Key: Any], depth: Int, style: ProseStyle,
                                 marker: Marker? = nil) -> [NSAttributedString.Key: Any] {
        guard depth > 0 else { return attrs }
        var result = attrs
        let font = attrs[.font] as? UIFont ?? TypeScale.typeBody.font
        let paragraph = (attrs[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
        let step = style.listInset + Size.proseSmItemInset
        let text = step * Double(depth)
        let item = text - Size.proseSmItemInset
        paragraph.headIndent = text
        paragraph.firstLineHeadIndent = marker == nil ? text : text - step
        if let marker {
            // The marker's end, where a right tab seats it.
            let end = switch marker {
            case .counter: item - (" " as NSString).size(withAttributes: [.font: font]).width
            case .disc: item - ListDisc.outset(font) + ListDisc.diameter(font)
            }
            paragraph.tabStops = [NSTextTab(textAlignment: .right, location: end), NSTextTab(textAlignment: .left, location: text)]
        }
        result[.paragraphStyle] = paragraph
        return result
    }

    /// The marker's run: a counter's text, or a disc-wide stand-in the disc is filled over.
    private static func marker(_ ordered: Int?, attributes: [NSAttributedString.Key: Any]) -> NSAttributedString {
        let out = NSMutableAttributedString(string: "\t", attributes: attributes)
        if let ordered {
            var counter = attributes
            counter[.foregroundColor] = Palette.mutedForeground
            out.append(NSAttributedString(string: "\(ordered).", attributes: counter))
        } else {
            let font = attributes[.font] as? UIFont ?? TypeScale.typeBody.font
            var disc = attributes
            disc[.listDisc] = Palette.proseBullet
            disc[.kern] = ListDisc.diameter(font) - (" " as NSString).size(withAttributes: [.font: font]).width
            out.append(NSAttributedString(string: " ", attributes: disc))
        }
        out.append(NSAttributedString(string: "\t", attributes: attributes))
        return out
    }

    /// A list's items, one paragraph each (and one per further paragraph an
    /// item holds), each opening its gap below the one before: --space-1
    /// between items, the container's gaps around a nested list and between
    /// an item's paragraphs.
    private static func items(_ items: [ListItem], ordered start: Int?, style: ProseStyle, depth: Int, italic: Bool) -> NSAttributedString {
        let out = NSMutableAttributedString()
        let level = depth + 1
        var afterNested = false
        for (i, item) in items.enumerated() {
            var line = indented(base(style), depth: level, style: style, marker: start == nil ? .disc : .counter)
            var more = indented(base(style), depth: level, style: style)
            if italic { line = traits(line, italic: true); more = traits(more, italic: true) }
            // A nested list's first item: the item holding it already broke the line.
            if i > 0 { out.append(NSAttributedString(string: "\n", attributes: line)) }
            let opens = out.length
            out.append(marker(start.map { $0 + i }, attributes: line))
            if i > 0 {
                open(out, at: opens, by: afterNested ? max(Space.space1, style.nestedListAfter) : Space.space1)
            } else if depth > 0 {
                open(out, at: opens, by: style.nestedListGap)
            }
            var previous: Markup?
            for child in item.children {
                if previous != nil { out.append(NSAttributedString(string: "\n", attributes: line)) }
                let at = out.length
                if child is Paragraph {
                    out.append(inline(child, attributes: previous == nil ? line : more, style: style))
                    if previous is Paragraph { open(out, at: at, by: style.itemParagraphGap) }
                } else {
                    out.append(flow(child, style: style, depth: level, italic: italic))
                    if previous != nil, !(child is UnorderedList || child is OrderedList) { open(out, at: at, by: style.itemParagraphGap) }
                }
                previous = child
            }
            afterNested = previous is UnorderedList || previous is OrderedList
        }
        return out
    }

    /// The paragraph starting at `location` opens `gap` below the one before:
    /// spacing before it, set on every character of it, since a paragraph
    /// takes the style of its first character (NSTextStorage
    /// `fixParagraphStyleAttribute`), never the line feed that ends the last.
    private static func open(_ text: NSMutableAttributedString, at location: Int, by gap: Double) {
        guard location < text.length, gap > 0 else { return }
        let range = (text.string as NSString).paragraphRange(for: NSRange(location: location, length: 0))
        text.enumerateAttribute(.paragraphStyle, in: range) { value, run, _ in
            let paragraph = (value as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
            paragraph.paragraphSpacingBefore = gap
            text.addAttribute(.paragraphStyle, value: paragraph, range: run)
        }
    }

    static func traits(_ attributes: [NSAttributedString.Key: Any], bold: Bool = false, italic: Bool = false) -> [NSAttributedString.Key: Any] {
        var result = attributes
        guard let font = attributes[.font] as? UIFont else { return result }
        if bold {
            // Weight above 500 is banned: strong reads at --weight-strong.
            let descriptor = font.fontDescriptor.addingAttributes([
                UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [0x7767_6874: 500],
            ])
            result[.font] = UIFont(descriptor: descriptor, size: font.pointSize)
        }
        if italic {
            // Figtree ships no italic: the browser's synthesized oblique.
            let slant = CGAffineTransform(a: 1, b: 0, c: tan(14 * .pi / 180), d: 1, tx: 0, ty: 0)
            let current = result[.font] as? UIFont ?? font
            result[.font] = UIFont(descriptor: current.fontDescriptor.addingAttributes([.matrix: NSValue(cgAffineTransform: slant)]),
                                   size: current.pointSize)
        }
        return result
    }

    /// GFM's autolink extension (the web's marked): a bare `http(s)://` or
    /// `www.` address is a link, its trailing punctuation left outside it.
    private static func autolinked(_ text: String, _ attributes: [NSAttributedString.Key: Any]) -> NSAttributedString {
        let out = NSMutableAttributedString(string: text, attributes: attributes)
        guard attributes[.link] == nil, text.contains("http") || text.contains("www.") else { return out }
        let ns = text as NSString
        for match in text.matches(of: /(?:https?:\/\/|www\.)[^\s<]+/) {
            var range = NSRange(match.range, in: text)
            while range.length > 0, ".,:;!?\"')*_~".contains(Character(ns.substring(with: NSRange(location: NSMaxRange(range) - 1, length: 1)))) {
                range.length -= 1
            }
            let target = ns.substring(with: range)
            guard let url = URL(string: target.hasPrefix("www.") ? "http://\(target)" : target) else { continue }
            out.addAttributes([.link: url, .foregroundColor: Palette.linkInk, .underlineStyle: NSUnderlineStyle.single.rawValue], range: range)
        }
        return out
    }

    static func inline(_ node: Markup, attributes: [NSAttributedString.Key: Any], style: ProseStyle) -> NSAttributedString {
        let out = NSMutableAttributedString()
        func walk(_ node: Markup, _ attributes: [NSAttributedString.Key: Any]) {
            for child in node.children {
                switch child {
                case let text as Markdown.Text: out.append(autolinked(text.string, attributes))
                case is Strong:
                    var strong = traits(attributes, bold: true)
                    if let ink = style.strongInk { strong[.foregroundColor] = ink }
                    walk(child, strong)
                case is Emphasis: walk(child, traits(attributes, italic: true))
                case is Strikethrough:
                    var struck = attributes; struck[.strikethroughStyle] = NSUnderlineStyle.single.rawValue; walk(child, struck)
                case let code as InlineCode:
                    // `code`: the mono face at the label size, regular, on its surface.
                    var mono = attributes
                    mono[.font] = TypeScale.typeCode.font(style.codeSize, weight: TypeScale.weightBody)
                    mono[.inlineCode] = style.codeSurface
                    mono[.inlineCodePad] = style.codePad
                    // Its 4pt inline padding, as room either side of the run.
                    if out.length > 0 {
                        let before = out.length - 1
                        let kern = out.attribute(.kern, at: before, effectiveRange: nil) as? Double ?? 0
                        out.addAttribute(.kern, value: kern + Space.space1, range: NSRange(location: before, length: 1))
                    }
                    let start = out.length
                    let ticks = style.codeTicks ? "`" : ""
                    out.append(NSAttributedString(string: ticks + code.code + ticks, attributes: mono))
                    if out.length > start {
                        out.addAttribute(.kern, value: Space.space1, range: NSRange(location: out.length - 1, length: 1))
                    }
                case let link as Markdown.Link:
                    var linked = attributes
                    linked[.foregroundColor] = Palette.linkInk
                    linked[.underlineStyle] = NSUnderlineStyle.single.rawValue
                    if let target = link.destination, let url = URL(string: target) { linked[.link] = url }
                    walk(child, linked)
                case is SoftBreak: out.append(NSAttributedString(string: " ", attributes: attributes))
                case is LineBreak: out.append(NSAttributedString(string: "\u{2028}", attributes: attributes))
                case let image as Markdown.Image: out.append(NSAttributedString(string: image.plainText, attributes: attributes))
                case let html as InlineHTML:
                    // The web's markdown (svelte-streamdown) renders no raw HTML: a tag, a
                    // comment, an unknown element is its source as text. The one tag its
                    // lexer reads is `<br>` (marked-br: `/^<br\s*\/?>/i`), a line break.
                    let isBreak = html.rawHTML.wholeMatch(of: /<br\s*\/?>/.ignoresCase()) != nil
                    out.append(NSAttributedString(string: isBreak ? "\u{2028}" : html.rawHTML, attributes: attributes))
                default: walk(child, attributes)
                }
            }
        }
        walk(node, attributes)
        return out
    }
}

/// Code colour, as OutputBlock paints it: Vitesse light and dark (shiki's
/// `vitesse-light` / `vitesse-dark`, @shikijs/themes 4.5.0), here on
/// highlight.js's grammars: the copy Highlightr 2.3.0 bundles, run here in a
/// context of our own so each `hljs-*` class takes its Vitesse ink directly
/// (Highlightr's own themes are its bundled CSS only). One context, shared.
@MainActor
enum Highlight {
    private static let hljs: JSValue? = {
        guard let context = JSContext(),
              let bundle = Bundle.main.url(forResource: "Highlightr_Highlightr", withExtension: "bundle").flatMap(Bundle.init(url:))
              ?? Bundle.allBundles.first(where: { $0.path(forResource: "highlight.min", ofType: "js") != nil }),
              let path = bundle.path(forResource: "highlight.min", ofType: "js"),
              let script = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
        context.setObject(JSValue(newObjectIn: context), forKeyedSubscript: "window" as NSString)
        context.evaluateScript(script)
        let hljs = context.objectForKeyedSubscript("hljs")
        return hljs?.isUndefined == false ? hljs : nil
    }()

    private static var cache: [String: [(NSRange, String)]] = [:]

    /// Vitesse's inks by role: light, dark (shiki vitesse-light / vitesse-dark).
    private static let inks: [String: (String, String)] = [
        "comment": ("#a0ada0", "#758575dd"), "keyword": ("#1e754f", "#4d9375"), "storage": ("#ab5959", "#cb7676"),
        "string": ("#b56959", "#c98a7d"), "number": ("#2f798a", "#4C9A91"), "function": ("#59873a", "#80a665"),
        "variable": ("#b07d48", "#bd976a"), "type": ("#2e8f82", "#5DA994"), "constant": ("#a65e2b", "#c99076"),
        "punctuation": ("#999999", "#666666"), "property": ("#998418", "#b8a965"), "regexp": ("#ab5e3f", "#c4704f"),
        "inserted": ("#22863a", "#85e89d"), "deleted": ("#b31d28", "#fdaeb7"), "namespace": ("#b05a78", "#db889a"),
    ]

    /// A highlight.js class's Vitesse role, as the TextMate scopes it stands for are inked.
    private static func role(_ name: String) -> String? {
        switch name {
        case "comment", "quote": "comment"
        case "keyword", "selector-tag", "literal", "tag", "name": "keyword"
        case "built_in", "operator": "storage"
        case "string", "doctag", "template-tag": "string"
        case "number": "number"
        case "title", "section", "title.function_", "title.function": "function"
        case "variable", "template-variable", "params", "attr", "attribute": "variable"
        case "type", "class", "title.class_", "title.class": "type"
        case "symbol", "bullet", "meta", "link": "constant"
        case "punctuation": "punctuation"
        case "property": "property"
        case "regexp": "regexp"
        case "addition": "inserted"
        case "deletion": "deleted"
        case "selector-id", "selector-class": "namespace"
        default: nil
        }
    }

    private static func color(_ hex: String) -> UIColor {
        var value: UInt64 = 0
        Scanner(string: String(hex.dropFirst())).scanHexInt64(&value)
        let rgba = hex.count == 9 ? value : value << 8 | 0xFF
        return UIColor(red: Double(rgba >> 24 & 0xFF) / 255, green: Double(rgba >> 16 & 0xFF) / 255,
                       blue: Double(rgba >> 8 & 0xFF) / 255, alpha: Double(rgba & 0xFF) / 255)
    }

    /// highlight.js's HTML read back into runs of its innermost class.
    private static func runs(_ html: String) -> (text: String, runs: [(NSRange, String)]) {
        var text = ""
        var length = 0
        var stack: [String] = []
        var out: [(NSRange, String)] = []
        var i = html.startIndex
        func emit(_ piece: String) {
            let count = (piece as NSString).length
            if let top = stack.last, count > 0 { out.append((NSRange(location: length, length: count), top)) }
            text += piece
            length += count
        }
        while i < html.endIndex {
            if html[i] == "<" {
                guard let close = html[i...].firstIndex(of: ">") else { break }
                let tag = html[html.index(after: i) ..< close]
                if tag.hasPrefix("/") { _ = stack.popLast() }
                else if let quote = tag.range(of: "class=\"") {
                    let rest = tag[quote.upperBound...]
                    let names = rest.prefix { $0 != "\"" }.split(separator: " ").map { String($0).replacingOccurrences(of: "hljs-", with: "") }
                    stack.append(names.joined(separator: "."))
                } else { stack.append(stack.last ?? "") }
                i = html.index(after: close)
            } else if html[i] == "&", let semi = html[i...].prefix(10).firstIndex(of: ";") {
                let entity = String(html[html.index(after: i) ..< semi])
                let decoded: String = switch entity {
                case "lt": "<"
                case "gt": ">"
                case "amp": "&"
                case "quot": "\""
                case "#x27", "#39", "apos": "'"
                default: entity.hasPrefix("#x") ? String(UnicodeScalar(UInt32(entity.dropFirst(2), radix: 16) ?? 63).map(Character.init) ?? "?")
                    : entity.hasPrefix("#") ? String(UnicodeScalar(UInt32(entity.dropFirst()) ?? 63).map(Character.init) ?? "?") : "&\(entity);"
                }
                emit(decoded)
                i = html.index(after: semi)
            } else {
                let next = html[i...].firstIndex { $0 == "<" || $0 == "&" } ?? html.endIndex
                emit(String(html[i ..< (next == i ? html.index(after: i) : next)]))
                i = next == i ? html.index(after: i) : next
            }
        }
        return (text, out)
    }

    /// The grammars the dashboard loads (agent-code.ts `agentCodeLanguage`).
    private static func grammar(_ language: String?) -> String? {
        switch language?.lowercased() {
        case "bash", "sh", "shell", "zsh", "console": "bash"
        case "diff", "patch": "diff"
        case "json", "jsonc": "json"
        case "python", "py": "python"
        case "svelte", "html", "xml": "xml"
        case "tsx", "jsx": "typescript"
        case "ts", "typescript", "js", "javascript", "mjs": "typescript"
        default: nil
        }
    }

    /// The text in its colours under `dark`, or nil where no grammar is
    /// carried (a plain mono well, as OutputBlock falls back to).
    static func colors(_ text: String, language: String?, dark isDark: Bool) -> [(NSRange, UIColor)]? {
        guard let grammar = grammar(language), let hljs else { return nil }
        let key = "\(grammar) \(text)"
        let classed: [(NSRange, String)]
        if let held = cache[key] {
            classed = held
        } else {
            guard let result = hljs.invokeMethod("highlight", withArguments: [grammar, text, true]),
                  !result.isUndefined, let html = result.objectForKeyedSubscript("value")?.toString() else { return nil }
            let read = runs(html)
            guard read.text == text else { return nil }
            if cache.count > 256 { cache = [:] }
            cache[key] = read.runs
            classed = read.runs
        }
        return classed.compactMap { range, name in
            let parts = name.split(separator: ".").map(String.init)
            guard let role = role(name) ?? parts.lazy.compactMap({ role($0) }).first, let ink = inks[role] else { return nil }
            return (range, color(isDark ? ink.1 : ink.0))
        }
    }

    /// The well's plain ink: Vitesse's foreground.
    static func foreground(dark: Bool) -> UIColor {
        dark ? UIColor(red: 0xDB / 255, green: 0xD7 / 255, blue: 0xCA / 255, alpha: 0xEE / 255)
            : UIColor(red: 0x39 / 255, green: 0x3A / 255, blue: 0x34 / 255, alpha: 1)
    }
}
