import Foundation
import Markdown

/// Markdown as the flat text it reads as (plain-markdown.ts): what a peek
/// shows of an agent's reply. Parsed by the parser the transcript renders
/// with, then written back out with every piece of syntax gone: emphasis as
/// its words, a heading as its text, a list item as "• text" on its own
/// line, a link as its text, inline code without its backticks, a fence as
/// its code, an image as its alt text, a table row as its cells joined by
/// two spaces. Blocks stay a blank line apart, as they were written.
public enum PlainMarkdown {
    /// A finished reply, flat.
    public static func flat(_ source: String) -> String {
        blocks(Document(parsing: source).children, depth: 0).joined(separator: "\n\n")
    }

    /// A reply still streaming, flat. Drawn up to its last whole word, so a
    /// marker or a link still arriving ("**bo", "[lin") is held back with the
    /// word it is part of; what the drawn words leave open is closed
    /// ("**bold text" reads as "bold text" until its closer lands).
    public static func streaming(_ source: String) -> String {
        var drawn = Substring(source)
        while let last = drawn.last, !last.isWhitespace { drawn.removeLast() }
        return flat(closed(drawn.trimmingCharacters(in: .whitespacesAndNewlines)))
    }

    /// The emphasis, code and fence the words so far have opened, closed.
    private static func closed(_ text: String) -> String {
        var out = text
        let fences = text.components(separatedBy: "```").count - 1
        if fences % 2 == 1 { return out + "\n```" }
        let unfenced = text.replacingOccurrences(of: "```", with: "")
        if (unfenced.components(separatedBy: "`").count - 1) % 2 == 1 { out += "`" }
        let strong = unfenced.components(separatedBy: "**").count - 1
        if strong % 2 == 1 { out += "**" }
        let stars = unfenced.replacingOccurrences(of: "**", with: "").filter { $0 == "*" }.count
        // A list's own marker is a star too: only one inside a line's words opens emphasis.
        let bullets = unfenced.split(separator: "\n").filter { $0.drop(while: \.isWhitespace).hasPrefix("* ") }.count
        if (stars - bullets) % 2 == 1 { out += "*" }
        return out
    }

    private static func inline(_ nodes: some Sequence<any Markup>) -> String {
        var out = ""
        for node in nodes {
            switch node {
            case let text as Markdown.Text: out += text.string
            case is LineBreak, is SoftBreak: out += "\n"
            case let code as InlineCode: out += code.code
            case let image as Markdown.Image: out += image.plainText
            case let html as InlineHTML: out += html.rawHTML
            default: out += inline(node.children)
            }
        }
        return out
    }

    private static func blocks(_ nodes: some Sequence<any Markup>, depth: Int) -> [String] {
        var out: [String] = []
        for node in nodes {
            switch node {
            case is ThematicBreak:
                break
            case let code as CodeBlock:
                out.append(code.code.hasSuffix("\n") ? String(code.code.dropLast()) : code.code)
            case let list as UnorderedList:
                out.append(items(list.listItems, depth: depth).joined(separator: "\n"))
            case let list as OrderedList:
                out.append(items(list.listItems, depth: depth).joined(separator: "\n"))
            case let table as Markdown.Table:
                let rows = [Array(table.head.cells)] + table.body.rows.map { Array($0.cells) }
                out.append(rows.map { row in row.map { inline($0.children) }.joined(separator: "  ") }.joined(separator: "\n"))
            case is Paragraph, is Heading:
                out.append(inline(node.children))
            case let html as HTMLBlock:
                out.append(html.rawHTML.trimmingCharacters(in: .newlines))
            default:
                // Blockquotes, alerts and the like: their contents, flat.
                out.append(contentsOf: blocks(node.children, depth: depth))
            }
        }
        return out
    }

    /// One line per item, its nested list indented under it.
    private static func items(_ list: some Sequence<ListItem>, depth: Int) -> [String] {
        let indent = String(repeating: "  ", count: depth)
        return list.map { item in
            var parts = blocks(item.children, depth: depth + 1)
            let head = parts.isEmpty ? "" : parts.removeFirst()
            return (["\(indent)• \(head)"] + parts).joined(separator: "\n")
        }
    }
}
