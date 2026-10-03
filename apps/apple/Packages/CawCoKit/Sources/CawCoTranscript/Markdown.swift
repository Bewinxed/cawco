import CawCoDesign
import Highlightr
import JavaScriptCore
import Markdown
import UIKit

extension NSAttributedString.Key {
    /// An inline code span: ProseView paints its surface behind the run.
    nonisolated static let inlineCode = NSAttributedString.Key("dev.cawco.inlineCode")
}

/// One block of a message as MessageBody.svelte draws it: running text, a
/// fenced block in its code well (OutputBlock), a table, a quote, a rule.
struct MarkdownBlock {
    enum Kind {
        case text(NSAttributedString)
        case code(language: String?, text: String)
        case table(head: [NSAttributedString], rows: [[NSAttributedString]])
        case quote(NSAttributedString)
        case rule
    }

    let kind: Kind
    var heading = false
    /// The gap the body sets between blocks, and above a heading that is not first.
    var gap = Space.space3
    var headingGap = Space.space5

    static func text(_ text: NSAttributedString) -> MarkdownBlock { MarkdownBlock(kind: .text(text)) }
    static func code(language: String?, text: String) -> MarkdownBlock { MarkdownBlock(kind: .code(language: language, text: text)) }
    static func table(head: [NSAttributedString], rows: [[NSAttributedString]]) -> MarkdownBlock { MarkdownBlock(kind: .table(head: head, rows: rows)) }
    static func quote(_ text: NSAttributedString) -> MarkdownBlock { MarkdownBlock(kind: .quote(text)) }
    static let rule = MarkdownBlock(kind: .rule)

    /// Its margin above (`.prose > *` --space-3; a heading not first, --space-5).
    var top: Double { heading ? headingGap : gap }
    /// Its margin below, collapsing with the next block's top (a fence's my-3).
    var bottom: Double {
        if case .code = kind { return Size.txCodeMargin }
        return 0
    }
}

/// How a body is set: in the reader's well code spans lift to the raised
/// surface; reasoning steps read muted.
struct ProseStyle {
    var ink: UIColor = Palette.inkStrong
    var codeSurface: UIColor = Palette.surfaceRecess
    var role: TypeRole = TypeScale.typeBody
    /// MessageBody: --space-3 between blocks, --space-5 over a heading, headings at the body size.
    var gap = Space.space3
    var headingGap = Space.space5
    var headingSize = TypeScale.textBody
    /// Strong text's ink, where a body sets one (a reasoning step's).
    var strongInk: UIColor?
    /// Inline code's size: MessageBody's label step, or prose's meta step.
    var codeSize = TypeScale.textLabel
    /// The prose plugin wraps inline code in literal backticks (`code::before/after`);
    /// a reasoning step and a tool's markdown take them off.
    var codeTicks = true

    static let body = ProseStyle()
    /// A reasoning step (thinking-step.svelte): muted, --space-1 apart, strong
    /// in the strong ink, code at the meta step on the muted surface.
    static let step = ProseStyle(ink: Palette.inkMuted, codeSurface: Palette.muted, gap: Space.space1, headingGap: Space.space1,
                                 strongInk: Palette.inkStrong, codeSize: TypeScale.textMeta, codeTicks: false)
    static let well = ProseStyle(codeSurface: Palette.surfaceRaised)
    static let muted = ProseStyle(ink: Palette.inkMuted)
    /// ToolProse: a tool's markdown, --space-2 apart, headings at the label size.
    static let tool = ProseStyle(gap: Space.space2, headingGap: Space.space4, headingSize: TypeScale.textLabel, codeTicks: false)
}

enum MarkdownRender {
    /// The blocks of a source, top level first to last.
    static func blocks(_ source: String, style: ProseStyle = .body) -> [MarkdownBlock] {
        var out: [MarkdownBlock] = []
        // The web's markdown keeps quotes and dashes as typed: no smart punctuation.
        for node in Document(parsing: source, options: [.disableSmartOpts]).children {
            for var each in block(node, style: style) {
                each.gap = style.gap
                each.headingGap = style.headingGap
                out.append(each)
            }
        }
        return out
    }

    /// A settled source cut at its top-level blocks.
    static func topLevel(_ source: String) -> [String] {
        let children = Array(Document(parsing: source).children)
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
        Styled.attributes(style.role, color: style.ink, lineBreak: .byWordWrapping, textKit2: true)
    }

    private static func block(_ node: Markup, style: ProseStyle) -> [MarkdownBlock] {
        switch node {
        case let code as CodeBlock:
            var text = code.code
            if text.hasSuffix("\n") { text.removeLast() }
            return [.code(language: code.language, text: text)]
        case let table as Table:
            let head = Array(table.head.cells).map { cell in
                inline(cell, attributes: cellAttributes(style, head: true), style: style)
            }
            let rows = table.body.rows.map { row in
                Array(row.cells).map { inline($0, attributes: cellAttributes(style, head: false), style: style) }
            }
            return [.table(head: head, rows: Array(rows))]
        case let quote as BlockQuote:
            var quoted = style
            quoted.ink = Palette.inkMuted
            let text = NSMutableAttributedString()
            for (i, child) in quote.children.enumerated() {
                if i > 0 { text.append(NSAttributedString(string: "\n", attributes: base(quoted))) }
                text.append(flow(child, style: quoted, depth: 0, italic: true))
            }
            return [.quote(text)]
        case is ThematicBreak:
            return [.rule]
        case is Heading:
            var block = MarkdownBlock.text(flow(node, style: style, depth: 0))
            block.heading = true
            return [block]
        default:
            return [.text(flow(node, style: style, depth: 0))]
        }
    }

    private static func cellAttributes(_ style: ProseStyle, head: Bool) -> [NSAttributedString.Key: Any] {
        // prose-sm's table: 0.857em of the body, line height 1.5; th at the strong weight.
        Styled.attributes(style.role, color: style.ink, size: TypeScale.textMeta, weight: head ? TypeScale.weightStrong : nil,
                          leading: TypeScale.leadingRoot, lineBreak: .byWordWrapping)
    }

    /// A block of running text: a paragraph, a heading, a list.
    private static func flow(_ node: Markup, style: ProseStyle, depth: Int, italic: Bool = false) -> NSAttributedString {
        let out = NSMutableAttributedString()
        var attrs = base(style)
        if italic { attrs = traits(attrs, italic: true) }
        switch node {
        case let heading as Heading:
            // MessageBody: a reply's headings are emphasis, at the body size.
            var h = Styled.attributes(style.role, color: style.ink, size: style.headingSize, weight: TypeScale.weightStrong,
                                      leading: TypeScale.leadingUi, lineBreak: .byWordWrapping, textKit2: true)
            if italic { h = traits(h, italic: true) }
            out.append(inline(heading, attributes: h, style: style))
        case let paragraph as Paragraph:
            out.append(inline(paragraph, attributes: indented(attrs, depth: depth), style: style))
        case let list as UnorderedList:
            out.append(items(Array(list.listItems), ordered: nil, style: style, depth: depth, italic: italic))
        case let list as OrderedList:
            out.append(items(Array(list.listItems), ordered: Int(list.startIndex), style: style, depth: depth, italic: italic))
        case let code as CodeBlock:
            // A fence inside a list item: the mono face at the label size, in place.
            var mono = Styled.attributes(style.role, color: style.ink, size: TypeScale.textLabel, mono: true, lineBreak: .byCharWrapping, textKit2: true)
            mono = indented(mono, depth: depth)
            out.append(NSAttributedString(string: code.code.trimmingCharacters(in: .newlines), attributes: mono))
        default:
            for (i, child) in node.children.enumerated() {
                if i > 0 { out.append(NSAttributedString(string: "\n", attributes: attrs)) }
                out.append(flow(child, style: style, depth: depth, italic: italic))
            }
        }
        return out
    }

    /// The list's own inset (`padding-inline-start: --space-5`) and an item's (prose-sm 0.43em).
    private static func itemIndent(_ font: UIFont) -> Double { (font.pointSize * 3 / 7).rounded() }

    private static func indented(_ attrs: [NSAttributedString.Key: Any], depth: Int, marker: Bool = false) -> [NSAttributedString.Key: Any] {
        guard depth > 0 else { return attrs }
        var result = attrs
        let font = attrs[.font] as? UIFont ?? TypeScale.typeBody.font
        let paragraph = (attrs[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
        let step = Space.space5 + itemIndent(font)
        let text = step * Double(depth)
        paragraph.headIndent = text
        paragraph.firstLineHeadIndent = marker ? text - step : text
        if marker {
            let space = (" " as NSString).size(withAttributes: [.font: font]).width
            paragraph.tabStops = [NSTextTab(textAlignment: .right, location: text - space), NSTextTab(textAlignment: .left, location: text)]
        }
        result[.paragraphStyle] = paragraph
        return result
    }

    private static func items(_ items: [ListItem], ordered start: Int?, style: ProseStyle, depth: Int, italic: Bool) -> NSAttributedString {
        let out = NSMutableAttributedString()
        let level = depth + 1
        for (i, item) in items.enumerated() {
            var line = indented(base(style), depth: level, marker: true)
            if italic { line = traits(line, italic: true) }
            if i > 0 || depth > 0 {
                // An item after the first: --space-1 above it.
                out.append(NSAttributedString(string: "\n", attributes: spaced(line)))
            }
            var marker = line
            marker[.foregroundColor] = start == nil ? Palette.proseBullet : Palette.mutedForeground
            out.append(NSAttributedString(string: start.map { "\t\($0 + i).\t" } ?? "\t•\t", attributes: marker))
            for (j, child) in item.children.enumerated() {
                if j > 0 { out.append(NSAttributedString(string: "\n", attributes: spaced(line))) }
                if child is Paragraph {
                    out.append(inline(child, attributes: line, style: style))
                } else {
                    out.append(flow(child, style: style, depth: level, italic: italic))
                }
            }
        }
        return out
    }

    /// A line feed whose paragraph opens --space-1 below the one before.
    private static func spaced(_ attrs: [NSAttributedString.Key: Any]) -> [NSAttributedString.Key: Any] {
        var result = attrs
        let paragraph = (attrs[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
        paragraph.paragraphSpacing = Space.space1
        result[.paragraphStyle] = paragraph
        return result
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
                case let html as InlineHTML: out.append(NSAttributedString(string: html.rawHTML, attributes: attributes))
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
