import CawCoAPI
import CawCoCore
import Foundation

/// One generation of a transcript's settled rows, prepared off the main
/// thread (TranscriptPrep) and applied by the main thread whole: the hub's
/// blocks as the renderers read them, folded into rows, built into the items
/// the list draws with their Markdown already rendered. Everything the list,
/// its data source and its indices read in a commit comes from one of these.
nonisolated struct Prepared: Sendable {
    /// The transcript's block and history revisions this was prepared from.
    let revision: Int
    let history: Int
    let blocks: [Block]
    let branches: [String: Branch]
    let queued: [Block]
    /// How many rows the blocks folded into.
    let rowCount: Int
    /// The settled rows' items, newest last.
    let items: [Item]
    /// Whether the last settled row is a rail row (the tail asks).
    let rail: Bool
    /// The items that read the fleet (delegates, runs, reports), by index.
    let fleet: [Int]
    /// Who had the floor after the last settled row (the tail continues it).
    let voices: Voices
    /// Whether any row is a compaction (Caw's mark is read ahead of it).
    let compacts: Bool
    /// The live keys its items were built under.
    let keys: [String: String]
    /// Its settled items are the last generation's, row for row (id, print,
    /// margin, height): a new revision of the hub's (a streamed reply's own
    /// blocks moving) that changed none of them. The list keeps them as it
    /// holds them and looks at its tail alone (TranscriptView `adopt`).
    let unchanged: Bool
    /// How many of its settled items, from the first, are the last
    /// generation's row for row: the list looks only at the rest (`commit`).
    let stable: Int
}

/// Prepares a transcript's rows off the main thread: reads each block once,
/// folds, builds and renders, and keeps what it read for the next revision.
/// One per transcript view; one preparation at a time.
actor TranscriptPrep {
    /// What a preparation reads: the hub's transcript as it stands, and the
    /// keys the view gave streamed answers that landed (rows.ts `keepLive`).
    struct Input: Sendable {
        let revision: Int
        let history: Int
        let blocks: [Components.Schemas.TranscriptBlock]
        let branches: [Components.Schemas.TranscriptPageBranch]
        let queued: [Components.Schemas.TranscriptBlock]
        /// This device's sends the hub has not taken, drawn after `queued`.
        let local: [LocalSend]
        /// What each running subagent is streaming, by its spawning call's id.
        let streams: [String: String]
        let agentName: String
        let keys: [String: String]
        /// The transcript has a voice (TranscriptVoice), and what its replies carry.
        var voiced = false
        var extras: [String: ThreadExtras] = [:]
        var voiceRevision = 0
        /// The width the list's rows stand at, and its speaker line's height
        /// (RowMetrics): with both, each assistant block's exact height is
        /// worked out here (PieceHeight).
        var width: Double?
        var speaker: Double?
    }

    /// Each block as last read, with the hub's value it was read from.
    private var read: [String: (source: Components.Schemas.TranscriptBlock, block: Block)] = [:]
    private let cache = BlockCache()
    private let measure = TextMeasure()
    /// Each assistant block's height by its width and print, kept while a row is drawn from it.
    private var heights: [String: Double?] = [:]
    /// The settled items the last preparation made.
    private var last: [Item] = []

    /// How many of `items`, from the first, are `last`'s row for row, in what a row draws and where it stands.
    private func stablePrefix(_ items: [Item]) -> Int {
        let common = min(items.count, last.count)
        var i = 0
        while i < common {
            let a = items[i], b = last[i]
            guard a.id == b.id, a.top == b.top, a.height == b.height, a.heightWidth == b.heightWidth, a.oneLine == b.oneLine,
                  a.print == b.print else { break }
            i += 1
        }
        return i
    }

    /// Every render is let go (a type size changed): read and drawn again.
    func reset() {
        read = [:]
        heights = [:]
        last = []
        cache.clear()
    }

    /// The items with their exact heights where they can be worked out
    /// here, and each tool call marked when its row is one line until opened.
    private func measured(_ items: [Item], width: Double?, speaker: Double?) -> [Item] {
        var kept: [String: Double?] = [:]
        defer { heights = kept }
        return items.map { item in
            var item = item
            switch item.kind {
            case let .piece(piece):
                guard let width, let speaker else { return item }
                let key = "\(width)|\(item.print)"
                let height = heights[key] ?? kept[key] ?? PieceHeight.of(piece, width: width, speaker: speaker, measure: measure)
                kept[key] = height
                item.height = height
                item.heightWidth = width
            case let .tool(block):
                let renderer = ToolDescriptor.describe(block.toolName, input: block.toolInput, result: block.toolResult,
                                                       status: block.toolStatus, patch: block.string("toolDiff")).renderer
                item.oneLine = renderer != .preview && renderer != .image
            default:
                break
            }
            return item
        }
    }

    func prepare(_ input: Input) -> Prepared {
        // A block is read once: a revision reads only the blocks it brought
        // or changed, never the whole history again.
        var kept: [String: (source: Components.Schemas.TranscriptBlock, block: Block)] = [:]
        kept.reserveCapacity(read.count + 8)
        func take(_ sources: [Components.Schemas.TranscriptBlock]) -> [Block] {
            sources.compactMap { source in
                if let held = read[source.id], held.source == source {
                    kept[source.id] = held
                    return held.block
                }
                guard let block = Block(source) else { return nil }
                kept[source.id] = (source, block)
                return block
            }
        }
        let blocks = take(input.blocks)
        var branches: [String: Branch] = [:]
        for page in input.branches {
            let inner = take(page.value2.blocks)
            let streaming = input.streams[page.value1.toolUseId] ?? ""
            if let branch = Branch(page, blocks: inner, streaming: streaming) { branches[branch.toolUseId] = branch }
        }
        let queued = take(input.queued) + input.local.map(Block.init)
        read = kept

        // The rows the reader sees: settled first (rows.ts `drawnOf` — an
        // unanswered question is the composer's in every mode).
        let drawn = blocks.filter { block in
            !(Fold.isQuestion(block) && block.toolStatus == "pending") && block.type != "send.ref" && block.type != "system.init"
        }
        var voices = Voices()
        let rows = Fold.rows(drawn, branches: branches, voices: &voices)
        var builder = Builder(agentName: input.agentName, cache: cache)
        builder.keys = input.keys
        builder.voiced = input.voiced
        builder.extras = input.extras
        builder.voiceRevision = input.voiceRevision
        let (built, rail) = builder.items(rows)
        let items = measured(built, width: input.width, speaker: input.speaker)
        let stable = stablePrefix(items)
        let unchanged = stable == items.count && items.count == last.count
        last = items
        var fleet: [Int] = []
        var compacts = false
        for (i, item) in items.enumerated() {
            switch item.kind {
            case .delegate, .run, .peer: fleet.append(i)
            case .compaction: compacts = true
            // The reader's own words are rendered here, so their row reads them.
            case let .user(turn): _ = MarkdownCache.shared.blocks(turn.block.content, style: .well)
            default: break
            }
        }
        // The Markdown no row drew from is let go: turns that changed, history compacted away.
        cache.sweep()
        return Prepared(revision: input.revision, history: input.history, blocks: blocks, branches: branches, queued: queued,
                        rowCount: rows.count, items: items, rail: rail, fleet: fleet, voices: voices, compacts: compacts,
                        keys: input.keys, unchanged: unchanged, stable: stable)
    }
}
