import CawCoDesign
import CawCoMascot
import Foundation

/// Rows into the items the list draws (Transcript.svelte's row dispatch):
/// an assistant turn split into its blocks, a run of calls into its calls,
/// each item with its margin above it — a rail row abutting the rail row
/// above it (`continued`), the reader's later messages abutting their well.
@MainActor
struct Builder {
    var agentName: String
    /// Rendered blocks by source, kept across builds: a settled block is parsed once.
    var cache: BlockCache
    /// The answers this view streamed, by block id: the live row's key each keeps,
    /// so a streamed answer settles into the cells already drawing it (rows.ts `keepLive`).
    var keys: [String: String] = [:]

    /// rows' kinds that never paint (Transcript `unpainted`).
    static func unpainted(_ row: Row) -> Bool {
        guard case let .single(_, block, _) = row else { return false }
        if block.type == "result.success" { return true }
        return (block.type == "assistant" || block.type == "thinking") && block.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static let noRail: Set<String> = ["user", "assistant", "user.peer", "user.rule", "user.delegate_ask",
                                      "ui.command_output", "ui.error", "ui.session_error", "result.error"]

    /// Transcript `railLed`: a row whose line is the rail's.
    static func railLed(_ row: Row) -> Bool {
        switch row {
        case let .single(_, block, _): !noRail.contains(block.type)
        case .tools, .harness, .subagent, .delegate, .run: true
        case .question, .queued, .compaction: false
        }
    }

    /// The items for `rows`. `railAbove` says whether the row before them on
    /// screen is a rail row (the live tail asks after the settled rows).
    func items(_ rows: [Row], railAbove: Bool = false) -> (items: [Item], railBelow: Bool) {
        let runs = Fold.wellRuns(rows)
        var items: [Item] = []
        var rail = railAbove
        for row in rows {
            if Self.unpainted(row) { continue }
            let continues = Self.railLed(row) && rail
            let gap = continues ? 0 : Space.space4
            rail = Self.railLed(row)
            switch row {
            case let .single(key, block, grouped), let .queued(key, block, grouped):
                items += single(key: key, block: block, grouped: grouped, runsOn: runs.contains(key), gap: gap)
            case let .tools(_, blocks):
                for (i, block) in blocks.enumerated() {
                    items.append(Item(id: "call:\(block.id)", top: i == 0 ? gap : 0, kind: .tool(block), print: Self.print(block)))
                }
            case let .question(key, block):
                items.append(Item(id: key, top: Space.space4, kind: .question(block), print: Self.print(block)))
            case let .subagent(key, branch, spawn):
                items.append(Item(id: key, top: gap, kind: .subagent(branch, spawn: spawn), print: Self.print(spawn) + String(decoding: branch.signature, as: UTF8.self)))
            case let .delegate(key, block):
                items.append(Item(id: key, top: gap, kind: .delegate(block), print: Self.print(block)))
            case let .run(key, block, runId):
                items.append(Item(id: key, top: gap, kind: .run(block, runId: runId), print: Self.print(block) + (runId ?? "")))
            case let .harness(key, note):
                items.append(Item(id: key, top: gap, kind: .harness(note, key: key), print: note.title + note.status + note.body))
            case let .compaction(key, compaction):
                // A read holds a compaction: Caw's file is read now, while his row is
                // still being laid out (compaction-mark.ts `warmCompactionMark`).
                if !Self.warmed { Self.warmed = true; CawMark.warm(.compacted) }
                items.append(Item(id: key, top: gap, kind: .compaction(compaction),
                                  print: "\(compaction.brief ?? "\u{0}")|\(compaction.facts)"))
            }
        }
        return (items, rail)
    }

    private static var warmed = false

    static func print(_ block: Block) -> String { String(decoding: block.signature, as: UTF8.self) }

    private func single(key: String, block: Block, grouped: Bool, runsOn: Bool, gap: Double) -> [Item] {
        switch block.type {
        case "user":
            return [Item(id: key, top: grouped ? 0 : Space.space4, kind: .user(.init(block: block, grouped: grouped, runsOn: runsOn)),
                         print: Self.print(block) + "\(grouped)\(runsOn)")]
        case "assistant":
            return pieces(id: keys[key] ?? key, source: block.content, grouped: grouped, date: block.date)
        case "thinking":
            return [Item(id: key, top: gap, kind: .thinking(.init(key: "think:\(block.id)", text: block.content, live: false, folding: false)),
                         print: block.content)]
        case "user.peer", "user.rule", "user.delegate_ask":
            return [Item(id: key, top: Space.space4, kind: .peer(block), print: Self.print(block))]
        default:
            return [Item(id: key, top: gap, kind: .system(block), print: Self.print(block))]
        }
    }

    /// One piece of a turn's source: a top-level block, or a chunk of a long
    /// fence that the next piece continues.
    struct Source {
        let text: String
        var joinsAbove = false
        var joinsBelow = false
    }

    /// An assistant turn's blocks, each an item: the first under the speaker
    /// line (or, grouped, with its clock floated), the rest a block gap apart.
    /// The last of `sources` is the streaming tail when `streaming`.
    func pieces(id: String, sources: [Source], grouped: Bool, date: Date?, streaming: Bool) -> [Item] {
        var out: [Item] = []
        var above: MarkdownBlock?
        /// Whether an element stands above yet: the turn's first element starts
        /// flush under any raw HTML before it (`:first-child` looks past bare text).
        var element = false
        for (i, piece) in sources.enumerated() {
            let tail = streaming && i == sources.count - 1
            let blocks = tail ? MarkdownRender.blocks(PartialSyntax.hide(piece.text)) : cache.blocks(piece.text)
            guard let first = blocks.first else { continue }
            let header = out.isEmpty && !grouped ? Item.Header(name: agentName, clock: streaming ? nil : Item.clock(date), note: nil, you: false) : nil
            let float = out.isEmpty && grouped ? (streaming ? nil : Item.clock(date)) : nil
            var top = out.isEmpty ? (grouped ? Space.space2 : Space.space4) : above.map { MarkdownRender.gap(after: $0, before: first) } ?? Space.space3
            if piece.joinsAbove, !out.isEmpty { top = 0 }
            if !out.isEmpty, !element, !first.bare { top = above?.bottom ?? 0 }
            if blocks.contains(where: { !$0.bare }) { element = true }
            out.append(Item(id: "\(id):\(i)", top: top,
                            kind: .piece(.init(blocks: blocks, header: header, float: float, streaming: tail,
                                               joinsAbove: piece.joinsAbove, joinsBelow: piece.joinsBelow)),
                            print: piece.text + (header?.clock ?? "") + (float ?? "") + "\(tail)\(grouped)\(piece.joinsAbove)\(piece.joinsBelow)" + agentName))
            above = blocks.last
        }
        return out
    }

    /// A settled turn: one piece per top-level block.
    func pieces(id: String, source: String, grouped: Bool, date: Date?) -> [Item] {
        pieces(id: id, sources: cache.pieces(source).map { Source(text: $0) }, grouped: grouped, date: date, streaming: false)
    }
}

/// Settled Markdown, parsed once per source.
@MainActor
final class BlockCache {
    private var held: [String: [MarkdownBlock]] = [:]
    private var used = Set<String>()

    func blocks(_ source: String) -> [MarkdownBlock] {
        used.insert(source)
        if let blocks = held[source] { return blocks }
        let blocks = MarkdownRender.blocks(source)
        held[source] = blocks
        return blocks
    }

    /// A settled turn's top-level blocks, split once per source.
    private var split: [String: [String]] = [:]

    func pieces(_ source: String) -> [String] {
        used.insert(source)
        if let pieces = split[source] { return pieces }
        let pieces = MarkdownRender.topLevel(source)
        split[source] = pieces
        return pieces
    }

    /// Drops what the last build did not ask for (and everything, on a theme or size change).
    func sweep() {
        held = held.filter { used.contains($0.key) }
        split = split.filter { used.contains($0.key) }
        used = []
    }

    func clear() { held = [:]; split = [:]; used = [] }
}
