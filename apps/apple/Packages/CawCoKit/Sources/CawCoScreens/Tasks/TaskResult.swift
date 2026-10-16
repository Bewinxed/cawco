import Foundation

// What a task's result is (tasks/result.ts), so the task sheet shows the
// thing itself and never its file: an output an attempt handed in (the task
// file's `outputs:`, copied into `assets/<task>/`) is read by what it is, by
// its extension, and drawn as that.

/// The kinds of result the sheet draws, each its own way (`ResultKind`).
nonisolated enum ResultKind: Sendable {
    case document, page, data, table, picture, text

    /// What each kind is called above it: the reader's word, never the file's (`KIND_WORD`).
    var word: String {
        switch self {
        case .document: "Document"
        case .page: "Page"
        case .data: "Data"
        case .table: "Table"
        case .picture: "Picture"
        case .text: "Text"
        }
    }

    /// `resultKind`: by the name's extension, `text` for any other.
    init(name: String) {
        let ext = name.firstMatch(of: /\.([a-zA-Z0-9]+)$/).map { String($0.1).lowercased() } ?? ""
        self = switch ext {
        case "md", "markdown", "mdx", "txt": .document
        case "html", "htm": .page
        case "json": .data
        case "csv", "tsv": .table
        case "svg", "png", "jpg", "jpeg", "gif", "webp": .picture
        default: .text
        }
    }
}

nonisolated enum ResultRead {
    /// A document's body without its front matter, and the title that front
    /// matter gives it (a post's `title:`) where the body does not open on a
    /// heading of its own, which says it already (`documentOf`).
    static func document(_ text: String) -> (body: String, title: String?) {
        guard let front = text.firstMatch(of: /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/) else { return (text, nil) }
        let body = String(text[front.range.upperBound...])
        if body.firstMatch(of: /^\s*#{1,6}\s/) != nil { return (body, nil) }
        let title = String(front.1).firstMatch(of: /(?m)^title:\s*["']?(.+?)["']?\s*$/).map { String($0.1) }
        return (body, title)
    }

    /// A key as a label (`keyLabel`): `scheduled_at` and `scheduledAt` read "Scheduled at".
    static func keyLabel(_ key: String) -> String {
        let words = key.replacing(/([a-z0-9])([A-Z])/) { "\($0.1) \($0.2)" }
            .replacing(/[_-]+/, with: " ")
            .trimmingCharacters(in: .whitespaces)
            .lowercased()
        guard let first = words.first else { return key }
        return first.uppercased() + words.dropFirst()
    }

    /// A CSV or TSV file's rows, quoted fields kept whole; the first row heads the table (`parseDelimited`).
    static func delimited(_ text: String, tab: Bool) -> [[String]] {
        let separator: Character = tab ? "\t" : ","
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var quoted = false
        let chars = Array(text.unicodeScalars.map(Character.init))
        var at = 0
        while at < chars.count {
            let char = chars[at]
            if quoted {
                if char == "\"", at + 1 < chars.count, chars[at + 1] == "\"" {
                    field.append("\"")
                    at += 1
                } else if char == "\"" {
                    quoted = false
                } else {
                    field.append(char)
                }
            } else if char == "\"" {
                quoted = true
            } else if char == separator {
                row.append(field)
                field = ""
            } else if char == "\n" {
                row.append(field.hasSuffix("\r") ? String(field.dropLast()) : field)
                rows.append(row)
                row = []
                field = ""
            } else {
                field.append(char)
            }
            at += 1
        }
        if !field.isEmpty || !row.isEmpty {
            row.append(field)
            rows.append(row)
        }
        return rows.filter { $0.contains { !$0.trimmingCharacters(in: .whitespaces).isEmpty } }
    }
}

// MARK: Data: JSON as what it says

/// A JSON value with its objects' keys in the order the file writes them,
/// as `Object.entries` reads them on the web (`Json`).
nonisolated enum ResultJSON: Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([ResultJSON])
    case object([(String, ResultJSON)])

    static func == (lhs: ResultJSON, rhs: ResultJSON) -> Bool {
        switch (lhs, rhs) {
        case let (.string(a), .string(b)): a == b
        case let (.number(a), .number(b)): a == b
        case let (.bool(a), .bool(b)): a == b
        case (.null, .null): true
        case let (.array(a), .array(b)): a == b
        case let (.object(a), .object(b)): a.count == b.count && zip(a, b).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
        default: false
        }
    }

    /// A plain value: neither a list nor a record.
    var isPlain: Bool {
        switch self {
        case .array, .object: false
        default: true
        }
    }

    var fields: [(String, ResultJSON)]? {
        if case let .object(fields) = self { return fields }
        return nil
    }

    subscript(key: String) -> ResultJSON? { fields?.last { $0.0 == key }?.1 }

    /// The keys a record's own name is under, in the order they are tried (`NAME_KEYS`).
    private static let nameKeys = ["title", "name", "headline", "subject", "label"]

    /// A record's own name, when it carries one: shown as its heading, not as a row (`nameKeyOf`).
    var nameKey: String? {
        Self.nameKeys.first { key in
            if case .string = self[key] { return true }
            return false
        }
    }

    /// A list every item of which is a record of plain values: drawn as a
    /// table, up to six columns (`tableOf`).
    static func table(_ items: [ResultJSON]) -> (columns: [String], rows: [[(String, ResultJSON)]])? {
        let rows = items.compactMap(\.fields)
        guard !items.isEmpty, rows.count == items.count, rows.allSatisfy({ $0.allSatisfy { $0.1.isPlain } }) else { return nil }
        var columns: [String] = []
        for row in rows {
            for (key, _) in row where !columns.contains(key) { columns.append(key) }
        }
        return (1 ... 6).contains(columns.count) ? (columns, rows) : nil
    }

    /// A link: a string that is one whole `http(s)` address (`isUrl`).
    var url: URL? {
        guard case let .string(text) = self, text.wholeMatch(of: /https?:\/\/\S+/) != nil else { return nil }
        return URL(string: text)
    }

    /// A plain value in words (`plainWords`): a date as a date, a yes/no as one, nothing as "None".
    var words: String {
        switch self {
        case .null: return "None"
        case let .bool(value): return value ? "Yes" : "No"
        case let .number(value): return value.formatted(.number)
        case let .string(text):
            if text.wholeMatch(of: /\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?/) != nil, let at = Self.date(text) {
                // `toLocaleString(dateStyle: medium, timeStyle: short)`, or the date alone.
                return text.count > 10 ? at.formatted(date: .abbreviated, time: .shortened) : at.formatted(date: .abbreviated, time: .omitted)
            }
            return text
        case .array, .object: return ""
        }
    }

    /// A date as `new Date(text)` reads it: a date alone at UTC midnight, a
    /// date-time without a zone in local time.
    private static func date(_ text: String) -> Date? {
        if text.count == 10 {
            let day = DateFormatter()
            day.locale = Locale(identifier: "en_US_POSIX")
            day.timeZone = TimeZone(identifier: "UTC")
            day.dateFormat = "yyyy-MM-dd"
            return day.date(from: text)
        }
        let normal = text.replacing(" ", with: "T", maxReplacements: 1)
        for options: ISO8601DateFormatter.Options in [[.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime]] {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = options
            if let at = iso.date(from: normal) { return at }
        }
        let local = DateFormatter()
        local.locale = Locale(identifier: "en_US_POSIX")
        for format in ["yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm"] {
            local.dateFormat = format
            if let at = local.date(from: normal) { return at }
        }
        return nil
    }

    // MARK: Reading

    struct Unreadable: Error {
        let reason: String
    }

    /// Reads a whole JSON text, or says where it stopped reading (`JSON.parse`).
    static func parse(_ text: String) throws(Unreadable) -> ResultJSON {
        var reader = Reader(Array(text.utf8))
        reader.space()
        let value = try reader.value()
        reader.space()
        guard reader.at == reader.bytes.count else { throw reader.fail("Unexpected non-whitespace character after JSON") }
        return value
    }

    private struct Reader {
        let bytes: [UInt8]
        var at = 0

        init(_ bytes: [UInt8]) { self.bytes = bytes }

        func fail(_ what: String) -> Unreadable { Unreadable(reason: "\(what) at position \(at)") }

        mutating func space() {
            while at < bytes.count, [0x20, 0x09, 0x0A, 0x0D].contains(bytes[at]) { at += 1 }
        }

        mutating func literal(_ word: String, _ value: ResultJSON) throws(Unreadable) -> ResultJSON {
            let want = Array(word.utf8)
            guard at + want.count <= bytes.count, Array(bytes[at ..< at + want.count]) == want else { throw fail("Unexpected token") }
            at += want.count
            return value
        }

        mutating func value() throws(Unreadable) -> ResultJSON {
            guard at < bytes.count else { throw fail("Unexpected end of JSON input") }
            switch bytes[at] {
            case UInt8(ascii: "{"): return try object()
            case UInt8(ascii: "["): return try array()
            case UInt8(ascii: "\""): return .string(try string())
            case UInt8(ascii: "t"): return try literal("true", .bool(true))
            case UInt8(ascii: "f"): return try literal("false", .bool(false))
            case UInt8(ascii: "n"): return try literal("null", .null)
            default: return try number()
            }
        }

        mutating func object() throws(Unreadable) -> ResultJSON {
            at += 1
            var fields: [(String, ResultJSON)] = []
            space()
            if at < bytes.count, bytes[at] == UInt8(ascii: "}") { at += 1; return .object(fields) }
            while true {
                space()
                guard at < bytes.count, bytes[at] == UInt8(ascii: "\"") else { throw fail("Expected property name") }
                let key = try string()
                space()
                guard at < bytes.count, bytes[at] == UInt8(ascii: ":") else { throw fail("Expected ':' after property name") }
                at += 1
                space()
                let item = try value()
                // A key written twice keeps its first place and its last value, as an object does.
                if let index = fields.firstIndex(where: { $0.0 == key }) { fields[index].1 = item } else { fields.append((key, item)) }
                space()
                guard at < bytes.count else { throw fail("Unexpected end of JSON input") }
                if bytes[at] == UInt8(ascii: ",") { at += 1; continue }
                if bytes[at] == UInt8(ascii: "}") { at += 1; return .object(fields) }
                throw fail("Expected ',' or '}' after property value")
            }
        }

        mutating func array() throws(Unreadable) -> ResultJSON {
            at += 1
            var items: [ResultJSON] = []
            space()
            if at < bytes.count, bytes[at] == UInt8(ascii: "]") { at += 1; return .array(items) }
            while true {
                space()
                items.append(try value())
                space()
                guard at < bytes.count else { throw fail("Unexpected end of JSON input") }
                if bytes[at] == UInt8(ascii: ",") { at += 1; continue }
                if bytes[at] == UInt8(ascii: "]") { at += 1; return .array(items) }
                throw fail("Expected ',' or ']' after array element")
            }
        }

        mutating func string() throws(Unreadable) -> String {
            at += 1
            var out: [UInt8] = []
            while at < bytes.count {
                let byte = bytes[at]
                if byte == UInt8(ascii: "\"") {
                    at += 1
                    return String(decoding: out, as: UTF8.self)
                }
                if byte == UInt8(ascii: "\\") {
                    at += 1
                    guard at < bytes.count else { break }
                    let escape = bytes[at]
                    switch escape {
                    case UInt8(ascii: "n"): out.append(0x0A)
                    case UInt8(ascii: "t"): out.append(0x09)
                    case UInt8(ascii: "r"): out.append(0x0D)
                    case UInt8(ascii: "b"): out.append(0x08)
                    case UInt8(ascii: "f"): out.append(0x0C)
                    case UInt8(ascii: "u"):
                        var unit = try hex()
                        // A surrogate pair is one character.
                        if (0xD800 ..< 0xDC00).contains(unit), at + 2 < bytes.count, bytes[at + 1] == UInt8(ascii: "\\"), bytes[at + 2] == UInt8(ascii: "u") {
                            at += 2
                            let low = try hex()
                            unit = 0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00)
                        }
                        out.append(contentsOf: Array(String(Character(Unicode.Scalar(unit) ?? "\u{FFFD}")).utf8))
                    default: out.append(escape)
                    }
                    at += 1
                    continue
                }
                out.append(byte)
                at += 1
            }
            throw fail("Unterminated string in JSON")
        }

        /// The four hex digits after `\u`; leaves `at` on the last.
        mutating func hex() throws(Unreadable) -> UInt32 {
            guard at + 4 < bytes.count, let unit = UInt32(String(decoding: bytes[at + 1 ... at + 4], as: UTF8.self), radix: 16) else {
                throw fail("Bad Unicode escape in JSON")
            }
            at += 4
            return unit
        }

        mutating func number() throws(Unreadable) -> ResultJSON {
            let start = at
            let numeric = Set("+-0123456789.eE".utf8)
            while at < bytes.count, numeric.contains(bytes[at]) { at += 1 }
            guard at > start, let value = Double(String(decoding: bytes[start ..< at], as: UTF8.self)) else {
                at = start
                throw fail("Unexpected token")
            }
            return .number(value)
        }
    }
}
