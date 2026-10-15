import CawCoDesign
import Foundation
import Synchronization
import UIKit

/// The sentence a tool call reads as, and the body it opens: the rules of
/// packages/core/src/tool-presentation.ts (generated here as
/// `ToolPresentation`), read by the same steps as its `describeTool`. No tool
/// is special here: what differs between tools is data.
nonisolated struct ToolDescriptor {
    typealias Renderer = ToolPresentation.Renderer
    typealias Kind = ToolPresentation.Kind

    var kind: Kind
    var renderer: Renderer
    var label: String
    var object: String?
    var objectMono: Bool
    var detail: String?
    var detailMono: Bool
    var chip: String?
    var fact: String?
    /// The fact reads as a diff: its `+` green, its `−` red.
    var factDiff: Bool
    /// The site's icon as a path on the connected hub (`/api/favicon?host=`), resolved by the row against its hub.
    var favicon: String?
    /// The first line the call printed.
    var secondLine: String?

    var glyph: Glyph { Glyph(rawValue: kind.glyph) ?? .toolGeneric }
    /// The kind's ink (descriptors' `--tool-*`): what the step is, never how it went.
    var ink: UIColor { Palette.named(kind.ink) }

    // MARK: Kinds

    static func mcpParts(_ name: String) -> (server: String, tool: String)? {
        if let known = read.withLock({ $0.parts[name] }) { return known.map { ($0.server, $0.tool) } }
        var parts: Parts?
        if let regex = try? Regex(ToolPresentation.mcpName), let match = name.wholeMatch(of: regex),
           match.count == 3, let server = match[1].substring, let tool = match[2].substring {
            parts = Parts(server: String(server), tool: String(tool))
        }
        read.withLock { $0.remember(\.parts, name, parts) }
        return parts.map { ($0.server, $0.tool) }
    }

    /// The kind a tool name is: by its own name (an MCP tool's past its server), else `mcp` or `other`.
    static func kind(_ toolName: String?) -> Kind {
        let raw = toolName ?? ""
        if let known = read.withLock({ $0.kinds[raw] }) { return known }
        let mcp = mcpParts(raw)
        let own = (mcp?.tool ?? raw).lowercased()
        let fallback: ToolPresentation.KindID = mcp != nil ? .mcp : .other
        let kind = (own.isEmpty ? nil : ToolPresentation.kinds.first { kind in
            kind.names.contains(own) || kind.namePattern.flatMap { try? Regex($0) }.map { own.firstMatch(of: $0) != nil } == true
        }) ?? ToolPresentation.kinds.first { $0.id == fallback }!
        read.withLock { $0.remember(\.kinds, raw, kind) }
        return kind
    }

    /// An MCP tool name's server and tool.
    private struct Parts: Sendable {
        let server: String
        let tool: String
    }

    /// What each tool name read as, kept: a name reads the same every time,
    /// and reading it compiled the shared patterns (`mcpName`, a kind's
    /// `namePattern`) into a Regex for every call's row set up.
    private struct Read: Sendable {
        var parts: [String: Parts?] = [:]
        var kinds: [String: Kind] = [:]
        /// The most names kept; past it the table starts again.
        static let most = 4096

        mutating func remember<Value>(_ table: WritableKeyPath<Read, [String: Value]>, _ name: String, _ value: Value) {
            if self[keyPath: table].count >= Self.most { self[keyPath: table].removeAll(keepingCapacity: true) }
            self[keyPath: table][name] = value
        }
    }

    private static let read = Mutex(Read())

    // MARK: Pieces

    static func str(_ value: Any?) -> String? {
        guard let text = value as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }

    static func int(_ value: Any?) -> Int? {
        if let number = value as? NSNumber, !(value is Bool) { return number.intValue }
        return nil
    }

    /// The last segment of a path: what tells two checkouts apart.
    static func pathLeaf(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    static func pathDir(_ path: String) -> String? {
        guard let cut = path.lastIndex(of: "/"), cut > path.startIndex else { return nil }
        return String(path[..<cut])
    }

    static func oneLine(_ text: String) -> String {
        String(text.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(ToolPresentation.lineCap))
    }

    static func firstLine(_ text: String?) -> String? {
        guard let text else { return nil }
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty { return String(trimmed.prefix(ToolPresentation.lineCap)) }
        }
        return nil
    }

    private static func host(_ url: String) -> String? {
        guard let host = URL(string: url)?.host, !host.isEmpty else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    private static func cut(_ value: String, _ transform: ToolPresentation.Transform, _ input: [String: Any]) -> String? {
        switch transform {
        case .asIs, .point: return value
        case .oneLine: return oneLine(value)
        case .firstLine: return firstLine(value)
        case .pathLeaf: return pathLeaf(value)
        case .pathDir: return pathDir(value)
        case .pathLeafSpan:
            var span = ""
            if let offset = int(input["offset"]) {
                span = int(input["limit"]).map { ":\(offset)–\(offset + $0)" } ?? ":\(offset)+"
            }
            return pathLeaf(value) + span
        case .urlHost: return host(value)
        case .urlHostPath:
            guard let host = host(value), let path = URL(string: value)?.path else { return oneLine(value) }
            return host + (path.hasSuffix("/") ? String(path.dropLast()) : path)
        }
    }

    /// The longest input string still short enough to be a name rather than a payload.
    private static func shortest(_ input: [String: Any]) -> String? {
        var best: String?
        for value in input.values {
            guard let text = str(value), text.count <= ToolPresentation.primaryMax else { continue }
            if best.map({ text.count > $0.count }) ?? true { best = text }
        }
        return best
    }

    private static func read(_ pieces: [ToolPresentation.Piece], _ input: [String: Any]) -> String? {
        for piece in pieces {
            if let unless = piece.unless, str(input[unless]) != nil { continue }
            if let text = piece.text { return text }
            var value: String?
            for field in piece.from {
                if piece.cut == .point, let point = input[field] as? [Any] {
                    value = "(" + point.map { "\($0)" }.joined(separator: ", ") + ")"
                    break
                }
                if let text = str(input[field]), let cut = cut(text, piece.cut ?? .asIs, input) {
                    value = cut
                    break
                }
            }
            if value == nil, piece.orShortest, let short = shortest(input) {
                value = cut(short, piece.cut ?? .asIs, input)
            }
            if let value { return piece.wrap.map { $0.0 + value + $0.1 } ?? value }
        }
        return nil
    }

    /// `list_sessions` / `listSessions` → `List sessions`.
    ///
    /// A run of `_` or `-` is a space, and a space parts a lowercase letter or
    /// a digit from a capital after it: one scan, where two Regex replacements
    /// were most of setting a call's row up.
    static func humanize(_ name: String) -> String {
        var spaced = ""
        var last: Character?
        for character in name {
            if character == "_" || character == "-" {
                if last != " " { spaced.append(" ") }
                last = " "
                continue
            }
            if let last, (last.isASCII && last.isLowercase) || isDecimalDigit(last), character.isASCII, character.isUppercase {
                spaced.append(" ")
            }
            spaced.append(character)
            last = character
        }
        let words = spaced.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    /// A decimal digit (`\d`): a character whose one scalar is a decimal number.
    static func isDecimalDigit(_ character: Character) -> Bool {
        character.unicodeScalars.count == 1 && character.unicodeScalars.first?.properties.generalCategory == .decimalNumber
    }

    /// Grep's `Found <count> <word>` at a line's start, any case (`^Found (\d+) (\w+)`).
    static func foundLine(_ line: String) -> (count: Substring, word: Substring)? {
        guard line.prefix(6).lowercased() == "found " else { return nil }
        let rest = line.dropFirst(6)
        let digits = leadingDigits(rest)
        guard digits > 0 else { return nil }
        let after = rest.dropFirst(digits)
        guard after.first == " " else { return nil }
        let word = after.dropFirst().prefix { $0.isLetter || $0.isNumber || $0 == "_" }
        guard !word.isEmpty else { return nil }
        return (rest.prefix(digits), word)
    }

    /// A count line's tally (`:(\d+)\s*$`): the digits after its last colon, at its end but for spaces.
    static func countTail(_ line: Substring) -> Substring? {
        var end = line.endIndex
        while end > line.startIndex, line[line.index(before: end)].isWhitespace { end = line.index(before: end) }
        var start = end
        while start > line.startIndex, isDecimalDigit(line[line.index(before: start)]) { start = line.index(before: start) }
        guard start < end, start > line.startIndex, line[line.index(before: start)] == ":" else { return nil }
        return line[start ..< end]
    }

    /// The digits `text` starts with (`\d+`): how many characters they take.
    static func leadingDigits(_ text: Substring) -> Int {
        text.prefix { isDecimalDigit($0) }.count
    }

    // MARK: File changes

    /// One file a call changed: its path, the text it replaced and put in, and its counts.
    struct Change {
        let path: String
        let old: String
        let new: String
        let added: Int
        let removed: Int
    }

    private static func lineCount(_ text: String) -> Int {
        text.isEmpty ? 0 : text.split(separator: "\n", omittingEmptySubsequences: false).count
    }

    /// The file changes an edit or write call made, one per replacement; a patch's files and counts.
    static func changes(_ input: [String: Any], toolName: String?, patch: String? = nil) -> [Change] {
        let kind = kind(toolName)
        if let patch, kind.id == .edit, (toolName ?? "").lowercased().hasSuffix("apply_patch") { return patchFiles(patch) }
        guard let path = read([.init(from: ["file_path", "filePath", "path", "filename"], cut: nil, text: nil, unless: nil, wrap: nil, orShortest: false)], input) else {
            return []
        }
        if kind.id == .write {
            let content = input["content"] as? String ?? ""
            return [Change(path: path, old: "", new: content, added: lineCount(content), removed: 0)]
        }
        let edits = input["edits"] as? [Any] ?? [input]
        return edits.map { edit in
            let each = edit as? [String: Any] ?? [:]
            func pick(_ keys: [String]) -> String { keys.lazy.compactMap { each[$0] as? String }.first ?? "" }
            let old = pick(["old_string", "old_str", "oldString", "oldText"])
            let new = pick(["new_string", "new_str", "newString", "newText"])
            return Change(path: path, old: old, new: new, added: lineCount(new), removed: lineCount(old))
        }
    }

    /// A unified patch's files and the lines each adds and removes.
    static func patchFiles(_ patch: String) -> [Change] {
        var files: [(path: String, added: Int, removed: Int)] = []
        for line in patch.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix("+++ ") {
                var name = line.dropFirst(4).trimmingCharacters(in: .whitespaces)
                if name.hasPrefix("b/") { name.removeFirst(2) }
                files.append((name, 0, 0))
            } else if !files.isEmpty, line.hasPrefix("+"), !line.hasPrefix("+++") {
                files[files.count - 1].added += 1
            } else if !files.isEmpty, line.hasPrefix("-"), !line.hasPrefix("---") {
                files[files.count - 1].removed += 1
            }
        }
        return files.map { Change(path: $0.path, old: "", new: "", added: $0.added, removed: $0.removed) }
    }

    // MARK: Facts

    private static func fact(_ fact: ToolPresentation.Fact, _ input: [String: Any], _ output: String?, _ toolName: String?, _ patch: String?) -> String? {
        switch fact {
        case .readLines:
            guard let output else { return nil }
            // A line numbered as Read numbers it: spaces, digits, `→`.
            let numbered = output.split(separator: "\n").filter { line in
                let rest = line.drop { $0.isWhitespace }
                let digits = leadingDigits(rest)
                return digits > 0 && rest.dropFirst(digits).first == "→"
            }.count
            let lines = numbered > 0 ? numbered : output.split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
            return lines > 0 ? "\(lines) lines" : nil
        case .grepCount:
            guard let output else { return nil }
            if let found = firstLine(output).flatMap(foundLine) {
                return "\(found.count) \(found.word.lowercased())"
            }
            guard input["output_mode"] as? String == "count" else { return nil }
            var total = 0
            for line in output.split(separator: "\n") {
                if let tally = countTail(line) { total += Int(tally) ?? 0 }
            }
            return total > 0 ? "\(total) matches" : nil
        case .globFiles:
            guard let output, String(output.trimmingCharacters(in: .whitespaces).prefix(14)).lowercased() != "no files found" else { return nil }
            let files = output.split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
            return files > 0 ? "\(files) files" : nil
        case .editLines, .patchLines:
            let all = changes(input, toolName: toolName, patch: patch)
            guard !all.isEmpty else { return nil }
            return "+\(all.reduce(0) { $0 + $1.added }) −\(all.reduce(0) { $0 + $1.removed })"
        case .writeLines:
            let all = changes(input, toolName: toolName, patch: patch)
            return all.isEmpty ? nil : "+\(all.reduce(0) { $0 + $1.added })"
        case .contentLines:
            return (input["content"] as? String).map { "\(lineCount($0)) lines" }
        case .memoryDocLines:
            if case let .doc(text) = MemoryResult(output) { return "\(lineCount(text)) lines" }
            return nil
        case .memoryDocs:
            if case let .docs(docs) = MemoryResult(output) { return "\(docs.count) docs" }
            return nil
        }
    }

    // MARK: Hosts

    private static let localZones = ["localhost", "local", "internal", "lan", "home.arpa", "ts.net", "test", "example", "invalid"]

    private static let hostQuery = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: ".-"))

    /// An IPv4 address's shape (`\d{1,3}(?:\.\d{1,3}){3}`, whole): four runs of one to three digits, dots between.
    private static func isAddress(_ host: String) -> Bool {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 4 && parts.allSatisfy { (1 ... 3).contains($0.count) && $0.allSatisfy(isDecimalDigit) }
    }

    /// Whether the host's last label is a number (`\.\d+$`).
    private static func endsInNumber(_ host: String) -> Bool {
        guard let dot = host.lastIndex(of: ".") else { return false }
        let last = host[host.index(after: dot)...]
        return !last.isEmpty && last.allSatisfy(isDecimalDigit)
    }

    /// The site's icon as the user's own hub serves it, for a public host; no third party is ever asked.
    static func favicon(_ host: String) -> String? {
        let reachable = host.contains(".") && !host.contains(":")
            && !isAddress(host) && !endsInNumber(host)
            && !localZones.contains { host == $0 || host.hasSuffix(".\($0)") }
        guard reachable, let query = host.addingPercentEncoding(withAllowedCharacters: hostQuery) else { return nil }
        return "/api/favicon?host=\(query)"
    }

    private static let tldLabels: Set<String> = ["ai", "com", "io", "org", "net"]

    /// An MCP server's name as the sentence says it, and its host where the name carries a domain.
    static func mcpServer(_ server: String) -> (label: String, host: String?) {
        let parts = server.split(whereSeparator: { "_-.".contains($0) }).map(String.init)
        let at = parts.count <= 3 ? (parts.indices.first { $0 > 0 && tldLabels.contains(parts[$0].lowercased()) } ?? -1) : -1
        guard at >= 1 else { return (parts.joined(separator: " "), nil) }
        let host = parts[...at].joined(separator: ".").lowercased()
        let rest = parts[(at + 1)...]
        return (rest.isEmpty ? host : "\(host) \(rest.joined(separator: " "))", host)
    }

    // MARK: The sentence

    /// The sentence a call's row reads as. `result` is only read when the
    /// call succeeded: a failed call's output belongs to its refusal.
    static func describe(_ toolName: String?, input: [String: Any], result: String?, status: String, patch: String? = nil) -> ToolDescriptor {
        let name = toolName ?? "Tool"
        let output = status == "success" ? result : nil
        let kind = kind(name)
        let mcp = mcpParts(name)
        let own = (mcp?.tool ?? name).lowercased()
        let variant = kind.variants.first { variant in
            let when = variant.when
            return (when.names.map { $0.contains(own) } ?? true)
                && (when.status.map { $0.rawValue == status } ?? true)
                && (when.action.map { input["action"] as? String == $0 } ?? true)
                && (when.patch.map { $0 == (patch != nil) } ?? true)
        }
        let sentence = variant?.sentence ?? kind.sentence
        var label = ""
        switch sentence.label {
        case .toolName?: label = humanize(mcp?.tool ?? name)
        case let .words(words)?: label = words
        case let .slot(template, slot, fallback)?:
            label = read([slot], input).map { template.replacingOccurrences(of: "{}", with: $0) } ?? fallback
        case let .field(piece)?: label = read([piece], input) ?? ""
        case nil: label = ""
        }
        var described = ToolDescriptor(
            kind: kind, renderer: variant?.renderer ?? kind.renderer, label: label,
            object: read(sentence.object, input), objectMono: sentence.objectMono,
            detail: read(sentence.detail, input), detailMono: sentence.detailMono,
            chip: sentence.chip.flatMap { input[$0.field] as? Bool == true ? $0.text : nil },
            fact: sentence.fact.flatMap { fact($0, input, output, name, patch) }, factDiff: sentence.factDiff,
            favicon: sentence.favicon.flatMap { read([$0], input) }.flatMap(favicon),
            secondLine: sentence.secondLine ? firstLine(output) : nil
        )
        guard let mcp else { return described }
        // Which server answered is the one thing the sentence cannot say for itself.
        let identity = mcpServer(mcp.server)
        described.chip = described.chip ?? identity.label
        described.favicon = described.favicon ?? identity.host.flatMap(favicon)
        return described
    }

    // MARK: Bodies

    /// The order a fields body lists a call's input in, the same on every
    /// client (tool-presentation.ts `fieldOrder`): the primary fields in
    /// their order, then the rest by name.
    static func fieldOrder(_ keys: some Sequence<String>) -> [String] {
        let primary = ToolPresentation.primaryFields
        func rank(_ key: String) -> Int { primary.firstIndex(of: key) ?? primary.count }
        return keys.sorted { a, b in rank(a) != rank(b) ? rank(a) < rank(b) : byName(a, b) }
    }

    /// Name order by UTF-16 code unit (tool-presentation.ts `byName`).
    static func byName(_ a: String, _ b: String) -> Bool { a.utf16.lexicographicallyPrecedes(b.utf16) }

    /// A fields body's value for any input value: a string as written, anything else in the one JSON form.
    static func text(_ value: Any) -> String {
        if let string = value as? String { return string }
        return json(value)
    }

    /// tool-presentation.ts `writeJson`, step for step: two spaces a level,
    /// `"key": value`, every object's keys in name order, `{}` and `[]` when
    /// empty, numbers as JavaScript writes them.
    static func json(_ value: Any, indent: String = "") -> String {
        let inner = indent + "  "
        switch value {
        case is NSNull:
            return "null"
        case let string as String:
            return quoted(string)
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue ? "true" : "false" }
            return script(number.doubleValue)
        case let list as [Any]:
            guard !list.isEmpty else { return "[]" }
            return "[\n" + list.map { inner + json($0, indent: inner) }.joined(separator: ",\n") + "\n\(indent)]"
        case let object as [String: Any]:
            guard !object.isEmpty else { return "{}" }
            let keys = object.keys.sorted(by: byName)
            return "{\n" + keys.map { "\(inner)\(quoted($0)): \(json(object[$0] as Any, indent: inner))" }.joined(separator: ",\n") + "\n\(indent)}"
        default:
            return quoted("\(value)")
        }
    }

    /// A number as JavaScript's `String(number)` writes it: whole numbers
    /// below 1e21 without a fraction, the rest in the shortest form that
    /// reads back, an exponent without leading zeros.
    private static func script(_ number: Double) -> String {
        guard number.isFinite else { return "null" }
        if number == number.rounded(), abs(number) < 1e21 { return String(format: "%.0f", number) }
        return exponentTrimmed("\(number)")
    }

    /// `text` with the zeros that open its exponent left out but its last
    /// digit (`e([+-])0+(\d)` → `e$1$2`): Swift writes `1e-07`, JavaScript `1e-7`.
    static func exponentTrimmed(_ text: String) -> String {
        guard let e = text.firstIndex(of: "e") else { return text }
        let sign = text.index(after: e)
        guard sign < text.endIndex, text[sign] == "+" || text[sign] == "-" else { return text }
        let digits = text[text.index(after: sign)...]
        let run = digits.prefix { isDecimalDigit($0) }
        let zeros = run.prefix { $0 == "0" }.count
        // The zeros taken, leaving a digit after them; none when nothing follows the first.
        let taken = zeros < run.count ? zeros : zeros - 1
        guard taken > 0 else { return text }
        return String(text[...sign]) + String(digits.dropFirst(taken))
    }

    /// A string as `JSON.stringify` quotes it.
    private static func quoted(_ text: String) -> String {
        var out = "\""
        for scalar in text.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case _ where scalar.value < 0x20: out += String(format: "\\u%04x", scalar.value)
            default: out.unicodeScalars.append(scalar)
            }
        }
        return out + "\""
    }

    /// A result as a fields body shows it: its head, and how many characters are not shown.
    static func resultField(_ raw: Any?) -> (text: String, more: Int)? {
        guard let raw, !(raw is NSNull) else { return nil }
        let text = text(raw)
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let cap = ToolPresentation.resultCap
        return text.count > cap ? (String(text.prefix(cap)), text.count - cap) : (text, 0)
    }

    /// A failed call's reason, its harness's tags off.
    static func refusal(_ result: (text: String, more: Int)?) -> String? {
        guard let result, let tags = try? Regex(ToolPresentation.refusalTags) else { return nil }
        let words = result.text.replacing(tags, with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        return words.isEmpty ? nil : words
    }

    /// Whether an opened call has anything to show in its renderer's body.
    static func hasBody(_ renderer: Renderer, failed: Bool, input: [String: Any], raw: Any?, toolName: String?, patch: String?) -> Bool {
        let result = resultField(raw)
        switch renderer {
        case .preview:
            return false
        case .diff:
            return !changes(input, toolName: toolName, patch: patch).isEmpty || (failed && refusal(result) != nil)
        case .memory:
            if failed { return result != nil }
            switch input["action"] as? String {
            case "set", "set_doc": return input["content"] is String
            case "remove_doc": return true
            case "get": if case .doc = MemoryResult(raw as? String) { return true } else { return false }
            case "list_docs": if case .docs = MemoryResult(raw as? String) { return true } else { return false }
            default: return false
            }
        case .prose:
            return failed ? (!input.isEmpty || result != nil) : str(input[ToolPresentation.proseField]) != nil
        case .fields, .image:
            return !input.isEmpty || result != nil
        }
    }
}

/// What a fleet memory call answered with (tool-presentation.ts `memoryResult`).
nonisolated enum MemoryResult {
    case doc(String)
    case docs([(path: String, content: String)])
    case none

    init(_ raw: String?) {
        guard let raw, let data = raw.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { self = .none; return }
        if let docs = value["docs"] as? [[String: Any]] {
            self = .docs(docs.compactMap { doc in
                guard let path = doc["path"] as? String, let content = doc["content"] as? String else { return nil }
                return (path, content)
            })
            return
        }
        let doc = (value["memory"] as? [String: Any]) ?? value
        if let content = doc["content"] as? String { self = .doc(content) } else { self = .none }
    }
}
