import CawCoDesign
import Foundation

/// The sentence a tool call reads as, ported from apps/dashboard/src/lib/
/// components/features/tool-cards/descriptors.ts: what it did, to what, and
/// what came back.
struct ToolDescriptor {
    enum Expanded { case bash, diff, read, web, code, memory, skill, params }
    enum Tone { case muted, error, diff }

    var label: String
    var object: String?
    var detail: String?
    var chip: String?
    var fact: String?
    var factTone: Tone?
    var favicon: URL?
    var glyph: Glyph
    var expanded: Expanded

    enum Family { case bash, read, edit, write, grep, glob, web, toolsearch, skill, message, screen, navigate, js, mcp, memory, task, todo, notebook, question, other }

    static func family(_ toolName: String?) -> Family {
        let raw = toolName ?? ""
        let mcp = mcpParts(raw)
        let name = (mcp?.tool ?? raw).lowercased()
        switch name {
        case "": return .other
        case "bash": return .bash
        case "read": return .read
        case "edit", "multiedit", "str_replace_editor", "str_replace", "file_edit": return .edit
        case "write", "create_file", "write_file": return .write
        case "grep": return .grep
        case "glob": return .glob
        case "webfetch", "websearch": return .web
        case "toolsearch": return .toolsearch
        case "skill": return .skill
        case "task", "agent": return .task
        case "todowrite": return .todo
        case "notebookedit": return .notebook
        case "askuserquestion": return .question
        case "sendmessage": return .message
        case "computer", "show_image", "cawco_show_image": return .screen
        case "navigate": return .navigate
        case "manage_memory", "cawco_manage_memory": return .memory
        case "javascript_tool", "repl": return .js
        default: return mcp != nil ? .mcp : .other
        }
    }

    static func glyph(_ family: Family) -> Glyph {
        switch family {
        case .bash: .terminal
        case .read: .toolRead
        case .edit: .toolEdit
        case .write: .toolWrite
        case .grep, .toolsearch: .search
        case .glob: .toolFiles
        case .web: .globe
        case .skill: .bolt
        case .message: .toolMessage
        case .screen: .toolScreen
        case .navigate: .toolNavigate
        case .js: .toolCode
        case .mcp: .toolMcp
        case .memory: .book
        case .task: .toolTask
        case .todo: .toolTodo
        case .notebook: .toolNotebook
        case .question: .ask
        case .other: .toolGeneric
        }
    }

    static func mcpParts(_ name: String) -> (server: String, tool: String)? {
        guard let match = name.wholeMatch(of: /mcp__(.+?)__(.+)/) else { return nil }
        return (String(match.1), String(match.2))
    }

    static let lineCap = 200

    static func str(_ value: Any?) -> String? {
        guard let text = value as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }

    static func int(_ value: Any?) -> Int? {
        if let number = value as? NSNumber, !(value is Bool) { return number.intValue }
        return nil
    }

    static func pathLeaf(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    static func pathDir(_ path: String) -> String? {
        guard let cut = path.lastIndex(of: "/"), cut > path.startIndex else { return nil }
        return String(path[..<cut])
    }

    static func oneLine(_ text: String) -> String {
        String(text.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(lineCap))
    }

    static func firstLine(_ result: String?) -> String? {
        guard let result else { return nil }
        for line in result.split(separator: "\n", omittingEmptySubsequences: false) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty { return String(trimmed.prefix(lineCap)) }
        }
        return nil
    }

    static func countLines(_ text: String) -> Int {
        text.split(separator: "\n", omittingEmptySubsequences: false).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
    }

    static func spanLines(_ text: String) -> Int {
        text.isEmpty ? 0 : text.split(separator: "\n", omittingEmptySubsequences: false).count
    }

    /// The file changes an edit or write call made, one per replacement.
    static func changes(_ input: [String: Any], toolName: String?) -> [(path: String, old: String, new: String)] {
        guard let path = str(input["file_path"]) ?? str(input["filePath"]) ?? str(input["path"]) ?? str(input["filename"]) else { return [] }
        if family(toolName) == .write, ["write", "create_file", "write_file"].contains((toolName ?? "").lowercased()) {
            return [(path, "", input["content"] as? String ?? "")]
        }
        let edits = input["edits"] as? [Any] ?? [input]
        return edits.map { edit in
            let each = edit as? [String: Any] ?? [:]
            let old = (each["old_string"] ?? each["old_str"] ?? each["oldString"] ?? each["oldText"]) as? String ?? ""
            let new = (each["new_string"] ?? each["new_str"] ?? each["newString"] ?? each["newText"]) as? String ?? ""
            return (path, old, new)
        }
    }

    private static func host(_ url: String?) -> String? {
        guard let url, let host = URL(string: url)?.host else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    private static let localZones = ["localhost", "local", "internal", "lan", "home.arpa", "ts.net", "test", "example", "invalid"]

    private static func favicon(_ host: String) -> URL? {
        let reachable = host.contains(".") && !host.contains(":")
            && host.wholeMatch(of: /\d{1,3}(?:\.\d{1,3}){3}/) == nil
            && host.firstMatch(of: /\.\d+$/) == nil
            && !localZones.contains { host == $0 || host.hasSuffix(".\($0)") }
        return reachable ? URL(string: "https://www.google.com/s2/favicons?domain=\(host)&sz=32") : nil
    }

    private static let tldLabels: Set<String> = ["ai", "com", "io", "org", "net"]

    private static func readServer(_ server: String) -> (label: String, host: String?) {
        let parts = server.split(whereSeparator: { "_-.".contains($0) }).map(String.init)
        let cut = parts.count <= 3 ? (parts.indices.first { $0 > 0 && tldLabels.contains(parts[$0].lowercased()) } ?? -1) : -1
        guard cut >= 1 else { return (parts.joined(separator: " "), nil) }
        let host = parts[...cut].joined(separator: ".").lowercased()
        let rest = parts[(cut + 1)...]
        return (rest.isEmpty ? host : "\(host) \(rest.joined(separator: " "))", host)
    }

    /// `list_sessions` / `listSessions` → `List sessions`.
    static func humanize(_ name: String) -> String {
        var words = name.replacing(/[_-]+/, with: " ")
        words = words.replacing(/([a-z\d])([A-Z])/) { "\($0.1) \($0.2)" }
        words = words.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    private static let primaryKeys = ["file_path", "path", "url", "query", "pattern", "command", "description"]

    private static func primary(_ input: [String: Any]) -> String? {
        for key in primaryKeys { if let named = str(input[key]) { return named } }
        var best: String?
        for value in input.values {
            guard let text = str(value), text.count <= 80 else { continue }
            if best == nil || text.count > best!.count { best = text }
        }
        return best
    }

    static func describe(_ toolName: String?, input: [String: Any], result: String?, status: String) -> ToolDescriptor {
        var described = sentence(toolName, input: input, result: result, status: status)
        guard let server = mcpParts(toolName ?? "")?.server else { return described }
        let identity = readServer(server)
        described.chip = described.chip ?? identity.label
        described.favicon = described.favicon ?? identity.host.flatMap(favicon)
        return described
    }

    // swiftlint:disable:next cyclomatic_complexity function_body_length
    private static func sentence(_ toolName: String?, input: [String: Any], result: String?, status: String) -> ToolDescriptor {
        let name = toolName ?? "Tool"
        let output = status == "success" ? result : nil
        let kind = family(name)
        var d = ToolDescriptor(label: "", glyph: glyph(kind), expanded: .params)
        switch kind {
        case .bash:
            d.label = str(input["description"]) ?? ""
            d.object = str(input["command"]).map(oneLine)
            d.chip = input["run_in_background"] as? Bool == true ? "background" : nil
            d.expanded = .bash
        case .read:
            let path = str(input["file_path"]) ?? str(input["path"])
            var span = ""
            if let offset = int(input["offset"]) {
                span = int(input["limit"]).map { ":\(offset)–\(offset + $0)" } ?? ":\(offset)+"
            }
            d.label = "Read"
            d.object = path.map { pathLeaf($0) + span }
            d.detail = path.flatMap(pathDir)
            if let output {
                let numbered = output.split(separator: "\n").filter { $0.firstMatch(of: /^\s*\d+→/) != nil }.count
                let lines = numbered > 0 ? numbered : countLines(output)
                d.fact = lines > 0 ? "\(lines) lines" : nil
            }
            d.expanded = .read
        case .edit, .write:
            let write = kind == .write
            let edits = changes(input, toolName: toolName)
            let path = edits.first?.path
            d.expanded = .diff
            d.object = path.map(pathLeaf)
            if status == "error" {
                d.label = write ? "Write failed" : "Edit failed"
            } else {
                let added = edits.reduce(0) { $0 + spanLines($1.new) }
                let removed = edits.reduce(0) { $0 + spanLines($1.old) }
                d.label = write ? "Wrote" : "Edited"
                d.fact = write ? "+\(added)" : "+\(added) −\(removed)"
                d.factTone = .diff
            }
        case .grep:
            d.label = "Searched"
            d.object = str(input["pattern"]).map { "/\(oneLine($0))/" }
            d.detail = str(input["path"]).map(pathLeaf)
            d.fact = grepFact(input, output)
            d.expanded = .read
        case .glob:
            d.label = "Listed"
            d.object = str(input["pattern"]) ?? str(input["glob"])
            if let output, output.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("no files found") == false {
                let files = countLines(output)
                d.fact = files > 0 ? "\(files) files" : nil
            }
            d.expanded = .read
        case .web:
            let search = name.lowercased() == "websearch"
            let url = str(input["url"])
            let host = host(url)
            d.label = search ? "Searched the web" : host.map { "Fetched \($0)" } ?? "Fetched"
            d.object = search ? str(input["query"]) : url.map(oneLine)
            d.favicon = host.flatMap(favicon)
            d.expanded = .web
        case .toolsearch:
            d.label = "Looked up tools"
            d.object = str(input["query"])
        case .skill:
            d.label = "Ran skill"
            d.object = str(input["skill"]).map { "/\($0)" }
            d.detail = str(input["args"]).map(oneLine)
            d.expanded = .skill
        case .message:
            d.label = "Messaged"
            d.object = str(input["to"]) ?? str(input["agent_id"]) ?? str(input["name"])
            d.detail = (str(input["prompt"]) ?? str(input["message"]) ?? str(input["description"])).map(oneLine)
        case .screen:
            let normalized = mcpParts(name)?.tool ?? name
            if normalized == "show_image" || normalized == "cawco_show_image" {
                let path = str(input["path"])
                d.label = "Show"
                d.object = path.map(pathLeaf)
                d.detail = path.flatMap(pathDir)
            } else {
                let action = str(input["action"])
                d.label = action.map { "Screen · \($0)" } ?? "Screen"
                if let at = input["coordinate"] as? [Any] {
                    d.object = "(" + at.map { "\($0)" }.joined(separator: ", ") + ")"
                } else {
                    d.object = str(input["text"]).map(oneLine)
                }
            }
        case .navigate:
            let url = str(input["url"])
            let host = host(url)
            var target = url.map(oneLine)
            if let url, let host, let path = URL(string: url)?.path {
                target = host + (path.hasSuffix("/") ? String(path.dropLast()) : path)
            }
            d.label = "Opened"
            d.object = target
            d.favicon = host.flatMap(favicon)
        case .js:
            let description = str(input["description"])
            let code = str(input["code"]) ?? str(input["text"]) ?? str(input["script"])
            d.label = "Ran JavaScript"
            d.object = description == nil ? firstLine(code) : nil
            d.detail = description
            d.expanded = .code
        case .memory:
            d.expanded = .memory
            memory(&d, input: input, output: output)
        case .mcp:
            d.label = humanize(mcpParts(name)?.tool ?? name)
        case .task, .todo, .notebook, .question, .other:
            d.label = humanize(name)
            d.object = primary(input).map(oneLine)
        }
        return d
    }

    private static func grepFact(_ input: [String: Any], _ result: String?) -> String? {
        guard let result else { return nil }
        if let found = firstLine(result)?.firstMatch(of: /^Found (\d+) (\w+)/.ignoresCase()) {
            return "\(found.1) \(found.2.lowercased())"
        }
        guard input["output_mode"] as? String == "count" else { return nil }
        var total = 0
        for line in result.split(separator: "\n") {
            if let tally = line.firstMatch(of: /:(\d+)\s*$/) { total += Int(tally.1) ?? 0 }
        }
        return total > 0 ? "\(total) matches" : nil
    }

    private static func memory(_ d: inout ToolDescriptor, input: [String: Any], output: String?) {
        let path = str(input["path"])
        let content = input["content"] as? String
        func lines(_ text: String?) -> String? { text.map { "\(spanLines($0)) lines" } }
        switch input["action"] as? String {
        case "get":
            d.label = "Read fleet memory"; d.object = "CLAUDE.md"
            if case let .doc(text) = MemoryResult(output) { d.fact = lines(text) }
        case "set":
            d.label = "Updated fleet memory"; d.object = "CLAUDE.md"; d.fact = lines(content)
        case "list_docs":
            d.label = "Listed memory docs"
            if case let .docs(docs) = MemoryResult(output) { d.fact = "\(docs.count) docs" }
        case "set_doc":
            d.label = "Wrote memory doc"; d.object = path.map(pathLeaf); d.detail = path.flatMap(pathDir); d.fact = lines(content)
        case "remove_doc":
            d.label = "Removed memory doc"; d.object = path.map(pathLeaf); d.detail = path.flatMap(pathDir)
        default:
            d.label = "Fleet memory"
        }
    }
}

/// What a `manage_memory` call answered with (descriptors.ts `memoryResult`).
enum MemoryResult {
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
