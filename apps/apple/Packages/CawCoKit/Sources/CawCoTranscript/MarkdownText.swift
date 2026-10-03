import Markdown

/// Candidate 3 from the device bake-off: parse only the open Markdown block,
/// freeze earlier blocks, and chunk open fences every twenty completed lines.
struct MarkdownSplitter {
    private var offset = 0
    private var header = ""

    /// The tail continues a fence whose earlier lines were frozen as chunks.
    var tailContinues: Bool { !header.isEmpty }

    /// For each piece the last `split` froze: whether the next piece continues
    /// its fence (a chunk of an open fence, drawn as one well with the next).
    private(set) var joins: [Bool] = []

    mutating func split(_ text: String) -> (settled: [String], tail: String) {
        joins = []
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
                joins.append(false)
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
                    joins.append(true)
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
