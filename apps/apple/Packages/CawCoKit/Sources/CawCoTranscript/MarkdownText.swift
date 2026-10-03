import CawCoDesign
import Highlightr
import Markdown
import UIKit

/// Candidate 3 from the device bake-off: parse only the open Markdown block,
/// freeze earlier blocks, and chunk open fences every twenty completed lines.
struct MarkdownSplitter {
    private var offset = 0
    private var header = ""

    mutating func split(_ text: String) -> (settled: [String], tail: String) {
        let bytes = Array(text.utf8)
        if offset > bytes.count { self = MarkdownSplitter() }
        let headerBytes = Array(header.utf8)
        var tail = header + String(decoding: bytes[offset...], as: UTF8.self)
        let children = Array(Document(parsing: tail).children)
        var frozen: [String] = []
        if children.count > 1 {
            let raw = Array(tail.utf8)
            var lines = [0]
            for (i, byte) in raw.enumerated() where byte == 10 { lines.append(i + 1) }
            let starts = children.map { child -> Int in
                guard let at = child.range?.lowerBound else { return 0 }
                return lines[at.line - 1] + at.column - 1
            }
            for i in 0 ..< starts.count - 1 {
                frozen.append(String(decoding: raw[starts[i] ..< starts[i + 1]], as: UTF8.self))
            }
            offset += starts.last! - headerBytes.count
            tail = String(decoding: raw[starts.last!...], as: UTF8.self)
            header = ""
        }
        if children.last is CodeBlock {
            var lines = tail.components(separatedBy: "\n")
            let opening = lines.first ?? ""
            let marker = String(opening.trimmingCharacters(in: .whitespaces).prefix { $0 == "`" || $0 == "~" })
            if marker.count >= 3 {
                while lines.count > 21, !lines[1...20].contains(where: { $0.trimmingCharacters(in: .whitespaces).hasPrefix(marker) }) {
                    let body = lines[1...20].joined(separator: "\n") + "\n"
                    frozen.append(opening + "\n" + body + marker)
                    offset += body.utf8.count + (header.isEmpty ? opening.utf8.count + 1 : 0)
                    header = opening + "\n"
                    lines.removeSubrange(1...20)
                }
                tail = lines.joined(separator: "\n")
            }
        }
        return (frozen, tail)
    }
}

/// Carried from the decided bake-off: unclosed syntax at the streaming edge
/// never appears as literal Markdown. Fenced code is left untouched.
enum PartialSyntax {
    static func hide(_ source: String) -> String {
        var lines = source.components(separatedBy: "\n")
        let fence = lines.first?.trimmingCharacters(in: .whitespaces) ?? ""
        if fence.hasPrefix("```") || fence.hasPrefix("~~~") { return source }
        if let last = lines.last, last.trimmingCharacters(in: .whitespaces).range(of: #"^(#{1,6}|`{1,2}|~{1,2})$"#, options: .regularExpression) != nil { lines.removeLast() }
        if lines.last?.trimmingCharacters(in: .whitespaces).hasPrefix("|") == true {
            var start = lines.count - 1
            while start > 0, lines[start - 1].trimmingCharacters(in: .whitespaces).hasPrefix("|") { start -= 1 }
            if !lines[start...].contains(where: { $0.range(of: #"^\s*\|?\s*:?-{3,}"#, options: .regularExpression) != nil }) { lines.removeSubrange(start...) }
        }
        var text = lines.joined(separator: "\n")
        let start = text.range(of: "\n\n", options: .backwards)?.upperBound ?? text.startIndex
        var paragraph = String(text[start...])
        let ticks = paragraph.ranges(of: /`+/)
        if ticks.count % 2 == 1, let last = ticks.last { paragraph.removeSubrange(last) }
        let masked = paragraph.replacing(/`[^`]*`/) { String(repeating: "x", count: $0.output.count) }
        let bold = masked.ranges(of: "**")
        if bold.count % 2 == 1, let last = bold.last {
            let offset = masked.distance(from: masked.startIndex, to: last.lowerBound)
            let at = paragraph.index(paragraph.startIndex, offsetBy: offset)
            paragraph.removeSubrange(at ..< paragraph.index(at, offsetBy: 2))
        }
        let chars = Array(paragraph)
        let outside = Array(paragraph.replacing(/`[^`]*`/) { String(repeating: "x", count: $0.output.count) })
        if let open = outside.lastIndex(of: "[") {
            if let close = outside[(open + 1)...].firstIndex(of: "]") {
                let rest = outside[(close + 1)...]
                if rest.first == "(", !rest.contains(")") { paragraph = String(chars[..<open] + chars[(open + 1)..<close]) }
            } else { paragraph = String(chars[..<open] + chars[(open + 1)...]) }
        }
        text.replaceSubrange(start..., with: paragraph)
        return text
    }
}

enum MarkdownText {
    static func render(_ source: String, dark: Bool, highlight: Bool) -> NSAttributedString {
        let out = NSMutableAttributedString(string: "")
        let body = TypeScale.typeProse.font
        let mono = UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont.monospacedSystemFont(ofSize: TypeScale.typeCode.points, weight: .regular))
        let style = NSMutableParagraphStyle()
        style.lineSpacing = max(0, TypeScale.typeProse.lineHeight - body.lineHeight)
        style.paragraphSpacing = Space.space2
        let base: [NSAttributedString.Key: Any] = [.font: body, .foregroundColor: Palette.inkStrong, .paragraphStyle: style]
        func traits(_ attributes: [NSAttributedString.Key: Any], _ adding: UIFontDescriptor.SymbolicTraits) -> [NSAttributedString.Key: Any] {
            var result = attributes
            let font = attributes[.font] as? UIFont ?? body
            if let descriptor = font.fontDescriptor.withSymbolicTraits(font.fontDescriptor.symbolicTraits.union(adding)) { result[.font] = UIFont(descriptor: descriptor, size: font.pointSize) }
            return result
        }
        func inlines(_ node: Markup, _ attributes: [NSAttributedString.Key: Any]) {
            for child in node.children {
                switch child {
                case let text as Text: out.append(NSAttributedString(string: text.string, attributes: attributes))
                case is Strong: inlines(child, traits(attributes, .traitBold))
                case is Emphasis: inlines(child, traits(attributes, .traitItalic))
                case is Strikethrough:
                    var struck = attributes; struck[.strikethroughStyle] = 1; inlines(child, struck)
                case let code as InlineCode:
                    var codeStyle = attributes; codeStyle[.font] = mono; codeStyle[.backgroundColor] = Palette.surfaceRecess
                    out.append(NSAttributedString(string: code.code, attributes: codeStyle))
                case let link as Link:
                    var linked = attributes
                    if let target = link.destination, let url = URL(string: target) { linked[.link] = url }
                    inlines(child, linked)
                case is SoftBreak: out.append(NSAttributedString(string: " ", attributes: attributes))
                case is LineBreak: out.append(NSAttributedString(string: "\n", attributes: attributes))
                case let image as Image: out.append(NSAttributedString(string: image.plainText, attributes: attributes))
                default: inlines(child, attributes)
                }
            }
        }
        func block(_ node: Markup, indent: Double = 0) {
            switch node {
            case let heading as Heading:
                inlines(heading, TypeScale.typeTitle.attributes(color: Palette.inkStrong))
            case let paragraph as Paragraph: inlines(paragraph, base)
            case let code as CodeBlock:
                var attrs = base; attrs[.font] = mono; attrs[.backgroundColor] = Palette.surfaceRecess
                let value = NSMutableAttributedString(string: code.code.trimmingCharacters(in: .newlines), attributes: attrs)
                if highlight, let highlighter = Highlightr() {
                    highlighter.setTheme(to: dark ? "atom-one-dark" : "github")
                    if let lit = highlighter.highlight(value.string, as: code.language), lit.string == value.string {
                        lit.enumerateAttribute(.foregroundColor, in: NSRange(location: 0, length: lit.length)) { color, range, _ in
                            if let color { value.addAttribute(.foregroundColor, value: color, range: range) }
                        }
                    }
                }
                out.append(value)
            case let list as UnorderedList:
                for (i, item) in list.listItems.enumerated() {
                    if i > 0 { out.append(NSAttributedString(string: "\n")) }
                    out.append(NSAttributedString(string: String(repeating: "  ", count: Int(indent)) + "• ", attributes: base))
                    for child in item.children { block(child, indent: indent + 1) }
                }
            case let list as OrderedList:
                for (i, item) in list.listItems.enumerated() {
                    if i > 0 { out.append(NSAttributedString(string: "\n")) }
                    out.append(NSAttributedString(string: "\(Int(list.startIndex) + i). ", attributes: base))
                    for child in item.children { block(child, indent: indent + 1) }
                }
            case let table as Table:
                func row(_ cells: [Table.Cell], head: Bool) {
                    for (i, cell) in cells.enumerated() {
                        if i > 0 { out.append(NSAttributedString(string: "  │  ", attributes: base)) }
                        inlines(cell, head ? traits(base, .traitBold) : base)
                    }
                }
                row(Array(table.head.cells), head: true)
                for line in table.body.rows { out.append(NSAttributedString(string: "\n")); row(Array(line.cells), head: false) }
            case is ThematicBreak: out.append(NSAttributedString(string: "────────", attributes: base))
            default:
                for (i, child) in node.children.enumerated() {
                    if i > 0 { out.append(NSAttributedString(string: "\n")) }
                    block(child, indent: indent)
                }
            }
        }
        for (i, node) in Document(parsing: source).children.enumerated() {
            if i > 0 { out.append(NSAttributedString(string: "\n")) }
            block(node)
        }
        return out
    }
}
