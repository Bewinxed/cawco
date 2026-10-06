import Foundation

/// The transcript folded into render rows, as apps/dashboard/src/lib/cawco/
/// transcript/rows.ts folds it: consecutive tool calls onto one rail, a Task
/// call into the branch it spawned, a question, a delegate, a workflow run
/// and harness plumbing into rows of their own. The live tail is not here;
/// TranscriptView draws it after these rows.
enum Row {
    case single(key: String, block: Block, grouped: Bool)
    case tools(key: String, blocks: [Block])
    case question(key: String, block: Block)
    case subagent(key: String, branch: Branch, spawn: Block)
    case delegate(key: String, block: Block)
    case run(key: String, block: Block, runId: String?)
    case harness(key: String, note: HarnessNote)
    case queued(key: String, block: Block, grouped: Bool)
    case compaction(key: String, compaction: Compaction)

    var key: String {
        switch self {
        case let .single(key, _, _), let .tools(key, _), let .question(key, _), let .subagent(key, _, _),
             let .delegate(key, _), let .run(key, _, _), let .harness(key, _), let .queued(key, _, _),
             let .compaction(key, _): key
        }
    }
}

/// A compaction (rows.ts `compaction`): the boundary the harness reported and
/// the summary it wrote, one row. The brief is nil until the summary arrives.
struct Compaction: Equatable {
    let key: String
    let brief: String?
    let preTokens: Int?
    let trigger: String?

    /// "Automatic · 182k tokens before": only the facts the harness reported.
    var facts: String {
        [trigger.map { $0 == "manual" ? "Manual" : "Automatic" },
         preTokens.flatMap { $0 == 0 ? nil : "\(Int((Double($0) / 1000).rounded()))k tokens before" }]
            .compactMap(\.self).joined(separator: " · ")
    }
}

/// A harness-injected notification, parsed (rows.ts `HarnessNote`).
struct HarnessNote {
    let title: String
    let status: String
    let body: String
}

enum Voice { case you, says, acts, note, none }

/// Who has the floor, row by row (rows.ts `Voices`).
struct Voices {
    enum Speaker { case you, agent }
    var speaker: Speaker?
    var headed = false

    /// Advance past a row of `voice`; true when it continues its speaker's group.
    mutating func advance(_ voice: Voice) -> Bool {
        switch voice {
        case .you:
            let grouped = speaker == .you
            speaker = .you; headed = true
            return grouped
        case .says:
            let grouped = speaker == .agent && headed
            speaker = .agent; headed = true
            return grouped
        case .acts:
            if speaker != .agent { speaker = .agent; headed = false }
            return false
        case .note:
            speaker = nil; headed = false
            return false
        case .none:
            return false
        }
    }
}

enum Fold {
    static let askUserQuestion = "AskUserQuestion"

    /// rows.ts `isHarnessNote`: harness plumbing wearing the reader's role.
    static func isHarnessNote(_ block: Block) -> Bool {
        isHarnessNote(type: block.type, content: block.content)
    }

    static func isHarnessNote(type: String, content: String) -> Bool {
        guard type == "user" || type == "ui.system_note" else { return false }
        let head = String(content.drop { $0.isWhitespace })
        if head.hasPrefix("[SYSTEM NOTIFICATION") || head.hasPrefix("<task-notification>") { return true }
        return isReminder(content.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private static func isReminder(_ text: String) -> Bool {
        text.hasPrefix("<system-reminder>") && text.hasSuffix("</system-reminder>")
    }

    private static func inner(_ tag: String, _ text: String) -> String? {
        guard let open = text.range(of: "<\(tag)>"),
              let close = text.range(of: "</\(tag)>", range: open.upperBound ..< text.endIndex) else { return nil }
        return String(text[open.upperBound ..< close.lowerBound])
    }

    /// rows.ts `parseHarnessNote`: never empty, never throws.
    static func parseHarnessNote(_ text: String) -> HarnessNote {
        let whole = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if isReminder(whole) {
            return HarnessNote(title: "System reminder", status: "",
                               body: (inner("system-reminder", whole) ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
        }
        let title = inner("summary", text)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let body = (inner("result", text) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if title.isEmpty, body.isEmpty { return HarnessNote(title: "Harness notification", status: "", body: whole) }
        return HarnessNote(title: title.isEmpty ? "Harness notification" : title,
                           status: inner("status", text)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "", body: body)
    }

    static func voice(of block: Block) -> Voice {
        if isHarnessNote(block) { return .acts }
        switch block.type {
        case "user": return .you
        case "assistant": return block.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .none : .says
        case "thinking": return block.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .none : .acts
        case "result.success": return .none
        case "system.task": return .acts
        default: return .note
        }
    }

    static func voice(of row: Row) -> Voice {
        switch row {
        case let .single(_, block, _), let .queued(_, block, _): voice(of: block)
        case .compaction: .note
        default: .acts
        }
    }

    static func isTool(_ block: Block) -> Bool { block.type == "tool.use" || block.type == "tool.handoff" }
    static func isQuestion(_ block: Block) -> Bool { isTool(block) && block.toolName == askUserQuestion }
    static func isDelegate(_ block: Block) -> Bool {
        let kind = block.string("handoffKind")
        return block.type == "tool.handoff" && (kind == "delegate" || kind == "start")
    }

    static func isRun(_ block: Block) -> Bool {
        guard isTool(block), let name = block.toolName else { return false }
        return name == "run_workflow" || name.hasSuffix("_run_workflow")
    }

    private static let runId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

    /// rows.ts `startedRunOf`: the run a `run_workflow` call's result names.
    static func startedRun(_ block: Block) -> String? {
        guard let result = block.meta["toolResult"] else { return nil }
        let text = (result as? String) ?? (try? JSONSerialization.data(withJSONObject: result)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
        guard let key = text.firstMatch(of: /runId[^0-9a-f]{0,6}/) else { return nil }
        return text[key.range.upperBound...].firstMatch(of: runId).map { String($0.output) }
    }

    private static func noticeRun(_ block: Block) -> String? {
        guard block.type == "user.peer", block.meta["workflowEvent"] != nil else { return nil }
        return block.content.firstMatch(of: runId).map { String($0.output) }
    }

    /// The summary a compaction wrote (`COMPACT_SUMMARY_KIND`): its brief.
    static func isCompactSummary(_ block: Block) -> Bool {
        block.type == "ui.system_note" && block.string("noteKind") == "Session continued"
    }

    /// rows.ts `compactionAt`: the compaction that begins at `blocks[i]` and
    /// how many blocks it is — a boundary with the summary right after it, a
    /// boundary whose summary has not arrived, or a summary read back alone.
    static func compaction(_ blocks: [Block], at i: Int) -> (row: Row, span: Int)? {
        let boundary = blocks[i].type == "system.compact_boundary" ? blocks[i] : nil
        let summary = boundary == nil ? blocks[i] : (i + 1 < blocks.count ? blocks[i + 1] : nil)
        let brief = summary.flatMap { isCompactSummary($0) ? $0 : nil }
        guard let first = boundary ?? brief else { return nil }
        let key = "c:\(first.id)"
        let tokens = (boundary?.meta["preTokens"] as? NSNumber)?.intValue
        // A summary stored with no words in it (a compaction cut short) is no brief: nothing to open.
        let words = brief.flatMap { $0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0.content }
        return (.compaction(key: key, compaction: Compaction(key: key, brief: words, preTokens: tokens,
                                                              trigger: boundary?.string("trigger"))),
                boundary != nil && brief != nil ? 2 : 1)
    }

    enum Receipt { case fold, anchor(String) }

    /// rows.ts `receiptsOf`: how each workflow notice is told.
    static func receipts(_ blocks: [Block]) -> (Block, Int) -> Receipt? {
        var byCall = Set<String>()
        var names = Set<String>()
        var first: [String: Int] = [:]
        for (i, block) in blocks.enumerated() {
            if let notice = noticeRun(block), first[notice] == nil { first[notice] = i }
            guard isRun(block) else { continue }
            if let run = startedRun(block) { byCall.insert(run) }
            if let name = block.toolInput["name"] as? String { names.insert(name.lowercased()) }
        }
        if first.isEmpty, names.isEmpty { return { _, _ in nil } }
        return { block, i in
            guard block.type == "user.peer", block.meta["workflowEvent"] != nil else { return nil }
            guard let run = noticeRun(block) else {
                return names.contains((block.string("peerName") ?? "").lowercased()) ? .fold : nil
            }
            if byCall.contains(run) || first[run] != i { return .fold }
            return .anchor(run)
        }
    }

    /// rows.ts `foldRange`, from the top, voices marked.
    static func rows(_ blocks: [Block], branches: [String: Branch], voices: inout Voices) -> [Row] {
        var rows: [Row] = []
        let receiptAt = receipts(blocks)
        func branchOf(_ block: Block) -> Branch? { block.toolId.flatMap { branches[$0] } }
        var i = 0
        while i < blocks.count {
            let block = blocks[i]
            let receipt = receiptAt(block, i)
            if case .fold = receipt { i += 1; continue }
            if let compaction = compaction(blocks, at: i) { rows.append(compaction.row); i += compaction.span; continue }
            if case let .anchor(run) = receipt {
                rows.append(.run(key: "r:\(block.id)", block: block, runId: run)); i += 1; continue
            }
            if isHarnessNote(block) {
                rows.append(.harness(key: "hn:\(block.id)", note: parseHarnessNote(block.content))); i += 1; continue
            }
            if isTool(block), let branch = branchOf(block) {
                rows.append(.subagent(key: block.id, branch: branch, spawn: block)); i += 1; continue
            }
            if isQuestion(block) { rows.append(.question(key: "q:\(block.id)", block: block)); i += 1; continue }
            if isDelegate(block) { rows.append(.delegate(key: "d:\(block.id)", block: block)); i += 1; continue }
            if isRun(block) { rows.append(.run(key: "r:\(block.id)", block: block, runId: nil)); i += 1; continue }
            if isTool(block) {
                var run: [Block] = []
                while i < blocks.count, isTool(blocks[i]), !isQuestion(blocks[i]), !isDelegate(blocks[i]),
                      !isRun(blocks[i]), branchOf(blocks[i]) == nil {
                    run.append(blocks[i]); i += 1
                }
                rows.append(.tools(key: "tools:\(run[0].id)", blocks: run))
                continue
            }
            rows.append(.single(key: block.id, block: block, grouped: false))
            i += 1
        }
        for (at, row) in rows.enumerated() {
            let grouped = voices.advance(voice(of: row))
            if case let .single(key, block, _) = row { rows[at] = .single(key: key, block: block, grouped: grouped) }
        }
        return rows
    }

    /// rows.ts `wellRuns`: the reader's rows whose well carries on into the next.
    static func wellRuns(_ rows: [Row]) -> Set<String> {
        var runs = Set<String>()
        var above: String?
        for row in rows {
            let v = voice(of: row)
            if case .none = v { continue }
            var you = false
            var grouped = false
            if case .you = v {
                switch row {
                case let .single(_, _, g), let .queued(_, _, g): you = true; grouped = g
                default: break
                }
            }
            if you, grouped, let above { runs.insert(above) }
            above = you ? row.key : nil
        }
        return runs
    }
}
